'use client'

import Link from 'next/link'

export default function KeywordsPage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">
          Keyword Planner
        </h1>
        <p className="text-[var(--text-secondary)] mt-1">
          AI-powered keyword research for course marketing
        </p>
      </div>

      {/* Redirect Card */}
      <div className="max-w-2xl">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[var(--accent-electric)] to-[var(--accent-violet)] flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
            Keyword Research Tool
          </h2>
          <p className="text-[var(--text-secondary)] mb-6">
            Research keyword ideas for courses, analyze search volume, and get AI-powered recommendations for your Google Ads campaigns.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[var(--accent-electric)] text-white font-medium hover:bg-[var(--accent-electric)]/90 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open Keyword Planner
            </Link>
          </div>

          <p className="text-sm text-[var(--text-muted)] mt-4">
            The keyword planner will be integrated directly into this dashboard soon.
          </p>
        </div>

        {/* Features List */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-[var(--bg-tertiary)]">
            <div className="p-1.5 rounded bg-[var(--accent-electric)]/10">
              <svg className="w-4 h-4 text-[var(--accent-electric)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-[var(--text-primary)] text-sm">Batch Processing</p>
              <p className="text-xs text-[var(--text-muted)]">Process multiple courses via CSV upload</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-lg bg-[var(--bg-tertiary)]">
            <div className="p-1.5 rounded bg-[var(--accent-lime)]/10">
              <svg className="w-4 h-4 text-[var(--accent-lime)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-[var(--text-primary)] text-sm">AI-Powered Analysis</p>
              <p className="text-xs text-[var(--text-muted)]">Intelligent keyword scoring and tiering</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-lg bg-[var(--bg-tertiary)]">
            <div className="p-1.5 rounded bg-[var(--accent-amber)]/10">
              <svg className="w-4 h-4 text-[var(--accent-amber)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-[var(--text-primary)] text-sm">Google Ads Integration</p>
              <p className="text-xs text-[var(--text-muted)]">Real-time search volume data</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-lg bg-[var(--bg-tertiary)]">
            <div className="p-1.5 rounded bg-[var(--accent-violet)]/10">
              <svg className="w-4 h-4 text-[var(--accent-violet)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-[var(--text-primary)] text-sm">In-Account Detection</p>
              <p className="text-xs text-[var(--text-muted)]">Identifies keywords already in your account</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
