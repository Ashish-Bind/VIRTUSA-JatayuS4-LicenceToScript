from app import db

class Skill(db.Model):
    __tablename__ = 'skills'
    
    skill_id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), unique=True, nullable=False)
    category = db.Column(db.String(255))