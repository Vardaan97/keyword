import { NextRequest, NextResponse } from 'next/server'
import { getAccountSummary, GOOGLE_ADS_ACCOUNTS } from '@/lib/google-ads-reports'
import {
  getCachedAccountSummary,
  setCachedAccountSummary,
  isConvexConfigured
} from '@/lib/convex'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId') || 'flexi'
    const dateRange = searchParams.get('dateRange') || 'LAST_30_DAYS'
    const skipCache = searchParams.get('skipCache') === 'true'

    // Find the account
    const account = GOOGLE_ADS_ACCOUNTS.find(a => a.id === accountId)
    if (!account || account.customerId === 'ALL') {
      return NextResponse.json({
        success: false,
        error: 'Invalid account ID'
      }, { status: 400 })
    }

    // Check Convex cache first (unless skipCache is true)
    if (!skipCache && isConvexConfigured()) {
      const cached = await getCachedAccountSummary(accountId, dateRange)
      if (cached) {
        console.log(`[API] Returning cached account summary for ${account.name}`)
        return NextResponse.json({
          success: true,
          data: {
            accountName: cached.accountName,
            currencyCode: cached.currencyCode,
            totalCampaigns: cached.totalCampaigns,
            enabledCampaigns: cached.enabledCampaigns,
            metrics: cached.metrics,
            cached: true,
            cachedAt: cached.fetchedAt,
          }
        })
      }
    }

    console.log(`[API] Fetching account summary for ${account.name}`)

    const summary = await getAccountSummary(account.customerId, dateRange)

    // Cache the results in Convex (background, non-blocking)
    if (isConvexConfigured()) {
      setCachedAccountSummary(
        accountId,
        dateRange,
        summary.accountName,
        'INR', // currency code
        summary.totalCampaigns,
        summary.activeCampaigns,
        {
          impressions: summary.totalImpressions,
          clicks: summary.totalClicks,
          costMicros: summary.totalSpendMicros,
          conversions: summary.totalConversions,
          conversionsValue: 0,
          ctr: summary.totalImpressions > 0 ? (summary.totalClicks / summary.totalImpressions) : 0,
          averageCpc: summary.totalClicks > 0 ? (summary.totalSpendMicros / summary.totalClicks) : 0,
        }
      ).catch(err => console.error('[API] Failed to cache account summary:', err))
    }

    return NextResponse.json({
      success: true,
      data: {
        ...summary,
        cached: false,
      }
    })
  } catch (error) {
    console.error('[API] Account summary error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
