'use client'

import { useState, useCallback } from 'react'
import { useAppStore, GOOGLE_ADS_ACCOUNTS } from '@/lib/store'

interface Recommendation {
  resourceName: string
  type: string
  category: string
  impact: {
    baseImpressions: number
    potentialImpressions: number
    baseClicks: number
    potentialClicks: number
    baseConversions: number
    potentialConversions: number
  }
  campaignBudget?: {
    currentBudgetMicros: number
    recommendedBudgetMicros: number
  }
  keyword?: {
    keyword: string
    matchType: string
  }
}

interface RecommendationsData {
  accountId: string
  accountName: string
  recommendations: Recommendation[]
  summary: {
    total: number
    byCategory: Record<string, number>
    potentialClicks: number
    potentialConversions: number
  }
}

const categoryColors: Record<string, { bg: string; text: string }> = {
  Budget: { bg: 'bg-[var(--accent-amber)]/10', text: 'text-[var(--accent-amber)]' },
  Keywords: { bg: 'bg-[var(--accent-electric)]/10', text: 'text-[var(--accent-electric)]' },
  Ads: { bg: 'bg-[var(--accent-lime)]/10', text: 'text-[var(--accent-lime)]' },
  Assets: { bg: 'bg-[var(--accent-violet)]/10', text: 'text-[var(--accent-violet)]' },
  Bidding: { bg: 'bg-[var(--accent-rose)]/10', text: 'text-[var(--accent-rose)]' },
  PMax: { bg: 'bg-[var(--text-muted)]/10', text: 'text-[var(--text-muted)]' },
  Other: { bg: 'bg-[var(--text-muted)]/10', text: 'text-[var(--text-muted)]' },
}

