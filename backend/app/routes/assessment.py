from flask import Blueprint, jsonify, request, session
import logging
from datetime import datetime, timezone, timedelta
import random
import os
from pathlib import Path
import numpy as np
from app import db
from app.models.candidate import Candidate
from app.models.job import JobDescription
from app.models.assessment_attempt import AssessmentAttempt
from app.models.required_skill import RequiredSkill
from app.models.skill import Skill
from app.models.candidate_skill import CandidateSkill
from app.models.mcq import MCQ
from app.models.assessment_registration import AssessmentRegistration
from app.models.assessment_state import AssessmentState
from app.models.proctoring_violation import ProctoringViolation
from app.services.question_batches import generate_single_question
from google.cloud import storage
from app.utils.gcs_upload import upload_to_gcs
from app.utils.face import compare_faces_from_files
from io import BytesIO
import timeout_decorator
import google.api_core.exceptions
import requests
import json

assessment_api_bp = Blueprint('assessment_api', __name__, url_prefix='/api/assessment')

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configure upload directory
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'static', 'uploads'))
SNAPSHOT_DIR = os.path.join(PROJECT_ROOT, 'snapshots')
VIOLATOIN_DIR = os.path.join(PROJECT_ROOT, 'violations')
WEBCAM_DIR = os.path.join(PROJECT_ROOT, 'webcam_images')
os.makedirs(WEBCAM_DIR, exist_ok=True)  
os.makedirs(SNAPSHOT_DIR, exist_ok=True)
os.makedirs(VIOLATOIN_DIR, exist_ok=True)

BAND_ORDER = ["good", "better", "perfect"]

GREETING_MESSAGES = [
    "Alright, let's get started with your assessment! Here's your first question.",
    "Ready to show your skills? Here's the next question for you!",
    "Time to shine! Let's dive into this question.",
    "Here comes a new challenge. You've got this!"
]
CORRECT_FEEDBACK = [
    "✅ Nice one! That was spot on.",
    "🎉 Great job! You nailed it!",
    "✅ Perfect! Keep it up!",
    "🌟 Awesome! That's correct."
]
INCORRECT_FEEDBACK = [
    "❌ Oops! The correct answer was: {answer}",
    "😅 Not quite. The right answer was: {answer}",
    "❌ Missed that one. Correct answer: {answer}",
    "😬 Close, but the answer was: {answer}"
]

def load_question_bank(job_id):
    """Load and shuffle questions for a job, organized by skill and difficulty band."""
    try:
        bank = {band: {} for band in BAND_ORDER}
        mcqs = MCQ.query.filter_by(job_id=job_id).join(Skill, Skill.skill_id == MCQ.skill_id).all()
        
        for mcq in mcqs:
            skill_name = mcq.skill.name
            band = mcq.difficulty_band
            if skill_name not in bank[band]:
                bank[band][skill_name] = []
            if mcq.correct_answer not in ['A', 'B', 'C', 'D']:
                logger.error(f"Invalid correct_answer '{mcq.correct_answer}' for MCQ mcq_id={mcq.mcq_id}")
                continue
            bank[band][skill_name].append({
                "mcq_id": mcq.mcq_id,
                "question": mcq.question,
                "options": [mcq.option_a, mcq.option_b, mcq.option_c, mcq.option_d],
                "answer": getattr(mcq, f"option_{mcq.correct_answer.lower()}")
            })
        
        for band in bank:
            for skill in bank[band]:
                random.shuffle(bank[band][skill])
        
        return bank
    except Exception as e:
        logger.error(f"Error in load_question_bank for job_id={job_id}: {str(e)}")
        raise

def divide_experience_range(jd_range):
    """Divide job experience range into three bands."""
    try:
        start, end = map(float, jd_range.split("-"))
        interval = (end - start) / 3
        return {
            "good": (start, start + interval),
            "better": (start + interval, start + 2 * interval),
            "perfect": (start + 2 * interval, end)
        }
    except Exception as e:
        logger.error(f"Error in divide_experience_range for jd_range={jd_range}: {str(e)}")
        raise

