import React, {
  useState,
  useEffect,
  useContext,
  useRef,
  useCallback,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Modal from 'react-modal'
import { useAuth } from './context/AuthContext'
import {
  Award,
  Clock,
  AlertCircle,
  ChevronRight,
  ArrowRight,
  BookOpen,
  Briefcase,
  Calendar,
  FileText,
  X,
  Check,
  Loader2,
  Code,
  Camera,
  AlertTriangle,
} from 'lucide-react'
import Navbar from './components/Navbar'
import { ThemeContext } from './context/ThemeContext'
import { format } from 'date-fns'
import LinkButton from './components/LinkButton'
import Button from './components/Button'
import { baseUrl } from './utils/utils'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import '@tensorflow/tfjs'
import * as tf from '@tensorflow/tfjs'
import Webcam from 'react-webcam'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import ClockLoader from './components/ClockLoader'
import toast from 'react-hot-toast'

// Bind modal to your appElement (for accessibility)
Modal.setAppElement('#root')

const VIDEO_WIDTH = 400
const VIDEO_HEIGHT = 300
const videoConstraints = {
  width: VIDEO_WIDTH,
  height: VIDEO_HEIGHT,
  facingMode: 'environment',
}

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
      return 'bg-gradient-to-r from-gray-300 to-gray-500 text-white'
  }
}

const checkBrowserCompatibility = async () => {
  const compatibility = {
    webgl: false,
    tensorflow: false,
    mediapipe: false,
    camera: false,
    libraries: false,
    ram: false,
    storage: false,
  }

  // Check WebGL
  const canvas = document.createElement('canvas')
  const gl =
    canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
  compatibility.webgl = !!gl

  // Check TensorFlow.js (for COCO-SSD)
  try {
    await tf.ready()
    compatibility.tensorflow = true
  } catch (error) {
    console.error('TensorFlow.js check failed:', error)
  }

  // Check MediaPipe (gaze model)
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
    )
    compatibility.mediapipe = !!vision
  } catch (error) {
    console.error('MediaPipe check failed:', error)
  }

  // Check camera availability
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    compatibility.camera = devices.some(
      (device) => device.kind === 'videoinput'
    )
  } catch (error) {
    console.error('Camera check failed:', error)
  }

  // Check required libraries
  try {
    compatibility.libraries = !!(
      React &&
      cocoSsd &&
      Webcam &&
      Modal &&
      format &&
      FaceLandmarker &&
      FilesetResolver
    )
  } catch (error) {
    console.error('Library check failed:', error)
  }

  // Check RAM availability (navigator.hardwareConcurrency for CPU threads as proxy if memory not available)
  try {
    const minRamMB = 4096 // Minimum 4GB RAM required
    if ('deviceMemory' in navigator) {
      const deviceMemoryGB = navigator.deviceMemory || 0
      compatibility.ram = deviceMemoryGB * 1024 >= minRamMB
    } else {
      const cpuThreads = navigator.hardwareConcurrency || 1
      compatibility.ram = cpuThreads >= 4
    }
  } catch (error) {
    console.error('RAM check failed:', error)
  }

  // Check storage availability
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const storageEstimate = await navigator.storage.estimate()
      const minStorageMB = 500
      const availableStorageMB = Math.floor(
        storageEstimate.quota / (1024 * 1024)
      )
      compatibility.storage = availableStorageMB >= minStorageMB
    } else {
      compatibility.storage = true
    }
  } catch (error) {
    console.error('Storage check failed:', error)
  }

  return compatibility
}

