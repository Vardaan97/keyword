'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { IssueWarning } from './IssueWarning'

interface Rule {
  id: string
  condition: string
  action: string
  impact: string
  potentialIssues: string[]
  affectedEntities: string
}

interface RuleConditionTableProps {
  rules: Rule[]
  compact?: boolean
}

export function RuleConditionTable({ rules, compact = false }: RuleConditionTableProps) {
  const [expandedRule, setExpandedRule] = useState<string | null>(null)

  if (compact) {
    return (
      <div className="space-y-2">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <span className="text-xs font-mono text-[var(--text-muted)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded">
              {rule.id}
            </span>
            <span className="text-sm text-[var(--text-secondary)] flex-1">{rule.condition}</span>
            <span className="text-sm font-medium text-[var(--accent-electric)]">{rule.action}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-left text-xs text-[var(--text-muted)] uppercase tracking-wide border-b border-[var(--border-subtle)]">
            <th className="pb-3 pr-4 font-medium w-16">#</th>
            <th className="pb-3 pr-4 font-medium">Condition</th>
            <th className="pb-3 pr-4 font-medium">Action</th>
            <th className="pb-3 pr-4 font-medium">Impact</th>
            <th className="pb-3 font-medium w-24">Issues</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, index) => (
            <>
              <tr
                key={rule.id}
                className={cn(
                  'border-b border-[var(--border-subtle)] last:border-0 cursor-pointer transition-colors',
                  expandedRule === rule.id
                    ? 'bg-[var(--accent-electric)]/5'
                    : 'hover:bg-[var(--bg-tertiary)]'
                )}
                onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
              >
                <td className="py-4 pr-4">
                  <span className="font-mono text-sm text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-2 py-1 rounded">
                    {rule.id}
                  </span>
                </td>
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-[var(--accent-amber)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    <span className="text-sm text-[var(--text-primary)]">{rule.condition}</span>
                  </div>
                </td>
                <td className="py-4 pr-4">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-electric)]/10 text-[var(--accent-electric)] text-sm font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {rule.action}
                  </span>
                </td>
                <td className="py-4 pr-4">
                  <p className="text-sm text-[var(--text-secondary)] max-w-sm">{rule.impact}</p>
                </td>
                <td className="py-4">
                  {rule.potentialIssues.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{rule.potentialIssues.length}</span>
                    </div>
                  )}
                </td>
              </tr>
              {/* Expanded Row */}
              {expandedRule === rule.id && (
                <tr>
                  <td colSpan={5} className="p-0">
                    <div className="p-4 bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)]">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Affected Entities */}
                        <div>
                          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">
                            Affected Entities
                          </p>
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-[var(--accent-violet)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            <span className="text-sm text-[var(--text-primary)]">{rule.affectedEntities}</span>
                          </div>
                        </div>

                        {/* Potential Issues */}
                        <div>
                          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">
                            Potential Issues
                          </p>
                          <IssueWarning issues={rule.potentialIssues} />
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}
