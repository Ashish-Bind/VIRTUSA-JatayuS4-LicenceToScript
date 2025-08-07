import os
import json
import re
import threading
import functools
import time
from flask import current_app
import google.generativeai as genai
from google.api_core.exceptions import TooManyRequests
from app import db
from app.models.skill import Skill
from app.models.mcq import MCQ

# Cross-platform timeout implementation
class TimeoutError(Exception):
    pass

def timeout_with_context(seconds):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            app = current_app._get_current_object()
            result = [None]
            exception = [None]
            
            def target():
                with app.app_context():
                    try:
                        result[0] = func(*args, **kwargs)
                    except Exception as e:
                        exception[0] = e
            
            thread = threading.Thread(target=target)
            thread.daemon = True
            thread.start()
            thread.join(seconds)
            
            if thread.is_alive():
                raise TimeoutError(f'Function call timed out after {seconds} seconds')
            
            if exception[0]:
                raise exception[0]
            
            return result[0]
        return wrapper
    return decorator

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

def divide_experience_range(jd_range):
    start, end = map(float, jd_range.split("-"))
    interval = (end - start) / 3
    return {
        "good": (start, start + interval),
        "better": (start + interval, start + 2 * interval),
        "perfect": (start + 2 * interval, end)
    }

def expand_skills_with_gemini(skill):
    prompt = f"List 5 key subtopics under {skill} that are relevant for a technical interview. Only list the subskills."
    max_retries = 3
    for attempt in range(max_retries):
        try:
            chat_session = model_gemini.start_chat(history=[{"role": "user", "parts": [prompt]}])
            response = chat_session.send_message(prompt)
            if response and isinstance(response.text, str):
                subtopics = [line.strip("- ").strip() for line in response.text.split("\n") if line.strip()][:5]
                return subtopics
        except TooManyRequests:
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt * 10
                print(f"⛔️ Gemini quota exceeded while expanding skill: {skill}. Retrying in {wait_time} seconds...")
                time.sleep(wait_time)
            else:
                print(f"⛔️ Gemini quota exceeded after {max_retries} retries for skill: {skill}")
                return []
    return []

def generate_questions_prompt(skill, subskills, difficulty_band, job_description="", previous_questions=None):
    difficulty_descriptor = {
        "good": "easy and theory-based, suitable for beginners. Can include data structures and algorithms questions.",
        "better": "moderate difficulty, mixing theory and practical concepts, can be DSA-based or practical.",
        "perfect": "challenging, practical, and suitable for advanced learners, mostly code snippet-based to test practical skills."
    }[difficulty_band]
    description_context = f"The job description is: {job_description}" if job_description else "There is no specific job description provided."
    
    avoid_section = ""
    if previous_questions:
        avoid_section = "Avoid generating questions similar in content or concept to the following previously generated questions:\n"
        for i, q in enumerate(previous_questions[:5], 1):
            avoid_section += f"Previous Question {i}:\n{q['question']}\n"
            avoid_section += "\n".join(f"({chr(65+i)}) {opt}" for i, opt in enumerate(q['options']))
            avoid_section += f"\nCorrect Answer: ({q['correct_answer']})\n\n"
    
    prompt = f"""
    {description_context}
    Generate exactly 20 unique and diverse multiple-choice questions (MCQs) on the skill '{skill}' and its subskills: {", ".join(subskills)}.
    The questions should be {difficulty_descriptor}. Include 5-7 code snippet questions where applicable, and the rest should be theory-based to ensure variety.
    Guidelines:
    1. Each question must be unique in wording and concept, with no repetition or paraphrasing across the 20 questions.
    2. Cover a broad range of topics from the subskills provided to ensure diversity.
    3. Avoid similar ideas, synonyms, or rephrased questions within the batch.
    {avoid_section}
    4. Each MCQ must have exactly four options labeled 'A', 'B', 'C', 'D'.
    5. The correct answer must be one of 'A', 'B', 'C', 'D'.
    6. Return the response as a JSON array of 20 objects, where each object has the fields: 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer'.
    7. Ensure all fields are strings, and the correct_answer is one of 'A', 'B', 'C', 'D'.
    8. For code snippets in questions, use escaped quotes (\\\") and replace newlines with spaces to ensure valid JSON.
    9. Example format:
    [
        {{
            "question": "What is an AMI in AWS?",
            "option_a": "Virtual machine image",
            "option_b": "Storage volume",
            "option_c": "Network interface",
            "option_d": "Security group",
            "correct_answer": "A"
        }},
        {{
            "question": "What will this code print? driver.findElement(By.xpath(\\\"//input[@type='submit']\\\")).click();",
            "option_a": "Submits a form",
            "option_b": "Clicks a button",
            "option_c": "Enters text",
            "option_d": "Clears a field",
            "correct_answer": "B"
        }}
    ]
    10. Return ONLY the JSON array as a string, with no additional text, no code block markers (```), and no extra whitespace outside the JSON structure.
    """
    return prompt.strip()

