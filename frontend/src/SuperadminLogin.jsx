import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, ArrowRight, Clock, ShieldCheck } from 'lucide-react'
import Navbar from './components/Navbar'
import Button from './components/Button'
import { baseUrl } from './utils/utils'
import { QRCodeCanvas } from 'qrcode.react'
import { useAuth } from './context/AuthContext' // Import useAuth to access the context

const SuperadminLogin = () => {
  const navigate = useNavigate()
  const { checkAuth } = useAuth() // Destructure the checkAuth function from the context
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [step, setStep] = useState('password') // 'password', 'mfa_setup', 'mfa_verify'
  const [provisioningUri, setProvisioningUri] = useState('')

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await fetch(`${baseUrl}/superadmin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to login')
      }

      if (data.mfa_required) {
        setStep('mfa_verify')
      } else if (data.mfa_setup_required) {
        setProvisioningUri(data.provisioning_uri)
        setStep('mfa_setup')
      }
    } catch (err) {
      setError('Login failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleOtpSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await fetch(`${baseUrl}/superadmin/login/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, otp }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify OTP')
      }

      // *** THIS IS THE FIX ***
      // After successful OTP verification, manually trigger an auth check
      // to update the global user state in the AuthContext.
      await checkAuth()

      // Now that the context is guaranteed to be up-to-date, we can safely navigate.
      navigate('/admin')
    } catch (err) {
      setError('Verification failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const renderPasswordStep = () => (
    <form className="space-y-6" onSubmit={handlePasswordSubmit}>
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
  )

  const renderMfaStep = (isSetup) => (
    <form className="space-y-6" onSubmit={handleOtpSubmit}>
      {isSetup && (
        <div className="text-center">
          <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
            Set Up 2-Factor Authentication
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Scan this QR code with your authenticator app (e.g., Google
            Authenticator, Authy).
          </p>
          <div className="p-4 bg-white inline-block rounded-lg border">
            <QRCodeCanvas value={provisioningUri} size={200} />
          </div>
        </div>
      )}

      <div>
        <label
          htmlFor="otp"
          className="block text-lg font-medium text-gray-700 dark:text-gray-200 mb-2"
        >
          {isSetup
            ? 'Enter code to verify setup'
            : 'Enter your authentication code'}
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
            <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-200" />
          </div>
          <input
            id="otp"
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="w-full text-lg pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
            placeholder="123456"
          />
        </div>
      </div>

      <div>
        <Button
          type="submit"
          variant="primary"
          disabled={loading}
          className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-emerald-600 hover:to-green-700 transition-all duration-300 shadow-lg hover:shadow-xl transform"
        >
          {loading ? (
            <Clock className="w-6 h-6 animate-spin" />
          ) : (
            <>
              {'Verify & Sign In'}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 flex flex-col font-sans">
      <Navbar userType="none" />
      <div className="flex-grow flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-lg mx-auto w-full">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent">
              Superadmin Login
            </h2>
          </div>

          <div className="bg-white dark:bg-gray-900/70 backdrop-blur-sm rounded-xl shadow-md border border-gray-200 dark:border-gray-800 p-8 hover:shadow-2xl transition-all duration-300">
            {error && (
              <div className="text-red-500 text-base text-center bg-red-100/50 dark:bg-red-900/50 rounded-xl py-3 mb-4">
                {error}
              </div>
            )}

            {step === 'password' && renderPasswordStep()}
            {step === 'mfa_setup' && renderMfaStep(true)}
            {step === 'mfa_verify' && renderMfaStep(false)}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SuperadminLogin
