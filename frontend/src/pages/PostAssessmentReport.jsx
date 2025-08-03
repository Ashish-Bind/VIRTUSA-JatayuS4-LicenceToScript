import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Briefcase, X, ChevronRight, Download } from 'lucide-react'
import Navbar from '../components/Navbar'
import { baseUrl } from '../utils/utils'
import ClockLoader from '../components/ClockLoader'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const PostAssessmentReport = () => {
  const { job_id } = useParams()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    axios
      .get(`${baseUrl}/recruiter/report/${job_id}`, {
        withCredentials: true,
      })
      .then((response) => {
        setReport(response.data)
        setError('')
      })
      .catch((error) => {
        console.error('Error fetching report:', error)
        setError(error.response?.data?.error || 'Failed to fetch report')
      })
  }, [job_id])

  const handleDownloadReport = () => {
    fetch(`${baseUrl}/recruiter/download-report/${job_id}/post-assessment`, {
      method: 'GET',
      credentials: 'include',
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch PDF')
        }
        return response.blob()
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(new Blob([blob]))
        const a = document.createElement('a')
        a.href = url
        a.download = `report_${job_id}_post-assessment.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
      })
      .catch((error) => {
        console.error('Error downloading report:', error)
      })
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 dark:from-gray-900 dark:to-red-900 flex items-center justify-center">
        <div className="text-center p-8 bg-white/70 dark:bg-gray-800/70 rounded-2xl shadow-xl border border-red-200 dark:border-red-700 backdrop-blur-lg">
          <div className="text-red-500 dark:text-red-400 text-6xl mb-4">⚠️</div>
          <p className="text-red-600 dark:text-red-400 text-xl font-medium">
            Error: {error}
          </p>
          <Link
            to="/recruiter/dashboard"
            className="mt-4 inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium text-base transition-all duration-200"
          >
            Back to Dashboard
            <ChevronRight className="w-5 h-5 ml-1" />
          </Link>
        </div>
      </div>
    )
  }

  if (!report) {
    return <ClockLoader />
  }

  const chartData = {
    labels: report.candidates.map((candidate) => candidate.name),
    datasets: [
      {
        label: 'Accuracy (%)',
        data: report.candidates.map((candidate) => candidate.accuracy || 0),
        backgroundColor: 'rgba(99, 102, 241, 0.2)', // Indigo with transparency
        borderColor: '#6366f1', // Solid indigo
        borderWidth: 2,
      },
      {
        label: 'Avg Time per Question (s)',
        data: report.candidates.map(
          (candidate) => candidate.avg_time_per_answer || 0
        ),
        backgroundColor: 'rgba(16, 185, 129, 0.2)', // Green with transparency
        borderColor: '#10b981', // Solid green
        borderWidth: 2,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: { size: 14 },
          color: document.documentElement.classList.contains('dark')
            ? '#FFFFFF'
            : '#374151',
        },
      },
      title: {
        display: true,
        text: `Post-Assessment Metrics for ${report.job_title}`,
        font: { size: 18, weight: 'bold' },
        color: document.documentElement.classList.contains('dark')
          ? '#FFFFFF'
          : '#111827',
        padding: { bottom: 20 },
      },
      tooltip: {
        backgroundColor: document.documentElement.classList.contains('dark')
          ? '#374151'
          : '#FFFFFF',
        titleFont: { size: 14 },
        bodyFont: { size: 12 },
        padding: 10,
        titleColor: document.documentElement.classList.contains('dark')
          ? '#FFFFFF'
          : '#111827',
        bodyColor: document.documentElement.classList.contains('dark')
          ? '#E5E7EB'
          : '#374151',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Value',
          font: { size: 14 },
          color: document.documentElement.classList.contains('dark')
            ? '#FFFFFF'
            : '#374151',
        },
        ticks: {
          color: document.documentElement.classList.contains('dark')
            ? '#FFFFFF'
            : '#374151',
          stepSize: 10, // Adjust based on data range
        },
        grid: {
          color: document.documentElement.classList.contains('dark')
            ? '#9CA3AF'
            : '#E5E7EB',
        },
      },
      x: {
        ticks: {
          color: document.documentElement.classList.contains('dark')
            ? '#FFFFFF'
            : '#374151',
        },
        grid: { display: false },
      },
    },
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 flex flex-col font-sans">
      <Navbar />
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
              Post-Assessment Report for {report.job_title}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-lg max-w-2xl mx-auto">
              Review candidate performance metrics and download detailed reports
            </p>
          </div>

          {/* Navigation and Download */}
          <div className="flex justify-between items-center mb-12">
            <Link
              to="/recruiter/dashboard"
              className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium text-base transition-all duration-200"
            >
              <ChevronRight className="w-5 h-5 mr-1 rotate-180" />
              Back to Dashboard
            </Link>
            <button
              onClick={handleDownloadReport}
              className="flex items-center px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium text-base hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 gap-2"
            >
              <Download className="w-5 h-5" />
              <span>Download Report</span>
            </button>
          </div>

          {report.candidates.length > 0 ? (
            <div id="report-section">
              {/* Metrics Chart */}
              <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-12 hover:shadow-2xl transition-all duration-300">
                <div className="flex items-center mb-6">
                  <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                    <Briefcase className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Performance Metrics
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Visualize candidate accuracy and average time per question
                    </p>
                  </div>
                </div>
                <div className="w-full flex justify-center">
                  <div className="w-full max-w-full">
                    <Bar data={chartData} options={chartOptions} />
                  </div>
                </div>
              </div>

              {/* Candidate Table */}
              <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-12 hover:shadow-2xl transition-all duration-300 overflow-x-auto">
                <div className="flex items-center mb-6">
                  <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                    <Briefcase className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Candidate Details
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Detailed performance metrics and AI feedback
                    </p>
                  </div>
                </div>
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-100/50 dark:bg-gray-700/50 backdrop-blur-sm">
                      <th className="py-4 px-6 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200/50 dark:border-gray-700/50">
                        Name
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200/50 dark:border-gray-700/50">
                        Email
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200/50 dark:border-gray-700/50">
                        Status
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200/50 dark:border-gray-700/50">
                        Accuracy (%)
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200/50 dark:border-gray-700/50">
                        Questions Attempted
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200/50 dark:border-gray-700/50">
                        Avg Time/Question (s)
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200/50 dark:border-gray-700/50">
                        Final Bands
                      </th>
                      <th className="py-4 px-6 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200/50 dark:border-gray-700/50">
                        AI Feedback
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.candidates.map((candidate) => (
                      <tr
                        key={candidate.candidate_id}
                        className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-all duration-200"
                      >
                        <td className="py-4 px-6 text-sm text-gray-700 dark:text-gray-200 border-b border-gray-200/50 dark:border-gray-700/50">
                          {candidate.name}
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-700 dark:text-gray-200 border-b border-gray-200/50 dark:border-gray-700/50">
                          {candidate.email}
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-700 dark:text-gray-200 border-b border-gray-200/50 dark:border-gray-700/50">
                          {candidate.status}
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-700 dark:text-gray-200 border-b border-gray-200/50 dark:border-gray-700/50">
                          {(candidate.accuracy || 0).toFixed(2)}%
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-700 dark:text-gray-200 border-b border-gray-200/50 dark:border-gray-700/50">
                          {candidate.total_questions}
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-700 dark:text-gray-200 border-b border-gray-200/50 dark:border-gray-700/50">
                          {(candidate.avg_time_per_answer || 0).toFixed(2)}
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-700 dark:text-gray-200 border-b border-gray-200/50 dark:border-gray-700/50">
                          {Object.entries(candidate.final_bands).map(
                            ([skill, band]) => (
                              <span key={skill} className="mr-2">
                                {skill}: {band}
                              </span>
                            )
                          )}
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-700 dark:text-gray-200 border-b border-gray-200/50 dark:border-gray-700/50">
                          {report.ai_enabled && candidate.ai_feedback
                            ? candidate.ai_feedback.summary
                            : 'No AI feedback available'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Candidate Cards */}
              <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 hover:shadow-2xl transition-all duration-300">
                <div className="flex items-center mb-6">
                  <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                    <Briefcase className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Candidate Profiles
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Detailed candidate information and AI feedback
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {report.candidates.map((candidate) => (
                    <div
                      key={candidate.candidate_id}
                      className="bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm rounded-2xl shadow-md border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-xl hover:scale-105 transition-all duration-300"
                    >
                      <div className="flex items-start gap-3 mb-4">
                        <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl">
                          <Briefcase className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {candidate.name}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Email: {candidate.email}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm text-gray-700 dark:text-gray-200">
                        <p className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            Status:
                          </span>{' '}
                          {candidate.status}
                        </p>
                        <p className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            Accuracy:
                          </span>{' '}
                          {(candidate.accuracy || 0).toFixed(2)}%
                        </p>
                        <p className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            Questions Attempted:
                          </span>{' '}
                          {candidate.total_questions}
                        </p>
                        <p className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            Avg Time/Question:
                          </span>{' '}
                          {(candidate.avg_time_per_answer || 0).toFixed(2)}s
                        </p>
                        <p className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            Final Bands:
                          </span>{' '}
                          {Object.entries(candidate.final_bands).map(
                            ([skill, band]) => (
                              <span key={skill} className="mr-2">
                                {skill}: {band}
                              </span>
                            )
                          )}
                        </p>
                        {report.ai_enabled && candidate.ai_feedback ? (
                          <div className="mt-4 bg-gray-100/50 dark:bg-gray-700/50 p-4 rounded-xl">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              AI Feedback
                            </h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {candidate.ai_feedback.summary}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                            No AI feedback available
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 text-center hover:shadow-2xl transition-all duration-300">
              <p className="text-base text-gray-600 dark:text-gray-400">
                No candidates found.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PostAssessmentReport
