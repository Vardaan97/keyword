'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { generateMarketingInsights, prepareMarketingData, type GeneratedInsight, type MarketingDataContext } from '@/lib/ai-insights'

// Insight type icons and colors
const INSIGHT_CONFIG = {
  opportunity: {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    color: 'var(--accent-lime)',
    bgColor: 'var(--accent-lime)',
    label: 'Opportunity'
  },
  risk: {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    color: 'var(--accent-rose)',
    bgColor: 'var(--accent-rose)',
    label: 'Risk'
  },
  recommendation: {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    color: 'var(--accent-electric)',
    bgColor: 'var(--accent-electric)',
    label: 'Recommendation'
  },
  anomaly: {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'var(--accent-amber)',
    bgColor: 'var(--accent-amber)',
    label: 'Anomaly'
  }
}

const PLATFORM_LABELS: Record<string, string> = {
  google_ads: 'Google Ads',
  linkedin: 'LinkedIn',
  cross_platform: 'Cross-Platform',
  algorithms: 'Algorithms'
}

// Priority indicator component
function PriorityBadge({ priority }: { priority: number }) {
  const colors = [
    'bg-[var(--text-muted)]/20 text-[var(--text-muted)]',
    'bg-[var(--text-secondary)]/20 text-[var(--text-secondary)]',
    'bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]',
    'bg-[var(--accent-rose)]/20 text-[var(--accent-rose)]',
    'bg-[var(--accent-rose)]/30 text-[var(--accent-rose)]'
  ]

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[priority - 1] || colors[2]}`}>
      P{priority}
    </span>
  )
}

// Individual insight card
function InsightCard({
  insight,
  onDismiss,
  onAction
}: {
  insight: GeneratedInsight & { _id?: string; status?: string }
  onDismiss?: (id: string) => void
  onAction?: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const config = INSIGHT_CONFIG[insight.type]

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="p-4 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `color-mix(in srgb, ${config.bgColor} 15%, transparent)` }}
          >
            <span style={{ color: config.color }}>{config.icon}</span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-xs font-medium px-2 py-0.5 rounded"
                style={{
                  backgroundColor: `color-mix(in srgb, ${config.bgColor} 15%, transparent)`,
                  color: config.color
                }}
              >
                {config.label}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {PLATFORM_LABELS[insight.platform]}
              </span>
              <PriorityBadge priority={insight.priority} />
              {insight.status === 'actioned' && (
                <span className="text-xs text-[var(--accent-lime)] flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Actioned
                </span>
              )}
            </div>
            <h3 className="font-medium text-[var(--text-primary)]">{insight.title}</h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-2">
              {insight.description}
            </p>
          </div>

          {/* Expand icon */}
          <svg
            className={`w-5 h-5 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-[var(--border-subtle)]">
          <div className="pt-4 space-y-4">
            {/* Full description */}
            <p className="text-sm text-[var(--text-secondary)]">{insight.description}</p>

            {/* Action items */}
            {insight.actionItems && insight.actionItems.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                  Action Items
                </h4>
                <ul className="space-y-1">
                  {insight.actionItems.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                      <span className="text-[var(--accent-electric)] mt-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Metrics */}
            {insight.metrics && Object.keys(insight.metrics).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                  Related Metrics
                </h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(insight.metrics).map(([key, value]) => (
                    <span
                      key={key}
                      className="px-2 py-1 bg-[var(--bg-tertiary)] rounded text-xs text-[var(--text-secondary)]"
                    >
                      <span className="text-[var(--text-muted)]">{key}:</span> {value}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Related entities */}
            {insight.relatedEntities && insight.relatedEntities.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                  Related Entities
                </h4>
                <div className="flex flex-wrap gap-2">
                  {insight.relatedEntities.map((entity, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-[var(--bg-tertiary)] rounded text-xs text-[var(--text-secondary)]"
                    >
                      {entity.type}: {entity.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            {insight._id && insight.status !== 'actioned' && insight.status !== 'dismissed' && (
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => onAction?.(insight._id!)}
                  className="px-3 py-1.5 bg-[var(--accent-electric)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
                >
                  Mark as Actioned
                </button>
                <button
                  onClick={() => onDismiss?.(insight._id!)}
                  className="px-3 py-1.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-sm font-medium rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Stats card component
function StatCard({
  label,
  value,
  icon,
  color = 'var(--text-primary)'
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  color?: string
}) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
        <div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
          <p className="text-sm text-[var(--text-muted)]">{label}</p>
        </div>
      </div>
    </div>
  )
}

export default function AIInsightsContent() {
  const [generating, setGenerating] = useState(false)
  const [filter, setFilter] = useState<'all' | 'opportunity' | 'risk' | 'recommendation' | 'anomaly'>('all')
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [localInsights, setLocalInsights] = useState<GeneratedInsight[]>([])
  const [lastGenerated, setLastGenerated] = useState<number | null>(null)

  // Convex queries
  const storedInsights = useQuery(api.aiInsights.listActive, { limit: 50 })
  const insightCounts = useQuery(api.aiInsights.countsByType)

  // Convex mutations
  const createInsights = useMutation(api.aiInsights.createBatch)
  const updateStatus = useMutation(api.aiInsights.updateStatus)
  const dismissInsight = useMutation(api.aiInsights.dismiss)

  // Combine stored and local insights
  const allInsights = [
    ...(storedInsights || []),
    ...localInsights.filter(local =>
      !storedInsights?.some(stored => stored.title === local.title)
    )
  ]

  // Filter insights
  const filteredInsights = allInsights.filter(insight => {
    if (filter !== 'all' && insight.type !== filter) return false
    if (platformFilter !== 'all' && insight.platform !== platformFilter) return false
    return true
  })

  // Generate new insights
  const handleGenerateInsights = async () => {
    setGenerating(true)
    try {
      // Prepare sample data (in production, this would come from actual API calls)
      const marketingData: MarketingDataContext = prepareMarketingData(
        {
          campaigns: Array(74).fill(null),
          adGroups: Array(198184).fill(null),
          performance: {
            spend: 4500000,
            impressions: 25000000,
            clicks: 450000,
            conversions: 1850
          }
        },
        {
          campaigns: Array(12).fill(null),
          analytics: {
            spend: 350000,
            impressions: 800000,
            clicks: 12000,
            leads: 245
          }
        }
      )

      // Add algorithm execution context
      marketingData.algorithmExecutions = [
        {
          algorithmId: 'tcpa_bidding',
          algorithmName: 'tCPA Bidding Rules',
          executionCount: 156,
          lastExecuted: Date.now() - 3600000,
          commonActions: ['tCPA set to 40%', 'tCPA set to 100%', 'tCPA boosted +10%']
        },
        {
          algorithmId: 'pause_resume',
          algorithmName: 'Auto Pause/Resume',
          executionCount: 42,
          lastExecuted: Date.now() - 86400000,
          commonActions: ['PAUSED (ROI < -40K)', 'RESUMED (SC released)']
        }
      ]

      const result = await generateMarketingInsights(marketingData)

      // Save to Convex
      if (result.insights.length > 0) {
        const insightsToStore = result.insights.map(insight => ({
          type: insight.type,
          platform: insight.platform,
          title: insight.title,
          description: insight.description,
          priority: insight.priority,
          relatedEntities: insight.relatedEntities || [],
          generatedBy: result.model || 'openrouter'
        }))

        await createInsights({ insights: insightsToStore })
      }

      setLocalInsights(result.insights)
      setLastGenerated(result.generatedAt)
    } catch (error) {
      console.error('Failed to generate insights:', error)
    } finally {
      setGenerating(false)
    }
  }

  // Handle marking as actioned
  const handleAction = async (id: string) => {
    await updateStatus({ id: id as any, status: 'actioned' })
  }

  // Handle dismissing
  const handleDismiss = async (id: string) => {
    await dismissInsight({ id: id as any })
  }

  // Calculate stats
  const stats = {
    total: allInsights.length,
    opportunities: allInsights.filter(i => i.type === 'opportunity').length,
    risks: allInsights.filter(i => i.type === 'risk').length,
    actioned: storedInsights?.filter(i => i.status === 'actioned').length || 0
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">
            AI Insights
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            AI-powered marketing recommendations from your Google Ads and LinkedIn data
          </p>
        </div>
        <button
          onClick={handleGenerateInsights}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[var(--accent-electric)] to-[var(--accent-violet)] text-white font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate Insights
            </>
          )}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Insights"
          value={stats.total}
          color="var(--accent-electric)"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          }
        />
        <StatCard
          label="Opportunities"
          value={stats.opportunities}
          color="var(--accent-lime)"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
        <StatCard
          label="Risks Identified"
          value={stats.risks}
          color="var(--accent-rose)"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
        <StatCard
          label="Actioned"
          value={stats.actioned}
          color="var(--accent-violet)"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--text-muted)]">Type:</span>
          <div className="flex gap-1">
            {['all', 'opportunity', 'risk', 'recommendation', 'anomaly'].map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type as any)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  filter === type
                    ? 'bg-[var(--accent-electric)] text-white'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--text-muted)]">Platform:</span>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg"
          >
            <option value="all">All Platforms</option>
            <option value="google_ads">Google Ads</option>
            <option value="linkedin">LinkedIn</option>
            <option value="cross_platform">Cross-Platform</option>
            <option value="algorithms">Algorithms</option>
          </select>
        </div>

        {lastGenerated && (
          <span className="text-xs text-[var(--text-muted)] ml-auto">
            Last generated: {new Date(lastGenerated).toLocaleString()}
          </span>
        )}
      </div>

      {/* Insights list */}
      {filteredInsights.length === 0 ? (
        <div className="text-center py-16 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">No insights yet</h3>
          <p className="text-[var(--text-secondary)] max-w-md mx-auto mb-6">
            Click &quot;Generate Insights&quot; to analyze your marketing data and get AI-powered recommendations.
          </p>
          <button
            onClick={handleGenerateInsights}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent-electric)] text-white font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Generate Insights
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* High priority section */}
          {filteredInsights.filter(i => i.priority >= 4).length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--accent-rose)] uppercase tracking-wide mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                High Priority
              </h2>
              <div className="space-y-3">
                {filteredInsights
                  .filter(i => i.priority >= 4)
                  .map((insight, idx) => (
                    <InsightCard
                      key={(insight as any)._id || `high-${idx}`}
                      insight={insight as GeneratedInsight & { _id?: string; status?: string }}
                      onAction={handleAction}
                      onDismiss={handleDismiss}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Other insights */}
          {filteredInsights.filter(i => i.priority < 4).length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3 mt-6">
                Other Insights
              </h2>
              <div className="space-y-3">
                {filteredInsights
                  .filter(i => i.priority < 4)
                  .map((insight, idx) => (
                    <InsightCard
                      key={(insight as any)._id || `other-${idx}`}
                      insight={insight as GeneratedInsight & { _id?: string; status?: string }}
                      onAction={handleAction}
                      onDismiss={handleDismiss}
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* How it works section */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-6 mt-8">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">How AI Insights Work</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-electric)]/15 flex items-center justify-center flex-shrink-0">
              <span className="text-[var(--accent-electric)] font-bold">1</span>
            </div>
            <div>
              <h3 className="font-medium text-[var(--text-primary)]">Data Collection</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                We aggregate your Google Ads and LinkedIn campaign data, including spend, conversions, and algorithm executions.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-violet)]/15 flex items-center justify-center flex-shrink-0">
              <span className="text-[var(--accent-violet)] font-bold">2</span>
            </div>
            <div>
              <h3 className="font-medium text-[var(--text-primary)]">AI Analysis</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                OpenRouter AI (GPT-4o-mini) analyzes patterns, identifies anomalies, and generates recommendations.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-lime)]/15 flex items-center justify-center flex-shrink-0">
              <span className="text-[var(--accent-lime)] font-bold">3</span>
            </div>
            <div>
              <h3 className="font-medium text-[var(--text-primary)]">Actionable Insights</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Insights are prioritized and include specific action items you can implement immediately.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
