from flask import Blueprint, request, jsonify
from app import db, razorpay_client
from app.models.recruiter import Recruiter
from app.models.subscription_plan import SubscriptionPlan
from app.models.payment import Payment
from datetime import datetime, timedelta
import hmac
import hashlib
import os
from dotenv import load_dotenv
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

load_dotenv()
subscriptions_bp = Blueprint('subscriptions', __name__, url_prefix='/api/subscriptions')

@subscriptions_bp.route('/plans', methods=['GET'])
def get_plans():
    try:
        plans = SubscriptionPlan.query.filter_by(is_active=True).all()
        return jsonify([{
            'id': plan.id,
            'name': plan.name,
            'price': plan.price,
            'candidate_limit': plan.candidate_limit,
            'assessment_limit': plan.assessment_limit,
            'ai_reports': plan.ai_reports,
            'expiry_days': plan.expiry_days
        } for plan in plans])
    except Exception as e:
        logger.error(f"Failed to fetch plans: {str(e)}", exc_info=True)
        raise ValueError(f"Failed to fetch plans: {str(e)}")

@subscriptions_bp.route('/plan/<int:user_id>', methods=['GET'])
def get_recruiter_assessments(user_id):
    try:
        recruiter = Recruiter.query.filter_by(user_id=user_id).first()
        if not recruiter:
            logger.error(f"Recruiter not found for user_id: {user_id}")
            return jsonify({'error': 'Recruiter not found'}), 404

        subscription_plan = SubscriptionPlan.query.get(recruiter.subscription_plan_id) if recruiter.subscription_plan_id else None

        return jsonify([{
            'company': recruiter.company,
            'logo': recruiter.logo,
            'subscription_plan': {
                'name': subscription_plan.name if subscription_plan else 'None',
                'candidate_limit': subscription_plan.candidate_limit if subscription_plan else 0,
                'assessment_limit': subscription_plan.assessment_limit if subscription_plan else 0,
                'ai_reports': subscription_plan.ai_reports if subscription_plan else False,
                'start_date': recruiter.subscription_start_date.isoformat() if recruiter.subscription_start_date else None,
                'end_date': recruiter.subscription_end_date.isoformat() if recruiter.subscription_end_date else None,
                'current_candidate_count': recruiter.current_candidate_count,
                'current_assessment_count': recruiter.current_assessment_count
            }
        }])
    except Exception as e:
        logger.error(f"Failed to fetch recruiter data: {str(e)}", exc_info=True)
        return jsonify({'error': f"Failed to fetch recruiter data: {str(e)}"}), 500

@subscriptions_bp.route('/create-order', methods=['POST'])
def create_order():
    try:
        data = request.get_json()
        plan_id = data['plan_id']
        user_id = data['user_id']

        recruiter = Recruiter.query.filter_by(user_id=user_id).first()
        if not recruiter:
            logger.error(f"Recruiter not found for user_id: {user_id}")
            return jsonify({'error': 'Recruiter not found'}), 404

        
        if recruiter.subscription_plan_id != 1 and recruiter.subscription_end_date and recruiter.subscription_end_date > datetime.utcnow():
            logger.error(f"Recruiter {recruiter.user_id} already has an active subscription")
            return jsonify({'error': 'Recruiter already has an active subscription'}), 400

        plan = SubscriptionPlan.query.get(plan_id)
        if not plan or not plan.is_active:
            logger.error(f"Invalid or inactive plan: plan_id={plan_id}")
            return jsonify({'error': 'Invalid or inactive plan'}), 400

        if plan.price <= 0:
            logger.error(f"Plan {plan.name} has invalid price: {plan.price}")
            return jsonify({'error': 'Plan price must be greater than 0'}), 400
        

        order_data = {
            'amount': int(plan.price * 100),  # Convert to paise
            'currency': 'INR',
            'receipt': f'order_recruiter_{recruiter.recruiter_id}_{plan.id}',
            'notes': {
                'recruiter_id': str(recruiter.recruiter_id),
                'plan_id': str(plan.id)
            }
        }
        logger.info(f"Creating order with data: {order_data}")
        order = razorpay_client.order.create(data=order_data)

        # Create a Payment record
        payment = Payment(
            recruiter_id=recruiter.recruiter_id,
            order_id=order['id'],
            amount=plan.price,
            currency='INR',
            status='created',
            plan_id=plan.id
        )
        db.session.add(payment)
        db.session.commit()

        logger.info(f"Payment record created: order_id={order['id']}, recruiter_id={recruiter.recruiter_id}")

        return jsonify({
            'order_id': order['id'],
            'razorpay_key': os.getenv('RAZORPAY_KEY_ID'),
            'amount': order['amount'],
            'currency': order['currency'],
            'recruiter_id': recruiter.recruiter_id,
            'plan_id': plan.id,
            'payment_id': payment.id
        })
    except Exception as e:
        logger.error(f"Failed to create order: {str(e)}", exc_info=True)
        raise ValueError(f"Failed to create order: {str(e)}")

