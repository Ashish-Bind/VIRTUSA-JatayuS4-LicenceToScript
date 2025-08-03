from app import db
from werkzeug.security import generate_password_hash

class Superadmin(db.Model):
    __tablename__ = 'superadmins'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    otp_secret = db.Column(db.String(32), nullable=True)
    mfa_enabled = db.Column(db.Boolean, nullable=False, default=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        from werkzeug.security import check_password_hash
        return check_password_hash(self.password_hash, password)