const CandidateDashboard = () => {
  const { user } = useAuth()
  const { theme } = useContext(ThemeContext)
  const navigate = useNavigate()
  const [candidate, setCandidate] = useState(null)
  const [assessments, setAssessments] = useState({
    eligible: [],
    all: [],
    attempted: [],
  })
  const [selectedAssessment, setSelectedAssessment] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isIneligibleModalOpen, setIsIneligibleModalOpen] = useState(false)
  const [isResourceWarningModalOpen, setIsResourceWarningModalOpen] =
    useState(false)
  const [ineligibleMessage, setIneligibleMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [activeTab, setActiveTab] = useState('recommended')
  const [modalStep, setModalStep] = useState(1)
  const [webcamError, setWebcamError] = useState('')
  const [webcamStream, setWebcamStream] = useState(null)
  const [cocoSsdModelLoading, setCocoSsdModelLoading] = useState(false)
  const [cocoSsdModelLoaded, setCocoSsdModelLoaded] = useState(false)
  const [gazeModelLoading, setGazeModelLoading] = useState(false)
  const [gazeModelLoaded, setGazeModelLoaded] = useState(false)
  const [cameraVerified, setCameraVerified] = useState(false)
  const [faceVerified, setFaceVerified] = useState(false)
  const [browserCompatibility, setBrowserCompatibility] = useState(null)
  const [compatibilityLoading, setCompatibilityLoading] = useState(false)

  const webcamRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    if (!user || user.role !== 'candidate') {
      navigate('/candidate/login')
      return
    }

    // Fetch candidate data
    fetch(`${baseUrl}/candidate/profile/${user.id}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to fetch profile: ${response.status} ${response.statusText}`
          )
        }
        return response.json()
      })
      .then((data) => {
        setCandidate(data)
        if (!data.is_profile_complete) {
          navigate('/candidate/complete-profile')
        }
      })
      .catch((error) => {
        console.error('Error fetching candidate:', error)
        setErrorMessage(`Failed to load candidate profile: ${error.message}`)
      })

    // Fetch assessments
    fetch(`${baseUrl}/candidate/eligible-assessments/${user.id}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to fetch assessments: ${response.status} ${response.statusText}`
          )
        }
        return response.json()
      })
      .then((data) => {
        setAssessments({
          eligible: data.eligible_assessments || [],
          all: data.all_assessments || [],
          attempted: data.attempted_assessments || [],
        })
      })
      .catch((error) => {
        console.error('Error fetching assessments:', error)
        setErrorMessage(`Failed to load assessments: ${error.message}`)
      })

    // Cleanup webcam stream on unmount
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [navigate, user])

  const handleRegisterAssessment = (assessment) => {
    setErrorMessage('')
    setSuccessMessage('')
    setIneligibleMessage('')
    if (!assessment.is_eligible) {
      setIneligibleMessage(
        `You are not eligible for this job. Required: ${
          assessment.experience_min
        }-${assessment.experience_max} years of experience, Degree: ${
          assessment.degree_required || 'None'
        }`
      )
      setIsIneligibleModalOpen(true)
      return
    }

    fetch(`${baseUrl}/candidate/register-assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        candidate_id: user.id,
        job_id: assessment.job_id,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Registration failed: ${response.status} ${response.statusText}`
          )
        }
        return response.json()
      })
      .then((data) => {
        if (data.message) {
          setSuccessMessage(data.message)
          fetch(`${baseUrl}/candidate/eligible-assessments/${user.id}`, {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          })
            .then((response) => {
              if (!response.ok) {
                throw new Error(
                  `Failed to refresh assessments: ${response.status} ${response.statusText}`
                )
              }
              return response.json()
            })
            .then((data) => {
              setAssessments({
                eligible: data.eligible_assessments || [],
                all: data.all_assessments || [],
                attempted: data.attempted_assessments || [],
              })
            })
            .catch((error) => {
              console.error('Error refreshing assessments:', error)
              setErrorMessage(`Failed to refresh assessments: ${error.message}`)
            })
        } else {
          setErrorMessage(
            data.error || 'Failed to register for the assessment.'
          )
        }
      })
      .catch((error) => {
        console.error('Error registering for assessment:', error)
        setErrorMessage(
          `Failed to register for the assessment: ${error.message}`
        )
      })
  }

  const handleStartAssessment = (assessment) => {
    const scheduleTime = new Date(
      assessment.schedule || assessment.schedule_start
    )
    const currentTime = new Date()

    if (currentTime < scheduleTime) {
      setErrorMessage(
        `This assessment has not yet started. It is scheduled for ${scheduleTime.toLocaleString()}.`
      )
      setSelectedAssessment(null)
      return
    }

    setSelectedAssessment(assessment)
    setErrorMessage('')
    setSuccessMessage('')
    setIneligibleMessage('')
    setModalStep(1)
    setWebcamError('')
    setWebcamStream(null)
    setCocoSsdModelLoading(false)
    setCocoSsdModelLoaded(false)
    setGazeModelLoading(false)
    setGazeModelLoaded(false)
    setCameraVerified(false)
    setFaceVerified(false)
    setBrowserCompatibility(null)
    setCompatibilityLoading(false)
    setIsResourceWarningModalOpen(false)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }
    setIsModalOpen(true)
  }

  const handleNextStep = async () => {
    setErrorMessage('')

    // Step 2: Request camera permission
    if (modalStep === 2) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        })
        setWebcamStream(stream)
        streamRef.current = stream
        if (webcamRef.current) webcamRef.current.video.srcObject = stream
        setWebcamError('')
        setModalStep(modalStep + 1)
      } catch (error) {
        setWebcamError(
          'Webcam access denied. Please allow webcam access to continue.'
        )
        setErrorMessage('Webcam access denied. Please allow webcam access.')
      }
    }
    // Step 3: Load COCO-SSD Model
    else if (modalStep === 3) {
      setCocoSsdModelLoading(true)
      try {
        await cocoSsd.load()
        setCocoSsdModelLoaded(true)
        setCocoSsdModelLoading(false)
        setModalStep(modalStep + 1)
      } catch (error) {
        setCocoSsdModelLoading(false)
        setErrorMessage('Failed to load object detection model.')
      }
    }
    // Step 4: Load Gaze Model (MediaPipe Face Landmarker)
    else if (modalStep === 4) {
      setGazeModelLoading(true)
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        )
        await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          outputFaceBlendshapes: false,
          numFaces: 1,
        })
        setGazeModelLoaded(true)
        setGazeModelLoading(false)
        setModalStep(modalStep + 1)
      } catch (error) {
        setGazeModelLoading(false)
        setErrorMessage('Failed to load gaze detection model.')
      }
    }
    // Step 5: Camera verification
    else if (modalStep === 5) {
      if (webcamStream) {
        setCameraVerified(true)
        setModalStep(modalStep + 1)
      } else {
        setWebcamError('No webcam feed detected. Please try again.')
        setErrorMessage('No webcam feed detected.')
      }
    }
    // Step 6: Face verification
    else if (modalStep === 6) {
      setFaceVerified(false)
      if (webcamRef.current && webcamStream) {
        const imageSrc = webcamRef.current.getScreenshot()
        if (!imageSrc) {
          setErrorMessage('Could not capture webcam image')
          return
        }

        setCompatibilityLoading(true)
        const blob = await fetch(imageSrc).then((r) => r.blob())
        const formData = new FormData()
        formData.append('webcam_image', blob, 'webcam.jpg')

        try {
          const response = await fetch(`${baseUrl}/candidate/verify-face`, {
            method: 'POST',
            body: formData,
            credentials: 'include',
          })

          const data = await response.json()
          setCompatibilityLoading(false)
          if (data.success) {
            setFaceVerified(true)
            setModalStep((prev) => prev + 1)
          } else {
            setErrorMessage(data.error || 'Face verification failed.')
          }
        } catch (error) {
          console.error('Error during face verification:', error)
          setCompatibilityLoading(false)
          setErrorMessage(`Face verification failed: ${error.message}`)
        }
      } else {
        setCompatibilityLoading(false)
        setErrorMessage('No webcam feed available for face verification.')
      }
    }
    // Step 7: Browser compatibility check
    else if (modalStep === 7) {
      setCompatibilityLoading(true)
      try {
        const compatibility = await checkBrowserCompatibility()
        setBrowserCompatibility(compatibility)
        setCompatibilityLoading(false)
        if (
          compatibility.webgl &&
          compatibility.tensorflow &&
          compatibility.mediapipe &&
          compatibility.camera &&
          compatibility.libraries &&
          compatibility.ram &&
          compatibility.storage
        ) {
          setModalStep(modalStep + 1)
          setErrorMessage('')
        } else {
          if (!compatibility.ram || !compatibility.storage) {
            setIsResourceWarningModalOpen(true)
          }
          let compatErrorMsg =
            'Browser compatibility check failed. Please ensure all requirements are met: '
          if (!compatibility.webgl) compatErrorMsg += 'WebGL, '
          if (!compatibility.tensorflow) compatErrorMsg += 'TensorFlow.js, '
          if (!compatibility.mediapipe) compatErrorMsg += 'MediaPipe, '
          if (!compatibility.camera) compatErrorMsg += 'Camera, '
          if (!compatibility.libraries) compatErrorMsg += 'Libraries, '
          if (!compatibility.ram) compatErrorMsg += 'Sufficient RAM, '
          if (!compatibility.storage) compatErrorMsg += 'Sufficient Storage, '
          setErrorMessage(compatErrorMsg.slice(0, -2) + '.')
        }
      } catch (error) {
        setCompatibilityLoading(false)
        setErrorMessage(`Browser compatibility check failed: ${error.message}`)
      }
    }
    // Step 8: Start Assessment
    else if (modalStep === 8) {
      if (
        selectedAssessment &&
        cameraVerified &&
        cocoSsdModelLoaded &&
        gazeModelLoaded &&
        faceVerified &&
        browserCompatibility?.webgl &&
        browserCompatibility?.tensorflow &&
        browserCompatibility?.mediapipe
      ) {
        if (streamRef.current) {
          console.log('Stopping webcam stream in CandidateDashboard')
          streamRef.current.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }

        fetch(`${baseUrl}/candidate/start-assessment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            user_id: user.id,
            job_id: selectedAssessment.job_id,
          }),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(
                `Failed to start assessment: ${response.status} ${response.statusText}`
              )
            }
            return response.json()
          })
          .then((data) => {
            if (data.attempt_id) {
              setIsModalOpen(false)
              navigate(`/candidate/assessment/${data.attempt_id}`)
            } else {
              setErrorMessage(data.error || 'Failed to start the assessment.')
            }
          })
          .catch((error) => {
            console.error('Error starting assessment:', error)
            setErrorMessage(`Failed to start the assessment: ${error.message}`)
          })
      } else {
        setErrorMessage(
          'Not all prerequisites are met to start the assessment.'
        )
      }
    } else {
      setModalStep(modalStep + 1)
    }
  }

  const handleBackStep = () => {
    if (modalStep > 1) {
      setModalStep(modalStep - 1)
      setErrorMessage('')
      if (modalStep === 3 && streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        setWebcamStream(null)
      }
      if (modalStep === 4) {
        setGazeModelLoaded(false)
      }
      if (modalStep === 5) {
        setCocoSsdModelLoaded(false)
      }
      if (modalStep === 6) {
        setFaceVerified(false)
      }
      if (modalStep === 7) {
        setBrowserCompatibility(null)
        setIsResourceWarningModalOpen(false)
      }
    }
  }

  useEffect(() => {
    if (errorMessage) {
      toast.error(errorMessage, { duration: 5000 })
    }
  }, [errorMessage])

  useEffect(() => {
    if (successMessage) {
      toast.success(successMessage, { duration: 5000 })
    }
  }, [successMessage])

  if (!candidate) {
    return <ClockLoader />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 flex flex-col font-sans">
      <Navbar />
      <div className="flex-grow py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent mb-8 text-center">
            Welcome, {candidate?.name?.split(' ')[0]}! Explore Your Job
            Opportunities
          </h1>

          {!candidate.is_profile_complete ? (
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-8">
              <p className="text-yellow-600 dark:text-yellow-300 text-xl font-medium flex items-center gap-2 justify-center">
                <AlertCircle className="w-6 h-6" />
                Please complete your profile to access assessments.
              </p>
              <div className="flex justify-center mt-4">
                <LinkButton
                  to="/candidate/complete-profile"
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  Complete Profile
                  <ChevronRight className="w-5 h-5 ml-2" />
                </LinkButton>
              </div>
            </div>
          ) : (
            <div className="space-y-12">
              <div className="flex border-b border-gray-200/50 dark:border-gray-700/50 gap-4 mb-8">
                {['recommended', 'explore', 'attempted'].map((tab) => (
                  <button
                    key={tab}
                    className={`px-4 py-2 text-base font-medium transition-all duration-200 ${
                      activeTab === tab
                        ? 'border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-300'
                        : 'text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/50'
                    } rounded-t-lg`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab === 'recommended'
                      ? 'Recommended Jobs'
                      : tab === 'explore'
                      ? 'Explore Jobs'
                      : 'Attempted Assessments'}
                  </button>
                ))}
              </div>

              {activeTab === 'recommended' && (
                <div>
                  {assessments.eligible.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {assessments.eligible.map((assessment) => (
                        <div
                          key={assessment.job_id}
                          className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300 flex flex-col justify-between"
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
                                Company: {assessment.company}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-3 text-base text-gray-600 dark:text-gray-400 mb-6">
                            <div className="flex items-center gap-2">
                              <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                              <span>
                                {assessment.experience_min}-
                                {assessment.experience_max} years
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                              <span>
                                Degree: {assessment.degree_required || 'None'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                              <span>Questions: {assessment.num_questions}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                              <span>
                                Duration: {assessment.duration} minutes
                              </span>
                            </div>
                            {assessment.schedule_start && (
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                                <span>
                                  {formatDate(assessment.schedule_start)} -{' '}
                                  {assessment.schedule_end
                                    ? formatDate(assessment.schedule_end)
                                    : 'Ongoing'}
                                </span>
                              </div>
                            )}
                            {assessment.skills &&
                              assessment.skills.length > 0 && (
                                <div className="flex flex-wrap gap-2 items-center">
                                  <Code className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
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
                          <button
                            onClick={() => {
                              if (assessment.is_registered) {
                                handleStartAssessment(assessment)
                              } else {
                                handleRegisterAssessment(assessment)
                              }
                            }}
                            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                            disabled={
                              !assessment.is_eligible &&
                              !candidate.is_profile_complete
                            }
                          >
                            {assessment.is_registered
                              ? 'Start Assessment'
                              : 'Register'}
                            <ArrowRight className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-8 text-center">
                      <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
                        No recommended jobs available at the moment.
                      </p>
                      <div className="flex justify-center">
                        <LinkButton
                          to="/candidate/complete-profile"
                          className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl inline-flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                        >
                          Update Profile
                          <ChevronRight className="w-5 h-5" />
                        </LinkButton>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'explore' && (
                <div>
                  {assessments.all.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {assessments.all.map((assessment) => (
                        <div
                          key={assessment.job_id}
                          className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300 flex flex-col justify-between"
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
                                Company: {assessment.company}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-3 text-base text-gray-600 dark:text-gray-400 mb-6">
                            <div className="flex items-center gap-2">
                              <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                              <span>
                                {assessment.experience_min}-
                                {assessment.experience_max} years
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                              <span>
                                Degree: {assessment.degree_required || 'None'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                              <span>Questions: {assessment.num_questions}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                              <span>
                                Duration: {assessment.duration} minutes
                              </span>
                            </div>
                            {assessment.schedule_start && (
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                                <span>
                                  {formatDate(assessment.schedule_start)} -{' '}
                                  {assessment.schedule_end
                                    ? formatDate(assessment.schedule_end)
                                    : 'Ongoing'}
                                </span>
                              </div>
                            )}
                            {assessment.skills &&
                              assessment.skills.length > 0 && (
                                <div className="flex flex-wrap gap-2 items-center">
                                  <Code className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
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
                          {assessment.is_eligible ? (
                            <button
                              onClick={() => {
                                if (assessment.is_registered) {
                                  handleStartAssessment(assessment)
                                } else {
                                  handleRegisterAssessment(assessment)
                                }
                              }}
                              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                              disabled={!candidate.is_profile_complete}
                            >
                              {assessment.is_registered
                                ? 'Start Assessment'
                                : 'Register'}
                              <ArrowRight className="w-5 h-5" />
                            </button>
                          ) : (
                            <div>
                              <p className="text-red-600 dark:text-red-400 mb-4">
                                Requires {assessment.experience_min}-
                                {assessment.experience_max} years of experience
                                {' & '}
                                {assessment.degree_required || 'None'}
                              </p>
                              <LinkButton
                                to="/candidate/complete-profile"
                                className="w-full bg-gradient-to-r from-gray-500 to-gray-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-gray-600 hover:to-gray-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                              >
                                Update Profile to Become Eligible
                                <ChevronRight className="w-5 h-5" />
                              </LinkButton>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-8 text-center">
                      <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
                        No jobs available at the moment.
                      </p>
                      <LinkButton
                        to="/candidate/complete-profile"
                        className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 mx-auto"
                      >
                        Update Profile
                        <ChevronRight className="w-5 h-5" />
                      </LinkButton>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'attempted' &&
                assessments.attempted.length > 0 && (
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {assessments.attempted.map((assessment) => (
                        <div
                          key={assessment.attempt_id}
                          className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300"
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
                                Company: {assessment.company}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-3 text-base text-gray-600 dark:text-gray-400 mb-6">
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-green-600 dark:text-green-300" />
                              <span>Status: {assessment.status}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                              <span>
                                Attempted:{' '}
                                {format(
                                  new Date(assessment.attempt_date),
                                  'MMM d, yyyy'
                                )}
                              </span>
                            </div>
                          </div>
                          <LinkButton
                            to={`/candidate/assessment/${assessment.attempt_id}/results`}
                            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                          >
                            View Report
                            <ChevronRight className="w-5 h-5" />
                          </LinkButton>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}

          <Modal
            isOpen={isModalOpen}
            onRequestClose={() => {
              setIsModalOpen(false)
              if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop())
              }
            }}
            className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg p-8 rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 max-w-5xl mx-auto mt-20 outline-none h-[90vh] overflow-y-auto"
            overlayClassName="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-75 flex justify-center items-center p-4 z-50"
            aria={{
              labelledby: 'assessment-modal-title',
              describedby: 'assessment-modal-desc',
            }}
          >
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-center">
                <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                  <BookOpen className="w-8 h-8 text-white" />
                </div>
                <h2
                  id="assessment-modal-title"
                  className="text-2xl font-bold text-gray-900 dark:text-white"
                >
                  {modalStep === 1 && 'Assessment Details'}
                  {modalStep === 2 && 'Camera Permission'}
                  {modalStep === 3 && 'Load Object Detection Model'}
                  {modalStep === 4 && 'Load Gaze Detection Model'}
                  {modalStep === 5 && 'Camera Verification'}
                  {modalStep === 6 && 'Face Verification'}
                  {modalStep === 7 && 'Browser Compatibility'}
                  {modalStep === 8 && 'Start Assessment'}
                </h2>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false)
                  if (streamRef.current) {
                    streamRef.current
                      .getTracks()
                      .forEach((track) => track.stop())
                  }
                }}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-all duration-200"
                aria-label="Close modal"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {selectedAssessment && (
              <div id="assessment-modal-desc">
                <div className="flex items-center justify-between mb-8">
                  {[
                    'Details',
                    'Camera Permission',
                    'AI Model Loading',
                    'Proctoring Model Loading',
                    'Camera Verification',
                    'Face Verification',
                    'Browser Compatibility',
                    'Start',
                  ].map((label, index) => (
                    <div key={index} className="flex items-center flex-1">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                          modalStep > index + 1
                            ? 'bg-green-500 text-white'
                            : modalStep == index + 1
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {modalStep > index + 1 ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <span
                        className={`ml-2 text-sm ${
                          modalStep >= index + 1
                            ? 'text-gray-900 dark:text-gray-100'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {label}
                      </span>
                      {index < 7 && (
                        <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 mx-2">
                          <div
                            className={`h-full ${
                              modalStep > index + 1
                                ? 'bg-green-500'
                                : 'bg-gray-200 dark:bg-gray-700'
                            }`}
                          ></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {modalStep === 1 && (
                  <div className="space-y-6 text-base mb-8">
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Job Title
                      </h3>
                      <p className="text-gray-900 dark:text-gray-100 text-lg">
                        {selectedAssessment.job_title}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Company
                      </h3>
                      <p className="text-gray-900 dark:text-gray-100 text-lg">
                        {selectedAssessment.company}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Duration
                      </h3>
                      <p className="text-gray-900 dark:text-gray-100 text-lg">
                        {selectedAssessment.duration} minutes
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Questions
                      </h3>
                      <p className="text-gray-900 dark:text-gray-100 text-lg">
                        {selectedAssessment.num_questions}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Prerequisites
                      </h3>
                      <div className="space-y-3 text-gray-900 dark:text-gray-100">
                        <div className="flex items-center gap-2">
                          <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                          <span>
                            Experience: {selectedAssessment.experience_min}-
                            {selectedAssessment.experience_max} years
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                          <span>
                            Degree:{' '}
                            {selectedAssessment.degree_required || 'None'}
                          </span>
                        </div>
                        {selectedAssessment.skills &&
                          selectedAssessment.skills.length > 0 && (
                            <div className="flex flex-wrap gap-2 items-center">
                              <Code className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                              {selectedAssessment.skills.map((skill, index) => (
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
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Description
                      </h3>
                      <p className="text-gray-900 dark:text-gray-100 bg-white/50 dark:bg-gray-700/50 p-4 rounded-xl border border-gray-200/50 dark:border-gray-700/50 overflow-auto max-h-[15rem]">
                        {selectedAssessment.job_description ||
                          'No description provided.'}
                      </p>
                    </div>
                    <div className="bg-white/50 dark:bg-gray-700/50 backdrop-blur-lg p-6 rounded-xl border border-gray-200/50 dark:border-gray-700/50">
                      <h3 className="text-lg font-medium text-indigo-600 dark:text-indigo-300 mb-4">
                        Important Instructions:
                      </h3>
                      <ul className="text-base text-gray-700 dark:text-gray-200 space-y-3">
                        <li className="flex items-center gap-2">
                          <Check className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
                          <span>Ensure a stable internet connection.</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
                          <span>Find a quiet, well-lit environment.</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
                          <span>Allow webcam access for proctoring.</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
                          <span>Do not switch tabs during the assessment.</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
                          <span>
                            You cannot pause the assessment once started.
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                )}

                {modalStep === 2 && (
                  <div className="space-y-6 text-base mb-8">
                    <p className="text-gray-900 dark:text-gray-100">
                      This assessment requires webcam access for proctoring.
                      Please allow camera access to proceed.
                    </p>
                    {webcamError && (
                      <div className="bg-red-50/80 dark:bg-red-900/20 border border-red-200/50 dark:border-red-700/50 text-red-700 dark:text-red-300 p-4 rounded-xl flex items-center gap-3">
                        <X className="w-5 h-5" />
                        <span>{webcamError}</span>
                      </div>
                    )}
                    {webcamStream && (
                      <div className="bg-green-50/80 dark:bg-green-900/20 border border-green-200/50 dark:border-green-700/50 text-green-700 dark:text-green-300 p-4 rounded-xl flex items-center gap-3">
                        <Check className="w-5 h-5" />
                        <span>Camera permission granted successfully.</span>
                      </div>
                    )}
                    <Button
                      onClick={handleNextStep}
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                      disabled={webcamStream}
                    >
                      Request Camera Access
                      <Camera className="w-5 h-5" />
                    </Button>
                  </div>
                )}

                {modalStep === 3 && (
                  <div className="space-y-6 text-base mb-8">
                    <p className="text-gray-900 dark:text-gray-100">
                      The assessment requires an object detection model for
                      proctoring. Please load the model to proceed.
                    </p>
                    {errorMessage && (
                      <div className="bg-red-50/80 dark:bg-red-900/20 border border-red-200/50 dark:border-red-700/50 text-red-700 dark:text-red-300 p-4 rounded-xl flex items-center gap-3">
                        <X className="w-5 h-5" />
                        <span>{errorMessage}</span>
                      </div>
                    )}
                    {cocoSsdModelLoaded && (
                      <div className="bg-green-50/80 dark:bg-green-900/20 border border-green-200/50 dark:border-green-700/50 text-green-700 dark:text-green-300 p-4 rounded-xl flex items-center gap-3">
                        <Check className="w-5 h-5" />
                        <span>Object detection model loaded successfully.</span>
                      </div>
                    )}
                    {cocoSsdModelLoading && (
                      <div className="flex items-center gap-3 justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                        <span className="text-gray-700 dark:text-gray-200">
                          Loading object detection model...
                        </span>
                      </div>
                    )}
                    <Button
                      onClick={handleNextStep}
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                      disabled={cocoSsdModelLoading || cocoSsdModelLoaded}
                    >
                      Load AI Model
                      <ArrowRight className="w-5 h-5" />
                    </Button>
                  </div>
                )}

                {modalStep === 4 && (
                  <div className="space-y-6 text-base mb-8">
                    <p className="text-gray-900 dark:text-gray-100">
                      The assessment also uses a gaze detection model for
                      proctoring. Please load this model to proceed.
                    </p>
                    {errorMessage && (
                      <div className="bg-red-50/80 dark:bg-red-900/20 border border-red-200/50 dark:border-red-700/50 text-red-700 dark:text-red-300 p-4 rounded-xl flex items-center gap-3">
                        <X className="w-5 h-5" />
                        <span>{errorMessage}</span>
                      </div>
                    )}
                    {gazeModelLoaded && (
                      <div className="bg-green-50/80 dark:bg-green-900/20 border border-green-200/50 dark:border-green-700/50 text-green-700 dark:text-green-300 p-4 rounded-xl flex items-center gap-3">
                        <Check className="w-5 h-5" />
                        <span>Gaze detection model loaded successfully.</span>
                      </div>
                    )}
                    {gazeModelLoading && (
                      <div className="flex items-center gap-3 justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                        <span className="text-gray-700 dark:text-gray-200">
                          Loading gaze detection model...
                        </span>
                      </div>
                    )}
                    <Button
                      onClick={handleNextStep}
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                      disabled={gazeModelLoading || gazeModelLoaded}
                    >
                      Load Proctoring Model
                      <ArrowRight className="w-5 h-5" />
                    </Button>
                  </div>
                )}

                {modalStep === 5 && (
                  <div className="space-y-6 text-base mb-8">
                    <p className="text-gray-900 dark:text-gray-100">
                      Please verify that your webcam is working correctly. You
                      should see your video feed below.
                    </p>
                    {webcamError && (
                      <div className="bg-red-50/80 dark:bg-red-900/20 border border-red-200/50 dark:border-red-700/50 text-red-700 dark:text-red-300 p-4 rounded-xl flex items-center gap-3">
                        <X className="w-5 h-5" />
                        <span>{webcamError}</span>
                      </div>
                    )}
                    <div className="relative w-full aspect-video bg-gray-100/80 dark:bg-gray-700/80 rounded-2xl overflow-hidden border border-gray-200/50 dark:border-gray-700/50 shadow-inner">
                      {webcamStream && (
                        <Webcam
                          ref={webcamRef}
                          width={VIDEO_WIDTH}
                          height={VIDEO_HEIGHT}
                          audio={false}
                          screenshotFormat="image/jpeg"
                          videoConstraints={videoConstraints}
                          className="absolute top-0 left-0 w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <Button
                      onClick={() => {
                        setCameraVerified(true)
                        handleNextStep()
                      }}
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                      disabled={!webcamStream}
                    >
                      Verify Camera
                      <Camera className="w-5 h-5" />
                    </Button>
                  </div>
                )}

                {modalStep === 6 && (
                  <div className="space-y-6 text-base mb-8">
                    <p className="text-gray-900 dark:text-gray-100">
                      Please verify your identity using facial recognition.
                      Ensure your face is clearly visible in the webcam feed
                      below.
                    </p>
                    {errorMessage && (
                      <div className="bg-red-50/80 dark:bg-red-900/20 border border-red-200/50 dark:border-red-700/50 text-red-700 dark:text-red-300 p-4 rounded-xl flex items-center gap-3">
                        <X className="w-5 h-5" />
                        <span>{errorMessage}</span>
                      </div>
                    )}
                    {faceVerified && (
                      <div className="bg-green-50/80 dark:bg-green-900/20 border border-green-200/50 dark:border-green-700/50 text-green-700 dark:text-green-300 p-4 rounded-xl flex items-center gap-3">
                        <Check className="w-5 h-5" />
                        <span>Face verified successfully.</span>
                      </div>
                    )}
                    {compatibilityLoading && (
                      <div className="flex items-center gap-3 justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                        <span className="text-gray-700 dark:text-gray-200">
                          Verifying face...
                        </span>
                      </div>
                    )}
                    <div className="relative w-full aspect-video bg-gray-100/80 dark:bg-gray-700/80 rounded-2xl overflow-hidden border border-gray-200/50 dark:border-gray-700/50 shadow-inner">
                      {webcamStream && (
                        <Webcam
                          ref={webcamRef}
                          width={VIDEO_WIDTH}
                          height={VIDEO_HEIGHT}
                          audio={false}
                          screenshotFormat="image/jpeg"
                          videoConstraints={videoConstraints}
                          className="absolute top-0 left-0 w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <Button
                      onClick={handleNextStep}
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                      disabled={
                        !webcamStream || faceVerified || compatibilityLoading
                      }
                    >
                      Verify Face
                      <Camera className="w-5 h-5" />
                    </Button>
                  </div>
                )}

                {modalStep === 7 && (
                  <div className="space-y-6 text-base mb-8">
                    <p className="text-gray-900 dark:text-gray-100">
                      Verifying browser compatibility for the assessment. This
                      includes checking for WebGL, TensorFlow.js, MediaPipe,
                      camera availability, required libraries, RAM, and storage.
                    </p>
                    {errorMessage && (
                      <div className="bg-red-50/80 dark:bg-red-900/20 border border-red-200/50 dark:border-red-700/50 text-red-700 dark:text-red-300 p-4 rounded-xl flex items-center gap-3">
                        <X className="w-5 h-5" />
                        <span>{errorMessage}</span>
                      </div>
                    )}
                    {browserCompatibility && (
                      <div className="bg-green-50/80 dark:bg-green-900/20 border border-green-200/50 dark:border-green-700/50 text-green-700 dark:text-green-300 p-4 rounded-xl">
                        <ul className="space-y-3">
                          <li className="flex items-center gap-2">
                            {browserCompatibility.webgl ? (
                              <Check className="w-5 h-5" />
                            ) : (
                              <X className="w-5 h-5 text-red-700 dark:text-red-300" />
                            )}
                            <span>WebGL Support</span>
                          </li>
                          <li className="flex items-center gap-2">
                            {browserCompatibility.tensorflow ? (
                              <Check className="w-5 h-5" />
                            ) : (
                              <X className="w-5 h-5 text-red-700 dark:text-red-300" />
                            )}
                            <span>TensorFlow.js Support</span>
                          </li>
                          <li className="flex items-center gap-2">
                            {browserCompatibility.mediapipe ? (
                              <Check className="w-5 h-5" />
                            ) : (
                              <X className="w-5 h-5 text-red-700 dark:text-red-300" />
                            )}
                            <span>MediaPipe Support</span>
                          </li>
                          <li className="flex items-center gap-2">
                            {browserCompatibility.camera ? (
                              <Check className="w-5 h-5" />
                            ) : (
                              <X className="w-5 h-5 text-red-700 dark:text-red-300" />
                            )}
                            <span>Camera Availability</span>
                          </li>
                          <li className="flex items-center gap-2">
                            {browserCompatibility.libraries ? (
                              <Check className="w-5 h-5" />
                            ) : (
                              <X className="w-5 h-5 text-red-700 dark:text-red-300" />
                            )}
                            <span>Required Libraries</span>
                          </li>
                          <li className="flex items-center gap-2">
                            {browserCompatibility.ram ? (
                              <Check className="w-5 h-5" />
                            ) : (
                              <X className="w-5 h-5 text-red-700 dark:text-red-300" />
                            )}
                            <span>RAM Availability (min 4GB)</span>
                          </li>
                          <li className="flex items-center gap-2">
                            {browserCompatibility.storage ? (
                              <Check className="w-5 h-5" />
                            ) : (
                              <X className="w-5 h-5 text-red-700 dark:text-red-300" />
                            )}
                            <span>Storage Availability (min 500MB)</span>
                          </li>
                        </ul>
                      </div>
                    )}
                    {compatibilityLoading && (
                      <div className="flex items-center gap-3 justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                        <span className="text-gray-700 dark:text-gray-200">
                          Checking browser compatibility...
                        </span>
                      </div>
                    )}
                    <Button
                      onClick={handleNextStep}
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                      disabled={
                        compatibilityLoading ||
                        (browserCompatibility &&
                          browserCompatibility.webgl &&
                          browserCompatibility.tensorflow &&
                          browserCompatibility.mediapipe &&
                          browserCompatibility.camera &&
                          browserCompatibility.libraries &&
                          browserCompatibility.ram &&
                          browserCompatibility.storage)
                      }
                    >
                      Check Compatibility
                      <ArrowRight className="w-5 h-5" />
                    </Button>
                  </div>
                )}

                {modalStep === 8 && (
                  <div className="space-y-6 text-base mb-8">
                    <p className="text-gray-900 dark:text-gray-100">
                      All prerequisites are complete. You are ready to start the
                      assessment for {selectedAssessment.job_title} at{' '}
                      {selectedAssessment.company}.
                    </p>
                    {errorMessage && (
                      <div className="bg-red-50/80 dark:bg-red-900/20 border border-red-200/50 dark:border-red-700/50 text-red-700 dark:text-red-300 p-4 rounded-xl flex items-center gap-3">
                        <X className="w-5 h-5" />
                        <span>{errorMessage}</span>
                      </div>
                    )}
                    <div className="bg-green-50/80 dark:bg-green-900/20 border border-green-200/50 dark:border-green-700/50 text-green-700 dark:text-green-300 p-4 rounded-xl">
                      <ul className="space-y-3">
                        <li className="flex items-center gap-2">
                          <Check className="w-5 h-5" />
                          Camera permission granted
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-5 h-5" />
                          Object detection model loaded
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-5 h-5" />
                          Gaze detection model loaded
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-5 h-5" />
                          Camera verified
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-5 h-5" />
                          Face verified
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-5 h-5" />
                          Browser compatibility verified
                        </li>
                      </ul>
                    </div>
                  </div>
                )}

                <div className="flex justify-between gap-4">
                  {modalStep > 1 && (
                    <Button
                      onClick={handleBackStep}
                      className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-6 py-3 rounded-xl hover:from-gray-600 hover:to-gray-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                    >
                      Back
                    </Button>
                  )}
                  <div className="flex justify-end gap-4 flex-1">
                    <Button
                      onClick={() => {
                        setIsModalOpen(false)
                        if (streamRef.current) {
                          streamRef.current
                            .getTracks()
                            .forEach((track) => track.stop())
                        }
                      }}
                      className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-6 py-3 rounded-xl hover:from-gray-600 hover:to-gray-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleNextStep}
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                      disabled={
                        (modalStep === 2 && webcamStream) ||
                        (modalStep === 3 &&
                          (cocoSsdModelLoading || cocoSsdModelLoaded)) ||
                        (modalStep === 4 &&
                          (gazeModelLoading || gazeModelLoaded)) ||
                        (modalStep === 5 && !webcamStream) ||
                        (modalStep === 6 &&
                          (!webcamStream ||
                            faceVerified ||
                            compatibilityLoading)) ||
                        (modalStep === 7 &&
                          (compatibilityLoading ||
                            (browserCompatibility &&
                              browserCompatibility.webgl &&
                              browserCompatibility.tensorflow &&
                              browserCompatibility.mediapipe &&
                              browserCompatibility.camera &&
                              browserCompatibility.libraries &&
                              browserCompatibility.ram &&
                              browserCompatibility.storage))) ||
                        (modalStep === 8 &&
                          !(
                            cameraVerified &&
                            cocoSsdModelLoaded &&
                            gazeModelLoaded &&
                            faceVerified &&
                            browserCompatibility?.webgl &&
                            browserCompatibility?.ram &&
                            browserCompatibility?.storage
                          ))
                      }
                    >
                      {modalStep === 8 ? 'Start Assessment' : 'Next'}
                      <ArrowRight className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Modal>

          <Modal
            isOpen={isIneligibleModalOpen}
            onRequestClose={() => setIsIneligibleModalOpen(false)}
            className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg p-8 rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 max-w-md mx-auto mt-20 outline-none"
            overlayClassName="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-75 flex justify-center items-center p-4 z-50"
          >
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-center">
                <div className="p-3 bg-gradient-to-r from-red-500 to-pink-600 rounded-xl mr-4">
                  <AlertCircle className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Not Eligible
                </h2>
              </div>
              <button
                onClick={() => setIsIneligibleModalOpen(false)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-all duration-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-lg text-gray-700 dark:text-gray-200 mb-8">
              {ineligibleMessage}
            </p>
            <div className="flex justify-end gap-4">
              <LinkButton
                to="/candidate/complete-profile"
                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Update Profile
                <ArrowRight className="w-5 h-5" />
              </LinkButton>
              <button
                onClick={() => setIsIneligibleModalOpen(false)}
                className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-6 py-3 rounded-xl hover:from-gray-600 hover:to-gray-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Close
              </button>
            </div>
          </Modal>

          <Modal
            isOpen={isResourceWarningModalOpen}
            onRequestClose={() => setIsResourceWarningModalOpen(false)}
            className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg p-8 rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 max-w-md mx-auto mt-20 outline-none"
            overlayClassName="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-75 flex justify-center items-center p-4 z-50"
          >
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-center">
                <div className="p-3 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-xl mr-4">
                  <AlertTriangle className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Resource Warning
                </h2>
              </div>
              <button
                onClick={() => setIsResourceWarningModalOpen(false)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-all duration-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-lg text-gray-700 dark:text-gray-200 mb-8">
              Your device may not have sufficient RAM (minimum 4GB) or storage
              (minimum 500MB) to run the assessment smoothly. Please close other
              applications or browser tabs to free up resources and try again.
            </p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setIsResourceWarningModalOpen(false)}
                className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-6 py-3 rounded-xl hover:from-gray-600 hover:to-gray-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Close
              </button>
            </div>
          </Modal>
        </div>
      </div>
    </div>
  )
}

export default CandidateDashboard
