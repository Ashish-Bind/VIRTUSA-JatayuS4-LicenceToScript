from app import db
from datetime import datetime

class Payment(db.Model):
    __tablename__ = 'payments'
    id = db.Column(db.Integer, primary_key=True)
    recruiter_id = db.Column(db.Integer, db.ForeignKey('recruiters.recruiter_id'), nullable=False)
    order_id = db.Column(db.String(50), nullable=False)
    payment_id = db.Column(db.String(50), nullable=True)
    amount = db.Column(db.Float, nullable=False)
    currency = db.Column(db.String(3), nullable=False, default='INR')
    status = db.Column(db.String(20), nullable=False, default='created')
    plan_id = db.Column(db.Integer, db.ForeignKey('subscription_plans.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    subscription_plan = db.relationship('SubscriptionPlan', backref='payments')

    def __repr__(self):
        return f'<Payment id={self.id}, order_id={self.order_id}, status={self.status}>'