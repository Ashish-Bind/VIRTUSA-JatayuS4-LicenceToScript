import { CheckCircle, Star, BookOpen, Send, XCircle } from 'lucide-react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

export const baseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  'https://quizzer-backend-flask-72964026119.asia-southeast1.run.app/api'

export function capitalizeFirstLetter(str) {
  if (typeof str !== 'string' || str.length === 0) {
    return '' // Handle empty or non-string inputs
  }
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export const parseContent = (content) => {
  if (typeof content !== 'string') return [{ type: 'text', value: content }]

  const parts = []
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g
  const inlineCodeRegex = /`([^`]+)`/g

  let lastIndex = 0
  let match

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const [fullMatch, language, code] = match
    const startIndex = match.index

    if (startIndex > lastIndex) {
      parts.push({
        type: 'text',
        value: content.slice(lastIndex, startIndex),
      })
    }

    parts.push({
      type: 'code',
      language: language || 'text',
      value: code.trim(),
    })

    lastIndex = codeBlockRegex.lastIndex
  }

  let remainingText = lastIndex === 0 ? content : content.slice(lastIndex)

  if (remainingText) {
    let inlineLastIndex = 0
    let inlineMatch

    while ((inlineMatch = inlineCodeRegex.exec(remainingText)) !== null) {
      const [fullMatch, code] = inlineMatch
      const startIndex = inlineMatch.index

      if (startIndex > inlineLastIndex) {
        parts.push({
          type: 'text',
          value: remainingText.slice(inlineLastIndex, startIndex),
        })
      }

      parts.push({
        type: 'code',
        language: 'text',
        value: code.trim(),
        inline: true,
      })

      inlineLastIndex = inlineCodeRegex.lastIndex
    }

    if (inlineLastIndex < remainingText.length) {
      parts.push({
        type: 'text',
        value: remainingText.slice(inlineLastIndex),
      })
    }
  }

  return parts
}

export const renderContent = (content) => {
  const parts = parseContent(content)

  return parts.map((part, index) => {
    if (part.type === 'code') {
      return (
        <div
          key={`part-${index}`}
          className={part.inline ? 'inline-block' : 'my-2'}
          style={{ maxWidth: '100%' }}
        >
          <SyntaxHighlighter
            language={part.language}
            style={vscDarkPlus}
            customStyle={
              part.inline
                ? {
                    display: 'inline-block',
                    padding: '0.2em 0.4em',
                    margin: '0',
                    fontSize: '0.9em',
                    background: '#1f2937',
                    borderRadius: '4px',
                  }
                : {
                    padding: '0.5em',
                    margin: '0.5em 0',
                    borderRadius: '4px',
                    overflowX: 'auto',
                    maxWidth: '100%',
                    whiteSpace: 'pre-wrap',
                  }
            }
            codeTagProps={
              part.inline ? { style: { background: 'transparent' } } : undefined
            }
          >
            {part.value}
          </SyntaxHighlighter>
        </div>
      )
    }
    return <span key={`part-${index}`}>{part.value}</span>
  })
}

export const downloadAsPDF = async (elementRef, fileName) => {
  if (!elementRef || !elementRef.current) {
    console.error('Element reference not provided or is null.')
    return
  }

  const input = elementRef.current

  try {
    // Preload all images in the element to ensure they load correctly
    const images = input.getElementsByTagName('img')
    const imagePromises = Array.from(images).map((img) => {
      return new Promise((resolve, reject) => {
        if (img.complete && img.naturalHeight !== 0) {
          resolve(img.src)
        } else {
          img.crossOrigin = 'anonymous' // Set crossOrigin for CORS
          img.onload = () => resolve(img.src)
          img.onerror = () =>
            reject(new Error(`Failed to load image: ${img.src}`))
          // Trigger reload if image is not loaded
          if (!img.complete) {
            img.src = img.src
          }
        }
      })
    })

    // Wait for all images to load
    await Promise.allSettled(imagePromises).then((results) => {
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(
            `Image ${images[index].src} failed to load: ${result.reason}`
          )
        }
      })
    })

    // Capture the visible content of the element
    const canvas = await html2canvas(input, {
      useCORS: true, // Enable CORS for external resources
      scale: 2, // Higher resolution for better quality
      windowWidth: document.documentElement.offsetWidth, // Match viewport width
      windowHeight: document.documentElement.offsetHeight, // Match viewport height
      scrollX: 0, // Reset scroll position
      scrollY: 0, // Reset scroll position
      backgroundColor: '#ffffff', // Ensure white background
      logging: true, // Enable logging for debugging
    })

    const imgData = canvas.toDataURL('image/jpeg', 1.0) // Use JPEG for smaller file size
    const pdf = new jsPDF('p', 'mm', 'a4') // Portrait, millimeters, A4 size

    const imgWidth = 210 // A4 width in mm
    const pageHeight = pdf.internal.pageSize.height // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width // Scale height proportionally
    let heightLeft = imgHeight
    let position = 0

    // Add first page
    pdf.addImage(
      imgData,
      'JPEG',
      0,
      position,
      imgWidth,
      imgHeight,
      undefined,
      'FAST'
    )
    heightLeft -= pageHeight

    // Add additional pages if content exceeds one page
    while (heightLeft > 0) {
      position = heightLeft - imgHeight // Adjust position for next page
      pdf.addPage()
      pdf.addImage(
        imgData,
        'JPEG',
        0,
        position,
        imgWidth,
        imgHeight,
        undefined,
        'FAST'
      )
      heightLeft -= pageHeight
    }

    pdf.save(`${fileName}.pdf`)
  } catch (error) {
    console.error('Error generating PDF:', error)
    // Optionally, show a user-friendly message
  }
}

export const requestFullscreen = async () => {
  const elem = document.documentElement
  console.log('requestFullscreen: Attempting to enter fullscreen')
  try {
    if (elem.requestFullscreen) {
      await elem.requestFullscreen()
    } else if (elem.webkitRequestFullscreen) {
      await elem.webkitRequestFullscreen()
    } else if (elem.mozRequestFullScreen) {
      await elem.mozRequestFullScreen()
    } else if (elem.msRequestFullscreen) {
      await elem.msRequestFullscreen()
    } else {
      throw new Error('Fullscreen API not supported')
    }
    console.log('requestFullscreen: Fullscreen entered successfully')
  } catch (err) {
    console.error('requestFullscreen: Failed', err.message, err)
    throw err
  }
}

export const isMajoritySnapshotsValid = (snapshots) => {
  if (!snapshots || snapshots.length === 0) return false
  const validCount = snapshots.filter((s) => s.is_valid).length
  return validCount > snapshots.length / 2
}

export const exitFullscreen = () => {
  const isFullscreen =
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  if (isFullscreen && document.exitFullscreen) {
    return document.exitFullscreen().catch((err) => {
      console.error('Exit fullscreen failed:', err)
    })
  } else if (isFullscreen && document.webkitExitFullscreen) {
    return document.webkitExitFullscreen().catch((err) => {
      console.error('Exit fullscreen failed (webkit):', err)
    })
  } else if (isFullscreen && document.mozCancelFullScreen) {
    return document.mozCancelFullScreen().catch((err) => {
      console.error('Exit fullscreen failed (moz):', err)
    })
  } else if (isFullscreen && document.msExitFullscreen) {
    return document.msExitFullscreen().catch((err) => {
      console.error('Exit fullscreen failed (ms):', err)
    })
  }
}

export const formatTime = (seconds) => {
  if (seconds === null || isNaN(seconds)) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`
}

