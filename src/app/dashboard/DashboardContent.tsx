'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { useAppStore, THEME_OPTIONS, ThemeType } from '@/lib/store'

interface ImportedPerformance {
  accountId: string
  accountName: string
  dateRange: string
  importedAt: number
  campaigns: Array<{
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
  }>
  totals: {
    clicks: number
    impressions: number
    cost: number
    conversions: number
  }
}

interface AccountStructure {
  accountId: string
  accountName: string
  importedAt: number
  summary: {
    totalCampaigns: number
    enabledCampaigns: number
    pausedCampaigns: number
    totalAdGroups: number
    enabledAdGroups: number
    totalKeywords: number
    enabledKeywords: number
  }
  campaignTypes: Array<{ type: string; count: number }>
  qualityScoreDistribution?: {
    score1to3: number
    score4to6: number
    score7to10: number
    noScore: number
  }
  topCampaigns: Array<{
    name: string
    status: string
    type: string
    adGroupCount: number
  }>
}

interface DashboardData {
  performance: ImportedPerformance | null
  structure: AccountStructure | null
}

export default function DashboardContent() {
  const { theme, setTheme } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData>({ performance: null, structure: null })
  const [error, setError] = useState<string | null>(null)

  // Convex queries for algorithms and insights
  const algorithms = useQuery(api.autoPpcRules.list, {})
  const algorithmExecutionCounts = useQuery(api.autoPpcExecutions.countsByAlgorithm, {})
  const topInsights = useQuery(api.aiInsights.getTopInsights, { limit: 3 })
  const insightCounts = useQuery(api.aiInsights.countsByType, {})

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/import/data?accountId=bouquet&type=all')
      const result = await response.json()
      if (result.success) {
        setData({
          performance: result.data.performance,
          structure: result.data.structure,
        })
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
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

  // Calculate metrics from imported data
  const metrics = {
    totalSpend: data.performance?.totals.cost || 0,
    totalClicks: data.performance?.totals.clicks || 0,
    totalImpressions: data.performance?.totals.impressions || 0,
    totalConversions: data.performance?.totals.conversions || 0,
    avgCPC: data.performance?.totals.clicks
      ? data.performance.totals.cost / data.performance.totals.clicks
      : 0,
    campaigns: data.structure?.summary.totalCampaigns || 0,
    enabledCampaigns: data.structure?.summary.enabledCampaigns || 0,
    adGroups: data.structure?.summary.totalAdGroups || 0,
    enabledAdGroups: data.structure?.summary.enabledAdGroups || 0,
    keywords: data.structure?.summary.totalKeywords || 0,
    enabledKeywords: data.structure?.summary.enabledKeywords || 0,
    qualityScores: data.structure?.qualityScoreDistribution,
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">
            Marketing Intelligence Hub
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Unified view of Google Ads, LinkedIn, PPC algorithms, and AI-powered insights
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Theme Selector */}
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeType)}
            className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-sm focus:outline-none focus:border-[var(--accent-electric)]"
          >
            {THEME_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {/* Account Selector - Placeholder */}
          <select
            className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-sm focus:outline-none focus:border-[var(--accent-electric)]"
            defaultValue="flexi"
          >
            <option value="flexi">Flexi Account</option>
            <option value="bouquet-inr">Bouquet INR</option>
            <option value="bouquet-inr-2">Bouquet INR - 2</option>
          </select>

          {/* Refresh Button */}
          <button className="p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-electric)] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Data Source Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[var(--accent-electric)]/20 via-[var(--accent-violet)]/20 to-[var(--accent-rose)]/20 border border-[var(--border-subtle)] p-6 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* Data Status Icon */}
            <div className="relative w-20 h-20 flex items-center justify-center">
              <div className={`absolute inset-0 rounded-full ${
                loading ? 'bg-[var(--accent-electric)]/20' :
                (data.performance || data.structure) ? 'bg-[var(--accent-lime)]/20' :
                'bg-[var(--accent-amber)]/20'
              }`} />
              {loading ? (
                <svg className="w-10 h-10 text-[var(--accent-electric)] animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (data.performance || data.structure) ? (
                <svg className="w-10 h-10 text-[var(--accent-lime)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-10 h-10 text-[var(--accent-amber)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
            </div>

            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                {loading
                  ? 'Loading Data...'
                  : data.performance
                    ? 'Data Imported Successfully'
                    : data.structure
                      ? 'Account Structure Loaded'
                      : 'No Data Available'}
              </h2>
              <p className="text-[var(--text-secondary)] text-sm mt-1">
                {loading ? (
                  'Fetching imported Google Ads data from Convex...'
                ) : data.performance ? (
                  <>
                    <span className="text-[var(--accent-electric)]">{data.performance.accountName}</span>
                    {' • '}{data.performance.dateRange}
                    {' • '}{data.performance.campaigns.length} campaigns with performance data
                  </>
                ) : data.structure ? (
                  <>
                    <span className="text-[var(--accent-electric)]">{data.structure.accountName}</span>
                    {' • Structure data loaded (no performance data imported)'}
                  </>
                ) : (
                  'Import Google Ads data to see metrics'
                )}
              </p>
              {data.structure && (
                <p className="text-[var(--text-muted)] text-xs mt-1">
                  Structure: {formatNumber(metrics.keywords)} keywords across {formatNumber(metrics.adGroups)} ad groups
                </p>
              )}
            </div>
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-[var(--accent-electric)] text-white font-medium text-sm hover:bg-[var(--accent-electric)]/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Refresh
          </button>
        </div>

        {/* Background Pattern */}
        <div className="absolute inset-0 grid-pattern opacity-30 pointer-events-none" />
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl border border-[var(--accent-rose)]/20 bg-[var(--accent-rose)]/5 p-4 mb-6 flex items-start gap-3">
          <svg className="w-5 h-5 text-[var(--accent-rose)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-[var(--accent-rose)]">Error loading data</p>
            <p className="text-sm text-[var(--text-secondary)]">{error}</p>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="Total Spend"
          value={formatCurrency(metrics.totalSpend)}
          loading={loading}
          variant="amber"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <MetricCard
          title="Total Clicks"
          value={formatNumber(metrics.totalClicks)}
          loading={loading}
          variant="electric"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
          }
        />
        <MetricCard
          title="Conversions"
          value={metrics.totalConversions.toFixed(0)}
          loading={loading}
          variant="lime"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <MetricCard
          title="Avg. CPC"
          value={`₹${metrics.avgCPC.toFixed(2)}`}
          loading={loading}
          variant="default"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
      </div>

      {/* Platform Overview - Google Ads + LinkedIn */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Google Ads Card */}
        <Link href="/dashboard/performance" className="block">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 hover:border-[var(--accent-electric)]/50 transition-colors cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--accent-electric)]/10">
                  <svg className="w-6 h-6 text-[var(--accent-electric)]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)]">Google Ads</h3>
                  <p className="text-xs text-[var(--text-muted)]">Bouquet INR Account</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-[var(--accent-lime)]/15 text-[var(--accent-lime)]">
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                Connected
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-2xl font-display font-bold text-[var(--text-primary)]">
                  {loading ? '--' : formatNumber(metrics.campaigns)}
                </p>
                <p className="text-xs text-[var(--text-muted)]">Campaigns</p>
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-[var(--text-primary)]">
                  {loading ? '--' : formatNumber(metrics.adGroups)}
                </p>
                <p className="text-xs text-[var(--text-muted)]">Ad Groups</p>
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-[var(--text-primary)]">
                  {loading ? '--' : formatCurrency(metrics.totalSpend)}
                </p>
                <p className="text-xs text-[var(--text-muted)]">Spend</p>
              </div>
            </div>
          </div>
        </Link>

        {/* LinkedIn Ads Card */}
        <Link href="/dashboard/linkedin" className="block">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 hover:border-[var(--accent-electric)]/50 transition-colors cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#0A66C2]/10">
                  <svg className="w-6 h-6 text-[#0A66C2]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)]">LinkedIn Ads</h3>
                  <p className="text-xs text-[var(--text-muted)]">Koenig Solutions</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]">
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                Setup Required
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-2xl font-display font-bold text-[var(--text-secondary)]">--</p>
                <p className="text-xs text-[var(--text-muted)]">Campaigns</p>
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-[var(--text-secondary)]">--</p>
                <p className="text-xs text-[var(--text-muted)]">Leads</p>
              </div>
              <div>
                <p className="text-2xl font-display font-bold text-[var(--text-secondary)]">--</p>
                <p className="text-xs text-[var(--text-muted)]">Spend</p>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Algorithm Health + AI Insights Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Algorithm Health Monitor */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Algorithm Health</h3>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[var(--accent-lime)]/15 text-[var(--accent-lime)]">
                {algorithms?.filter(a => a.enabled).length || 0}/{algorithms?.length || 0} Active
              </span>
            </div>
            <Link
              href="/dashboard/ppc-algorithms"
              className="text-sm text-[var(--accent-electric)] hover:underline"
            >
              View All
            </Link>
          </div>

          {algorithms?.length ? (
            <div className="space-y-3">
              {algorithms.slice(0, 4).map((algo) => {
                // algorithmExecutionCounts is a Record<string, { total, success, failed }>, not an array
                const executionCount = algorithmExecutionCounts?.[algo.algorithmId]?.total || 0
                return (
                  <div
                    key={algo._id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-tertiary)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${algo.enabled ? 'bg-[var(--accent-lime)]' : 'bg-[var(--text-muted)]'}`} />
                      <div>
                        <p className="font-medium text-sm text-[var(--text-primary)]">{algo.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {algo.rules.length} rules • {algo.executionFrequency}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-[var(--text-primary)]">{executionCount}</p>
                      <p className="text-xs text-[var(--text-muted)]">executions</p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-[var(--text-muted)]">No algorithms configured</p>
              <Link
                href="/dashboard/ppc-algorithms"
                className="text-sm text-[var(--accent-electric)] hover:underline mt-2 inline-block"
              >
                Set up algorithms
              </Link>
            </div>
          )}
        </div>

        {/* AI Insights Summary */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">AI Insights</h3>
              {insightCounts && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[var(--accent-violet)]/15 text-[var(--accent-violet)]">
                  {(insightCounts.opportunity?.total || 0) + (insightCounts.risk?.total || 0) + (insightCounts.recommendation?.total || 0)} Active
                </span>
              )}
            </div>
            <Link
              href="/dashboard/ai-insights"
              className="text-sm text-[var(--accent-electric)] hover:underline"
            >
              View All
            </Link>
          </div>

          {topInsights?.length ? (
            <div className="space-y-3">
              {topInsights.map((insight) => (
                <div
                  key={insight._id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]"
                >
                  <div className={`p-1.5 rounded-lg flex-shrink-0 ${
                    insight.type === 'opportunity'
                      ? 'bg-[var(--accent-lime)]/15 text-[var(--accent-lime)]'
                      : insight.type === 'risk'
                      ? 'bg-[var(--accent-rose)]/15 text-[var(--accent-rose)]'
                      : 'bg-[var(--accent-electric)]/15 text-[var(--accent-electric)]'
                  }`}>
                    {insight.type === 'opportunity' ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    ) : insight.type === 'risk' ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] line-clamp-1">{insight.title}</p>
                    <p className="text-xs text-[var(--text-muted)] line-clamp-1">{insight.description}</p>
                  </div>
                  <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                    insight.priority >= 4
                      ? 'bg-[var(--accent-rose)]/15 text-[var(--accent-rose)]'
                      : 'bg-[var(--text-muted)]/15 text-[var(--text-muted)]'
                  }`}>
                    P{insight.priority}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <p className="text-sm text-[var(--text-muted)]">No insights generated yet</p>
              <Link
                href="/dashboard/ai-insights"
                className="text-sm text-[var(--accent-electric)] hover:underline mt-2 inline-block"
              >
                Generate Insights
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Account Structure */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-[var(--accent-electric)]/10">
              <svg className="w-5 h-5 text-[var(--accent-electric)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Campaigns</p>
              <p className="text-xl font-display font-bold text-[var(--text-primary)]">
                {loading ? '--' : metrics.campaigns}
              </p>
            </div>
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {loading ? 'Loading...' : `${metrics.enabledCampaigns} enabled, ${metrics.campaigns - metrics.enabledCampaigns} paused`}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-[var(--accent-lime)]/10">
              <svg className="w-5 h-5 text-[var(--accent-lime)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Ad Groups</p>
              <p className="text-xl font-display font-bold text-[var(--text-primary)]">
                {loading ? '--' : formatNumber(metrics.adGroups)}
              </p>
            </div>
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {loading ? 'Loading...' : `${formatNumber(metrics.enabledAdGroups)} enabled across all campaigns`}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-[var(--accent-violet)]/10">
              <svg className="w-5 h-5 text-[var(--accent-violet)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Keywords</p>
              <p className="text-xl font-display font-bold text-[var(--text-primary)]">
                {loading ? '--' : formatNumber(metrics.keywords)}
              </p>
            </div>
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {loading ? 'Loading...' : `${formatNumber(metrics.enabledKeywords)} enabled keywords`}
          </div>
        </div>
      </div>

      {/* Quality Score Distribution */}
      {metrics.qualityScores && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 mb-8">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Quality Score Distribution</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg bg-[var(--accent-rose)]/10">
              <p className="text-2xl font-display font-bold text-[var(--accent-rose)]">
                {formatNumber(metrics.qualityScores.score1to3)}
              </p>
              <p className="text-sm text-[var(--text-muted)]">Low (1-3)</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-[var(--accent-amber)]/10">
              <p className="text-2xl font-display font-bold text-[var(--accent-amber)]">
                {formatNumber(metrics.qualityScores.score4to6)}
              </p>
              <p className="text-sm text-[var(--text-muted)]">Medium (4-6)</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-[var(--accent-lime)]/10">
              <p className="text-2xl font-display font-bold text-[var(--accent-lime)]">
                {formatNumber(metrics.qualityScores.score7to10)}
              </p>
              <p className="text-sm text-[var(--text-muted)]">High (7-10)</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-[var(--bg-tertiary)]">
              <p className="text-2xl font-display font-bold text-[var(--text-secondary)]">
                {formatNumber(metrics.qualityScores.noScore)}
              </p>
              <p className="text-sm text-[var(--text-muted)]">No Score</p>
            </div>
          </div>
        </div>
      )}

      {/* Top Campaigns */}
      {data.structure?.topCampaigns && data.structure.topCampaigns.length > 0 && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 mb-8">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Top Campaigns by Ad Groups</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                  <th className="pb-3 font-medium">Campaign</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium text-right">Ad Groups</th>
                </tr>
              </thead>
              <tbody>
                {data.structure.topCampaigns.slice(0, 10).map((campaign, index) => (
                  <tr key={index} className="border-b border-[var(--border-subtle)] last:border-0">
                    <td className="py-3">
                      <p className="font-medium text-[var(--text-primary)]">{campaign.name}</p>
                    </td>
                    <td className="py-3 text-sm text-[var(--text-secondary)]">{campaign.type}</td>
                    <td className="py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                        campaign.status === 'Enabled'
                          ? 'bg-[var(--accent-lime)]/15 text-[var(--accent-lime)]'
                          : 'bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {campaign.status}
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono text-sm text-[var(--text-secondary)]">
                      {campaign.adGroupCount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <Link
              href="/dashboard/ppc-algorithms"
              className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] transition-colors group"
            >
              <div className="p-2 rounded-lg bg-[var(--accent-violet)]/10 group-hover:bg-[var(--accent-violet)]/20 transition-colors">
                <svg className="w-5 h-5 text-[var(--accent-violet)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-medium text-[var(--text-primary)]">PPC Algorithms</p>
                <p className="text-sm text-[var(--text-muted)]">View all 5 automation rules and their impact</p>
              </div>
              <svg className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent-violet)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <Link
              href="/dashboard/ai-insights"
              className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] transition-colors group"
            >
              <div className="p-2 rounded-lg bg-[var(--accent-amber)]/10 group-hover:bg-[var(--accent-amber)]/20 transition-colors">
                <svg className="w-5 h-5 text-[var(--accent-amber)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-medium text-[var(--text-primary)]">Generate AI Insights</p>
                <p className="text-sm text-[var(--text-muted)]">Get AI-powered optimization recommendations</p>
              </div>
              <svg className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent-amber)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <Link
              href="/dashboard/performance"
              className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] transition-colors group"
            >
              <div className="p-2 rounded-lg bg-[var(--accent-lime)]/10 group-hover:bg-[var(--accent-lime)]/20 transition-colors">
                <svg className="w-5 h-5 text-[var(--accent-lime)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-medium text-[var(--text-primary)]">Campaign Performance</p>
                <p className="text-sm text-[var(--text-muted)]">Analyze metrics across all campaigns</p>
              </div>
              <svg className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent-lime)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <Link
              href="/dashboard/linkedin"
              className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] transition-colors group"
            >
              <div className="p-2 rounded-lg bg-[#0A66C2]/10 group-hover:bg-[#0A66C2]/20 transition-colors">
                <svg className="w-5 h-5 text-[#0A66C2]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-medium text-[var(--text-primary)]">LinkedIn Ads</p>
                <p className="text-sm text-[var(--text-muted)]">Manage lead gen campaigns and forms</p>
              </div>
              <svg className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[#0A66C2] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Koenig Business Context */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Koenig Solutions</h3>
          <div className="mb-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Microsoft Partner of the Year 2025 | Leading IT Training Company
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-3 rounded-lg bg-[var(--bg-tertiary)]">
              <p className="text-2xl font-display font-bold text-[var(--accent-electric)]">729+</p>
              <p className="text-xs text-[var(--text-muted)]">IT Training Courses</p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-tertiary)]">
              <p className="text-2xl font-display font-bold text-[var(--accent-lime)]">10</p>
              <p className="text-xs text-[var(--text-muted)]">Target Countries</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Training Partners</p>
            <div className="flex flex-wrap gap-2">
              {['Microsoft', 'AWS', 'Cisco', 'Oracle', 'Google Cloud', 'VMware'].map((vendor) => (
                <span
                  key={vendor}
                  className="px-2 py-1 text-xs font-medium rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                >
                  {vendor}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
            <p className="text-xs text-[var(--text-muted)]">
              Countries: India, USA, UK, UAE, Singapore, Australia, Canada, Germany, Malaysia, Saudi Arabia
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