def generate_single_question_prompt(skill, subskills, difficulty_band, job_description="", previous_questions=None):
    """Generate a concise prompt for a single MCQ based on skill, subskills, and difficulty."""
    difficulty_descriptor = {
        "good": "easy, theory-based, suitable for beginners, may include DSA.",
        "better": "moderate, mixing theory and practical, may include DSA or code.",
        "perfect": "challenging, practical, code snippet-based for advanced learners."
    }[difficulty_band]
    job_context = f"Job description: {job_description}" if job_description else "No job description provided."
    
    avoid_section = ""
    if previous_questions:
        avoid_section = "Avoid questions similar to these:\n" + "\n".join(
            f"Q{i}: {q['question']}\nOptions: {', '.join(q['options'])}\nAnswer: {q['correct_answer']}"
            for i, q in enumerate(previous_questions[:3], 1)
        ) + "\n"
    
    prompt = f"""
    {job_context}
    Generate one unique MCQ for skill '{skill}' (subskills: {', '.join(subskills)}).
    The question must be {difficulty_descriptor}.
    Include a code snippet for 'better' or 'perfect' bands if relevant.
    Requirements:
    1. Question must be unique, concise, and cover the skill/subskills.
    2. Provide exactly 4 options labeled 'A', 'B', 'C', 'D'.
    3. `correct_answer` must be exactly 'A', 'B', 'C', or 'D' (single uppercase character).
    4. All fields (question, option_a, option_b, option_c, option_d, correct_answer) must be non-empty strings.
    5. For code snippets, use escaped quotes (\\\") and replace newlines with spaces.
    {avoid_section}
    Return a JSON object: {{"question": "", "option_a": "", "option_b": "", "option_c": "", "option_d": "", "correct_answer": ""}}.
    """
    return prompt.strip()

def clean_entry(entry):
    """Clean a text entry by replacing newlines with spaces and removing extra whitespace."""
    if not isinstance(entry, str):
        return entry
    entry = entry.strip().replace('\n', ' ').replace('\\n', ' ')
    entry = re.sub(r'([a-z])\1+', r'\1', entry)
    return ' '.join(entry.split())

def parse_question_block(question_data):
    """Parse a single question JSON object into a structured format."""
    try:
        # Validate required fields
        required_fields = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer']
        if not all(field in question_data for field in required_fields):
            print(f"Invalid question format: Missing required fields in {json.dumps(question_data)}")
            return None
        
        # Validate correct_answer
        if question_data['correct_answer'] not in ['A', 'B', 'C', 'D']:
            print(f"Invalid correct_answer: {question_data['correct_answer']} in {json.dumps(question_data)}")
            return None
        
        # Validate that all fields are strings
        for field in required_fields:
            if not isinstance(question_data[field], str):
                print(f"Invalid field type: {field} is {type(question_data[field])} in {json.dumps(question_data)}")
                return None
        
        # Clean entries
        parsed = {
            "question": clean_entry(question_data['question']),
            "option_a": clean_entry(question_data['option_a']),
            "option_b": clean_entry(question_data['option_b']),
            "option_c": clean_entry(question_data['option_c']),
            "option_d": clean_entry(question_data['option_d']),
            "correct_answer": question_data['correct_answer'],
            "options": [
                clean_entry(question_data['option_a']),
                clean_entry(question_data['option_b']),
                clean_entry(question_data['option_c']),
                clean_entry(question_data['option_d'])
            ]
        }
        return parsed
    except Exception as e:
        print(f"Error parsing question block: {e} - Data: {json.dumps(question_data)}")
        return None

