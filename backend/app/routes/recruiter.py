from io import BytesIO
from string import Template
from flask import Blueprint, jsonify, request, send_file, session
import requests
from app import db, mail
from app.models.user import User, PasswordResetToken
from app.models.login_log import LoginLog
from app.models.job import JobDescription
from app.models.skill import Skill
from app.models.recruiter import Recruiter
from app.models.required_skill import RequiredSkill
from app.models.candidate import Candidate
from app.models.assessment_registration import AssessmentRegistration
from app.models.candidate_skill import CandidateSkill
from app.models.assessment_attempt import AssessmentAttempt
from app.models.degree import Degree
from app.models.assessment_proctoring_data import AssessmentProctoringData
from app.models.subscription_plan import SubscriptionPlan
from app.models.proctoring_violation import ProctoringViolation
from app.models.degree_branch import DegreeBranch
from app.services import question_batches
from sqlalchemy import and_
from sqlalchemy.orm import joinedload
from datetime import datetime, timezone, timedelta
import logging
import os
import google.generativeai as genai
import importlib
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
import secrets
from flask_mail import Message
from geopy.distance import geodesic

recruiter_api_bp = Blueprint('recruiter_api', __name__, url_prefix='/api/recruiter')

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configure Gemini AI API
api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("GOOGLE_API_KEY environment variable not set")
genai.configure(api_key=api_key)
generation_config = {
    "temperature": 0.2,
    "max_output_tokens": 2048
}
model_gemini = genai.GenerativeModel(
    model_name="gemini-1.5-flash", generation_config=generation_config
)


def generate_ai_feedback(candidate_data, proctoring_data, violations):
    """
    Generate AI feedback using Gemini AI.
    Args:
        candidate_data: Dict with candidate performance (e.g., performance_log, skills).
        proctoring_data: AssessmentProctoringData object.
        violations: List of ProctoringViolation objects.
    Returns:
        Dict with AI-generated feedback or fallback message if error.
    """
    try:
        print(candidate_data)
        candidate_id = candidate_data.get('candidate_id')
        job_id = candidate_data.get('job_id')
        print("candiate and job id", candidate_id, job_id)  # Ensure job_id is passed in candidate_data
        if not candidate_id or not job_id:
            raise ValueError("Missing candidate_id or job_id")

        # Fetch performance_log from AssessmentAttempt
        attempt = AssessmentAttempt.query.filter_by(
            candidate_id=candidate_id,
            job_id=job_id,
            status='completed'
        ).first()
        print(attempt)
        performance_log = attempt.performance_log if attempt else {}
        # Prepare prompt for Gemini AI
        prompt = (
            "Analyze the candidate's assessment performance and proctoring data. "
            "Provide insights on strengths, weaknesses, and any concerns based on "
            "tab switches, fullscreen warnings, and violations. Summarize in 2-3 sentences.\n\n"
            f"Candidate ID: {candidate_data.get('candidate_id')}\n"
            f"Name: {candidate_data.get('name')}\n"
            f"Performance: {performance_log}\n"
            f"Skills: {candidate_data.get('skills', [])}\n"
            f"Experience: {candidate_data.get('experience', 0)} years\n"
            f"Tab Switches: {proctoring_data.tab_switches if proctoring_data else 0}\n"
            f"Fullscreen Warnings: {proctoring_data.fullscreen_warnings if proctoring_data else 0}\n"
            f"Remarks: {proctoring_data.remarks if proctoring_data else []}\n"
            f"Violations: {[{'type': v.violation_type, 'timestamp': v.timestamp.isoformat()} for v in violations]}"
        )

        # Call Gemini AI
        response = model_gemini.generate_content(prompt)
        feedback = response.text.strip() if response.text else "No feedback generated."

        return {"summary": feedback}
    except Exception as e:
        print(f"Error generating AI feedback with Gemini: {str(e)}")
        return {"summary": "AI feedback unavailable due to an error."}

# Helper function to check if recruiter has AI reports enabled

def has_ai_reports(recruiter_id):
    user = User.query.get(recruiter_id)
    if not user:
        return False
    recruiter = Recruiter.query.filter_by(user_id=user.id).first()
    if not recruiter:
        return False
    subscription = SubscriptionPlan.query.get(recruiter.subscription_plan_id)
    return subscription and subscription.ai_reports


