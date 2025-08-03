from app import db
from datetime import datetime

class ProctoringViolation(db.Model):
    __tablename__ = 'proctoring_violation'

    violation_id = db.Column(db.Integer, primary_key=True)
    attempt_id = db.Column(db.Integer, db.ForeignKey('assessment_attempts.attempt_id'), nullable=False)
    snapshot_path = db.Column(db.String(255), nullable=False)
    violation_type = db.Column(db.String(50), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f"<ProctoringViolation {self.violation_id} - Attempt {self.attempt_id} - {self.violation_type}>"
