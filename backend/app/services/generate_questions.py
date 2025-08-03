import os
import json
import random
import time

# --- Configuration ---
QUESTION_DIR = "question_batches"
TOTAL_QUESTIONS = 20
BAND_ORDER = ["good", "better", "perfect"]
TEST_DURATION = 20 * 60  # 20 minutes in seconds

# --- Sample Inputs ---
candidate_experience = 4.0
jd_experience_range = "3-6"
jd_priorities = {
    "Machine_Learning": 3,
    "Data_Science": 2,
}
candidate_proficiency_per_skill = {
    "Machine_Learning": "mid",
    "Data_Science": "mid",
}
proficiency_to_band = {"low": "good", "mid": "better", "high": "perfect"}

# --- Helper Functions ---
def divide_experience_range(jd_range):
    start, end = map(float, jd_range.split("-"))
    interval = (end - start) / 3
    return {
        "good": (start, start + interval),
        "better": (start + interval, start + 2 * interval),
        "perfect": (start + 2 * interval, end)
    }

def get_base_band(candidate_exp, jd_range):
    bands = divide_experience_range(jd_range)
    for band, (low, high) in bands.items():
        if low <= candidate_exp <= high:
            return band
    return "good"

def load_question_bank():
    bank = {band: {} for band in BAND_ORDER}
    for fname in os.listdir(QUESTION_DIR):
        if fname.endswith(".json"):
            parts = fname[:-5].split("_")
            skill = "_".join(parts[:-1])
            band = parts[-1]
            with open(os.path.join(QUESTION_DIR, fname), "r") as f:
                questions = json.load(f)
            if skill not in bank[band]:
                bank[band][skill] = []
            random.shuffle(questions)
            bank[band][skill].extend(questions)
    return bank

# --- Initialization ---
question_bank = load_question_bank()
base_band = get_base_band(candidate_experience, jd_experience_range)
priority_sum = sum(jd_priorities.values())
questions_per_skill = {
    skill: round((priority / priority_sum) * TOTAL_QUESTIONS)
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
    "responses": []
} for skill in jd_priorities}
question_count = 0
asked_questions = []

# --- Core Functions ---
def ask_question(skill):
    band = current_band_per_skill[skill]
    available = question_bank.get(band, {}).get(skill, [])
    if not available:
        return None, band
    question = available.pop(0)
    return question, band

def evaluate_answer(question, skill, band, user_input, time_taken):
    user_option = question['options'][int(user_input) - 1]
    correct = user_option == question['answer']

    performance_log[skill]["questions_attempted"] += 1
    performance_log[skill]["time_spent"] += time_taken
    performance_log[skill]["responses"].append({
        "question": question['question'],
        "chosen": user_option,
        "correct": question['answer'],
        "is_correct": correct,
        "band": band,
        "time_taken": time_taken
    })

    if correct:
        performance_log[skill]["correct_answers"] += 1
        if BAND_ORDER.index(band) < 2:
            current_band_per_skill[skill] = BAND_ORDER[BAND_ORDER.index(band) + 1]
        print("✅ Nice one! That was spot on.")
    else:
        performance_log[skill]["incorrect_answers"] += 1
        if BAND_ORDER.index(band) > 0:
            current_band_per_skill[skill] = BAND_ORDER[BAND_ORDER.index(band) - 1]
        print(f"❌ Oops! The correct answer was: {question['answer']}")

# --- Start Test ---
print("\n🧠 Welcome to your personalized assessment!\n")
test_start_time = time.time()

while question_count < TOTAL_QUESTIONS and (time.time() - test_start_time) < TEST_DURATION:
    sorted_skills = sorted(jd_priorities.items(), key=lambda x: -x[1])
    for skill, _ in sorted_skills:
        if questions_per_skill[skill] <= 0:
            continue

        question, band = ask_question(skill)
        if not question:
            continue

        print(f"\n🤖 Here's your next one on {skill.replace('_', ' ')}:\n")
        print(f"Q{question_count + 1}: {question['question']}")
        for i, opt in enumerate(question['options'], 1):
            print(f"{i}. {opt}")
        start_q_time = time.time()
        user_ans = input("Please type the number of your answer (1-4): ")
        end_q_time = time.time()
        time_spent = round(end_q_time - start_q_time, 2)

        evaluate_answer(question, skill, band, user_ans, time_spent)
        asked_questions.append(question)
        questions_per_skill[skill] -= 1
        question_count += 1

# --- Finalize Bands ---
for skill in performance_log:
    performance_log[skill]["final_band"] = current_band_per_skill[skill]
    correct = performance_log[skill]["correct_answers"]
    total = performance_log[skill]["questions_attempted"]
    performance_log[skill]["accuracy_percent"] = round((correct / total) * 100, 2) if total > 0 else 0.0

# --- Reports ---
print("\n📊 Candidate Report (Simple Summary):")
for skill, stats in performance_log.items():
    print(f"\n🔹 {skill.replace('_', ' ')}")
    print(f"Questions: {stats['questions_attempted']} | Correct: {stats['correct_answers']} | Accuracy: {stats['accuracy_percent']}%")

print("\n📈 Recruiter Report (Detailed Data):")
for skill, stats in performance_log.items():
    print(f"\n--- Skill: {skill.replace('_', ' ')} ---")
    print(f"Initial Band: {initial_band_per_skill[skill]}")
    print(f"Final Band: {stats['final_band']}")
    print(f"Accuracy: {stats['accuracy_percent']}%")
    print(f"Total Time Spent: {stats['time_spent']} sec")
    for i, r in enumerate(stats["responses"], 1):
        print(f"Q{i}: {'✅' if r['is_correct'] else '❌'} | Band: {r['band']} | Time: {r['time_taken']} sec")

# Optionally, you can export performance_log as JSON for future visualization
with open("recruiter_report.json", "w") as f:
    json.dump(performance_log, f, indent=2)

print("\n✅ Assessment Completed. Good luck for your results!")