@recruiter_api_bp.route('/login', methods=['POST'])
def recruiter_login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    location = data.get('location', {})
    current_ip = request.remote_addr
    print(f"📡 Received location: {location}")
    print(f"📡 Current IP address: {current_ip}")

    recruiter = User.query.filter_by(email=email).first()
    if recruiter and recruiter.check_password(password) and recruiter.role == 'recruiter':
        if PasswordResetToken.query.filter_by(user_id=recruiter.id).first():
            return jsonify({'error': 'Please reset your password first'}), 400
        # Save login log
        try:
            login_log = LoginLog(
                user_id=recruiter.id,
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
            print(f"✅ Login log saved for user_id={recruiter.id}, ip={current_ip}, lat={location.get('latitude')}, lon={location.get('longitude')}")
        except Exception as e:
            db.session.rollback()
            print(f"❌ Error saving login log: {e}")

        recruiter_profile = Recruiter.query.filter_by(user_id=recruiter.id).first()
        if not recruiter_profile:
            return jsonify({'error': 'Recruiter profile not found'}), 404

        # Check last login for OTP enforcement
        enforce_otp_verification = False
        otp_reason = None
        last_log = (
            LoginLog.query
            .filter(LoginLog.user_id == recruiter.id)
            .order_by(LoginLog.login_time.desc())
            .offset(1)
            .first()
        )
        print(f"📖 Last login found: log_id={last_log.log_id if last_log else None}, IP={last_log.ip_address if last_log else None}, Lat={last_log.latitude if last_log else None}, Lon={last_log.longitude if last_log else None}")

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
                    recruiter_profile.requires_otp_verification = True
                    otp_reason = f"New login location detected (>500km from previous login)"
                    print("⚠️ Location changed significantly (>500km). Enforcing OTP verification.")
            except Exception as e:
                print(f"❌ Error calculating distance: {e}")
                enforce_otp_verification = True
                recruiter_profile.requires_otp_verification = True
                otp_reason = "New login location detected (location calculation failed)"
        elif last_log and last_log.ip_address != current_ip:
            print(f"⚠️ IP changed: {last_log.ip_address} -> {current_ip}. Enforcing OTP verification.")
            enforce_otp_verification = True
            recruiter_profile.requires_otp_verification = True
            otp_reason = "New IP address detected"
        elif not last_log:
            print("⚠️ First login detected. Enforcing OTP verification.")
            enforce_otp_verification = True
            recruiter_profile.requires_otp_verification = True
            otp_reason = "First login detected"
        else:
            print("✅ No significant location/IP change detected.")

        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"❌ Error updating recruiter requires_otp_verification: {e}")
            return jsonify({'error': 'Failed to process login'}), 500

        if recruiter_profile.requires_otp_verification:
            # Generate and send OTP
            otp = secrets.token_hex(3).upper()  # 6-digit hex OTP
            otp_token = PasswordResetToken(
                user_id=recruiter.id,
                token=otp,
                created_at=datetime.utcnow(),
                expires_at=datetime.utcnow() + timedelta(minutes=10)
            )
            db.session.add(otp_token)
            db.session.commit()
            msg = Message(
                subject="Recruiter Login OTP Verification",
                sender=os.getenv('MAIL_DEFAULT_SENDER'),
                recipients=[recruiter.email],
                body=f"""
                Hello {recruiter.name},

                A login attempt from a new location or IP was detected. Your OTP is: {otp}
                This OTP will expire in 10 minutes. If you did not initiate this login, please secure your account.

                Best,
                Quizzer
                """
            )
            try:
                mail.send(msg)
                print(f"📧 OTP sent to {recruiter.email}")
                # Store temporary session state for OTP verification
                session['pending_otp_user_id'] = recruiter.id
                session['pending_otp_role'] = 'recruiter'
                session['enforce_otp_verification'] = True
                return jsonify({
                    'message': 'OTP required for login',
                    'enforce_otp_verification': True,
                    'email': recruiter.email,
                    'otp_reason': otp_reason
                }), 200
            except Exception as e:
                db.session.delete(otp_token)
                db.session.commit()
                print(f"❌ Error sending OTP: {e}")
                return jsonify({'error': 'Failed to send OTP'}), 500
        else:
            # Set full session only if OTP is not required
            session['user_id'] = recruiter.id
            session['role'] = 'recruiter'
            session['enforce_otp_verification'] = False
            return jsonify({'message': 'Login successful'}), 200
    else:
        return jsonify({'error': 'Invalid email or password'}), 401

# BEGIN NEW CODE: OTP verification endpoint for recruiters
@recruiter_api_bp.route('/verify-otp', methods=['POST'])
def verify_otp():
    data = request.json
    otp = data.get('otp')
    email = data.get('email')
    user = User.query.filter_by(email=email).first()
    if not user or user.role != 'recruiter':
        return jsonify({'error': 'Invalid user'}), 400
    otp_token = PasswordResetToken.query.filter_by(
        user_id=user.id,
        token=otp
    ).first()
    if not otp_token:
        return jsonify({'error': 'Invalid OTP'}), 400
    if otp_token.is_expired():
        db.session.delete(otp_token)
        db.session.commit()
        return jsonify({'error': 'OTP has expired'}), 400
    recruiter = Recruiter.query.filter_by(user_id=user.id).first()
    if not recruiter:
        return jsonify({'error': 'Recruiter profile not found'}), 404
    # Verify temporary session
    if session.get('pending_otp_user_id') != user.id or session.get('pending_otp_role') != 'recruiter':
        return jsonify({'error': 'Invalid session for OTP verification'}), 401
    # Clear OTP requirement and token
    recruiter.requires_otp_verification = False
    db.session.delete(otp_token)
    db.session.commit()
    # Promote temporary session to full session
    session['user_id'] = user.id
    session['role'] = 'recruiter'
    session['enforce_otp_verification'] = False
    # Clear temporary session variables
    session.pop('pending_otp_user_id', None)
    session.pop('pending_otp_role', None)
    return jsonify({'message': 'OTP verified successfully'}), 200

@recruiter_api_bp.route('/degrees', methods=['GET'])
def get_degrees():
    degrees = Degree.query.all()
    return jsonify([
        {'degree_id': degree.degree_id, 'degree_name': degree.degree_name}
        for degree in degrees
    ])


@recruiter_api_bp.route('/branches', methods=['GET'])
def get_branches():
    branches = DegreeBranch.query.all()
    return jsonify([
        {'branch_id': branch.branch_id, 'branch_name': branch.branch_name}
        for branch in branches
    ])

