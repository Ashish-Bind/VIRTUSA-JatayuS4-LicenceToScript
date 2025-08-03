import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Clock } from 'lucide-react'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import Button from '../components/Button'
import LinkButton from '../components/LinkButton'

const ForgotPassword = () => {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { requestPasswordReset } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      await requestPasswordReset(email)
      setMessage(
        'If an account exists for this email, a password reset link has been sent.'
      )
      setEmail('')
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
      setEmail('')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 flex flex-col font-sans">
      <Navbar userType="none" />
      <div className="flex-grow flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-lg mx-auto w-full">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent">
              Reset Your Password
            </h2>
            <p className="mt-2 text-gray-600 dark:text-gray-400 text-lg">
              Enter your email address to receive a password reset link.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-900/70 backdrop-blur-sm rounded-xl shadow-md border border-gray-200 dark:border-gray-800 p-8 hover:shadow-2xl transition-all duration-300">
            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div className="text-red-500 text-base text-center bg-red-100/50 dark:bg-red-900/50 rounded-xl py-2">
                  {error}
                </div>
              )}
              {message && (
                <div className="text-green-500 text-base text-center bg-green-100/50 dark:bg-green-900/50 rounded-xl py-2">
                  {message}
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-lg font-medium text-gray-700 dark:text-gray-200 mb-2"
                >
                  Email address
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
                    placeholder="you@example.com"
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
                    'Send Reset Link'
                  )}
                </Button>
              </div>

              <div className="text-center">
                <LinkButton
                  to="/candidate/login"
                  variant="link"
                  className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 text-base transition-all duration-200"
                >
                  Back to Login
                </LinkButton>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword
