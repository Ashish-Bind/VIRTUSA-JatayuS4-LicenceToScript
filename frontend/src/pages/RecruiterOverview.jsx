import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  Briefcase,
  User,
  Clock,
  Award,
  Calendar,
  LogOut,
  Verified,
  CreditCard,
  Users,
  FileText,
} from 'lucide-react'
import Navbar from '../components/Navbar'
import ClockLoader from '../components/ClockLoader'
import { Link, useNavigate } from 'react-router-dom'
import LinkButton from '../components/LinkButton'
import Button from '../components/Button'
import { baseUrl, formatDate } from '../utils/utils'

const RecruiterOverview = () => {
  const { user, logout } = useAuth()
  const [recruiter, setRecruiter] = useState(null)
  const [jobs, setJobs] = useState({
    active: [],
    suspended: [],
    deleted: [],
  })
  const [candidates, setCandidates] = useState([])
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const links = [
    {
      name: 'Jobs Panel',
      link: '/recruiter/dashboard',
      icon: Briefcase,
    },
    {
      name: 'Analytics',
      link: '/recruiter/analytics',
      icon: User,
    },
    {
      name: 'Subscriptions',
      link: '/recruiter/subscriptions',
      icon: CreditCard,
    },
  ]

  useEffect(() => {
    if (!user || user.role !== 'recruiter' || user.requires_otp_verification) {
      navigate('/recruiter/login')
      return
    }

    // Fetch recruiter profile and subscription details
    fetch(`${baseUrl}/subscriptions/plan/${user.id}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
      .then((response) => response.json())
      .then((data) => {
        setRecruiter({
          company: data[0]?.company || 'Not specified',
          logo: data[0]?.logo || null,
          subscription_plan: data[0]?.subscription_plan || {
            name: 'None',
            candidate_limit: 0,
            assessment_limit: 0,
            ai_reports: false,
            start_date: null,
            end_date: null,
            current_candidate_count: 0,
            current_assessment_count: 0,
          },
        })
      })
      .catch((error) => setError(`Failed to load profile: ${error.message}`))

    // Fetch jobs
    fetch(`${baseUrl}/recruiter/analytics/jobs`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
      .then((response) => response.json())
      .then((data) => {
        const active = data.filter((job) => job.status === 'active')
        const suspended = data.filter((job) => job.status === 'suspended')
        const deleted = data.filter((job) => job.status === 'deleted')
        setJobs({ active, suspended, deleted })
      })
      .catch((error) => setError(`Failed to load jobs: ${error.message}`))

    // Fetch candidates
    fetch(`${baseUrl}/recruiter/analytics/candidates`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
      .then((response) => response.json())
      .then((data) => setCandidates(data))
      .catch((error) => setError(`Failed to load candidates: ${error.message}`))
  }, [user])

  if (error) {
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
  }

  if (!recruiter) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-900 dark:text-gray-100 text-xl font-medium">
            Loading dashboard...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 flex flex-col font-sans">
      <Navbar />
      <div className="flex flex-1">
        {/* Left Sidebar */}
        <div className="w-64 p-6 bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg shadow-sm border-r border-gray-200/50 dark:border-gray-700/50">
          <nav className="space-y-4">
            {links.map((item) => (
              <LinkButton
                key={item.name}
                to={item.link}
                className="w-full flex items-center gap-3 p-3 text-gray-800 dark:text-gray-100 hover:bg-gray-50/50 dark:hover:bg-gray-700/50 rounded-xl text-base font-medium transition-all duration-200"
              >
                <item.icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                {item.name}
              </LinkButton>
            ))}
            <LinkButton
              onClick={logout}
              className="w-full flex items-center gap-3 p-3 text-gray-800 dark:text-gray-100 hover:bg-gray-50/50 dark:hover:bg-gray-700/50 rounded-xl text-base font-medium transition-all duration-200"
            >
              <LogOut className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Logout
            </LinkButton>
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="text-center mb-12">
              <div className="flex items-center justify-center mb-6">
                <div className="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
                  <Briefcase className="w-12 h-12 text-white" />
                </div>
              </div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent mb-4">
                Recruiter Dashboard
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg max-w-2xl mx-auto">
                Manage your recruitment process, track jobs, and monitor
                candidates efficiently
              </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
              <div className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-8 hover:shadow-2xl hover:scale-105 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl">
                    <Briefcase className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">
                      {jobs.active.length +
                        jobs.suspended.length +
                        jobs.deleted.length}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Total Jobs
                    </div>
                  </div>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full w-full"></div>
                </div>
              </div>
              <div className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-8 hover:shadow-2xl hover:scale-105 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-gradient-to-r from-emerald-500 to-green-600 rounded-xl">
                    <Briefcase className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">
                      {jobs.active.length}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Active Jobs
                    </div>
                  </div>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-green-600 rounded-full transition-all duration-500"
                    style={{
                      width: `${
                        jobs.active.length +
                          jobs.suspended.length +
                          jobs.deleted.length >
                        0
                          ? (jobs.active.length /
                              (jobs.active.length +
                                jobs.suspended.length +
                                jobs.deleted.length)) *
                            100
                          : 0
                      }%`,
                    }}
                  ></div>
                </div>
              </div>
              <div className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-8 hover:shadow-2xl hover:scale-105 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl">
                    <User className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">
                      {candidates.length}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Total Candidates
                    </div>
                  </div>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-orange-600 rounded-full w-full"></div>
                </div>
              </div>
            </div>

            {/* Recruiter Info */}
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-12 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-between mb-6">
                <div className="flex">
                  <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                    <Briefcase className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                      My Profile
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      Manage your company details
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-3">
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Company:
                    </span>{' '}
                    {recruiter.company}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Total Jobs:
                    </span>{' '}
                    {jobs.active.length +
                      jobs.suspended.length +
                      jobs.deleted.length}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Active Jobs:
                    </span>{' '}
                    {jobs.active.length}
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Suspended Jobs:
                    </span>{' '}
                    {jobs.suspended.length}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Deleted Jobs:
                    </span>{' '}
                    {jobs.deleted.length}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Total Candidates:
                    </span>{' '}
                    {candidates.length}
                  </p>
                </div>
              </div>
            </div>

            {/* Subscription Details */}
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-12 hover:shadow-2xl transition-all duration-300">
              <div className="flex justify-between items-center mb-6">
                <div className="flex">
                  <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                    <CreditCard className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Subscription Details
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      View and manage your subscription plan
                    </p>
                  </div>
                </div>
                <LinkButton
                  to="/recruiter/subscriptions"
                  className="w-fit bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  Manage Subscription
                </LinkButton>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-3">
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Subscription Plan:
                    </span>{' '}
                    {recruiter.subscription_plan.name}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Subscription Start:
                    </span>{' '}
                    {recruiter.subscription_plan.start_date
                      ? formatDate(recruiter.subscription_plan.start_date)
                      : 'N/A'}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Subscription End:
                    </span>{' '}
                    {recruiter.subscription_plan.end_date
                      ? formatDate(recruiter.subscription_plan.end_date)
                      : 'N/A'}
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Candidate Limit:
                    </span>{' '}
                    {recruiter.subscription_plan.current_candidate_count} /{' '}
                    {recruiter.subscription_plan.candidate_limit}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Assessment Limit:
                    </span>{' '}
                    {recruiter.subscription_plan.current_assessment_count} /{' '}
                    {recruiter.subscription_plan.assessment_limit}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Verified className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      AI Reports:
                    </span>{' '}
                    {recruiter.subscription_plan.ai_reports
                      ? 'Enabled'
                      : 'Disabled'}
                  </p>
                </div>
              </div>
            </div>

            {/* Active Jobs */}
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-12 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center mb-6">
                <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                  <Briefcase className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Active Jobs
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    View your currently active job postings
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {jobs.active.map((job) => (
                  <div
                    key={job.job_id}
                    className="bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm rounded-2xl shadow-md border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-xl hover:scale-105 transition-all duration-300"
                  >
                    {recruiter.logo && (
                      <img
                        src={`https://storage.googleapis.com/gen-ai-quiz/uploads/${recruiter.logo}`}
                        alt="Company Logo"
                        className="w-full h-32 object-cover rounded-lg mb-4"
                      />
                    )}
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      {job.job_title}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      Created:{' '}
                      {new Date(job.created_at).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                      })}
                    </p>
                    <Button
                      to={`/recruiter/analytics`}
                      className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      View Job
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Candidates Overview */}
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-12 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center mb-6">
                <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                  <User className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Candidate Overview
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Monitor candidate progress and details
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {candidates.map((candidate) => (
                  <div
                    key={candidate.candidate_id}
                    className="bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm rounded-2xl shadow-md border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-xl hover:scale-105 transition-all duration-300"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {candidate.name}
                      </h4>
                      <span
                        className={`px-3 py-1 text-xs font-medium rounded-full ${
                          candidate.status === 'blocked'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        }`}
                      >
                        {candidate.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      Job: {candidate.job_title}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      Score: {candidate.total_score}%
                    </p>
                    <Link
                      to={`/recruiter/analytics`}
                      className="inline-block w-full text-center bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      View Details
                    </Link>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center mb-6">
                <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                  <Clock className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Recent Activity
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Track your latest actions
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    Last login:
                  </span>{' '}
                  {new Date().toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                  })}
                </p>
                <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    Last job created:
                  </span>{' '}
                  {jobs.active.length > 0
                    ? new Date(jobs.active[0].created_at).toLocaleString(
                        'en-IN',
                        { timeZone: 'Asia/Kolkata' }
                      )
                    : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-96 p-6 bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg shadow-sm border-l border-gray-200/50 dark:border-gray-700/50">
          <div className="text-center space-y-4">
            {recruiter.logo && (
              <img
                className="w-24 h-24 rounded-full mx-auto object-cover border-4 border-indigo-600 dark:border-indigo-400"
                src={`https://storage.googleapis.com/gen-ai-quiz/uploads/${recruiter.logo}`}
                alt="Company Logo"
              />
            )}
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {recruiter.company}
            </h3>
            <p className="text-base text-gray-600 dark:text-gray-400">
              Good Afternoon, Recruiter 🔥
            </p>
            <p className="text-base text-indigo-600 dark:text-indigo-400 flex items-center gap-2 justify-center">
              <Briefcase className="w-5 h-5" />
              Active Jobs: {jobs.active.length}
            </p>
            <Button
              to="/recruiter/dashboard"
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              Create New Job
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RecruiterOverview
