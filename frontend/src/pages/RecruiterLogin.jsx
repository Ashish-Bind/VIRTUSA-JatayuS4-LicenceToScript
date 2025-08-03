// RecruiterLogin.jsx
import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, ArrowRight, Clock, Key } from 'lucide-react'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import Button from '../components/Button'

const RecruiterLogin = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [showOtpForm, setShowOtpForm] = useState(false)
  const [otpEmail, setOtpEmail] = useState('')
  const [otpReason, setOtpReason] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { user, recruiterLogin, verifyRecruiterOtp, checkAuth } = useAuth()

  // Check authentication status on mount and handle OTP enforcement
  useEffect(() => {
    if (user) {
      if (user.role === 'recruiter' && user.requires_otp_verification) {
        setShowOtpForm(true)
        setOtpEmail(user.email)
        setOtpReason('Please complete OTP verification to access your account.')
        setError('Please complete OTP verification to access your account.')
      } else {
        navigate('/recruiter/dashboard')
      }
    }
  }, [user, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await recruiterLogin(email, password)
      if (response.enforce_otp_verification) {
        setShowOtpForm(true)
        setOtpEmail(response.email)
        setOtpReason(
          response.otp_reason || 'Please enter the OTP sent to your email.'
        )
        setError(
          response.otp_reason || 'Please enter the OTP sent to your email.'
        )
        setLoading(false)
        return
      }
      navigate('/recruiter/dashboard')
    } catch (err) {
      setError(err.message || 'An error occurred during login')
    } finally {
      setLoading(false)
    }
  }

  const handleOtpSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const success = await verifyRecruiterOtp(otpEmail, otp)
      if (success) {
        // Refresh auth state to get updated user data
        await checkAuth()
        navigate('/recruiter/dashboard')
      }
    } catch (err) {
      setError(err.message || 'OTP verification failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 flex flex-col font-sans">
      <Navbar userType="none" />
      <div className="flex-grow flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-lg mx-auto w-full">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent">
              Recruiter Login
            </h2>
          </div>

          <div className="bg-white dark:bg-gray-900/70 backdrop-blur-sm rounded-xl shadow-md border border-gray-200 dark:border-gray-800 p-8 hover:shadow-2xl transition-all duration-300">
            {!showOtpForm ? (
              <form className="space-y-6" onSubmit={handleSubmit}>
                {error && (
                  <div className="text-red-500 text-base text-center bg-red-100/50 dark:bg-red-900/50 rounded-xl py-2">
                    {error}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="email"
                    className="block text-lg font-medium text-gray-700 dark:text-gray-200 mb-2"
                  >
                    Work email address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                      <Mail className="h-5 w-5 text-indigo-600 dark:text-indigo-200" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full text-lg pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                      placeholder="you@company.com"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-lg font-medium text-gray-700 dark:text-gray-200 mb-2"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                      <Lock className="h-5 w-5 text-indigo-600 dark:text-indigo-200" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full text-lg pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-base">
                    <Link
                      to="/forgot-password"
                      className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-all duration-200"
                    >
                      Forgot your password?
                    </Link>
                  </div>
                </div>

                <div>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform"
                  >
                    {loading ? (
                      <Clock className="w-6 h-6 animate-spin" />
                    ) : (
                      <>
                        {'Sign in'}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <form className="space-y-6" onSubmit={handleOtpSubmit}>
                {error && (
                  <div className="text-red-500 text-base text-center bg-red-100/50 dark:bg-red-900/50 rounded-xl py-2">
                    {error}
                  </div>
                )}

                <div className="text-center">
                  <p className="text-lg text-gray-700 dark:text-gray-200">
                    {otpReason}
                  </p>
                  <p className="text-base text-gray-500 dark:text-gray-400">
                    An OTP has been sent to {otpEmail}.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="otp"
                    className="block text-lg font-medium text-gray-700 dark:text-gray-200 mb-2"
                  >
                    Enter OTP
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                      <Key className="h-5 w-5 text-indigo-600 dark:text-indigo-200" />
                    </div>
                    <input
                      id="otp"
                      name="otp"
                      type="text"
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      className="w-full text-lg pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                      placeholder="Enter 6-digit OTP"
                    />
                  </div>
                </div>

                <div>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform"
                  >
                    {loading ? (
                      <Clock className="w-6 h-6 animate-spin" />
                    ) : (
                      <>
                        {'Verify OTP'}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setShowOtpForm(false)
                      setOtp('')
                      setError('')
                      setOtpReason('')
                    }}
                    className="w-full bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-gray-100 px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-400 dark:hover:bg-gray-500 transition-all duration-300"
                  >
                    {'Back to Login'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default RecruiterLogin
