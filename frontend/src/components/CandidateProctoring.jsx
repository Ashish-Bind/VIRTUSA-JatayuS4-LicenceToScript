import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FileText, Loader2, AlertCircle, Camera } from 'lucide-react'
import Navbar from './Navbar' // Assuming components folder is correct
import Button from './Button'
import { baseUrl, downloadAsPDF } from '../utils/utils' // Import downloadAsPDF

const CandidateProctoring = () => {
  const { candidateId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [proctoringData, setProctoringData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Ref for the main content div to be downloaded as PDF
  const mainContentRef = useRef(null)

  useEffect(() => {
    if (!user || user.role !== 'recruiter') {
      navigate('/recruiter/login')
      return
    }

    setIsLoading(true)
    fetch(
      `${baseUrl}/recruiter/analytics/candidate/${candidateId}/proctoring`,
      {
        credentials: 'include',
      }
    )
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch proctoring data')
        return response.json()
      })
      .then((data) => setProctoringData(data))
      .catch((err) =>
        setError('Error fetching proctoring data: ' + err.message)
      )
      .finally(() => setIsLoading(false))
  }, [user, navigate, candidateId])

  // Handle download of the entire visible page as PDF
  const handleDownloadReport = () => {
    if (mainContentRef.current) {
      downloadAsPDF(
        mainContentRef, // Pass the ref directly
        `Proctoring_Report_${proctoringData?.name || candidateId}`
      )
    } else {
      console.error('Main content ref is not available for PDF download.')
      // Optionally, show a user-friendly message
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-100 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600 dark:text-indigo-400 mx-auto mb-4" />
          <p className="text-gray-900 dark:text-gray-100 text-xl font-medium">
            Loading proctoring data...
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-100 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex flex-col">
        <Navbar />
        <div className="flex-grow py-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="p-6 bg-red-50/70 dark:bg-red-900/30 backdrop-blur-lg rounded-2xl shadow-lg border border-red-200/50 dark:border-red-700/50">
              <div className="flex items-center">
                <AlertCircle className="w-8 h-8 text-red-500 dark:text-red-400 mr-4" />
                <p className="text-red-600 dark:text-red-300 text-lg font-medium">
                  {error}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!proctoringData || !proctoringData.proctoring_data.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-100 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex flex-col">
        <Navbar />
        <div className="flex-grow py-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <div className="flex items-center justify-center mb-6">
                <div className="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
                  <FileText className="w-12 h-12 text-white" />
                </div>
              </div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent mb-4">
                Proctoring Data for {proctoringData?.name || 'Candidate'}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg max-w-2xl mx-auto">
                No proctoring data available.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex flex-col">
      <Navbar />
      <div className="flex-grow py-12 px-4 sm:px-6 lg:px-8">
        {/* Main content div that will be captured for PDF */}
        {/* Added ref and inline styles to make it printable-friendly but off-screen */}
        <div
          ref={mainContentRef}
          style={{
            position: 'relative', // Changed from absolute to relative for main content
            // The following styles are for PDF generation, making sure it has a white background and proper text color
            backgroundColor: 'white',
            color: '#1F2937',
            padding: '20mm', // Add some padding for PDF layout
            boxSizing: 'border-box', // Include padding in width/height
            // For on-screen display, you'd typically remove these inline styles
            // and rely on your Tailwind classes.
            // For PDF, we need explicit styles.
          }}
          className="max-w-7xl mx-auto" // Keep Tailwind classes for normal display
        >
          {/* Header for the PDF report */}
          <h1
            style={{
              fontSize: '28px',
              fontWeight: 'bold',
              marginBottom: '20px',
              textAlign: 'center',
            }}
          >
            Proctoring Report for {proctoringData?.name || 'Candidate'}
          </h1>
          <p
            style={{
              fontSize: '14px',
              marginBottom: '10px',
              textAlign: 'center',
            }}
          >
            Generated On: {new Date().toLocaleString()}
          </p>

          {proctoringData.proctoring_data.map((data) => (
            <div
              key={data.attempt_id}
              style={{
                marginBottom: '30px',
                padding: '20px',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                backgroundColor: '#ffffff', // Ensure white background for each section in PDF
              }}
            >
              <h2
                style={{
                  fontSize: '22px',
                  fontWeight: 'bold',
                  marginBottom: '15px',
                }}
              >
                Attempt for {data.job_title}
              </h2>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '15px',
                  marginBottom: '20px',
                }}
              >
                <div
                  style={{
                    padding: '10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: '#f9fafb',
                  }}
                >
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>
                    Tab Switches
                  </p>
                  <p
                    style={{
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: '#1f2937',
                    }}
                  >
                    {data.tab_switches}
                  </p>
                </div>
                <div
                  style={{
                    padding: '10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: '#f9fafb',
                  }}
                >
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>
                    Fullscreen Warnings
                  </p>
                  <p
                    style={{
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: '#1f2937',
                    }}
                  >
                    {data.fullscreen_warnings}
                  </p>
                </div>
                <div
                  style={{
                    padding: '10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: '#f9fafb',
                  }}
                >
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>
                    Forced Termination
                  </p>
                  <p
                    style={{
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: '#1f2937',
                    }}
                  >
                    {data.forced_termination
                      ? `Yes (${data.termination_reason})`
                      : 'No'}
                  </p>
                </div>
              </div>

              {/* Violations Section */}
              <div style={{ marginBottom: '20px' }}>
                <h3
                  style={{
                    fontSize: '18px',
                    fontWeight: 'semibold',
                    marginBottom: '10px',
                    color: '#dc2626',
                  }}
                >
                  Violations
                </h3>
                {data.violations && data.violations.length > 0 ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '10px',
                    }}
                  >
                    {data.violations.map((violation) => (
                      <div
                        key={violation.violation_id}
                        style={{
                          border: '1px solid #ccc',
                          padding: '5px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                        }}
                      >
                        <img
                          src={`https://storage.googleapis.com/gen-ai-quiz/uploads/${violation.snapshot_path}`}
                          alt="Violation Snapshot"
                          style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                            marginBottom: '5px',
                            borderRadius: '4px',
                          }}
                        />
                        <p style={{ fontSize: '10px', color: '#4b5563' }}>
                          {new Date(violation.timestamp).toLocaleString()}
                        </p>
                        <p
                          style={{
                            fontSize: '11px',
                            fontWeight: 'medium',
                            color: '#1f2937',
                          }}
                        >
                          {violation.violation_type}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '14px', color: '#4b5563' }}>
                    No violations recorded.
                  </p>
                )}
              </div>

              {/* Snapshots Section */}
              <div style={{ marginBottom: '20px' }}>
                <h3
                  style={{
                    fontSize: '18px',
                    fontWeight: 'semibold',
                    marginBottom: '10px',
                    color: '#4f46e5',
                  }}
                >
                  Snapshots
                </h3>
                {data.snapshots.length > 0 ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '10px',
                    }}
                  >
                    {data.snapshots.map((snapshot, index) => (
                      <div
                        key={index}
                        style={{
                          border: '1px solid #ccc',
                          padding: '5px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                        }}
                      >
                        <img
                          src={`https://storage.googleapis.com/gen-ai-quiz/uploads/${snapshot.path}`}
                          alt={`Snapshot ${index + 1}`}
                          style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                            marginBottom: '5px',
                            borderRadius: '4px',
                          }}
                        />
                        <p style={{ fontSize: '10px', color: '#4b5563' }}>
                          {new Date(snapshot.timestamp).toLocaleString()}
                        </p>
                        <p
                          style={{
                            fontSize: '11px',
                            fontWeight: 'medium',
                            color: snapshot.is_valid ? '#10b981' : '#dc2626',
                          }}
                        >
                          {snapshot.is_valid ? 'Valid' : 'Invalid'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '14px', color: '#4b5563' }}>
                    No snapshots available.
                  </p>
                )}
              </div>

              {/* Remarks Section */}
              <div>
                <h3
                  style={{
                    fontSize: '18px',
                    fontWeight: 'semibold',
                    marginBottom: '10px',
                    color: '#f59e0b',
                  }}
                >
                  Remarks
                </h3>
                {data.remarks.length > 0 ? (
                  <ul
                    style={{
                      listStyleType: 'disc',
                      marginLeft: '20px',
                      fontSize: '14px',
                      color: '#4b5563',
                    }}
                  >
                    {data.remarks.map((remark, index) => (
                      <li key={index} style={{ marginBottom: '5px' }}>
                        {remark}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ fontSize: '14px', color: '#4b5563' }}>
                    No remarks available.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="max-w-7xl mx-auto mt-8">
          <Button
            variant="primary"
            onClick={handleDownloadReport} // Call handleDownloadReport
            className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            <FileText className="w-5 h-5 mr-2" />
            Download Proctoring Report
          </Button>
        </div>

        {/* The actual visible content on the page */}
        <div className="max-w-7xl mx-auto mt-8 hidden">
          {/* Your existing visible content from the original Analytics.jsx */}
          {/* This part remains unchanged for display purposes */}
          {proctoringData.proctoring_data.map((data) => (
            <div
              key={`display-${data.attempt_id}`} // Use a different key for display div
              className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-8 hover:shadow-2xl transition-all duration-300"
            >
              <div className="flex items-center mb-6">
                <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                  <FileText className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Attempt for {data.job_title}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    Proctoring details for this assessment attempt
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-800 dark:to-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Tab Switches
                  </p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {data.tab_switches}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-800 dark:to-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Fullscreen Warnings
                  </p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {data.fullscreen_warnings}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-800 dark:to-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Forced Termination
                  </p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {data.forced_termination
                      ? `Yes (${data.termination_reason})`
                      : 'No'}
                  </p>
                </div>
              </div>

              {/* Violations Section */}
              <div className="mb-6">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-gradient-to-r from-red-500 to-pink-600 rounded-xl mr-3">
                    <AlertCircle className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
                    Violations
                  </h3>
                </div>
                {data.violations && data.violations.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                    {data.violations.map((violation) => (
                      <div key={violation.violation_id} className="relative">
                        <img
                          src={`https://storage.googleapis.com/gen-ai-quiz/uploads/${violation.snapshot_path}`}
                          alt="Violation Snapshot"
                          className="w-full h-full object-cover rounded-lg"
                        />
                        <span className="absolute top-2 left-2 text-sm text-white bg-black bg-opacity-50 px-2 py-1 rounded">
                          {new Date(violation.timestamp).toLocaleString()}
                        </span>
                        <span className="absolute top-2 right-2 text-sm text-white bg-indigo-600 dark:bg-indigo-800 px-2 py-1 rounded">
                          {violation.violation_type}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    No violations recorded.
                  </p>
                )}
              </div>

              {/* Snapshots Section */}
              <div className="mb-6">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-3">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Snapshots
                  </h3>
                </div>
                {data.snapshots.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                    {data.snapshots.map((snapshot, index) => (
                      <div key={index} className="relative">
                        <img
                          src={`https://storage.googleapis.com/gen-ai-quiz/uploads/${snapshot.path}`}
                          alt={`Snapshot ${index + 1}`}
                          className="w-full h-full object-cover rounded-lg"
                        />
                        <span className="absolute top-2 left-2 text-sm text-white bg-black bg-opacity-50 px-2 py-1 rounded">
                          {new Date(snapshot.timestamp).toLocaleString()}
                        </span>
                        <span
                          className={`absolute top-2 right-2 text-sm text-white px-2 py-1 rounded ${
                            snapshot.is_valid
                              ? 'bg-emerald-600 dark:bg-emerald-800'
                              : 'bg-red-600 dark:bg-red-800'
                          }`}
                        >
                          {snapshot.is_valid ? 'Valid' : 'Invalid'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    No snapshots available.
                  </p>
                )}
              </div>

              {/* Remarks Section */}
              <div>
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl mr-3">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Remarks
                  </h3>
                </div>
                {data.remarks.length > 0 ? (
                  <ul className="list-disc pl-5 text-sm text-gray-600 dark:text-gray-300">
                    {data.remarks.map((remark, index) => (
                      <li key={index} className="mb-2">
                        {remark}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    No remarks available.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default CandidateProctoring