def get_base_band(candidate_exp, jd_range):
    """Determine base difficulty band based on candidate experience."""
    try:
        bands = divide_experience_range(jd_range)
        for band, (low, high) in bands.items():
            if low <= candidate_exp <= high:
                return band
        return "good"
    except Exception as e:
        logger.error(f"Error in get_base_band for candidate_exp={candidate_exp}, jd_range={jd_range}: {str(e)}")
        raise

def compare_images(snapshot_url, profile_url):
    try:
        snapshot_res = requests.get(snapshot_url, timeout=5)
        profile_res = requests.get(profile_url, timeout=5)

        if snapshot_res.status_code != 200 or profile_res.status_code != 200:
            return False, "❌ Failed to download one or both images from GCS"

        snapshot_file = BytesIO(snapshot_res.content)
        profile_file = BytesIO(profile_res.content)

        result = compare_faces_from_files(profile_file, snapshot_file)

        if result["verified"]:
            return True, f"✅ Faces match (confidence={result['confidence']})"
        else:
            return False, f"❌ Faces do NOT match (confidence={result['confidence']})"

    except Exception as e:
        return False, f"Face comparison failed: {str(e)}"

def save_assessment_state(attempt_id, state):
    """Save assessment state to database."""
    try:
        assessment_state = AssessmentState.query.get(attempt_id)
        if assessment_state:
            assessment_state.state = state
        else:
            assessment_state = AssessmentState(
                attempt_id=attempt_id,
                state=state,
                skill_count=len(state.get('performance_log', {})),
                expiry_date=datetime.utcnow() + timedelta(hours=24)  # Set expiry to 24 hours from now
            )
            db.session.add(assessment_state)
        db.session.commit()
    except Exception as e:
        logger.error(f"Error saving assessment state for attempt_id={attempt_id}: {str(e)}")
        db.session.rollback()
        raise

def get_assessment_state(attempt_id):
    """Retrieve assessment state from database."""
    try:
        assessment_state = AssessmentState.query.get(attempt_id)
        if not assessment_state:
            logger.error(f"Assessment state not found for attempt_id={attempt_id}")
            return None
        if assessment_state.expiry_date and assessment_state.expiry_date < datetime.utcnow():
            logger.warning(f"Assessment state expired for attempt_id={attempt_id}")
            db.session.delete(assessment_state)
            db.session.commit()
            return None
        return assessment_state.state
    except Exception as e:
        logger.error(f"Error retrieving assessment state for attempt_id={attempt_id}: {str(e)}")
        raise