@recruiter_api_bp.route('/assessments', methods=['GET'])
def get_assessments():
    if 'user_id' not in session or session.get('role') != 'recruiter':
        return jsonify({'error': 'Unauthorized'}), 401
    recruiter = Recruiter.query.filter_by(user_id=session['user_id']).first()
    if not recruiter:
        return jsonify({'error': 'Recruiter not found'}), 404
    current_time = datetime.now(timezone.utc)
    jobs = JobDescription.query.options(
        joinedload(JobDescription.required_skills).joinedload(RequiredSkill.skill),
        joinedload(JobDescription.degree),
        joinedload(JobDescription.branch)
    ).filter_by(recruiter_id=recruiter.recruiter_id).all()
    past_assessments = []
    active_assessments = []
    for job in jobs:
        assessment = {
            'job_id': job.job_id,
            'job_title': job.job_title,
            'company': recruiter.company,
            'location': job.location,
            'schedule_start': job.schedule_start.isoformat() if job.schedule_start else None,
            'schedule_end': job.schedule_end.isoformat() if job.schedule_end else None,
            'num_questions': job.num_questions,
            'duration': job.duration,
            'experience_min': job.experience_min,
            'experience_max': job.experience_max,
            'degree_required': job.degree.degree_name if job.degree else None,
            'degree_branch': job.branch.branch_name if job.branch else None,
            'passout_year': job.passout_year,
            'passout_year_required': job.passout_year_required,
            'custom_prompt': job.custom_prompt,
            'job_description': job.job_description,
            'logo':recruiter.logo,
            'skills': [
                {'name': rs.skill.name, 'priority': rs.priority}
                for rs in job.required_skills
            ]
        }
        end_time = job.schedule_end if job.schedule_end else None
        if end_time and end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)
        if end_time and end_time < current_time:
            past_assessments.append(assessment)
        else:
            active_assessments.append(assessment)
    return jsonify({
        'past_assessments': past_assessments,
        'active_assessments': active_assessments
    }), 200

@recruiter_api_bp.route('/assessments', methods=['POST'])
def create_assessment():
    if 'user_id' not in session or session.get('role') != 'recruiter':
        return jsonify({'error': 'Unauthorized'}), 401
    recruiter = Recruiter.query.filter_by(user_id=session['user_id']).first()
    if not recruiter:
        return jsonify({'error': 'Recruiter not found'}), 404
    data = request.json
    required_fields = ['job_title', 'experience_min', 'experience_max', 'duration', 'num_questions', 'schedule_start', 'schedule_end', 'skills']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400
    if not isinstance(data['skills'], list) or not all('name' in skill and 'priority' in skill for skill in data['skills']):
        return jsonify({'error': 'Skills must be a list of objects with "name" and "priority"'}), 400

    try:
        experience_min = float(data['experience_min'])
        experience_max = float(data['experience_max'])
        duration = int(data['duration'])
        num_questions = int(data['num_questions'])
        degree_required = int(data['degree_required']) if data.get('degree_required') else None
        degree_branch = int(data['degree_branch']) if data.get('degree_branch') else None
        passout_year = int(data['passout_year']) if data.get('passout_year') else None
        passout_year_required = data.get('passout_year_required', False)
        current_year = datetime.now(timezone.utc).year
        if experience_min < 0 or experience_max < experience_min:
            return jsonify({'error': 'Invalid experience range'}), 400
        if duration <= 0 or num_questions <= 0:
            return jsonify({'error': 'Duration and number of questions must be positive'}), 400
        if degree_required and not Degree.query.get(degree_required):
            return jsonify({'error': 'Invalid degree selected.'}), 400
        if degree_branch and not DegreeBranch.query.get(degree_branch):
            return jsonify({'error': 'Invalid degree branch selected.'}), 400
        if passout_year and not (1900 <= passout_year <= current_year + 5):
            return jsonify({'error': f'Passout year must be between 1900 and {current_year + 5}.'}), 400
        schedule_start = datetime.fromisoformat(data['schedule_start'].replace('Z', '+00:00'))
        schedule_end = datetime.fromisoformat(data['schedule_end'].replace('Z', '+00:00'))
        if schedule_end <= schedule_start:
            return jsonify({'error': 'Schedule end must be after schedule start'}), 400
        assessment = JobDescription(
            recruiter_id=recruiter.recruiter_id,
            job_title=data['job_title'],
            company=recruiter.company,
            location=data.get('location', ''),
            experience_min=experience_min,
            experience_max=experience_max,
            duration=duration,
            num_questions=num_questions,
            schedule_start=schedule_start,
            schedule_end=schedule_end,
            degree_required=degree_required,
            degree_branch=degree_branch,
            passout_year=passout_year,
            passout_year_required=passout_year_required,
            custom_prompt=data.get('custom_prompt', ''),
            job_description=data.get('job_description', '')
        )
        db.session.add(assessment)
        db.session.flush()
        priority_map = {'low': 2, 'medium': 3, 'high': 5}
        for skill_data in data['skills']:
            priority = priority_map.get(skill_data['priority'].lower())
            if not priority:
                db.session.rollback()
                return jsonify({'error': f"Invalid priority: {skill_data['priority']}. Must be 'low', 'medium', or 'high'."}), 400
            skill = Skill.query.filter_by(name=skill_data['name']).first()
            if not skill:
                skill = Skill(name=skill_data['name'], category='technical')
                db.session.add(skill)
                db.session.flush()
            required_skill = RequiredSkill(
                job_id=assessment.job_id,
                skill_id=skill.skill_id,
                priority=priority
            )
            db.session.add(required_skill)
        db.session.commit()
        try:
            skills_with_priorities = [
                {'name': skill_data['name'], 'priority': priority_map[skill_data['priority'].lower()]}
                for skill_data in data['skills']
            ]
            jd_experience_range = f"{experience_min}-{experience_max}"
            question_batches.prepare_question_batches(
                skills_with_priorities, jd_experience_range, assessment.job_id, assessment.custom_prompt
            )
        except Exception as e:
            logger.warning(f"Failed to generate question batches for job_id={assessment.job_id}: {str(e)}")
            pass
        return jsonify({'message': 'Assessment created successfully', 'job_id': assessment.job_id}), 201
    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to create assessment: {str(e)}'}), 500

