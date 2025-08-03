from flask import Blueprint, jsonify, request, session
from app import db, mail
from app.models.candidate import Candidate
from app.models.job import JobDescription
from app.models.required_skill import RequiredSkill
from app.models.assessment_attempt import AssessmentAttempt
from app.models.assessment_registration import AssessmentRegistration
from app.models.skill import Skill
from app.models.candidate_skill import CandidateSkill
from app.models.assessment_state import AssessmentState
from app.models.degree import Degree
from app.models.degree_branch import DegreeBranch
from app.models.resume_json import ResumeJson
from app.models.recruiter import Recruiter
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timezone, timedelta
from app.utils.gcs_upload import upload_to_gcs
from flask_mail import Message
from google.cloud import storage
from google.cloud.exceptions import GoogleCloudError
import os
import re
import difflib
import pytz
import google.generativeai as genai
import logging
from io import BytesIO
from pdfminer.high_level import extract_text
from sqlalchemy.orm import joinedload
import json
import random
import string
from app.utils.face import compare_faces_from_files
import requests
import phonenumbers
import spacy
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import pycountry

candidate_api_bp = Blueprint('candidate_api', __name__, url_prefix='/api/candidate')

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configure Gemini API
genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))

# Initialize Flask-Limiter
limiter = Limiter(key_func=get_remote_address)

# Load spaCy model for fallback resume parsing
nlp = spacy.load("en_core_web_sm")

def get_country_code(location):
    """Extract country code from location string (e.g., 'Mumbai, India' -> 'IN')."""
    if not location:
        logger.warning("Location is empty; defaulting to 'IN'")
        return "IN"
    try:
        # Assume location is in format "City, Country" or just "Country"
        country_name = location.split(',')[-1].strip()
        country = pycountry.countries.search_fuzzy(country_name)
        if country:
            return country[0].alpha_2
        logger.warning(f"Could not find country code for {country_name}; defaulting to 'IN'")
        return "IN"
    except Exception as e:
        logger.error(f"Error extracting country code from {location}: {str(e)}")
        return "IN"  # Default to 'IN' if parsing fails

def send_otp_email(email, otp):
    """Send OTP to the candidate's email using flask_mail."""
    try:
        msg = Message(
            subject='Profile Verification OTP',
            sender=os.getenv('MAIL_DEFAULT_SENDER'),
            recipients=[email],
            body=f"Your OTP for profile verification is: {otp}\nThis OTP is valid for 10 minutes."
        )
        mail.send(msg)
        logger.debug(f"OTP sent to {email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send OTP to {email}: {str(e)}")
        return False

def generate_otp(length=6):
    """Generate a random OTP."""
    return ''.join(random.choices(string.digits, k=length))

def is_valid_pdf(file):
    """Check if the file is a valid PDF by verifying its magic number."""
    try:
        file.seek(0)
        magic = file.read(5)
        file.seek(0)
        return magic == b'%PDF-'
    except Exception as e:
        logger.error(f"Invalid PDF file: {str(e)}")
        return False

def extract_text_from_pdf(pdf_file):
    """Extract text from a PDF file."""
    try:
        if not hasattr(pdf_file, 'read'):
            logger.error("PDF file object lacks read method")
            raise ValueError("Invalid PDF file: must be a file-like object with a read method")
        if not is_valid_pdf(pdf_file):
            logger.error("Uploaded file is not a valid PDF")
            raise ValueError("The uploaded file is not a valid PDF")
        pdf_content = pdf_file.read()
        pdf_file.seek(0)
        pdf_stream = BytesIO(pdf_content)
        text = extract_text(pdf_stream)
        if not text.strip():
            logger.error("No text extracted from PDF")
            raise ValueError("No readable text found in the PDF. Please upload a text-based PDF.")
        logger.debug("Successfully extracted text from PDF")
        return text
    except Exception as e:
        logger.error(f"Failed to extract text from PDF: {str(e)}")
        raise ValueError(f"Failed to extract text from PDF: {str(e)}")

def fallback_resume_parsing(resume_text):
    """Fallback resume parsing using spaCy."""
    try:
        doc = nlp(resume_text)
        parsed_data = {
            "name": "",
            "phone": "",
            "Skills": {"Technical Skills": [], "Soft Skills": [], "Tools": []},
            "Work Experience": [],
            "Projects": [],
            "Education": []
        }

        # Extract name (first PERSON entity)
        for ent in doc.ents:
            if ent.label_ == "PERSON" and not parsed_data["name"]:
                parsed_data["name"] = ent.text
                break

        # Extract phone number using regex
        phone_pattern = r'\+?\d{1,3}[-.\s]?\d{3,4}[-.\s]?\d{3,4}'
        phone_matches = re.findall(phone_pattern, resume_text)
        if phone_matches:
            parsed_data["phone"] = phone_matches[0]

        # Extract skills (basic keyword matching)
        technical_skills = ["Python", "Java", "JavaScript", "SQL", "AWS"]
        soft_skills = ["Communication", "Teamwork", "Leadership"]
        tools = ["Git", "Docker", "Jupyter"]
        for token in doc:
            if token.text in technical_skills:
                parsed_data["Skills"]["Technical Skills"].append(token.text)
            elif token.text in soft_skills:
                parsed_data["Skills"]["Soft Skills"].append(token.text)
            elif token.text in tools:
                parsed_data["Skills"]["Tools"].append(token.text)

        logger.debug("Fallback resume parsing completed")
        return parsed_data
    except Exception as e:
        logger.error(f"Fallback resume parsing failed: {str(e)}")
        return None

