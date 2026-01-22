"use client"

interface SmartCacheAlertProps {
  sessionData: {
    courseName: string
    createdAt: number
    keywordsCount: number
    analyzedCount: number
    toAddCount: number
    urgentCount: number
    geoTarget: string
  }
  onUseCached: () => void
  onForceRefresh: () => void
  onDismiss: () => void
}

export function SmartCacheAlert({
  sessionData,
  onUseCached,
  onForceRefresh,
  onDismiss
}: SmartCacheAlertProps) {
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onDismiss} />
      <div className="relative w-full max-w-lg bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-2xl overflow-hidden">
        {/* Header with success indicator */}
        <div className="p-6 bg-gradient-to-r from-[var(--accent-lime)]/20 to-[var(--accent-electric)]/20 border-b border-[var(--border-subtle)]">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent-lime)]/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-[var(--accent-lime)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-display font-bold text-lg">Existing Results Found</h3>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                This URL has already been processed with the same prompts
              </p>
            </div>
          </div>
        </div>

        {/* Session Details */}
        <div className="p-6 space-y-4">
          <div className="text-sm text-[var(--text-muted)]">
            <span className="font-medium text-[var(--text-primary)]">{sessionData.courseName}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
              <div className="text-xs text-[var(--text-muted)]">Processed On</div>
              <div className="text-sm font-medium mt-0.5">{formatDate(sessionData.createdAt)}</div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
              <div className="text-xs text-[var(--text-muted)]">Geo Target</div>
              <div className="text-sm font-medium mt-0.5 capitalize">{sessionData.geoTarget}</div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-center">
              <div className="text-lg font-bold text-[var(--accent-electric)]">{sessionData.keywordsCount}</div>
              <div className="text-xs text-[var(--text-muted)]">Raw</div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-center">
              <div className="text-lg font-bold text-[var(--accent-violet)]">{sessionData.analyzedCount}</div>
              <div className="text-xs text-[var(--text-muted)]">Analyzed</div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-center">
              <div className="text-lg font-bold text-[var(--accent-lime)]">{sessionData.toAddCount}</div>
              <div className="text-xs text-[var(--text-muted)]">To Add</div>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-center">
              <div className="text-lg font-bold text-red-400">{sessionData.urgentCount}</div>
              <div className="text-xs text-[var(--text-muted)]">Urgent</div>
            </div>
          </div>

          <p className="text-xs text-[var(--text-muted)] text-center">
            Using cached data saves API calls and speeds up processing
          </p>
        </div>

        {/* Actions */}
        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={onForceRefresh}
            className="flex-1 py-3 px-4 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-sm font-medium transition-colors"
          >
            Force Refresh
          </button>
          <button
            onClick={onUseCached}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-[var(--accent-lime)] to-[var(--accent-electric)] hover:opacity-90 text-black text-sm font-medium transition-opacity"
          >
            Use Cached Data
          </button>
        </div>
      </div>
    </div>
  )
}
