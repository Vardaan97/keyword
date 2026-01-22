import { NextRequest, NextResponse } from 'next/server'
import { getCampaignPerformance, GOOGLE_ADS_ACCOUNTS } from '@/lib/google-ads-reports'
import {
  getCachedCampaignPerformance,
  setCachedCampaignPerformance,
  isConvexConfigured
} from '@/lib/convex'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId') || 'flexi'
    const dateRange = searchParams.get('dateRange') || 'last_30_days'
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
      const cached = await getCachedCampaignPerformance(accountId, dateRange)
      if (cached) {
        console.log(`[API] Returning cached performance for ${account.name} (${dateRange})`)
        return NextResponse.json({
          success: true,
          data: {
            accountId: account.id,
            accountName: account.name,
            dateRange,
            campaigns: cached.campaigns,
            totals: cached.totals,
            campaignCount: cached.campaigns.length,
            cached: true,
            cachedAt: cached.fetchedAt,
          }
        })
      }
    }

    console.log(`[API] Fetching campaign performance for ${account.name} (${dateRange})`)

    const campaigns = await getCampaignPerformance(account.customerId, dateRange)

    // Calculate aggregates
    const totals = campaigns.reduce((acc, c) => ({
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      costMicros: acc.costMicros + c.costMicros,
      conversions: acc.conversions + c.conversions,
      conversionsValue: acc.conversionsValue + c.conversionsValue,
    }), { impressions: 0, clicks: 0, costMicros: 0, conversions: 0, conversionsValue: 0 })

    const fullTotals = {
      ...totals,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      averageCpc: totals.clicks > 0 ? totals.costMicros / totals.clicks : 0,
      costPerConversion: totals.conversions > 0 ? totals.costMicros / totals.conversions : 0,
    }

    // Cache the results in Convex (background, non-blocking)
    if (isConvexConfigured()) {
      setCachedCampaignPerformance(accountId, dateRange, campaigns, fullTotals)
        .catch(err => console.error('[API] Failed to cache performance:', err))
    }

    return NextResponse.json({
      success: true,
      data: {
        accountId: account.id,
        accountName: account.name,
        dateRange,
        campaigns,
        totals: fullTotals,
        campaignCount: campaigns.length,
        cached: false,
      }
    })
  } catch (error) {
    console.error('[API] Performance error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