def analyze_resume(resume_text):
    """Analyze resume text using Gemini API with fallback."""
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        prompt = f"""
You are a JSON assistant. Extract and return ONLY valid JSON in the following format (no comments or explanations):

{{
  "name": "",
  "phone": "",
  "Skills": {{
    "Technical Skills": [],
    "Soft Skills": [],
    "Tools": []
  }},
  "Work Experience": [
    {{
      "Company": "",
      "Title": "",
      "Start Date": "",
      "End Date": "",
      "Description": "",
      "Technologies": ""
    }}
  ],
  "Projects": [
    {{
      "Title": "",
      "Description": "",
      "Technologies": ""
    }}
  ],
  "Education": [
    {{
      "Degree": "",
      "Institution": "",
      "Graduation Year": 0,
      "Certification": false
    }}
  ]
}}

Extract information from the resume as follows:
- Extract the candidate's full name and store it in "name".
- Extract the phone number and store it in "phone". Include the country code if present (e.g., +91).
- Under "Skills", categorize into "Technical Skills", "Soft Skills", and "Tools".
- Under "Work Experience", include each job with "Start Date" and "End Date" in "YYYY-MM" format. Use "Present" for ongoing roles. Only include dates with valid 4-digit years (e.g., 2023).
- Under "Projects", list each project with its "Title", "Description", and "Technologies".
- Under "Education", include "Graduation Year" only if it is a valid 4-digit year.
- Infer technologies for both "Work Experience" and "Projects":
  - If "Jupyter Notebook", "Google Collab", "Flask", or "Jupyter" is mentioned, include "Python".
  - If React is mentioned, include "JavaScript".
  - If terms like "deep learning", "reinforcement learning", "AIML", or "AI" are mentioned, include "Artificial Intelligence" and "Machine Learning".
  - If terms like "data structures", "algorithms", or "programming" are mentioned, include "Python" or "Java" if specified.
- Include skills like "Excel Pivoting" and "GitHub" in "Technical Skills" if mentioned.

Resume:
{resume_text}
        """
        response = model.generate_content(prompt)
        logger.debug("Successfully received response from Gemini API")
        return response.text
    except Exception as e:
        logger.warning(f"Gemini API failed: {str(e)}. Falling back to spaCy parsing.")
        return fallback_resume_parsing(resume_text)

def parse_json_output(json_string):
    """Parse JSON string from Gemini API output."""
    try:
        if not json_string:
            logger.error("Empty JSON string received")
            return None
        cleaned = json_string.strip().removeprefix("```json").removesuffix("```").strip()
        result = json.loads(cleaned)
        logger.debug("Successfully parsed JSON from output")
        return result
    except json.JSONDecodeError as e:
        logger.error(f"JSON parsing error: {str(e)}, JSON string: {json_string}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error in parse_json_output: {str(e)}")
        return None

def normalize_phone_number(phone, country_code="IN"):
    """Normalize phone number using phonenumbers library."""
    if not phone:
        logger.warning("Phone number is empty")
        return None
    try:
        parsed = phonenumbers.parse(phone, country_code)
        if not phonenumbers.is_valid_number(parsed):
            logger.error(f"Invalid phone number: {phone}")
            raise ValueError("Invalid phone number format")
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except phonenumbers.NumberParseException as e:
        logger.error(f"Phone number parsing error: {str(e)}")
        raise ValueError("Failed to parse phone number")

def validate_url(url, platform):
    """Validate LinkedIn or GitHub URL format."""
    patterns = {
        "linkedin": r'^https?://(www\.)?linkedin\.com/in/[\w\-]+/?$',
        "github": r'^https?://(www\.)?github\.com/[\w\-]+/?$'
    }
    if not url or not re.match(patterns.get(platform, r''), url):
        logger.error(f"Invalid {platform} URL: {url}")
        return False
    return True

def compare_strings(str1, str2, threshold=0.7):
    """Compare two strings for similarity."""
    if not str1 or not str2:
        logger.warning(f"String comparison failed: str1={str1}, str2={str2}")
        return False
    str1 = str1.lower().strip()
    str2 = str2.lower().strip()
    similarity = difflib.SequenceMatcher(None, str1, str2).ratio()
    logger.debug(f"String comparison: str1={str1}, str2={str2}, similarity={similarity:.2f}")
    return similarity >= threshold

def calculate_total_experience(work_experience):
    """Calculate total work experience in years, handling partial overlaps."""
    if not work_experience:
        logger.warning("No work experience provided for calculation")
        return 0

    intervals = []
    current_date = datetime.now(timezone.utc)

    for exp in work_experience:
        start_date_str = exp.get('Start Date', '')
        end_date_str = exp.get('End Date', '')

        try:
            if not re.match(r'^\d{4}(-\d{2})?$', start_date_str) or not (
                end_date_str.lower() == 'present' or re.match(r'^\d{4}(-\d{2})?$', end_date_str)
            ):
                logger.warning(f"Invalid date format: Start={start_date_str}, End={end_date_str}")
                continue

            if end_date_str.lower() == 'present':
                end_date = current_date
            else:
                if len(end_date_str) == 4:
                    end_date = datetime(int(end_date_str), 12, 31, tzinfo=timezone.utc)
                else:
                    end_date = datetime.strptime(end_date_str, '%Y-%m').replace(tzinfo=timezone.utc)

            if len(start_date_str) == 4:
                start_date = datetime(int(start_date_str), 1, 1, tzinfo=timezone.utc)
            else:
                start_date = datetime.strptime(start_date_str, '%Y-%m').replace(tzinfo=timezone.utc)

            if start_date > end_date:
                logger.warning(f"Invalid date range: Start={start_date_str} > End={end_date_str}")
                continue

            intervals.append((start_date, end_date))
        except ValueError as e:
            logger.warning(f"Error parsing dates: Start={start_date_str}, End={end_date_str}, Error={str(e)}")
            continue

    if not intervals:
        logger.warning("No valid date intervals for experience calculation")
        return 0

    # Sort intervals by start date
    intervals.sort(key=lambda x: x[0])

    # Handle partial overlaps by merging intervals
    merged = []
    for start, end in intervals:
        if not merged:
            merged.append((start, end))
        else:
            last_start, last_end = merged[-1]
            if start <= last_end:
                # Overlap or adjacent: extend the end date if necessary
                merged[-1] = (last_start, max(last_end, end))
            else:
                merged.append((start, end))

    # Calculate total unique days
    total_days = 0
    for start, end in merged:
        total_days += (end - start).days

    total_years = total_days / 365.25
    result = round(total_years)
    if result < 0:
        logger.error(f"Calculated negative experience: {result} years")
        return 0
    logger.debug(f"Calculated total experience: {result} years")
    return result

