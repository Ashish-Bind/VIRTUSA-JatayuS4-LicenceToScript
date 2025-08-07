import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  BookOpen,
  User,
  Clock,
  Award,
  Calendar,
  LogOut,
  Verified,
  Phone,
  MapPin,
  Briefcase,
  FileText,
  GraduationCap,
  Linkedin,
  Github,
} from 'lucide-react'
import Navbar from '../components/Navbar'
import ClockLoader from '../components/ClockLoader'
import { Link } from 'react-router-dom'
import LinkButton from '../components/LinkButton'
import Button from '../components/Button'
import { format } from 'date-fns'
import { baseUrl } from '../utils/utils'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title as ChartTitle,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ChartTitle,
  Tooltip,
  Legend,
  Filler
)

const getSkillColor = (index) => {
  const colors = [
    'from-blue-400 to-indigo-600',
    'from-purple-400 to-indigo-600',
    'from-green-400 to-emerald-600',
    'from-yellow-400 to-amber-600',
    'from-red-400 to-rose-600',
  ]
  return `bg-gradient-to-r ${colors[index % colors.length]} text-white`
}

const getProficiencyLabel = (proficiency) => {
  switch (proficiency) {
    case 8:
      return 'High'
    case 6:
      return 'Medium'
    case 4:
      return 'Basic'
    default:
      return 'Unknown'
  }
}

