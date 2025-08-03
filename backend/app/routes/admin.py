from flask import Blueprint, request, jsonify, session
from flask_mail import Message
from app import db
from app.models.superadmin import Superadmin
from app.models.recruiter import Recruiter
from app.models.user import User, PasswordResetToken
from app.models.job import JobDescription
from app.models.subscription_plan import SubscriptionPlan
from app.models.assessment_attempt import AssessmentAttempt
from app.models.assessment_state import AssessmentState
from app.models.candidate import Candidate
from app.models.sales import Sales
from werkzeug.security import check_password_hash
from werkzeug.utils import secure_filename
import os
from datetime import datetime, timedelta
from app import db, mail, limiter
from flask_mail import Message
from datetime import date
from calendar import monthrange
from app.utils.gcs_upload import upload_to_gcs, delete_from_gcs
import secrets
import pyotp  # Import pyotp

admin_api_bp = Blueprint('admin_api', __name__, url_prefix='/api/superadmin')

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'static', 'uploads'))
LOGOS_DIR = os.path.join(PROJECT_ROOT, 'logos')

os.makedirs(LOGOS_DIR, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@admin_api_bp.route('/login', methods=['POST'])
def superadmin_login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    superadmin = Superadmin.query.filter_by(email=email).first()
    if not superadmin or not superadmin.check_password(password):
        return jsonify({'error': 'Invalid credentials'}), 401

    if superadmin.mfa_enabled:
        # MFA is already enabled, prompt for code
        return jsonify({'mfa_required': True}), 200
    else:
        # New user or MFA not set up, generate a secret and QR code URI
        if not superadmin.otp_secret:
            superadmin.otp_secret = pyotp.random_base32()
            db.session.commit()
            
        provisioning_uri = pyotp.totp.TOTP(superadmin.otp_secret).provisioning_uri(
            name=superadmin.email, issuer_name="QuizzerApp"
        )
        return jsonify({
            'mfa_setup_required': True,
            'provisioning_uri': provisioning_uri
        }), 200

@admin_api_bp.route('/login/verify', methods=['POST'])
def verify_superadmin_2fa():
    data = request.get_json()
    email = data.get('email')
    otp_code = data.get('otp')

    if not email or not otp_code:
        return jsonify({'error': 'Email and OTP are required'}), 400

    superadmin = Superadmin.query.filter_by(email=email).first()
    if not superadmin or not superadmin.otp_secret:
        return jsonify({'error': 'Invalid request or user not found'}), 401
    
    totp = pyotp.TOTP(superadmin.otp_secret)
    if not totp.verify(otp_code):
        return jsonify({'error': 'Invalid OTP code'}), 401

    # OTP is valid, complete the login
    if not superadmin.mfa_enabled:
        superadmin.mfa_enabled = True
        db.session.commit()

    session['user_id'] = superadmin.id
    session['role'] = 'superadmin'
    return jsonify({'message': 'Login successful', 'role': 'superadmin'}), 200


@admin_api_bp.route('/clients', methods=['GET'])
def get_clients():
    if 'user_id' not in session or session.get('role') != 'superadmin':
        return jsonify({'error': 'Unauthorized'}), 401
    recruiters = Recruiter.query.join(User).outerjoin(SubscriptionPlan).with_entities(
        Recruiter.recruiter_id.label('id'),
        User.name.label('name'),
        Recruiter.company,
        User.email,
        Recruiter.phone,
        Recruiter.status,
        SubscriptionPlan.name.label('plan_name'),
        Recruiter.logo,
        User.is_active,
        User.last_login.label('last_activity')
    ).all()
    clients = [
        {
            'id': recruiter.id,
            'name': recruiter.name,
            'company': recruiter.company,
            'email': recruiter.email,
            'phone': recruiter.phone,
            'status': recruiter.status,
            'plan_name': recruiter.plan_name or 'None',
            'logo': recruiter.logo,
            'is_active': recruiter.is_active,
            'last_activity': recruiter.last_activity.isoformat() if recruiter.last_activity else 'N/A'
        } for recruiter in recruiters
    ]
    return jsonify(clients)

def update_monthly_earnings():
    today = date.today()
    start_of_month = today.replace(day=1)
    end_day = monthrange(today.year, today.month)[1]
    end_of_month = today.replace(day=end_day)
    days_in_month = end_day

    total_earnings = 0
    clients = Recruiter.query.filter_by(status='Active').all()

    for client in clients:
        if not client.subscription_plan or not client.subscription_start_date or not client.subscription_end_date:
            continue
        sub_start = max(client.subscription_start_date.date(), start_of_month)
        sub_end = min(client.subscription_end_date.date(), end_of_month)
        if sub_start <= sub_end:
            used_days = (sub_end - sub_start).days + 1
            price = client.subscription_plan.price or 0
            prorated = (used_days / days_in_month) * price
            total_earnings += prorated

    sales_row = Sales.query.filter_by(month=start_of_month).first()
    if not sales_row:
        sales_row = Sales(month=start_of_month, earnings=0, expenses=0)
        db.session.add(sales_row)

    sales_row.earnings = round(total_earnings, 2)
    db.session.commit()

@admin_api_bp.route('/clients/<int:id>', methods=['PUT'])
def update_client(id):
    if 'user_id' not in session or session.get('role') != 'superadmin':
        return jsonify({'error': 'Unauthorized'}), 401

    recruiter = Recruiter.query.get_or_404(id)
    if not recruiter:
        return jsonify({'error': 'Client not found'}), 404

    # Update from form data
    recruiter.company = request.form.get('company', recruiter.company)
    recruiter.phone = request.form.get('phone', recruiter.phone)
    recruiter.status = request.form.get('status', recruiter.status)
    recruiter.subscription_start_date = request.form.get('subscription_start_date') or recruiter.subscription_start_date
    recruiter.subscription_end_date = request.form.get('subscription_end_date') or recruiter.subscription_end_date

    # Handle subscription plan update
    subscription_plan_id = request.form.get('subscription_plan_id')
    if subscription_plan_id:
        plan = SubscriptionPlan.query.get(subscription_plan_id)
        if plan:
            recruiter.subscription_plan_id = plan.id
            recruiter.subscription_start_date = datetime.utcnow() if not recruiter.subscription_start_date else recruiter.subscription_start_date
            recruiter.subscription_end_date = recruiter.subscription_start_date + timedelta(days=plan.expiry_days) if not recruiter.subscription_end_date else recruiter.subscription_end_date
            recruiter.current_candidate_count = 0
            recruiter.current_assessment_count = 0

    # Handle logo upload
    from flask import current_app
    if 'logo' in request.files:
        file = request.files['logo']
        if file and allowed_file(file.filename):
            delete_from_gcs(recruiter.logo)
            filename = secure_filename(file.filename)
            unique_filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"
            file_path = f'logos/{unique_filename}'
            recruiter.logo = file_path
            upload_to_gcs(file, file_path, 'image/jpeg')

    db.session.commit()
    update_monthly_earnings()

    # Fetch updated subscription data
    db.session.refresh(recruiter)
    user = User.query.get(recruiter.user_id)
    plan = recruiter.subscription_plan if recruiter.subscription_plan else None
    job_ids = [job.job_id for job in JobDescription.query.filter_by(recruiter_id=id).all()]
    assessment_attempts = AssessmentAttempt.query.filter(AssessmentAttempt.job_id.in_(job_ids)).count() if job_ids else 0
    candidates = Candidate.query.join(AssessmentAttempt).filter(AssessmentAttempt.job_id.in_(job_ids)).distinct(Candidate.candidate_id).count() if job_ids else 0

    updated_data = {
        'id': recruiter.recruiter_id,
        'name': user.name if user else 'Unknown',
        'company': recruiter.company,
        'plan_name': plan.name if plan else 'None',
        'candidate_limit': plan.candidate_limit if plan else 0,
        'current_candidate_count': candidates,
        'assessment_limit': plan.assessment_limit if plan else 0,
        'current_assessment_count': assessment_attempts,
        'skill_limit': plan.skill_limit if plan else 0,
        'price': plan.price if plan else 0,
        'expiry_days': plan.expiry_days if plan else 0,
        'subscription_start_date': recruiter.subscription_start_date.isoformat() if recruiter.subscription_start_date else None,
        'subscription_end_date': recruiter.subscription_end_date.isoformat() if recruiter.subscription_end_date else None,
        'basic_reports': plan.basic_reports if plan else False,
        'ai_reports': plan.ai_reports if plan else False,
        'logo': recruiter.logo,
        'phone': recruiter.phone,
        'status': recruiter.status
    }

    return jsonify({'message': 'Client updated successfully', 'id': id, **updated_data})

@admin_api_bp.route('/clients/<int:id>', methods=['DELETE'])
def delete_client(id):
    if 'user_id' not in session or session.get('role') != 'superadmin':
        return jsonify({'error': 'Unauthorized'}), 401

    recruiter = Recruiter.query.get_or_404(id)
    user = User.query.get(recruiter.user_id)
    if not recruiter:
        return jsonify({'error': 'Client not found'}), 404

    JobDescription.query.filter_by(recruiter_id=id).delete()
    db.session.delete(recruiter)
    db.session.delete(user)
    db.session.commit()
    return jsonify({'message': 'Client deleted successfully', 'id': id})

@admin_api_bp.route('/clients', methods=['POST'])
def create_client():
    if 'user_id' not in session or session.get('role') != 'superadmin':
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.form
    required_fields = ['name', 'email', 'company', 'phone']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400

    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already exists'}), 400

    # Generate a default password
    default_password = 'admin1234'  # Secure random 12-character password
    user = User(name=data['name'], email=data['email'], role='recruiter', is_active=True)
    user.set_password(default_password)
    db.session.add(user)
    db.session.flush()

    recruiter = Recruiter(
        user_id=user.id,
        company=data['company'],
        phone=data['phone'],
        status=data.get('status', 'Active')
    )

    if 'logo' in request.files:
        file = request.files['logo']
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            unique_filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"
            file_path = f'logos/{unique_filename}'
            recruiter.logo = file_path
            upload_to_gcs(file, file_path, 'image/jpeg')


    # Assign or create default "Basic" subscription plan
    basic_plan = SubscriptionPlan.query.filter_by(name='Free').first()

    recruiter.subscription_plan_id = basic_plan.id
    recruiter.subscription_start_date = datetime.utcnow()
    recruiter.subscription_end_date = recruiter.subscription_start_date + timedelta(days=basic_plan.expiry_days)
    recruiter.current_candidate_count = 0
    recruiter.current_assessment_count = 0

    # Generate password reset token
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=24)
    reset_token = PasswordResetToken(
        user_id=user.id,
        token=token,
        created_at=datetime.utcnow(),
        expires_at=expires_at
    )
    db.session.add(reset_token)

    # Send password reset email
    reset_url = f"{os.getenv('CLIENT_BASE_URL')}/reset-password?token={token}"
    msg = Message(
        subject="Welcome to Quizzer - Set Your Password",
        sender=os.getenv('MAIL_DEFAULT_SENDER'),
        recipients=[data['email']],
        body=f"""
        Hello {data['name']},

        Your recruiter account has been created successfully. 
        Your are currently on the free trial plan you can upgrade it.

        Please set your password by clicking the link below:
        {reset_url}

        This link will expire in 24 hours. For security, you must set a new password to access your account.

        Best,
        Quizzer
        """
    )
    try:
        mail.send(msg)
        print(f"📧 Password reset link sent to {data['email']}")
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error sending password reset email: {e}")
        return jsonify({'error': 'Failed to send password reset email'}), 500

    db.session.add(recruiter)
    db.session.commit()

    return jsonify({
        'message': 'Client created successfully',
        'id': recruiter.recruiter_id,
        'logo': recruiter.logo,
        'default_password': default_password  # Include for debugging; remove in production
    }), 201