def infer_proficiency(skill, work_experience, education, projects):
    """Infer proficiency score for a skill based on resume data."""
    score = 0
    skill_lower = skill.lower()
    strong_keywords = ["developed", "built", "implemented", "designed", "used", "created", "led", "integrated", "deployed"]
    related_terms = {
        "artificial intelligence": ["ai", "aiml", "reinforcement learning", "deep learning"],
        "machine learning": ["ml", "aiml", "deep learning", "reinforcement learning"],
        "python": ["jupyter notebook", "google collab", "flask", "jupyter"],
        "javascript": ["react", "ajax"]
    }

    for exp in work_experience:
        combined = (str(exp.get("Title", "")) + " " + str(exp.get("Description", "")) + " " + str(exp.get("Technologies", ""))).lower()
        skill_found = False
        if skill_lower in combined:
            score += 2
            skill_found = True
        for related_term in related_terms.get(skill_lower, []):
            if related_term in combined:
                score += 2
                skill_found = True
                break
        if skill_found and any(kw in combined for kw in strong_keywords):
            score += 2
        if combined.count(skill_lower) >= 2:
            score += 1

    for proj in projects:
        proj_text = (str(proj.get("Title", "")) + " " + str(proj.get("Description", "")) + " " + str(proj.get("Technologies", ""))).lower()
        skill_found = False
        if skill_lower in proj_text:
            score += 2
            skill_found = True
        for related_term in related_terms.get(skill_lower, []):
            if related_term in proj_text:
                score += 2
                skill_found = True
                break
        if skill_found and any(kw in proj_text for kw in strong_keywords):
            score += 2
        if proj_text.count(skill_lower) >= 2:
            score += 1

    for edu in education:
        edu_text = (str(edu.get("Degree", "")) + " " + str(edu.get("Institution", ""))).lower()
        skill_found = False
        if skill_lower in edu_text:
            score += 1
            skill_found = True
        for related_term in related_terms.get(skill_lower, []):
            if related_term in edu_text:
                score += 1
                skill_found = True
                break
        if skill_found and "certification" in edu_text:
            score += 2

    if score >= 5:
        proficiency = 8
    elif score >= 2:
        proficiency = 6
    else:
        proficiency = 4
    logger.debug(f"Inferred proficiency for {skill}: {proficiency}")
    return proficiency

def verify_faces(profile_file, webcam_file):
    try:
        result = compare_faces_from_files(profile_file, webcam_file)
        confidence = result.get("confidence")
        if confidence is not None:
            similarity = max(0.0, 100 - float(confidence))
        else:
            similarity = 0.0
        return {
            'verified': result.get("verified", False),
            'similarity': round(similarity, 2),
            'pending_verification': not result.get("verified", False)  # Flag for pending manual review
        }
    except Exception as e:
        logger.error(f"Face comparison error: {str(e)}")
        return {'verified': False, 'similarity': 0.0, 'pending_verification': True}

@candidate_api_bp.route('/auth/send-otp', methods=['POST'])
@limiter.limit("5 per minute")  # Rate limit OTP requests
def send_otp():
    """Send OTP to candidate's email."""
    data = request.get_json()
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'error': 'Missing user_id'}), 400

    candidate = Candidate.query.filter_by(user_id=user_id).first_or_404()
    if not candidate.email:
        return jsonify({'error': 'No email associated with this candidate'}), 400

    otp = generate_otp()
    session['otp'] = otp
    session['otp_expiry'] = (datetime.now(timezone.utc) + timedelta(minutes=10)).timestamp()
    session['otp_user_id'] = user_id

    if send_otp_email(candidate.email, otp):
        return jsonify({'message': 'OTP sent to your email'}), 200
    else:
        return jsonify({'error': 'Failed to send OTP. Please try again.'}), 500

@candidate_api_bp.route('/auth/verify-otp', methods=['POST'])
def verify_otp():
    """Verify OTP entered by candidate."""
    data = request.get_json()
    user_id = data.get('user_id')
    otp = data.get('otp')

    if not user_id or not otp:
        return jsonify({'error': 'Missing user_id or OTP'}), 400

    if 'otp' not in session or 'otp_expiry' not in session or 'otp_user_id' not in session:
        return jsonify({'error': 'No OTP session found. Please request a new OTP.'}), 400

    if session['otp_user_id'] != user_id:
        return jsonify({'error': 'Invalid user for this OTP session.'}), 400

    if datetime.now(timezone.utc).timestamp() > session['otp_expiry']:
        session.pop('otp', None)
        session.pop('otp_expiry', None)
        session.pop('otp_user_id', None)
        return jsonify({'error': 'OTP has expired. Please request a new OTP.'}), 400

    if session['otp'] != otp:
        return jsonify({'error': 'Invalid OTP.'}), 400

    candidate = Candidate.query.filter_by(user_id=user_id).first_or_404()
    candidate.requires_otp_verification = False
    session['otp_verified'] = True
    session.pop('otp', None)
    session.pop('otp_expiry', None)
    session.pop('otp_user_id', None)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error clearing requires_otp_verification: {str(e)}")
        return jsonify({'error': 'Failed to verify OTP due to a server error.'}), 500

    return jsonify({'message': 'OTP verified successfully'}), 200

