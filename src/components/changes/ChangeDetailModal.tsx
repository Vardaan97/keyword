'use client'

import { useState } from 'react'

interface ChangedField {
  field: string
  category: string
  oldValue?: string
  newValue?: string
}

interface ChangeEvent {
  resourceType: string
  resourceId: string
  resourceName: string
  changeType: 'CREATE' | 'UPDATE' | 'REMOVE'
  changedAt: number
  userEmail?: string
  clientType?: string
  changedFields: ChangedField[]
  summary: string
}

interface ChangeDetailModalProps {
  change: ChangeEvent
  onClose: () => void
}

// Category colors
const CATEGORY_COLORS: Record<string, string> = {
  budget: 'var(--accent-lime)',
  bidding: 'var(--accent-electric)',
  status: 'var(--accent-amber)',
  targeting: 'var(--accent-violet)',
  schedule: 'var(--accent-rose)',
  creative: 'var(--accent-cyan)',
  metadata: 'var(--text-muted)',
  other: 'var(--text-muted)',
}

// Resource type display names
const RESOURCE_TYPE_NAMES: Record<string, string> = {
  'CAMPAIGN': 'Campaign',
  'AD_GROUP': 'Ad Group',
  'AD_GROUP_AD': 'Ad',
  'AD_GROUP_CRITERION': 'Keyword',
  'CAMPAIGN_BUDGET': 'Budget',
  'CAMPAIGN_CRITERION': 'Targeting',
  'BIDDING_STRATEGY': 'Bidding Strategy',
  'ASSET': 'Asset',
  'ASSET_GROUP': 'Asset Group',
  'ASSET_GROUP_ASSET': 'Asset Group Asset',
  'CAMPAIGN_ASSET': 'Campaign Asset',
  'AD_GROUP_ASSET': 'Ad Group Asset',
}

export function ChangeDetailModal({ change, onClose }: ChangeDetailModalProps) {
  const [copied, setCopied] = useState(false)

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const getChangeTypeBadge = (changeType: string) => {
    switch (changeType) {
      case 'CREATE':
        return 'bg-[var(--accent-lime)]/15 text-[var(--accent-lime)] border-[var(--accent-lime)]/30'
      case 'UPDATE':
        return 'bg-[var(--accent-electric)]/15 text-[var(--accent-electric)] border-[var(--accent-electric)]/30'
      case 'REMOVE':
        return 'bg-[var(--accent-rose)]/15 text-[var(--accent-rose)] border-[var(--accent-rose)]/30'
      default:
        return 'bg-[var(--text-muted)]/15 text-[var(--text-muted)] border-[var(--text-muted)]/30'
    }
  }

  const copyToClipboard = () => {
    const text = `Change Details
Resource: ${change.resourceName || change.resourceId}
Type: ${RESOURCE_TYPE_NAMES[change.resourceType] || change.resourceType}
Change: ${change.changeType}
Date: ${formatDate(change.changedAt)}
User: ${change.userEmail || 'Unknown'}
Client: ${change.clientType || 'Unknown'}

Changed Fields:
${change.changedFields.map(f => `- ${f.field}: ${f.oldValue || 'N/A'} → ${f.newValue || 'N/A'}`).join('\n')}`

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Group changed fields by category
  const fieldsByCategory = change.changedFields.reduce((acc, field) => {
    const category = field.category || 'other'
    if (!acc[category]) acc[category] = []
    acc[category].push(field)
    return acc
  }, {} as Record<string, ChangedField[]>)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-lg font-display font-bold text-[var(--text-primary)]">
              Change Details
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {formatDate(change.changedAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyToClipboard}
              className="p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              title="Copy to clipboard"
            >
              {copied ? (
                <svg className="w-5 h-5 text-[var(--accent-lime)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Resource Info */}
          <div className="p-6 border-b border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/50">
            <div className="flex items-center gap-3 mb-3">
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${getChangeTypeBadge(change.changeType)}`}>
                {change.changeType === 'CREATE' && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
                {change.changeType === 'UPDATE' && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                )}
                {change.changeType === 'REMOVE' && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
                {change.changeType}
              </span>
              <span className="px-3 py-1 rounded-full text-sm bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                {RESOURCE_TYPE_NAMES[change.resourceType] || change.resourceType}
              </span>
            </div>

            <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
              {change.summary}
            </h3>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Resource Name</p>
                <p className="text-sm text-[var(--text-secondary)] font-mono">
                  {change.resourceName || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Resource ID</p>
                <p className="text-sm text-[var(--text-secondary)] font-mono">
                  {change.resourceId}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Modified By</p>
                <p className="text-sm text-[var(--accent-electric)]">
                  {change.userEmail || 'Unknown'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Client Type</p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {change.clientType || 'Unknown'}
                </p>
              </div>
            </div>
          </div>

          {/* Changed Fields */}
          {change.changedFields.length > 0 && (
            <div className="p-6">
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Changed Fields ({change.changedFields.length})
              </h4>

              {Object.entries(fieldsByCategory).map(([category, fields]) => (
                <div key={category} className="mb-4 last:mb-0">
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[category] || CATEGORY_COLORS.other }}
                    />
                    <span
                      className="text-xs font-medium uppercase tracking-wider"
                      style={{ color: CATEGORY_COLORS[category] || CATEGORY_COLORS.other }}
                    >
                      {category}
                    </span>
                  </div>

                  <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[var(--bg-tertiary)]">
                          <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider w-1/3">
                            Field
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider w-1/3">
                            Before
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider w-1/3">
                            After
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {fields.map((field, idx) => (
                          <tr key={`${field.field}-${idx}`} className="hover:bg-[var(--bg-hover)]">
                            <td className="px-4 py-3 text-[var(--text-secondary)] font-mono text-xs">
                              {field.field}
                            </td>
                            <td className="px-4 py-3">
                              {field.oldValue ? (
                                <span className="text-[var(--accent-rose)] bg-[var(--accent-rose)]/10 px-2 py-1 rounded text-xs font-mono break-all">
                                  {field.oldValue}
                                </span>
                              ) : (
                                <span className="text-[var(--text-muted)] text-xs italic">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {field.newValue ? (
                                <span className="text-[var(--accent-lime)] bg-[var(--accent-lime)]/10 px-2 py-1 rounded text-xs font-mono break-all">
                                  {field.newValue}
                                </span>
                              ) : (
                                <span className="text-[var(--text-muted)] text-xs italic">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state for no changed fields */}
          {change.changedFields.length === 0 && (
            <div className="p-6 text-center text-[var(--text-muted)]">
              <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm">No field-level details available for this change</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/50">
          <p className="text-xs text-[var(--text-muted)]">
            Resource ID: {change.resourceId}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[var(--accent-electric)] text-white font-medium text-sm hover:bg-[var(--accent-electric)]/90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
