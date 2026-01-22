'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface ImportStats {
  totalRows: number
  campaigns: number
  adGroups: number
  keywords: number
  ads: number
  processedRows: number
}

interface ImportRecord {
  _id: string
  accountId: string
  accountName: string
  fileName: string
  fileHash: string
  importedAt: number
  status: 'processing' | 'completed' | 'failed'
  error?: string
  stats: ImportStats
  progress?: number
}

interface QualityScoreDistribution {
  score1to3: number
  score4to6: number
  score7to10: number
  noScore: number
}

export default function ImportPage() {
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [imports, setImports] = useState<ImportRecord[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Large file mode - uses file path instead of upload
  const [largeFileMode, setLargeFileMode] = useState(false)
  const [filePath, setFilePath] = useState('')

  // Fetch import history
  const fetchImports = useCallback(async () => {
    try {
      const response = await fetch('/api/gads/editor-import?limit=20')

      // Check if response is ok and is JSON
      if (!response.ok) {
        console.error('Failed to fetch imports:', response.status, response.statusText)
        return
      }

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Invalid response type:', contentType)
        return
      }

      const result = await response.json()

      if (result.success) {
        setImports(result.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch imports:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchImports()
  }, [fetchImports])

  // Max file size (must match API route)
  const MAX_FILE_SIZE_MB = 500
  const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024

  // Handle file selection
  const handleFileSelect = (file: File | null) => {
    if (!file) return

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      setError('Please select a CSV file')
      return
    }

    const sizeMB = file.size / 1024 / 1024

    // Check file size limit
    if (file.size > MAX_FILE_SIZE) {
      setError(
        `File too large (${sizeMB.toFixed(1)}MB). Maximum size is ${MAX_FILE_SIZE_MB}MB. ` +
        `For larger files, please export specific campaigns from Google Ads Editor instead of the entire account.`
      )
      return
    }

    // Warn about large files
    if (sizeMB > 50) {
      console.log(`Large file selected: ${sizeMB.toFixed(2)} MB - upload may take a while`)
    }

    setSelectedFile(file)
    setError(null)
    setSuccess(null)
  }

  // Handle drag and drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  // Upload file
  const handleUpload = async () => {
    if (!selectedFile) return

    setUploading(true)
    setUploadProgress(0)
    setError(null)
    setSuccess(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      // Simulate progress (since we can't track actual upload progress easily)
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) return prev
          return prev + Math.random() * 10
        })
      }, 500)

      const response = await fetch('/api/gads/editor-import', {
        method: 'POST',
        body: formData,
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      // Check if response is ok before parsing JSON
      if (!response.ok) {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const errorResult = await response.json()
          throw new Error(errorResult.error || `HTTP ${response.status}: ${response.statusText}`)
        } else {
          // Non-JSON error (e.g., "Request Entity Too Large" from server)
          const text = await response.text()
          throw new Error(text || `HTTP ${response.status}: ${response.statusText}`)
        }
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Import failed')
      }

      if (result.data.alreadyExists) {
        setSuccess(`File already imported. Using existing data for ${result.data.accountName}.`)
      } else {
        setSuccess(
          `Successfully imported data for ${result.data.accountName}: ` +
          `${result.data.stats.campaigns} campaigns, ` +
          `${result.data.stats.adGroups} ad groups, ` +
          `${result.data.stats.keywords} keywords, ` +
          `${result.data.stats.ads} ads`
        )
      }

      setSelectedFile(null)
      fetchImports()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  // Handle large file import via file path (stream processing)
  const handleLargeFileImport = async () => {
    if (!filePath.trim()) {
      setError('Please enter a file path')
      return
    }

    setUploading(true)
    setUploadProgress(0)
    setError(null)
    setSuccess(null)

    try {
      // Start progress animation
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 95) return prev
          return prev + Math.random() * 5
        })
      }, 1000)

      const response = await fetch('/api/gads/editor-import/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: filePath.trim() }),
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      // Check if response is ok
      if (!response.ok) {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const errorResult = await response.json()
          throw new Error(errorResult.error || `HTTP ${response.status}: ${response.statusText}`)
        } else {
          const text = await response.text()
          throw new Error(text || `HTTP ${response.status}: ${response.statusText}`)
        }
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Import failed')
      }

      if (result.data.alreadyExists) {
        setSuccess(`File already imported. Using existing data for ${result.data.accountName}.`)
      } else {
        const stats = result.data.stats
        setSuccess(
          `Successfully imported ${result.data.accountName}: ` +
          `${formatNumber(stats.campaigns)} campaigns, ` +
          `${formatNumber(stats.adGroups)} ad groups, ` +
          `${formatNumber(stats.keywords)} keywords, ` +
          `${formatNumber(stats.ads)} ads ` +
          `(${formatNumber(stats.totalRows)} total rows processed)`
        )
      }

      setFilePath('')
      fetchImports()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  // Delete import
  const handleDelete = async (importId: string) => {
    if (!confirm('Are you sure you want to delete this import? This will remove all associated data.')) {
      return
    }

    try {
      const response = await fetch(`/api/gads/editor-import?importId=${importId}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Delete failed')
      }

      setSuccess('Import deleted successfully')
      fetchImports()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  }

  // Format number with commas
  const formatNumber = (num: number) => {
    return num.toLocaleString('en-IN')
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">
          Import Google Ads Data
        </h1>
        <p className="text-[var(--text-secondary)] mt-1">
          Upload Google Ads Editor exports to analyze your account structure
        </p>
      </div>

      {/* Success/Error Banners */}
      {error && (
        <div className="rounded-xl border border-[var(--accent-rose)]/20 bg-[var(--accent-rose)]/5 p-4 mb-6 flex items-start gap-3">
          <svg className="w-5 h-5 text-[var(--accent-rose)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--accent-rose)]">Error</p>
            <p className="text-sm text-[var(--text-secondary)]">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-[var(--accent-rose)] hover:opacity-70">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-[var(--accent-lime)]/20 bg-[var(--accent-lime)]/5 p-4 mb-6 flex items-start gap-3">
          <svg className="w-5 h-5 text-[var(--accent-lime)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--accent-lime)]">Success</p>
            <p className="text-sm text-[var(--text-secondary)]">{success}</p>
          </div>
          <button onClick={() => setSuccess(null)} className="text-[var(--accent-lime)] hover:opacity-70">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Upload Section */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 mb-8">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
          Upload Google Ads Editor Export
        </h2>

        {/* Mode Toggle */}
        <div className="mb-6 flex items-center gap-4">
          <button
            onClick={() => setLargeFileMode(false)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              !largeFileMode
                ? 'bg-[var(--accent-electric)] text-white'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            File Upload (up to {MAX_FILE_SIZE_MB}MB)
          </button>
          <button
            onClick={() => setLargeFileMode(true)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              largeFileMode
                ? 'bg-[var(--accent-electric)] text-white'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            Large File Mode (6GB+)
          </button>
        </div>

        {/* Instructions */}
        <div className="mb-6 p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">How to export from Google Ads Editor:</h3>
          <ol className="text-sm text-[var(--text-secondary)] space-y-1 list-decimal list-inside">
            <li>Open Google Ads Editor and download your account</li>
            <li>Select the account in the left panel</li>
            <li>Go to File → Export → Export spreadsheet (CSV)</li>
            <li>Choose "Export selected campaigns and their children"</li>
            <li>{largeFileMode ? 'Copy the full file path and paste it below' : 'Save the file and upload it here'}</li>
          </ol>
          {largeFileMode && (
            <p className="mt-3 text-xs text-[var(--accent-electric)]">
              💡 Large File Mode reads directly from your filesystem - perfect for 6GB+ files.
              It streams the file line-by-line without loading it all into memory.
            </p>
          )}
        </div>

        {/* Large File Mode - File Path Input */}
        {largeFileMode ? (
          <div className="border-2 border-dashed rounded-xl p-8 border-[var(--border-subtle)]">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto text-[var(--accent-electric)] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium text-[var(--text-primary)] mb-1">
                Enter the full file path
              </p>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                Supports files of any size - streams directly from disk
              </p>

              <div className="max-w-2xl mx-auto">
                <input
                  type="text"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder="/Users/yourname/Downloads/google-ads-export.csv"
                  className="w-full px-4 py-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-electric)] text-sm font-mono"
                  disabled={uploading}
                />

                <div className="flex items-center justify-center gap-3 mt-4">
                  <button
                    onClick={handleLargeFileImport}
                    disabled={uploading || !filePath.trim()}
                    className="px-6 py-2.5 rounded-lg bg-[var(--accent-electric)] text-white font-medium text-sm hover:bg-[var(--accent-electric)]/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {uploading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Processing... {Math.round(uploadProgress)}%
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Start Stream Import
                      </>
                    )}
                  </button>
                  {filePath && (
                    <button
                      onClick={() => setFilePath('')}
                      disabled={uploading}
                      className="px-4 py-2.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] font-medium text-sm hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            {uploading && (
              <div className="mt-6">
                <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent-electric)] transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-2 text-center">
                  Streaming and processing file... This may take several minutes for large files.
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Drag and Drop Zone - Regular Upload Mode */
          <div
            className={`relative border-2 border-dashed rounded-xl p-8 transition-all ${
              dragActive
                ? 'border-[var(--accent-electric)] bg-[var(--accent-electric)]/5'
                : 'border-[var(--border-subtle)] hover:border-[var(--text-muted)]'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              className="hidden"
            />

            <div className="text-center">
              {selectedFile ? (
                <>
                  <svg className="w-12 h-12 mx-auto text-[var(--accent-lime)] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-lg font-medium text-[var(--text-primary)] mb-1">
                    {selectedFile.name}
                  </p>
                  <p className="text-sm text-[var(--text-muted)] mb-4">
                    {formatFileSize(selectedFile.size)}
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={handleUpload}
                      disabled={uploading}
                      className="px-6 py-2.5 rounded-lg bg-[var(--accent-electric)] text-white font-medium text-sm hover:bg-[var(--accent-electric)]/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {uploading ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Uploading... {Math.round(uploadProgress)}%
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          Start Import
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setSelectedFile(null)}
                      disabled={uploading}
                      className="px-4 py-2.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] font-medium text-sm hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <svg className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-lg font-medium text-[var(--text-primary)] mb-1">
                    Drop your CSV file here
                  </p>
                  <p className="text-sm text-[var(--text-muted)] mb-4">
                    or click to browse
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-2.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] font-medium text-sm hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    Select File
                  </button>
                </>
              )}
            </div>

            {/* Upload Progress Bar */}
            {uploading && (
              <div className="mt-6">
                <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent-electric)] transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Supported formats */}
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          Supports Google Ads Editor CSV exports (UTF-16 LE encoded). Max file size: {MAX_FILE_SIZE_MB}MB.
          For larger accounts, export specific campaigns instead of the entire account.
        </p>
      </div>

      {/* Import History */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h2 className="font-semibold text-[var(--text-primary)]">Import History</h2>
          <button
            onClick={fetchImports}
            disabled={loading}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] flex items-center gap-1"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-[var(--text-muted)]">
            <svg className="w-8 h-8 mx-auto mb-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading import history...
          </div>
        ) : imports.length > 0 ? (
          <div className="divide-y divide-[var(--border-subtle)]">
            {imports.map((imp) => (
              <div key={imp._id} className="px-6 py-4 hover:bg-[var(--bg-hover)] transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Account name and status */}
                    <div className="flex items-center gap-3 mb-1">
                      <p className="font-medium text-[var(--text-primary)] truncate">
                        {imp.accountName}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        imp.status === 'completed'
                          ? 'bg-[var(--accent-lime)]/15 text-[var(--accent-lime)]'
                          : imp.status === 'processing'
                          ? 'bg-[var(--accent-electric)]/15 text-[var(--accent-electric)]'
                          : 'bg-[var(--accent-rose)]/15 text-[var(--accent-rose)]'
                      }`}>
                        {imp.status === 'completed' ? 'Complete' : imp.status === 'processing' ? 'Processing' : 'Failed'}
                      </span>
                    </div>

                    {/* File name */}
                    <p className="text-sm text-[var(--text-muted)] truncate mb-2">
                      {imp.fileName}
                    </p>

                    {/* Stats */}
                    {imp.stats && (
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-[var(--text-muted)]">
                          <span className="text-[var(--accent-electric)]">{formatNumber(imp.stats.campaigns)}</span> campaigns
                        </span>
                        <span className="text-[var(--text-muted)]">
                          <span className="text-[var(--accent-electric)]">{formatNumber(imp.stats.adGroups)}</span> ad groups
                        </span>
                        <span className="text-[var(--text-muted)]">
                          <span className="text-[var(--accent-electric)]">{formatNumber(imp.stats.keywords)}</span> keywords
                        </span>
                        <span className="text-[var(--text-muted)]">
                          <span className="text-[var(--accent-electric)]">{formatNumber(imp.stats.ads)}</span> ads
                        </span>
                      </div>
                    )}

                    {/* Error message */}
                    {imp.error && (
                      <p className="text-xs text-[var(--accent-rose)] mt-2">
                        {imp.error}
                      </p>
                    )}
                  </div>

                  {/* Right side - date and actions */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm text-[var(--text-secondary)]">
                      {formatDate(imp.importedAt)}
                    </p>
                    <button
                      onClick={() => handleDelete(imp._id)}
                      className="mt-2 text-xs text-[var(--accent-rose)] hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Progress bar for processing imports */}
                {imp.status === 'processing' && imp.progress !== undefined && (
                  <div className="mt-3">
                    <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent-electric)] transition-all duration-300"
                        style={{ width: `${imp.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {imp.progress}% complete
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-12 text-center text-[var(--text-muted)]">
            <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="font-medium mb-1">No imports yet</p>
            <p className="text-sm">Upload a Google Ads Editor export to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}