@admin_api_bp.route('/subscription-plans', methods=['GET'])
def get_subscription_plans():
    if 'user_id' not in session or session.get('role') != 'superadmin':
        return jsonify({'error': 'Unauthorized'}), 401
    plans = SubscriptionPlan.query.all()
    return jsonify([{
        'id': plan.id,
        'name': plan.name,
        'price': plan.price,
        'candidate_limit': plan.candidate_limit,
        'assessment_limit': plan.assessment_limit,
        'skill_limit': plan.skill_limit,
        'expiry_days': plan.expiry_days,
        'basic_reports': plan.basic_reports,
        'ai_reports': plan.ai_reports,
        'is_active': plan.is_active,
        'created_at': plan.created_at.isoformat(),
        'updated_at': plan.updated_at.isoformat()
    } for plan in plans])

@admin_api_bp.route('/subscription-plans', methods=['POST'])
def create_subscription_plan():
    if 'user_id' not in session or session.get('role') != 'superadmin':
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    required_fields = ['name', 'candidate_limit', 'assessment_limit', 'skill_limit', 'expiry_days']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400

    if SubscriptionPlan.query.filter_by(name=data['name']).first():
        return jsonify({'error': 'Plan name already exists'}), 400

    # Set price based on plan name
    price_map = {'Basic': 5000, 'Grand': 10000}  # Add more plans as needed
    default_price = price_map.get(data['name'], 0)

    plan = SubscriptionPlan(
        name=data['name'],
        price=default_price,
        candidate_limit=data['candidate_limit'],
        assessment_limit=data['assessment_limit'],
        skill_limit=data['skill_limit'],
        expiry_days=data['expiry_days'],
        basic_reports=data.get('basic_reports', True),
        ai_reports=data.get('ai_reports', False),
        is_active=data.get('is_active', True)
    )
    db.session.add(plan)
    db.session.commit()
    return jsonify({'message': 'Subscription plan created successfully', 'id': plan.id}), 201

