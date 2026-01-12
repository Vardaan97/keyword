'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import type { TokenStatus, ConnectionTestResult } from '@/types/auth'

export default function GoogleAdsSettingsPage() {
  const { theme } = useAppStore()

  // State
  const [status, setStatus] = useState<TokenStatus | null>(null)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isTesting, setIsTesting] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [authUrl, setAuthUrl] = useState<string | null>(null)

  // Fetch token status
  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/auth/google-ads/status')
      const data = await res.json()
      if (data.success) {
        setStatus(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch status:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch auth URL
  const fetchAuthUrl = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/google-ads')
      const data = await res.json()
      if (data.success) {
        setAuthUrl(data.authorizationUrl)
      }
    } catch (error) {
      console.error('Failed to fetch auth URL:', error)
    }
  }, [])

  // Test connection
  const testConnection = async () => {
    try {
      setIsTesting(true)
      setTestResult(null)
      const res = await fetch('/api/auth/google-ads/test')
      const data = await res.json()
      setTestResult(data.data)
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Failed to test connection',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      })
    } finally {
      setIsTesting(false)
    }
  }

  // Clear stored token
  const clearToken = async () => {
    if (!confirm('Are you sure you want to clear the stored token? You will need to re-authorize.')) {
      return
    }

    try {
      setIsClearing(true)
      const res = await fetch('/api/auth/google-ads/clear', { method: 'POST' })
      if (res.ok) {
        await fetchStatus()
        setTestResult(null)
      }
    } catch (error) {
      console.error('Failed to clear token:', error)
    } finally {
      setIsClearing(false)
    }
  }

  // Load data on mount
  useEffect(() => {
    fetchStatus()
    fetchAuthUrl()
  }, [fetchStatus, fetchAuthUrl])

  // Format timestamp
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString()
  }

  // Get status color and text
  const getStatusDisplay = () => {
    if (!status) return { color: '#6b7280', text: 'Loading...', icon: '...' }
    if (!status.hasToken) return { color: '#ef4444', text: 'Not Connected', icon: '✗' }
    if (status.source === 'runtime') return { color: '#10b981', text: 'Connected (Runtime)', icon: '✓' }
    if (status.source === 'env') return { color: '#f59e0b', text: 'Connected (Environment)', icon: '✓' }
    return { color: '#6b7280', text: 'Unknown', icon: '?' }
  }

  const statusDisplay = getStatusDisplay()

  return (
    <div data-theme={theme}>
      {/* Connection Status Card */}
      <div
        className="rounded-xl p-6 mb-6"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Connection Status
        </h2>

        {isLoading ? (
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent-primary)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Loading status...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status indicator */}
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white"
                style={{ background: statusDisplay.color }}
              >
                {statusDisplay.icon}
              </div>
              <div>
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {statusDisplay.text}
                </p>
                {status?.updatedBy && (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Authorized as: {status.updatedBy}
                  </p>
                )}
                {status?.updatedAt && (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Last updated: {formatDate(status.updatedAt)}
                  </p>
                )}
              </div>
            </div>

            {/* Source badge */}
            {status?.hasToken && (
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded" style={{
                  background: status.source === 'runtime' ? '#059669' : '#d97706',
                  color: 'white'
                }}>
                  {status.source === 'runtime' ? 'Runtime Token' : 'Environment Variable'}
                </span>
                {status.source === 'runtime' && (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    (Stored in .google-ads-tokens.json)
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Configuration Checklist */}
      <div
        className="rounded-xl p-6 mb-6"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Configuration Status
        </h2>

        <div className="grid grid-cols-2 gap-3">
          {status?.config && Object.entries(status.config).map(([key, value]) => {
            const label = key.replace(/^has/, '').replace(/([A-Z])/g, ' $1').trim()
            return (
              <div key={key} className="flex items-center gap-2">
                <span className={`text-lg ${value ? 'text-green-500' : 'text-red-500'}`}>
                  {value ? '✓' : '✗'}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
              </div>
            )
          })}
        </div>

        {status?.config && !Object.values(status.config).every(Boolean) && (
          <p className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            Missing configuration? Add the required environment variables to your <code>.env.local</code> file.
          </p>
        )}
      </div>

      {/* Actions */}
      <div
        className="rounded-xl p-6 mb-6"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Actions
        </h2>

        <div className="flex flex-wrap gap-3">
          {/* Authorize button */}
          {authUrl && (
            <a
              href={authUrl}
              className="px-4 py-2 rounded-lg font-medium transition-opacity hover:opacity-90"
              style={{
                background: status?.hasToken ? 'var(--bg-tertiary)' : 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
                color: 'white',
                border: status?.hasToken ? '1px solid var(--border-primary)' : 'none'
              }}
            >
              {status?.hasToken ? 'Re-authorize Google Ads' : 'Authorize Google Ads'}
            </a>
          )}

          {/* Test connection button */}
          <button
            onClick={testConnection}
            disabled={isTesting || !status?.hasToken}
            className="px-4 py-2 rounded-lg font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)'
            }}
          >
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>

          {/* Clear token button */}
          {status?.source === 'runtime' && (
            <button
              onClick={clearToken}
              disabled={isClearing}
              className="px-4 py-2 rounded-lg font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{
                background: 'transparent',
                color: '#ef4444',
                border: '1px solid #ef4444'
              }}
            >
              {isClearing ? 'Clearing...' : 'Clear Stored Token'}
            </button>
          )}
        </div>

        {/* Test result */}
        {testResult && (
          <div
            className="mt-4 p-4 rounded-lg"
            style={{
              background: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${testResult.success ? '#10b981' : '#ef4444'}`
            }}
          >
            <div className="flex items-start gap-3">
              <span className={`text-xl ${testResult.success ? 'text-green-500' : 'text-red-500'}`}>
                {testResult.success ? '✓' : '✗'}
              </span>
              <div>
                <p className="font-medium" style={{ color: testResult.success ? '#10b981' : '#ef4444' }}>
                  {testResult.message}
                </p>
                {testResult.accountName && (
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    Account: {testResult.accountName} ({testResult.customerId})
                  </p>
                )}
                {testResult.error && (
                  <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                    Error: {testResult.error}
                  </p>
                )}
                {testResult.suggestion && (
                  <p className="text-sm mt-2 p-2 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                    💡 {testResult.suggestion}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Help section */}
      <div
        className="rounded-xl p-6"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Troubleshooting
        </h2>

        <div className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <p>
            <strong>Token Expired?</strong> Click &quot;Re-authorize Google Ads&quot; to get a new token.
          </p>
          <p>
            <strong>Redirect URI Mismatch?</strong> Add <code>GOOGLE_ADS_OAUTH_CALLBACK_URL=http://localhost:3005/api/auth/google-ads/callback</code> to your <code>.env.local</code> and make sure it&apos;s registered in Google Cloud Console.
          </p>
          <p>
            <strong>Permission Denied?</strong> Your developer token may not have API access. Check your Google Ads API access level in the API Center.
          </p>
        </div>

        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-primary)' }}>
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm hover:underline"
            style={{ color: 'var(--accent-primary)' }}
          >
            Open Google Cloud Console →
          </a>
        </div>
      </div>
    </div>
  )
}
