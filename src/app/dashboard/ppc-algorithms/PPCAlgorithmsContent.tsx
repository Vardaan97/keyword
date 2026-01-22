'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { AlgorithmCard } from '@/components/dashboard/algorithms'

interface Algorithm {
  _id: string
  algorithmId: string
  name: string
  description: string
  category: string
  rules: {
    id: string
    condition: string
    action: string
    impact: string
    potentialIssues: string[]
    affectedEntities: string
  }[]
  dataSource: string
  executionFrequency: string
  enabled: boolean
  lastUpdated: number
}

export default function PPCAlgorithmsContent() {
  const [seeding, setSeeding] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [seedSuccess, setSeedSuccess] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  // Fetch algorithms from Convex
  const algorithms = useQuery(api.autoPpcRules.list) as Algorithm[] | undefined

  // Mutations
  const seedAlgorithms = useMutation(api.autoPpcRules.seedAlgorithms)
  const toggleEnabled = useMutation(api.autoPpcRules.toggleEnabled)

  // Seed data if none exists
  const handleSeed = async () => {
    setSeeding(true)
    setSeedError(null)
    try {
      await seedAlgorithms({})
      setSeedSuccess(true)
      setTimeout(() => setSeedSuccess(false), 3000)
    } catch (err) {
      setSeedError(err instanceof Error ? err.message : 'Failed to seed algorithms')
    } finally {
      setSeeding(false)
    }
  }

  // Toggle algorithm enabled state
  const handleToggle = async (algorithmId: string) => {
    try {
      await toggleEnabled({ algorithmId })
    } catch (err) {
      console.error('Failed to toggle algorithm:', err)
    }
  }

  // Filter algorithms by category
  const filteredAlgorithms = algorithms?.filter(algo =>
    categoryFilter === 'all' || algo.category === categoryFilter
  ) || []

  // Get unique categories
  const categories = ['all', ...new Set(algorithms?.map(a => a.category) || [])]

  // Count total rules and issues
  const stats = algorithms?.reduce(
    (acc, algo) => ({
      totalRules: acc.totalRules + algo.rules.length,
      totalIssues: acc.totalIssues + algo.rules.reduce((sum, r) => sum + r.potentialIssues.length, 0),
      enabledAlgos: acc.enabledAlgos + (algo.enabled ? 1 : 0),
    }),
    { totalRules: 0, totalIssues: 0, enabledAlgos: 0 }
  ) || { totalRules: 0, totalIssues: 0, enabledAlgos: 0 }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">
            Auto PPC Algorithms
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Documentation and monitoring for Koenig's automated PPC rules
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Seed Button */}
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="px-4 py-2 rounded-lg bg-[var(--accent-electric)] text-white font-medium text-sm hover:bg-[var(--accent-electric)]/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {seeding ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {algorithms?.length ? 'Refresh Algorithms' : 'Load Algorithms'}
          </button>
        </div>
      </div>

      {/* Success/Error Messages */}
      {seedSuccess && (
        <div className="rounded-xl border border-[var(--accent-lime)]/20 bg-[var(--accent-lime)]/5 p-4 mb-6 flex items-center gap-3">
          <svg className="w-5 h-5 text-[var(--accent-lime)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-[var(--accent-lime)]">Algorithms loaded successfully!</p>
        </div>
      )}

      {seedError && (
        <div className="rounded-xl border border-[var(--accent-rose)]/20 bg-[var(--accent-rose)]/5 p-4 mb-6 flex items-start gap-3">
          <svg className="w-5 h-5 text-[var(--accent-rose)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-[var(--accent-rose)]">Error loading algorithms</p>
            <p className="text-sm text-[var(--text-secondary)]">{seedError}</p>
          </div>
        </div>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[var(--accent-electric)]/10">
              <svg className="w-5 h-5 text-[var(--accent-electric)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Total Algorithms</p>
              <p className="text-xl font-display font-bold text-[var(--text-primary)]">
                {algorithms?.length || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[var(--accent-lime)]/10">
              <svg className="w-5 h-5 text-[var(--accent-lime)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Active</p>
              <p className="text-xl font-display font-bold text-[var(--text-primary)]">
                {stats.enabledAlgos}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[var(--accent-violet)]/10">
              <svg className="w-5 h-5 text-[var(--accent-violet)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Total Rules</p>
              <p className="text-xl font-display font-bold text-[var(--text-primary)]">
                {stats.totalRules}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[var(--accent-amber)]/10">
              <svg className="w-5 h-5 text-[var(--accent-amber)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Known Issues</p>
              <p className="text-xl font-display font-bold text-[var(--text-primary)]">
                {stats.totalIssues}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm text-[var(--text-muted)]">Filter:</span>
        <div className="flex gap-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                categoryFilter === cat
                  ? 'bg-[var(--accent-electric)] text-white'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {!algorithms?.length && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--accent-electric)]/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--accent-electric)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            No Algorithms Loaded
          </h3>
          <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
            Click "Load Algorithms" to populate the database with Koenig's 5 Auto PPC algorithms
            including tCPA bidding, pause/resume rules, ECL signals, and more.
          </p>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="px-6 py-2.5 rounded-lg bg-[var(--accent-electric)] text-white font-medium hover:bg-[var(--accent-electric)]/90 transition-colors disabled:opacity-50"
          >
            {seeding ? 'Loading...' : 'Load Algorithms'}
          </button>
        </div>
      )}

      {/* Algorithm Cards */}
      <div className="space-y-4">
        {filteredAlgorithms.map(algo => (
          <AlgorithmCard
            key={algo._id}
            algorithmId={algo.algorithmId}
            name={algo.name}
            description={algo.description}
            category={algo.category}
            rules={algo.rules}
            dataSource={algo.dataSource}
            executionFrequency={algo.executionFrequency}
            enabled={algo.enabled}
            lastUpdated={algo.lastUpdated}
            onToggle={handleToggle}
          />
        ))}
      </div>

      {/* Koenig Context Section */}
      {algorithms && algorithms.length > 0 && (
        <div className="mt-12 rounded-xl border border-[var(--border-subtle)] bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-tertiary)] p-6">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-[var(--accent-amber)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Koenig Solutions Context
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">Training Portfolio</p>
              <p className="text-sm text-[var(--text-primary)]">729+ courses across Microsoft, AWS, Cisco, Oracle, Google Cloud</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">Marketing Scale</p>
              <p className="text-sm text-[var(--text-primary)]">
                <span className="font-mono text-[var(--accent-electric)]">198,184</span> ad groups, <span className="font-mono text-[var(--accent-lime)]">74</span> campaigns (Bouquet INR)
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">Primary Metric</p>
              <p className="text-sm text-[var(--text-primary)]">SC (Scheduled Confirmations) - student enrollments</p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2">Geo Coverage</p>
            <div className="flex flex-wrap gap-2">
              {['India', 'USA', 'UK', 'UAE', 'Singapore', 'Australia', 'Canada', 'Germany', 'Malaysia', 'Saudi'].map(country => (
                <span
                  key={country}
                  className="px-2 py-1 rounded bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)]"
                >
                  {country}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
