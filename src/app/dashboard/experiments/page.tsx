'use client'

import { useState, useEffect, useCallback } from 'react'
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
  lift?: {
    conversions: number
    conversionRate: number
    costPerConversion: number
  }
  statisticalSignificance?: number
  winner?: 'control' | 'treatment' | 'inconclusive'
  isManual?: boolean
}

interface ExperimentsResponse {
  success: boolean
  data?: {
    experiments: Experiment[]
    total: number
    unfilteredTotal: number
    accounts: Array<{ accountName: string; customerId: string; total: number }>
  }
  error?: string
}

// Google Ads accounts
const GOOGLE_ADS_ACCOUNTS = [
  { id: 'flexi', name: 'Flexi', customerId: '7731993943' },
  { id: 'bouquet-inr', name: 'Bouquet INR', customerId: '5aborque3172' },
  { id: 'bouquet-inr-2', name: 'Bouquet INR - 2', customerId: '1234567890' },
]

// Experiment types
const EXPERIMENT_TYPES = [
  { value: 'SEARCH_CUSTOM', label: 'Search Campaign' },
  { value: 'DISPLAY_CUSTOM', label: 'Display Campaign' },
  { value: 'PERFORMANCE_MAX_CUSTOM', label: 'Performance Max' },
  { value: 'VIDEO_CUSTOM', label: 'Video Campaign' },
  { value: 'SHOPPING_CUSTOM', label: 'Shopping Campaign' },
]

// Metric options for goals
const METRIC_OPTIONS = [
  { value: 'CLICKS', label: 'Clicks' },
  { value: 'CONVERSIONS', label: 'Conversions' },
  { value: 'COST_PER_CONVERSION', label: 'Cost per Conversion' },
  { value: 'CTR', label: 'Click-through Rate' },
  { value: 'CONVERSION_RATE', label: 'Conversion Rate' },
  { value: 'ROAS', label: 'Return on Ad Spend' },
  { value: 'IMPRESSIONS', label: 'Impressions' },
]

// Status badge colors
const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  SETUP: { bg: 'bg-gray-500/15', text: 'text-gray-400', label: 'Setup' },
  INITIATED: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Initiated' },
  ENABLED: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'Running' },
  GRADUATED: { bg: 'bg-purple-500/15', text: 'text-purple-400', label: 'Graduated' },
  REMOVED: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Removed' },
  ENDED: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Ended' },
  TRACKING: { bg: 'bg-indigo-500/15', text: 'text-indigo-400', label: 'Tracking' },
}

// Winner badge colors
const WINNER_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  control: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Control Wins' },
  treatment: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'Treatment Wins' },
  inconclusive: { bg: 'bg-gray-500/15', text: 'text-gray-400', label: 'Inconclusive' },
}