@subscriptions_bp.route('/verify-payment', methods=['POST'])
def verify_payment():
    try:
        data = request.get_json()
        order_id = data['order_id']
        payment_id = data['payment_id']
        signature = data['signature']
        recruiter_id = data['recruiter_id']
        plan_id = data['plan_id']

        # Verify signature
        generated_signature = hmac.new(
            os.getenv('RAZORPAY_KEY_SECRET').encode('utf-8'),
            f'{order_id}|{payment_id}'.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(generated_signature, signature):
            logger.error(f"Invalid signature for order_id: {order_id}, payment_id: {payment_id}")
            return jsonify({'error': 'Invalid signature'}), 400

        # Verify payment
        payment_details = razorpay_client.payment.fetch(payment_id)
        if payment_details['status'] != 'captured':
            logger.error(f"Payment not captured: payment_id={payment_id}, status={payment_details['status']}")
            return jsonify({'error': 'Payment not captured'}), 400

        # Find the Payment record
        payment = Payment.query.filter_by(order_id=order_id, recruiter_id=recruiter_id).first()
        if not payment:
            logger.error(f"Payment record not found: order_id={order_id}, recruiter_id={recruiter_id}")
            return jsonify({'error': 'Payment record not found'}), 404

        # Update Payment record
        payment.payment_id = payment_id
        payment.status = payment_details['status']
        payment.updated_at = datetime.utcnow()

        # Update Recruiter
        recruiter = Recruiter.query.filter_by(recruiter_id=recruiter_id).first()
        if not recruiter:
            logger.error(f"Recruiter not found: recruiter_id={recruiter_id}")
            return jsonify({'error': 'Recruiter not found'}), 404

        plan = SubscriptionPlan.query.get(plan_id)
        if not plan:
            logger.error(f"Invalid plan: plan_id={plan_id}")
            return jsonify({'error': 'Invalid plan'}), 400

        recruiter.subscription_plan_id = plan.id
        recruiter.subscription_start_date = datetime.utcnow()
        recruiter.subscription_end_date = datetime.utcnow() + timedelta(days=plan.expiry_days)
        recruiter.status = 'Active'
        recruiter.current_candidate_count = 0
        recruiter.current_assessment_count = 0

        db.session.commit()

        logger.info(f"Payment verified and recruiter updated: payment_id={payment_id}, recruiter_id={recruiter_id}")
        return jsonify({'status': 'success', 'payment_id': payment.id})
    except Exception as e:
        logger.error(f"Failed to verify payment: {str(e)}", exc_info=True)
        raise ValueError(f"Failed to verify payment: {str(e)}")

@subscriptions_bp.route('/payment-history/<int:user_id>', methods=['GET'])
def get_payment_history(user_id):
    try:
        recruiter = Recruiter.query.filter_by(user_id=user_id).first()
        if not recruiter:
            logger.error(f"Recruiter not found for user_id: {user_id}")
            return jsonify({'error': 'Recruiter not found'}), 404

        payments = Payment.query.filter_by(recruiter_id=recruiter.recruiter_id).all()
        return jsonify([{
            'id': payment.id,
            'order_id': payment.order_id,
            'payment_id': payment.payment_id,
            'amount': payment.amount,
            'currency': payment.currency,
            'status': payment.status,
            'plan_name': payment.subscription_plan.name,
            'created_at': payment.created_at.isoformat()
        } for payment in payments])
    except Exception as e:
        logger.error(f"Failed to fetch payment history: {str(e)}", exc_info=True)
        raise ValueError(f"Failed to fetch payment history: {str(e)}")

@subscriptions_bp.route('/test-razorpay', methods=['GET'])
def test_razorpay():
    try:
        data = {"amount": 500, "currency": "INR", "receipt": "order_rcptid_11"}
        order = razorpay_client.order.create(data=data)
        logger.info(f"Razorpay API test response: {order}")
        return jsonify({'message': 'Razorpay API accessible', 'order': order}), 200
    except Exception as e:
        logger.error(f"Razorpay API test failed: {str(e)}", exc_info=True)
        return jsonify({'error': f"Razorpay API test failed: {str(e)}"}), 500