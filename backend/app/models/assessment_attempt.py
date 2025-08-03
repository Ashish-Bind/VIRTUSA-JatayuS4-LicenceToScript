from app import db
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB

class AssessmentAttempt(db.Model):
    __tablename__ = 'assessment_attempts'

    attempt_id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey('candidates.candidate_id'), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey('job_descriptions.job_id'), nullable=False)
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime)
    status = db.Column(db.String(20), default='started')
    performance_log = db.Column(JSONB)
    db.relationship('AssessmentProctoringData', backref='attempt', uselist=False)

    def __repr__(self):
        return f'<AssessmentAttempt {self.attempt_id} for Candidate {self.candidate_id}>'