@recruiter_api_bp.route('/assessments/<int:user_id>', methods=['GET'])
def get_assessments_by_id(user_id):
    if 'user_id' not in session or session['role'] != 'recruiter':
        return jsonify({'error': 'Unauthorized'}), 401
    recruiter = Recruiter.query.filter_by(user_id=session['user_id']).first()
    if not recruiter or recruiter.user_id != user_id:
        return jsonify({'error': 'Unauthorized access to recruiter data'}), 403
    jobs = JobDescription.query.options(
        joinedload(JobDescription.required_skills).joinedload(RequiredSkill.skill),
        joinedload(JobDescription.degree),
        joinedload(JobDescription.branch)
    ).filter_by(recruiter_id=recruiter.recruiter_id).all()
    return jsonify([{
        'job_id': assessment.job_id,
        'job_title': assessment.job_title,
        'company': assessment.company,
        'location': assessment.location,
        'experience_min': assessment.experience_min,
        'experience_max': assessment.experience_max,
        'duration': assessment.duration,
        'num_questions': assessment.num_questions,
        'schedule_start': assessment.schedule_start.isoformat() if assessment.schedule_start else None,
        'schedule_end': assessment.schedule_end.isoformat() if assessment.schedule_end else None,
        'degree_required': assessment.degree.degree_name if assessment.degree else None,
        'degree_branch': assessment.branch.branch_name if assessment.branch else None,
        'passout_year': assessment.passout_year,
        'passout_year_required': assessment.passout_year_required,
        'custom_prompt': assessment.custom_prompt,
        'job_description': assessment.job_description,
        'skills': [
            {'name': rs.skill.name, 'priority': rs.priority}
            for rs in assessment.required_skills
        ]
    } for assessment in jobs]), 200

@recruiter_api_bp.route('/candidates/<int:job_id>', methods=['GET'])
def get_ranked_candidates(job_id):
    if 'user_id' not in session or session['role'] != 'recruiter':
        return jsonify({'error': 'Unauthorized'}), 401

    job = JobDescription.query.get_or_404(job_id)
    registrations = AssessmentRegistration.query.filter_by(job_id=job_id).all()
    candidate_ids = [r.candidate_id for r in registrations]

    if not candidate_ids:
        return jsonify({'job_id': job_id, 'job_title': job.job_title, 'candidates': []}), 200

    candidates = Candidate.query.filter(Candidate.candidate_id.in_(candidate_ids)).all()
    required_skills = RequiredSkill.query.filter_by(job_id=job_id).all()
    required_skill_dict = {rs.skill_id: rs.priority for rs in required_skills}
    candidate_skills = CandidateSkill.query.filter(
        and_(
            CandidateSkill.candidate_id.in_(candidate_ids),
            CandidateSkill.skill_id.in_(required_skill_dict.keys())
        )
    ).all()

    candidate_skill_map = {}
    for cs in candidate_skills:
        if cs.candidate_id not in candidate_skill_map:
            candidate_skill_map[cs.candidate_id] = {}
        candidate_skill_map[cs.candidate_id][cs.skill_id] = cs.proficiency

    max_proficiency = 8
    max_skill_score = sum(required_skill_dict.values()) * max_proficiency
    ranked_candidates = []
    ai_enabled = has_ai_reports(session['user_id'])

    for candidate in candidates:
        skill_score = 0
        matched_skills = []
        for skill_id, priority in required_skill_dict.items():
            proficiency = candidate_skill_map.get(candidate.candidate_id, {}).get(skill_id, 0)
            if proficiency > 0:
                skill_name = Skill.query.get(skill_id).name
                matched_skills.append(f"{skill_name} (Proficiency: {proficiency})")
                skill_score += priority * proficiency

        skill_score_normalized = skill_score / max_skill_score if max_skill_score > 0 else 0
        exp_midpoint = (job.experience_min + job.experience_max) / 2
        exp_range = job.experience_max - job.experience_min
        exp_diff = abs(candidate.years_of_experience - exp_midpoint)
        exp_score = max(0, 1 - (exp_diff / (exp_range / 2))) if exp_range > 0 else 1
        total_score = (0.7 * skill_score_normalized) + (0.3 * exp_score)

        description = f"{candidate.name} is ranked based on "
        if matched_skills:
            description += f"strong skills in {', '.join(matched_skills)}"
        else:
            description += "limited skill matches"
        description += f" and {candidate.years_of_experience} years of experience, which "
        description += (
            "closely matches" if exp_diff < 0.5 else
            "reasonably matches" if exp_diff < 1.5 else
            "is outside"
        )
        description += f" the job's {job.experience_min}-{job.experience_max} year requirement."

        candidate_data = {
            'candidate_id': candidate.candidate_id,
            'name': candidate.name,
            'email': candidate.email,
            'total_score': round(total_score, 2),
            'skill_score': round(skill_score_normalized, 2),
            'experience_score': round(exp_score, 2),
            'description': description,
            'ai_feedback': None,
            'job_id': JobDescription.query.get(job_id).job_id,
        }

        if ai_enabled:
            # For pre-assessment, AI feedback might be limited to skill and experience analysis
            ai_input = {
                "candidate_id": candidate.candidate_id,
                "name": candidate.name,
                "skills": matched_skills,
                "experience": candidate.years_of_experience,
                "job_id": job.job_id,
                "job_requirements": {
                    "title": job.job_title,
                    "experience_min": job.experience_min,
                    "experience_max": job.experience_max
                }
            }
            candidate_data['ai_feedback'] = generate_ai_feedback(ai_input, None, [])

        ranked_candidates.append(candidate_data)

    ranked_candidates.sort(key=lambda x: x['total_score'], reverse=True)
    for i, candidate in enumerate(ranked_candidates, 1):
        candidate['rank'] = i

    return jsonify({
        'job_id': job_id,
        'job_title': job.job_title,
        'candidates': ranked_candidates,
        'ai_enabled': ai_enabled
    }), 200

