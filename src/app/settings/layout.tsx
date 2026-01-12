'use client'

import Link from 'next/link'
import { useAppStore } from '@/lib/store'

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { theme } = useAppStore()

  return (
    <div className="min-h-screen" data-theme={theme}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm opacity-70 hover:opacity-100 transition-opacity mb-4"
            style={{ color: 'var(--text-primary)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to Keyword Planner
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Settings
          </h1>
        </div>

        {/* Settings Navigation */}
        <div className="flex gap-4 mb-8 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <Link
            href="/settings/google-ads"
            className="pb-3 px-1 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderColor: 'var(--accent-primary)',
              color: 'var(--text-primary)'
            }}
          >
            Google Ads Connection
          </Link>
        </div>

        {/* Content */}
        {children}
      </div>
    </div>
  )
}
