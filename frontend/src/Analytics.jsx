import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from './context/AuthContext'
import {
  Users,
  Briefcase,
  FileText,
  Send,
  Trash2,
  Ban,
  Loader2,
  Download,
  Eye,
  BarChart2,
  Filter,
} from 'lucide-react'
import Navbar from './components/Navbar'
import Button from './components/Button'
import LinkButton from './components/LinkButton'
import { downloadAsPDF, formatDate, baseUrl } from './utils/utils'
import Chart from 'chart.js/auto'
import ClockLoader from './components/ClockLoader'
import toast from 'react-hot-toast'

const Analytics = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [candidates, setCandidates] = useState([])
  const [jobs, setJobs] = useState([])
  const [shortlistedCandidates, setShortlistedCandidates] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [filterJobId, setFilterJobId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)

  useEffect(() => {
    if (!user || user.role !== 'recruiter') {
      navigate('/recruiter/login')
      return
    }

    const fetchData = async () => {
      setIsLoading(true)
      try {
        const [candidatesResponse, jobsResponse] = await Promise.all([
          fetch(
            `${baseUrl}/recruiter/analytics/candidates${
              filterJobId ? `?job_id=${filterJobId}` : ''
            }${filterStatus ? `&status=${filterStatus}` : ''}`,
            { credentials: 'include' }
          ),
          fetch(`${baseUrl}/recruiter/analytics/jobs`, {
            credentials: 'include',
          }),
        ])

        if (!candidatesResponse.ok)
          throw new Error('Failed to fetch candidates')
        if (!jobsResponse.ok) throw new Error('Failed to fetch jobs')

        const candidatesData = await candidatesResponse.json()
        const jobsData = await jobsResponse.json()

        setCandidates(candidatesData)
        setJobs(jobsData)
      } catch (err) {
        setError('Error fetching data: ' + err.message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [user, navigate, filterJobId, filterStatus])

  useEffect(() => {
    if (candidates.length > 0 && chartRef.current) {
      const ctx = chartRef.current.getContext('2d')
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy()
      }
      chartInstanceRef.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: candidates.map((c) => c.name),
          datasets: [
            {
              label: 'Assessment Score',
              data: candidates.map((c) => c.total_score || 0),
              backgroundColor: 'rgba(16, 185, 129, 0.8)',
              borderColor: 'rgb(16, 185, 129)',
              borderWidth: 2,
              borderRadius: 8,
              borderSkipped: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                usePointStyle: true,
                padding: 20,
                font: {
                  size: 14,
                  family: "'Inter', 'system-ui', sans-serif",
                  weight: '500',
                },
              },
            },
            title: {
              display: true,
              text: 'Candidate Performance Scores',
              font: {
                size: 18,
                family: "'Inter', 'system-ui', sans-serif",
                weight: '600',
              },
              padding: {
                top: 10,
                bottom: 30,
              },
            },
            tooltip: {
              backgroundColor: 'rgba(17, 24, 39, 0.95)',
              titleColor: '#F3F4F6',
              bodyColor: '#F3F4F6',
              borderColor: 'rgba(107, 114, 128, 0.2)',
              borderWidth: 1,
              cornerRadius: 12,
              padding: 12,
              displayColors: true,
              callbacks: {
                label: function (context) {
                  return `${context.dataset.label}: ${context.parsed.y}%`
                },
              },
            },
          },
          scales: {
            x: {
              grid: {
                display: false,
              },
              ticks: {
                font: {
                  size: 12,
                  family: "'Inter', 'system-ui', sans-serif",
                },
                color: '#6B7280',
              },
            },
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Score (%)',
                font: {
                  size: 13,
                  family: "'Inter', 'system-ui', sans-serif",
                  weight: '500',
                },
                color: '#6B7280',
              },
              grid: {
                color: 'rgba(107, 114, 128, 0.1)',
                lineWidth: 1,
              },
              ticks: {
                font: {
                  size: 12,
                  family: "'Inter', 'system-ui', sans-serif",
                },
                color: '#6B7280',
                callback: function (value) {
                  return value + '%'
                },
              },
            },
          },
          elements: {
            bar: {
              borderWidth: 2,
            },
          },
          interaction: {
            intersect: false,
            mode: 'index',
          },
        },
      })
    }

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy()
      }
    }
  }, [candidates])

  const handleBlockCandidate = async (candidateId, reason) => {
    setIsLoading(true)
    try {
      const response = await fetch(
        `${baseUrl}/recruiter/analytics/candidate/block/${candidateId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ reason }),
        }
      )
      if (!response.ok) throw new Error('Failed to block candidate')
      setCandidates(
        candidates.map((c) =>
          c.candidate_id === candidateId
            ? { ...c, status: 'blocked', block_reason: reason }
            : c
        )
      )
      setMessage('Candidate blocked successfully.')
    } catch (err) {
      setError('Error blocking candidate: ' + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSuspendJob = async (jobId, reason) => {
    setIsLoading(true)
    try {
      const response = await fetch(
        `${baseUrl}/recruiter/analytics/job/suspend/${jobId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ reason }),
        }
      )
      if (!response.ok) throw new Error('Failed to suspend job')
      setJobs(
        jobs.map((j) =>
          j.job_id === jobId
            ? { ...j, status: 'suspended', suspension_reason: reason }
            : j
        )
      )
      setMessage('Job suspended successfully.')
    } catch (err) {
      setError('Error suspending job: ' + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteJob = async (jobId) => {
    setIsLoading(true)
    try {
      const response = await fetch(
        `${baseUrl}/recruiter/analytics/job/delete/${jobId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      )
      if (!response.ok) throw new Error('Failed to delete job')
      setJobs(jobs.filter((j) => j.job_id !== jobId))
      setMessage('Job deleted successfully.')
    } catch (err) {
      setError('Error deleting job: ' + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleShortlistCandidate = (candidateId) => {
    setShortlistedCandidates((prev) =>
      prev.includes(candidateId)
        ? prev.filter((id) => id !== candidateId)
        : [...prev, candidateId]
    )
  }

  const handleSendEmails = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      const response = await fetch(
        `${baseUrl}/recruiter/analytics/shortlist/notify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ candidate_ids: shortlistedCandidates }),
        }
      )
      if (!response.ok) throw new Error('Failed to send emails')
      setMessage('Emails sent to shortlisted candidates.')
      setShortlistedCandidates([])
    } catch (err) {
      setError('Error sending emails: ' + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (message) {
      toast.success(message, { duration: 5000 })
    }
  }, [message])

  useEffect(() => {
    if (error) {
      toast.error(error, { duration: 5000 })
    }
  }, [error])

  if (isLoading) {
    return <ClockLoader />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 flex flex-col font-sans">
      <Navbar />
      <div className="flex-grow py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-12"
          >
            <div className="flex items-center justify-center mb-6">
              <div className="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
                <BarChart2 className="w-12 h-12 text-white" />
              </div>
            </div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent mb-4">
              Recruitment Analytics
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-lg max-w-2xl mx-auto">
              Monitor and manage candidate and job performance
            </p>
          </motion.div>

          {/* Messages */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="mb-8 p-6 bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/30 dark:to-pink-900/30 rounded-2xl border border-red-200 dark:border-red-700 shadow-inner flex items-center"
              >
                <Ban className="w-6 h-6 text-red-500 dark:text-red-400 mr-3" />
                <p className="text-red-600 dark:text-red-400 text-sm font-medium">
                  {error}
                </p>
              </motion.div>
            )}
            {message && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="mb-8 p-6 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/30 rounded-2xl border border-emerald-200 dark:border-emerald-700 shadow-inner flex items-center"
              >
                <FileText className="w-6 h-6 text-emerald-500 dark:text-emerald-400 mr-3" />
                <p className="text-emerald-600 dark:text-emerald-400 text-sm font-medium">
                  {message}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filters */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-12 hover:shadow-2xl transition-all duration-300"
          >
            <div className="flex items-center mb-6">
              <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                <Filter className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Filters
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Refine your analytics view
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <motion.select
                  value={filterJobId}
                  onChange={(e) => setFilterJobId(e.target.value)}
                  className="w-full pl-10 pr-8 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm appearance-none cursor-pointer"
                  whileFocus={{ scale: 1.02 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  <option value="">All Jobs</option>
                  {jobs.map((job) => (
                    <option key={job.job_id} value={job.job_id}>
                      {job.job_title}
                    </option>
                  ))}
                </motion.select>
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <motion.select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full pl-10 pr-8 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm appearance-none cursor-pointer"
                  whileFocus={{ scale: 1.02 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  <option value="">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="blocked">Blocked</option>
                </motion.select>
              </div>
            </div>
          </motion.div>

          {/* Performance Chart */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.4,
              duration: 0.8,
              type: 'spring',
              stiffness: 300,
              damping: 20,
            }}
            className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-12 hover:shadow-2xl transition-all duration-300"
          >
            <div className="flex items-center mb-8">
              <div className="p-3 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-xl mr-4">
                <BarChart2 className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Candidate Performance
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Visualize candidate assessment scores
                </p>
              </div>
            </div>
            <div className="h-[400px]">
              <canvas ref={chartRef} className="w-full h-full" />
            </div>
          </motion.div>

          {/* Candidates Table */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.6,
              duration: 0.8,
              type: 'spring',
              stiffness: 300,
              damping: 20,
            }}
            className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-12 hover:shadow-2xl transition-all duration-300"
          >
            <div className="flex items-center mb-8">
              <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                <Users className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Candidates
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Manage and review candidate details
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-100/80 dark:bg-gray-700/80 backdrop-blur-sm">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Job
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Score (%)
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Proctoring
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white/70 dark:bg-gray-800/70 divide-y divide-gray-200 dark:divide-gray-700">
                  {candidates.map((candidate) => (
                    <motion.tr
                      key={candidate.candidate_id}
                      className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-all duration-150"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        <LinkButton
                          to={`/recruiter/candidate/${candidate.candidate_id}`}
                          variant="link"
                          className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-all duration-200"
                        >
                          {candidate.name}
                        </LinkButton>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {candidate.job_title || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {candidate.total_score
                          ? candidate.total_score.toFixed(2)
                          : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        <Button
                          variant="link"
                          onClick={() =>
                            navigate(
                              `/recruiter/candidate/${candidate.candidate_id}/proctoring`
                            )
                          }
                          className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-all duration-200 flex items-center"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </Button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {candidate.status === 'blocked'
                          ? `Blocked: ${
                              candidate.block_reason || 'No reason provided'
                            }`
                          : 'Active'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <input
                            type="checkbox"
                            checked={shortlistedCandidates.includes(
                              candidate.candidate_id
                            )}
                            onChange={(e) => {
                              e.preventDefault()
                              handleShortlistCandidate(candidate.candidate_id)
                            }}
                            className="mr-2 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                          />
                          <Button
                            variant="primary"
                            onClick={(e) => {
                              e.preventDefault()
                              const reason = prompt(
                                'Enter reason for blocking:'
                              )
                              if (reason)
                                handleBlockCandidate(
                                  candidate.candidate_id,
                                  reason
                                )
                            }}
                            disabled={
                              candidate.status === 'blocked' || isLoading
                            }
                            className="bg-gradient-to-r from-red-600 to-pink-600 text-white px-4 py-2 rounded-xl hover:from-red-700 hover:to-pink-700 transition-all duration-300 flex items-center shadow-lg hover:shadow-xl"
                          >
                            <Ban className="w-4 h-4 mr-2" />
                            Block
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="mt-8"
            >
              <Button
                variant="primary"
                onClick={handleSendEmails}
                disabled={shortlistedCandidates.length === 0 || isLoading}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center justify-center"
              >
                <Send className="w-5 h-5 mr-2" />
                Notify Shortlisted
              </Button>
            </motion.div>
          </motion.div>

          {/* Jobs Table */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-12 hover:shadow-2xl transition-all duration-300"
          >
            <div className="flex items-center mb-8">
              <div className="p-3 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-xl mr-4">
                <Briefcase className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Job Postings
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Manage and review job listings
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-100/80 dark:bg-gray-700/80 backdrop-blur-sm">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white/70 dark:bg-gray-800/70 divide-y divide-gray-200 dark:divide-gray-700">
                  {jobs.map((job) => (
                    <motion.tr
                      key={job.job_id}
                      className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-all duration-150"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {job.job_title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {job.company}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {formatDate(job.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {job.status === 'suspended'
                          ? `Suspended: ${
                              job.suspension_reason || 'No reason provided'
                            }`
                          : 'Active'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <Button
                            variant="primary"
                            onClick={(e) => {
                              e.preventDefault()
                              const reason = prompt(
                                'Enter reason for suspension:'
                              )
                              if (reason) handleSuspendJob(job.job_id, reason)
                            }}
                            disabled={job.status === 'suspended' || isLoading}
                            className="bg-gradient-to-r from-amber-600 to-orange-600 text-white px-4 py-2 rounded-xl hover:from-amber-700 hover:to-orange-700 transition-all duration-300 flex items-center shadow-lg hover:shadow-xl"
                          >
                            <Ban className="w-4 h-4 mr-2" />
                            Suspend
                          </Button>
                          <Button
                            variant="danger"
                            onClick={(e) => {
                              e.preventDefault()
                              if (
                                window.confirm(
                                  'Are you sure you want to delete this job?'
                                )
                              ) {
                                handleDeleteJob(job.job_id)
                              }
                            }}
                            disabled={isLoading}
                            className="bg-gradient-to-r from-red-600 to-pink-600 text-white px-4 py-2 rounded-xl hover:from-red-700 hover:to-pink-700 transition-all duration-300 flex items-center shadow-lg hover:shadow-xl"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default Analytics