export const formatDate = (isoString) => {
  if (!isoString) return 'N/A'
  try {
    const date = new Date(isoString)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return 'Invalid Date'
  }
}

export const calculateTotalScore = (candidateReport) => {
  if (!candidateReport) return 0
  return Object.values(candidateReport).reduce(
    (total, skillData) => total + skillData.correct_answers,
    0
  )
}

export const preventCopyPaste = (e, setProctoringRemarks) => {
  e.preventDefault()
  setProctoringRemarks((prev) => [
    ...prev,
    `Attempted copy/paste at ${new Date().toISOString()}`,
  ])
}

export const captureSnapshot = async (
  attemptId,
  webcamRef,
  setProctoringRemarks,
  setShowSnapshotNotification
) => {
  try {
    if (!webcamRef || !webcamRef.current || !webcamRef.current.video) {
      throw new Error('Webcam reference or video element is not available')
    }

    // Wait for webcam to be ready with a timeout
    const maxAttempts = 5
    let attempts = 0
    let imageSrc = null

    while (attempts < maxAttempts) {
      if (webcamRef.current.video.readyState === 4) {
        imageSrc = webcamRef.current.getScreenshot()
        if (imageSrc) break
      }
      attempts++
      await new Promise((resolve) => setTimeout(resolve, 500)) // Wait 500ms before retry
    }

    if (!imageSrc) {
      throw new Error(
        `Failed to capture screenshot from webcam after ${maxAttempts} attempts`
      )
    }

    const response = await fetch(imageSrc)
    const blob = await response.blob()
    const formData = new FormData()
    formData.append('snapshot', blob, `snapshot.jpg`)

    const response2 = await fetch(
      `${baseUrl}/assessment/capture-snapshot/${attemptId}`,
      {
        method: 'POST',
        body: formData,
        credentials: 'include',
      }
    )

    if (!response2.ok) {
      const data = await response2.json()
      throw new Error(data.error || `HTTP error ${response2.status}`)
    }

    setProctoringRemarks((prev) => [
      ...prev,
      `Snapshot captured at ${new Date().toISOString()}`,
    ])
    setShowSnapshotNotification(true)
  } catch (error) {
    console.error('Capture snapshot error:', error)
    throw new Error(`Failed to capture snapshot: ${error.message}`)
  }
}