def parse_response(raw_text):
    """Parse the raw JSON response from Gemini into a list of questions."""
    print(f"📜 Raw Gemini response: {raw_text[:500]}... (truncated)")
    
    try:
        # Clean response: remove any code block markers or extra whitespace
        raw_text = raw_text.strip()
        raw_text = re.sub(r'^```(json|python)?\s*\n', '', raw_text, flags=re.MULTILINE)
        raw_text = re.sub(r'\n```$', '', raw_text, flags=re.MULTILINE)
        
        # Parse JSON
        questions = json.loads(raw_text)
        
        # Handle single question (object) or multiple questions (array)
        if isinstance(questions, dict):
            questions = [questions]
        elif not isinstance(questions, list):
            print(f"Invalid response format: Expected JSON array or object, got {type(questions)}")
            return []
        
        # Validate and clean questions
        parsed_questions = []
        for q in questions:
            parsed = parse_question_block(q)
            if parsed:
                parsed_questions.append(parsed)
            else:
                print(f"Skipping invalid question: {json.dumps(q)}")
        
        return parsed_questions
    except json.JSONDecodeError as e:
        print(f"⚠️ Failed to parse JSON response: {e} - Raw text: {raw_text[:100]}...")
        # Attempt to fix common JSON issues (e.g., missing brackets)
        try:
            if raw_text.startswith("{") and not raw_text.startswith("["):
                raw_text = f"[{raw_text}]"
                questions = json.loads(raw_text)
                parsed_questions = []
                for q in questions:
                    parsed = parse_question_block(q)
                    if parsed:
                        parsed_questions.append(parsed)
                    else:
                        print(f"Skipping invalid question: {json.dumps(q)}")
                return parsed_questions
        except json.JSONDecodeError as e2:
            print(f"⚠️ Failed to parse after attempting fix: {e2} - Raw text: {raw_text[:100]}...")
        return []
    except Exception as e:
        print(f"⚠️ Error parsing response: {e} - Raw text: {raw_text[:100]}...")
        return []

def parse_single_question_response(raw_text):
    """Parse a single question from raw JSON response."""
    print(f"📜 Raw response: {raw_text[:500]}... (truncated)")
    try:
        raw_text = raw_text.strip()
        raw_text = re.sub(r'^```(json|python)?\s*\n', '', raw_text, flags=re.MULTILINE)
        raw_text = re.sub(r'\n```$', '', raw_text, flags=re.MULTILINE)
        
        question_data = json.loads(raw_text)
        if not isinstance(question_data, dict):
            print(f"Invalid response format: Expected JSON object, got {type(question_data)}")
            return None
        
        # Validate required fields
        required_fields = ['question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer']
        if not all(field in question_data for field in required_fields):
            missing = [f for f in required_fields if f not in question_data]
            print(f"Invalid question format: Missing fields {missing} in {json.dumps(question_data)}")
            return None
        
        # Validate correct_answer
        correct_answer = question_data['correct_answer']
        if not isinstance(correct_answer, str) or correct_answer not in ['A', 'B', 'C', 'D']:
            print(f"Invalid correct_answer: '{correct_answer}' (type: {type(correct_answer)}) in {json.dumps(question_data)}")
            # Attempt to fix lowercase answers
            if isinstance(correct_answer, str) and correct_answer.upper() in ['A', 'B', 'C', 'D']:
                print(f"Converting lowercase correct_answer '{correct_answer}' to '{correct_answer.upper()}'")
                question_data['correct_answer'] = correct_answer.upper()
            else:
                return None
        
        # Validate that all fields are strings and non-empty
        for field in required_fields:
            if not isinstance(question_data[field], str) or not question_data[field].strip():
                print(f"Invalid field: {field} is {type(question_data[field])} or empty in {json.dumps(question_data)}")
                return None
        
        # Clean entries
        parsed = {
            "question": clean_entry(question_data['question']),
            "option_a": clean_entry(question_data['option_a']),
            "option_b": clean_entry(question_data['option_b']),
            "option_c": clean_entry(question_data['option_c']),
            "option_d": clean_entry(question_data['option_d']),
            "correct_answer": question_data['correct_answer'],
            "options": [
                clean_entry(question_data['option_a']),
                clean_entry(question_data['option_b']),
                clean_entry(question_data['option_c']),
                clean_entry(question_data['option_d'])
            ]
        }
        return parsed
    except json.JSONDecodeError as e:
        print(f"⚠️ Failed to parse JSON response: {e} - Raw text: {raw_text[:100]}...")
        return None
    except Exception as e:
        print(f"⚠️ Error parsing response: {e} - Raw text: {raw_text[:100]}...")
        return None

