import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Mail, ArrowRight, Clock } from 'lucide-react'
import LinkButton from '../components/LinkButton'
import Navbar from '../components/Navbar'
import { baseUrl } from '../utils/utils'
import Button from '../components/Button'

const CandidateConfirm = () => {
  const [searchParams] = useSearchParams()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const confirmEmail = async () => {
    if (!token) {
      setError('Invalid confirmation link.')
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch(`${baseUrl}/auth/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to confirm email.')
      }

      setMessage('Email confirmed successfully. Redirecting to login...')
      setTimeout(() => navigate('/candidate/login'), 3000)
    } catch (err) {
      setError(err.message)
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
              Email Confirmation
            </h2>
            <p className="mt-2 text-gray-600 dark:text-gray-400 text-lg">
              Already confirmed?{' '}
              <LinkButton
                to="/candidate/login"
                variant="link"
                className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-all duration-200"
              >
                Sign in
              </LinkButton>
            </p>
          </div>

          <div className="bg-white dark:bg-gray-900/70 backdrop-blur-sm rounded-xl shadow-md border border-gray-200 dark:border-gray-800 p-8 hover:shadow-2xl transition-all duration-300">
            {error && (
              <div className="text-red-500 text-base text-center bg-red-100/50 dark:bg-red-900/50 rounded-xl py-2 mb-6">
                {error}
              </div>
            )}
            {message && (
              <div className="text-green-500 text-base text-center bg-green-100/50 dark:bg-green-900/50 rounded-xl py-2 mb-6">
                {message}
              </div>
            )}
            <div>
              <p className="text-base text-gray-600 dark:text-gray-300 mb-6 text-center">
                Please verify your email address by clicking the confirm email
                button below.
              </p>
            </div>
            <div className="relative mb-6">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                <Mail className="h-5 w-5 text-indigo-600 dark:text-indigo-200" />
              </div>
              <input
                type="text"
                value={token || ''}
                readOnly
                className="w-full text-lg pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-700 text-gray-500 dark:text-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                placeholder="Confirmation token"
              />
            </div>
            <div>
              <Button
                onClick={confirmEmail}
                disabled={loading || !token}
                variant="primary"
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform"
              >
                {loading ? (
                  <Clock className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    {'Confirm Email'}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CandidateConfirm