const CandidateOverview = () => {
  const { user, logout } = useAuth()
  const [candidate, setCandidate] = useState(null)
  const [assessments, setAssessments] = useState({})
  const [error, setError] = useState('')

  const links = [
    { name: 'Profile', link: '/candidate/complete-profile', icon: User },
    { name: 'Dashboard', link: '/candidate/dashboard', icon: BookOpen },
    { name: 'Reports', link: '/candidate/results', icon: Award },
  ]

  useEffect(() => {
    if (!user || user.role !== 'candidate') return

    // Fetch candidate profile
    fetch(`${baseUrl}/candidate/profile/${user.id}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
      .then((response) => response.json())
      .then((data) => setCandidate(data))
      .catch((error) => setError(`Failed to load profile: ${error.message}`))

    // Fetch assessments
    fetch(`${baseUrl}/candidate/eligible-assessments/${user.id}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
      .then((response) => response.json())
      .then((data) => setAssessments(data))
      .catch((error) =>
        setError(`Failed to load assessments: ${error.message}`)
      )
  }, [user])

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 dark:from-gray-900 dark:to-red-900 flex items-center justify-center">
        <div className="text-center p-8 bg-white/70 dark:bg-gray-800/70 rounded-2xl shadow-xl border border-red-200 dark:border-red-700 backdrop-blur-lg">
          <div className="text-red-500 dark:text-red-400 text-6xl mb-4">⚠️</div>
          <p className="text-red-600 dark:text-red-400 text-xl font-medium">
            Error: {error}
          </p>
        </div>
      </div>
    )
  }

  if (!candidate) {
    return <ClockLoader />
  }

  // Prepare data for skill growth chart
  let skillGrowthData = null
  let skillGrowthOptions = null

  const skillsArr = Array.isArray(candidate?.skills) ? candidate.skills : []

  if (skillsArr.length > 0) {
    // Assume each skill object: { skill_id, skill_name, category, proficiency, history: [{date, value}] }
    // Check if any skill has history data
    const hasHistory = skillsArr.some(
      (skill) => Array.isArray(skill.history) && skill.history.length > 0
    )
    if (hasHistory) {
      // If skills have history, plot growth over time for each skill
      const allDates = Array.from(
        new Set(
          skillsArr.flatMap((skill) => (skill.history || []).map((h) => h.date))
        )
      ).sort()
      skillGrowthData = {
        labels: allDates,
        datasets: skillsArr.map((skill, idx) => ({
          label: `${skill.skill_name} (Current: ${getProficiencyLabel(
            skill.proficiency
          )})`,
          data: allDates.map((date) => {
            const found = (skill.history || []).find((h) => h.date === date)
            return found ? found.value : null
          }),
          borderColor: [
            '#6366f1', // indigo
            '#a21caf', // purple
            '#059669', // green
            '#f59e42', // yellow
            '#ef4444', // red
          ][idx % 5],
          backgroundColor: 'rgba(0,0,0,0)',
          tension: 0.3,
          spanGaps: true,
        })),
      }
      skillGrowthOptions = {
        responsive: true,
        plugins: {
          legend: { position: 'top' },
          title: {
            display: true,
            text: 'Skill Growth Over Time',
            font: { size: 18, weight: 'bold' },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `Level: ${getProficiencyLabel(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 10,
            title: { display: true, text: 'Proficiency Level' },
            ticks: {
              values: [4, 6, 8],
              callback: (value) => {
                switch (value) {
                  case 8:
                    return 'High'
                  case 6:
                    return 'Medium'
                  case 4:
                    return 'Basic'
                  default:
                    return ''
                }
              },
            },
          },
        },
      }
    } else {
      // No history, show current proficiency for each skill
      skillGrowthData = {
        labels: skillsArr.map((s) => s.skill_name),
        datasets: [
          {
            label: 'Current Proficiency',
            data: skillsArr.map((s) => s.proficiency || 0),
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99,102,241,0.2)',
            fill: true,
            tension: 0.3,
          },
        ],
      }
      skillGrowthOptions = {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Current Skill Proficiency',
            font: { size: 18, weight: 'bold' },
          },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.label}: ${getProficiencyLabel(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 10,
            title: { display: true, text: 'Proficiency Level' },
            ticks: {
              values: [4, 6, 8],
              callback: (value) => {
                switch (value) {
                  case 8:
                    return 'High'
                  case 6:
                    return 'Medium'
                  case 4:
                    return 'Basic'
                  default:
                    return ''
                }
              },
            },
          },
        },
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 flex flex-col font-sans">
      <Navbar />
      <div className="flex flex-1">
        {/* Left Sidebar */}
        <div className="w-full lg:w-64 p-6 bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg shadow-sm border-r border-gray-200/50 dark:border-gray-700/50 lg:sticky lg:top-20">
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
                  <User className="w-12 h-12 text-white" />
                </div>
              </div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent mb-4">
                Welcome back, {candidate.name}!
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg max-w-2xl mx-auto">
                Explore job opportunities, track your applications, and enhance
                your skills
              </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
              <div className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-8 hover:shadow-2xl hover:scale-105 transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl">
                    <BookOpen className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">
                      {assessments.all_assessments?.length}
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
                    <BookOpen className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">
                      {assessments.eligible_assessments?.length}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Available Jobs
                    </div>
                  </div>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-green-600 rounded-full transition-all duration-500"
                    style={{
                      width: `${
                        assessments.all_assessments?.length > 0
                          ? (assessments.eligible_assessments.length /
                              assessments.all_assessments.length) *
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
                    <Award className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">
                      {assessments.attempted_assessments?.length}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Attempted Jobs
                    </div>
                  </div>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-600 rounded-full transition-all duration-500"
                    style={{
                      width: `${
                        assessments.all_assessments?.length > 0
                          ? (assessments.attempted_assessments.length /
                              assessments.all_assessments.length) *
                            100
                          : 0
                      }%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Candidate Info */}
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-12 hover:shadow-2xl transition-all duration-300">
              <div className="flex justify-between items-center mb-6">
                <div className="flex">
                  <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                    <User className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                      My Profile
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      Manage your personal details
                    </p>
                  </div>
                </div>
                <LinkButton
                  to="/candidate/complete-profile"
                  className="w-fit bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  Edit Profile
                </LinkButton>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-3">
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Name:
                    </span>{' '}
                    {candidate.name}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-indigo-600 dark:text-indigo-400"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path d="M4 4h16v16H4z" stroke="none" />
                      <path d="M22 6l-10 7L2 6" />
                    </svg>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Email:
                    </span>{' '}
                    {candidate.email}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Phone className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Phone:
                    </span>{' '}
                    {candidate.phone || 'Not provided'}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Location:
                    </span>{' '}
                    {candidate.location || 'Not specified'}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Experience:
                    </span>{' '}
                    {candidate.years_of_experience} years
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Verified className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Profile Status:
                    </span>{' '}
                    <span
                      className={`font-semibold ${
                        candidate.is_profile_complete
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-500 dark:text-red-400'
                      }`}
                    >
                      {candidate.is_profile_complete
                        ? 'Complete'
                        : 'Incomplete'}
                    </span>
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Resume:
                    </span>{' '}
                    {candidate.resume ? (
                      <a
                        href={`https://storage.googleapis.com/gen-ai-quiz/uploads/${candidate.resume}`}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {candidate.resume.split('/').pop()}
                      </a>
                    ) : (
                      'Not provided'
                    )}
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Degree:
                    </span>{' '}
                    {candidate.degree || 'Not specified'}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Branch:
                    </span>{' '}
                    {candidate.degree_branch || 'Not specified'}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Passout Year:
                    </span>{' '}
                    {candidate.passout_year || 'Not specified'}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Linkedin className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      LinkedIn:
                    </span>{' '}
                    {candidate.linkedin ? (
                      <a
                        href={candidate.linkedin}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {candidate.linkedin}
                      </a>
                    ) : (
                      'Not provided'
                    )}
                  </p>
                  <p className="text-base text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Github className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      GitHub:
                    </span>{' '}
                    {candidate.github ? (
                      <a
                        href={candidate.github}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {candidate.github}
                      </a>
                    ) : (
                      'Not provided'
                    )}
                  </p>
                </div>
              </div>
              {!candidate.is_profile_complete && (
                <div className="mt-6">
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full"
                      style={{ width: '60%' }}
                    ></div>
                  </div>
                </div>
              )}
            </div>

            {/* Skill Growth/Proficiency Chart */}
            {skillGrowthData && (
              <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-12 hover:shadow-2xl transition-all duration-300">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                  Skill Growth & Proficiency
                </h3>
                <div className="h-80">
                  <Line data={skillGrowthData} options={skillGrowthOptions} />
                </div>
              </div>
            )}

            {/* Available Jobs */}
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-12 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center mb-6">
                <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                  <BookOpen className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Available Jobs
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Explore new job opportunities
                  </p>
                </div>
              </div>
              {assessments.eligible_assessments?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {assessments.eligible_assessments.map((assessment) => (
                    <div
                      key={assessment.job_id}
                      className="bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm rounded-2xl shadow-md border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-xl hover:scale-105 transition-all duration-300"
                    >
                      {assessment.logo && (
                        <img
                          src={`https://storage.googleapis.com/gen-ai-quiz/uploads/${assessment.logo}`}
                          alt="Company Logo"
                          className="w-full h-32 object-cover rounded-xl mb-4 border border-gray-200/50 dark:border-gray-700/50"
                        />
                      )}
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        {assessment.job_title}
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        Company: {assessment.company}
                      </p>
                      <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-2">
                          <Award className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          <span>
                            {assessment.experience_min}-
                            {assessment.experience_max} years
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          <span>
                            {format(
                              new Date(
                                assessment.schedule_start || assessment.schedule
                              ),
                              'MMM d, yyyy'
                            )}
                            {' - '}
                            {format(
                              new Date(
                                assessment.schedule_end || assessment.schedule
                              ),
                              'MMM d, yyyy'
                            )}
                          </span>
                        </div>
                      </div>
                      <Button
                        to={`/candidate/dashboard`}
                        className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl mt-2"
                      >
                        View Job
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-base text-gray-600 dark:text-gray-400 text-center">
                  No available jobs at the moment.
                </p>
              )}
            </div>

            {/* Attempted Jobs */}
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-12 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center mb-6">
                <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                  <Award className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Attempted Jobs
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Review your job applications
                  </p>
                </div>
              </div>
              {assessments.attempted_assessments?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {assessments.attempted_assessments.map((attempt) => (
                    <div
                      key={attempt.attempt_id}
                      className="bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm rounded-2xl shadow-md border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-xl hover:scale-105 transition-all duration-300"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {attempt.job_title}
                        </h4>
                        <span className="px-3 py-1 bg-gradient-to-r from-green-400 to-emerald-600 text-white text-xs font-medium rounded-full">
                          {attempt.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        Company:{' '}
                        <span className="font-medium">{attempt.company}</span>
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Attempt Date:{' '}
                        <span className="font-medium">
                          {format(
                            new Date(attempt.attempt_date),
                            'MMM d, yyyy, h:mm a'
                          )}
                        </span>
                      </p>
                      <LinkButton
                        to={`/candidate/assessment/${attempt.attempt_id}/results`}
                        className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                      >
                        View Result
                      </LinkButton>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-base text-gray-600 dark:text-gray-400 text-center">
                  No attempted jobs yet.
                </p>
              )}
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
                <p className="text-base text-gray-600 dark:text-gray-400">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    Last login:
                  </span>{' '}
                  {format(new Date(), 'MMM d, yyyy, h:mm a')}
                </p>
                <p className="text-base text-gray-600 dark:text-gray-400">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    Last job attempt:
                  </span>{' '}
                  {assessments.attempted_assessments?.length > 0
                    ? format(
                        new Date(
                          assessments.attempted_assessments[0].attempt_date
                        ),
                        'MMM d, yyyy, h:mm a'
                      )
                    : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-full lg:w-96 p-6 bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg shadow-sm border-l border-gray-200/50 dark:border-gray-700/50 lg:sticky lg:top-20">
          <div className="text-center space-y-4">
            <img
              className="w-24 h-24 rounded-full mx-auto object-cover border-4 border-indigo-600 dark:border-indigo-400"
              src={
                candidate.profile_picture
                  ? `https://storage.googleapis.com/gen-ai-quiz/uploads/${candidate.profile_picture}`
                  : 'https://via.placeholder.com/96'
              }
              alt="Profile"
            />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {candidate.name}
            </h3>
            <p className="text-base text-gray-600 dark:text-gray-400">
              Good Afternoon, {candidate.name.split(' ')[0]} 🔥
            </p>
            <p className="text-base text-indigo-600 dark:text-indigo-400 flex items-center gap-2 justify-center">
              {candidate.is_profile_complete && (
                <Verified className="w-5 h-5" />
              )}
              {candidate.is_profile_complete
                ? '100% Profile Completion'
                : 'Complete profile for better results'}
            </p>
            <div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Skills
              </h4>
              <div className="flex flex-wrap gap-2 mt-2 justify-center">
                {skillsArr.length > 0 ? (
                  skillsArr.map(({ skill_name, proficiency }, i) => (
                    <span
                      key={skill_name}
                      className={`px-3 py-1 rounded-full text-sm font-medium ${getSkillColor(
                        i
                      )}`}
                    >
                      {skill_name} ({getProficiencyLabel(proficiency)})
                    </span>
                  ))
                ) : (
                  <p className="text-base text-gray-600 dark:text-gray-400">
                    No skills added yet.
                  </p>
                )}
              </div>
            </div>
            <Button
              to="/candidate/complete-profile"
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              Tailor Profile
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CandidateOverview