@timeout_with_context(10)
def generate_single_question_with_timeout(skill_name, difficulty_band, job_id, job_description="", used_questions=None):
    """Generate a single question with timeout."""
    skill = Skill.query.filter_by(name=skill_name).first()
    if not skill:
        print(f"⚠️ Skill {skill_name} not found in database.")
        return None
    
    skill_id = skill.skill_id
    subskills = expand_skills_with_gemini(skill_name)
    
    previous_questions = [
        q for q in (used_questions or [])
        if q.get('skill') == skill_name and q.get('difficulty_band') == difficulty_band
    ]
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            prompt = generate_single_question_prompt(skill_name, subskills, difficulty_band, job_description, previous_questions)
            chat = model_gemini.start_chat(history=[{"role": "user", "parts": [prompt]}])
            response = chat.send_message(prompt)
            
            if response and isinstance(response.text, str):
                parsed = parse_single_question_response(response.text)
                print(parsed)
                if not parsed:
                    print(f"⚠️ No valid question generated for {skill_name} ({difficulty_band})")
                    continue
                
                mcq = MCQ(
                    job_id=job_id,
                    skill_id=skill_id,
                    question=parsed["question"],
                    option_a=parsed["option_a"],
                    option_b=parsed["option_b"],
                    option_c=parsed["option_c"],
                    option_d=parsed["option_d"],
                    correct_answer=parsed["correct_answer"],
                    difficulty_band=difficulty_band
                )
                db.session.add(mcq)
                db.session.commit()
                
                print(f"✅ Saved question for {skill_name} ({difficulty_band})")
                return {
                    "mcq_id": mcq.mcq_id,
                    "question": parsed["question"],
                    "option_a": parsed["option_a"],
                    "option_b": parsed["option_b"],
                    "option_c": parsed["option_c"],
                    "option_d": parsed["option_d"],
                    "correct_answer": parsed["correct_answer"],
                    "skill": skill_name,
                    "difficulty_band": difficulty_band,
                    "options": parsed["options"]
                }
        except TooManyRequests:
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt * 10
                print(f"⛔️ Gemini quota exceeded. Retrying in {wait_time}s...")
                time.sleep(wait_time)
            else:
                print(f"⛔️ Gemini quota exceeded after {max_retries} retries.")
                return None
        except Exception as e:
            print(f"⚠️ Error generating question: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt * 1.5)
                continue
            return None
    return None

def get_prestored_question(skill_name, difficulty_band, job_id, used_questions=None):
    """Retrieve a pre-stored question."""
    try:
        skill = Skill.query.filter_by(name=skill_name).first()
        if not skill:
            print(f"⚠️ Skill {skill_name} not found in database.")
            return None
        
        used_mcq_ids = [q['mcq_id'] for q in (used_questions or []) if 'mcq_id' in q]
        query = MCQ.query.filter_by(
            job_id=job_id,
            skill_id=skill.skill_id,
            difficulty_band=difficulty_band
        ).filter(~MCQ.mcq_id.in_(used_mcq_ids))
        
        available_mcqs = query.all()
        if not available_mcqs:
            print(f"⚠️ No unused pre-stored questions found for {skill_name} ({difficulty_band})")
            return None
        
        mcq = available_mcqs[0]  # Select first available question
        print(f"📦 Using pre-stored question for {skill_name} ({difficulty_band}) - ID: {mcq.mcq_id}")
        return {
            "mcq_id": mcq.mcq_id,
            "question": mcq.question,
            "option_a": mcq.option_a,
            "option_b": mcq.option_b,
            "option_c": mcq.option_c,
            "option_d": mcq.option_d,
            "correct_answer": mcq.correct_answer,
            "skill": skill_name,
            "difficulty_band": difficulty_band,
            "options": [mcq.option_a, mcq.option_b, mcq.option_c, mcq.option_d]
        }
    except Exception as e:
        print(f"⚠️ Error fetching pre-stored question: {e}")
        return None

def generate_single_question(skill_name, difficulty_band, job_id, job_description="", used_questions=None):
    """Main function that tries real-time generation with fallback to pre-stored questions."""
    if used_questions is None:
        used_questions = []
    
    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            result = generate_single_question_with_timeout(skill_name, difficulty_band, job_id, job_description, used_questions)
            if result:
                return result
        except TimeoutError:
            print(f"⏰ Real-time generation timed out for {skill_name} ({difficulty_band}). Falling back to pre-stored questions.")
            break
        except TooManyRequests:
            print(f"⛔️ Gemini quota exceeded after retries for {skill_name} ({difficulty_band}). Falling back to pre-stored questions.")
            break
        except Exception as e:
            print(f"⚠️ Error in real-time generation for {skill_name} ({difficulty_band}): {e}")
            print("🔄 Falling back to pre-stored questions.")
            break
    
    return get_prestored_question(skill_name, difficulty_band, job_id, used_questions)

def prepare_question_batches(skills_with_priorities, jd_experience_range, job_id, job_description=""):
    """Generate and store 20 unique questions per skill per difficulty band."""
    band_ranges = divide_experience_range(jd_experience_range)
    question_bank = {"good": {}, "better": {}, "perfect": {}}
    total_questions_saved = 0
    
    for skill_data in skills_with_priorities:
        skill_name = skill_data["name"]
        print(f"\n📌 Processing Skill: {skill_name} (Priority: {skill_data['priority']})")
        skill = Skill.query.filter_by(name=skill_name).first()
        if not skill:
            print(f"⚠️ Skill {skill_name} not found in database. Skipping...")
            continue
        skill_id = skill.skill_id
        subskills = expand_skills_with_gemini(skill_name)
        
        for band in ["good", "better", "perfect"]:
            key = f"{skill_name}"
            if key not in question_bank[band]:
                question_bank[band][key] = []
            
            saved_questions = []
            attempts = 0
            max_attempts = 5
            while len(saved_questions) < 20 and attempts < max_attempts:
                try:
                    prompt = generate_questions_prompt(skill_name, subskills, band, job_description, saved_questions)
                    chat = model_gemini.start_chat(history=[{"role": "user", "parts": [prompt]}])
                    response = chat.send_message(prompt)
                    
                    if response and isinstance(response.text, str):
                        questions = parse_response(response.text)
                        print(f"✅ [{band.upper()}] {skill_name}: {len(questions)} questions generated")
                        
                        for parsed in questions[:20 - len(saved_questions)]:  # Limit to remaining needed questions
                            try:
                                mcq = MCQ(
                                    job_id=job_id,
                                    skill_id=skill_id,
                                    question=parsed["question"],
                                    option_a=parsed["option_a"],
                                    option_b=parsed["option_b"],
                                    option_c=parsed["option_c"],
                                    option_d=parsed["option_d"],
                                    correct_answer=parsed["correct_answer"],
                                    difficulty_band=band
                                )
                                db.session.add(mcq)
                                db.session.flush()
                                saved_questions.append({
                                    "mcq_id": mcq.mcq_id,
                                    "question": parsed["question"],
                                    "options": parsed["options"],
                                    "correct_answer": parsed["correct_answer"],
                                    "skill": skill_name,
                                    "difficulty_band": band
                                })
                                total_questions_saved += 1
                                print(f"Added MCQ: {parsed['question']} (Band: {band}, Correct Answer: {parsed['correct_answer']})")
                            except Exception as e:
                                print(f"⚠️ Error adding MCQ to session for {skill_name} in {band} band: {e}")
                                print(f"MCQ data: {parsed}")
                
                except TooManyRequests:
                    print(f"⛔️ Gemini quota exceeded for {skill_name} ({band}). Retrying in 10 seconds...")
                    time.sleep(10)
                except Exception as e:
                    print(f"⚠️ Error generating batch for {skill_name} in {band} band: {e}")
                
                attempts += 1
                time.sleep(1.5)
            
            if len(saved_questions) < 20:
                print(f"⚠️ Only {len(saved_questions)} unique questions generated for {skill_name} ({band}) after {max_attempts} attempts")
                # Attempt to fill remaining questions using single question generation
                while len(saved_questions) < 20:
                    try:
                        question = generate_single_question(skill_name, band, job_id, job_description, saved_questions)
                        if question:
                            saved_questions.append(question)
                            total_questions_saved += 1
                            print(f"Added single MCQ: {question['question']} (Band: {band}, Correct Answer: {question['correct_answer']})")
                        else:
                            print(f"⚠️ Failed to generate single question for {skill_name} ({band})")
                            break
                    except Exception as e:
                        print(f"⚠️ Error generating single question for {skill_name} ({band}): {e}")
                        break
            
            question_bank[band][key] = saved_questions
    
    try:
        db.session.commit()
        print(f"✅ {total_questions_saved} questions saved to the database.")
    except Exception as e:
        db.session.rollback()
        print(f"⚠️ Error saving questions to database: {e}")
    
    print("\n✅ Question generation completed!")
    return question_bank