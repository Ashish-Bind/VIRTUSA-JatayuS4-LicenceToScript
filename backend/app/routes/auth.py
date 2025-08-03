from flask import Blueprint, request, jsonify, session
from app import db, mail, limiter
from app.models.user import User, PasswordResetToken
from app.models.candidate import Candidate
from app.models.recruiter import Recruiter
from app.models.login_log import LoginLog
from app.models.superadmin import Superadmin
from app.config import Config
from flask_mail import Message
from datetime import datetime, timedelta
from geopy.distance import geodesic

import os
import secrets
import requests

auth_bp = Blueprint('auth', __name__)

# Email verification helper
def verify_email(email, api_key=os.getenv('EMAILABLE_API_KEY')):
    url = f'https://api.emailable.com/v1/verify?email={email}&api_key={api_key}'
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        if data.get('state') == 'deliverable':
            return True, None
        return False, data.get('reason', 'Email is not deliverable.')
    except requests.RequestException as e:
        return False, f'Email verification failed: {str(e)}'

# Signup route
@auth_bp.route('/signup', methods=['POST'])
def signup():
    data = request.json

    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'User already exists'}), 400

    is_valid, reason = verify_email(data['email'])
    if not is_valid:
        return jsonify({'error': reason or 'Invalid email address.'}), 400

    role = data.get('role', 'candidate')

    user = User(
        name=data['name'],
        email=data['email'],
        role=role
    )
    user.set_password(data['password'])

    db.session.add(user)
    db.session.commit()

    # Add user to Candidate or Recruiter table
    if role == 'candidate':
        # Generate confirmation token
        token = secrets.token_urlsafe(32)
        confirmation_url = f'{os.getenv('CLIENT_BASE_URL')}/candidate/confirm?token={token}'
        confirmation_token = PasswordResetToken(
            user_id=user.id,
            token=token,
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(hours=24)
        )
        db.session.add(confirmation_token)
        db.session.commit()

        msg = Message(
            subject='Confirm Your Account',
            sender=os.getenv('MAIL_DEFAULT_SENDER'),
            recipients=[data['email']],
            body=f'Click this link to confirm your account: {confirmation_url}\nThis link expires in 24 hours.'
        )
        mail.send(msg)
        candidate = Candidate(
            user_id=user.id,
            name=user.name,
            email=user.email,
            years_of_experience=0.0
        )
        db.session.add(candidate)
    elif role == 'recruiter':
        recruiter = Recruiter(
            user_id=user.id,
            phone=data.get('phone', ''),
            company=data.get('company', ''),
            status='Pending'
        )
        db.session.add(recruiter)

    db.session.commit()
    return jsonify({'message': f'{role.capitalize()} signup successful'}), 200