@candidate_api_bp.route('/profile/<int:user_id>', methods=['GET'])
def get_profile_by_user(user_id):
    candidate = Candidate.query.filter_by(user_id=user_id).first_or_404()

    skills = [
        {
            'skill_id': cs.skill_id,
            'skill_name': cs.skill.name,
            'category': cs.skill.category,
            'proficiency': cs.proficiency
        }
        for cs in candidate.candidate_skills
    ]

    return jsonify({
        'candidate_id': candidate.candidate_id,
        'name': candidate.name,
        'email': candidate.email,
        'phone': candidate.phone,
        'location': candidate.location,
        'linkedin': candidate.linkedin,
        'github': candidate.github,
        'degree': candidate.degree.degree_name if candidate.degree else None,
        'degree_branch': candidate.branch.branch_name if candidate.branch else None,
        'branch_id': candidate.degree_branch if candidate.degree_branch else None,
        'degree_id': candidate.degree_id,
        'passout_year': candidate.passout_year,
        'years_of_experience': candidate.years_of_experience,
        'resume': candidate.resume,
        'profile_picture': candidate.profile_picture,
        'camera_image': candidate.camera_image,
        'is_profile_complete': candidate.is_profile_complete,
        'skills': skills,
        'requires_otp_verification': candidate.requires_otp_verification
    })

@candidate_api_bp.route('/degrees', methods=['GET'])
def get_degrees():
    """Retrieve the list of available degrees."""
    degrees = Degree.query.all()
    return jsonify([
        {'degree_id': degree.degree_id, 'degree_name': degree.degree_name}
        for degree in degrees
    ])

@candidate_api_bp.route('/branches', methods=['GET'])
def get_branches():
    """Retrieve the list of available degree branches."""
    branches = DegreeBranch.query.all()
    return jsonify([
        {'branch_id': branch.branch_id, 'branch_name': branch.branch_name}
        for branch in branches
    ])

