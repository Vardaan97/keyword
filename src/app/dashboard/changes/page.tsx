'use client'

import { useState, useEffect, useCallback } from 'react'

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

interface ChangeStatistics {
  total: number
  byResourceType: Record<string, number>
  byChangeType: Record<string, number>
  byClientType: Record<string, number>
  byCategory: Record<string, number>
  byDay: Record<string, number>
}

interface ChangesResponse {
  changes: ChangeEvent[]
  total: number
  unfilteredTotal: number
  dateRange: {
    start: string
    end: string
    days: number
  }
  accounts: Array<{ accountName: string; customerId: string; total: number }>
  statistics: ChangeStatistics
}

// Resource type display names
const RESOURCE_TYPE_NAMES: Record<string, string> = {
  'CAMPAIGN': 'Campaign',
  'AD_GROUP': 'Ad Group',
  'AD_GROUP_AD': 'Ad',
  'AD_GROUP_CRITERION': 'Keyword',
  'CAMPAIGN_BUDGET': 'Budget',
  'CAMPAIGN_CRITERION': 'Targeting',
  'BIDDING_STRATEGY': 'Bidding',
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

export default function ChangesPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ChangesResponse | null>(null)
  const [days, setDays] = useState(7)
  const [allAccounts, setAllAccounts] = useState(true)
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>('all')
  const [changeTypeFilter, setChangeTypeFilter] = useState<string>('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        days: days.toString(),
        allAccounts: allAccounts.toString(),
      })

      if (resourceTypeFilter !== 'all') {
        params.set('resourceType', resourceTypeFilter)
      }
      if (changeTypeFilter !== 'all') {
        params.set('changeType', changeTypeFilter)
      }

      const response = await fetch(`/api/gads/changes?${params}`)
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch changes')
      }

      setData(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [days, allAccounts, resourceTypeFilter, changeTypeFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Format date
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Format relative time
  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  // Get change type badge color
  const getChangeTypeBadge = (changeType: string) => {
    switch (changeType) {
      case 'CREATE':
        return 'bg-[var(--accent-lime)]/15 text-[var(--accent-lime)]'
      case 'UPDATE':
        return 'bg-[var(--accent-electric)]/15 text-[var(--accent-electric)]'
      case 'REMOVE':
        return 'bg-[var(--accent-rose)]/15 text-[var(--accent-rose)]'
      default:
        return 'bg-[var(--text-muted)]/15 text-[var(--text-muted)]'
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">
            Change Tracker
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            {data ? (
              <>
                <span className="text-[var(--accent-electric)]">{data.total}</span> changes
                {' • '}Last {days} days
                {allAccounts && data.accounts.length > 1 && (
                  <>{' • '}{data.accounts.length} accounts</>
                )}
              </>
            ) : (
              'Loading changes from Google Ads...'
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Days Filter */}
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-sm focus:outline-none focus:border-[var(--accent-electric)]"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>

          {/* Resource Type Filter */}
          <select
            value={resourceTypeFilter}
            onChange={(e) => setResourceTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-sm focus:outline-none focus:border-[var(--accent-electric)]"
          >
            <option value="all">All Types</option>
            <option value="CAMPAIGN">Campaigns</option>
            <option value="AD_GROUP">Ad Groups</option>
            <option value="AD_GROUP_CRITERION">Keywords</option>
            <option value="AD_GROUP_AD">Ads</option>
            <option value="CAMPAIGN_BUDGET">Budgets</option>
          </select>

          {/* Change Type Filter */}
          <select
            value={changeTypeFilter}
            onChange={(e) => setChangeTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-sm focus:outline-none focus:border-[var(--accent-electric)]"
          >
            <option value="all">All Changes</option>
            <option value="CREATE">Created</option>
            <option value="UPDATE">Updated</option>
            <option value="REMOVE">Removed</option>
          </select>

          {/* Account Toggle */}
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] cursor-pointer">
            <input
              type="checkbox"
              checked={allAccounts}
              onChange={(e) => setAllAccounts(e.target.checked)}
              className="rounded text-[var(--accent-electric)]"
            />
            <span className="text-sm text-[var(--text-secondary)]">All Accounts</span>
          </label>

          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-[var(--accent-electric)] text-white font-medium text-sm hover:bg-[var(--accent-electric)]/90 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl border border-[var(--accent-rose)]/20 bg-[var(--accent-rose)]/5 p-4 mb-6 flex items-start gap-3">
          <svg className="w-5 h-5 text-[var(--accent-rose)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-[var(--accent-rose)]">Error</p>
            <p className="text-sm text-[var(--text-secondary)]">{error}</p>
          </div>
        </div>
      )}

      {/* Statistics Cards */}
      {data && data.statistics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
            <p className="text-sm text-[var(--text-muted)] mb-1">Total Changes</p>
            <p className="text-2xl font-display font-bold text-[var(--text-primary)]">
              {data.statistics.total}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
            <p className="text-sm text-[var(--text-muted)] mb-1">Created</p>
            <p className="text-2xl font-display font-bold text-[var(--accent-lime)]">
              {data.statistics.byChangeType?.CREATE || 0}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
            <p className="text-sm text-[var(--text-muted)] mb-1">Updated</p>
            <p className="text-2xl font-display font-bold text-[var(--accent-electric)]">
              {data.statistics.byChangeType?.UPDATE || 0}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
            <p className="text-sm text-[var(--text-muted)] mb-1">Removed</p>
            <p className="text-2xl font-display font-bold text-[var(--accent-rose)]">
              {data.statistics.byChangeType?.REMOVE || 0}
            </p>
          </div>
        </div>
      )}

      {/* Changes Timeline */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h2 className="font-semibold text-[var(--text-primary)]">
            Change History
          </h2>
          {data && (
            <span className="text-sm text-[var(--text-muted)]">
              Showing {data.changes.length} of {data.unfilteredTotal} changes
            </span>
          )}
        </div>

        <div className="divide-y divide-[var(--border-subtle)]">
          {loading ? (
            <div className="px-6 py-12 text-center text-[var(--text-muted)]">
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Fetching changes from Google Ads...
              </div>
            </div>
          ) : data && data.changes.length > 0 ? (
            data.changes.map((change, index) => (
              <div key={`${change.resourceId}-${change.changedAt}-${index}`} className="px-6 py-4 hover:bg-[var(--bg-hover)] transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Summary */}
                    <p className="font-medium text-[var(--text-primary)] mb-1">
                      {change.summary}
                    </p>

                    {/* Meta info */}
                    <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getChangeTypeBadge(change.changeType)}`}>
                        {change.changeType}
                      </span>

                      <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--bg-tertiary)]">
                        {RESOURCE_TYPE_NAMES[change.resourceType] || change.resourceType}
                      </span>

                      {change.clientType && (
                        <span className="text-xs">
                          via {change.clientType}
                        </span>
                      )}

                      {change.userEmail && (
                        <span className="text-xs text-[var(--accent-electric)]">
                          {change.userEmail}
                        </span>
                      )}
                    </div>

                    {/* Changed fields */}
                    {change.changedFields.length > 0 && change.changeType === 'UPDATE' && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {change.changedFields.slice(0, 4).map((field, i) => (
                          <div
                            key={`${field.field}-${i}`}
                            className="text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]"
                          >
                            <span style={{ color: CATEGORY_COLORS[field.category] || CATEGORY_COLORS.other }}>
                              {field.category}
                            </span>
                            {field.oldValue && field.newValue && (
                              <span className="text-[var(--text-muted)]">
                                : {field.oldValue} → {field.newValue}
                              </span>
                            )}
                          </div>
                        ))}
                        {change.changedFields.length > 4 && (
                          <span className="text-xs text-[var(--text-muted)] px-2 py-1">
                            +{change.changedFields.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm text-[var(--text-secondary)]">
                      {formatRelativeTime(change.changedAt)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {formatDate(change.changedAt)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : !loading && data && data.changes.length === 0 ? (
            <div className="px-6 py-12 text-center text-[var(--text-muted)]">
              <svg className="w-12 h-12 mx-auto mb-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="font-medium mb-1">No changes found</p>
              <p className="text-sm">No changes match the current filters or date range</p>
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-[var(--text-muted)]">
              Failed to load changes. Try refreshing.
            </div>
          )}
        </div>
      </div>

      {/* Account breakdown */}
      {data && data.accounts.length > 1 && (
        <div className="mt-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Changes by Account</h3>
          <div className="flex flex-wrap gap-4">
            {data.accounts.map((account) => (
              <div key={account.customerId} className="flex items-center gap-2">
                <span className="text-sm text-[var(--text-secondary)]">{account.accountName}:</span>
                <span className="text-sm font-medium text-[var(--accent-electric)]">{account.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
