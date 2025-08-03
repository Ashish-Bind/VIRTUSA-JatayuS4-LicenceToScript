from app import db
from datetime import datetime, timedelta

class Recruiter(db.Model):
    __tablename__ = 'recruiters'
    recruiter_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), unique=True, nullable=False)
    company = db.Column(db.String(100))
    phone = db.Column(db.String(20))
    status = db.Column(db.String(20), server_default='Active')
    subscription_plan_id = db.Column(db.Integer, db.ForeignKey('subscription_plans.id'), nullable=True)
    current_candidate_count = db.Column(db.Integer, default=0)
    current_assessment_count = db.Column(db.Integer, default=0)
    subscription_start_date = db.Column(db.DateTime, nullable=True)
    subscription_end_date = db.Column(db.DateTime, nullable=True)
    logo = db.Column(db.String(255), nullable=True)
    requires_otp_verification = db.Column(db.Boolean, default=False) 

    user = db.relationship('User', backref=db.backref('recruiter', uselist=False))
    subscription_plan = db.relationship('SubscriptionPlan', backref='recruiters')
    payments = db.relationship('Payment', backref='recruiter', lazy=True)  # Add relationship to Payment model

    def __repr__(self):
        return f'<Recruiter user_id={self.user_id}, company={self.company}, logo={self.logo}>'