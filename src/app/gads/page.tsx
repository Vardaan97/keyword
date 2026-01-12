"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useAppStore } from "@/lib/store"
import Link from "next/link"
import {
  GadsDataSummary,
  CampaignSummary,
  LowQualityKeyword
} from "@/types/google-ads-kb"
import { GoogleAdsStatus } from "@/components/google-ads-status"

type ViewTab = 'overview' | 'campaigns' | 'ad-groups' | 'keywords' | 'labels' | 'insights' | 'search'
type StatusFilter = 'all' | 'enabled' | 'paused' | 'ended'

// Extended campaign with labels for analysis
interface CampaignWithLabels extends CampaignSummary {
  labels?: string | null
}

// Label analysis type
interface LabelAnalysis {
  label: string
  campaignCount: number
  campaigns: { name: string; status: string; type: string | null }[]
}

// Ad Group type
interface AdGroupData {
  id: string
  name: string
  campaign_name: string
  campaign_type: string | null
  status: string
  max_cpc: number | null
  final_url: string | null
  keyword_count: number
}

export default function GadsPage() {
  const { theme } = useAppStore()

  // Data state
  const [summary, setSummary] = useState<GadsDataSummary | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignWithLabels[]>([])
  const [adGroups, setAdGroups] = useState<AdGroupData[]>([])
  const [lowQsKeywords, setLowQsKeywords] = useState<LowQualityKeyword[]>([])
  const [searchResults, setSearchResults] = useState<LowQualityKeyword[]>([])
  const [labelAnalysis, setLabelAnalysis] = useState<LabelAnalysis[]>([])

  // UI state
  const [activeTab, setActiveTab] = useState<ViewTab>('overview')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [maxQs, setMaxQs] = useState(5)
  const [adGroupSearch, setAdGroupSearch] = useState('')

  // Import state
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{
    success: boolean
    message: string
    details?: Record<string, number>
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load summary on mount
  useEffect(() => {
    loadSummary()
  }, [])

  const loadSummary = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch('/api/gads/summary')
      const data = await res.json()
      if (data.success) {
        setSummary(data.data)
      } else {
        setError(data.error || 'Failed to load summary')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load summary')
    } finally {
      setIsLoading(false)
    }
  }

  const loadCampaigns = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await fetch(`/api/gads/campaigns?${params}`)
      const data = await res.json()
      if (data.success) {
        setCampaigns(data.data)
        // Analyze labels
        analyzeLabels(data.data)
      }
    } catch (err) {
      console.error('Failed to load campaigns:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadAdGroups = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/gads/ad-groups/list')
      const data = await res.json()
      if (data.success) {
        setAdGroups(data.data)
      }
    } catch (err) {
      console.error('Failed to load ad groups:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const analyzeLabels = (campaignData: CampaignWithLabels[]) => {
    const labelMap = new Map<string, LabelAnalysis>()

    campaignData.forEach(campaign => {
      if (campaign.labels) {
        // Labels are separated by semicolons
        const labels = campaign.labels.split(';').map(l => l.trim()).filter(Boolean)
        labels.forEach(label => {
          if (!labelMap.has(label)) {
            labelMap.set(label, {
              label,
              campaignCount: 0,
              campaigns: []
            })
          }
          const analysis = labelMap.get(label)!
          analysis.campaignCount++
          analysis.campaigns.push({
            name: campaign.campaign_name,
            status: campaign.campaign_status,
            type: campaign.campaign_type
          })
        })
      }
    })

    setLabelAnalysis(
      Array.from(labelMap.values()).sort((a, b) => b.campaignCount - a.campaignCount)
    )
  }

  const loadLowQsKeywords = async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`/api/gads/keywords?mode=low_quality&maxQs=${maxQs}&limit=200`)
      const data = await res.json()
      if (data.success) {
        setLowQsKeywords(data.data)
      }
    } catch (err) {
      console.error('Failed to load keywords:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const searchKeywords = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    try {
      setIsLoading(true)
      const res = await fetch(`/api/gads/keywords?mode=search&q=${encodeURIComponent(searchQuery)}&limit=100`)
      const data = await res.json()
      if (data.success) {
        setSearchResults(data.data)
      }
    } catch (err) {
      console.error('Failed to search:', err)
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery])

  // Load data when tab changes
  useEffect(() => {
    if (activeTab === 'campaigns' || activeTab === 'labels' || activeTab === 'insights') loadCampaigns()
    else if (activeTab === 'ad-groups') loadAdGroups()
    else if (activeTab === 'keywords') loadLowQsKeywords()
  }, [activeTab, statusFilter, maxQs])

  // Handle file import
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    setImportProgress('Uploading file...')
    setImportResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      setImportProgress('Processing CSV and importing to database...')

      const res = await fetch('/api/gads/import', {
        method: 'POST',
        body: formData
      })

      const data = await res.json()

      if (data.success) {
        setImportResult({
          success: true,
          message: `Import completed successfully!`,
          details: data.data.imported
        })
        await loadSummary()
      } else {
        setImportResult({
          success: false,
          message: data.error || 'Import failed'
        })
      }
    } catch (err) {
      setImportResult({
        success: false,
        message: err instanceof Error ? err.message : 'Import failed'
      })
    } finally {
      setIsImporting(false)
      setImportProgress(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const formatNumber = (n: number | undefined | null) => {
    if (n === null || n === undefined) return '0'
    return n.toLocaleString()
  }

  // Filter campaigns based on type filter
  const filteredCampaigns = campaigns.filter(c => {
    if (typeFilter === 'all') return true
    return c.campaign_type === typeFilter
  })

  // Get unique campaign types for filter
  const campaignTypes = [...new Set(campaigns.map(c => c.campaign_type).filter((t): t is string => Boolean(t)))]

  return (
    <div
      className="min-h-screen transition-colors duration-300"
      style={{ backgroundColor: 'var(--bg-primary)' }}
      data-theme={theme}
    >
      {/* Header */}
      <header
        className="border-b sticky top-0 z-50 backdrop-blur-xl"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-default)'
        }}
      >
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-sm px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  color: 'var(--text-secondary)',
                  backgroundColor: 'var(--bg-tertiary)'
                }}
              >
                ← Back
              </Link>
              <h1
                className="text-2xl font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                Google Ads Knowledge Base
              </h1>
              {summary?.account && (
                <span
                  className="px-3 py-1 rounded-lg text-sm"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent-electric)' }}
                >
                  {summary.account.name} ({summary.account.customer_id})
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {/* Google Ads Status */}
              <GoogleAdsStatus compact />

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-default)'
                }}
              >
                {isImporting ? 'Importing...' : 'Import CSV'}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 overflow-x-auto">
            {(['overview', 'insights', 'campaigns', 'ad-groups', 'keywords', 'labels', 'search'] as ViewTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-4 py-2 rounded-t-lg font-medium transition-all whitespace-nowrap"
                style={{
                  backgroundColor: activeTab === tab ? 'var(--bg-tertiary)' : 'transparent',
                  color: activeTab === tab ? 'var(--accent-electric)' : 'var(--text-secondary)'
                }}
              >
                {tab === 'ad-groups' ? 'Ad Groups' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div
            className="mb-6 p-4 rounded-lg"
            style={{
              backgroundColor: 'rgba(251, 113, 133, 0.1)',
              border: '1px solid var(--accent-rose)'
            }}
          >
            <p style={{ color: 'var(--accent-rose)' }}>{error}</p>
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Campaigns', value: summary?.stats?.totalCampaigns || 0, color: 'var(--accent-electric)' },
                { label: 'Active', value: summary?.stats?.enabledCampaigns || 0, color: 'var(--accent-lime)' },
                { label: 'Ad Groups', value: summary?.stats?.totalAdGroups || 0, color: 'var(--accent-amber)' },
                { label: 'Keywords', value: summary?.stats?.totalKeywords || 0, color: 'var(--accent-violet)' }
              ].map(stat => (
                <div
                  key={stat.label}
                  className="p-6 rounded-xl"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-default)'
                  }}
                >
                  <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
                  <p className="text-3xl font-bold" style={{ color: stat.color }}>
                    {formatNumber(stat.value)}
                  </p>
                </div>
              ))}
            </div>

            {/* Campaign Types & Bid Strategies */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* Campaign Types */}
              <div
                className="p-6 rounded-xl"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-default)'
                }}
              >
                <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Campaign Types
                </h3>
                <div className="space-y-3">
                  {summary?.campaignTypes?.map((ct, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>{ct.type || 'Unknown'}</span>
                      <div className="flex items-center gap-3">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${Math.min(ct.count * 2, 150)}px`,
                            backgroundColor: ct.type === 'Search' ? 'var(--accent-electric)' :
                              ct.type === 'Display' ? 'var(--accent-amber)' :
                                ct.type === 'Performance Max' ? 'var(--accent-lime)' : 'var(--accent-violet)'
                          }}
                        />
                        <span className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
                          {ct.count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bid Strategies */}
              <div
                className="p-6 rounded-xl"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-default)'
                }}
              >
                <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Bid Strategies
                </h3>
                <div className="space-y-3">
                  {summary?.bidStrategies?.map((bs, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>{bs.strategy || 'Unknown'}</span>
                      <div className="flex items-center gap-3">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${Math.min(bs.count * 2, 150)}px`,
                            backgroundColor: bs.strategy?.includes('conversions') ? 'var(--accent-lime)' :
                              bs.strategy?.includes('clicks') ? 'var(--accent-electric)' :
                                bs.strategy?.includes('CPA') ? 'var(--accent-amber)' : 'var(--accent-violet)'
                          }}
                        />
                        <span className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
                          {bs.count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Status Breakdown & Insights */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* Campaign Status */}
              <div
                className="p-6 rounded-xl"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-default)'
                }}
              >
                <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Campaign Status
                </h3>
                <div className="flex gap-4">
                  <div className="flex-1 text-center p-4 rounded-lg" style={{ backgroundColor: 'rgba(163, 230, 53, 0.1)' }}>
                    <p className="text-2xl font-bold" style={{ color: 'var(--accent-lime)' }}>
                      {summary?.stats?.enabledCampaigns || 0}
                    </p>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Enabled</p>
                  </div>
                  <div className="flex-1 text-center p-4 rounded-lg" style={{ backgroundColor: 'rgba(251, 191, 36, 0.1)' }}>
                    <p className="text-2xl font-bold" style={{ color: 'var(--accent-amber)' }}>
                      {summary?.stats?.pausedCampaigns || 0}
                    </p>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Paused</p>
                  </div>
                  <div className="flex-1 text-center p-4 rounded-lg" style={{ backgroundColor: 'rgba(113, 113, 122, 0.1)' }}>
                    <p className="text-2xl font-bold" style={{ color: 'var(--text-muted)' }}>
                      {(summary?.stats?.totalCampaigns || 0) - (summary?.stats?.enabledCampaigns || 0) - (summary?.stats?.pausedCampaigns || 0)}
                    </p>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Ended</p>
                  </div>
                </div>
              </div>

              {/* Quick Insights */}
              <div
                className="p-6 rounded-xl"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-default)'
                }}
              >
                <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Quick Insights
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span style={{ color: summary?.stats?.lowQualityKeywords ? 'var(--accent-rose)' : 'var(--accent-lime)' }}>
                      {summary?.stats?.lowQualityKeywords ? '⚠' : '✓'}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {summary?.stats?.lowQualityKeywords || 0} keywords with low Quality Score (&lt;5)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--accent-electric)' }}>📊</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Avg {((summary?.stats?.totalKeywords || 0) / Math.max(summary?.stats?.totalAdGroups || 1, 1)).toFixed(1)} keywords per ad group
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--accent-amber)' }}>📈</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {((summary?.stats?.enabledCampaigns || 0) / Math.max(summary?.stats?.totalCampaigns || 1, 1) * 100).toFixed(0)}% campaigns active
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Last Sync */}
            {summary?.lastSync && (
              <div
                className="p-4 rounded-lg"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-default)'
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Last Sync</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>
                      {new Date(summary.lastSync.started_at).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className="px-3 py-1 rounded-lg text-sm font-medium"
                    style={{
                      backgroundColor: summary.lastSync.status === 'completed' ? 'rgba(163, 230, 53, 0.2)' : 'rgba(251, 191, 36, 0.2)',
                      color: summary.lastSync.status === 'completed' ? 'var(--accent-lime)' : 'var(--accent-amber)'
                    }}
                  >
                    {summary.lastSync.status === 'completed' ? '✓ Completed' : summary.lastSync.status}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Campaigns Tab */}
        {activeTab === 'campaigns' && (
          <div>
            {/* Filters */}
            <div className="flex gap-4 mb-6">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="px-3 py-2 rounded-lg"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-default)'
                }}
              >
                <option value="all">All Status</option>
                <option value="enabled">Enabled</option>
                <option value="paused">Paused</option>
                <option value="ended">Ended</option>
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 rounded-lg"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-default)'
                }}
              >
                <option value="all">All Types</option>
                {campaignTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>
                Showing {filteredCampaigns.length} of {campaigns.length} campaigns
              </span>
            </div>

            {/* Campaigns Table */}
            <div
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)'
              }}
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Campaign</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Type</th>
                      <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Ad Groups</th>
                      <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Keywords</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Bid Strategy</th>
                      <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Target CPA</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                          Loading campaigns...
                        </td>
                      </tr>
                    ) : filteredCampaigns.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                          No campaigns found.
                        </td>
                      </tr>
                    ) : (
                      filteredCampaigns.slice(0, 100).map((campaign, idx) => (
                        <tr
                          key={campaign.id || idx}
                          className="border-t hover:bg-opacity-50"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>
                            <div className="max-w-xs truncate" title={campaign.campaign_name}>
                              {campaign.campaign_name}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="px-2 py-1 rounded text-xs font-medium"
                              style={{
                                backgroundColor: campaign.campaign_type === 'Search' ? 'rgba(34, 211, 238, 0.2)' :
                                  campaign.campaign_type === 'Display' ? 'rgba(251, 191, 36, 0.2)' :
                                    campaign.campaign_type === 'Performance Max' ? 'rgba(163, 230, 53, 0.2)' : 'rgba(167, 139, 250, 0.2)',
                                color: campaign.campaign_type === 'Search' ? 'var(--accent-electric)' :
                                  campaign.campaign_type === 'Display' ? 'var(--accent-amber)' :
                                    campaign.campaign_type === 'Performance Max' ? 'var(--accent-lime)' : 'var(--accent-violet)'
                              }}
                            >
                              {campaign.campaign_type || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--accent-electric)' }}>
                            {formatNumber(campaign.ad_group_count)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--accent-lime)' }}>
                            {formatNumber(campaign.keyword_count)}
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                            {campaign.bid_strategy_type || '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--accent-amber)' }}>
                            {campaign.target_cpa ? `₹${formatNumber(campaign.target_cpa)}` : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="px-2 py-1 rounded text-xs font-medium"
                              style={{
                                backgroundColor: campaign.campaign_status?.toLowerCase() === 'enabled'
                                  ? 'rgba(163, 230, 53, 0.2)'
                                  : campaign.campaign_status?.toLowerCase() === 'paused'
                                    ? 'rgba(251, 191, 36, 0.2)'
                                    : 'rgba(113, 113, 122, 0.2)',
                                color: campaign.campaign_status?.toLowerCase() === 'enabled'
                                  ? 'var(--accent-lime)'
                                  : campaign.campaign_status?.toLowerCase() === 'paused'
                                    ? 'var(--accent-amber)'
                                    : 'var(--text-muted)'
                              }}
                            >
                              {campaign.campaign_status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {filteredCampaigns.length > 100 && (
                <div className="px-4 py-3 text-center" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}>
                  Showing first 100 of {filteredCampaigns.length} campaigns
                </div>
              )}
            </div>
          </div>
        )}

        {/* Insights Tab - Optimization Recommendations */}
        {activeTab === 'insights' && (
          <div className="space-y-6">
            {/* Account Health Score */}
            <div
              className="p-6 rounded-xl"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)'
              }}
            >
              <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                Account Health Analysis
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Active Campaigns</p>
                  <p className="text-2xl font-bold" style={{
                    color: ((summary?.stats?.enabledCampaigns || 0) / Math.max(summary?.stats?.totalCampaigns || 1, 1)) > 0.3
                      ? 'var(--accent-lime)'
                      : 'var(--accent-rose)'
                  }}>
                    {((summary?.stats?.enabledCampaigns || 0) / Math.max(summary?.stats?.totalCampaigns || 1, 1) * 100).toFixed(0)}%
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {summary?.stats?.enabledCampaigns} of {summary?.stats?.totalCampaigns} campaigns
                  </p>
                </div>
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Keywords with QS Data</p>
                  <p className="text-2xl font-bold" style={{ color: 'var(--accent-electric)' }}>
                    {lowQsKeywords.length}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Keywords below QS 5
                  </p>
                </div>
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Avg Keywords/Ad Group</p>
                  <p className="text-2xl font-bold" style={{ color: 'var(--accent-amber)' }}>
                    {((summary?.stats?.totalKeywords || 0) / Math.max(summary?.stats?.totalAdGroups || 1, 1)).toFixed(1)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Target: 5-20 per ad group
                  </p>
                </div>
              </div>
            </div>

            {/* Optimization Recommendations */}
            <div
              className="p-6 rounded-xl"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)'
              }}
            >
              <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                Optimization Recommendations
              </h3>
              <div className="space-y-4">
                {/* Ended Campaigns */}
                {((summary?.stats?.totalCampaigns || 0) - (summary?.stats?.enabledCampaigns || 0) - (summary?.stats?.pausedCampaigns || 0)) > 0 && (
                  <div className="p-4 rounded-lg border-l-4" style={{
                    backgroundColor: 'rgba(251, 191, 36, 0.1)',
                    borderColor: 'var(--accent-amber)'
                  }}>
                    <div className="flex items-start gap-3">
                      <span className="text-xl">📅</span>
                      <div>
                        <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {(summary?.stats?.totalCampaigns || 0) - (summary?.stats?.enabledCampaigns || 0) - (summary?.stats?.pausedCampaigns || 0)} Ended Campaigns
                        </h4>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                          Review ended campaigns. Some may have expired end dates that need updating,
                          or can be removed to reduce clutter.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Display Campaign Heavy */}
                {summary?.campaignTypes?.find(ct => ct.type === 'Display')?.count &&
                 (summary?.campaignTypes?.find(ct => ct.type === 'Display')?.count || 0) > (summary?.campaignTypes?.find(ct => ct.type === 'Search')?.count || 0) && (
                  <div className="p-4 rounded-lg border-l-4" style={{
                    backgroundColor: 'rgba(34, 211, 238, 0.1)',
                    borderColor: 'var(--accent-electric)'
                  }}>
                    <div className="flex items-start gap-3">
                      <span className="text-xl">📊</span>
                      <div>
                        <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          Display-Heavy Account ({summary?.campaignTypes?.find(ct => ct.type === 'Display')?.count} Display vs {summary?.campaignTypes?.find(ct => ct.type === 'Search')?.count} Search)
                        </h4>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                          Your account has more Display campaigns than Search. Consider if Search campaigns
                          could capture higher-intent traffic for better conversions.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Maximize Clicks Heavy */}
                {summary?.bidStrategies?.find(bs => bs.strategy?.includes('clicks'))?.count &&
                 (summary?.bidStrategies?.find(bs => bs.strategy?.includes('clicks'))?.count || 0) >
                 (summary?.bidStrategies?.find(bs => bs.strategy?.includes('conversions'))?.count || 0) && (
                  <div className="p-4 rounded-lg border-l-4" style={{
                    backgroundColor: 'rgba(163, 230, 53, 0.1)',
                    borderColor: 'var(--accent-lime)'
                  }}>
                    <div className="flex items-start gap-3">
                      <span className="text-xl">💰</span>
                      <div>
                        <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          Consider Conversion-Based Bidding
                        </h4>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                          {summary?.bidStrategies?.find(bs => bs.strategy?.includes('clicks'))?.count} campaigns use &quot;Maximize clicks&quot;.
                          If you have conversion tracking, consider switching to &quot;Maximize conversions&quot; or &quot;Target CPA&quot; for better ROI.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Low Quality Keywords */}
                {(summary?.stats?.lowQualityKeywords || 0) > 0 && (
                  <div className="p-4 rounded-lg border-l-4" style={{
                    backgroundColor: 'rgba(251, 113, 133, 0.1)',
                    borderColor: 'var(--accent-rose)'
                  }}>
                    <div className="flex items-start gap-3">
                      <span className="text-xl">⚠️</span>
                      <div>
                        <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {summary?.stats?.lowQualityKeywords} Low Quality Score Keywords
                        </h4>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                          Keywords with QS below 5 are paying more per click. Review the Keywords tab
                          to improve ad relevance, landing page experience, and expected CTR.
                        </p>
                        <button
                          onClick={() => setActiveTab('keywords')}
                          className="mt-2 text-sm font-medium"
                          style={{ color: 'var(--accent-electric)' }}
                        >
                          View Low QS Keywords →
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Labels Analysis Teaser */}
                {labelAnalysis.length > 0 && (
                  <div className="p-4 rounded-lg border-l-4" style={{
                    backgroundColor: 'rgba(167, 139, 250, 0.1)',
                    borderColor: 'var(--accent-violet)'
                  }}>
                    <div className="flex items-start gap-3">
                      <span className="text-xl">🏷️</span>
                      <div>
                        <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {labelAnalysis.length} Labels Found
                        </h4>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                          Labels like &quot;{labelAnalysis[0]?.label}&quot; help organize campaigns.
                          Review the Labels tab to understand your campaign structure.
                        </p>
                        <button
                          onClick={() => setActiveTab('labels')}
                          className="mt-2 text-sm font-medium"
                          style={{ color: 'var(--accent-electric)' }}
                        >
                          View Labels Analysis →
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Campaign Type Distribution Analysis */}
            <div
              className="p-6 rounded-xl"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)'
              }}
            >
              <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                Campaign Distribution Analysis
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                {/* By Type */}
                <div>
                  <h4 className="font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>By Type</h4>
                  <div className="space-y-2">
                    {summary?.campaignTypes?.map((ct, idx) => {
                      const percentage = ((ct.count / (summary?.stats?.totalCampaigns || 1)) * 100).toFixed(0)
                      return (
                        <div key={idx} className="flex items-center gap-3">
                          <div className="w-24 text-sm" style={{ color: 'var(--text-secondary)' }}>{ct.type || 'Unknown'}</div>
                          <div className="flex-1 h-6 rounded overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                            <div
                              className="h-full rounded transition-all"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: ct.type === 'Search' ? 'var(--accent-electric)' :
                                  ct.type === 'Display' ? 'var(--accent-amber)' :
                                  ct.type === 'Performance Max' ? 'var(--accent-lime)' : 'var(--accent-violet)'
                              }}
                            />
                          </div>
                          <span className="w-16 text-right font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
                            {ct.count} ({percentage}%)
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* By Status */}
                <div>
                  <h4 className="font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>By Status</h4>
                  <div className="space-y-2">
                    {[
                      { status: 'Enabled', count: summary?.stats?.enabledCampaigns || 0, color: 'var(--accent-lime)' },
                      { status: 'Paused', count: summary?.stats?.pausedCampaigns || 0, color: 'var(--accent-amber)' },
                      { status: 'Ended', count: (summary?.stats?.totalCampaigns || 0) - (summary?.stats?.enabledCampaigns || 0) - (summary?.stats?.pausedCampaigns || 0), color: 'var(--text-muted)' },
                    ].map((s, idx) => {
                      const percentage = ((s.count / (summary?.stats?.totalCampaigns || 1)) * 100).toFixed(0)
                      return (
                        <div key={idx} className="flex items-center gap-3">
                          <div className="w-24 text-sm" style={{ color: 'var(--text-secondary)' }}>{s.status}</div>
                          <div className="flex-1 h-6 rounded overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                            <div
                              className="h-full rounded transition-all"
                              style={{ width: `${percentage}%`, backgroundColor: s.color }}
                            />
                          </div>
                          <span className="w-16 text-right font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
                            {s.count} ({percentage}%)
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Ad Groups Tab */}
        {activeTab === 'ad-groups' && (
          <div>
            {/* Search/Filter */}
            <div className="flex gap-4 mb-6">
              <input
                type="text"
                value={adGroupSearch}
                onChange={(e) => setAdGroupSearch(e.target.value)}
                placeholder="Filter ad groups by name or URL..."
                className="flex-1 px-4 py-3 rounded-lg"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-default)'
                }}
              />
              <span className="self-center" style={{ color: 'var(--text-muted)' }}>
                {adGroups.filter(ag =>
                  !adGroupSearch ||
                  ag.name.toLowerCase().includes(adGroupSearch.toLowerCase()) ||
                  ag.final_url?.toLowerCase().includes(adGroupSearch.toLowerCase())
                ).length} ad groups
              </span>
            </div>

            {/* Ad Groups Table */}
            <div
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)'
              }}
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Ad Group</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Campaign</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Type</th>
                      <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Keywords</th>
                      <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Max CPC</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Final URL</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                          Loading ad groups...
                        </td>
                      </tr>
                    ) : adGroups.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                          No ad groups found.
                        </td>
                      </tr>
                    ) : (
                      adGroups
                        .filter(ag =>
                          !adGroupSearch ||
                          ag.name.toLowerCase().includes(adGroupSearch.toLowerCase()) ||
                          ag.final_url?.toLowerCase().includes(adGroupSearch.toLowerCase())
                        )
                        .slice(0, 100)
                        .map((ag, idx) => (
                          <tr
                            key={ag.id || idx}
                            className="border-t hover:bg-opacity-50"
                            style={{ borderColor: 'var(--border-subtle)' }}
                          >
                            <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>
                              <div className="max-w-xs truncate" title={ag.name}>
                                {ag.name}
                              </div>
                            </td>
                            <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                              <div className="max-w-32 truncate" title={ag.campaign_name}>
                                {ag.campaign_name}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="px-2 py-1 rounded text-xs font-medium"
                                style={{
                                  backgroundColor: ag.campaign_type === 'Search' ? 'rgba(34, 211, 238, 0.2)' :
                                    ag.campaign_type === 'Display' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(167, 139, 250, 0.2)',
                                  color: ag.campaign_type === 'Search' ? 'var(--accent-electric)' :
                                    ag.campaign_type === 'Display' ? 'var(--accent-amber)' : 'var(--accent-violet)'
                                }}
                              >
                                {ag.campaign_type || '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--accent-lime)' }}>
                              {formatNumber(ag.keyword_count)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--accent-amber)' }}>
                              {ag.max_cpc ? `₹${ag.max_cpc.toFixed(2)}` : '-'}
                            </td>
                            <td className="px-4 py-3">
                              {ag.final_url ? (
                                <a
                                  href={ag.final_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm hover:underline truncate block max-w-48"
                                  style={{ color: 'var(--accent-electric)' }}
                                  title={ag.final_url}
                                >
                                  {ag.final_url.replace(/^https?:\/\//, '').slice(0, 40)}...
                                </a>
                              ) : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="px-2 py-1 rounded text-xs font-medium"
                                style={{
                                  backgroundColor: ag.status?.toLowerCase() === 'enabled'
                                    ? 'rgba(163, 230, 53, 0.2)'
                                    : ag.status?.toLowerCase() === 'paused'
                                      ? 'rgba(251, 191, 36, 0.2)'
                                      : 'rgba(113, 113, 122, 0.2)',
                                  color: ag.status?.toLowerCase() === 'enabled'
                                    ? 'var(--accent-lime)'
                                    : ag.status?.toLowerCase() === 'paused'
                                      ? 'var(--accent-amber)'
                                      : 'var(--text-muted)'
                                }}
                              >
                                {ag.status}
                              </span>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
              {adGroups.filter(ag =>
                !adGroupSearch ||
                ag.name.toLowerCase().includes(adGroupSearch.toLowerCase()) ||
                ag.final_url?.toLowerCase().includes(adGroupSearch.toLowerCase())
              ).length > 100 && (
                <div className="px-4 py-3 text-center" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}>
                  Showing first 100 ad groups
                </div>
              )}
            </div>
          </div>
        )}

        {/* Labels Tab */}
        {activeTab === 'labels' && (
          <div className="space-y-6">
            <div
              className="p-6 rounded-xl"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)'
              }}
            >
              <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                Campaign Labels
              </h3>
              <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                Labels help organize and categorize campaigns. Below are all labels found in your account with their associated campaigns.
              </p>

              {isLoading ? (
                <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                  Loading labels...
                </div>
              ) : labelAnalysis.length === 0 ? (
                <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                  No labels found in this account.
                </div>
              ) : (
                <div className="space-y-4">
                  {labelAnalysis.map((label, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-lg"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-subtle)'
                      }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">🏷️</span>
                          <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {label.label}
                          </h4>
                        </div>
                        <span
                          className="px-3 py-1 rounded-full text-sm font-medium"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            color: 'var(--accent-electric)'
                          }}
                        >
                          {label.campaignCount} campaign{label.campaignCount !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Label meaning explanation */}
                      {label.label.toLowerCase().includes('pause') && (
                        <p className="text-sm mb-3 px-3 py-2 rounded" style={{
                          backgroundColor: 'rgba(251, 191, 36, 0.1)',
                          color: 'var(--accent-amber)'
                        }}>
                          💡 This label likely indicates campaigns scheduled to be paused or that have been marked for pausing.
                        </p>
                      )}
                      {label.label.toLowerCase().includes('competitor') && (
                        <p className="text-sm mb-3 px-3 py-2 rounded" style={{
                          backgroundColor: 'rgba(167, 139, 250, 0.1)',
                          color: 'var(--accent-violet)'
                        }}>
                          💡 This label indicates competitor targeting campaigns - bidding on competitor brand keywords.
                        </p>
                      )}

                      {/* Campaigns under this label */}
                      <div className="flex flex-wrap gap-2">
                        {label.campaigns.slice(0, 10).map((campaign, cIdx) => (
                          <span
                            key={cIdx}
                            className="px-2 py-1 rounded text-xs"
                            style={{
                              backgroundColor: campaign.status === 'Enabled'
                                ? 'rgba(163, 230, 53, 0.2)'
                                : campaign.status === 'Paused'
                                  ? 'rgba(251, 191, 36, 0.2)'
                                  : 'rgba(113, 113, 122, 0.2)',
                              color: campaign.status === 'Enabled'
                                ? 'var(--accent-lime)'
                                : campaign.status === 'Paused'
                                  ? 'var(--accent-amber)'
                                  : 'var(--text-muted)'
                            }}
                            title={`${campaign.name} (${campaign.type || 'Unknown type'})`}
                          >
                            {campaign.name.length > 30 ? campaign.name.slice(0, 30) + '...' : campaign.name}
                          </span>
                        ))}
                        {label.campaigns.length > 10 && (
                          <span className="px-2 py-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                            +{label.campaigns.length - 10} more
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Keywords Tab */}
        {activeTab === 'keywords' && (
          <div>
            {/* Filters */}
            <div className="flex gap-4 mb-6 items-center">
              <label style={{ color: 'var(--text-secondary)' }}>Max Quality Score:</label>
              <select
                value={maxQs}
                onChange={(e) => setMaxQs(parseInt(e.target.value))}
                className="px-3 py-2 rounded-lg"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-default)'
                }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <option key={n} value={n}>≤ {n}</option>
                ))}
              </select>
              <span style={{ color: 'var(--text-muted)' }}>
                {lowQsKeywords.length} keywords found
              </span>
            </div>

            {/* Low QS Keywords Table */}
            <div
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)'
              }}
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Keyword</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Campaign</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Ad Group</th>
                      <th className="text-center px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>QS</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Landing Page</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>CTR</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Ad Rel.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                          Loading keywords...
                        </td>
                      </tr>
                    ) : lowQsKeywords.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                          No keywords with Quality Score ≤ {maxQs} found.
                        </td>
                      </tr>
                    ) : (
                      lowQsKeywords.map((kw, idx) => (
                        <tr
                          key={kw.id || idx}
                          className="border-t"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>
                            {kw.keyword_text}
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                            <div className="max-w-32 truncate" title={kw.campaign_name}>
                              {kw.campaign_name}
                            </div>
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                            <div className="max-w-32 truncate" title={kw.ad_group_name}>
                              {kw.ad_group_name}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className="px-2 py-1 rounded font-bold"
                              style={{
                                backgroundColor: kw.quality_score && kw.quality_score <= 3
                                  ? 'rgba(251, 113, 133, 0.2)'
                                  : 'rgba(251, 191, 36, 0.2)',
                                color: kw.quality_score && kw.quality_score <= 3
                                  ? 'var(--accent-rose)'
                                  : 'var(--accent-amber)'
                              }}
                            >
                              {kw.quality_score || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              style={{
                                color: kw.landing_page_experience?.includes('Below')
                                  ? 'var(--accent-rose)'
                                  : kw.landing_page_experience?.includes('Above')
                                    ? 'var(--accent-lime)'
                                    : 'var(--text-muted)'
                              }}
                            >
                              {kw.landing_page_experience || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              style={{
                                color: kw.expected_ctr?.includes('Below')
                                  ? 'var(--accent-rose)'
                                  : kw.expected_ctr?.includes('Above')
                                    ? 'var(--accent-lime)'
                                    : 'var(--text-muted)'
                              }}
                            >
                              {kw.expected_ctr || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              style={{
                                color: kw.ad_relevance?.includes('Below')
                                  ? 'var(--accent-rose)'
                                  : kw.ad_relevance?.includes('Above')
                                    ? 'var(--accent-lime)'
                                    : 'var(--text-muted)'
                              }}
                            >
                              {kw.ad_relevance || '-'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div>
            {/* Search Input */}
            <div className="flex gap-4 mb-6">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchKeywords()}
                placeholder="Search keywords (e.g., 'azure', 'certification', 'training')"
                className="flex-1 px-4 py-3 rounded-lg"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-default)'
                }}
              />
              <button
                onClick={searchKeywords}
                disabled={!searchQuery.trim()}
                className="px-6 py-3 rounded-lg font-medium transition-all disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--accent-electric)',
                  color: 'var(--bg-primary)'
                }}
              >
                Search
              </button>
            </div>

            {/* Search Results Table */}
            <div
              className="rounded-xl overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)'
              }}
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Keyword</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Match Type</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Campaign</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Ad Group</th>
                      <th className="text-center px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>QS</th>
                      <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                          Searching...
                        </td>
                      </tr>
                    ) : searchResults.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                          {searchQuery ? 'No keywords found matching your search.' : 'Enter a search term to find keywords.'}
                        </td>
                      </tr>
                    ) : (
                      searchResults.map((kw, idx) => (
                        <tr
                          key={kw.id || idx}
                          className="border-t"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>
                            {kw.keyword_text}
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                            {kw.match_type || '-'}
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                            <div className="max-w-32 truncate" title={kw.campaign_name}>
                              {kw.campaign_name}
                            </div>
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                            <div className="max-w-32 truncate" title={kw.ad_group_name}>
                              {kw.ad_group_name}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {kw.quality_score ? (
                              <span
                                className="px-2 py-1 rounded font-bold"
                                style={{
                                  backgroundColor: kw.quality_score <= 3
                                    ? 'rgba(251, 113, 133, 0.2)'
                                    : kw.quality_score <= 5
                                      ? 'rgba(251, 191, 36, 0.2)'
                                      : 'rgba(163, 230, 53, 0.2)',
                                  color: kw.quality_score <= 3
                                    ? 'var(--accent-rose)'
                                    : kw.quality_score <= 5
                                      ? 'var(--accent-amber)'
                                      : 'var(--accent-lime)'
                                }}
                              >
                                {kw.quality_score}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="px-2 py-1 rounded text-xs font-medium"
                              style={{
                                backgroundColor: kw.keyword_status?.toLowerCase() === 'enabled'
                                  ? 'rgba(163, 230, 53, 0.2)'
                                  : 'rgba(251, 191, 36, 0.2)',
                                color: kw.keyword_status?.toLowerCase() === 'enabled'
                                  ? 'var(--accent-lime)'
                                  : 'var(--accent-amber)'
                              }}
                            >
                              {kw.keyword_status || '-'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
