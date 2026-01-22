'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { RuleConditionTable } from './RuleConditionTable'
import { ImpactBadge } from './ImpactBadge'

interface Rule {
  id: string
  condition: string
  action: string
  impact: string
  potentialIssues: string[]
  affectedEntities: string
}

interface AlgorithmCardProps {
  algorithmId: string
  name: string
  description: string
  category: string
  rules: Rule[]
  dataSource: string
  executionFrequency: string
  enabled: boolean
  lastUpdated: number
  executionCount?: number
  onToggle?: (algorithmId: string) => void
}

const categoryColors: Record<string, { bg: string; text: string; icon: string }> = {
  bidding: {
    bg: 'bg-[var(--accent-electric)]/10',
    text: 'text-[var(--accent-electric)]',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  status: {
    bg: 'bg-[var(--accent-amber)]/10',
    text: 'text-[var(--accent-amber)]',
    icon: 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  signals: {
    bg: 'bg-[var(--accent-lime)]/10',
    text: 'text-[var(--accent-lime)]',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  targeting: {
    bg: 'bg-[var(--accent-violet)]/10',
    text: 'text-[var(--accent-violet)]',
    icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z',
  },
  other: {
    bg: 'bg-[var(--accent-rose)]/10',
    text: 'text-[var(--accent-rose)]',
    icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
  },
}

export function AlgorithmCard({
  algorithmId,
  name,
  description,
  category,
  rules,
  dataSource,
  executionFrequency,
  enabled,
  lastUpdated,
  executionCount,
  onToggle,
}: AlgorithmCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const colors = categoryColors[category] || categoryColors.other

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div
      className={cn(
        'rounded-xl border transition-all duration-300',
        enabled
          ? 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'
          : 'border-[var(--border-subtle)]/50 bg-[var(--bg-elevated)]/50 opacity-75'
      )}
    >
      {/* Header */}
      <div
        className="p-5 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            {/* Category Icon */}
            <div className={cn('p-3 rounded-xl', colors.bg)}>
              <svg className={cn('w-6 h-6', colors.text)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={colors.icon} />
              </svg>
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-lg font-display font-semibold text-[var(--text-primary)]">
                  {name}
                </h3>
                <span className={cn(
                  'px-2 py-0.5 text-xs font-medium rounded-full uppercase tracking-wide',
                  colors.bg,
                  colors.text
                )}>
                  {category}
                </span>
                {enabled ? (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[var(--accent-lime)]/15 text-[var(--accent-lime)]">
                    Active
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[var(--text-muted)]/15 text-[var(--text-muted)]">
                    Disabled
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
                {description}
              </p>

              {/* Quick Stats */}
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span>{rules.length} rules</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{executionFrequency}</span>
                </div>
                {executionCount !== undefined && (
                  <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>{executionCount} executions (30d)</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Toggle Button */}
            {onToggle && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle(algorithmId)
                }}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors',
                  enabled ? 'bg-[var(--accent-lime)]' : 'bg-[var(--bg-tertiary)]'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
                    enabled && 'translate-x-5'
                  )}
                />
              </button>
            )}

            {/* Expand Icon */}
            <svg
              className={cn(
                'w-5 h-5 text-[var(--text-muted)] transition-transform',
                isExpanded && 'rotate-180'
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-[var(--border-subtle)]">
          {/* Metadata */}
          <div className="px-5 py-4 bg-[var(--bg-tertiary)]/50 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-1">Data Source</p>
              <p className="text-sm text-[var(--text-primary)]">{dataSource}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-1">Execution Frequency</p>
              <p className="text-sm text-[var(--text-primary)]">{executionFrequency}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-1">Last Updated</p>
              <p className="text-sm text-[var(--text-primary)]">{formatDate(lastUpdated)}</p>
            </div>
          </div>

          {/* Rules Table */}
          <div className="p-5">
            <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
              Rules & Conditions
            </h4>
            <RuleConditionTable rules={rules} />
          </div>
        </div>
      )}
    </div>
  )
}
