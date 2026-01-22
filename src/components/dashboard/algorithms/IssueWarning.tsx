'use client'

import { cn } from '@/lib/utils'

interface IssueWarningProps {
  issues: string[]
  variant?: 'default' | 'inline' | 'compact'
  maxVisible?: number
}

export function IssueWarning({ issues, variant = 'default', maxVisible = 3 }: IssueWarningProps) {
  if (issues.length === 0) return null

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-1.5 text-[var(--accent-amber)]">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-xs font-medium">
          {issues.length} potential issue{issues.length > 1 ? 's' : ''}
        </span>
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <div className="space-y-1">
        {issues.slice(0, maxVisible).map((issue, index) => (
          <div key={index} className="flex items-start gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="text-[var(--accent-amber)] mt-0.5">•</span>
            <span>{issue}</span>
          </div>
        ))}
        {issues.length > maxVisible && (
          <p className="text-xs text-[var(--text-muted)] pl-3">
            +{issues.length - maxVisible} more
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {issues.slice(0, maxVisible).map((issue, index) => (
        <div
          key={index}
          className="flex items-start gap-2 p-2 rounded-lg bg-[var(--accent-amber)]/5 border border-[var(--accent-amber)]/20"
        >
          <svg className="w-4 h-4 text-[var(--accent-amber)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-sm text-[var(--text-secondary)]">{issue}</span>
        </div>
      ))}
      {issues.length > maxVisible && (
        <p className="text-xs text-[var(--text-muted)] pl-6">
          +{issues.length - maxVisible} more potential issue{issues.length - maxVisible > 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}

// Summary badge for showing issue counts
export function IssueSummaryBadge({ count }: { count: number }) {
  if (count === 0) return null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        count > 3
          ? 'bg-[var(--accent-rose)]/15 text-[var(--accent-rose)]'
          : count > 1
          ? 'bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]'
          : 'bg-[var(--text-muted)]/15 text-[var(--text-muted)]'
      )}
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      {count}
    </span>
  )
}
