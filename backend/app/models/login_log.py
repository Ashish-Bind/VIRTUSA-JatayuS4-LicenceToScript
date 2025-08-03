from app import db
from datetime import datetime
import pytz
import requests
import logging

logger = logging.getLogger(__name__)

class LoginLog(db.Model):
    __tablename__ = 'login_logs'
    log_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    ip_address = db.Column(db.String(100))
    city = db.Column(db.String(100))
    region = db.Column(db.String(100))
    country = db.Column(db.String(100))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    login_time = db.Column(db.DateTime(timezone=True), default=datetime.now(pytz.UTC))

    @staticmethod
    def populate_geolocation(ip_address):
        """Populate geolocation data using ip-api.com."""
        try:
            response = requests.get(f"http://ip-api.com/json/{ip_address}")
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success":
                    return {
                        "city": data.get("city", ""),
                        "region": data.get("regionName", ""),
                        "country": data.get("country", ""),
                        "latitude": data.get("lat"),
                        "longitude": data.get("lon")
                    }
                else:
                    logger.warning(f"Geolocation API failed: {data.get('message')}")
                    return None
            else:
                logger.error(f"Geolocation API request failed: {response.status_code}")
                return None
        except Exception as e:
            logger.error(f"Error fetching geolocation data: {str(e)}")
            return None
