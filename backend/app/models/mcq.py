from app import db

class MCQ(db.Model):
    __tablename__ = 'mcqs'
    
    mcq_id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey('job_descriptions.job_id'), nullable=False)
    skill_id = db.Column(db.Integer, db.ForeignKey('skills.skill_id'), nullable=False)
    question = db.Column(db.Text, nullable=False)
    option_a = db.Column(db.Text, nullable=False)
    option_b = db.Column(db.Text, nullable=False)
    option_c = db.Column(db.Text, nullable=False)
    option_d = db.Column(db.Text, nullable=False)
    correct_answer = db.Column(db.String(1), nullable=False)  # 'A', 'B', 'C', or 'D'
    difficulty_band = db.Column(db.String(20), nullable=False)  # 'good', 'better', 'perfect'

    # Relationships
    skill = db.relationship('Skill', backref='mcqs')
    job = db.relationship('JobDescription', backref='mcqs')