@recruiter_api_bp.route('/report/<int:job_id>', methods=['GET'])
def get_post_assessment_report(job_id):
    if 'user_id' not in session or session['role'] != 'recruiter':
        return jsonify({'error': 'Unauthorized'}), 401

    current_time = datetime.now(timezone.utc)  # Offset-aware current time
    job = JobDescription.query.get_or_404(job_id)
    end_time = job.schedule_end if job.schedule_end else None

    # Ensure end_time is offset-aware
    if end_time and end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)

    if end_time and end_time > current_time:
        return jsonify({'error': 'Report not available until assessment ends'}), 403

    registrations = AssessmentRegistration.query.filter_by(job_id=job_id).all()
    candidate_ids = [r.candidate_id for r in registrations]
    if not candidate_ids:
        return jsonify({
            'job_id': job_id,
            'job_title': job.job_title,
            'job_description': job.job_description,
            'candidates': [],
            'ai_enabled': False
        }), 200

    candidates = Candidate.query.filter(Candidate.candidate_id.in_(candidate_ids)).all()
    attempts = AssessmentAttempt.query.filter(
        and_(
            AssessmentAttempt.job_id == job_id,
            AssessmentAttempt.candidate_id.in_(candidate_ids),
            AssessmentAttempt.status.in_(['completed', 'submitted', 'terminated'])
        )
    ).all()

    attempt_map = {a.candidate_id: a for a in attempts}
    ai_enabled = has_ai_reports(session['user_id'])
    report = []

    for candidate in candidates:
        attempt = attempt_map.get(candidate.candidate_id)
        performance = attempt.performance_log if attempt else None
        proctoring_data = AssessmentProctoringData.query.filter_by(attempt_id=attempt.attempt_id).first() if attempt else None
        violations = ProctoringViolation.query.filter_by(attempt_id=attempt.attempt_id).all() if attempt else []

        if performance and isinstance(performance, dict):
            skill_data = {k: v for k, v in performance.items() if k != 'proctoring_data'}
            total_accuracy = (
                sum(skill_data.get('accuracy_percent', 0) for skill_data in skill_data.values()) /
                len(skill_data) if skill_data else 0
            )
            total_questions = sum(skill_data.get('questions_attempted', 0) for skill_data in skill_data.values()) if skill_data else 0
            total_time = sum(skill_data.get('time_spent', 0) for skill_data in skill_data.values()) if skill_data else 0
            avg_time_per_question = round(total_time / total_questions, 2) if total_questions > 0 else 0
            final_bands = {skill: data.get('final_band', 'N/A') for skill, data in skill_data.items()} if skill_data else {}
            status = 'Completed' if attempt.status in ['completed', 'submitted'] else 'Terminated'
        else:
            total_accuracy = 0
            total_questions = 0
            avg_time_per_question = 0
            final_bands = {}
            status = 'Did Not Attempt'

        candidate_data = {
            'candidate_id': candidate.candidate_id,
            'name': candidate.name,
            'email': candidate.email,
            'accuracy': round(total_accuracy, 1),
            'total_questions': total_questions,
            'avg_time_per_answer': avg_time_per_question,
            'final_bands': final_bands,
            'status': status,
            'ai_feedback': None
        }

        if ai_enabled and attempt:
            ai_input = {
                "candidate_id": candidate.candidate_id,
                "name": candidate.name,
                "performance": performance,
                "skills": list(skill_data.keys()) if skill_data else [],
                "job_id": job_id
            }
            candidate_data['ai_feedback'] = generate_ai_feedback(ai_input, proctoring_data, violations)

        report.append(candidate_data)

    # Sort by accuracy (descending) and assign ranks
    report.sort(key=lambda x: x['accuracy'], reverse=True)
    for i, candidate in enumerate(report, 1):
        candidate['rank'] = i

    return jsonify({
        'job_id': job_id,
        'job_title': job.job_title,
        'candidates': report,
        'ai_enabled': ai_enabled
    }), 200