@admin_api_bp.route('/subscription-plans/<int:id>', methods=['PUT'])
def update_subscription_plan(id):
    if 'user_id' not in session or session.get('role') != 'superadmin':
        return jsonify({'error': 'Unauthorized'}), 401
    plan = SubscriptionPlan.query.get_or_404(id)
    data = request.get_json()
    plan.name = data.get('name', plan.name)
    # Update price based on new name if changed
    price_map = {'Basic': 5000, 'Grand': 10000}  # Add more plans as needed
    new_price = price_map.get(data.get('name', plan.name), plan.price)
    plan.price = new_price
    plan.candidate_limit = data.get('candidate_limit', plan.candidate_limit)
    plan.assessment_limit = data.get('assessment_limit', plan.assessment_limit)
    plan.skill_limit = data.get('skill_limit', plan.skill_limit)
    plan.expiry_days = data.get('expiry_days', plan.expiry_days)
    plan.basic_reports = data.get('basic_reports', plan.basic_reports)
    plan.ai_reports = data.get('ai_reports', plan.ai_reports)
    plan.is_active = data.get('is_active', plan.is_active)
    db.session.commit()
    return jsonify({'message': 'Subscription plan updated successfully', 'id': id})

@admin_api_bp.route('/clients/<int:id>/subscription', methods=['GET'])
def get_client_subscription(id):
    if 'user_id' not in session or session.get('role') != 'superadmin':
        return jsonify({'error': 'Unauthorized'}), 401
    recruiter = Recruiter.query.get_or_404(id)
    if not recruiter:
        return jsonify({'error': 'Client not found'}), 404

    user = User.query.get(recruiter.user_id)
    plan = recruiter.subscription_plan if recruiter.subscription_plan else None
    job_ids = [job.job_id for job in JobDescription.query.filter_by(recruiter_id=id).all()]
    assessment_attempts = AssessmentAttempt.query.filter(AssessmentAttempt.job_id.in_(job_ids)).count() if job_ids else 0
    candidates = Candidate.query.join(AssessmentAttempt).filter(AssessmentAttempt.job_id.in_(job_ids)).distinct(Candidate.candidate_id).count() if job_ids else 0

    return jsonify({
        'id': recruiter.recruiter_id,
        'name': user.name if user else 'Unknown',
        'company': recruiter.company,
        'plan_name': plan.name if plan else 'None',
        'candidate_limit': plan.candidate_limit if plan else 0,
        'current_candidate_count': candidates,
        'assessment_limit': plan.assessment_limit if plan else 0,
        'current_assessment_count': assessment_attempts,
        'skill_limit': plan.skill_limit if plan else 0,
        'price': plan.price if plan else 0,
        'expiry_days': plan.expiry_days if plan else 0,
        'subscription_start_date': recruiter.subscription_start_date.isoformat() if recruiter.subscription_start_date else None,
        'subscription_end_date': recruiter.subscription_end_date.isoformat() if recruiter.subscription_end_date else None,
        'basic_reports': plan.basic_reports if plan else False,
        'ai_reports': plan.ai_reports if plan else False,
        'logo': recruiter.logo
    })

