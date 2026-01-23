'use client'

import { useEffect, useState } from 'react'
import { QueueProgress, formatTimeRemaining } from '@/lib/api-queue'

interface QueueProgressDisplayProps {
  progress: QueueProgress
  onPause: () => void
  onResume: () => void
  onCancel: () => void
}

export function QueueProgressDisplay({
  progress,
  onPause,
  onResume,
  onCancel
}: QueueProgressDisplayProps) {
  const [countdown, setCountdown] = useState<string>('')

  // Update countdown timer for paused state
  useEffect(() => {
    if (progress.isPaused && progress.resumeAt) {
      const updateCountdown = () => {
        const remaining = progress.resumeAt! - Date.now()
        if (remaining > 0) {
          setCountdown(formatTimeRemaining(remaining))
        } else {
          setCountdown('Resuming...')
        }
      }

      updateCountdown()
      const interval = setInterval(updateCountdown, 1000)
      return () => clearInterval(interval)
    }
  }, [progress.isPaused, progress.resumeAt])

  // Calculate percentage
  const percentage = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0

  // Phase display text
  const getPhaseText = () => {
    switch (progress.phase) {
      case 'idle':
        return 'Ready to start'
      case 'processing':
        return `Processing ${progress.current?.courseName || 'course'}...`
      case 'paused':
        if (progress.pauseReason === 'quota_exhausted') {
          return `Quota exhausted - resuming in ${countdown}`
        }
        return 'Paused'
      case 'completed':
        return 'All courses processed!'
      case 'error':
        return 'Processing stopped due to errors'
      default:
        return 'Processing...'
    }
  }

  // Phase color
  const getPhaseColor = () => {
    switch (progress.phase) {
      case 'processing':
        return 'text-[var(--accent-electric)]'
      case 'paused':
        return progress.pauseReason === 'quota_exhausted'
          ? 'text-[var(--accent-amber)]'
          : 'text-[var(--text-secondary)]'
      case 'completed':
        return 'text-[var(--accent-lime)]'
      case 'error':
        return 'text-[var(--status-error)]'
      default:
        return 'text-[var(--text-secondary)]'
    }
  }

  if (progress.phase === 'idle' || progress.phase === 'completed') {
    return null
  }

  return (
    <div className="p-4 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div className={`w-2 h-2 rounded-full ${
            progress.phase === 'processing'
              ? 'bg-[var(--accent-electric)] animate-pulse'
              : progress.isPaused
              ? 'bg-[var(--accent-amber)]'
              : progress.phase === 'error'
              ? 'bg-[var(--status-error)]'
              : 'bg-[var(--accent-lime)]'
          }`} />

          <div>
            <div className={`text-sm font-medium ${getPhaseColor()}`}>
              {getPhaseText()}
            </div>
            {progress.current && progress.phase === 'processing' && (
              <div className="text-xs text-[var(--text-muted)]">
                {progress.current.step}
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {progress.phase === 'processing' && (
            <button
              onClick={onPause}
              className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
              title="Pause processing"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}

          {progress.isPaused && (
            <button
              onClick={onResume}
              className="p-2 text-[var(--accent-electric)] hover:bg-[var(--accent-electric)]/10 rounded-lg transition-colors"
              title="Resume processing"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}

          <button
            onClick={onCancel}
            className="p-2 text-[var(--text-secondary)] hover:text-[var(--status-error)] hover:bg-[var(--status-error)]/10 rounded-lg transition-colors"
            title="Cancel processing"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              progress.isPaused
                ? 'bg-[var(--accent-amber)]'
                : 'bg-[var(--accent-electric)]'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-4">
          <span>
            {progress.completed}/{progress.total} completed
          </span>
          {progress.failed > 0 && (
            <span className="text-[var(--status-error)]">
              {progress.failed} failed
            </span>
          )}
        </div>

        {progress.estimatedTimeRemaining > 0 && progress.phase === 'processing' && (
          <span>
            ~{formatTimeRemaining(progress.estimatedTimeRemaining)} remaining
          </span>
        )}
      </div>

      {/* Quota exhaustion warning */}
      {progress.isPaused && progress.pauseReason === 'quota_exhausted' && (
        <div className="mt-3 p-3 rounded-lg bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/20">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-[var(--accent-amber)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-xs">
              <div className="font-medium text-[var(--accent-amber)]">
                API Quota Exhausted
              </div>
              <div className="text-[var(--text-secondary)] mt-0.5">
                Processing will automatically resume when the quota resets.
                Your progress has been saved.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
