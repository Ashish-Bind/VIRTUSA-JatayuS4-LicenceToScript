# helpers.py (unchanged, for reference)
import os
import json
import re

def clean_entry(entry):
    entry = entry.strip().replace('\n', ' ').replace('\\n', ' ')
    return ' '.join(entry.split())

def parse_question_block(block):
    lines = [line.strip() for line in block.strip().split("\n") if line.strip()]
    if len(lines) < 6:
        print(f"Invalid question format (too few lines, got {len(lines)}): {block}")
        return None
    
    option_start = next((i for i, line in enumerate(lines) if re.match(r'^\(A\)\s*', line)), len(lines))
    question = clean_entry(' '.join(lines[:option_start]))
    
    option_lines = lines[option_start:option_start+4]
    if len(option_lines) != 4:
        print(f"Invalid question format (wrong number of options, got {len(option_lines)}): {block}")
        return None
    
    options = [re.sub(r'^\([A-D]\)\s*', '', opt).strip() for opt in option_lines]
    
    correct_line = lines[option_start+4] if option_start+4 < len(lines) else ""
    match = re.search(r'Correct Answer:\s*\(([A-D])\)\s*$', correct_line)
    if not match:
        print(f"Invalid correct answer format in line: '{correct_line}'")
        return None
    
    correct_answer = match.group(1)
    if correct_answer not in ['A', 'B', 'C', 'D']:
        print(f"Invalid correct_answer value: '{correct_answer}'")
        return None
    
    return {
        "question": question,
        "options": options,
        "answer": options[ord(correct_answer) - ord('A')],
        "option_a": options[0],
        "option_b": options[1],
        "option_c": options[2],
        "option_d": options[3],
        "correct_answer": correct_answer
    }

def fix_file(path):
    with open(path, "r") as f:
        raw_text = f.read()

    raw_text = raw_text.replace("python\n[", "").replace("]", "")
    question_blocks = re.findall(r'"(.*?)",\s*"(.*?)",\s*"(.*?)",?', raw_text, re.DOTALL)

    fixed_questions = []
    for block in question_blocks:
        cleaned_block = [clean_entry(item) for item in block]
        try:
            parsed = parse_question_block("\n".join(cleaned_block))
            if parsed:
                fixed_questions.append(parsed)
        except Exception as e:
            print(f"Error processing block: {block}, Error: {e}")

    with open(path, "w") as f:
        json.dump(fixed_questions, f, indent=2)

def fix_all_batches():
    folder = "question_batches"
    for file in os.listdir(folder):
        if file.endswith(".json"):
            print(f"🔧 Fixing {file}...")
            fix_file(os.path.join(folder, file))
    print("✅ All question files fixed.")