@admin_api_bp.route('/clients/<int:id>/subscription', methods=['PUT'])
def update_client_subscription(id):
    if 'user_id' not in session or session.get('role') != 'superadmin':
        return jsonify({'error': 'Unauthorized'}), 401
    recruiter = Recruiter.query.get_or_404(id)
    if not recruiter:
        return jsonify({'error': 'Client not found'}), 404

    data = request.get_json()
    plan_id = data.get('subscription_plan_id')
    if plan_id:
        plan = SubscriptionPlan.query.get_or_404(plan_id)
        recruiter.subscription_plan_id = plan.id
        recruiter.subscription_start_date = datetime.utcnow() if not data.get('subscription_start_date') else datetime.fromisoformat(data.get('subscription_start_date'))
        recruiter.subscription_end_date = recruiter.subscription_start_date + timedelta(days=plan.expiry_days) if not data.get('subscription_end_date') else datetime.fromisoformat(data.get('subscription_end_date'))
        recruiter.current_candidate_count = 0
        recruiter.current_assessment_count = 0
    db.session.commit()
    return jsonify({'message': 'Subscription updated successfully', 'id': id})

@admin_api_bp.route('/send-renewal-email/<int:id>', methods=['POST'])
def send_renewal_email(id):
    if 'user_id' not in session or session.get('role') != 'superadmin':
        return jsonify({'error': 'Unauthorized'}), 401

    recruiter = Recruiter.query.get_or_404(id)
    if not recruiter:
        return jsonify({'error': 'Client not found'}), 404

    user = User.query.get(recruiter.user_id)
    if not user or not user.email:
        return jsonify({'error': 'No email associated with this client'}), 400

    # Calculate days remaining
    subscription_end_date = recruiter.subscription_end_date
    if not subscription_end_date:
        return jsonify({'error': 'No subscription end date available'}), 400

    days_remaining = max(0, int((subscription_end_date - datetime.utcnow()).total_seconds() / (3600 * 24)))
    plan_name = recruiter.subscription_plan.name if recruiter.subscription_plan else 'Unknown'

    # Send renewal email
    msg = Message(
        subject="Subscription Renewal Reminder",
        sender=os.getenv('MAIL_DEFAULT_SENDER'),
        recipients=[user.email],
        body=f"Only {days_remaining} days left for your {plan_name} plan. Renew soon! Regards, LisenceToScript"
    )
    try:
        mail.send(msg)
        return jsonify({'message': 'Renewal email sent successfully'}), 200
    except Exception as e:
        return jsonify({'error': f'Failed to send renewal email: {str(e)}'}), 500

@admin_api_bp.route('/sales', methods=['GET'])
def get_sales():
    if 'user_id' not in session or session.get('role') != 'superadmin':
        return jsonify({'error': 'Unauthorized'}), 401
    sales = Sales.query.order_by(Sales.month).all()
    return jsonify([{'id': s.id, 'month': s.month.isoformat(), 'earnings': s.earnings, 'expenses': s.expenses} for s in sales])