@assessment_api_bp.route('/start/<int:attempt_id>', methods=['POST'])
def start_assessment_session(attempt_id):
    """Initialize an assessment session."""
    try:
        logger.debug(f"Starting assessment for attempt_id={attempt_id}")
        attempt = AssessmentAttempt.query.get(attempt_id)
        if not attempt:
            logger.error(f"AssessmentAttempt not found for attempt_id={attempt_id}")
            return jsonify({'error': 'Assessment attempt not found'}), 404

        candidate = Candidate.query.get(attempt.candidate_id)
        if not candidate:
            logger.error(f"Candidate not found for candidate_id={attempt.candidate_id}")
            return jsonify({'error': 'Candidate not found'}), 404

        job = JobDescription.query.get(attempt.job_id)
        if not job:
            logger.error(f"JobDescription not found for job_id={attempt.job_id}")
            return jsonify({'error': 'Job description not found'}), 404

        # Validate schedule (IST timezone)
        current_time = datetime.now(timezone.utc).astimezone(timezone(offset=timedelta(hours=5, minutes=30)))
        schedule_start = job.schedule_start.replace(tzinfo=timezone(offset=timedelta(hours=5, minutes=30))) if job.schedule_start else None
        schedule_end = job.schedule_end.replace(tzinfo=timezone(offset=timedelta(hours=5, minutes=30))) if job.schedule_end else None
        if schedule_start and current_time < schedule_start:
            return jsonify({'error': f'Assessment not yet started. Scheduled for {schedule_start}'}), 403
        if schedule_end and current_time > schedule_end:
            return jsonify({'error': f'Assessment period has ended. Ended at {schedule_end}'}), 403

        if job.experience_min is None or job.experience_max is None:
            logger.error(f"Invalid experience range for job_id={job.job_id}: min={job.experience_min}, max={job.experience_max}")
            return jsonify({'error': 'Invalid job experience range'}), 400

        required_skills = RequiredSkill.query.filter_by(job_id=job.job_id).join(Skill, Skill.skill_id == RequiredSkill.skill_id).all()
        jd_priorities = {rs.skill.name: rs.priority for rs in required_skills}
        if not jd_priorities:
            logger.error(f"No required skills found for job_id={job.job_id}")
            return jsonify({'error': 'No required skills found for this job'}), 400

        proficiency_map = {4: "low", 6: "mid", 8: "high"}
        candidate_skills = CandidateSkill.query.filter_by(candidate_id=candidate.candidate_id).join(Skill, Skill.skill_id == CandidateSkill.skill_id).all()
        candidate_proficiency_per_skill = {
            cs.skill.name: proficiency_map.get(cs.proficiency, "mid")
            for cs in candidate_skills
            if cs.skill.name in jd_priorities
        }
        proficiency_to_band = {"low": "good", "mid": "better", "high": "perfect"}

        total_questions = job.num_questions
        test_duration = job.duration * 60
        candidate_experience = candidate.years_of_experience or 0
        jd_experience_range = f"{job.experience_min}-{job.experience_max}"

        question_bank = load_question_bank(job.job_id)
        if not any(bank for band in question_bank.values() for bank in band.values()):
            logger.error(f"No questions available for job_id={job.job_id}")
            return jsonify({'error': 'No questions available for this job'}), 400

        base_band = get_base_band(candidate_experience, jd_experience_range)
        priority_sum = sum(jd_priorities.values()) or 1
        questions_per_skill = {
            skill: max(1, round((priority / priority_sum) * total_questions))
            for skill, priority in jd_priorities.items()
        }
        current_band_per_skill = {
            skill: proficiency_to_band.get(candidate_proficiency_per_skill.get(skill, "mid"), base_band)
            for skill in jd_priorities
        }
        initial_band_per_skill = current_band_per_skill.copy()
        performance_log = {skill: {
            "questions_attempted": 0,
            "correct_answers": 0,
            "incorrect_answers": 0,
            "final_band": None,
            "time_spent": 0,
            "responses": [],
            "accuracy_percent": 0.0
        } for skill in jd_priorities}

        state = {
            'job_id': job.job_id,
            'question_bank': question_bank,
            'questions_per_skill': questions_per_skill,
            'current_band_per_skill': current_band_per_skill,
            'initial_band_per_skill': initial_band_per_skill,
            'performance_log': performance_log,
            'question_count': 0,
            'total_questions': total_questions,
            'test_duration': test_duration,
            'start_time': datetime.utcnow().timestamp(),
            'asked_questions': [],
            'job_description': job.job_description or "",
            'custom_prompt': job.custom_prompt or "",
            'proctoring_data': {
                "snapshots": [],
                "tab_switches": 0,
                "fullscreen_warnings": 0,
                "remarks": [],
                "forced_termination": False,
                "termination_reason": ""
            }
        }
        save_assessment_state(attempt_id, state)

        return jsonify({
            'total_questions': total_questions,
            'test_duration': test_duration,
        }), 200
    except Exception as e:
        logger.error(f"Error in start_assessment_session for attempt_id={attempt_id}: {str(e)}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@assessment_api_bp.route('/capture-snapshot/<int:attempt_id>', methods=['POST'])
def capture_snapshot(attempt_id):
    """Capture and save a webcam snapshot for proctoring."""
    try:
        attempt = AssessmentAttempt.query.get(attempt_id)
        if not attempt:
            logger.error(f"AssessmentAttempt not found for attempt_id={attempt_id}")
            return jsonify({'error': 'Assessment attempt not found'}), 404

        if attempt.status != 'started':
            logger.error(f"Assessment not in progress for attempt_id={attempt_id}")
            return jsonify({'error': 'Assessment not in progress'}), 400

        if 'snapshot' not in request.files:
            logger.error(f"No snapshot file provided for attempt_id={attempt_id}")
            return jsonify({'error': 'No snapshot file provided'}), 400

        snapshot_file = request.files['snapshot']
        if not snapshot_file.filename:
            logger.error(f"Invalid snapshot file for attempt_id={attempt_id}")
            return jsonify({'error': 'Invalid snapshot file'}), 400

        state = get_assessment_state(attempt_id)
        if not state:
            logger.error(f"Assessment session not found for attempt_id={attempt_id}")
            return jsonify({'error': 'Assessment session not found'}), 404

        timestamp = datetime.utcnow().strftime('%Y%m%dT%H%M%S')
        snapshot_filename = f"attempt{attempt_id}_{timestamp}.jpg"
        snapshot_path = f'snapshots/{snapshot_filename}'
        upload_to_gcs(snapshot_file, snapshot_path, 'image/jpeg')

        proctoring_data = state.get('proctoring_data', {
            "snapshots": [],
            "tab_switches": 0,
            "fullscreen_warnings": 0,
            "remarks": [],
            "forced_termination": False,
            "termination_reason": ""
        })
        snapshot_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "path": f'snapshots/{snapshot_filename}'
        }
        proctoring_data["snapshots"].append(snapshot_entry)
        proctoring_data["remarks"].append(f"Snapshot captured at | {snapshot_entry['timestamp']} | {snapshot_entry['path']}")
        state['proctoring_data'] = proctoring_data
        save_assessment_state(attempt_id, state)
        logger.debug(f"Updated proctoring_data for attempt_id={attempt_id}: {proctoring_data}")

        return jsonify({'message': 'Snapshot captured successfully'}), 200
    except Exception as e:
        logger.error(f"Error in capture_snapshot for attempt_id={attempt_id}: {str(e)}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@assessment_api_bp.route('/store-violation/<int:attempt_id>', methods=['POST'])
def store_violation(attempt_id):
    """Store a proctoring violation with snapshot in the database."""
    try:
        attempt = AssessmentAttempt.query.get(attempt_id)
        if not attempt:
            logger.error(f"AssessmentAttempt not found for attempt_id={attempt_id}")
            return jsonify({'error': 'Assessment attempt not found'}), 404

        if attempt.status != 'started':
            logger.error(f"Assessment not in progress for attempt_id={attempt_id}")
            return jsonify({'error': 'Assessment not in progress'}), 400

        if 'snapshot' not in request.files or 'violation_type' not in request.form:
            logger.error(f"Missing snapshot or violation_type for attempt_id={attempt_id}")
            return jsonify({'error': 'Missing snapshot or violation type'}), 400

        snapshot_file = request.files['snapshot']
        violation_type = request.form['violation_type'].lower()
        
        valid_violation_types = ['gaze_away','no_face', 'multiple_faces', 'mobile_phone']
        if violation_type not in valid_violation_types:
            logger.error(f"Invalid violation type {violation_type} for attempt_id={attempt_id}")
            return jsonify({'error': 'Invalid violation type'}), 400

        if not snapshot_file.filename:
            logger.error(f"Invalid snapshot file for attempt_id={attempt_id}")
            return jsonify({'error': 'Invalid snapshot file'}), 400

        timestamp = datetime.utcnow().strftime('%Y%m%dT%H%M%S')
        snapshot_filename = f"violation_attempt{attempt_id}_{timestamp}.jpg"
        snapshot_path = f'violations/{snapshot_filename}'
        upload_to_gcs(snapshot_file, snapshot_path, 'image/jpeg')

        violation = ProctoringViolation(
            attempt_id=attempt_id,
            snapshot_path=snapshot_path,
            violation_type=violation_type,
            timestamp=datetime.utcnow()
        )
        db.session.add(violation)
        db.session.commit()

        logger.info(f"Violation stored for attempt_id={attempt_id}: {violation_type}")
        return jsonify({
            'message': 'Violation stored successfully',
            'violation_id': violation.violation_id,
            'snapshot_path': violation.snapshot_path
        }), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error storing violation for attempt_id={attempt_id}: {str(e)}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@assessment_api_bp.route('/next-question/<int:attempt_id>', methods=['POST'])
def get_next_question(attempt_id):
    """Retrieve the next question for the assessment."""
    try:
        state = get_assessment_state(attempt_id)
        if not state:
            logger.error(f"Assessment session not found for attempt_id={attempt_id}")
            return jsonify({'error': 'Assessment session not found'}), 404

        question_count = state['question_count']
        total_questions = state['total_questions']
        test_duration = state['test_duration']
        start_time = state['start_time']
        questions_per_skill = state['questions_per_skill']
        job_id = state['job_id']
        job_description = state.get('job_description', "")
        custom_prompt = state.get('custom_prompt', "")
        asked_questions = state['asked_questions']

        elapsed_time = datetime.utcnow().timestamp() - start_time
        if question_count >= total_questions or elapsed_time >= test_duration:
            for skill in state['performance_log']:
                state['performance_log'][skill]["final_band"] = state['current_band_per_skill'][skill]
                correct = state['performance_log'][skill]["correct_answers"]
                total = state['performance_log'][skill]["questions_attempted"]
                state['performance_log'][skill]["accuracy_percent"] = round((correct / total) * 100, 2) if total > 0 else 0.0

            attempt = AssessmentAttempt.query.get(attempt_id)
            if not attempt:
                logger.error(f"AssessmentAttempt not found for attempt_id={attempt_id}")
                return jsonify({'error': 'Assessment attempt not found'}), 404

            candidate = Candidate.query.get(attempt.candidate_id)
            data = request.get_json()
            proctoring_data_in = data.get('proctoring_data', {})
            proctoring_data = state.get('proctoring_data', {
                "snapshots": [],
                "tab_switches": 0,
                "fullscreen_warnings": 0,
                "remarks": [],
                "forced_termination": False,
                "termination_reason": ""
            })

            proctoring_data.update({
                "tab_switches": proctoring_data_in.get("tab_switches", proctoring_data["tab_switches"]),
                "fullscreen_warnings": proctoring_data_in.get("fullscreen_warnings", proctoring_data["fullscreen_warnings"]),
                "remarks": proctoring_data.get("remarks", []) + proctoring_data_in.get("remarks", []),
                "forced_termination": proctoring_data_in.get("forced_termination", proctoring_data["forced_termination"]),
                "termination_reason": proctoring_data_in.get("termination_reason", proctoring_data["termination_reason"])
            })

            if candidate.profile_picture:
                profile_image_path = f'https://storage.googleapis.com/gen-ai-quiz/uploads/{candidate.profile_picture}'
                for snapshot in proctoring_data["snapshots"]:
                    snapshot_path = f'https://storage.googleapis.com/gen-ai-quiz/uploads/{snapshot["path"]}'
                    is_match, remark = compare_images(snapshot_path, profile_image_path)
                    proctoring_data["remarks"].append(f"Snapshot at {snapshot['timestamp']}: {remark}")
                    snapshot["is_valid"] = is_match
            else:
                proctoring_data["remarks"].append("No candidate profile image available for comparison")

            performance_log = state['performance_log']
            performance_log['proctoring_data'] = proctoring_data
            attempt.performance_log = performance_log
            attempt.end_time = datetime.utcnow()
            attempt.status = 'completed'
            db.session.commit()
            # Delete state after completion
            assessment_state = AssessmentState.query.get(attempt_id)
            if assessment_state:
                db.session.delete(assessment_state)
                db.session.commit()

            return jsonify({
                'message': 'Assessment completed',
                'candidate_report': state['performance_log'],
                'proctoring_data': proctoring_data
            }), 200

        required_skills = RequiredSkill.query.filter_by(job_id=job_id).join(Skill, Skill.skill_id == RequiredSkill.skill_id).all()
        jd_priorities = {rs.skill.name: rs.priority for rs in required_skills}
        sorted_skills = sorted(questions_per_skill.items(), key=lambda x: -jd_priorities.get(x[0], 0))
        for skill, remaining in sorted_skills:
            if remaining <= 0:
                continue

            band = state['current_band_per_skill'][skill]
            available = [
                q for q in state['question_bank'].get(band, {}).get(skill, [])
                if q['mcq_id'] not in [aq['mcq_id'] for aq in asked_questions]
            ]

            question = None
            if question_count > 0:
                try:
                    logger.debug(f"Generating question for skill={skill}, band={band}, attempt_id={attempt_id}")
                    question_data = generate_single_question(skill, band, job_id, job_description, used_questions=asked_questions)
                    if question_data:
                        question = {
                            "mcq_id": question_data["mcq_id"],
                            "question": question_data["question"],
                            "options": [
                                question_data["option_a"],
                                question_data["option_b"],
                                question_data["option_c"],
                                question_data["option_d"]
                            ],
                            "answer": question_data[f"option_{question_data['correct_answer'].lower()}"],
                            "skill": skill,
                            "difficulty_band": band
                        }
                        state['question_bank'].setdefault(band, {}).setdefault(skill, []).append(question)
                except (timeout_decorator.TimeoutError, google.api_core.exceptions.GoogleAPIError) as e:
                    logger.warning(f"Real-time question generation failed for {skill} ({band}): {str(e)}. Falling back to database.")

            if not question and available:
                question = available.pop(0)

            if question:
                state['questions_per_skill'][skill] -= 1
                state['question_count'] += 1
                state['asked_questions'].append(question)
                save_assessment_state(attempt_id, state)

                return jsonify({
                    'greeting': random.choice(GREETING_MESSAGES),
                    'question': {
                        'mcq_id': question['mcq_id'],
                        'question': question['question'],
                        'options': question['options']
                    },
                    'skill': skill,
                    'question_number': state['question_count']
                }), 200

        logger.warning(f"No more questions available for attempt_id={attempt_id}")
        save_assessment_state(attempt_id, state)
        return jsonify({'message': 'No more questions available'}), 200
    except Exception as e:
        logger.error(f"Error in get_next_question for attempt_id={attempt_id}: {str(e)}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@assessment_api_bp.route('/submit-answer/<int:attempt_id>', methods=['POST'])
def submit_answer(attempt_id):
    """Submit an answer and update performance log."""
    try:
        state = get_assessment_state(attempt_id)
        if not state:
            logger.error(f"Assessment session not found for attempt_id={attempt_id}")
            return jsonify({'error': 'Assessment session not found'}), 404

        data = request.get_json()
        skill = data.get('skill')
        user_input = data.get('answer')
        time_taken = data.get('time_taken')
        mcq_id = data.get('mcq_id')

        if not skill or skill not in state['performance_log']:
            logger.error(f"Invalid skill '{skill}' for attempt_id={attempt_id}")
            return jsonify({'error': 'Invalid skill provided'}), 400

        if not user_input or user_input not in ['1', '2', '3', '4']:
            logger.error(f"Invalid answer '{user_input}' for attempt_id={attempt_id}")
            return jsonify({'error': 'Invalid answer provided'}), 400

        if not mcq_id or mcq_id not in [q['mcq_id'] for q in state['asked_questions']]:
            logger.error(f"Invalid mcq_id '{mcq_id}' for attempt_id={attempt_id}")
            return jsonify({'error': 'Invalid mcq_id provided'}), 400

        question = next(q for q in state['asked_questions'] if q['mcq_id'] == mcq_id)
        band = state['current_band_per_skill'][skill]
        
        input_map = {1: 'A', 2: 'B', 3: 'C', 4: 'D'}
        user_letter = input_map.get(int(user_input), '')
        user_option = question['options'][int(user_input) - 1]
        correct_letter = next(letter for letter, opt in zip(['A', 'B', 'C', 'D'], question['options']) if opt == question['answer'])
        correct = user_letter == correct_letter

        state['performance_log'][skill]["questions_attempted"] += 1
        state['performance_log'][skill]["time_spent"] += time_taken
        state['performance_log'][skill]["responses"].append({
            "mcq_id": question['mcq_id'],
            "question": question['question'],
            "chosen": user_option,
            "correct": question['answer'],
            "is_correct": correct,
            "band": band,
            "time_taken": time_taken
        })

        if correct:
            state['performance_log'][skill]["correct_answers"] += 1
            if BAND_ORDER.index(band) < 2:
                state['current_band_per_skill'][skill] = BAND_ORDER[BAND_ORDER.index(band) + 1]
            feedback = random.choice(CORRECT_FEEDBACK)
        else:
            state['performance_log'][skill]["incorrect_answers"] += 1
            if BAND_ORDER.index(band) > 0:
                state['current_band_per_skill'][skill] = BAND_ORDER[BAND_ORDER.index(band) - 1]
            feedback = random.choice(INCORRECT_FEEDBACK).format(answer=question['answer'])

        save_assessment_state(attempt_id, state)
        return jsonify({'feedback': feedback}), 200
    except Exception as e:
        logger.error(f"Error in submit_answer for attempt_id={attempt_id}: {str(e)}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@assessment_api_bp.route('/end/<int:attempt_id>', methods=['POST'])
def end_assessment(attempt_id):
    """End the assessment, process proctoring data, and save results."""
    try:
        state = get_assessment_state(attempt_id)
        if not state:
            logger.error(f"Assessment session not found for attempt_id={attempt_id}")
            return jsonify({'error': 'Assessment session not found'}), 404

        data = request.get_json()
        proctoring_data_in = data.get('proctoring_data', {})
        logger.debug(f"Received proctoring_data for attempt_id={attempt_id}: {proctoring_data_in}")

        proctoring_data = state.get('proctoring_data', {
            "snapshots": [],
            "tab_switches": 0,
            "fullscreen_warnings": 0,
            "remarks": [],
            "forced_termination": False,
            "termination_reason": ""
        })
        proctoring_data.update({
            "tab_switches": proctoring_data_in.get("tab_switches", proctoring_data["tab_switches"]),
            "fullscreen_warnings": proctoring_data_in.get("fullscreen_warnings", proctoring_data["fullscreen_warnings"]),
            "remarks": proctoring_data.get("remarks", []) + proctoring_data_in.get("remarks", []),
            "forced_termination": proctoring_data_in.get("forced_termination", proctoring_data["forced_termination"]),
            "termination_reason": proctoring_data_in.get("termination_reason", proctoring_data["termination_reason"])
        })

        attempt = AssessmentAttempt.query.get(attempt_id)
        if not attempt:
            logger.error(f"AssessmentAttempt not found for attempt_id={attempt_id}")
            return jsonify({'error': 'Assessment attempt not found'}), 404

        candidate = Candidate.query.get(attempt.candidate_id)
        if candidate.profile_picture:
            profile_image_path = f'https://storage.googleapis.com/gen-ai-quiz/uploads/{candidate.profile_picture}'
            for snapshot in proctoring_data["snapshots"]:
                snapshot_path = f'https://storage.googleapis.com/gen-ai-quiz/uploads/{snapshot["path"]}'
                is_match, remark = compare_images(snapshot_path, profile_image_path)
                proctoring_data["remarks"].append(f"Snapshot at {snapshot['timestamp']}: {remark}")
                snapshot["is_valid"] = is_match
        else:
            proctoring_data["remarks"].append("No candidate profile image available for comparison")

        performance_log = state['performance_log']
        for skill in performance_log:
            performance_log[skill]["final_band"] = state['current_band_per_skill'][skill]
            correct = performance_log[skill]["correct_answers"]
            total = performance_log[skill]["questions_attempted"]
            performance_log[skill]["accuracy_percent"] = round((correct / total) * 100, 2) if total > 0 else 0.0
        performance_log['proctoring_data'] = proctoring_data

        attempt.performance_log = performance_log
        attempt.end_time = datetime.utcnow()
        attempt.status = 'completed'
        db.session.commit()
        # Delete state after completion
        assessment_state = AssessmentState.query.get(attempt_id)
        if assessment_state:
            db.session.delete(assessment_state)
            db.session.commit()

        return jsonify({
            'message': 'Assessment completed',
            'candidate_report': performance_log,
            'proctoring_data': proctoring_data,
            'total_questions': state['total_questions']
        }), 200
    except Exception as e:
        logger.error(f"Error in end_assessment for attempt_id={attempt_id}: {str(e)}")
        db.session.rollback()
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@assessment_api_bp.route('/results/<int:attempt_id>', methods=['GET'])
def get_assessment_results(attempt_id):
    """Retrieve assessment results for a candidate."""
    try:
        if 'user_id' not in session:
            logger.error("No user_id found in session")
            return jsonify({'error': 'Unauthorized: No user session found'}), 401

        user_id = session['user_id']
        candidate = Candidate.query.filter_by(user_id=user_id).first_or_404()
        attempt = AssessmentAttempt.query.get(attempt_id)
        if not attempt:
            logger.error(f"Assessment attempt not found for attempt_id={attempt_id}")
            return jsonify({'error': 'Assessment attempt not found'}), 404

        if attempt.candidate_id != candidate.candidate_id:
            logger.error(f"Unauthorized access to attempt_id={attempt_id} by user_id={user_id}")
            return jsonify({'error': 'Unauthorized'}), 403

        if attempt.status != 'completed':
            logger.error(f"Assessment not completed for attempt_id={attempt_id}")
            return jsonify({'error': 'Assessment not completed'}), 400

        job = JobDescription.query.get(attempt.job_id)
        candidate_report = {k: v for k, v in attempt.performance_log.items() if k != 'proctoring_data'}
        proctoring_data = attempt.performance_log.get('proctoring_data', {})
        logger.debug(f"Retrieved proctoring_data for attempt_id={attempt_id}: {proctoring_data}")

        return jsonify({
            'candidate_report': candidate_report,
            'total_questions': job.num_questions,
            'proctoring_data': proctoring_data
        }), 200
    except Exception as e:
        logger.error(f"Error in get_assessment_results for attempt_id={attempt_id}: {str(e)}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@assessment_api_bp.route('/all', methods=['GET'])
def get_candidate_assessments():
    """Retrieve all completed assessments for the logged-in candidate."""
    try:
        if 'user_id' not in session:
            logger.error("No user_id found in session")
            return jsonify({'error': 'Unauthorized: No user session found'}), 401

        user_id = session['user_id']
        candidate = Candidate.query.filter_by(user_id=user_id).first()
        if not candidate:
            logger.error(f"Candidate not found for user_id={user_id}")
            return jsonify({'error': 'Candidate not found'}), 404

        candidate_id = candidate.candidate_id
        attempted = db.session.query(
            AssessmentAttempt.attempt_id,
            AssessmentAttempt.job_id,
            AssessmentAttempt.start_time,
            AssessmentAttempt.status,
            JobDescription.job_title,
            JobDescription.company
        ).join(
            JobDescription, AssessmentAttempt.job_id == JobDescription.job_id
        ).filter(
            AssessmentAttempt.candidate_id == candidate_id,
            AssessmentAttempt.status == 'completed'
        ).all()
        
        attempted_assessments = [
            {
                'attempt_id': attempt.attempt_id,
                'job_id': attempt.job_id,
                'job_title': attempt.job_title,
                'company': attempt.company,
                'attempt_date': attempt.start_time.isoformat(),
                'status': attempt.status.capitalize()
            } for attempt in attempted
        ]
        
        logger.debug(f"Retrieved {len(attempted_assessments)} completed assessments for candidate_id={candidate_id}")
        return jsonify({
            'attempted': attempted_assessments
        }), 200
    except Exception as e:
        logger.error(f"Error in get_candidate_assessments for user_id={user_id}: {str(e)}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500