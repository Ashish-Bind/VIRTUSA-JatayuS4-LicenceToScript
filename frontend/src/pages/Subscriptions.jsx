import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useRazorpay } from 'react-razorpay'
import { CheckCircle, DollarSign } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import { baseUrl } from '../utils/utils'

const Subscriptions = () => {
  const { user } = useAuth()
  const { Razorpay } = useRazorpay()
  const [plans, setPlans] = useState([])
  const [paymentHistory, setPaymentHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch plans
  useEffect(() => {
    const fetchPlans = async () => {
      setLoading(true)
      try {
        const response = await axios.get(`${baseUrl}/subscriptions/plans`, {
          headers: { 'Content-Type': 'application/json' },
        })
        setPlans(response.data)
      } catch (err) {
        setError('Failed to load plans')
        console.error('Error fetching plans:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchPlans()
  }, [])

  // Fetch payment history
  useEffect(() => {
    const fetchPaymentHistory = async () => {
      setLoading(true)
      try {
        const response = await axios.get(
          `${baseUrl}/subscriptions/payment-history/${user.id}`,
          {
            headers: { 'Content-Type': 'application/json' },
          }
        )
        setPaymentHistory(response.data)
      } catch (err) {
        setError('Failed to load payment history')
        console.error('Error fetching payment history:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchPaymentHistory()
  }, [user])

  // Initiate payment
  const initiatePayment = async (planId) => {
    setLoading(true)
    setError(null)
    try {
      const response = await axios.post(
        `${baseUrl}/subscriptions/create-order`,
        { plan_id: planId, user_id: user.id },
        { headers: { 'Content-Type': 'application/json' } }
      )
      const orderData = response.data

      const options = {
        key: orderData.razorpay_key,
        amount: orderData.amount,
        currency: orderData.currency,
        order_id: orderData.order_id,
        name: 'Your Company Name',
        description: `Subscription for Plan ID ${orderData.plan_id}`,
        image: '/logo.png',
        handler: async (razorpayResponse) => {
          try {
            const verifyResponse = await axios.post(
              `${baseUrl}/subscriptions/verify-payment`,
              {
                order_id: razorpayResponse.razorpay_order_id,
                payment_id: razorpayResponse.razorpay_payment_id,
                signature: razorpayResponse.razorpay_signature,
                recruiter_id: orderData.recruiter_id,
                plan_id: orderData.plan_id,
              },
              { headers: { 'Content-Type': 'application/json' } }
            )
            if (verifyResponse.data.status === 'success') {
              alert('Payment successful! Subscription activated.')
              const historyResponse = await axios.get(
                `${baseUrl}/subscriptions/payment-history/${user.id}`
              )
              setPaymentHistory(historyResponse.data)
            } else {
              setError(
                'Payment verification failed: ' + verifyResponse.data.error
              )
            }
          } catch (err) {
            setError('An error occurred during payment verification')
            console.error('Error verifying payment:', err)
          }
        },
        prefill: {
          name: user.name || 'User Name',
          email: user.email || 'user@example.com',
          contact: user.phone || '9999999999',
        },
        theme: { color: '#6d28d9' },
      }

      const rzp = new Razorpay(options)
      rzp.open()
    } catch (err) {
      setError('Failed to initiate payment')
      console.error('Error initiating payment:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-900 dark:text-gray-100 text-xl font-medium">
            Loading subscriptions...
          </p>
        </div>
      </div>
    )

  if (error)
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-red-50 to-pink-50 dark:from-gray-900 dark:to-red-900">
        <div className="text-center p-8 bg-white/70 dark:bg-gray-800/70 rounded-2xl shadow-xl border border-red-200 dark:border-red-700 backdrop-blur-lg">
          <div className="text-red-500 dark:text-red-400 text-6xl mb-4">⚠️</div>
          <p className="text-red-600 dark:text-red-400 text-xl font-medium">
            Error: {error}
          </p>
        </div>
      </div>
    )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 flex flex-col font-sans">
      <Navbar />
      <div className="flex-grow py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-6">
              <div className="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
                <DollarSign className="w-12 h-12 text-white" />
              </div>
            </div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent mb-4">
              Subscription Plans
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-lg max-w-2xl mx-auto">
              Choose a plan that suits your needs and manage your subscriptions
              effortlessly
            </p>
          </div>

          {/* Plans Section */}
          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-12 hover:shadow-2xl transition-all duration-300">
            <div className="flex items-center mb-8">
              <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                <DollarSign className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Available Plans
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Explore our subscription options
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {plans.length > 0 &&
                plans.map((plan) => (
                  <div
                    key={plan.id}
                    className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-8 hover:shadow-2xl hover:scale-105 transition-all duration-300"
                  >
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                      {plan.name}
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-2">
                      Price: ₹{plan.price.toLocaleString('en-IN')}
                    </p>
                    <p className="text-gray-600 dark:text-gray-400 mb-2">
                      Candidates: {plan.candidate_limit}
                    </p>
                    <p className="text-gray-600 dark:text-gray-400 mb-2">
                      Assessments: {plan.assessment_limit}
                    </p>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      AI Reports: {plan.ai_reports ? 'Yes' : 'No'}
                    </p>
                    <button
                      onClick={() => initiatePayment(plan.id)}
                      className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      disabled={loading}
                    >
                      {user.subscription_plan === plan.name ? (
                        <CheckCircle className="w-5 h-5 mr-2" />
                      ) : (
                        <DollarSign className="w-5 h-5 mr-2" />
                      )}
                      {user.subscription_plan === plan.name
                        ? 'You are already subscribed'
                        : 'Subscribe'}
                    </button>
                  </div>
                ))}
            </div>
          </div>

          {/* Payment History Section */}
          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 hover:shadow-2xl transition-all duration-300">
            <div className="flex items-center mb-8">
              <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Payment History
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  View your past transactions
                </p>
              </div>
            </div>
            {paymentHistory.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400 text-center">
                No payment history available
              </p>
            ) : (
              <div className="space-y-6">
                {paymentHistory.map((payment) => (
                  <div
                    key={payment.id}
                    className="bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm rounded-2xl shadow-md border border-gray-200/50 dark:border-gray-700/50 p-6 hover:bg-gray-50/50 dark:hover:bg-gray-600/50 transition-all duration-150"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-gray-600 dark:text-gray-400">
                          Payment ID:{' '}
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {payment.id}
                          </span>
                        </p>
                        <p className="text-gray-600 dark:text-gray-400">
                          Order ID:{' '}
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {payment.order_id}
                          </span>
                        </p>
                        <p className="text-gray-600 dark:text-gray-400">
                          Payment ID (Razorpay):{' '}
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {payment.payment_id || 'Pending'}
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600 dark:text-gray-400">
                          Amount:{' '}
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            ₹{payment.amount.toLocaleString('en-IN')}
                          </span>
                        </p>
                        <p className="text-gray-600 dark:text-gray-400">
                          Status:{' '}
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {payment.status}
                          </span>
                          {payment.status === 'captured' && (
                            <CheckCircle className="inline w-5 h-5 text-emerald-500 ml-2" />
                          )}
                        </p>
                        <p className="text-gray-600 dark:text-gray-400">
                          Plan:{' '}
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {payment.plan_name}
                          </span>
                        </p>
                        <p className="text-gray-600 dark:text-gray-400">
                          Date:{' '}
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {new Date(payment.created_at).toLocaleString()}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Subscriptions
