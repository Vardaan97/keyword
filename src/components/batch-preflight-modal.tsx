'use client'

import { useState } from 'react'
import { BatchPreflightInfo } from '@/types'
import { formatTimeRemaining } from '@/lib/api-queue'

interface BatchPreflightModalProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  preflightInfo: BatchPreflightInfo
}

export function BatchPreflightModal({
  isOpen,
  onConfirm,
  onCancel,
  preflightInfo
}: BatchPreflightModalProps) {
  const [acknowledged, setAcknowledged] = useState(false)

  if (!isOpen) return null

  const hasWarnings = preflightInfo.warnings.length > 0
  const hasBlockers = preflightInfo.blockers.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--accent-electric)]/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-[var(--accent-electric)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Batch Processing Summary
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Review before starting
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
              <div className="text-2xl font-bold text-[var(--text-primary)]">
                {preflightInfo.totalCourses}
              </div>
              <div className="text-sm text-[var(--text-secondary)]">Total Courses</div>
            </div>
            <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
              <div className="text-2xl font-bold text-[var(--accent-lime)]">
                {preflightInfo.cachedCourses}
              </div>
              <div className="text-sm text-[var(--text-secondary)]">Already Cached</div>
            </div>
            <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
              <div className="text-2xl font-bold text-[var(--accent-amber)]">
                {preflightInfo.coursesNeedingApi}
              </div>
              <div className="text-sm text-[var(--text-secondary)]">Need API Calls</div>
            </div>
            <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
              <div className="text-2xl font-bold text-[var(--text-primary)]">
                ~{preflightInfo.estimatedTimeFormatted}
              </div>
              <div className="text-sm text-[var(--text-secondary)]">Est. Time</div>
            </div>
          </div>

          {/* API Calls Info */}
          <div className="p-4 rounded-lg bg-[var(--accent-electric)]/5 border border-[var(--accent-electric)]/20">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[var(--accent-electric)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <div>
                <div className="text-sm font-medium text-[var(--text-primary)]">
                  Sequential Processing Enabled
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-1">
                  API calls will be processed one at a time with adaptive rate limiting to prevent quota exhaustion.
                  {preflightInfo.estimatedApiCalls > 0 && (
                    <span className="block mt-1">
                      Estimated {preflightInfo.estimatedApiCalls} API calls needed.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {hasWarnings && (
            <div className="p-4 rounded-lg bg-[var(--accent-amber)]/5 border border-[var(--accent-amber)]/20">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[var(--accent-amber)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <div className="text-sm font-medium text-[var(--accent-amber)]">Warnings</div>
                  <ul className="text-xs text-[var(--text-secondary)] mt-1 space-y-1">
                    {preflightInfo.warnings.map((warning, idx) => (
                      <li key={idx}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Blockers */}
          {hasBlockers && (
            <div className="p-4 rounded-lg bg-[var(--status-error)]/5 border border-[var(--status-error)]/20">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[var(--status-error)] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <div className="text-sm font-medium text-[var(--status-error)]">Cannot Proceed</div>
                  <ul className="text-xs text-[var(--text-secondary)] mt-1 space-y-1">
                    {preflightInfo.blockers.map((blocker, idx) => (
                      <li key={idx}>• {blocker}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Large batch acknowledgment */}
          {preflightInfo.totalCourses > 50 && !hasBlockers && (
            <label className="flex items-start gap-3 p-3 rounded-lg hover:bg-[var(--bg-tertiary)] cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 rounded border-[var(--border-default)] text-[var(--accent-electric)] focus:ring-[var(--accent-electric)]"
              />
              <span className="text-sm text-[var(--text-secondary)]">
                I understand this is a large batch and processing may take {preflightInfo.estimatedTimeFormatted}.
                The queue will automatically pause and resume if API quota is exhausted.
              </span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={hasBlockers || (preflightInfo.totalCourses > 50 && !acknowledged)}
            className="px-4 py-2 text-sm font-medium bg-[var(--accent-electric)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Start Processing
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Calculate pre-flight info for batch processing
 */
export function calculatePreflightInfo(
  pendingCourses: number,
  cachedCourses: number,
  dataSource: string
): BatchPreflightInfo {
  const coursesNeedingApi = pendingCourses - cachedCourses
  // Estimate: ~2 API calls per course (seeds + URL), ~3 seconds per call average
  const estimatedApiCalls = coursesNeedingApi * 2
  const estimatedSeconds = estimatedApiCalls * 3
  const estimatedMinutes = Math.ceil(estimatedSeconds / 60)

  const warnings: string[] = []
  const blockers: string[] = []

  // Add warnings
  if (pendingCourses > 100) {
    warnings.push(`Processing ${pendingCourses} courses may take a while. Consider processing in smaller batches.`)
  }

  if (coursesNeedingApi > 60) {
    warnings.push('Large API request volume may trigger rate limiting. Queue will auto-pause if needed.')
  }

  // Check for blockers
  if (dataSource === 'google' && coursesNeedingApi > 0) {
    // Google-only mode with many courses - just a warning, not a blocker
  }

  return {
    totalCourses: pendingCourses,
    cachedCourses,
    coursesNeedingApi,
    estimatedApiCalls,
    estimatedMinutes,
    estimatedTimeFormatted: formatTimeRemaining(estimatedSeconds * 1000),
    warnings,
    blockers,
    canProceed: blockers.length === 0
  }
}
