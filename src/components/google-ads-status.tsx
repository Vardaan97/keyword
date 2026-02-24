'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { TokenStatus } from '@/types/auth'

interface GoogleAdsStatusProps {
  compact?: boolean
  showLabel?: boolean
}

export function GoogleAdsStatus({ compact = false, showLabel = true }: GoogleAdsStatusProps) {
  const [status, setStatus] = useState<TokenStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showTooltip, setShowTooltip] = useState(false)

  const [tokenValid, setTokenValid] = useState<boolean | null>(null)
  const [reAuthUrl, setReAuthUrl] = useState<string | null>(null)

  // Fetch token status AND verify it actually works
  const fetchStatus = useCallback(async () => {
    try {
      // Fetch basic status and verify in parallel
      const [statusRes, verifyRes] = await Promise.all([
        fetch('/api/auth/google-ads/status'),
        fetch('/api/auth/google-ads/verify')
      ])
      const [statusData, verifyData] = await Promise.all([
        statusRes.json(),
        verifyRes.json()
      ])

      if (statusData.success) {
        setStatus(statusData.data)
      }

      // Use the verify endpoint result for actual validity
      setTokenValid(verifyData.valid === true)
      if (!verifyData.valid && verifyData.reAuthUrl) {
        setReAuthUrl(verifyData.reAuthUrl)
      }
    } catch (error) {
      console.error('Failed to fetch Google Ads status:', error)
      setTokenValid(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    // Refresh status every 30 seconds
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // Get status display info
  const getStatusInfo = () => {
    if (isLoading) {
      return {
        color: '#6b7280',
        bgColor: 'rgba(107, 114, 128, 0.2)',
        text: 'Loading...',
        icon: '...'
      }
    }
    if (!status?.hasToken || tokenValid === false) {
      // Token doesn't exist OR exists but failed verification
      const hasExpiredToken = status?.hasToken && tokenValid === false
      return {
        color: hasExpiredToken ? '#f59e0b' : '#ef4444',
        bgColor: hasExpiredToken ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
        text: hasExpiredToken ? 'Token Expired' : 'Not Connected',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        )
      }
    }
    if (tokenValid === null) {
      // Still verifying
      return {
        color: '#6b7280',
        bgColor: 'rgba(107, 114, 128, 0.2)',
        text: 'Verifying...',
        icon: '...'
      }
    }
    return {
      color: '#10b981',
      bgColor: 'rgba(16, 185, 129, 0.2)',
      text: status.source === 'runtime' ? 'Connected' : 'Connected (env)',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      )
    }
  }

  const statusInfo = getStatusInfo()
  const linkHref = (reAuthUrl && tokenValid === false) ? reAuthUrl : '/settings/google-ads'

  if (compact) {
    return (
      <Link
        href={linkHref}
        className="relative inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:opacity-80"
        style={{ background: statusInfo.bgColor, color: statusInfo.color }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={`Google Ads: ${statusInfo.text}`}
      >
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          statusInfo.icon
        )}

        {/* Tooltip */}
        {showTooltip && (
          <div
            className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg text-xs whitespace-nowrap z-50"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-primary)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}
          >
            <div className="font-medium">Google Ads</div>
            <div style={{ color: statusInfo.color }}>{statusInfo.text}</div>
            {status?.updatedBy && (
              <div className="text-xs mt-1 opacity-70">{status.updatedBy}</div>
            )}
            {reAuthUrl && tokenValid === false && (
              <div className="text-xs mt-1 text-amber-400">Click to re-authorize</div>
            )}
          </div>
        )}
      </Link>
    )
  }

  return (
    <Link
      href={linkHref}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
      style={{ background: statusInfo.bgColor, color: statusInfo.color }}
    >
      {isLoading ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        statusInfo.icon
      )}
      {showLabel && (
        <span className="text-sm font-medium">{statusInfo.text}</span>
      )}
    </Link>
  )
}