@recruiter_api_bp.route('/combined-report/<int:job_id>', methods=['GET'])
def get_combined_report(job_id):
    if 'user_id' not in session or session['role'] != 'recruiter':
        return jsonify({'error': 'Unauthorized'}), 401

    current_time = datetime.now(timezone.utc)  # Offset-aware current time
    job = JobDescription.query.get_or_404(job_id)
    end_time = job.schedule_end if job.schedule_end else None

    # Ensure end_time is offset-aware
    if end_time and end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)

    if end_time and end_time > current_time:
        return jsonify({'error': 'Report not available until assessment ends'}), 403

    registrations = AssessmentRegistration.query.filter_by(job_id=job_id).all()
    candidate_ids = [r.candidate_id for r in registrations]
    if not candidate_ids:
        return jsonify({
            'job_id': job_id,
            'job_title': job.job_title,
            'candidates': [],
            'ai_enabled': False
        }), 200

    candidates = Candidate.query.filter(Candidate.candidate_id.in_(candidate_ids)).all()
    required_skills = RequiredSkill.query.filter_by(job_id=job_id).all()
    required_skill_dict = {rs.skill_id: rs.priority for rs in required_skills}
    candidate_skills = CandidateSkill.query.filter(
        and_(
            CandidateSkill.candidate_id.in_(candidate_ids),
            CandidateSkill.skill_id.in_(required_skill_dict.keys())
        )
    ).all()
    candidate_skill_map = {}
    for cs in candidate_skills:
        if cs.candidate_id not in candidate_skill_map:
            candidate_skill_map[cs.candidate_id] = {}
        candidate_skill_map[cs.candidate_id][cs.skill_id] = cs.proficiency

    attempts = AssessmentAttempt.query.filter(
        and_(
            AssessmentAttempt.job_id == job_id,
            AssessmentAttempt.candidate_id.in_(candidate_ids),
            AssessmentAttempt.status.in_(['completed', 'submitted', 'terminated'])
        )
    ).all()
    attempt_map = {a.candidate_id: a for a in attempts}

    max_proficiency = 8
    max_skill_score = sum(required_skill_dict.values()) * max_proficiency
    ai_enabled = has_ai_reports(session['user_id'])
    ranked_candidates = []

    for candidate in candidates:
        # Pre-assessment calculations
        skill_score = 0
        matched_skills = []
        for skill_id, priority in required_skill_dict.items():
            proficiency = candidate_skill_map.get(candidate.candidate_id, {}).get(skill_id, 0)
            if proficiency > 0:
                skill_name = Skill.query.get(skill_id).name
                matched_skills.append(f"{skill_name} (Proficiency: {proficiency})")
                skill_score += priority * proficiency

        skill_score_normalized = skill_score / max_skill_score if max_skill_score > 0 else 0
        exp_midpoint = (job.experience_min + job.experience_max) / 2
        exp_range = job.experience_max - job.experience_min
        exp_diff = abs(candidate.years_of_experience - exp_midpoint)
        exp_score = max(0, 1 - (exp_diff / (exp_range / 2))) if exp_range > 0 else 1
        pre_score = (0.7 * skill_score_normalized) + (0.3 * exp_score)

        description = f"{candidate.name} is ranked based on "
        description += (
            f"strong skills in {', '.join(matched_skills)}" if matched_skills
            else "limited skill matches"
        )
        description += f" and {candidate.years_of_experience} years of experience, which "
        description += (
            "closely matches" if exp_diff < 0.5 else
            "reasonably matches" if exp_diff < 1.5 else
            "is outside"
        )
        description += f" the job's {job.experience_min}-{job.experience_max} year requirement."

        # Post-assessment calculations
        attempt = attempt_map.get(candidate.candidate_id)
        proctoring_data = AssessmentProctoringData.query.filter_by(attempt_id=attempt.attempt_id).first() if attempt else None
        violations = ProctoringViolation.query.filter_by(attempt_id=attempt.attempt_id).all() if attempt else []
        performance = attempt.performance_log if attempt else None

        if performance and isinstance(performance, dict):
            skill_data = {k: v for k, v in performance.items() if k != 'proctoring_data'}
            total_accuracy = sum(skill_data.get('accuracy_percent', 0) for skill_data in skill_data.values()) / len(skill_data) if skill_data else 0
            total_questions = sum(skill_data.get('questions_attempted', 0) for skill_data in skill_data.values()) if skill_data else 0
            total_time = sum(skill_data.get('time_spent', 0) for skill_data in skill_data.values()) if skill_data else 0
            avg_time_per_question = round(total_time / total_questions, 2) if total_questions > 0 else 0
            final_bands = {skill: data.get('final_band', 'N/A') for skill, data in skill_data.items()} if skill_data else {}
            status = 'Completed' if attempt.status in ['completed', 'submitted'] else 'Terminated'
            post_score = total_accuracy / 100  # Normalize to 0-1
        else:
            total_accuracy = 0
            total_questions = 0
            avg_time_per_question = 0
            final_bands = {}
            status = 'Did Not Attempt'
            post_score = 0

        # Combined score
        combined_score = (0.4 * pre_score) + (0.6 * post_score)

        candidate_data = {
            'candidate_id': candidate.candidate_id,
            'name': candidate.name,
            'email': candidate.email,
            'pre_score': round(pre_score, 2),
            'post_score': round(post_score, 2),
            'combined_score': round(combined_score, 2),
            'total_questions': total_questions,
            'avg_time_per_answer': avg_time_per_question,
            'final_bands': final_bands,
            'status': status,
            'description': description,
            'ai_feedback': None
        }

        if ai_enabled and attempt:
            ai_input = {
                "candidate_id": candidate.candidate_id,
                "name": candidate.name,
                "performance": performance or {},
                "skills": matched_skills,
                "experience": candidate.years_of_experience,
                "job_id": job_id
            }
            candidate_data['ai_feedback'] = generate_ai_feedback(ai_input, proctoring_data, violations)

        ranked_candidates.append(candidate_data)

    ranked_candidates.sort(key=lambda x: x['combined_score'], reverse=True)
    for i, candidate in enumerate(ranked_candidates, 1):
        candidate['rank'] = i

    return jsonify({
        'job_id': job_id,
        'job_title': job.job_title,
        'candidates': ranked_candidates,
        'ai_enabled': ai_enabled
    }), 200