@candidate_api_bp.route('/verify-face', methods=['POST'])
def verify_face():
    try:
        webcam_image_file = request.files.get('webcam_image')
        if 'user_id' not in session or not webcam_image_file:
            return jsonify({'success': False, 'error': 'No user logged in or webcam image'}), 400

        candidate = Candidate.query.filter_by(user_id=session['user_id']).first()
        if not candidate or not candidate.profile_picture:
            return jsonify({'success': False, 'error': 'User or profile picture not found'}), 404

        profile_image_url = f'https://storage.googleapis.com/{os.getenv("GCS_BUCKET_NAME", "gen-ai-quiz")}/uploads/{candidate.profile_picture}'
        response = requests.get(profile_image_url)
        profile_image = BytesIO(response.content)
        profile_image.name = 'profile.jpg'

        profile_image.seek(0)
        webcam_image_file.seek(0)

        result = verify_faces(profile_image, webcam_image_file)
        if result['pending_verification']:
            candidate.pending_face_verification = True  # Assumes new column in Candidate model
            db.session.commit()
            return jsonify({
                'success': False,
                'message': 'Face verification failed. Profile update pending manual review.',
                'similarity': result['similarity']
            }), 200
        return jsonify({
            'success': result['verified'],
            'similarity': result['similarity']
        }), 200
    except Exception as e:
        logger.error(f"Face verification API error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@candidate_api_bp.route('/profile/<int:user_id>', methods=['POST'])
def update_profile(user_id):
    """Update candidate profile with robust validation and fallback."""
    candidate = Candidate.query.filter_by(user_id=user_id).first_or_404()

    logger.debug(f"📸 Requires OTP Verification: {candidate.requires_otp_verification}, Session OTP Verified: {session.get('otp_verified')}")

    if candidate.requires_otp_verification and session.get('otp_verified', False) is not True:
        logger.debug(f"❌ OTP verification required but not verified for user_id={user_id}")
        return jsonify({'error': 'OTP verification required. Please verify OTP before updating profile.'}), 403

    form_name = request.form.get('name')
    form_phone = request.form.get('phone')
    form_experience = request.form.get('years_of_experience')
    form_location = request.form.get('location')
    form_linkedin = request.form.get('linkedin')
    form_github = request.form.get('github')
    form_degree_id = request.form.get('degree_id')
    form_degree_branch = request.form.get('degree_branch')
    form_passout_year = request.form.get('passout_year')
    resume_file = request.files.get('resume')
    profile_pic_file = request.files.get('profile_picture')
    webcam_image_file = request.files.get('webcam_image')
    form_country_code = request.form.get('country_code')  # Added to retrieve country code from form

    logger.debug(f"Form data: name={form_name}, phone={form_phone}, location={form_location}, linkedin={form_linkedin}, github={form_github}, degree_id={form_degree_id}, degree_branch={form_degree_branch}, passout_year={form_passout_year}, experience={form_experience}, country_code={form_country_code}")

    if not all([form_name, form_phone, form_experience, form_location, form_linkedin, form_github, form_degree_id]):
        logger.error(f"Missing required fields: name={form_name}, phone={form_phone}, experience={form_experience}, location={form_location}, linkedin={form_linkedin}, github={form_github}, degree_id={form_degree_id}")
        return jsonify({'error': 'All fields (name, phone, experience, location, LinkedIn, GitHub, degree) are required.'}), 400

    try:
        form_experience = float(form_experience)
        if form_experience < 0:
            logger.error(f"Invalid years_of_experience: {form_experience}")
            return jsonify({'error': 'Years of experience must be non-negative.'}), 400
        form_degree_id = int(form_degree_id)
        form_degree_branch = int(form_degree_branch) if form_degree_branch else None
        form_passout_year = int(form_passout_year) if form_passout_year else None
        current_year = datetime.now(timezone.utc).year
        if form_passout_year and not (1900 <= form_passout_year <= current_year + 5):
            logger.error(f"Invalid passout_year: {form_passout_year}")
            return jsonify({'error': f'Passout year must be between 1900 and {current_year + 5}.'}), 400
    except ValueError as e:
        logger.error(f"Type conversion error: experience={form_experience}, degree_id={form_degree_id}, branch={form_degree_branch}, passout_year={form_passout_year}, error={str(e)}")
        return jsonify({'error': 'Years of experience must be a number, and degree_id/degree_branch/passout_year must be valid integers.'}), 400

    if not Degree.query.get(form_degree_id):
        logger.error(f"Invalid degree_id: {form_degree_id}")
        return jsonify({'error': 'Invalid degree selected.'}), 400
    if form_degree_branch and not DegreeBranch.query.get(form_degree_branch):
        logger.error(f"Invalid degree_branch: {form_degree_branch}")
        return jsonify({'error': 'Invalid degree branch selected.'}), 400

    # Validate URLs
    if not validate_url(form_linkedin, "linkedin"):
        return jsonify({'error': 'Invalid LinkedIn URL format.'}), 400
    if not validate_url(form_github, "github"):
        return jsonify({'error': 'Invalid GitHub URL format.'}), 400

    # Normalize phone numbers with robust country code handling
    try:
        country_code = form_country_code if form_country_code and form_country_code in [c.alpha_2 for c in pycountry.countries] else get_country_code(form_location)
        normalized_form_phone = normalize_phone_number(form_phone, country_code)
        resume_phone = None
        if resume_file:
            resume_text = extract_text_from_pdf(resume_file)
            parsed_data = parse_json_output(analyze_resume(resume_text))
            if parsed_data:
                resume_phone = parsed_data.get('phone')
                if resume_phone:
                    normalized_resume_phone = normalize_phone_number(resume_phone, country_code)
                    if normalized_resume_phone and normalized_form_phone != normalized_resume_phone:
                        logger.error(f"Phone mismatch: form_phone={normalized_form_phone}, resume_phone={normalized_resume_phone}")
                        return jsonify({'error': 'Phone number in resume does not match the provided phone number.'}), 400
    except ValueError as e:
        logger.error(f"Phone normalization error: {str(e)}")
        return jsonify({'error': f'Failed to parse phone number: {str(e)}'}), 400

    # Process resume and validate against form data
    parsed_data = None
    resume_filename = candidate.resume
    resume_json_entry = ResumeJson.query.filter_by(candidate_id=candidate.candidate_id).order_by(ResumeJson.created_at.desc()).first()

    if resume_file:
        try:
            logger.debug(f"Processing new resume file for candidate_id={candidate.candidate_id}")
            resume_text = extract_text_from_pdf(resume_file)
            gemini_output = analyze_resume(resume_text)
            parsed_data = parse_json_output(gemini_output) if gemini_output else None
            if not parsed_data:
                logger.warning("Resume parsing failed; using fallback data")
                parsed_data = {
                    'name': form_name,
                    'phone': form_phone,
                    'Work Experience': [],
                    'Skills': {'Technical Skills': [], 'Soft Skills': [], 'Tools': []},
                    'Projects': [],
                    'Education': []
                }

            cleaned_resume_string = json.dumps(parsed_data)
            if resume_json_entry:
                resume_json_entry.raw_resume = cleaned_resume_string
            else:
                resume_json_entry = ResumeJson(
                    candidate_id=candidate.candidate_id,
                    raw_resume=cleaned_resume_string
                )
                db.session.add(resume_json_entry)

            resume_file.seek(0)
            resume_filename = f"resumes/{candidate.candidate_id}_{resume_file.filename}"
            try:
                resume_url = upload_to_gcs(resume_file, resume_filename, content_type='application/pdf')
                candidate.resume = resume_filename
                logger.debug(f"Uploaded new resume to GCS: {resume_filename}")
            except GoogleCloudError as e:
                logger.error(f"GCS upload error: {str(e)}")
                if "Quota exceeded" in str(e):
                    return jsonify({'error': 'Storage quota exceeded. Please try again later.'}), 429
                elif "Unauthorized" in str(e):
                    return jsonify({'error': 'Storage authentication failed. Please contact support.'}), 500
                else:
                    return jsonify({'error': 'Failed to upload resume to storage. Please try again.'}), 500
        except ValueError as e:
            logger.error(f"Resume processing error: {str(e)}")
            return jsonify({'error': str(e)}), 400
    elif candidate.resume:
        if resume_json_entry and resume_json_entry.raw_resume:
            logger.debug(f"Raw resume type: {type(resume_json_entry.raw_resume)}")
            if isinstance(resume_json_entry.raw_resume, dict):
                parsed_data = resume_json_entry.raw_resume
                logger.debug(f"Using existing ResumeJson data (already a dict) for candidate_id={candidate.candidate_id}")
            elif isinstance(resume_json_entry.raw_resume, str):
                try:
                    parsed_data = json.loads(resume_json_entry.raw_resume)
                    logger.debug(f"Using existing ResumeJson data (parsed from string) for candidate_id={candidate.candidate_id}")
                except json.JSONDecodeError as e:
                    logger.warning(f"Failed to parse existing ResumeJson data: {str(e)}")
                    parsed_data = None
            else:
                logger.warning(f"Unexpected raw_resume type: {type(resume_json_entry.raw_resume)}")
                parsed_data = None

        if not parsed_data:
            try:
                logger.debug(f"Fetching existing resume from GCS for candidate_id={candidate.candidate_id}")
                storage_client = storage.Client()
                bucket = storage_client.bucket(os.getenv("GCS_BUCKET_NAME", "gen-ai-quiz"))
                blob = bucket.get_blob(f"uploads/{candidate.resume}")
                if not blob:
                    logger.error(f"Resume not found in GCS: uploads/{candidate.resume}")
                    return jsonify({'error': 'Existing resume not found in storage. Please upload a new resume.'}), 404

                resume_content = BytesIO()
                blob.download_to_file(resume_content)
                resume_content.seek(0)
                logger.debug(f"Downloaded resume from GCS: uploads/{candidate.resume}")

                resume_text = extract_text_from_pdf(resume_content)
                gemini_output = analyze_resume(resume_text)
                parsed_data = parse_json_output(gemini_output) if gemini_output else None
                if not parsed_data:
                    logger.warning("Failed to parse existing resume; using form data as fallback")
                    parsed_data = {
                        'name': form_name,
                        'phone': form_phone,
                        'Work Experience': [],
                        'Skills': {'Technical Skills': [], 'Soft Skills': [], 'Tools': []},
                        'Projects': [],
                        'Education': []
                    }

                cleaned_resume_string = json.dumps(parsed_data)
                if resume_json_entry:
                    resume_json_entry.raw_resume = cleaned_resume_string
                else:
                    resume_json_entry = ResumeJson(
                        candidate_id=candidate.candidate_id,
                        raw_resume=cleaned_resume_string
                    )
                    db.session.add(resume_json_entry)
            except Exception as e:
                logger.error(f"Failed to process existing resume from GCS: {str(e)}")
                parsed_data = {
                    'name': form_name,
                    'phone': form_phone,
                    'Work Experience': [],
                    'Skills': {'Technical Skills': [], 'Soft Skills': [], 'Tools': []},
                    'Projects': [],
                    'Education': []
                }
    else:
        logger.error("No resume provided and no existing resume found")
        return jsonify({'error': 'A resume file is required.'}), 400

    resume_name = parsed_data.get('name', '') if parsed_data else ''
    resume_phone = parsed_data.get('phone', '') if parsed_data else ''
    if resume_name and not compare_strings(form_name, resume_name, threshold=0.7):
        logger.error(f"Name mismatch: form_name={form_name}, resume_name={resume_name}")
        return jsonify({'error': 'Name in resume does not match the provided name.'}), 400

    # Check for location change to enforce OTP verification
    if candidate.location and form_location and not compare_strings(candidate.location, form_location):
        candidate.requires_otp_verification = True
        db.session.commit()
        logger.warning(f"Location change detected for user_id: {user_id}. OTP verification required.")
        return jsonify({'error': 'Location changed. OTP verification required.'}), 403

    if form_experience != 0:
        resume_experience = calculate_total_experience(parsed_data.get('Work Experience', []) if parsed_data else [])
        if resume_experience == 0 and parsed_data and parsed_data.get('Work Experience'):
            logger.warning("Resume experience calculation failed; using form experience")
        elif form_experience > resume_experience:
            min_allowed = 0.8 * form_experience
            max_allowed = 1.2 * form_experience
            if not (min_allowed <= resume_experience <= max_allowed):
                logger.warning(f"Experience mismatch: form_experience={form_experience}, resume_experience={resume_experience}")
                return jsonify({
                    'error': f'Years of experience in resume ({resume_experience}) does not match form input ({form_experience}). It should be within 80% to 120% of the form value when form experience is higher.'
                }), 400
        else:
            logger.debug(f"Form experience ({form_experience}) <= resume experience ({resume_experience}); skipping range validation")
    else:
        logger.debug("Form experience is 0; skipping resume experience validation")

    candidate.name = form_name
    candidate.phone = normalized_form_phone
    candidate.years_of_experience = form_experience
    candidate.location = form_location
    candidate.linkedin = form_linkedin
    candidate.github = form_github
    candidate.degree_id = form_degree_id
    candidate.degree_branch = form_degree_branch
    candidate.passout_year = form_passout_year
    candidate.is_profile_complete = True

    # Process skills within a transaction
    try:
        with db.session.begin_nested():
            if parsed_data and parsed_data.get('Skills'):
                skills_data = parsed_data.get("Skills", {})
                work_experience = parsed_data.get("Work Experience", [])
                projects = parsed_data.get("Projects", [])
                education = parsed_data.get("Education", [])

                all_skills = (
                    skills_data.get("Technical Skills", []) +
                    skills_data.get("Soft Skills", []) +
                    skills_data.get("Tools", [])
                )

                for skill_name in set(all_skills):
                    skill_name = skill_name.strip()
                    if not skill_name:
                        continue

                    skill = Skill.query.filter_by(name=skill_name).first()
                    if not skill:
                        skill = Skill(name=skill_name, category='Technical' if skill_name in skills_data['Technical Skills'] else 'Soft' if skill_name in skills_data['Soft Skills'] else 'Tool')
                        db.session.add(skill)
                        db.session.flush()

                    proficiency = infer_proficiency(skill_name, work_experience, education, projects)
                    candidate_skill = CandidateSkill.query.filter_by(candidate_id=candidate.candidate_id, skill_id=skill.skill_id).first()
                    if not candidate_skill:
                        candidate_skill = CandidateSkill(
                            candidate_id=candidate.candidate_id,
                            skill_id=skill.skill_id,
                            proficiency=proficiency
                        )
                        db.session.add(candidate_skill)
                    else:
                        candidate_skill.proficiency = proficiency

            if profile_pic_file:
                try:
                    profile_filename = f"profiles/{candidate.candidate_id}_{profile_pic_file.filename}"
                    profile_url = upload_to_gcs(profile_pic_file, profile_filename, content_type=profile_pic_file.content_type)
                    candidate.profile_picture = profile_filename
                except GoogleCloudError as e:
                    logger.error(f"GCS upload error for profile picture: {str(e)}")
                    if "Quota exceeded" in str(e):
                        return jsonify({'error': 'Storage quota exceeded for profile picture. Please try again later.'}), 429
                    elif "Unauthorized" in str(e):
                        return jsonify({'error': 'Storage authentication failed for profile picture. Please contact support.'}), 500
                    else:
                        return jsonify({'error': 'Failed to upload profile picture to storage. Please try again.'}), 500

            if webcam_image_file:
                try:
                    webcam_filename = f"webcam/{candidate.candidate_id}_{webcam_image_file.filename}"
                    webcam_url = upload_to_gcs(webcam_image_file, webcam_filename, content_type=webcam_image_file.content_type)
                    candidate.camera_image = webcam_filename
                except GoogleCloudError as e:
                    logger.error(f"GCS upload error for webcam image: {str(e)}")
                    if "Quota exceeded" in str(e):
                        return jsonify({'error': 'Storage quota exceeded for webcam image. Please try again later.'}), 429
                    elif "Unauthorized" in str(e):
                        return jsonify({'error': 'Storage authentication failed for webcam image. Please contact support.'}), 500
                    else:
                        return jsonify({'error': 'Failed to upload webcam image to storage. Please try again.'}), 500

        db.session.commit()
        session.pop('otp_verified', None)
        session.pop('enforce_otp_verification', None)
        session.pop('otp', None)
        session.pop('otp_expiry', None)
        session.pop('otp_user_id', None)
        logger.debug(f"✅ Profile updated successfully for candidate_id={candidate.candidate_id}")
        return jsonify({
            'message': 'Profile updated successfully',
            'parsed_data': {
                'name': parsed_data.get('name', '') if parsed_data else '',
                'phone': parsed_data.get('phone', '') if parsed_data else ''
            }
        }), 200
    except IntegrityError as e:
        db.session.rollback()
        logger.error(f"Database integrity error: {str(e)}")
        if 'phone' in str(e).lower():
            return jsonify({'error': 'This phone number is already in use.'}), 400
        elif 'linkedin' in str(e).lower():
            return jsonify({'error': 'This LinkedIn profile is already in use.'}), 400
        elif 'github' in str(e).lower():
            return jsonify({'error': 'This GitHub profile is already in use.'}), 400
        else:
            return jsonify({'error': 'Failed to update profile due to a database constraint. Please check your inputs.'}), 400
    except Exception as e:
        db.session.rollback()
        logger.error(f"Unexpected error during profile update: {str(e)}")
        return jsonify({'error': f'Failed to update profile: {str(e)}'}), 500

@candidate_api_bp.route('/eligible-assessments/<int:user_id>', methods=['GET'])
def get_eligible_assessments(user_id):
    """Retrieve eligible and all assessments for a candidate."""
    candidate = Candidate.query.filter_by(user_id=user_id).first_or_404()

    current_time = datetime.now(pytz.UTC)

    assessments = JobDescription.query.options(
        joinedload(JobDescription.required_skills).joinedload(RequiredSkill.skill),
        joinedload(JobDescription.degree),
        joinedload(JobDescription.branch)
    ).all()
    eligible_assessments = []
    all_assessments = []
    attempted_assessments = set()

    attempts = AssessmentAttempt.query.filter_by(candidate_id=candidate.candidate_id).all()
    for attempt in attempts:
        if attempt.status in ['started', 'completed']:
            attempted_assessments.add(attempt.job_id)

    for assessment in assessments:
        schedule_start = assessment.schedule_start
        if schedule_start and schedule_start.tzinfo is None:
            logger.warning(f"Naive datetime detected for schedule_start: {schedule_start}. Assuming UTC.")
            schedule_start = schedule_start.replace(tzinfo=pytz.UTC)
        schedule_end = assessment.schedule_end
        if schedule_end and schedule_end.tzinfo is None:
            logger.warning(f"Naive datetime detected for schedule_end: {schedule_end}. Assuming UTC.")
            schedule_end = schedule_end.replace(tzinfo=pytz.UTC)

        if schedule_end and current_time > schedule_end:
            has_attempt = AssessmentAttempt.query.filter_by(
                candidate_id=candidate.candidate_id,
                job_id=assessment.job_id
            ).first() is not None
            if not has_attempt:
                continue

        experience_match = (
            assessment.experience_min <= candidate.years_of_experience <= assessment.experience_max
        )
        degree_match = (
            not assessment.degree_required or
            (candidate.degree_id and assessment.degree_required == candidate.degree_id)
        )
        branch_match = (
            not assessment.degree_branch or
            (candidate.degree_branch and assessment.degree_branch == candidate.degree_branch)
        )
        passout_year_match = (
            not assessment.passout_year_required or
            not assessment.passout_year or
            (candidate.passout_year and assessment.passout_year == candidate.passout_year)
        )

        recruiter = Recruiter.query.filter_by(recruiter_id=assessment.recruiter_id).first()
        logo = recruiter.logo if recruiter else None

        assessment_data = {
            'job_id': assessment.job_id,
            'job_title': assessment.job_title,
            'company': assessment.company,
            'logo': logo,
            'experience_min': assessment.experience_min,
            'experience_max': assessment.experience_max,
            'degree_required': assessment.degree.degree_name if assessment.degree else None,
            'degree_branch': assessment.branch.branch_name if assessment.branch else None,
            'passout_year': assessment.passout_year,
            'passout_year_required': assessment.passout_year_required,
            'schedule_start': schedule_start.isoformat() if schedule_start else None,
            'schedule_end': schedule_end.isoformat() if schedule_end else None,
            'duration': assessment.duration,
            'num_questions': assessment.num_questions,
            'job_description': assessment.job_description if hasattr(assessment, 'job_description') else None,
            'is_registered': AssessmentRegistration.query.filter_by(
                candidate_id=candidate.candidate_id,
                job_id=assessment.job_id
            ).first() is not None,
            'skills': [
                {'name': rs.skill.name, 'priority': rs.priority}
                for rs in assessment.required_skills
            ],
            'is_eligible': experience_match and degree_match and branch_match and passout_year_match and assessment.job_id not in attempted_assessments
        }

        all_assessments.append(assessment_data)
        if assessment_data['is_eligible'] and candidate.is_profile_complete:
            eligible_assessments.append(assessment_data)

    attempted_assessments_data = []
    for attempt in attempts:
        if attempt.status in ['started', 'completed']:
            job = JobDescription.query.get(attempt.job_id)
            if job:
                attempted_assessments_data.append({
                    'job_id': job.job_id,
                    'job_title': job.job_title,
                    'company': job.company,
                    'logo': logo,
                    'attempt_id': attempt.attempt_id,
                    'status': attempt.status,
                    'attempt_date': attempt.start_time.isoformat() if attempt.start_time else None
                })

    response = {
        'eligible_assessments': eligible_assessments,
        'all_assessments': all_assessments,
        'attempted_assessments': attempted_assessments_data
    }
    return jsonify(response), 200

@candidate_api_bp.route('/register-assessment', methods=['POST'])
def register_assessment():
    """Register a candidate for an assessment."""
    data = request.get_json()
    candidate_id = data.get('candidate_id')
    job_id = data.get('job_id')

    if not candidate_id or not job_id:
        return jsonify({'error': 'Missing candidate_id or job_id'}), 400

    candidate = Candidate.query.filter_by(user_id=candidate_id).first_or_404()
    job = JobDescription.query.get_or_404(job_id)

    experience_match = (
        job.experience_min <= candidate.years_of_experience <= job.experience_max
    )
    degree_match = (
        not job.degree_required or
        (candidate.degree_id and job.degree_required == candidate.degree_id)
    )
    branch_match = (
        not job.degree_branch or
        (candidate.degree_branch and job.degree_branch == candidate.degree_branch)
    )
    passout_year_match = (
        not job.passout_year_required or
        not job.passout_year or
        (candidate.passout_year and job.passout_year == candidate.passout_year)
    )

    if not (experience_match and degree_match and branch_match and passout_year_match):
        return jsonify({
            'error': 'You are not eligible for this job. Please update your profile to meet the requirements.',
            'requirements': {
                'experience_min': job.experience_min,
                'experience_max': job.experience_max,
                'degree_required': job.degree.degree_name if job.degree else None,
                'degree_branch': job.branch.branch_name if job.branch else None,
                'passout_year': job.passout_year if job.passout_year_required else None
            }
        }), 403

    existing_registration = AssessmentRegistration.query.filter_by(
        candidate_id=candidate.candidate_id,
        job_id=job_id
    ).first()
    if existing_registration:
        return jsonify({'error': 'Already registered for this assessment'}), 400

    registration = AssessmentRegistration(
        candidate_id=candidate.candidate_id,
        job_id=job_id,
        registration_date=datetime.now(timezone.utc)
    )
    db.session.add(registration)
    try:
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to register: Invalid data ({str(e)})'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to register: {str(e)}'}), 500

    return jsonify({'message': 'Successfully registered for assessment'}), 200

