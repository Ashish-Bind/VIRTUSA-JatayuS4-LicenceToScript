import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import '@tensorflow/tfjs'
import {
  BookOpen,
  Camera,
  Clock,
  Home,
  RefreshCw,
  Star,
  StopCircle,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate, useParams } from 'react-router-dom'
import Webcam from 'react-webcam'
import AssessmentMessages from './components/AssessmentMessages'
import Button from './components/Button'
import { MAX_TAB_SWITCHES } from './utils/constants'
import {
  baseUrl,
  captureSnapshot,
  endAssessment,
  fetchNextQuestion,
  formatTime,
  handleAnswerSubmit,
} from './utils/utils'

const VIDEO_WIDTH = 400
const VIDEO_HEIGHT = 300
const videoConstraints = {
  width: VIDEO_WIDTH,
  height: VIDEO_HEIGHT,
  facingMode: 'user',
}
const COOLDOWN_SECONDS = {
  multiPerson: 10,
  cellPhone: 10,
  noPerson: 5,
  gazeAway: 5,
}
const NO_PERSON_TIMEOUT = 5
const MINIMUM_SNAPSHOT_DELAY = 2000 // 2 seconds

const AssessmentChatbot = () => {
  const { attemptId } = useParams()
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [questionNumber, setQuestionNumber] = useState(0)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [skill, setSkill] = useState('')
  const [userAnswer, setUserAnswer] = useState('')
  const [isAssessmentComplete, setIsAssessmentComplete] = useState(false)
  const [timeLeft, setTimeLeft] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [tabSwitches, setTabSwitches] = useState(0)
  const [questionPending, setQuestionPending] = useState(false)
  const [awaitingNextQuestion, setAwaitingNextQuestion] = useState(false)
  const [webcamError, setWebcamError] = useState('')
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false)
  const [questionStartTime, setQuestionStartTime] = useState(null)
  const [usedMcqIds, setUsedMcqIds] = useState([])
  const [cocoSsdModel, setCocoSsdModel] = useState(null)
  const [faceLandmarkerModel, setFaceLandmarkerModel] = useState(null)
  const [modelLoading, setModelLoading] = useState(true)
  const [capturedImg, setCapturedImg] = useState(null)
  const [lastPersonDetected, setLastPersonDetected] = useState(Date.now())
  const [webcamKey, setWebcamKey] = useState(0)

  const initialStartComplete = useRef(false)
  const currentMcqId = useRef(null)
  const chatContainerRef = useRef(null)
  const webcamRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const initialTimeLeft = useRef(null)
  const snapshotScheduled = useRef(false)
  const snapshotTimersRef = useRef([])
  const tabSwitchesRef = useRef(tabSwitches)
  const violationQueue = useRef([])
  const snapshotQueue = useRef([])
  const isProcessingViolation = useRef(false)
  const isProcessingSnapshot = useRef(false)
  const isGettingStream = useRef(false)
  const cooldownRef = useRef({
    multiPerson: 0,
    cellPhone: 0,
    noPerson: 0,
    gazeAway: 0,
  })

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      snapshotTimersRef.current.forEach(clearTimeout)
      snapshotTimersRef.current = []
      snapshotScheduled.current = false
      if (streamRef.current) {
        console.log('Cleaning up AssessmentChatbot stream...')
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (faceLandmarkerModel) {
        console.log('Closing Face Landmarker model...')
        faceLandmarkerModel.close()
      }
    }
  }, [faceLandmarkerModel])

  // Load COCO-SSD and FaceLandmarker models
  useEffect(() => {
    async function loadModels() {
      setModelLoading(true)
      try {
        const [cocoSsdLoadedModel, vision] = await Promise.all([
          cocoSsd.load(),
          FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
          ),
        ])
        setCocoSsdModel(cocoSsdLoadedModel)

        const faceLandmarkerLoadedModel =
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
        setFaceLandmarkerModel(faceLandmarkerLoadedModel)
        console.log('✅ All models loaded')
        setErrorMessage('')
      } catch (error) {
        toast.error(
          'Failed to load one or more object detection models. Please refresh the page.'
        )
        console.error('Error loading models:', error)
        setErrorMessage(
          'Failed to load critical AI models. Please refresh the page and try again.'
        )
      } finally {
        setModelLoading(false)
      }
    }
    loadModels()
  }, [])

  // Draw Predictions for COCO-SSD
  const drawPredictions = useCallback((predictions) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT)
      ctx.font = '16px Arial'
      predictions.forEach((pred) => {
        ctx.beginPath()
        ctx.rect(...pred.bbox)
        ctx.lineWidth = 2
        ctx.strokeStyle = 'red'
        ctx.fillStyle = 'red'
        ctx.stroke()
        ctx.fillText(
          `${pred.class} (${Math.round(pred.score * 100)}%)`,
          pred.bbox[0],
          pred.bbox[1] > 10 ? pred.bbox[1] - 5 : 10
        )
      })
    }
  }, [])

  // Capture Violation Image
  const captureImage = useCallback(
    async (violationType, imageSrc) => {
      try {
        const response = await fetch(imageSrc)
        const blob = await response.blob()
        const formData = new FormData()
        formData.append('snapshot', blob, 'snapshot.jpg')
        formData.append('violation_type', violationType)

        const response2 = await fetch(
          `${baseUrl}/assessment/store-violation/${attemptId}`,
          {
            method: 'POST',
            body: formData,
            credentials: 'include',
          }
        )
        const data = await response2.json()
        if (data.error) {
          toast.error(data.error)
        } else {
          console.log('Violation recorded successfully')
        }
      } catch (error) {
        console.log('Failed to record violation')
        console.error('Violation error:', error)
      }
    },
    [attemptId]
  )

  // Process Violation Queue
  const processViolationQueue = useCallback(async () => {
    if (isProcessingViolation.current || violationQueue.current.length === 0)
      return

    isProcessingViolation.current = true
    const { violationType, imageSrc } = violationQueue.current.shift()
    await captureImage(violationType, imageSrc)
    isProcessingViolation.current = false

    if (violationQueue.current.length > 0) {
      processViolationQueue()
    }
  }, [captureImage])

  // Queue Violation
  const queueViolation = useCallback(
    (violationType) => {
      if (
        webcamRef.current &&
        webcamRef.current.video &&
        webcamRef.current.video.readyState === 4
      ) {
        try {
          const imageSrc = webcamRef.current.getScreenshot()
          if (imageSrc) {
            setCapturedImg(imageSrc)
            violationQueue.current.push({ violationType, imageSrc })
            processViolationQueue()
          } else {
            console.warn(
              'Could not capture screenshot for violation:',
              violationType
            )
          }
        } catch (error) {
          console.error('Error capturing screenshot for violation:', error)
        }
      } else {
        console.warn('Webcam not ready to capture violation:', violationType)
      }
    },
    [processViolationQueue]
  )

  // Process Snapshot Queue
  const processSnapshotQueue = useCallback(async () => {
    if (isProcessingSnapshot.current || snapshotQueue.current.length === 0)
      return

    isProcessingSnapshot.current = true
    const { imageSrc } = snapshotQueue.current.shift()
    try {
      await captureSnapshot(
        attemptId,
        {
          current: {
            getScreenshot: () => imageSrc,
            video: webcamRef.current.video,
          },
        },
        () => {},
        () => {}
      )
    } catch (error) {
      console.error('Snapshot queue error:', error)
    }
    isProcessingSnapshot.current = false

    if (snapshotQueue.current.length > 0) {
      processSnapshotQueue()
    }
  }, [attemptId])

  // Queue Snapshot
  const queueSnapshot = useCallback(() => {
    if (
      webcamRef.current &&
      webcamRef.current.video &&
      webcamRef.current.video.readyState === 4
    ) {
      const imageSrc = webcamRef.current.getScreenshot()
      if (imageSrc) {
        snapshotQueue.current.push({ imageSrc })
        processSnapshotQueue()
      }
    }
  }, [processSnapshotQueue])

  // Schedule Snapshots
  const scheduleSnapshots = useCallback(() => {
    if (
      !initialStartComplete.current ||
      initialTimeLeft.current === null ||
      !streamRef.current ||
      isAssessmentComplete ||
      snapshotScheduled.current
    )
      return

    snapshotScheduled.current = true
    const numSnapshots = Math.floor(Math.random() * 3) + 3
    const intervals = Array.from(
      { length: numSnapshots },
      () => Math.trunc(Math.random() * initialTimeLeft.current * 1000) / 10
    ).sort((a, b) => a - b)

    snapshotTimersRef.current = intervals.map((interval, index) =>
      setTimeout(() => {
        if (
          !isAssessmentComplete &&
          streamRef.current &&
          webcamRef.current?.video
        ) {
          console.log(
            `Scheduling snapshot ${
              index + 1
            } for attemptId: ${attemptId} at ${interval}ms`
          )
          queueSnapshot()
        }
      }, Math.max(interval, MINIMUM_SNAPSHOT_DELAY))
    )
  }, [attemptId, queueSnapshot, isAssessmentComplete])

  // Detection loop for COCO-SSD and FaceLandmarker
  useEffect(() => {
    let animationId
    const detectFrame = async () => {
      if (
        !webcamRef.current ||
        !webcamRef.current.video ||
        webcamRef.current.video.readyState !== 4 ||
        (!cocoSsdModel && !faceLandmarkerModel)
      ) {
        animationId = requestAnimationFrame(detectFrame)
        return
      }

      const video = webcamRef.current.video
      const now = performance.now()

      if (cocoSsdModel) {
        try {
          const predictions = await cocoSsdModel.detect(video)
          drawPredictions(predictions)

          const personCount = predictions.filter(
            (p) => p.class.toLowerCase() === 'person'
          ).length

          if (personCount > 1) {
            const nowTime = Date.now()
            if (
              nowTime - cooldownRef.current.multiPerson >
              COOLDOWN_SECONDS.multiPerson * 1000
            ) {
              cooldownRef.current.multiPerson = nowTime
              toast.error('Multiple persons detected!', {
                autoClose: 2000,
                position: 'top-center',
              })
              queueViolation('multiple_faces')
            }
          }

          if (personCount > 0) {
            setLastPersonDetected(Date.now())
          }

          const cellPhoneFound = predictions.some(
            (p) => p.class.toLowerCase() === 'cell phone'
          )
          if (cellPhoneFound) {
            const nowTime = Date.now()
            if (
              nowTime - cooldownRef.current.cellPhone >
              COOLDOWN_SECONDS.cellPhone * 1000
            ) {
              cooldownRef.current.cellPhone = nowTime
              toast.error('Cell phone detected!', {
                autoClose: 2000,
                position: 'top-center',
              })
              queueViolation('mobile_phone')
            }
          }

          const secondsSince = (Date.now() - lastPersonDetected) / 1000
          if (personCount === 0 && secondsSince > NO_PERSON_TIMEOUT) {
            const nowTime = Date.now()
            if (
              nowTime - cooldownRef.current.noPerson >
              COOLDOWN_SECONDS.noPerson * 1000
            ) {
              cooldownRef.current.noPerson = nowTime
              toast('No person detected for too long!', {
                autoClose: 2500,
                position: 'top-center',
                style: {
                  background: '#fef3c7',
                  color: '#b45309',
                },
              })
              queueViolation('no_face')
            }
          }
        } catch (error) {
          console.error('Error during COCO-SSD detection:', error)
        }
      }

      if (faceLandmarkerModel) {
        try {
          const results = faceLandmarkerModel.detectForVideo(video, now)
          if (
            results.faceLandmarks &&
            results.faceLandmarks.length > 0 &&
            results.faceLandmarks[0].length > 473
          ) {
            const landmarks = results.faceLandmarks[0]
            const leftEyeOuter = landmarks[33]
            const leftEyeInner = landmarks[133]
            const leftIris = landmarks[468]

            const eyeWidth = leftEyeInner.x - leftEyeOuter.x
            const irisOffset = leftIris.x - leftEyeOuter.x
            const normalized = irisOffset / eyeWidth

            const nowTime = Date.now()
            if (
              (normalized < 0.35 || normalized > 0.65) &&
              nowTime - cooldownRef.current.gazeAway >
                COOLDOWN_SECONDS.gazeAway * 1000
            ) {
              cooldownRef.current.gazeAway = nowTime
              toast('User is looking away from the screen!', {
                icon: '⚠️',
                duration: 2000,
                position: 'top-center',
                style: {
                  background: '#fffbe6',
                  color: '#ca8a04',
                  border: '1px solid #fde047',
                },
              })
              queueViolation('gaze_away')
            }
          }
        } catch (error) {
          console.error('Error during Gaze detection:', error)
        }
      }
      animationId = requestAnimationFrame(detectFrame)
    }

    if (
      !modelLoading &&
      (cocoSsdModel || faceLandmarkerModel) &&
      !errorMessage
    ) {
      animationId = requestAnimationFrame(detectFrame)
    }
    return () => cancelAnimationFrame(animationId)
  }, [
    cocoSsdModel,
    faceLandmarkerModel,
    queueViolation,
    drawPredictions,
    lastPersonDetected,
    modelLoading,
    errorMessage,
  ])

  useEffect(() => {
    tabSwitchesRef.current = tabSwitches
  }, [tabSwitches])

  // Start Assessment
  const startAssessment = useCallback(async () => {
    if (modelLoading || errorMessage) {
      console.log('startAssessment blocked: Model loading or existing error.')
      return
    }
    if (initialStartComplete.current || isLoading || isAssessmentComplete) {
      console.log(
        'startAssessment blocked: Already started, loading, or complete.'
      )
      return
    }

    setIsLoading(true)
    setErrorMessage('')
    setMessages([])
    setUserAnswer('')
    setQuestionNumber(0)
    setCurrentQuestion(null)
    setQuestionPending(false)
    setAwaitingNextQuestion(false)
    setIsAssessmentComplete(false)
    setIsGeneratingQuestion(false)
    setQuestionStartTime(null)
    setUsedMcqIds([])
    setTabSwitches(0)
    setWebcamError('')
    initialStartComplete.current = false
    initialTimeLeft.current = null
    snapshotScheduled.current = false
    snapshotTimersRef.current.forEach(clearTimeout)
    snapshotTimersRef.current = []
    violationQueue.current = []
    snapshotQueue.current = []
    isProcessingViolation.current = false
    isProcessingSnapshot.current = false
    isGettingStream.current = false
    cooldownRef.current = {
      multiPerson: 0,
      cellPhone: 0,
      noPerson: 0,
      gazeAway: 0,
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      console.log(
        'Existing stream stopped in AssessmentChatbot.startAssessment (pre-acquisition).'
      )
    }

    if (!isGettingStream.current) {
      isGettingStream.current = true
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        })
        streamRef.current = stream
        if (webcamRef.current && webcamRef.current.video) {
          webcamRef.current.video.srcObject = stream
          webcamRef.current.video.onplaying = () => {
            console.log('Webcam stream is playing in AssessmentChatbot!')
            setWebcamError('')
          }
          setTimeout(() => {
            if (
              webcamRef.current &&
              webcamRef.current.video &&
              webcamRef.current.video.readyState !== 4
            ) {
              setWebcamError(
                'Webcam feed could not be started. Please ensure it is not in use by another application or check permissions.'
              )
              console.log('Webcam feed issues detected.')
            }
          }, 3000)
        } else {
          throw new Error(
            'Webcam ref or video element not available to set stream.'
          )
        }
        setWebcamError('')
      } catch (error) {
        if (
          error.name === 'NotAllowedError' ||
          error.name === 'PermissionDeniedError'
        ) {
          setWebcamError(
            'Webcam access denied. Please allow webcam access in your browser settings to continue the assessment.'
          )
          toast.error('Webcam access denied.')
        } else if (
          error.name === 'NotFoundError' ||
          error.name === 'DevicesNotFoundError'
        ) {
          setWebcamError(
            'No webcam found. Please ensure a webcam is connected and enabled.'
          )
          toast.error('No webcam found.')
        } else {
          setWebcamError(
            `Failed to start webcam in assessment: ${error.message}. Please retry or return to dashboard.`
          )
          toast.error(`Webcam error: ${error.message}`)
        }
        setErrorMessage(
          `Failed to start the assessment due to webcam issues: ${error.message}`
        )
        setIsLoading(false)
        isGettingStream.current = false
        return
      } finally {
        isGettingStream.current = false
      }
    }

    try {
      const response = await fetch(`${baseUrl}/assessment/start/${attemptId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!response.ok)
        throw new Error(
          (await response.json()).error || `HTTP error ${response.status}`
        )
      const data = await response.json()
      if (!data.test_duration) throw new Error('test_duration not provided')
      setTotalQuestions(data.total_questions || 0)
      setTimeLeft(data.test_duration)
      initialTimeLeft.current = data.test_duration
      initialStartComplete.current = true
      scheduleSnapshots()
    } catch (error) {
      setErrorMessage(
        `Failed to start the assessment: ${error.message}. Please retry or return to dashboard.`
      )
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [
    attemptId,
    modelLoading,
    errorMessage,
    isLoading,
    isAssessmentComplete,
    scheduleSnapshots,
  ])

  // Handle Tab Switches
  const handleVisibilityChange = useCallback(() => {
    if (
      document.hidden &&
      !isAssessmentComplete &&
      initialStartComplete.current
    ) {
      setTabSwitches((prev) => {
        const newCount = prev + 1
        if (newCount >= MAX_TAB_SWITCHES) {
          endAssessment(
            attemptId,
            true,
            'Terminated due to repeated tab switches',
            setIsAssessmentComplete,
            setIsLoading,
            setErrorMessage,
            {
              tabSwitches: newCount,
            },
            () => navigate(`/candidate/assessment/${attemptId}/results`)
          )
        } else {
          toast.error(`Tab switch detected (${newCount}/${MAX_TAB_SWITCHES})`)
        }
        return newCount
      })
    }
  }, [isAssessmentComplete, initialStartComplete, attemptId, navigate])

  useEffect(() => {
    if (isAssessmentComplete)
      navigate(`/candidate/assessment/${attemptId}/results`)
  }, [isAssessmentComplete, attemptId, navigate])

  // Initialize Assessment
  useEffect(() => {
    if (
      attemptId &&
      !modelLoading &&
      cocoSsdModel &&
      faceLandmarkerModel &&
      !errorMessage
    ) {
      startAssessment()
    } else if (attemptId && modelLoading) {
      setErrorMessage(
        'Please wait while the assessment is getting ready. This may take a few seconds.'
      )
    }
  }, [
    attemptId,
    modelLoading,
    cocoSsdModel,
    faceLandmarkerModel,
    errorMessage,
    startAssessment,
  ])

  // Fetch Next Question
  useEffect(() => {
    if (
      initialStartComplete.current &&
      !questionPending &&
      !currentQuestion &&
      !isAssessmentComplete &&
      !awaitingNextQuestion
    ) {
      fetchNextQuestion(
        attemptId,
        setCurrentQuestion,
        setSkill,
        setQuestionNumber,
        setMessages,
        setIsAssessmentComplete,
        setIsLoading,
        setQuestionPending,
        setErrorMessage,
        setQuestionStartTime,
        setUsedMcqIds,
        usedMcqIds,
        questionNumber,
        setIsGeneratingQuestion,
        {
          tabSwitches: tabSwitchesRef.current,
          forced: false,
          remark: 'None',
        }
      )
    }
  }, [
    attemptId,
    initialStartComplete.current,
    questionPending,
    currentQuestion,
    isAssessmentComplete,
    awaitingNextQuestion,
    usedMcqIds,
    questionNumber,
  ])

  // Handle Awaiting Next Question
  useEffect(() => {
    if (
      awaitingNextQuestion &&
      !questionPending &&
      !isLoading &&
      !isAssessmentComplete
    ) {
      setTimeout(() => {
        fetchNextQuestion(
          attemptId,
          setCurrentQuestion,
          setSkill,
          setQuestionNumber,
          setMessages,
          setIsAssessmentComplete,
          setIsLoading,
          setQuestionPending,
          setErrorMessage,
          setQuestionStartTime,
          setUsedMcqIds,
          usedMcqIds,
          questionNumber,
          setIsGeneratingQuestion,
          {
            tabSwitches: tabSwitchesRef.current,
            forced: false,
            remark: 'None',
          }
        )
        setAwaitingNextQuestion(false)
      }, 1500)
    }
  }, [
    awaitingNextQuestion,
    questionPending,
    isLoading,
    isAssessmentComplete,
    attemptId,
    questionNumber,
    usedMcqIds,
  ])

  // Timer
  useEffect(() => {
    if (timeLeft !== null) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 0) {
            clearInterval(timer)
            endAssessment(
              attemptId,
              false,
              '',
              setIsAssessmentComplete,
              setIsLoading,
              setErrorMessage,
              {
                tabSwitches: tabSwitchesRef.current,
              },
              () => navigate(`/candidate/assessment/${attemptId}/results`)
            )
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [timeLeft, attemptId, navigate])

  // Auto-scroll Chat
  useEffect(() => {
    if (chatContainerRef.current)
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
  }, [messages])

  // Event Listeners
  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const preventCopyPaste = (e) => {
      e.preventDefault()
      toast.error('Copy/paste is not allowed during the assessment')
    }
    document.addEventListener('copy', preventCopyPaste)
    document.addEventListener('paste', preventCopyPaste)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('copy', preventCopyPaste)
      document.removeEventListener('paste', preventCopyPaste)
    }
  }, [handleVisibilityChange])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 flex flex-col font-sans">
      <div className="flex-grow py-12 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Left Sidebar */}
          <div className="w-full md:w-[25%] bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Assessment
              </h2>
            </div>
            <div className="space-y-6 flex-1">
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <Clock className="w-5 h-5 text-indigo-500" />
                <span>Time Left: {formatTime(timeLeft)}</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <Star className="w-5 h-5 text-indigo-500" />
                <span>
                  Question {questionNumber} of {totalQuestions}
                </span>
              </div>
              <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                <Camera className="w-5 h-5 text-indigo-500" />
                <span>
                  Tab Switches: {tabSwitches}/{MAX_TAB_SWITCHES}
                </span>
              </div>
              <div className="mt-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Proctoring
                  </h3>
                </div>
                <div className="relative w-full aspect-video bg-gray-100/80 dark:bg-gray-700/80 rounded-2xl overflow-hidden border border-gray-200/50 dark:border-gray-700/50 shadow-inner">
                  <Webcam
                    key={webcamKey}
                    ref={webcamRef}
                    width={VIDEO_WIDTH}
                    height={VIDEO_HEIGHT}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    videoConstraints={videoConstraints}
                    className="absolute top-0 left-0 w-full h-full object-cover"
                  />
                  <canvas
                    ref={canvasRef}
                    width={VIDEO_WIDTH}
                    height={VIDEO_HEIGHT}
                    className="absolute top-0 left-0 w-full h-full"
                    style={{ pointerEvents: 'none' }}
                  />
                </div>
                {webcamError && (
                  <div className="bg-red-50/80 dark:bg-red-900/20 border border-red-200/50 dark:border-red-700/50 text-red-700 dark:text-red-300 p-4 rounded-xl flex items-center gap-3 mt-4">
                    <XCircle className="w-5 h-5" />
                    <span>{webcamError}</span>
                  </div>
                )}
                {capturedImg && (
                  <div className="mt-6">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      Latest Violation Snapshot:
                    </div>
                    <img
                      src={capturedImg}
                      alt="Captured Violation"
                      className="w-full h-auto rounded-lg border border-gray-200/50 dark:border-gray-700/50 shadow-sm"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="mt-auto space-y-4">
              <Button
                onClick={() =>
                  endAssessment(
                    attemptId,
                    false,
                    '',
                    setIsAssessmentComplete,
                    setIsLoading,
                    setErrorMessage,
                    {
                      tabSwitches: tabSwitchesRef.current,
                    },
                    () => navigate(`/candidate/assessment/${attemptId}/results`)
                  )
                }
                className="w-full bg-gradient-to-r from-red-600 to-pink-600 text-white px-6 py-3 rounded-xl hover:from-red-700 hover:to-pink-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center justify-center gap-2"
                disabled={isAssessmentComplete || isLoading}
              >
                <StopCircle className="w-5 h-5" />
                End Assessment
              </Button>
            </div>
          </div>

          {/* Chat Area */}
          <div className="w-full md:w-[75%] bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8 flex items-center gap-3">
              <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              Chat Interface
            </h2>
            {errorMessage && (
              <div className="bg-red-50/80 dark:bg-red-900/20 border border-red-200/50 dark:border-red-700/50 text-red-700 dark:text-red-300 p-6 mb-8 rounded-2xl flex items-center gap-3 shadow-inner">
                <XCircle className="w-6 h-6" />
                <span className="text-base">{errorMessage}</span>
                <div className="ml-auto flex gap-4">
                  <Button
                    onClick={startAssessment}
                    disabled={isLoading || modelLoading}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 flex items-center gap-2"
                  >
                    <RefreshCw className="w-5 h-5" />
                    Retry
                  </Button>
                  <Button
                    onClick={() => navigate('/candidate/dashboard')}
                    className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-4 py-2 rounded-xl hover:from-gray-600 hover:to-gray-700 transition-all duration-300 flex items-center gap-2"
                  >
                    <Home className="w-5 h-5" />
                    Dashboard
                  </Button>
                </div>
              </div>
            )}
            {(isLoading || isGeneratingQuestion || modelLoading) && (
              <div className="bg-gray-50/80 dark:bg-gray-700/50 border border-gray-200/50 dark:border-gray-600/50 p-6 mb-8 rounded-2xl flex items-center gap-3 justify-center shadow-inner">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                <span className="text-base text-gray-700 dark:text-gray-200">
                  {modelLoading
                    ? 'Assessment is being set up, Please wait...'
                    : isGeneratingQuestion
                    ? 'Generating your next question...'
                    : 'Loading assessment...'}
                </span>
              </div>
            )}
            <AssessmentMessages
              messages={messages}
              isLoading={isLoading}
              currentQuestion={currentQuestion}
              userAnswer={userAnswer}
              handleOptionSelect={(value) => {
                setUserAnswer(value)
                currentMcqId.current = currentQuestion?.mcq_id
              }}
              handleAnswerSubmit={(e) =>
                handleAnswerSubmit(
                  e,
                  attemptId,
                  skill,
                  userAnswer,
                  currentQuestion,
                  setMessages,
                  setCurrentQuestion,
                  currentMcqId,
                  setUserAnswer,
                  setAwaitingNextQuestion,
                  setIsLoading,
                  setErrorMessage,
                  questionStartTime
                )
              }
              endAssessment={() =>
                endAssessment(
                  attemptId,
                  false,
                  '',
                  setIsAssessmentComplete,
                  setIsLoading,
                  setErrorMessage,
                  {
                    tabSwitches: tabSwitchesRef.current,
                  },
                  () => navigate(`/candidate/assessment/${attemptId}/results`)
                )
              }
              chatContainerRef={chatContainerRef}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default AssessmentChatbot
