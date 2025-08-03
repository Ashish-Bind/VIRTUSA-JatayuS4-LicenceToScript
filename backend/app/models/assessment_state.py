from app import db
from sqlalchemy.dialects.postgresql import JSONB

class AssessmentState(db.Model):
    __tablename__ = 'assessment_states'

    attempt_id = db.Column(db.Integer, db.ForeignKey('assessment_attempts.attempt_id'), primary_key=True)
    state = db.Column(JSONB, nullable=False)
    skill_count = db.Column(db.Integer, nullable=False, default=1)
    expiry_date = db.Column(db.DateTime, nullable=True)

    def __repr__(self):
        return f'<AssessmentState attempt_id={self.attempt_id}>'