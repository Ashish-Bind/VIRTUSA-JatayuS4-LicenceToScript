import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import {
  Mail,
  AlertTriangle,
  CheckCircle,
  Clock,
  Edit2,
  Save,
  Calendar,
  Users,
  FileText,
  Award,
  TrendingUp,
  Building2,
} from 'lucide-react'
import Chart from 'chart.js/auto'
import { baseUrl } from './utils/utils'

const SubscriptionDetails = () => {
  const { id } = useParams()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedData, setEditedData] = useState({})
  const [availablePlans, setAvailablePlans] = useState([])
  const chartRef = useRef(null)
  const chartInstance = useRef(null)

  useEffect(() => {
    if (!user || user.role !== 'superadmin') {
      navigate('/superadmin/login')
    } else {
      const fetchData = async () => {
        try {
          setLoading(true)
          const [subscriptionResponse, plansResponse] = await Promise.all([
            fetch(`${baseUrl}/superadmin/clients/${id}/subscription`, {
              credentials: 'include',
            }),
            fetch(`${baseUrl}/superadmin/subscription-plans`, {
              credentials: 'include',
            }),
          ])
          if (!subscriptionResponse.ok)
            throw new Error('Failed to fetch subscription details')
          if (!plansResponse.ok)
            throw new Error('Failed to fetch subscription plans')
          const subscriptionData = await subscriptionResponse.json()
          const plansData = await plansResponse.json()
          console.log('Fetched subscription data:', subscriptionData)
          console.log('Fetched plans data:', plansData)
          setSubscription(subscriptionData)
          setEditedData(subscriptionData) // Initialize edited data with fetched data
          setAvailablePlans(plansData)
        } catch (err) {
          setError(err.message)
        } finally {
          setLoading(false)
        }
      }
      fetchData()
    }
  }, [user, navigate, id])

  useEffect(() => {
    if (subscription && chartRef.current) {
      const ctx = chartRef.current.getContext('2d')
      if (chartInstance.current) {
        chartInstance.current.destroy()
      }
      const daysRemaining = subscription?.subscription_end_date
        ? Math.max(
            0,
            Math.ceil(
              (new Date(subscription.subscription_end_date) - new Date()) /
                (1000 * 60 * 60 * 24)
            )
          )
        : 0

      const totalDays = subscription.expiry_days || 30
      const usedDays = Math.max(0, totalDays - daysRemaining)

      chartInstance.current = new Chart(ctx, {
        type: 'doughnut',
        data: {
          datasets: [
            {
              data: [daysRemaining, usedDays],
              backgroundColor: [
                daysRemaining <= 7
                  ? '#ef4444'
                  : daysRemaining <= 30
                  ? '#f59e0b'
                  : '#10b981',
                '#e5e7eb',
              ],
              borderWidth: 0,
            },
          ],
        },
        options: {
          cutout: '75%',
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
          responsive: true,
          maintainAspectRatio: false,
        },
      })
    }
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy()
      }
    }
  }, [subscription])

  const handleSendRenewalEmail = async () => {
    try {
      const response = await fetch(
        `${baseUrl}/superadmin/send-renewal-email/${id}`,
        {
          method: 'POST',
          credentials: 'include',
        }
      )
      if (!response.ok) throw new Error('Failed to send renewal email')
      alert('Renewal email sent successfully')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEditToggle = () => {
    setIsEditing(!isEditing)
    if (!isEditing) {
      setEditedData({ ...subscription }) // Reset edited data to current subscription on edit start
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setEditedData((prev) => ({ ...prev, [name]: value }))
  }

  const handlePlanChange = (e) => {
    const selectedPlanId = e.target.value
    const selectedPlan = availablePlans.find(
      (plan) => plan.id === parseInt(selectedPlanId)
    )
    if (selectedPlan) {
      setEditedData((prev) => ({
        ...prev,
        subscription_plan_id: selectedPlan.id,
        candidate_limit: selectedPlan.candidate_limit,
        assessment_limit: selectedPlan.assessment_limit,
        skill_limit: selectedPlan.skill_limit,
        price: selectedPlan.price,
        basic_reports: selectedPlan.basic_reports,
        ai_reports: selectedPlan.ai_reports,
        expiry_days: selectedPlan.expiry_days,
        subscription_start_date: new Date().toISOString().split('T')[0], // Reset start date
        subscription_end_date: new Date(
          new Date().setDate(new Date().getDate() + selectedPlan.expiry_days)
        )
          .toISOString()
          .split('T')[0], // Set new end date
      }))
    }
  }

  const handleSave = async () => {
    const formData = new FormData()
    Object.keys(editedData).forEach((key) => {
      if (key !== 'logo' && editedData[key] !== subscription[key]) {
        formData.append(key, editedData[key])
      }
    })
    if (editedData.logo instanceof File) {
      formData.append('logo', editedData.logo)
    }
    if (editedData.subscription_start_date) {
      formData.append(
        'subscription_start_date',
        editedData.subscription_start_date
      )
    }
    if (editedData.subscription_end_date) {
      formData.append('subscription_end_date', editedData.subscription_end_date)
    }

    try {
      const response = await fetch(`${baseUrl}/superadmin/clients/${id}`, {
        method: 'PUT',
        credentials: 'include',
        body: formData,
      })
      if (!response.ok) throw new Error('Failed to update client')
      const data = await response.json()
      console.log('Save response:', data) // Debug the response
      setSubscription((prev) => ({ ...prev, ...data })) // Merge updated data into current state
      setIsEditing(false)
      alert('Client updated successfully')
    } catch (err) {
      setError(err.message)
    }
  }

  const daysRemaining = subscription?.subscription_end_date
    ? Math.max(
        0,
        Math.ceil(
          (new Date(subscription.subscription_end_date) - new Date()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 0
  const isExpiringSoon = daysRemaining <= 7 && daysRemaining > 0
  const isExpired = daysRemaining === 0
  const assessmentCount = subscription?.current_assessment_count || 0
  const candidateCount = subscription?.current_candidate_count || 0
  const assessmentLimit = subscription?.assessment_limit || 0
  const candidateLimit = subscription?.candidate_limit || 0
  const skillLimit = subscription?.skill_limit || 0

  // Calculate usage percentages
  const assessmentUsage =
    assessmentLimit > 0 ? (assessmentCount / assessmentLimit) * 100 : 0
  const candidateUsage =
    candidateLimit > 0 ? (candidateCount / candidateLimit) * 100 : 0

  console.log('Rendering with subscription:', subscription)

  if (loading)
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-lg text-gray-700 dark:text-gray-300">
            Loading subscription details...
          </p>
        </div>
      </div>
    )

  if (error)
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl border border-red-200 dark:border-red-800">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <p className="text-xl text-red-600 dark:text-red-400 font-semibold">
            Error: {error}
          </p>
        </div>
      </div>
    )

  if (!subscription || Object.keys(subscription).length === 0)
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl">
          <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <p className="text-xl text-gray-600 dark:text-gray-400">
            No subscription data available
          </p>
        </div>
      </div>
    )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-800 dark:to-gray-900 transition-colors duration-300">
      <Navbar />

      <div className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
              Subscription Dashboard
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              Manage and monitor subscription details
            </p>
          </div>

          {/* Client Header Card */}
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 mb-8 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8">
              <div className="flex items-center">
                {isEditing ? (
                  <div className="relative group">
                    <input
                      type="file"
                      name="logo"
                      onChange={(e) =>
                        setEditedData((prev) => ({
                          ...prev,
                          logo: e.target.files[0],
                        }))
                      }
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="h-24 w-24 rounded-2xl bg-white/20 backdrop-blur-sm border-2 border-white/30 mr-6 flex items-center justify-center text-white text-sm font-medium group-hover:bg-white/30 transition-all">
                      Click to upload
                    </div>
                  </div>
                ) : subscription.logo ? (
                  <img
                    src={`https://storage.googleapis.com/gen-ai-quiz/uploads/${subscription.logo}`}
                    alt="Client Logo"
                    className="h-24 w-24 rounded-2xl mr-6 object-cover border-4 border-white/30 shadow-xl"
                    onError={(e) => console.log('Image load error:', e)}
                  />
                ) : (
                  <div className="h-24 w-24 rounded-2xl bg-white/20 backdrop-blur-sm border-2 border-white/30 mr-6 flex items-center justify-center text-white shadow-xl">
                    <Building2 className="h-10 w-10" />
                  </div>
                )}
                <div className="flex-1">
                  <h2 className="text-3xl font-bold text-white mb-2">
                    {isEditing ? (
                      <input
                        name="name"
                        value={editedData.name || ''}
                        onChange={handleInputChange}
                        className="bg-white/20 backdrop-blur-sm border border-white/30 text-white placeholder-white/70 p-3 rounded-xl w-full text-2xl font-bold"
                        placeholder="Client Name"
                      />
                    ) : (
                      subscription.name || 'Unknown Client'
                    )}
                  </h2>
                  <p className="text-white/80 text-lg">
                    {isEditing ? (
                      <input
                        name="company"
                        value={editedData.company || ''}
                        onChange={handleInputChange}
                        className="bg-white/20 backdrop-blur-sm border border-white/30 text-white placeholder-white/70 p-2 rounded-lg w-full"
                        placeholder="Company Name"
                      />
                    ) : (
                      subscription.company || 'No company specified'
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Plan Details and Usage */}
            <div className="lg:col-span-2 space-y-8">
              {/* Plan Information */}
              <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 p-8">
                <div className="flex items-center mb-6">
                  <Award className="h-8 w-8 text-blue-600 mr-3" />
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Subscription Plan
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 p-4 rounded-2xl">
                      <div className="flex items-center mb-2">
                        <Award className="h-5 w-5 text-blue-600 mr-2" />
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          Plan Name
                        </p>
                      </div>
                      {isEditing ? (
                        <select
                          name="subscription_plan_id"
                          value={editedData.subscription_plan_id || ''}
                          onChange={handlePlanChange}
                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-semibold"
                        >
                          <option value="" disabled>
                            Select a plan
                          </option>
                          {availablePlans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-xl font-bold text-gray-900 dark:text-white">
                          {subscription.plan_name || 'N/A'}
                        </p>
                      )}
                    </div>

                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 p-4 rounded-2xl">
                      <div className="flex items-center mb-2">
                        <Calendar className="h-5 w-5 text-green-600 mr-2" />
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          Start Date
                        </p>
                      </div>
                      {isEditing ? (
                        <input
                          type="date"
                          name="subscription_start_date"
                          value={
                            editedData.subscription_start_date?.split('T')[0] ||
                            ''
                          }
                          onChange={handleInputChange}
                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-semibold"
                        />
                      ) : (
                        <p className="text-xl font-bold text-gray-900 dark:text-white">
                          {subscription.subscription_start_date?.split(
                            'T'
                          )[0] || 'N/A'}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 p-4 rounded-2xl">
                      <div className="flex items-center mb-2">
                        <Calendar className="h-5 w-5 text-purple-600 mr-2" />
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          End Date
                        </p>
                      </div>
                      {isEditing ? (
                        <input
                          type="date"
                          name="subscription_end_date"
                          value={
                            editedData.subscription_end_date?.split('T')[0] ||
                            ''
                          }
                          onChange={handleInputChange}
                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-semibold"
                        />
                      ) : (
                        <p className="text-xl font-bold text-gray-900 dark:text-white">
                          {subscription.subscription_end_date?.split('T')[0] ||
                            'N/A'}
                        </p>
                      )}
                    </div>

                    <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/30 p-4 rounded-2xl">
                      <div className="flex items-center mb-2">
                        <TrendingUp className="h-5 w-5 text-orange-600 mr-2" />
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          Skills Limit
                        </p>
                      </div>
                      {isEditing ? (
                        <input
                          name="skill_limit"
                          type="number"
                          value={editedData.skill_limit || 0}
                          onChange={handleInputChange}
                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-semibold"
                        />
                      ) : (
                        <p className="text-xl font-bold text-gray-900 dark:text-white">
                          {skillLimit}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Usage Statistics */}
              <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 p-8">
                <div className="flex items-center mb-6">
                  <TrendingUp className="h-8 w-8 text-green-600 mr-3" />
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Usage Statistics
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Assessments Usage */}
                  <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 p-6 rounded-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <FileText className="h-6 w-6 text-blue-600 mr-2" />
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                          Assessments
                        </span>
                      </div>
                      <div className="text-right">
                        {isEditing ? (
                          <input
                            name="assessment_limit"
                            type="number"
                            value={editedData.assessment_limit || 0}
                            onChange={handleInputChange}
                            className="w-20 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold text-center"
                          />
                        ) : (
                          <span className="text-2xl font-bold text-gray-900 dark:text-white">
                            {assessmentCount}/{assessmentLimit}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 mb-2">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-cyan-500 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, assessmentUsage)}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {Math.round(assessmentUsage)}% used
                    </p>
                  </div>

                  {/* Candidates Usage */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 p-6 rounded-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <Users className="h-6 w-6 text-green-600 mr-2" />
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                          Candidates
                        </span>
                      </div>
                      <div className="text-right">
                        {isEditing ? (
                          <input
                            name="candidate_limit"
                            type="number"
                            value={editedData.candidate_limit || 0}
                            onChange={handleInputChange}
                            className="w-20 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold text-center"
                          />
                        ) : (
                          <span className="text-2xl font-bold text-gray-900 dark:text-white">
                            {candidateCount}/{candidateLimit}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 mb-2">
                      <div
                        className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, candidateUsage)}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {Math.round(candidateUsage)}% used
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Time Remaining and Actions */}
            <div className="space-y-8">
              {/* Time Remaining Card */}
              <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center">
                    <Clock className="h-8 w-8 text-indigo-600 mr-3" />
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Time Remaining
                    </h3>
                  </div>
                  {isExpiringSoon && (
                    <span className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center shadow-lg">
                      <AlertTriangle className="w-3 h-3 mr-1" /> Expiring Soon
                    </span>
                  )}
                  {isExpired && (
                    <span className="bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center shadow-lg">
                      <AlertTriangle className="w-3 h-3 mr-1" /> Expired
                    </span>
                  )}
                  {!isExpiringSoon && !isExpired && (
                    <span className="bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center shadow-lg">
                      <CheckCircle className="w-3 h-3 mr-1" /> Active
                    </span>
                  )}
                </div>

                <div className="relative">
                  <div className="w-48 h-48 mx-auto relative">
                    <canvas ref={chartRef} className="w-full h-full"></canvas>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-gray-900 dark:text-white">
                          {daysRemaining}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          days left
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions Card */}
              <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 p-8">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                  Actions
                </h3>
                <div className="space-y-4">
                  <button
                    onClick={handleSendRenewalEmail}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-4 rounded-2xl flex items-center justify-center font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
                  >
                    <Mail className="w-5 h-5 mr-3" /> Send Renewal Email
                  </button>

                  {isEditing ? (
                    <button
                      onClick={handleSave}
                      className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white px-6 py-4 rounded-2xl flex items-center justify-center font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
                    >
                      <Save className="w-5 h-5 mr-3" /> Save Changes
                    </button>
                  ) : (
                    <button
                      onClick={handleEditToggle}
                      className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-6 py-4 rounded-2xl flex items-center justify-center font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
                    >
                      <Edit2 className="w-5 h-5 mr-3" /> Edit Details
                    </button>
                  )}

                  <Link
                    to="/admin"
                    className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white px-6 py-4 rounded-2xl flex items-center justify-center font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 block text-center"
                  >
                    ← Back to Dashboard
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SubscriptionDetails
