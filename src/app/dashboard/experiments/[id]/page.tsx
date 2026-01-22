'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'

// Types
interface ExperimentArm {
  googleArmId: string
  name: string
  isControl: boolean
  campaignId: string
  trafficSplitPercent: number
  metrics?: {
    impressions: number
    clicks: number
    cost: number
    conversions: number
    conversionValue: number
    ctr: number
    cpc: number
    cpa: number
    roas: number
  }
}

interface ExperimentReport {
  experimentId: string
  experimentName: string
  hypothesis: string
  startDate: string
  endDate: string
  durationDays: number
  control: {
    name: string
    impressions: number
    clicks: number
    cost: number
    conversions: number
    conversionValue: number
    ctr: number
    cpc: number
    cpa: number
    roas: number
    conversionRate: number
  }
  treatment: {
    name: string
    impressions: number
    clicks: number
    cost: number
    conversions: number
    conversionValue: number
    ctr: number
    cpc: number
    cpa: number
    roas: number
    conversionRate: number
  }
  winner: 'control' | 'treatment' | 'inconclusive'
  lift: {
    conversions: number
    conversionRate: number
    costPerConversion: number
  }
  statisticalSignificance: number
  summary: string
  recommendation: string
  learnings: string[]
}

interface Experiment {
  googleExperimentId: string
  customerId: string
  name: string
  description?: string
  status: string
  type: string
  startDate?: string
  endDate?: string
  baseCampaignId?: string
  baseCampaignName?: string
  trafficSplitPercent?: number
  goals?: Array<{
    metric: string
    direction: string
  }>
  hypothesis?: string
  expectedOutcome?: string
  actualOutcome?: string
  learnings?: string
  reportGeneratedAt?: number
  arms?: ExperimentArm[]
}

// Status badge colors
const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  SETUP: { bg: 'bg-gray-500/15', text: 'text-gray-400', label: 'Setup' },
  INITIATED: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Initiated' },
  ENABLED: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'Running' },
  GRADUATED: { bg: 'bg-purple-500/15', text: 'text-purple-400', label: 'Graduated' },
  REMOVED: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Removed' },
  ENDED: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Ended' },
}

const WINNER_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  control: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Control Wins' },
  treatment: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'Treatment Wins' },
  inconclusive: { bg: 'bg-gray-500/15', text: 'text-gray-400', label: 'Inconclusive' },
}