// Format currency (micros to INR)
const formatCurrency = (micros: number) => {
  const amount = micros / 1_000_000
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(1)}L`
  } else if (amount >= 1000) {
    return `₹${(amount / 1000).toFixed(1)}K`
  }
  return `₹${amount.toFixed(0)}`
}

export default function RecommendationsPage() {
  const { selectedGoogleAdsAccountId } = useAppStore()
  const [accountId, setAccountId] = useState(selectedGoogleAdsAccountId || 'flexi')
  const [filter, setFilter] = useState<string>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<RecommendationsData | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/gads/recommendations?accountId=${accountId}`)
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch recommendations')
      }

      setData(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [accountId])

  // Get accounts (excluding 'all-accounts')
  const accounts = GOOGLE_ADS_ACCOUNTS.filter(a => a.id !== 'all-accounts')

  // Get unique categories from data
  const categories = data
    ? ['all', ...Object.keys(data.summary.byCategory)]
    : ['all']

  // Filter recommendations
  const filteredRecs = data
    ? filter === 'all'
      ? data.recommendations
      : data.recommendations.filter(r => r.category === filter)
    : []

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">
            AI Recommendations
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Intelligent suggestions from Google Ads to optimize your campaigns
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-sm focus:outline-none focus:border-[var(--accent-electric)]"
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
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
                Fetching...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Fetch Recommendations
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

      {/* Summary Banner */}
      {data && (
        <div className="rounded-xl border border-[var(--accent-lime)]/20 bg-[var(--accent-lime)]/5 p-4 mb-6 flex items-start gap-3">
          <svg className="w-5 h-5 text-[var(--accent-lime)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--accent-lime)]">
              {data.summary.total} Recommendations Found
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              Potential uplift: +{data.summary.potentialClicks.toLocaleString()} clicks, +{data.summary.potentialConversions.toFixed(0)} conversions
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
            <p className="text-sm font-medium text-[var(--accent-electric)]">Ready to Load</p>
            <p className="text-sm text-[var(--text-secondary)]">
              Click &quot;Fetch Recommendations&quot; to load Google Ads recommendations. This includes 50+ recommendation types
              covering Budget, Bidding, Keywords, Ads, Assets, and PMax campaigns.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      {data && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setFilter(category)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                filter === category
                  ? 'bg-[var(--accent-electric)] text-white'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
              }`}
            >
              {category === 'all' ? `All (${data.summary.total})` : `${category} (${data.summary.byCategory[category] || 0})`}
            </button>
          ))}
        </div>
      )}

      {/* Recommendations List */}
      <div className="space-y-4">
        {loading ? (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-12 text-center">
            <div className="flex items-center justify-center gap-2 text-[var(--text-muted)]">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Loading recommendations...
            </div>
          </div>
        ) : filteredRecs.length === 0 && data ? (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-12 text-center">
            <p className="text-[var(--text-muted)]">No recommendations in this category</p>
          </div>
        ) : !data ? (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-12 text-center">
            <p className="text-[var(--text-muted)]">Click &quot;Fetch Recommendations&quot; to load data</p>
          </div>
        ) : (
          filteredRecs.map((rec, index) => {
            const colors = categoryColors[rec.category] || categoryColors.Other
            const upliftClicks = rec.impact.potentialClicks - rec.impact.baseClicks
            const upliftConversions = rec.impact.potentialConversions - rec.impact.baseConversions

            return (
              <div
                key={rec.resourceName || index}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 hover:border-[var(--border-default)] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
                        {rec.category}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                        {rec.type.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
                      {rec.type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                    </h3>

                    {/* Budget recommendation details */}
                    {rec.campaignBudget && (
                      <p className="text-[var(--text-secondary)] text-sm mb-3">
                        Current budget: {formatCurrency(rec.campaignBudget.currentBudgetMicros)} →
                        Recommended: {formatCurrency(rec.campaignBudget.recommendedBudgetMicros)}
                      </p>
                    )}

                    {/* Keyword recommendation details */}
                    {rec.keyword && (
                      <p className="text-[var(--text-secondary)] text-sm mb-3">
                        Keyword: &quot;{rec.keyword.keyword}&quot; ({rec.keyword.matchType})
                      </p>
                    )}

                    {/* Impact Metrics */}
                    <div className="flex items-center gap-6 mt-4">
                      {upliftClicks > 0 && (
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                          </svg>
                          <span className="text-sm text-[var(--text-secondary)]">
                            +{upliftClicks.toLocaleString()} clicks
                          </span>
                        </div>
                      )}
                      {upliftConversions > 0 && (
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-[var(--accent-lime)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm text-[var(--accent-lime)]">
                            +{upliftConversions.toFixed(1)} conversions
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Recommendation Types Info */}
      <div className="mt-8 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
        <h3 className="font-semibold text-[var(--text-primary)] mb-4">Available Recommendation Types</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="font-medium text-[var(--accent-amber)] mb-1">Budget</p>
            <p className="text-[var(--text-muted)]">CAMPAIGN_BUDGET, FORECASTING_CAMPAIGN_BUDGET, MOVE_UNUSED_BUDGET</p>
          </div>
          <div>
            <p className="font-medium text-[var(--accent-rose)] mb-1">Bidding</p>
            <p className="text-[var(--text-muted)]">TARGET_CPA_OPT_IN, MAXIMIZE_CONVERSIONS, TARGET_ROAS_OPT_IN</p>
          </div>
          <div>
            <p className="font-medium text-[var(--accent-electric)] mb-1">Keywords</p>
            <p className="text-[var(--text-muted)]">KEYWORD, USE_BROAD_MATCH_KEYWORD</p>
          </div>
          <div>
            <p className="font-medium text-[var(--accent-lime)] mb-1">Ads</p>
            <p className="text-[var(--text-muted)]">RESPONSIVE_SEARCH_AD, TEXT_AD, IMPROVE_AD_STRENGTH</p>
          </div>
          <div>
            <p className="font-medium text-[var(--accent-violet)] mb-1">Assets</p>
            <p className="text-[var(--text-muted)]">SITELINK_ASSET, CALLOUT_ASSET, LEAD_FORM_ASSET</p>
          </div>
          <div>
            <p className="font-medium text-[var(--text-secondary)] mb-1">PMax</p>
            <p className="text-[var(--text-muted)]">PERFORMANCE_MAX_OPT_IN, UPGRADE_SMART_SHOPPING</p>
          </div>
        </div>
      </div>
    </div>
  )
}
