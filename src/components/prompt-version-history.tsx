"use client"

import { useState, useEffect } from 'react'
import { PromptVersion } from '@/hooks/usePrompts'

interface PromptVersionHistoryProps {
  type: 'seed' | 'analysis'
  currentVersion: number
  onFetchHistory: (type: 'seed' | 'analysis', limit?: number) => Promise<PromptVersion[]>
  onRollback: (type: 'seed' | 'analysis', version: number) => Promise<{ success: boolean; error?: string }>
  onClose: () => void
}

export function PromptVersionHistory({
  type,
  currentVersion,
  onFetchHistory,
  onRollback,
  onClose
}: PromptVersionHistoryProps) {
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRollingBack, setIsRollingBack] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null)
  const [confirmRollback, setConfirmRollback] = useState<number | null>(null)

  // Fetch version history on mount
  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true)
      try {
        const history = await onFetchHistory(type, 20)
        setVersions(history)
      } catch (err) {
        setError('Failed to load version history')
      } finally {
        setIsLoading(false)
      }
    }
    loadHistory()
  }, [type, onFetchHistory])

  const handleRollback = async (version: number) => {
    setIsRollingBack(true)
    setError(null)
    try {
      const result = await onRollback(type, version)
      if (result.success) {
        setConfirmRollback(null)
        onClose()
      } else {
        setError(result.error || 'Failed to rollback')
      }
    } catch (err) {
      setError('Failed to rollback')
    } finally {
      setIsRollingBack(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[80vh] bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-lg">
              Version History: {type === 'seed' ? 'Seed Generator' : 'Keyword Analyzer'}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Current version: v{currentVersion}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-[var(--accent-electric)] border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-sm text-[var(--text-muted)]">Loading versions...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-muted)]">
              No version history available yet.
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((v) => (
                <div
                  key={v._id}
                  className={`p-4 rounded-xl border transition-all ${
                    v.isActive
                      ? 'bg-[var(--accent-electric)]/10 border-[var(--accent-electric)]/50'
                      : 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)] hover:border-[var(--border-default)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm">v{v.version}</span>
                        {v.isActive && (
                          <span className="px-2 py-0.5 rounded-full bg-[var(--accent-electric)] text-white text-xs font-medium">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {formatDate(v.createdAt)}
                        {v.createdBy && ` by ${v.createdBy}`}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] mt-2 line-clamp-2 font-mono">
                        {v.promptPreview}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setSelectedVersion(v)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] transition-colors"
                      >
                        View
                      </button>
                      {!v.isActive && (
                        <button
                          onClick={() => setConfirmRollback(v.version)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent-violet)]/20 hover:bg-[var(--accent-violet)]/30 text-[var(--accent-violet)] border border-[var(--accent-violet)]/30 transition-colors"
                        >
                          Rollback
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rollback Confirmation Dialog */}
        {confirmRollback !== null && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-xl p-6 max-w-sm w-full">
              <h4 className="font-display font-bold text-lg mb-2">Confirm Rollback</h4>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                This will make v{confirmRollback} the active prompt. The current version will remain in history.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmRollback(null)}
                  className="flex-1 py-2 px-4 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRollback(confirmRollback)}
                  disabled={isRollingBack}
                  className="flex-1 py-2 px-4 rounded-lg bg-[var(--accent-violet)] hover:bg-[var(--accent-violet)]/80 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isRollingBack ? 'Rolling back...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Full Prompt Modal */}
        {selectedVersion && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-xl p-6 max-w-2xl w-full max-h-[70vh] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-display font-bold text-lg">
                    Version {selectedVersion.version}
                    {selectedVersion.isActive && (
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-[var(--accent-electric)] text-white text-xs">
                        Active
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {formatDate(selectedVersion.createdAt)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedVersion(null)}
                  className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <pre className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-xs font-mono whitespace-pre-wrap text-[var(--text-secondary)]">
                  {/* Note: This only shows preview. Full prompt would need another API call */}
                  {selectedVersion.promptPreview}
                  {selectedVersion.promptPreview.endsWith('...') && (
                    <span className="text-[var(--text-muted)]">
                      {'\n\n[Full prompt shown in editor when active]'}
                    </span>
                  )}
                </pre>
              </div>
              {!selectedVersion.isActive && (
                <button
                  onClick={() => {
                    setSelectedVersion(null)
                    setConfirmRollback(selectedVersion.version)
                  }}
                  className="mt-4 w-full py-2 px-4 rounded-lg bg-[var(--accent-violet)] hover:bg-[var(--accent-violet)]/80 text-white text-sm font-medium transition-colors"
                >
                  Rollback to This Version
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
