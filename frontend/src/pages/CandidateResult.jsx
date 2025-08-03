import React, { useState, useEffect, useContext } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import {
  CheckCircle,
  BookOpen,
  Star,
  BarChart2,
  TrendingUp,
  Home,
  RefreshCw,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import Button from '../components/Button'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import { ThemeContext } from '../context/ThemeContext'
import { baseUrl, isMajoritySnapshotsValid } from '../utils/utils'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

const CandidateResult = () => {
  const { attemptId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [candidateReport, setCandidateReport] = useState(null)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [proctoringData, setProctoringData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const { theme } = useContext(ThemeContext)

  useEffect(() => {
    setIsLoading(true)
    fetch(`${baseUrl}/assessment/results/${attemptId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((data) => {
            throw new Error(data.error || `HTTP error ${response.status}`)
          })
        }
        return response.json()
      })
      .then((data) => {
        setCandidateReport(data.candidate_report)
        setTotalQuestions(data.total_questions)
        setProctoringData(data.proctoring_data)
        setErrorMessage('')
      })
      .catch((error) => {
        setErrorMessage(`Failed to load results: ${error.message}`)
      })
      .finally(() => setIsLoading(false))
  }, [attemptId])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 flex flex-col">
        <Navbar userType={user.role} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex justify-center items-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-500 border-t-transparent mx-auto mb-4"></div>
            <p className="text-gray-900 dark:text-gray-100 text-xl font-medium">
              Loading results...
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 flex flex-col">
        <Navbar userType={user.role} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 text-center">
            <div className="text-red-500 dark:text-red-400 text-6xl mb-4">
              ⚠️
            </div>
            <p className="text-red-600 dark:text-red-400 text-xl font-medium mb-6">
              {errorMessage}
            </p>
            <button
              onClick={() => navigate('/candidate/dashboard')}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 mx-auto"
            >
              <Home className="w-5 h-5 mr-2" />
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!candidateReport) {
    return null
  }

  const chartData = {
    labels: Object.keys(candidateReport).map((skill) =>
      skill.replace('_', ' ')
    ),
    datasets: [
      {
        label: 'Accuracy (%)',
        data: Object.values(candidateReport).map(
          (stats) => stats.accuracy_percent
        ),
        backgroundColor: 'rgba(79, 70, 229, 0.8)',
        borderColor: 'rgb(79, 70, 229)',
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      },
    ],
  }

  const chartOptions = {
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
          color: theme === 'dark' ? '#F3F4F6' : '#6B7280',
        },
      },
      title: {
        display: true,
        text: 'Skill-wise Accuracy',
        font: {
          size: 18,
          family: "'Inter', 'system-ui', sans-serif",
          weight: '600',
        },
        padding: {
          top: 10,
          bottom: 30,
        },
        color: theme === 'dark' ? '#F3F4F6' : '#1F2937',
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
          color: theme === 'dark' ? '#D1D5DB' : '#6B7280',
        },
      },
      y: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'Accuracy (%)',
          font: {
            size: 13,
            family: "'Inter', 'system-ui', sans-serif",
            weight: '500',
          },
          color: theme === 'dark' ? '#F3F4F6' : '#6B7280',
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
          color: theme === 'dark' ? '#D1D5DB' : '#6B7280',
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
  }

  const totalCorrect = Object.values(candidateReport).reduce(
    (sum, stats) => sum + stats.correct_answers,
    0
  )
  const overallPercentage =
    totalQuestions > 0 ? ((totalCorrect / totalQuestions) * 100).toFixed(2) : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 flex flex-col">
      <Navbar userType={user.role} />
      <div className="flex-grow py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-6">
              <div className="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
                <CheckCircle className="w-12 h-12 text-white" />
              </div>
            </div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent mb-4">
              Assessment Results
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-lg max-w-2xl mx-auto">
              Review your performance, skill breakdown, and proctoring details
            </p>
          </div>

          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 hover:shadow-2xl transition-all duration-300">
            <div className="mb-8">
              <p className="text-green-600 dark:text-green-300 text-lg font-medium flex items-center gap-2">
                <Star className="w-5 h-5" />
                Congratulations! You've completed the assessment.
              </p>
            </div>

            <div className="space-y-12">
              {/* Performance Summary */}
              <div>
                <div className="flex items-center mb-6">
                  <div className="p-3 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-xl mr-4">
                    <BarChart2 className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Performance Summary
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Overview of your assessment results
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-xl">
                        <BookOpen className="w-8 h-8 text-white" />
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-gray-900 dark:text-white">
                          {Object.values(candidateReport).reduce(
                            (sum, stats) => sum + stats.questions_attempted,
                            0
                          )}{' '}
                          / {totalQuestions}
                        </div>
                        <div className="text-base text-gray-600 dark:text-gray-400">
                          Questions Attempted
                        </div>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-blue-600 rounded-full"
                        style={{
                          width: `${
                            totalQuestions > 0
                              ? (Object.values(candidateReport).reduce(
                                  (sum, stats) =>
                                    sum + stats.questions_attempted,
                                  0
                                ) /
                                  totalQuestions) *
                                100
                              : 0
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>
                  <div className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-gradient-to-r from-emerald-500 to-green-600 rounded-xl">
                        <CheckCircle className="w-8 h-8 text-white" />
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-gray-900 dark:text-white">
                          {totalCorrect}
                        </div>
                        <div className="text-base text-gray-600 dark:text-gray-400">
                          Correct Answers
                        </div>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-green-600 rounded-full"
                        style={{
                          width: `${
                            totalQuestions > 0
                              ? (totalCorrect / totalQuestions) * 100
                              : 0
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>
                  <div className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl">
                        <TrendingUp className="w-8 h-8 text-white" />
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-gray-900 dark:text-white">
                          {overallPercentage}%
                        </div>
                        <div className="text-base text-gray-600 dark:text-gray-400">
                          Overall Percentage
                        </div>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-600 rounded-full"
                        style={{ width: `${overallPercentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Skill-wise Breakdown */}
              <div>
                <div className="flex items-center mb-6">
                  <div className="p-3 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl mr-4">
                    <BookOpen className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Skill-wise Breakdown
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Detailed performance by skill
                    </p>
                  </div>
                </div>
                <div className="space-y-6">
                  {Object.entries(candidateReport).map(([skill, stats]) => (
                    <div
                      key={skill}
                      className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-2xl transition-all duration-300"
                    >
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <Star className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
                        {skill.replace('_', ' ')}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-base text-gray-700 dark:text-gray-200">
                        <div>
                          <p className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                            Questions Attempted: {stats.questions_attempted}
                          </p>
                          <p className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                            Correct Answers: {stats.correct_answers}
                          </p>
                        </div>
                        <div>
                          <p className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                            Accuracy: {stats.accuracy_percent}%
                          </p>
                          <p className="flex items-center gap-2">
                            <Star className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                            Performance Band:{' '}
                            <span className="capitalize">
                              {stats.final_band}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-blue-600 rounded-full transition-all duration-500"
                            style={{ width: `${stats.accuracy_percent}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Performance Visualization */}
              <div>
                <div className="flex items-center mb-6">
                  <div className="p-3 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-xl mr-4">
                    <BarChart2 className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Performance Visualization
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Visual representation of your skill-wise accuracy
                    </p>
                  </div>
                </div>
                <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 h-[400px]">
                  <Bar data={chartData} options={chartOptions} />
                </div>
              </div>

              {/* Insights & Recommendations */}
              <div>
                <div className="flex items-center mb-6">
                  <div className="p-3 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl mr-4">
                    <TrendingUp className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Insights & Recommendations
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Tips to improve your performance
                    </p>
                  </div>
                </div>
                <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6">
                  <ul className="list-disc pl-5 space-y-2 text-base text-gray-700 dark:text-gray-200">
                    {Object.entries(candidateReport).map(([skill, stats]) => (
                      <li key={skill} className="flex items-start gap-2">
                        <Star className="w-4 h-4 text-indigo-600 dark:text-indigo-300 mt-1" />
                        <span>
                          <span className="font-semibold">
                            {skill.replace('_', ' ')}:
                          </span>{' '}
                          {stats.accuracy_percent >= 80
                            ? `Excellent performance! Consider advanced roles requiring ${skill.replace(
                                '_',
                                ' '
                              )}.`
                            : stats.accuracy_percent >= 50
                            ? `Good effort. Review ${skill.replace(
                                '_',
                                ' '
                              )} concepts to boost your score.`
                            : `Focus on ${skill.replace(
                                '_',
                                ' '
                              )} fundamentals to improve your performance.`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Proctoring Information */}
              {proctoringData && (
                <div>
                  <div className="flex items-center mb-6">
                    <div className="p-3 bg-gradient-to-r from-red-500 to-pink-600 rounded-xl mr-4">
                      <AlertTriangle className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Proctoring Information
                      </h2>
                      <p className="text-gray-600 dark:text-gray-400">
                        Details about your assessment environment
                      </p>
                    </div>
                  </div>
                  <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6">
                    <ul className="list-disc pl-5 space-y-2 text-base text-gray-700 dark:text-gray-200">
                      <li className="flex items-start gap-2">
                        <Star className="w-4 h-4 text-indigo-600 dark:text-indigo-300 mt-1" />
                        <span>
                          Termination Reason:{' '}
                          <span className="text-red-500">
                            {proctoringData.termination_reason || 'None'}
                          </span>
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Star className="w-4 h-4 text-indigo-600 dark:text-indigo-300 mt-1" />
                        <span>
                          Forced Termination:{' '}
                          {proctoringData.forced_termination ? 'Yes' : 'No'}
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Star className="w-4 h-4 text-indigo-600 dark:text-indigo-300 mt-1" />
                        <span>
                          Fullscreen Warnings:{' '}
                          {proctoringData.fullscreen_warnings}
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Star className="w-4 h-4 text-indigo-600 dark:text-indigo-300 mt-1" />
                        <span>Tab Switches: {proctoringData.tab_switches}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Snapshot Face Match Summary */}
              {proctoringData && proctoringData.snapshots && (
                <div>
                  <div className="flex items-center mb-6">
                    <div className="p-3 bg-gradient-to-r from-red-500 to-pink-600 rounded-xl mr-4">
                      <AlertTriangle className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Snapshot Face Match Summary
                      </h2>
                      <p className="text-gray-600 dark:text-gray-400">
                        Verification of candidate identity
                      </p>
                    </div>
                  </div>
                  <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6">
                    <div className="text-base text-gray-700 dark:text-gray-200 flex items-center gap-2">
                      {isMajoritySnapshotsValid(proctoringData.snapshots) ? (
                        <span className="text-green-600 dark:text-green-300 font-bold flex items-center gap-1">
                          <CheckCircle className="w-4 h-4" />
                          Majority of webcam snapshots matched the candidate's
                          profile picture.
                        </span>
                      ) : (
                        <span className="text-red-600 dark:text-red-300 font-bold flex items-center gap-1">
                          <XCircle className="w-4 h-4" />
                          Majority of webcam snapshots did NOT match the
                          candidate's profile picture.
                        </span>
                      )}
                      <span className="ml-3">
                        (
                        {
                          proctoringData.snapshots.filter((s) => s.is_valid)
                            .length
                        }{' '}
                        of {proctoringData.snapshots.length} matched)
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end mt-8">
              <button
                onClick={() => navigate('/candidate/dashboard')}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <Home className="w-5 h-5 mr-2" />
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CandidateResult
