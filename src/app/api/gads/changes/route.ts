import { NextRequest, NextResponse } from 'next/server'
import {
  fetchChangeEvents,
  fetchAllAccountsChanges,
  getChangeStatistics,
  filterChanges,
  ChangeEvent,
} from '@/lib/google-ads-changes'
import { GOOGLE_ADS_ACCOUNTS, getDefaultCustomerId } from '@/lib/google-ads'

export const dynamic = 'force-dynamic'

/**
 * GET /api/gads/changes
 *
 * Fetch change events from Google Ads Change Event API
 *
 * Query params:
 * - customerId: Google Ads customer ID (optional, defaults to env)
 * - days: Number of days to look back (default: 7, max: 30)
 * - allAccounts: If "true", fetch from all accounts
 * - resourceType: Filter by resource type (CAMPAIGN, AD_GROUP, etc.)
 * - changeType: Filter by change type (CREATE, UPDATE, REMOVE)
 * - clientType: Filter by client type (Google Ads Web, API, etc.)
 * - category: Filter by change category (budget, bidding, status, etc.)
 * - search: Search term for summary/resource name
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Parse query parameters
    const customerId = searchParams.get('customerId') || getDefaultCustomerId()
    const days = Math.min(parseInt(searchParams.get('days') || '7', 10), 30)
    const allAccounts = searchParams.get('allAccounts') === 'true'

    // Filter parameters
    const resourceType = searchParams.get('resourceType')
    const changeType = searchParams.get('changeType')
    const clientType = searchParams.get('clientType')
    const category = searchParams.get('category')
    const search = searchParams.get('search')

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    console.log('[API/GADS/CHANGES] Fetching changes...')
    console.log('[API/GADS/CHANGES] Days:', days)
    console.log('[API/GADS/CHANGES] All accounts:', allAccounts)
    console.log('[API/GADS/CHANGES] Customer ID:', customerId)

    let allChanges: ChangeEvent[] = []
    let accountResults: Array<{ accountName: string; customerId: string; total: number }> = []

    if (allAccounts) {
      // Fetch from all accounts
      const responses = await fetchAllAccountsChanges(days)

      for (const response of responses) {
        allChanges.push(...response.changes)
        accountResults.push({
          accountName: response.accountName,
          customerId: response.customerId,
          total: response.total,
        })
      }

      // Sort combined changes by date (newest first)
      allChanges.sort((a, b) => b.changedAt - a.changedAt)
    } else {
      // Fetch from single account
      const response = await fetchChangeEvents(customerId, startDate, endDate)
      allChanges = response.changes
      accountResults.push({
        accountName: response.accountName,
        customerId: response.customerId,
        total: response.total,
      })
    }

    // Apply filters
    const filteredChanges = filterChanges(allChanges, {
      resourceType: resourceType || undefined,
      changeType: changeType || undefined,
      clientType: clientType || undefined,
      category: category || undefined,
      searchTerm: search || undefined,
    })

    // Calculate statistics
    const stats = getChangeStatistics(filteredChanges)

    return NextResponse.json({
      success: true,
      data: {
        changes: filteredChanges,
        total: filteredChanges.length,
        unfilteredTotal: allChanges.length,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          days,
        },
        accounts: accountResults,
        statistics: stats,
      },
    })
  } catch (error) {
    console.error('[API/GADS/CHANGES] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch changes',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/gads/changes/sync
 *
 * Trigger a sync of change events and store in Convex
 * Used by cron jobs and manual sync requests
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const days = Math.min(body.days || 7, 30)

    console.log('[API/GADS/CHANGES] Sync triggered for', days, 'days')

    // Fetch changes from all accounts
    const responses = await fetchAllAccountsChanges(days)

    const results = responses.map((response) => ({
      accountName: response.accountName,
      customerId: response.customerId,
      total: response.total,
      success: true,
    }))

    // Calculate totals
    const totalChanges = results.reduce((sum, r) => sum + r.total, 0)

    // Combine all changes for Convex storage
    const allChanges: ChangeEvent[] = []
    for (const response of responses) {
      allChanges.push(...response.changes)
    }

    // TODO: Store in Convex when functions are created
    // const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
    // for (const change of allChanges) {
    //   await convex.mutation(api.googleAdsChanges.upsert, { ... })
    // }

    console.log('[API/GADS/CHANGES] Sync complete:', totalChanges, 'changes from', results.length, 'accounts')

    return NextResponse.json({
      success: true,
      data: {
        results,
        totalChanges,
        syncedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('[API/GADS/CHANGES] Sync error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync changes',
      },
      { status: 500 }
    )
  }
}
