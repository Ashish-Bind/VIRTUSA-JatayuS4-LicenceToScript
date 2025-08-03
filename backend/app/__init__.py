import os
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_mail import Mail
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import logging
from functools import wraps
import razorpay
import time

# from flask_migrate import Migrate

db = SQLAlchemy()
mail = Mail()
limiter = Limiter(key_func=get_remote_address)
razorpay_client = razorpay.Client(auth=(os.getenv('RAZORPAY_KEY_ID'), os.getenv('RAZORPAY_KEY_SECRET')))

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

class ErrorHandler:
    def __init__(self, app):
        self.app = app
        self._register_handlers()

    def _register_handlers(self):
        # Global error handler for all exceptions
        @self.app.errorhandler(Exception)
        def handle_exception(e):
            # Log the error
            logger.error(f"Unhandled exception: {str(e)}", exc_info=True)

            # Prepare error response
            response = {
                "error": True,
                "message": str(e) if not hasattr(e, 'message') else e.message,
                "status_code": 500 if not hasattr(e, 'code') else e.code,
                "path": request.path,
                "method": request.method
            }

            # Customize response based on exception type if needed
            if hasattr(e, 'description'):
                response["description"] = e.description

            # Return JSON response with status code
            return jsonify(response), response["status_code"]

        # Before request hook to set up error context
        @self.app.before_request
        def before_request():
            # Add middleware-like logic here if needed (e.g., authentication checks)
            pass

        # After request hook to finalize response
        @self.app.after_request
        def after_request(response):
            # Ensure response is JSON if an error occurred
            if response.status_code >= 400:
                response.headers['Content-Type'] = 'application/json'
            return response

    def register_custom_handler(self, error_class, handler):
        """Register a custom handler for a specific exception."""
        @self.app.errorhandler(error_class)
        def custom_error_handler(e):
            logger.error(f"Custom handled exception ({error_class.__name__}): {str(e)}", exc_info=True)
            return handler(e)

# Example custom error handler function
def handle_validation_error(e):
    return jsonify({
        "error": True,
        "message": "Validation failed",
        "status_code": 400,
        "details": getattr(e, 'messages', "Invalid input")
    }), 400

def create_app():
    load_dotenv()
    app = Flask(__name__)
    app.config.from_object('app.config.Config')
    app.config.update(SESSION_COOKIE_SAMESITE='None', SESSION_COOKIE_SECURE=True)
    app.secret_key = os.getenv("SECRET_KEY", "dev-secret-key")

    @app.before_request
    def log_request():
        request.start_time = time.time()
        app.logger.info(f"[{request.method}] {request.path} from {request.remote_addr}")

    @app.after_request
    def log_response(response):
        duration = round(time.time() - request.start_time, 4)
        app.logger.info(
        f"[{response.status_code}] {request.method} {request.path} "
        f"completed in {duration}s"
    )
        return response

    # Enable CORS
    CORS(app, supports_credentials=True, origins=["http://localhost:5173","https://frontend-72964026119.asia-southeast1.run.app"])

    db.init_app(app)
    mail.init_app(app)
    limiter.init_app(app)
    
    # Initialize error handler
    error_handler = ErrorHandler(app)

    # Register a custom handler for a specific exception (e.g., ValueError)
    error_handler.register_custom_handler(ValueError, handle_validation_error)

    # Import models
    from app.models.candidate import Candidate
    from app.models.job import JobDescription
    from app.models.assessment_attempt import AssessmentAttempt
    from app.models.assessment_state import AssessmentState
    from app.models.skill import Skill
    from app.models.candidate_skill import CandidateSkill
    from app.models.required_skill import RequiredSkill
    from app.models.assessment_registration import AssessmentRegistration
    from app.models.subscription_plan import SubscriptionPlan
    from app.models.superadmin import Superadmin
    from app.models.degree import Degree
    
    # Import and register blueprints
    from app.routes.candidate import candidate_api_bp
    from app.routes.assessment import assessment_api_bp
    from app.routes.recruiter import recruiter_api_bp
    from app.routes.auth import auth_bp
    from app.routes.recruiter_analytics import recruiter_analytics_api_bp
    from app.routes.subscription import subscriptions_bp
    from app.routes.admin import admin_api_bp
    
    app.register_blueprint(recruiter_analytics_api_bp, url_prefix='/api/recruiter/analytics')
    app.register_blueprint(candidate_api_bp)
    app.register_blueprint(assessment_api_bp)
    app.register_blueprint(recruiter_api_bp)
    app.register_blueprint(subscriptions_bp)
    app.register_blueprint(admin_api_bp)
    app.register_blueprint(auth_bp, url_prefix='/api/auth')

    @app.route('/', methods=['GET'])
    def test_api():
        return jsonify({"message": "Server is Working!", "status": "ok"}), 200
    
    @app.route('/degrees', methods=['GET'])
    def get_all_degrees():
        degrees = Degree.query.all()
        return jsonify({"message": "Server is Working!",
        "degrees": [{'degree_id': degree.degree_id, 'degree_name': degree.degree_name} for degree in degrees], "status": "ok"}), 200
    
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, host='0.0.0.0', port=8080)