@candidate_api_bp.route('/start-assessment', methods=['POST'])
def start_assessment():
    """Start a new assessment attempt for a candidate."""
    data = request.get_json()
    user_id = data.get('user_id')
    job_id = data.get('job_id')

    candidate = Candidate.query.filter_by(user_id=user_id).first_or_404()
    candidate_id = candidate.candidate_id

    if not candidate_id or not job_id:
        return jsonify({'error': 'Missing candidate_id or job_id'}), 400

    registration = AssessmentRegistration.query.filter_by(
        candidate_id=candidate_id,
        job_id=job_id
    ).first()
    if not registration:
        return jsonify({'error': 'Candidate not registered for this assessment'}), 403

    job = JobDescription.query.get_or_404(job_id)
    current_time = datetime.now(timezone.utc)
    schedule_start = job.schedule_start
    if schedule_start and schedule_start.tzinfo is None:
        logger.warning(f"Naive datetime detected for schedule_start: {schedule_start}. Assuming UTC.")
        schedule_start = schedule_start.replace(tzinfo=pytz.UTC)
    schedule_end = job.schedule_end
    if schedule_end and schedule_end.tzinfo is None:
        logger.warning(f"Naive datetime detected for schedule_end: {schedule_end}. Assuming UTC.")
        schedule_end = schedule_end.replace(tzinfo=pytz.UTC)

    if schedule_start and current_time < schedule_start:
        return jsonify({'error': f'Assessment not yet started. Scheduled for {schedule_start.isoformat()}'}), 403
    if schedule_end and current_time > schedule_end:
        return jsonify({'error': f'Assessment period has ended. Ended at {schedule_end.isoformat()}'}), 403

    existing_attempt = AssessmentAttempt.query.filter_by(
        candidate_id=candidate_id,
        job_id=job_id,
        status='started'
    ).first()
    if existing_attempt:
        return jsonify({'attempt_id': existing_attempt.attempt_id}), 200

    attempt = AssessmentAttempt(
        candidate_id=candidate_id,
        job_id=job_id,
        start_time=datetime.now(timezone.utc),
        status='started'
    )
    db.session.add(attempt)
    db.session.commit()

    return jsonify({'attempt_id': attempt.attempt_id}), 200