# Login route
# auth.py
@auth_bp.route('/login', methods=['POST'])
@limiter.limit("10/minute")
def login():
    data = request.json
    user = User.query.filter_by(email=data['email']).first()

    if not user or not user.check_password(data['password']):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    if not user.is_active :
        return jsonify({'error': 'Please Confirm your email first'}), 400
    
    if PasswordResetToken.query.filter_by(user_id=user.id).first():
        return jsonify({'error': 'Please reset your password first'}), 400

    # Save user session
    session['user_id'] = user.id
    session['role'] = user.role

    # Save login log
    location = data.get('location', {})
    current_ip = request.remote_addr
    print(f"📡 Received location: {location}")
    print(f"📡 Current IP address: {current_ip}")

    try:
        login_log = LoginLog(
            user_id=user.id,
            ip_address=current_ip,
            city=location.get('city', ''),
            region=location.get('region', ''),
            country=location.get('country', ''),
            latitude=location.get('latitude'),
            longitude=location.get('longitude'),
            login_time=datetime.utcnow()
        )
        db.session.add(login_log)
        db.session.commit()
        print(f"✅ Login log saved for user_id={user.id}, ip={current_ip}, lat={location.get('latitude')}, lon={location.get('longitude')}")
    except Exception as e:
        db.session.rollback()
        print(f"❌ Error saving login log: {e}")
        # Continue with login even if log fails, but notify
        return jsonify({'error': 'Failed to save login log, but login proceeding'}), 500

    # Check last login
    enforce_otp_verification = False
    last_log = (
        LoginLog.query
        .filter(LoginLog.user_id == user.id)
        .order_by(LoginLog.login_time.desc())
        .offset(1)
        .first()
    )
    print(f"📖 Last login found: log_id={last_log.log_id if last_log else None}, IP={last_log.ip_address if last_log else None}, Lat={last_log.latitude if last_log else None}, Lon={last_log.longitude if last_log else None}")

    if user.role == 'candidate':
        candidate = Candidate.query.filter_by(user_id=user.id).first()
        if not candidate:
            return jsonify({'error': 'Candidate profile not found'}), 404
        if (
            last_log and
            last_log.latitude is not None and last_log.longitude is not None and
            location.get('latitude') is not None and location.get('longitude') is not None
        ):
            prev_coords = (last_log.latitude, last_log.longitude)
            current_coords = (location['latitude'], location['longitude'])
            try:
                distance_km = geodesic(prev_coords, current_coords).km
                print(f"📏 Distance from last login: {distance_km:.2f} km")
                if distance_km > 100:
                    enforce_otp_verification = True
                    candidate.requires_otp_verification = True
                    print("⚠️ Location changed significantly (>100km). Enforcing OTP verification for candidate.")
            except Exception as e:
                print(f"❌ Error calculating distance: {e}")
                enforce_otp_verification = True
                candidate.requires_otp_verification = True
        elif last_log and last_log.ip_address != current_ip:
            print(f"⚠️ IP changed: {last_log.ip_address} -> {current_ip}. Enforcing OTP verification for candidate.")
            enforce_otp_verification = True
            candidate.requires_otp_verification = True
        elif not last_log:
            print("⚠️ First login detected. Enforcing OTP verification for candidate.")
            enforce_otp_verification = True
            candidate.requires_otp_verification = True
        else:
            print("✅ No significant location/IP change detected for candidate.")
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"❌ Error updating candidate requires_otp_verification: {e}")
            return jsonify({'error': 'Failed to process login'}), 500
    elif user.role == 'recruiter':
        recruiter = Recruiter.query.filter_by(user_id=user.id).first()
        if not recruiter:
            return jsonify({'error': 'Recruiter profile not found'}), 404
        if (
            last_log and
            last_log.latitude is not None and last_log.longitude is not None and
            location.get('latitude') is not None and location.get('longitude') is not None
        ):
            prev_coords = (last_log.latitude, last_log.longitude)
            current_coords = (location['latitude'], location['longitude'])
            try:
                distance_km = geodesic(prev_coords, current_coords).km
                print(f"📏 Distance from last login: {distance_km:.2f} km")
                if distance_km > 500:
                    enforce_otp_verification = True
                    recruiter.requires_otp_verification = True
                    print("⚠️ Location changed significantly (>500km). Enforcing OTP verification for recruiter.")
            except Exception as e:
                print(f"❌ Error calculating distance: {e}")
                enforce_otp_verification = True
                recruiter.requires_otp_verification = True
        elif last_log and last_log.ip_address != current_ip:
            print(f"⚠️ IP changed: {last_log.ip_address} -> {current_ip}. Enforcing OTP verification for recruiter.")
            enforce_otp_verification = True
            recruiter.requires_otp_verification = True
        elif not last_log:
            print("⚠️ First login detected. Enforcing OTP verification for recruiter.")
            enforce_otp_verification = True
            recruiter.requires_otp_verification = True
        else:
            print("✅ No significant location/IP change detected for recruiter.")
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"❌ Error updating recruiter requires_otp_verification: {e}")
            return jsonify({'error': 'Failed to process login'}), 500

    # Save enforce flag in session for backward compatibility
    session['enforce_otp_verification'] = enforce_otp_verification

    # Include reason for OTP enforcement in response
    otp_reason = None
    if enforce_otp_verification:
        if not last_log:
            otp_reason = "First login detected"
        elif last_log and last_log.ip_address != current_ip:
            otp_reason = "New IP address detected"
        elif distance_km > 500 and user.role == 'recruiter':
            otp_reason = f"New login location detected (>500km from previous login)"
        elif distance_km > 100 and user.role == 'candidate':
            otp_reason = f"New login location detected (>100km from previous login)"

    return jsonify({
        'message': 'Login successful',
        'role': user.role,
        'enforce_otp_verification': enforce_otp_verification,
        'otp_reason': otp_reason
    }), 200

