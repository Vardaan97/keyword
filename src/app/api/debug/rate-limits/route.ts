/**
 * Debug endpoint to check rate limit status for all Google Ads accounts
 * GET /api/debug/rate-limits
 */

import { NextResponse } from 'next/server'
import { getRateLimitStatus, GOOGLE_ADS_ACCOUNTS } from '@/lib/google-ads'

export async function GET() {
  try {
    // Get rate limit status from in-memory tracking
    const rateLimitStatus = getRateLimitStatus()

    // Get account names for better display
    const accountInfo = GOOGLE_ADS_ACCOUNTS.reduce((acc, account) => {
      const cleanId = account.customerId.replace(/-/g, '')
      acc[cleanId] = {
        name: account.name,
        customerId: account.customerId,
        currency: account.currency
      }
      return acc
    }, {} as Record<string, { name: string; customerId: string; currency: string }>)

    // Combine rate limit status with account info
    const combinedStatus = Object.entries(rateLimitStatus).map(([accountId, status]) => {
      const account = accountInfo[accountId]
      return {
        accountId,
        accountName: account?.name || 'Unknown',
        customerId: account?.customerId || accountId,
        requestCount: status.requestCount,
        windowRemainingMs: status.windowRemainingMs,
        windowRemainingSeconds: Math.round(status.windowRemainingMs / 1000),
        quotaExhausted: status.quotaExhausted,
        quotaResetAt: status.quotaResetAt ? new Date(status.quotaResetAt).toISOString() : null,
        quotaResetInSeconds: status.quotaResetAt
          ? Math.max(0, Math.round((status.quotaResetAt - Date.now()) / 1000))
          : null
      }
    })

    // Calculate summary
    const summary = {
      totalAccounts: Object.keys(rateLimitStatus).length,
      accountsWithQuotaExhausted: combinedStatus.filter(s => s.quotaExhausted).length,
      totalRequestsThisWindow: combinedStatus.reduce((sum, s) => sum + s.requestCount, 0)
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
      accounts: combinedStatus,
      info: {
        rateLimitDelayMs: 1100,
        maxRequestsPerWindow: 60,
        windowDurationMs: 60000,
        defaultQuotaCooldownMinutes: 5
      }
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      success: false,
      error: errorMsg,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