// Add Experiment Modal Component
function AddExperimentModal({
  isOpen,
  onClose,
  onSubmit,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: NewExperimentData) => Promise<void>
}) {
  const [formData, setFormData] = useState<NewExperimentData>({
    name: '',
    description: '',
    customerId: GOOGLE_ADS_ACCOUNTS[0].customerId,
    type: 'SEARCH_CUSTOM',
    baseCampaignName: '',
    hypothesis: '',
    expectedOutcome: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    trafficSplitPercent: 50,
    goals: [{ metric: 'CONVERSIONS', direction: 'INCREASE' }],
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit(formData)
      onClose()
      setFormData({
        name: '',
        description: '',
        customerId: GOOGLE_ADS_ACCOUNTS[0].customerId,
        type: 'SEARCH_CUSTOM',
        baseCampaignName: '',
        hypothesis: '',
        expectedOutcome: '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        trafficSplitPercent: 50,
        goals: [{ metric: 'CONVERSIONS', direction: 'INCREASE' }],
      })
    } catch (err) {
      console.error('Failed to add experiment:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const addGoal = () => {
    setFormData({
      ...formData,
      goals: [...formData.goals, { metric: 'CLICKS', direction: 'INCREASE' }],
    })
  }

  const removeGoal = (index: number) => {
    setFormData({
      ...formData,
      goals: formData.goals.filter((_, i) => i !== index),
    })
  }

  const updateGoal = (index: number, field: 'metric' | 'direction', value: string) => {
    const newGoals = [...formData.goals]
    newGoals[index] = { ...newGoals[index], [field]: value }
    setFormData({ ...formData, goals: newGoals })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)] w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        <div className="sticky top-0 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Add New Experiment</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wide">Basic Information</h3>

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Experiment Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Target CPA vs Manual Bidding Test"
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-electric)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of what you're testing"
                rows={2}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-electric)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Account *
                </label>
                <select
                  value={formData.customerId}
                  onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-electric)]"
                >
                  {GOOGLE_ADS_ACCOUNTS.map((acc) => (
                    <option key={acc.id} value={acc.customerId}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Experiment Type *
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-electric)]"
                >
                  {EXPERIMENT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Base Campaign Name
              </label>
              <input
                type="text"
                value={formData.baseCampaignName}
                onChange={(e) => setFormData({ ...formData, baseCampaignName: e.target.value })}
                placeholder="Name of the campaign being tested"
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-electric)]"
              />
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wide">Schedule</h3>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-electric)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-electric)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Traffic Split %
                </label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={formData.trafficSplitPercent}
                  onChange={(e) => setFormData({ ...formData, trafficSplitPercent: parseInt(e.target.value) || 50 })}
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-electric)]"
                />
              </div>
            </div>
          </div>

          {/* Hypothesis */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wide">Hypothesis & Goals</h3>

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Hypothesis *
              </label>
              <textarea
                required
                value={formData.hypothesis}
                onChange={(e) => setFormData({ ...formData, hypothesis: e.target.value })}
                placeholder="e.g., Switching to Target CPA bidding will increase conversions by 15% while maintaining similar CPA"
                rows={3}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-electric)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Expected Outcome
              </label>
              <textarea
                value={formData.expectedOutcome}
                onChange={(e) => setFormData({ ...formData, expectedOutcome: e.target.value })}
                placeholder="What do you expect to happen?"
                rows={2}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-electric)]"
              />
            </div>

            {/* Goals */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-[var(--text-secondary)]">
                  Success Metrics
                </label>
                <button
                  type="button"
                  onClick={addGoal}
                  className="text-xs text-[var(--accent-electric)] hover:underline"
                >
                  + Add Goal
                </button>
              </div>
              <div className="space-y-2">
                {formData.goals.map((goal, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <select
                      value={goal.direction}
                      onChange={(e) => updateGoal(index, 'direction', e.target.value)}
                      className="px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-electric)]"
                    >
                      <option value="INCREASE">Increase</option>
                      <option value="DECREASE">Decrease</option>
                    </select>
                    <select
                      value={goal.metric}
                      onChange={(e) => updateGoal(index, 'metric', e.target.value)}
                      className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-electric)]"
                    >
                      {METRIC_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {formData.goals.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeGoal(index)}
                        className="p-2 text-red-400 hover:text-red-300"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-300">
                <p className="font-medium">Manual Tracking Mode</p>
                <p className="mt-1 text-blue-300/80">
                  This experiment will be tracked manually. When you create a matching experiment in Google Ads,
                  the metrics will automatically sync during the next refresh cycle (every 6 hours).
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-[var(--accent-electric)] text-white rounded-lg font-medium hover:bg-[var(--accent-electric)]/90 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Experiment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface NewExperimentData {
  name: string
  description: string
  customerId: string
  type: string
  baseCampaignName: string
  hypothesis: string
  expectedOutcome: string
  startDate: string
  endDate: string
  trafficSplitPercent: number
  goals: Array<{ metric: string; direction: string }>
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [manualExperiments, setManualExperiments] = useState<Experiment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [allAccounts, setAllAccounts] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [generatingReport, setGeneratingReport] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const fetchExperiments = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (allAccounts) params.set('allAccounts', 'true')
      if (statusFilter !== 'all') params.set('status', statusFilter)
      params.set('withMetrics', 'true')

      const response = await fetch(`/api/gads/experiments?${params.toString()}`)
      const result: ExperimentsResponse = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch experiments')
      }

      // API returns { data: { experiments: [...] } }
      setExperiments(result.data?.experiments || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch experiments')
      setExperiments([])
    } finally {
      setLoading(false)
    }
  }, [allAccounts, statusFilter])

  useEffect(() => {
    fetchExperiments()
  }, [fetchExperiments])

  const generateReport = async (experimentId: string, customerId: string) => {
    setGeneratingReport(experimentId)
    try {
      const response = await fetch(
        `/api/gads/experiments/${experimentId}/report?customerId=${customerId}`,
        { method: 'POST' }
      )
      const result = await response.json()

      if (result.success) {
        // Refresh experiments to get updated report status
        fetchExperiments()
      } else {
        throw new Error(result.error || 'Failed to generate report')
      }
    } catch (err) {
      console.error('Report generation error:', err)
      alert(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setGeneratingReport(null)
    }
  }

  // Load manual experiments from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('manual_experiments')
    if (stored) {
      try {
        setManualExperiments(JSON.parse(stored))
      } catch (e) {
        console.error('Failed to load manual experiments:', e)
      }
    }
  }, [])

  // Add new experiment
  const addExperiment = async (data: NewExperimentData) => {
    const newExperiment: Experiment = {
      googleExperimentId: `manual_${Date.now()}`,
      customerId: data.customerId,
      name: data.name,
      description: data.description,
      status: 'TRACKING',
      type: data.type,
      startDate: data.startDate,
      endDate: data.endDate || undefined,
      baseCampaignName: data.baseCampaignName,
      trafficSplitPercent: data.trafficSplitPercent,
      goals: data.goals,
      hypothesis: data.hypothesis,
      expectedOutcome: data.expectedOutcome,
      isManual: true,
    }

    const updated = [...manualExperiments, newExperiment]
    setManualExperiments(updated)
    localStorage.setItem('manual_experiments', JSON.stringify(updated))
  }

  // Delete manual experiment
  const deleteManualExperiment = (experimentId: string) => {
    if (!confirm('Are you sure you want to delete this experiment?')) return

    const updated = manualExperiments.filter((e) => e.googleExperimentId !== experimentId)
    setManualExperiments(updated)
    localStorage.setItem('manual_experiments', JSON.stringify(updated))
  }

  // Combine API and manual experiments
  const allExperiments = [...experiments, ...manualExperiments]

  // Calculate experiment progress
  const getProgress = (exp: Experiment): { days: number; total: number; percent: number } => {
    if (!exp.startDate) return { days: 0, total: 0, percent: 0 }

    const start = new Date(exp.startDate)
    const end = exp.endDate ? new Date(exp.endDate) : new Date()
    const now = new Date()

    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    const elapsedDays = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    const percent = Math.min(100, Math.round((elapsedDays / totalDays) * 100))

    return { days: Math.max(0, elapsedDays), total: totalDays, percent }
  }

  // Format currency
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value)
  }

  // Format number
  const formatNumber = (value: number): string => {
    return new Intl.NumberFormat('en-IN').format(Math.round(value))
  }

  // Format percentage
  const formatPercent = (value: number): string => {
    const sign = value > 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
  }

  // Get control and treatment arms
  const getArms = (exp: Experiment): { control?: ExperimentArm; treatment?: ExperimentArm } => {
    if (!exp.arms) return {}
    return {
      control: exp.arms.find(a => a.isControl),
      treatment: exp.arms.find(a => !a.isControl),
    }
  }

  // Stats summary (use allExperiments to include manual ones)
  const stats = {
    total: allExperiments.length,
    running: allExperiments.filter(e => e.status === 'ENABLED' || e.status === 'TRACKING').length,
    ended: allExperiments.filter(e => ['GRADUATED', 'ENDED', 'REMOVED'].includes(e.status)).length,
    needingReports: allExperiments.filter(
      e => ['GRADUATED', 'ENDED'].includes(e.status) && !e.reportGeneratedAt
    ).length,
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Add Experiment Modal */}
      <AddExperimentModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={addExperiment}
      />

      {/* Header */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-semibold text-[var(--text-primary)]">
                A/B Experiments
              </h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Track and analyze Google Ads experiments and A/B tests
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg font-medium text-sm hover:bg-[var(--bg-hover)] transition-colors border border-[var(--border-subtle)]"
              >
                + Add Experiment
              </button>
              <button
                onClick={() => fetchExperiments()}
                disabled={loading}
                className="px-4 py-2 bg-[var(--accent-electric)] text-white rounded-lg font-medium text-sm hover:bg-[var(--accent-electric)]/90 transition-colors disabled:opacity-50"
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-4 flex flex-wrap gap-3">
            {/* All Accounts Toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allAccounts}
                onChange={(e) => setAllAccounts(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--accent-electric)] focus:ring-[var(--accent-electric)] focus:ring-offset-0"
              />
              <span className="text-sm text-[var(--text-secondary)]">All Accounts</span>
            </label>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-electric)]"
            >
              <option value="all">All Statuses</option>
              <option value="ENABLED">Running</option>
              <option value="GRADUATED">Graduated</option>
              <option value="ENDED">Ended</option>
              <option value="SETUP">Setup</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border-subtle)]">
          <p className="text-sm text-[var(--text-muted)]">Total Experiments</p>
          <p className="text-2xl font-semibold text-[var(--text-primary)] mt-1">{stats.total}</p>
        </div>
        <div className="bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border-subtle)]">
          <p className="text-sm text-[var(--text-muted)]">Currently Running</p>
          <p className="text-2xl font-semibold text-green-400 mt-1">{stats.running}</p>
        </div>
        <div className="bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border-subtle)]">
          <p className="text-sm text-[var(--text-muted)]">Completed</p>
          <p className="text-2xl font-semibold text-purple-400 mt-1">{stats.ended}</p>
        </div>
        <div className="bg-[var(--bg-secondary)] rounded-xl p-4 border border-[var(--border-subtle)]">
          <p className="text-sm text-[var(--text-muted)]">Needs Report</p>
          <p className="text-2xl font-semibold text-amber-400 mt-1">{stats.needingReports}</p>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-[var(--accent-electric)] border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
            <p className="text-red-400">{error}</p>
            <button
              onClick={() => fetchExperiments()}
              className="mt-2 text-sm text-[var(--accent-electric)] hover:underline"
            >
              Try Again
            </button>
          </div>
        ) : allExperiments.length === 0 ? (
          <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)] p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-[var(--text-primary)]">No Experiments Found</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              No A/B experiments have been created yet. Click &quot;Add Experiment&quot; to start tracking one.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 px-4 py-2 bg-[var(--accent-electric)] text-white rounded-lg font-medium text-sm hover:bg-[var(--accent-electric)]/90 transition-colors"
            >
              + Add Your First Experiment
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {allExperiments.map((exp) => {
              const progress = getProgress(exp)
              const { control, treatment } = getArms(exp)
              const statusConfig = STATUS_COLORS[exp.status] || STATUS_COLORS.SETUP
              const isEnded = ['GRADUATED', 'ENDED', 'REMOVED'].includes(exp.status)
              const winnerConfig = exp.winner ? WINNER_COLORS[exp.winner] : null
              const accountName = GOOGLE_ADS_ACCOUNTS.find(a => a.customerId === exp.customerId)?.name || exp.customerId

              return (
                <div
                  key={exp.googleExperimentId}
                  className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)] overflow-hidden"
                >
                  {/* Experiment Header */}
                  <div className="p-4 border-b border-[var(--border-subtle)]">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-medium text-[var(--text-primary)]">
                            {exp.name}
                          </h3>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusConfig.bg} ${statusConfig.text}`}>
                            {statusConfig.label}
                          </span>
                          {exp.isManual && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-500/15 text-indigo-400">
                              Manual
                            </span>
                          )}
                          {winnerConfig && (
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${winnerConfig.bg} ${winnerConfig.text}`}>
                              {winnerConfig.label}
                            </span>
                          )}
                        </div>
                        {exp.description && (
                          <p className="mt-1 text-sm text-[var(--text-muted)]">{exp.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
                          <span>Account: {accountName}</span>
                          <span>Base Campaign: {exp.baseCampaignName || 'Unknown'}</span>
                          <span>Type: {exp.type}</span>
                          {exp.trafficSplitPercent && (
                            <span>Traffic Split: {exp.trafficSplitPercent}%</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {exp.isManual && (
                          <button
                            onClick={() => deleteManualExperiment(exp.googleExperimentId)}
                            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Delete experiment"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                        {isEnded && !exp.reportGeneratedAt && !exp.isManual && (
                          <button
                            onClick={() => generateReport(exp.googleExperimentId, exp.customerId)}
                            disabled={generatingReport === exp.googleExperimentId}
                            className="px-3 py-1.5 bg-[var(--accent-electric)] text-white rounded-lg text-sm font-medium hover:bg-[var(--accent-electric)]/90 transition-colors disabled:opacity-50"
                          >
                            {generatingReport === exp.googleExperimentId ? 'Generating...' : 'Generate Report'}
                          </button>
                        )}
                        {exp.reportGeneratedAt && (
                          <Link
                            href={`/dashboard/experiments/${exp.googleExperimentId}?customerId=${exp.customerId}`}
                            className="px-3 py-1.5 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg text-sm font-medium hover:bg-[var(--bg-hover)] transition-colors"
                          >
                            View Report
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {exp.startDate && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
                          <span>
                            {exp.startDate} — {exp.endDate || 'Ongoing'}
                          </span>
                          <span>
                            Day {progress.days} of {progress.total}
                          </span>
                        </div>
                        <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${isEnded ? 'bg-purple-500' : 'bg-[var(--accent-electric)]'}`}
                            style={{ width: `${progress.percent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Metrics Comparison */}
                  {control?.metrics && treatment?.metrics && (
                    <div className="p-4">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Control */}
                        <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-blue-400" />
                            <span className="text-sm font-medium text-[var(--text-primary)]">
                              {control.name} (Control)
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-[var(--text-muted)]">Impressions</p>
                              <p className="text-[var(--text-primary)] font-medium">
                                {formatNumber(control.metrics.impressions)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--text-muted)]">Clicks</p>
                              <p className="text-[var(--text-primary)] font-medium">
                                {formatNumber(control.metrics.clicks)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--text-muted)]">Conversions</p>
                              <p className="text-[var(--text-primary)] font-medium">
                                {formatNumber(control.metrics.conversions)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--text-muted)]">Cost</p>
                              <p className="text-[var(--text-primary)] font-medium">
                                {formatCurrency(control.metrics.cost)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--text-muted)]">CTR</p>
                              <p className="text-[var(--text-primary)] font-medium">
                                {(control.metrics.ctr * 100).toFixed(2)}%
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--text-muted)]">CPA</p>
                              <p className="text-[var(--text-primary)] font-medium">
                                {formatCurrency(control.metrics.cpa)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Treatment */}
                        <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-green-400" />
                            <span className="text-sm font-medium text-[var(--text-primary)]">
                              {treatment.name} (Treatment)
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-[var(--text-muted)]">Impressions</p>
                              <p className="text-[var(--text-primary)] font-medium">
                                {formatNumber(treatment.metrics.impressions)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--text-muted)]">Clicks</p>
                              <p className="text-[var(--text-primary)] font-medium">
                                {formatNumber(treatment.metrics.clicks)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--text-muted)]">Conversions</p>
                              <p className="text-[var(--text-primary)] font-medium">
                                {formatNumber(treatment.metrics.conversions)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--text-muted)]">Cost</p>
                              <p className="text-[var(--text-primary)] font-medium">
                                {formatCurrency(treatment.metrics.cost)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--text-muted)]">CTR</p>
                              <p className="text-[var(--text-primary)] font-medium">
                                {(treatment.metrics.ctr * 100).toFixed(2)}%
                              </p>
                            </div>
                            <div>
                              <p className="text-[var(--text-muted)]">CPA</p>
                              <p className="text-[var(--text-primary)] font-medium">
                                {formatCurrency(treatment.metrics.cpa)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Lift Summary */}
                      {exp.lift && (
                        <div className="mt-4 p-3 bg-[var(--bg-tertiary)] rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-6">
                              <div>
                                <p className="text-xs text-[var(--text-muted)]">Conversion Lift</p>
                                <p className={`text-lg font-semibold ${exp.lift.conversions >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {formatPercent(exp.lift.conversions)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-[var(--text-muted)]">CPA Change</p>
                                <p className={`text-lg font-semibold ${exp.lift.costPerConversion <= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {formatPercent(exp.lift.costPerConversion)}
                                </p>
                              </div>
                            </div>
                            {exp.statisticalSignificance !== undefined && (
                              <div className="text-right">
                                <p className="text-xs text-[var(--text-muted)]">Statistical Significance</p>
                                <div className="flex items-center gap-2">
                                  <div className="w-24 h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${exp.statisticalSignificance >= 95 ? 'bg-green-500' : exp.statisticalSignificance >= 80 ? 'bg-amber-500' : 'bg-red-500'}`}
                                      style={{ width: `${exp.statisticalSignificance}%` }}
                                    />
                                  </div>
                                  <span className={`text-sm font-medium ${exp.statisticalSignificance >= 95 ? 'text-green-400' : exp.statisticalSignificance >= 80 ? 'text-amber-400' : 'text-red-400'}`}>
                                    {exp.statisticalSignificance.toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hypothesis, Goals & Learnings */}
                  {(exp.hypothesis || exp.learnings || exp.expectedOutcome || exp.goals?.length) && (
                    <div className="px-4 pb-4">
                      <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg space-y-3">
                        {exp.hypothesis && (
                          <div>
                            <p className="text-xs font-medium text-[var(--text-muted)]">Hypothesis</p>
                            <p className="text-sm text-[var(--text-secondary)]">{exp.hypothesis}</p>
                          </div>
                        )}
                        {exp.expectedOutcome && (
                          <div>
                            <p className="text-xs font-medium text-[var(--text-muted)]">Expected Outcome</p>
                            <p className="text-sm text-[var(--text-secondary)]">{exp.expectedOutcome}</p>
                          </div>
                        )}
                        {exp.goals && exp.goals.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-[var(--text-muted)]">Success Metrics</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {exp.goals.map((goal, idx) => (
                                <span
                                  key={idx}
                                  className={`px-2 py-1 text-xs rounded-full ${
                                    goal.direction === 'INCREASE'
                                      ? 'bg-green-500/15 text-green-400'
                                      : 'bg-red-500/15 text-red-400'
                                  }`}
                                >
                                  {goal.direction === 'INCREASE' ? '↑' : '↓'}{' '}
                                  {METRIC_OPTIONS.find(m => m.value === goal.metric)?.label || goal.metric}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {exp.learnings && (
                          <div>
                            <p className="text-xs font-medium text-[var(--text-muted)]">Learnings</p>
                            <p className="text-sm text-[var(--text-secondary)]">{exp.learnings}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