export default function ExperimentDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const experimentId = params.id as string
  const customerId = searchParams.get('customerId')

  const [experiment, setExperiment] = useState<Experiment | null>(null)
  const [report, setReport] = useState<ExperimentReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingReport, setLoadingReport] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [editingHypothesis, setEditingHypothesis] = useState(false)
  const [hypothesisText, setHypothesisText] = useState('')
  const [learningsText, setLearningsText] = useState('')

  const fetchExperiment = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (customerId) params.set('customerId', customerId)
      params.set('withMetrics', 'true')

      const response = await fetch(`/api/gads/experiments?${params.toString()}`)
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch experiment')
      }

      const exp = result.data?.find((e: Experiment) => e.googleExperimentId === experimentId)
      if (!exp) {
        throw new Error('Experiment not found')
      }

      setExperiment(exp)
      setHypothesisText(exp.hypothesis || '')
      setLearningsText(exp.learnings || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch experiment')
    } finally {
      setLoading(false)
    }
  }, [experimentId, customerId])

  const fetchReport = useCallback(async () => {
    if (!customerId) return

    setLoadingReport(true)
    try {
      const response = await fetch(
        `/api/gads/experiments/${experimentId}/report?customerId=${customerId}`
      )
      const result = await response.json()

      if (result.success && result.data) {
        setReport(result.data)
      }
    } catch (err) {
      console.error('Failed to fetch report:', err)
    } finally {
      setLoadingReport(false)
    }
  }, [experimentId, customerId])

  useEffect(() => {
    fetchExperiment()
    fetchReport()
  }, [fetchExperiment, fetchReport])

  const generateReport = async () => {
    if (!customerId) return

    setGeneratingReport(true)
    try {
      const response = await fetch(
        `/api/gads/experiments/${experimentId}/report?customerId=${customerId}`,
        { method: 'POST' }
      )
      const result = await response.json()

      if (result.success) {
        setReport(result.data)
        fetchExperiment() // Refresh experiment data
      } else {
        throw new Error(result.error || 'Failed to generate report')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setGeneratingReport(false)
    }
  }

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatNumber = (value: number): string => {
    return new Intl.NumberFormat('en-IN').format(Math.round(value))
  }

  const formatPercent = (value: number): string => {
    const sign = value > 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--accent-electric)] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || !experiment) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center max-w-md mx-auto">
          <p className="text-red-400">{error || 'Experiment not found'}</p>
          <Link
            href="/dashboard/experiments"
            className="mt-4 inline-block text-[var(--accent-electric)] hover:underline"
          >
            Back to Experiments
          </Link>
        </div>
      </div>
    )
  }

  const statusConfig = STATUS_COLORS[experiment.status] || STATUS_COLORS.SETUP
  const isEnded = ['GRADUATED', 'ENDED', 'REMOVED'].includes(experiment.status)
  const winnerConfig = report?.winner ? WINNER_COLORS[report.winner] : null

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
        <div className="px-6 py-4">
          <Link
            href="/dashboard/experiments"
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1 mb-3"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Experiments
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-display font-semibold text-[var(--text-primary)]">
                  {experiment.name}
                </h1>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusConfig.bg} ${statusConfig.text}`}>
                  {statusConfig.label}
                </span>
                {winnerConfig && (
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${winnerConfig.bg} ${winnerConfig.text}`}>
                    {winnerConfig.label}
                  </span>
                )}
              </div>
              {experiment.description && (
                <p className="mt-1 text-sm text-[var(--text-muted)]">{experiment.description}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
                <span>Base Campaign: {experiment.baseCampaignName || 'Unknown'}</span>
                <span>Type: {experiment.type}</span>
                {experiment.startDate && <span>Started: {experiment.startDate}</span>}
                {experiment.endDate && <span>Ended: {experiment.endDate}</span>}
              </div>
            </div>

            {isEnded && !experiment.reportGeneratedAt && (
              <button
                onClick={generateReport}
                disabled={generatingReport}
                className="px-4 py-2 bg-[var(--accent-electric)] text-white rounded-lg font-medium text-sm hover:bg-[var(--accent-electric)]/90 transition-colors disabled:opacity-50"
              >
                {generatingReport ? 'Generating...' : 'Generate Report'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Report Summary */}
        {report && (
          <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)] p-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Report Summary</h2>

            {/* Winner Badge */}
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg mb-4 ${winnerConfig?.bg || 'bg-gray-500/15'}`}>
              {report.winner === 'treatment' && (
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {report.winner === 'control' && (
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span className={`font-medium ${winnerConfig?.text || 'text-gray-400'}`}>
                {report.winner === 'treatment' ? 'Treatment variant is the winner!' :
                 report.winner === 'control' ? 'Control performed better' :
                 'Results are inconclusive'}
              </span>
            </div>

            {/* Summary Text */}
            <p className="text-[var(--text-secondary)] mb-4">{report.summary}</p>

            {/* Key Metrics */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-[var(--bg-tertiary)] rounded-lg p-4 text-center">
                <p className="text-xs text-[var(--text-muted)]">Conversion Lift</p>
                <p className={`text-2xl font-bold ${report.lift.conversions >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatPercent(report.lift.conversions)}
                </p>
              </div>
              <div className="bg-[var(--bg-tertiary)] rounded-lg p-4 text-center">
                <p className="text-xs text-[var(--text-muted)]">CPA Change</p>
                <p className={`text-2xl font-bold ${report.lift.costPerConversion <= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatPercent(report.lift.costPerConversion)}
                </p>
              </div>
              <div className="bg-[var(--bg-tertiary)] rounded-lg p-4 text-center">
                <p className="text-xs text-[var(--text-muted)]">Statistical Significance</p>
                <p className={`text-2xl font-bold ${report.statisticalSignificance >= 95 ? 'text-green-400' : report.statisticalSignificance >= 80 ? 'text-amber-400' : 'text-red-400'}`}>
                  {report.statisticalSignificance.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Recommendation */}
            <div className="bg-[var(--bg-tertiary)] rounded-lg p-4">
              <p className="text-xs font-medium text-[var(--text-muted)] mb-1">Recommendation</p>
              <p className="text-[var(--text-primary)]">{report.recommendation}</p>
            </div>
          </div>
        )}

        {/* Metrics Comparison */}
        {report && (
          <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)] p-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Detailed Comparison</h2>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left py-3 px-4 text-[var(--text-muted)] font-medium">Metric</th>
                    <th className="text-right py-3 px-4 text-blue-400 font-medium">{report.control.name}</th>
                    <th className="text-right py-3 px-4 text-green-400 font-medium">{report.treatment.name}</th>
                    <th className="text-right py-3 px-4 text-[var(--text-muted)] font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <td className="py-3 px-4 text-[var(--text-secondary)]">Impressions</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{formatNumber(report.control.impressions)}</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{formatNumber(report.treatment.impressions)}</td>
                    <td className="py-3 px-4 text-right text-[var(--text-muted)]">
                      {formatPercent(((report.treatment.impressions - report.control.impressions) / report.control.impressions) * 100)}
                    </td>
                  </tr>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <td className="py-3 px-4 text-[var(--text-secondary)]">Clicks</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{formatNumber(report.control.clicks)}</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{formatNumber(report.treatment.clicks)}</td>
                    <td className="py-3 px-4 text-right text-[var(--text-muted)]">
                      {formatPercent(((report.treatment.clicks - report.control.clicks) / report.control.clicks) * 100)}
                    </td>
                  </tr>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <td className="py-3 px-4 text-[var(--text-secondary)]">CTR</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{(report.control.ctr * 100).toFixed(2)}%</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{(report.treatment.ctr * 100).toFixed(2)}%</td>
                    <td className="py-3 px-4 text-right text-[var(--text-muted)]">
                      {formatPercent(((report.treatment.ctr - report.control.ctr) / report.control.ctr) * 100)}
                    </td>
                  </tr>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <td className="py-3 px-4 text-[var(--text-secondary)]">Cost</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{formatCurrency(report.control.cost)}</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{formatCurrency(report.treatment.cost)}</td>
                    <td className="py-3 px-4 text-right text-[var(--text-muted)]">
                      {formatPercent(((report.treatment.cost - report.control.cost) / report.control.cost) * 100)}
                    </td>
                  </tr>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <td className="py-3 px-4 text-[var(--text-secondary)]">Conversions</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{formatNumber(report.control.conversions)}</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{formatNumber(report.treatment.conversions)}</td>
                    <td className={`py-3 px-4 text-right font-medium ${report.lift.conversions >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatPercent(report.lift.conversions)}
                    </td>
                  </tr>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <td className="py-3 px-4 text-[var(--text-secondary)]">CPA</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{formatCurrency(report.control.cpa)}</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{formatCurrency(report.treatment.cpa)}</td>
                    <td className={`py-3 px-4 text-right font-medium ${report.lift.costPerConversion <= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatPercent(report.lift.costPerConversion)}
                    </td>
                  </tr>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <td className="py-3 px-4 text-[var(--text-secondary)]">ROAS</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{report.control.roas.toFixed(2)}x</td>
                    <td className="py-3 px-4 text-right text-[var(--text-primary)]">{report.treatment.roas.toFixed(2)}x</td>
                    <td className="py-3 px-4 text-right text-[var(--text-muted)]">
                      {formatPercent(((report.treatment.roas - report.control.roas) / report.control.roas) * 100)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Learnings */}
        {report?.learnings && report.learnings.length > 0 && (
          <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)] p-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Key Learnings</h2>
            <ul className="space-y-2">
              {report.learnings.map((learning, index) => (
                <li key={index} className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-[var(--accent-electric)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                  </svg>
                  <span className="text-[var(--text-secondary)]">{learning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Hypothesis & Notes (Editable) */}
        <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Hypothesis & Notes</h2>
            <button
              onClick={() => setEditingHypothesis(!editingHypothesis)}
              className="text-sm text-[var(--accent-electric)] hover:underline"
            >
              {editingHypothesis ? 'Cancel' : 'Edit'}
            </button>
          </div>

          {editingHypothesis ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">
                  Hypothesis
                </label>
                <textarea
                  value={hypothesisText}
                  onChange={(e) => setHypothesisText(e.target.value)}
                  placeholder="What is the hypothesis for this experiment?"
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-electric)]"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">
                  Learnings
                </label>
                <textarea
                  value={learningsText}
                  onChange={(e) => setLearningsText(e.target.value)}
                  placeholder="What did you learn from this experiment?"
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-electric)]"
                  rows={3}
                />
              </div>
              <button
                onClick={() => {
                  // TODO: Save to Convex
                  setEditingHypothesis(false)
                }}
                className="px-4 py-2 bg-[var(--accent-electric)] text-white rounded-lg text-sm font-medium hover:bg-[var(--accent-electric)]/90 transition-colors"
              >
                Save Changes
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-[var(--text-muted)] mb-1">Hypothesis</p>
                <p className="text-[var(--text-secondary)]">
                  {experiment.hypothesis || 'No hypothesis recorded'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--text-muted)] mb-1">Learnings</p>
                <p className="text-[var(--text-secondary)]">
                  {experiment.learnings || 'No learnings recorded yet'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Experiment Goals */}
        {experiment.goals && experiment.goals.length > 0 && (
          <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)] p-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Experiment Goals</h2>
            <div className="flex flex-wrap gap-2">
              {experiment.goals.map((goal, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-tertiary)] rounded-lg"
                >
                  {goal.direction === 'INCREASE' ? (
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  )}
                  <span className="text-sm text-[var(--text-secondary)]">
                    {goal.direction === 'INCREASE' ? 'Increase' : 'Decrease'} {goal.metric.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
