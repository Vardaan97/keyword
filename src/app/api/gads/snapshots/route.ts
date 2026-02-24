import { NextRequest, NextResponse } from 'next/server'
import { getCampaignPerformance, GOOGLE_ADS_ACCOUNTS } from '@/lib/google-ads-reports'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * Generate a hash of campaign state for quick comparison
 */
function generateStateHash(campaigns: Array<{
  id: string
  name: string
  status: string
  budgetMicros: number
  biddingStrategy: string
}>): string {
  const stateString = JSON.stringify(
    campaigns
      .map(c => ({
        id: c.id,
        status: c.status,
        budget: c.budgetMicros,
        bidding: c.biddingStrategy,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  )
  return crypto.createHash('md5').update(stateString).digest('hex')
}

/**
 * Format micros to currency string
 */
function formatMicros(micros: number): string {
  const amount = micros / 1_000_000
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/**
 * GET /api/gads/snapshots
 *
 * Get daily snapshots for accounts
 *
 * Query params:
 * - customerId: Optional specific customer ID
 * - date: Optional specific date (YYYY-MM-DD format, defaults to today)
 * - days: Number of days of history (default: 7)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId')
    const dateStr = searchParams.get('date')
    const days = Math.min(parseInt(searchParams.get('days') || '7', 10), 90)

    // Initialize Convex client
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      throw new Error('NEXT_PUBLIC_CONVEX_URL not configured')
    }
    const convex = new ConvexHttpClient(convexUrl)

    if (dateStr && customerId) {
      // Get specific snapshot
      const snapshot = await convex.query(api.googleAdsDailySnapshots.getByDateAndCustomer, {
        snapshotDate: dateStr,
        customerId,
      })

      return NextResponse.json({
        success: true,
        data: snapshot,
      })
    }

    if (customerId) {
      // Get history for specific account
      const snapshots = await convex.query(api.googleAdsDailySnapshots.getHistory, {
        customerId,
        limit: days,
      })

      return NextResponse.json({
        success: true,
        data: {
          snapshots,
          customerId,
          count: snapshots.length,
        },
      })
    }

    // Get today's snapshots for all accounts
    const today = new Date().toISOString().split('T')[0]
    const targetDate = dateStr || today

    const snapshots = await convex.query(api.googleAdsDailySnapshots.getByDate, {
      snapshotDate: targetDate,
    })

    return NextResponse.json({
      success: true,
      data: {
        snapshots,
        date: targetDate,
        count: snapshots.length,
      },
    })
  } catch (error) {
    console.error('[API/GADS/SNAPSHOTS] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get snapshots',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/gads/snapshots
 *
 * Create a daily snapshot for accounts
 * Used by cron jobs and manual sync requests
 *
 * Request body:
 * - account: Optional specific account ID (default: all accounts)
 * - date: Optional date to snapshot (default: today)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json().catch(() => ({}))
    const specificAccount = body.account as string | undefined
    const dateOverride = body.date as string | undefined

    const today = new Date().toISOString().split('T')[0]
    const snapshotDate = dateOverride || today

    console.log(`[API/GADS/SNAPSHOTS] Creating snapshot for ${snapshotDate}`)

    // Initialize Convex client
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      throw new Error('NEXT_PUBLIC_CONVEX_URL not configured')
    }
    const convex = new ConvexHttpClient(convexUrl)

    // Get accounts to snapshot
    const accounts = specificAccount
      ? GOOGLE_ADS_ACCOUNTS.filter(
          acc => acc.id === specificAccount || acc.customerId === specificAccount
        )
      : GOOGLE_ADS_ACCOUNTS.filter(acc => acc.customerId !== 'ALL')

    const results: Array<{
      accountName: string
      customerId: string
      success: boolean
      action?: string
      campaignCount?: number
      error?: string
    }> = []

    for (const account of accounts) {
      try {
        // Fetch campaign performance for today
        const campaigns = await getCampaignPerformance(account.customerId, 'today')

        // Calculate aggregates
        const activeCampaigns = campaigns.filter(c => c.status === 'ENABLED').length
        const pausedCampaigns = campaigns.filter(c => c.status === 'PAUSED').length

        const totalDailyBudgetMicros = 0 // Would need separate query for budgets
        const totalImpressions = campaigns.reduce((sum, c) => sum + c.impressions, 0)
        const totalClicks = campaigns.reduce((sum, c) => sum + c.clicks, 0)
        const totalCostMicros = campaigns.reduce((sum, c) => sum + c.costMicros, 0)
        const totalConversions = campaigns.reduce((sum, c) => sum + c.conversions, 0)
        const totalConversionValue = campaigns.reduce((sum, c) => sum + c.conversionsValue, 0)

        // Transform campaigns to snapshot format
        const campaignSnapshots = campaigns.map(c => ({
          id: c.campaignId,
          name: c.campaignName,
          status: c.status,
          type: c.channelType,
          budgetMicros: 0, // Would need separate query
          biddingStrategy: c.biddingStrategy,
          targetCpaMicros: undefined as number | undefined,
          targetRoas: undefined as number | undefined,
        }))

        // Generate state hash
        const stateHash = generateStateHash(campaignSnapshots)

        // Store snapshot in Convex
        const result = await convex.mutation(api.googleAdsDailySnapshots.upsert, {
          snapshotDate,
          customerId: account.customerId,
          accountName: account.name,
          campaignCount: campaigns.length,
          adGroupCount: 0, // Would need separate query
          keywordCount: 0, // Would need separate query
          adCount: 0, // Would need separate query
          activeCampaigns,
          pausedCampaigns,
          enabledAdGroups: 0,
          enabledKeywords: 0,
          totalDailyBudgetMicros,
          totalDailyBudgetFormatted: formatMicros(totalDailyBudgetMicros),
          impressions: totalImpressions,
          clicks: totalClicks,
          costMicros: totalCostMicros,
          conversions: totalConversions,
          conversionValue: totalConversionValue,
          campaigns: campaignSnapshots,
          stateHash,
          createdAt: Date.now(),
        })

        results.push({
          accountName: account.name,
          customerId: account.customerId,
          success: true,
          action: result.action,
          campaignCount: campaigns.length,
        })

        console.log(
          `[API/GADS/SNAPSHOTS] ${account.name}: ${result.action} snapshot with ${campaigns.length} campaigns`
        )
      } catch (accountError) {
        const errorMsg = accountError instanceof Error ? accountError.message : String(accountError)
        console.error(`[API/GADS/SNAPSHOTS] Error for ${account.name}:`, errorMsg)

        results.push({
          accountName: account.name,
          customerId: account.customerId,
          success: false,
          error: errorMsg,
        })
      }
    }

    const duration = Date.now() - startTime
    const successCount = results.filter(r => r.success).length

    console.log(
      `[API/GADS/SNAPSHOTS] Snapshot complete in ${duration}ms: ${successCount}/${results.length} accounts`
    )

    return NextResponse.json({
      success: true,
      data: {
        results,
        snapshotDate,
        accounts: {
          total: results.length,
          successful: successCount,
          failed: results.length - successCount,
        },
        durationMs: duration,
      },
    })
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('[API/GADS/SNAPSHOTS] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create snapshots',
        durationMs: duration,
      },
      { status: 500 }
    )
  }
}