# Auth check route
@auth_bp.route('/check')
def check_auth():
    if 'user_id' not in session or 'role' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    role = session['role']
    
    if role == 'superadmin':
        superadmin = Superadmin.query.get(session['user_id'])
        if not superadmin:
            return jsonify({'error': 'Superadmin not found'}), 404
        return jsonify({
            'user': {
                'id': superadmin.id,
                'email': superadmin.email,
                'role': 'superadmin'
            }
        }), 200

    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Check if OTP verification is pending
    if role == 'recruiter':
        recruiter = Recruiter.query.filter_by(user_id=user.id).first()
        if recruiter and recruiter.requires_otp_verification:
            return jsonify({
                'error': 'OTP verification required',
                'enforce_otp_verification': True,
                'email': user.email,
                'otp_reason': session.get('otp_reason', 'OTP verification required')
            }), 401

    enforce_otp_verification = session.get('enforce_otp_verification', False)

    response = {
        'user': {
            'id': user.id,
            'email': user.email,
            'name': user.name,
            'role': role,
        }
    }

    if role == 'candidate':
        candidate = Candidate.query.filter_by(user_id=user.id).first()
        response['user']['profile_img'] = candidate.profile_picture if candidate else ''
        if candidate:
            response['user'].update({
                'candidate_id': candidate.candidate_id,
                'degree_id': candidate.degree_id,
                'degree_name': candidate.degree.degree_name if candidate.degree else None,
                'years_of_experience': candidate.years_of_experience,
                'is_profile_complete': candidate.is_profile_complete,
                'enforce_otp_verification': enforce_otp_verification
            })

    elif role == 'recruiter':
        recruiter = Recruiter.query.filter_by(user_id=user.id).first()
        response['user']['profile_img'] = recruiter.logo if recruiter else ''
        if recruiter:
            response['user'].update({
                'recruiter_id': recruiter.recruiter_id,
                'company': recruiter.company,
                'phone': recruiter.phone,
                'subscription_plan': recruiter.subscription_plan.name if recruiter.subscription_plan else None,
                'requires_otp_verification': recruiter.requires_otp_verification
            })

    print(f"✅ Auth check: {response['user']}")
    return jsonify(response)

# Forgot password
@auth_bp.route('/forgot-password', methods=['POST'])
@limiter.limit("5/hour")
def forgot_password():
    data = request.json
    email = data.get('email')
    user = User.query.filter_by(email=email).first()

    if not user:
        return jsonify({'message': 'If an account exists for this email, a reset link has been sent.'}), 200

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=1)

    reset_token = PasswordResetToken(
        user_id=user.id,
        token=token,
        expires_at=expires_at
    )
    db.session.add(reset_token)
    db.session.commit()

    reset_url = f"{os.getenv('CLIENT_BASE_URL')}/reset-password?token={token}"
    msg = Message(
        subject="Password Reset Request",
        recipients=[user.email],
        body=f"""
        Hello {user.name},

        You requested a password reset. Click the link below to reset your password:
        {reset_url}

        This link will expire in 1 hour. If you did not request a password reset, please ignore this email.

        Best,
        Quizzer
        """
    )
    try:
        mail.send(msg)
        print(f"📧 Password reset link sent to {user.email}")
        return jsonify({'message': 'If an account exists for this email, a reset link has been sent.'}), 200
    except Exception as e:
        db.session.delete(reset_token)
        db.session.commit()
        return jsonify({'error': 'Failed to send reset email'}), 500

# Reset password
@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    data = request.json
    token = data.get('token')
    new_password = data.get('password')

    reset_token = PasswordResetToken.query.filter_by(token=token).first()

    if not reset_token:
        return jsonify({'error': 'Invalid or expired reset token'}), 400

    if reset_token.is_expired():
        db.session.delete(reset_token)
        db.session.commit()
        return jsonify({'error': 'Reset token has expired'}), 400

    user = User.query.get(reset_token.user_id)

    if user.check_password(new_password):
        return jsonify({'error': 'New password cannot be the same as the old one'}), 400

    user.set_password(new_password)

    db.session.delete(reset_token)
    db.session.commit()

    return jsonify({'message': 'Password reset successfully'}), 200

# Confirm email
@auth_bp.route('/confirm', methods=['POST'])
def confirm_email():
    data = request.json
    token = data.get('token')

    confirmation_token = PasswordResetToken.query.filter_by(token=token).first()
    if not confirmation_token:
        return jsonify({'error': 'Invalid or expired confirmation token.'}), 400

    if confirmation_token.is_expired():
        db.session.delete(confirmation_token)
        db.session.commit()
        return jsonify({'error': 'Confirmation token has expired.'}), 400

    user = User.query.get(confirmation_token.user_id)
    if not user:
        return jsonify({'error': 'User not found.'}), 404

    user.is_active = True
    db.session.delete(confirmation_token)
    db.session.commit()

    return jsonify({'message': 'Email confirmed successfully. You can now log in.'}), 200

# Logout route
@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    print("✅ User logged out and session cleared")
    return jsonify({'message': 'Logged out successfully'})