# HTML template for PDF rendering
PDF_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{{ report_type }} Report for {{ job_title }}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #1a202c; text-align: center; }
        h2 { color: #2d3748; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
        th { background-color: #edf2f7; }
        .candidate-card { border: 1px solid #e2e8f0; padding: 10px; margin-bottom: 10px; }
        .candidate-card h3 { margin: 0 0 5px; }
        .page-break { page-break-before: always; }
        .ai-feedback { margin-top: 10px; font-style: italic; }
    </style>
</head>
<body>
    <h1>{{ report_type }} Report for {{ job_title }}</h1>
    <p>Job ID: {{ job_id }}</p>
    {% if job_description %}
    <p><strong>Job Description:</strong> {{ job_description }}</p>
    {% endif %}
    {% if candidates %}
    <h2>Candidate Details</h2>
    <table>
        <thead>
            <tr>
                {% if report_type == 'Combined' %}
                <th>Rank</th>
                {% endif %}
                <th>Name</th>
                <th>Email</th>
                {% if report_type != 'Pre-Assessment' %}
                <th>Status</th>
                {% endif %}
                {% if report_type == 'Pre-Assessment' %}
                <th>Total Score</th>
                <th>Skill Score</th>
                <th>Experience Score</th>
                {% elif report_type == 'Post-Assessment' %}
                <th>Accuracy (%)</th>
                <th>Questions Attempted</th>
                <th>Avg Time/Question (s)</th>
                <th>Final Bands</th>
                {% else %}
                <th>Pre-Score</th>
                <th>Post-Score</th>
                <th>Combined Score</th>
                <th>Questions Attempted</th>
                <th>Avg Time/Question (s)</th>
                <th>Final Bands</th>
                {% endif %}
            </tr>
        </thead>
        <tbody>
            {% for candidate in candidates %}
            <tr>
                {% if report_type == 'Combined' %}
                <td>{{ candidate.rank }}</td>
                {% endif %}
                <td>{{ candidate.name }}</td>
                <td>{{ candidate.email }}</td>
                {% if report_type != 'Pre-Assessment' %}
                <td>{{ candidate.status }}</td>
                {% endif %}
                {% if report_type == 'Pre-Assessment' %}
                <td>{{ candidate.total_score }}</td>
                <td>{{ candidate.skill_score }}</td>
                <td>{{ candidate.experience_score }}</td>
                {% elif report_type == 'Post-Assessment' %}
                <td>{{ candidate.accuracy }}</td>
                <td>{{ candidate.total_questions }}</td>
                <td>{{ candidate.avg_time_per_question }}</td>
                <td>{{ candidate.final_bands | to_dict_string }}</td>
                {% else %}
                <td>{{ candidate.pre_score }}</td>
                <td>{{ candidate.post_score }}</td>
                <td>{{ candidate.combined_score }}</td>
                <td>{{ candidate.total_questions }}</td>
                <td>{{ candidate.avg_time_per_question }}</td>
                <td>{{ candidate.final_bands | to_dict_string }}</td>
                {% endif %}
            </tr>
        </tbody>
    </table>
    {% else %}
    <p>No candidates found.</p>
    {% endif %}
    {% if candidates %}
    <div class="page-break"></div>
    <h2>Detailed Candidate Summaries</h2>
    {% for candidate in candidates %}
    <div class="candidate-card">
        <h3>{{ candidate.name }} {% if report_type == 'Combined' %}(Rank {{ candidate.rank }}){% endif %}</h3>
        <p><strong>Email:</strong> {{ candidate.email }}</p>
        {% if report_type != 'Pre-Assessment' %}
        <p><strong>Status:</strong> {{ candidate.status }}</p>
        {% endif %}
        {% if report_type == 'Pre-Assessment' %}
        <p><strong>Total Score:</strong> {{ candidate.total_score }}</p>
        <p><strong>Skill Score:</strong> {{ candidate.skill_score }}</p>
        <p><strong>Experience Score:</strong> {{ candidate.experience_score }}</p>
        {% if candidate.description %}
        <p><strong>Description:</strong> {{ candidate.description }}</p>
        {% endif %}
        {% elif report_type == 'Post-Assessment' %}
        <p><strong>Accuracy:</strong> {{ candidate.accuracy }}%</p>
        <p><strong>Questions Attempted:</strong> {{ candidate.total_questions }}</p>
        <p><strong>Avg Time/Question:</strong> {{ candidate.avg_time_per_question }}s</p>
        <p><strong>Final Bands:</strong> {{ candidate.final_bands | to_dict_string }}</p>
        {% else %}
        <p><strong>Pre-Assessment Score:</strong> {{ candidate.pre_score }}</p>
        <p><strong>Post-Assessment Score:</strong> {{ candidate.post_score }}</p>
        <p><strong>Combined Score:</strong> {{ candidate.combined_score }}</p>
        <p><strong>Questions Attempted:</strong> {{ candidate.total_questions }}</p>
        <p><strong>Avg Time/Question:</strong> {{ candidate.avg_time_per_question }}s</p>
        <p><strong>Final Bands:</strong> {{ candidate.final_bands | to_dict_string }}</p>
        {% if candidate.description %}
        <p><strong>Description:</strong> {{ candidate.description }}</p>
        {% endif %}
        {% endif %}
        {% if ai_enabled and candidate.ai_feedback %}
        <div className="ai-feedback">
            <p><strong>AI Feedback:</strong> {{ candidate.ai_feedback.summary }}</p>
        </div>
        {% endif %}
    </div>
    </div>
    {% endfor %}
</body>
</html>
"""

# Jinja2 filter to convert dict to string
def to_dict_string(d):
    return ", ".join(f"{k}: {v}" for k, v in d.items())

@recruiter_api_bp.route('/download-report/<int:job_id>/<string:report_type>', methods=['GET'])
def download_report(job_id, report_type):
    if 'user_id' not in session or session['role'] != 'recruiter':
        return jsonify({'error': 'Unauthorized'}), 401

    job = JobDescription.query.get_or_404(job_id)
    recruiter = Recruiter.query.filter_by(user_id=session['user_id']).first()
    if not recruiter or job.recruiter_id != recruiter.recruiter_id:
        return jsonify({'error': 'Unauthorized access to job'}), 403

    # Fetch report data
    if report_type == 'pre-assessment':
        report_response = get_ranked_candidates(job_id)
    elif report_type == 'post-assessment':
        report_response = get_post_assessment_report(job_id)
    elif report_type == 'combined':
        report_response = get_combined_report(job_id)
    else:
        return jsonify({'error': 'Invalid report type'}), 400

    # Extract JSON data from response
    if isinstance(report_response, tuple):
        report_data = report_response[0].get_json()
    else:
        report_data = report_response.get_json()

    # Generate PDF
    try:
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            leftMargin=0.75 * inch,
            rightMargin=0.75 * inch,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch
        )
        elements = []

        # Define styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            name='Title',
            parent=styles['Heading1'],
            fontSize=16,
            leading=20,
            spaceAfter=12,
            textColor=colors.black,
            fontName='Helvetica-Bold'
        )
        heading_style = ParagraphStyle(
            name='Heading',
            parent=styles['Heading2'],
            fontSize=12,
            leading=14,
            spaceAfter=8,
            fontName='Helvetica-Bold'
        )
        body_style = ParagraphStyle(
            name='Body',
            parent=styles['Normal'],
            fontSize=10,
            leading=12,
            spaceAfter=6,
            fontName='Helvetica'
        )
        indent_style = ParagraphStyle(
            name='Indent',
            parent=body_style,
            leftIndent=20
        )

        # Header
        elements.append(Paragraph(
            f"Recruitment Report: {report_data.get('job_title', 'Unknown Job')}",
            title_style
        ))
        elements.append(Paragraph(
            f"Type: {report_type.replace('-', ' ').title()}",
            body_style
        ))
        elements.append(Spacer(1, 0.2 * inch))

        # Candidate details
        for candidate in report_data.get('candidates', []):
            # Candidate name and rank
            elements.append(Paragraph(
                f"{candidate.get('name', 'Unknown')} (Rank: {candidate.get('rank', 'N/A')})",
                heading_style
            ))
            # Details
            elements.append(Paragraph(
                f"Total Score: {candidate.get('combined_score', 0):.2f}",
                indent_style
            ))
            elements.append(Paragraph(
                f"Skill Score: {candidate.get('post_score', 0):.2f}",
                indent_style
            ))
            elements.append(Paragraph(
                f"Experience Score: {candidate.get('pre_score', 0):.2f}",
                indent_style
            ))
            # Description (wrapped)
            description = candidate.get('description', '')
            elements.append(Paragraph(
                f"Description: {description}",
                indent_style
            ))
            # AI Feedback (if available)
            if candidate.get('ai_feedback'):
                feedback = candidate['ai_feedback'].get('summary', '')
                elements.append(Paragraph(
                    f"AI Feedback: {feedback}",
                    indent_style
                ))
            elements.append(Spacer(1, 0.3 * inch))

        # Build PDF with footer
        def add_header_footer(canvas, doc):
            canvas.saveState()
            # Header
            canvas.setFont('Helvetica-Bold', 10)
            canvas.drawString(0.75 * inch, doc.pagesize[1] - 0.5 * inch, "Jatayu Recruitment Platform")
            # Footer
            canvas.setFont('Helvetica', 8)
            canvas.drawString(0.75 * inch, 0.5 * inch, f"Page {canvas.getPageNumber()}")
            canvas.drawRightString(
                doc.pagesize[0] - 0.75 * inch, 0.5 * inch,
                f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
            )
            canvas.restoreState()

        doc.build(elements, onFirstPage=add_header_footer, onLaterPages=add_header_footer)
        buffer.seek(0)
        return send_file(
            buffer,
            as_attachment=True,
            download_name=f'report_{job_id}_{report_type}.pdf',
            mimetype='application/pdf'
        )
    except Exception as e:
        logger.error(f"Error generating PDF: {str(e)}")
        return jsonify({'error': f'Failed to generate PDF: {str(e)}'}), 500
    
