from app import db

class RequiredSkill(db.Model):
    __tablename__ = 'required_skills'

    job_id = db.Column(db.Integer, db.ForeignKey('job_descriptions.job_id'), primary_key=True)
    skill_id = db.Column(db.Integer, db.ForeignKey('skills.skill_id'), primary_key=True)
    priority = db.Column(db.Integer, nullable=False)
    
    # Relationship to Skill
    skill = db.relationship('Skill', backref='required_skills')

    def __repr__(self):
        return f'<RequiredSkill job_id={self.job_id} skill_id={self.skill_id} priority={self.priority}>'