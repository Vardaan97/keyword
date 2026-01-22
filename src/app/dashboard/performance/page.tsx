'use client'

import { useState, useEffect, useCallback } from 'react'

interface ImportedCampaign {
  campaignName: string
  status: string
  campaignType: string
  clicks: number
  impressions: number
  ctr: number
  currencyCode: string
  averageCpc: number
  cost: number
  impressionsAbsTop: number
  impressionsTop: number
  conversions: number
  viewThroughConversions: number
  costPerConversion: number
  conversionRate: number
}

interface ImportedPerformance {
  accountId: string
  accountName: string
  dateRange: string
  importedAt: number
  campaigns: ImportedCampaign[]
  totals: {
    clicks: number
    impressions: number
    cost: number
    conversions: number
  }
}

export default function PerformancePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ImportedPerformance | null>(null)
  const [sortField, setSortField] = useState<keyof ImportedCampaign>('cost')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/import/data?accountId=bouquet&type=performance')
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch performance data')
      }

      setData(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Format currency (already in rupees, not micros)
  const formatCurrency = (amount: number) => {
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(1)}Cr`
    } else if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(1)}L`
    } else if (amount >= 1000) {
      return `₹${(amount / 1000).toFixed(1)}K`
    }
    return `₹${amount.toFixed(0)}`
  }

  // Format large numbers
  const formatNumber = (num: number) => {
    if (num >= 10000000) {
      return `${(num / 10000000).toFixed(1)}Cr`
    } else if (num >= 100000) {
      return `${(num / 100000).toFixed(1)}L`
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`
    }
    return num.toLocaleString()
  }

  // Sort and filter campaigns
  const sortedCampaigns = data?.campaigns
    .filter(c => statusFilter === 'all' || c.status.toLowerCase() === statusFilter.toLowerCase())
    .sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      return sortDirection === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
    }) || []

  const handleSort = (field: keyof ImportedCampaign) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const SortIcon = ({ field }: { field: keyof ImportedCampaign }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? (
      <svg className="w-4 h-4 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">
            Campaign Performance
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            {data ? (
              <>
                <span className="text-[var(--accent-electric)]">{data.accountName}</span>
                {' • '}{data.dateRange}
                {' • '}Imported data from Google Ads Reports
              </>
            ) : (
              'Loading campaign metrics from imported data...'
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-sm focus:outline-none focus:border-[var(--accent-electric)]"
          >
            <option value="all">All Status</option>
            <option value="enabled">Enabled</option>
            <option value="paused">Paused</option>
          </select>

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

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
            <p className="text-sm text-[var(--text-muted)] mb-1">Impressions</p>
            <p className="text-2xl font-display font-bold text-[var(--text-primary)]">
              {formatNumber(data.totals.impressions)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
            <p className="text-sm text-[var(--text-muted)] mb-1">Clicks</p>
            <p className="text-2xl font-display font-bold text-[var(--text-primary)]">
              {formatNumber(data.totals.clicks)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
            <p className="text-sm text-[var(--text-muted)] mb-1">Cost</p>
            <p className="text-2xl font-display font-bold text-[var(--text-primary)]">
              {formatCurrency(data.totals.cost)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
            <p className="text-sm text-[var(--text-muted)] mb-1">Conversions</p>
            <p className="text-2xl font-display font-bold text-[var(--text-primary)]">
              {data.totals.conversions.toFixed(0)}
            </p>
          </div>
        </div>
      )}

      {/* Info Banner when no data */}
      {!data && !loading && !error && (
        <div className="rounded-xl border border-[var(--accent-electric)]/20 bg-[var(--accent-electric)]/5 p-4 mb-6 flex items-start gap-3">
          <svg className="w-5 h-5 text-[var(--accent-electric)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-[var(--accent-electric)]">No Data Imported</p>
            <p className="text-sm text-[var(--text-secondary)]">
              No campaign performance data found. Import data using the CLI script to see campaign metrics.
            </p>
          </div>
        </div>
      )}

      {/* Campaigns Table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h2 className="font-semibold text-[var(--text-primary)]">
            Campaigns {data ? `(${sortedCampaigns.length}${statusFilter !== 'all' ? ` ${statusFilter}` : ''})` : ''}
          </h2>
          {data && (
            <span className="text-sm text-[var(--text-muted)]">
              Click column headers to sort
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th
                  className="px-6 py-3 text-left cursor-pointer hover:bg-[var(--bg-hover)]"
                  onClick={() => handleSort('campaignName')}
                >
                  Campaign <SortIcon field="campaignName" />
                </th>
                <th
                  className="px-6 py-3 text-left cursor-pointer hover:bg-[var(--bg-hover)]"
                  onClick={() => handleSort('status')}
                >
                  Status <SortIcon field="status" />
                </th>
                <th
                  className="px-6 py-3 text-right cursor-pointer hover:bg-[var(--bg-hover)]"
                  onClick={() => handleSort('impressions')}
                >
                  Impressions <SortIcon field="impressions" />
                </th>
                <th
                  className="px-6 py-3 text-right cursor-pointer hover:bg-[var(--bg-hover)]"
                  onClick={() => handleSort('clicks')}
                >
                  Clicks <SortIcon field="clicks" />
                </th>
                <th
                  className="px-6 py-3 text-right cursor-pointer hover:bg-[var(--bg-hover)]"
                  onClick={() => handleSort('ctr')}
                >
                  CTR <SortIcon field="ctr" />
                </th>
                <th
                  className="px-6 py-3 text-right cursor-pointer hover:bg-[var(--bg-hover)]"
                  onClick={() => handleSort('cost')}
                >
                  Cost <SortIcon field="cost" />
                </th>
                <th
                  className="px-6 py-3 text-right cursor-pointer hover:bg-[var(--bg-hover)]"
                  onClick={() => handleSort('conversions')}
                >
                  Conv. <SortIcon field="conversions" />
                </th>
                <th
                  className="px-6 py-3 text-right cursor-pointer hover:bg-[var(--bg-hover)]"
                  onClick={() => handleSort('costPerConversion')}
                >
                  Cost/Conv <SortIcon field="costPerConversion" />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-[var(--text-muted)]">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Loading campaign data...
                    </div>
                  </td>
                </tr>
              ) : sortedCampaigns.length > 0 ? (
                sortedCampaigns.map((campaign, index) => (
                  <tr key={`${campaign.campaignName}-${index}`} className="hover:bg-[var(--bg-hover)]">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">{campaign.campaignName}</p>
                        <p className="text-xs text-[var(--text-muted)]">{campaign.campaignType}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                        campaign.status.toLowerCase() === 'enabled'
                          ? 'bg-[var(--accent-lime)]/15 text-[var(--accent-lime)]'
                          : campaign.status.toLowerCase() === 'paused'
                          ? 'bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]'
                          : 'bg-[var(--text-muted)]/15 text-[var(--text-muted)]'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {campaign.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm text-[var(--text-secondary)]">
                      {campaign.impressions.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm text-[var(--text-secondary)]">
                      {campaign.clicks.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm text-[var(--text-secondary)]">
                      {campaign.ctr.toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm text-[var(--text-secondary)]">
                      {formatCurrency(campaign.cost)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm text-[var(--accent-lime)]">
                      {campaign.conversions.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm text-[var(--text-secondary)]">
                      {campaign.conversions > 0 ? formatCurrency(campaign.costPerConversion) : '-'}
                    </td>
                  </tr>
                ))
              ) : !loading && !data ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-[var(--text-muted)]">
                    No data imported yet
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-[var(--text-muted)]">
                    No campaigns match the current filter
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
