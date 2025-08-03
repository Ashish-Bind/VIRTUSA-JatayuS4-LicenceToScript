from app import db
from datetime import datetime

class SubscriptionPlan(db.Model):
    __tablename__ = 'subscription_plans'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)
    price = db.Column(db.Float, nullable=True)
    candidate_limit = db.Column(db.Integer, nullable=False, default=10)
    assessment_limit = db.Column(db.Integer, nullable=False, default=20)
    skill_limit = db.Column(db.Integer, nullable=False, default=5)
    expiry_days = db.Column(db.Integer, nullable=False, default=30)
    basic_reports = db.Column(db.Boolean, nullable=False, default=True)
    ai_reports = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<SubscriptionPlan name={self.name}, candidate_limit={self.candidate_limit}>'