from app import db
from datetime import datetime
class Sales(db.Model):
    tablename = 'sales'
    id = db.Column(db.Integer, primary_key=True)
    month = db.Column(db.Date, nullable=False)
    earnings = db.Column(db.Float, nullable=False)
    expenses = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)