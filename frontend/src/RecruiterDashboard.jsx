import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import {
  Briefcase,
  ChevronRight,
  X,
  Check,
  Plus,
  Trash2,
  Calendar,
  User,
  Award,
  Code,
  GraduationCap,
  BrainCircuit,
  Loader2,
} from 'lucide-react'
import Button from './components/Button'
import { format } from 'date-fns'
import LinkButton from './components/LinkButton'
import { baseUrl } from './utils/utils'
import Select from 'react-select'
import toast from 'react-hot-toast'

const formatDate = (date) => {
  return format(new Date(date), 'MMM d, yyyy')
}

const getPriorityColor = (priority) => {
  switch (priority) {
    case 5:
      return 'bg-gradient-to-r from-green-400 to-emerald-600 text-white'
    case 3:
      return 'bg-gradient-to-r from-blue-400 to-indigo-600 text-white'
    case 2:
      return 'bg-gradient-to-r from-yellow-400 to-amber-600 text-white'
    default:
      return 'bg-gradient-to-r from-gray-300 to-gray-500 text-gray-800'
  }
}

const RecruiterDashboard = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [assessments, setAssessments] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [degrees, setDegrees] = useState([])
  const [branches, setBranches] = useState([])
  const [formData, setFormData] = useState({
    job_title: '',
    experience_min: '',
    experience_max: '',
    duration: '',
    num_questions: '',
    schedule_start: '',
    schedule_end: '',
    degree_required: '',
    degree_branch: '',
    passout_year: '',
    passout_year_required: false,
    job_description: '',
    custom_prompt: '',
    skills: [],
  })
  const [newSkill, setNewSkill] = useState({ name: '', priority: 'low' })
  const [activeTab, setActiveTab] = useState('create')

  useEffect(() => {
    if (!user || user.role !== 'recruiter' || user.requires_otp_verification) {
      navigate('/recruiter/login')
      return
    }

    // Fetch assessments
    fetch(`${baseUrl}/recruiter/assessments`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch assessments: ${response.statusText}`)
        }
        return response.json()
      })
      .then((data) => {
        setAssessments([...data.active_assessments, ...data.past_assessments])
      })
      .catch((error) => {
        console.error('Error fetching assessments:', error)
        setError(`Failed to load assessments: ${error.message}`)
      })

    // Fetch degrees
    fetch(`${baseUrl}/recruiter/degrees`)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch degrees')
        return response.json()
      })
      .then((data) => {
        setDegrees(
          data.map((degree) => ({
            value: degree.degree_id,
            label: degree.degree_name,
          }))
        )
      })
      .catch((error) => {
        console.error('Error fetching degrees:', error)
        setError('Failed to fetch degree options. Please try again.')
      })

    // Fetch branches
    fetch(`${baseUrl}/recruiter/branches`)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch branches')
        return response.json()
      })
      .then((data) => {
        setBranches(
          data.map((branch) => ({
            value: branch.branch_id,
            label: branch.branch_name,
          }))
        )
      })
      .catch((error) => {
        console.error('Error fetching branches:', error)
        setError('Failed to fetch branch options. Please try again.')
      })
  }, [user, navigate])

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    })
  }

  const handleDegreeChange = (selectedOption) => {
    setFormData({
      ...formData,
      degree_required: selectedOption ? selectedOption.value : '',
    })
  }

  const handleBranchChange = (selectedOption) => {
    setFormData({
      ...formData,
      degree_branch: selectedOption ? selectedOption.value : '',
    })
  }

  const handleSkillChange = (e) => {
    const { name, value } = e.target
    setNewSkill({ ...newSkill, [name]: value })
  }

  const addSkill = () => {
    if (!newSkill.name.trim()) {
      setError('Skill name is required')
      return
    }
    setFormData({
      ...formData,
      skills: [
        ...formData.skills,
        { name: newSkill.name.trim(), priority: newSkill.priority },
      ],
    })
    setNewSkill({ name: '', priority: 'low' })
    setError('')
  }

  const removeSkill = (index) => {
    setFormData({
      ...formData,
      skills: formData.skills.filter((_, i) => i !== index),
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setIsLoading(true)

    // Validate required fields
    const requiredFields = [
      'job_title',
      'experience_min',
      'experience_max',
      'duration',
      'num_questions',
      'schedule_start',
      'schedule_end',
    ]
    if (requiredFields.some((field) => !formData[field])) {
      setError('Please fill in all required fields')
      setIsLoading(false)
      return
    }

    // Validate skills
    if (formData.skills.length === 0) {
      setError('At least one skill is required')
      setIsLoading(false)
      return
    }

    // Validate schedule_end >= schedule_start
    if (formData.schedule_start && formData.schedule_end) {
      const start = new Date(formData.schedule_start)
      const end = new Date(formData.schedule_end)
      if (end < start) {
        setError('End date must be after start date')
        setIsLoading(false)
        return
      }
    }

    // Validate passout_year
    if (formData.passout_year && !/^\d{4}$/.test(formData.passout_year)) {
      setError('Passout year must be a valid 4-digit year')
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch(`${baseUrl}/recruiter/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      })

      const data = await response.json()
      if (response.ok) {
        setSuccess('Assessment created successfully!')
        setAssessments([...assessments, { ...formData, job_id: data.job_id }])
        setFormData({
          job_title: '',
          experience_min: '',
          experience_max: '',
          duration: '',
          num_questions: '',
          schedule_start: '',
          schedule_end: '',
          degree_required: '',
          degree_branch: '',
          passout_year: '',
          passout_year_required: false,
          job_description: '',
          custom_prompt: '',
          skills: [],
        })
        setNewSkill({ name: '', priority: 'low' })
        setIsFormOpen(false)
      } else {
        setError(data.error || 'Failed to create assessment.')
      }
    } catch (err) {
      setError(`Network error: ${err.message}. Is the backend running?`)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (error) {
      toast.error(error, { autoClose: 3000 })
    }
    if (success) {
      toast.success(success, { autoClose: 3000 })
    }
  }, [error, success])

  const currentDate = new Date()
  const activeAssessments = assessments.filter(
    (assessment) =>
      new Date(assessment.schedule_end || assessment.schedule) >= currentDate
  )
  const pastAssessments = assessments.filter(
    (assessment) =>
      new Date(assessment.schedule_end || assessment.schedule) < currentDate
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 font-[Inter] flex flex-col">
      <Navbar />
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent mb-6">
          Jobs Panel
        </h1>

        <div className="mb-6">
          <div className="flex border-b border-gray-200/50 dark:border-gray-700/50 gap-4">
            {['create', 'active', 'past'].map((tab) => (
              <button
                key={tab}
                className={`px-4 py-2 text-base font-medium transition-all duration-200 ${
                  activeTab === tab
                    ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-300'
                    : 'text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50'
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'create'
                  ? 'Create Assessment'
                  : tab === 'active'
                  ? 'Current Assessments'
                  : 'Past Assessments'}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'create' && (
          <div>
            <Button
              onClick={() => setIsFormOpen(!isFormOpen)}
              className="mb-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              {isFormOpen ? 'Cancel' : 'Create New Assessment'}
              {isFormOpen ? (
                <X className="w-4 h-4" />
              ) : (
                <Briefcase className="w-4 h-4" />
              )}
            </Button>

            {isFormOpen && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
                <h2 className="text-3xl font-extrabold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent mb-3 flex items-center gap-3">
                  <Briefcase className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  Create New Assessment
                  <span className="inline-block animate-pulse">📋</span>
                </h2>
                <p className="text-lg text-gray-700 dark:text-gray-200 font-medium mb-6">
                  Fill in the details to create a new assessment for candidates
                </p>
                <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                    <div>
                      <label
                        htmlFor="job_title"
                        className="block text-base font-medium text-gray-700 dark:text-gray-200 mb-1"
                      >
                        <span className="flex items-center">
                          <Briefcase className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-300" />
                          Job Title
                          <span className="text-red-500 ml-1">*</span>
                        </span>
                      </label>
                      <input
                        type="text"
                        id="job_title"
                        name="job_title"
                        value={formData.job_title}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-indigo-600 focus:border-indigo-600 dark:bg-gray-800 dark:text-gray-200 text-base placeholder-gray-500 dark:placeholder-gray-500"
                        placeholder="Software Engineer"
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="experience_min"
                        className="block text-base font-medium text-gray-700 dark:text-gray-200 mb-1"
                      >
                        <span className="flex items-center">
                          <Award className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-300" />
                          Min Experience (years)
                          <span className="text-red-500 ml-1">*</span>
                        </span>
                      </label>
                      <input
                        type="number"
                        id="experience_min"
                        name="experience_min"
                        value={formData.experience_min}
                        onChange={handleInputChange}
                        min="0"
                        step="0.1"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-indigo-600 focus:border-indigo-600 dark:bg-gray-800 dark:text-gray-200 text-base placeholder-gray-500 dark:placeholder-gray-500"
                        placeholder="2"
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="experience_max"
                        className="block text-base font-medium text-gray-700 dark:text-gray-200 mb-1"
                      >
                        <span className="flex items-center">
                          <Award className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-300" />
                          Max Experience (years)
                          <span className="text-red-500 ml-1">*</span>
                        </span>
                      </label>
                      <input
                        type="number"
                        id="experience_max"
                        name="experience_max"
                        value={formData.experience_max}
                        onChange={handleInputChange}
                        min={formData.experience_min || 0}
                        step="0.1"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-indigo-600 focus:border-indigo-600 dark:bg-gray-800 dark:text-gray-200 text-base placeholder-gray-500 dark:placeholder-gray-500"
                        placeholder="5"
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="duration"
                        className="block text-base font-medium text-gray-700 dark:text-gray-200 mb-1"
                      >
                        <span className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-300" />
                          Duration (minutes)
                          <span className="text-red-500 ml-1">*</span>
                        </span>
                      </label>
                      <input
                        type="number"
                        id="duration"
                        name="duration"
                        value={formData.duration}
                        onChange={handleInputChange}
                        min="1"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-indigo-600 focus:border-indigo-600 dark:bg-gray-800 dark:text-gray-200 text-base placeholder-gray-500 dark:placeholder-gray-500"
                        placeholder="30"
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="num_questions"
                        className="block text-base font-medium text-gray-700 dark:text-gray-200 mb-1"
                      >
                        <span className="flex items-center">
                          <Code className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-300" />
                          Number of Questions
                          <span className="text-red-500 ml-1">*</span>
                        </span>
                      </label>
                      <input
                        type="number"
                        id="num_questions"
                        name="num_questions"
                        value={formData.num_questions}
                        onChange={handleInputChange}
                        min="1"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-indigo-600 focus:border-indigo-600 dark:bg-gray-800 dark:text-gray-200 text-base placeholder-gray-500 dark:placeholder-gray-500"
                        placeholder="10"
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="schedule_start"
                        className="block text-base font-medium text-gray-700 dark:text-gray-200 mb-1"
                      >
                        <span className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-300" />
                          Start Date
                          <span className="text-red-500 ml-1">*</span>
                        </span>
                      </label>
                      <input
                        type="datetime-local"
                        id="schedule_start"
                        name="schedule_start"
                        value={
                          formData.schedule_start
                            ? new Date(formData.schedule_start)
                                .toISOString()
                                .slice(0, 16)
                            : ''
                        }
                        onChange={(e) => {
                          const date = new Date(e.target.value)
                          setFormData({
                            ...formData,
                            schedule_start: date.toISOString(),
                          })
                        }}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-indigo-600 focus:border-indigo-600 dark:bg-gray-800 dark:text-gray-200 text-base placeholder-gray-500 dark:placeholder-gray-500"
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="schedule_end"
                        className="block text-base font-medium text-gray-700 dark:text-gray-200 mb-1"
                      >
                        <span className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-300" />
                          End Date
                          <span className="text-red-500 ml-1">*</span>
                        </span>
                      </label>
                      <input
                        type="datetime-local"
                        id="schedule_end"
                        name="schedule_end"
                        value={
                          formData.schedule_end
                            ? new Date(formData.schedule_end)
                                .toISOString()
                                .slice(0, 16)
                            : ''
                        }
                        onChange={(e) => {
                          const date = new Date(e.target.value)
                          setFormData({
                            ...formData,
                            schedule_end: date.toISOString(),
                          })
                        }}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-indigo-600 focus:border-indigo-600 dark:bg-gray-800 dark:text-gray-200 text-base placeholder-gray-500 dark:placeholder-gray-500"
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="degree_required"
                        className="block text-base font-medium text-gray-700 dark:text-gray-200 mb-1"
                      >
                        <span className="flex items-center">
                          <GraduationCap className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-300" />
                          Degree
                        </span>
                      </label>
                      <Select
                        options={degrees}
                        value={
                          degrees.find(
                            (option) =>
                              option.value === formData.degree_required
                          ) || null
                        }
                        onChange={handleDegreeChange}
                        placeholder="Select a degree..."
                        className="text-base"
                        classNamePrefix="react-select"
                        styles={{
                          control: (provided) => ({
                            ...provided,
                            borderColor: '#e5e7eb',
                            borderRadius: '0.375rem',
                            padding: '2px',
                            backgroundColor: '#fff',
                            '&:hover': { borderColor: '#6366f1' },
                          }),
                          menu: (provided) => ({
                            ...provided,
                            backgroundColor: '#fff',
                          }),
                          option: (provided, state) => ({
                            ...provided,
                            backgroundColor: state.isSelected
                              ? '#6366f1'
                              : state.isFocused
                              ? '#e0e7ff'
                              : '#fff',
                            color: state.isSelected ? '#fff' : '#374151',
                          }),
                          singleValue: (provided) => ({
                            ...provided,
                            color: '#374151',
                          }),
                        }}
                        theme={(theme) => ({
                          ...theme,
                          colors: {
                            ...theme.colors,
                            primary: '#6366f1',
                            primary25: '#e0e7ff',
                          },
                        })}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="degree_branch"
                        className="block text-base font-medium text-gray-700 dark:text-gray-200 mb-1"
                      >
                        <span className="flex items-center">
                          <BrainCircuit className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-300" />
                          Branch/Specialization
                        </span>
                      </label>
                      <Select
                        options={branches}
                        value={
                          branches.find(
                            (option) => option.value === formData.degree_branch
                          ) || null
                        }
                        onChange={handleBranchChange}
                        placeholder="Select a branch..."
                        className="text-base"
                        classNamePrefix="react-select"
                        styles={{
                          control: (provided) => ({
                            ...provided,
                            borderColor: '#e5e7eb',
                            borderRadius: '0.375rem',
                            padding: '2px',
                            backgroundColor: '#fff',
                            '&:hover': { borderColor: '#6366f1' },
                          }),
                          menu: (provided) => ({
                            ...provided,
                            backgroundColor: '#fff',
                          }),
                          option: (provided, state) => ({
                            ...provided,
                            backgroundColor: state.isSelected
                              ? '#6366f1'
                              : state.isFocused
                              ? '#e0e7ff'
                              : '#fff',
                            color: state.isSelected ? '#fff' : '#374151',
                          }),
                          singleValue: (provided) => ({
                            ...provided,
                            color: '#374151',
                          }),
                        }}
                        theme={(theme) => ({
                          ...theme,
                          colors: {
                            ...theme.colors,
                            primary: '#6366f1',
                            primary25: '#e0e7ff',
                          },
                        })}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="passout_year"
                        className="block text-base font-medium text-gray-700 dark:text-gray-200 mb-1"
                      >
                        <span className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-300" />
                          Passout Year
                        </span>
                      </label>
                      <input
                        type="number"
                        id="passout_year"
                        name="passout_year"
                        value={formData.passout_year}
                        onChange={handleInputChange}
                        min="1900"
                        max={new Date().getFullYear() + 5}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-indigo-600 focus:border-indigo-600 dark:bg-gray-800 dark:text-gray-200 text-base placeholder-gray-500 dark:placeholder-gray-500"
                        placeholder="2023"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="passout_year_required"
                        className="block text-base font-medium text-gray-700 dark:text-gray-200 mb-1"
                      >
                        <span className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-300" />
                          Passout Year Required
                        </span>
                      </label>
                      <input
                        type="checkbox"
                        id="passout_year_required"
                        name="passout_year_required"
                        checked={formData.passout_year_required}
                        onChange={handleInputChange}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-600 border-gray-300 dark:border-gray-600 rounded"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label
                        htmlFor="job_description"
                        className="block text-base font-medium text-gray-700 dark:text-gray-200 mb-1"
                      >
                        <span className="flex items-center">
                          <Code className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-300" />
                          Description
                        </span>
                      </label>
                      <textarea
                        id="job_description"
                        name="job_description"
                        value={formData.job_description}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-indigo-600 focus:border-indigo-600 dark:bg-gray-800 dark:text-gray-200 text-base placeholder-gray-500 dark:placeholder-gray-500 resize-y"
                        rows="5"
                        placeholder="E.g., Looking for a backend engineer with experience in Django, REST APIs, and PostgreSQL..."
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label
                        htmlFor="custom_prompt"
                        className="block text-base font-medium text-gray-700 dark:text-gray-200 mb-1"
                      >
                        <span className="flex items-center">
                          <Code className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-300" />
                          Customized Prompt
                        </span>
                      </label>
                      <textarea
                        id="custom_prompt"
                        name="custom_prompt"
                        value={formData.custom_prompt}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-indigo-600 focus:border-indigo-600 dark:bg-gray-800 dark:text-gray-200 text-base placeholder-gray-500 dark:placeholder-gray-500 resize-y"
                        rows="4"
                        placeholder="E.g., I want code snippet based questions..."
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-base font-medium text-gray-700 dark:text-gray-200 mb-1">
                        <span className="flex items-center">
                          <Code className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-300" />
                          Skills
                          <span className="text-red-500 ml-1">*</span>
                        </span>
                      </label>
                      <div className="flex gap-4 mb-4 items-center">
                        <input
                          type="text"
                          name="name"
                          value={newSkill.name}
                          onChange={handleSkillChange}
                          className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-indigo-600 focus:border-indigo-600 dark:bg-gray-800 dark:text-gray-200 text-base placeholder-gray-500 dark:placeholder-gray-500"
                          placeholder="e.g., Python"
                        />
                        <select
                          name="priority"
                          value={newSkill.priority}
                          onChange={handleSkillChange}
                          className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-indigo-600 focus:border-indigo-600 dark:bg-gray-800 dark:text-gray-200 text-base"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                        <Button
                          type="button"
                          onClick={addSkill}
                          className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                        >
                          Add
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      {formData.skills.length > 0 && (
                        <ul className="space-y-3">
                          {formData.skills.map((skill, index) => (
                            <li
                              key={index}
                              className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 p-3 rounded-md border border-gray-200 dark:border-gray-700"
                            >
                              <span className="text-base text-gray-700 dark:text-gray-200">
                                {skill.name} ({skill.priority})
                              </span>
                              <button
                                type="button"
                                onClick={() => removeSkill(index)}
                                className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-all duration-200"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end mt-10">
                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-3 rounded-xl flex items-center hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-60"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          Create Assessment
                          <Briefcase className="w-4 h-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {activeTab === 'active' && (
          <div>
            <h2 className="text-xl font-semibold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent mb-4 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
              Ongoing Assessments
            </h2>
            {activeAssessments.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeAssessments.map((assessment) => (
                  <div
                    key={assessment.job_id}
                    className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg p-6 rounded-2xl shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-300 border border-gray-200/50 dark:border-gray-700/50 max-w-md w-full flex flex-col justify-between"
                  >
                    {assessment.logo && (
                      <img
                        src={`https://storage.googleapis.com/gen-ai-quiz/uploads/${assessment.logo}`}
                        alt="Company Logo"
                        className="w-full h-32 object-cover rounded-xl mb-4 border border-gray-200/50 dark:border-gray-700/50"
                      />
                    )}
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl">
                        <Briefcase className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                          {assessment.job_title}
                        </h3>
                        <p className="text-base text-gray-600 dark:text-gray-400">
                          {assessment.company}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3 text-base text-gray-600 dark:text-gray-400 mb-4">
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span>
                          {assessment.experience_min}-
                          {assessment.experience_max} years
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span>
                          {formatDate(
                            assessment.schedule_start || assessment.schedule
                          )}{' '}
                          -{' '}
                          {formatDate(
                            assessment.schedule_end || assessment.schedule
                          )}
                        </span>
                      </div>
                      {assessment.degree_required && (
                        <div className="flex items-center gap-2">
                          <GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <span>{assessment.degree_required}</span>
                        </div>
                      )}
                      {assessment.degree_branch && (
                        <div className="flex items-center gap-2">
                          <BrainCircuit className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <span>{assessment.degree_branch}</span>
                        </div>
                      )}
                      {assessment.passout_year && (
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <span>
                            Passout Year: {assessment.passout_year}
                            {assessment.passout_year_required
                              ? ' (Required)'
                              : ' (Optional)'}
                          </span>
                        </div>
                      )}
                      {assessment.skills && assessment.skills.length > 0 && (
                        <div className="flex flex-wrap gap-2 items-center">
                          <Code className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          {assessment.skills.map((skill, index) => (
                            <span
                              key={index}
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(
                                skill.priority
                              )}`}
                            >
                              {skill.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <LinkButton
                      to={`/recruiter/candidates/${assessment.job_id}`}
                      className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      View Candidates
                      <ChevronRight className="w-5 h-5" />
                    </LinkButton>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg p-6 rounded-2xl shadow-lg text-center border border-gray-200/50 dark:border-gray-700/50">
                <p className="text-base text-gray-600 dark:text-gray-400">
                  No active assessments.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'past' && (
          <div>
            <h2 className="text-xl font-semibold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent mb-4 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
              Past Assessments
            </h2>
            {pastAssessments.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pastAssessments.map((assessment) => (
                  <div
                    key={assessment.job_id}
                    className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg p-6 rounded-2xl shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-300 border border-gray-200/50 dark:border-gray-700/50 max-w-md w-full"
                  >
                    {assessment.logo && (
                      <img
                        src={`https://storage.googleapis.com/gen-ai-quiz/uploads/${assessment.logo}`}
                        alt="Company Logo"
                        className="w-full h-32 object-cover rounded-xl mb-4 border border-gray-200/50 dark:border-gray-700/50"
                      />
                    )}
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl">
                        <Briefcase className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                          {assessment.job_title}
                        </h3>
                        <p className="text-base text-gray-600 dark:text-gray-400">
                          {assessment.company}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3 text-base text-gray-600 dark:text-gray-400 mb-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span>
                          {assessment.experience_min}-
                          {assessment.experience_max} years
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span>
                          {formatDate(
                            assessment.schedule_start || assessment.schedule
                          )}{' '}
                          -{' '}
                          {formatDate(
                            assessment.schedule_end || assessment.schedule
                          )}
                        </span>
                      </div>
                      {assessment.degree_required && (
                        <div className="flex items-center gap-2">
                          <GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <span>{assessment.degree_required}</span>
                        </div>
                      )}
                      {assessment.degree_branch && (
                        <div className="flex items-center gap-2">
                          <BrainCircuit className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <span>{assessment.degree_branch}</span>
                        </div>
                      )}
                      {assessment.passout_year && (
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <span>
                            Passout Year: {assessment.passout_year}
                            {assessment.passout_year_required
                              ? ' (Required)'
                              : ' (Optional)'}
                          </span>
                        </div>
                      )}
                      {assessment.skills && assessment.skills.length > 0 && (
                        <div className="flex flex-wrap gap-2 items-center">
                          <Code className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          {assessment.skills.map((skill, index) => (
                            <span
                              key={index}
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(
                                skill.priority
                              )}`}
                            >
                              {skill.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2 justify-between">
                        <LinkButton
                          to={`/recruiter/candidates/${assessment.job_id}`}
                          className="flex-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 px-4 py-2 rounded-xl text-center transition-all duration-200"
                        >
                          View Candidates
                        </LinkButton>
                        <LinkButton
                          to={`/recruiter/report/${assessment.job_id}`}
                          className="flex-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 px-4 py-2 rounded-xl text-center transition-all duration-200"
                        >
                          View Report
                        </LinkButton>
                      </div>
                      <LinkButton
                        to={`/recruiter/combined-report/${assessment.job_id}`}
                        className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                      >
                        View Combined Report
                        <ChevronRight className="w-5 h-5" />
                      </LinkButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg p-6 rounded-2xl shadow-lg text-center border border-gray-200/50 dark:border-gray-700/50">
                <p className="text-base text-gray-600 dark:text-gray-400">
                  No past assessments.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default RecruiterDashboard
