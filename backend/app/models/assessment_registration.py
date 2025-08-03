from app import db
from datetime import datetime

class AssessmentRegistration(db.Model):
    __tablename__ = 'assessment_registrations'

    candidate_id = db.Column(db.Integer, db.ForeignKey('candidates.candidate_id'), primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey('job_descriptions.job_id'), primary_key=True)
    registration_date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    # Relationships (optional, for easier querying)
    candidate = db.relationship('Candidate', backref='assessment_registrations')
    job = db.relationship('JobDescription', backref='assessment_registrations')

    def __repr__(self):
        return f'<AssessmentRegistration candidate_id={self.candidate_id} job_id={self.job_id}>'