export const fetchNextQuestion = (
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
  proctoringData
) => {
  setQuestionPending(true)
  setIsLoading(true)
  if (questionNumber > 0) {
    setIsGeneratingQuestion(true)
  }
  const queryParams =
    usedMcqIds.length > 0 ? `?used_mcq_ids=${JSON.stringify(usedMcqIds)}` : ''
  fetch(`${baseUrl}/assessment/next-question/${attemptId}${queryParams}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      proctoring_data: {
        tab_switches: proctoringData.tabSwitches,
        fullscreen_warnings: proctoringData.fullscreenWarnings,
        remarks: proctoringData.proctoringRemarks,
        forced_termination: proctoringData.forced,
        termination_reason: proctoringData.remark,
      },
    }),
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
      if (data.message === 'Assessment completed') {
        setIsAssessmentComplete(true)
        setMessages((prev) => [
          ...prev,
          {
            type: 'bot',
            content: (
              <div className="flex items-center gap-2 text-lg">
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-300" />
                Assessment completed! Redirecting to results...
              </div>
            ),
          },
        ])
      } else if (data.question) {
        setCurrentQuestion(data.question)
        setSkill(data.skill)
        setQuestionNumber(data.question_number)
        setQuestionStartTime(Date.now())
        setUsedMcqIds((prev) => [...prev, data.question.mcq_id])
        const newMessages = []
        if (questionNumber === 0 || data.question_number === 1) {
          newMessages.push({
            type: 'bot',
            content: (
              <div className="flex items-center gap-2 text-lg">
                <Star className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                {data.greeting}
              </div>
            ),
          })
        }
        newMessages.push({
          type: 'bot',
          content: (
            <div className="text-lg">
              Q{data.question_number}: {renderContent(data.question.question)}
            </div>
          ),
        })
        newMessages.push({
          type: 'bot',
          content: (
            <div className="flex items-center gap-2 text-lg">
              <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
              Skill: {data.skill.replace('_', ' ')}
            </div>
          ),
        })
        newMessages.push({
          type: 'bot',
          content: 'Options:',
          options: data.question.options.map((opt, index) => ({
            value: (index + 1).toString(),
            label: renderContent(opt),
          })),
          mcqId: data.question.mcq_id,
        })
        setMessages((prev) => [...prev, ...newMessages])
        setErrorMessage('')
      } else {
        setErrorMessage('No more questions available.')
      }
    })
    .catch((error) => {
      setErrorMessage(`Failed to fetch the next question: ${error.message}`)
    })
    .finally(() => {
      setIsLoading(false)
      setQuestionPending(false)
      setIsGeneratingQuestion(false)
    })
}

export const handleAnswerSubmit = (
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
) => {
  e.preventDefault()
  if (!userAnswer) {
    setErrorMessage('Please select an answer.')
    return
  }
  setIsLoading(true)
  setMessages((prev) => [
    ...prev,
    {
      type: 'user',
      content: (
        <div className="flex items-center justify-end gap-2 text-lg">
          Selected option {userAnswer}
          <Send className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
        </div>
      ),
    },
  ])
  fetch(`${baseUrl}/assessment/submit-answer/${attemptId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      skill,
      answer: userAnswer,
      time_taken: questionStartTime
        ? (Date.now() - questionStartTime) / 1000
        : 0,
      mcq_id: currentMcqId.current,
    }),
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
      setMessages((prev) => [
        ...prev,
        {
          type: 'bot',
          content: (
            <div className="flex items-center gap-2 text-lg">
              {renderContent(data.feedback)}
            </div>
          ),
        },
      ])
      setCurrentQuestion(null)
      currentMcqId.current = null
      setUserAnswer('')
      setAwaitingNextQuestion(true)
    })
    .catch((error) => {
      setErrorMessage(`Failed to submit your answer: ${error.message}`)
    })
    .finally(() => setIsLoading(false))
}

export const endAssessment = (
  attemptId,
  forced,
  remark,
  setIsAssessmentComplete,
  setIsLoading,
  setErrorMessage,
  proctoringData,
  onSuccess
) => {
  setIsLoading(true)
  fetch(`${baseUrl}/assessment/end/${attemptId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      proctoring_data: {
        tab_switches: proctoringData.tabSwitches,
        fullscreen_warnings: proctoringData.fullscreenWarnings,
        remarks: proctoringData.proctoringRemarks,
        forced_termination: forced,
        termination_reason: remark,
      },
    }),
  })
    .then((response) => {
      if (!response.ok) {
        return response.json().then((data) => {
          throw new Error(data.error || `HTTP error ${response.status}`)
        })
      }
      return response.json()
    })
    .then(() => {
      setIsAssessmentComplete(true)
      if (onSuccess) onSuccess()
    })
    .catch((error) => {
      setErrorMessage(`Failed to end assessment: ${error.message}`)
    })
    .finally(() => {
      setIsLoading(false)
    })
}
