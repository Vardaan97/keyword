import { NextRequest, NextResponse } from 'next/server'
import {
  fetchChangeEvents,
  fetchAllAccountsChanges,
  getChangeStatistics,
  filterChanges,
  ChangeEvent,
} from '@/lib/google-ads-changes'
import { GOOGLE_ADS_ACCOUNTS, getDefaultCustomerId, getAccountName } from '@/lib/google-ads'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'

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

// ============================================================================
// HELPER FUNCTIONS FOR ENHANCED CHANGE TRACKING
// ============================================================================

/**
 * Map of client types to friendly names
 */
const CLIENT_TYPE_FRIENDLY_NAMES: Record<string, string> = {
  'Google Ads Web': 'Web Interface',
  'Automated Rule': 'Automated Rule',
  'Google Ads Scripts': 'Scripts',
  'Bulk Upload': 'Bulk Upload',
  'API': 'API',
  'Google Ads Editor': 'Google Ads Editor',
  'Mobile App': 'Mobile App',
  'Recommendations AI': 'Recommendations AI',
  'Smart Campaign': 'Smart Campaign',
  'Google Ads Insights': 'Insights',
  'Other': 'Other',
  'Unknown': 'Unknown',
}

/**
 * Determine if a change was automated (not manual web interface)
 */
function isAutomatedChange(clientType: string | undefined): boolean {
  if (!clientType) return false
  const manualTypes = ['Google Ads Web', 'Google Ads Editor', 'Mobile App', 'Web Interface']
  return !manualTypes.includes(clientType)
}

/**
 * Calculate impact category based on change type and fields
 */
function calculateImpactCategory(
  changeType: string,
  changedFields: Array<{ category: string }>
): 'high' | 'medium' | 'low' {
  // High impact: budget changes, status changes, bidding strategy changes
  const highImpactCategories = ['budget', 'status', 'bidding']

  if (changeType === 'REMOVE') {
    return 'high' // Removing anything is high impact
  }

  if (changeType === 'CREATE') {
    return 'medium' // Creating new resources is medium impact
  }

  // For updates, check the categories of changed fields
  const hasHighImpactChange = changedFields.some((f) =>
    highImpactCategories.includes(f.category)
  )
  if (hasHighImpactChange) {
    return 'high'
  }

  // Medium impact: targeting, schedule changes
  const mediumImpactCategories = ['targeting', 'schedule']
  const hasMediumImpactChange = changedFields.some((f) =>
    mediumImpactCategories.includes(f.category)
  )
  if (hasMediumImpactChange) {
    return 'medium'
  }

  return 'low'
}

/**
 * Generate searchable tags from a change event
 */
function generateTags(
  change: ChangeEvent,
  accountName: string
): string[] {
  const tags: string[] = []

  // Add resource type
  tags.push(change.resourceType.toLowerCase())

  // Add change type
  tags.push(change.changeType.toLowerCase())

  // Add categories from changed fields
  const categories = new Set(change.changedFields.map((f) => f.category))
  categories.forEach((cat) => tags.push(cat))

  // Add account name
  tags.push(accountName.toLowerCase().replace(/\s+/g, '-'))

  // Add client type
  if (change.clientType) {
    tags.push(change.clientType.toLowerCase().replace(/\s+/g, '-'))
  }

  // Add specific keywords from summary
  const summaryKeywords = ['budget', 'status', 'paused', 'enabled', 'removed', 'created', 'renamed']
  const summaryLower = change.summary.toLowerCase()
  summaryKeywords.forEach((keyword) => {
    if (summaryLower.includes(keyword)) {
      tags.push(keyword)
    }
  })

  // Deduplicate
  return [...new Set(tags)]
}

/**
 * Generate a unique changeId from the change event
 * Uses resourceId + changedAt timestamp as composite key
 */
function generateChangeId(change: ChangeEvent, customerId: string): string {
  return `${customerId}_${change.resourceId}_${change.changedAt}`
}

/**
 * Extract parent resource info from resource name
 * e.g., "customers/123/campaigns/456/adGroups/789" -> campaignId: 456
 */
function extractParentResource(
  resourceName: string,
  resourceType: string
): { parentResourceId?: string; parentResourceName?: string } {
  if (!resourceName) return {}

  const parts = resourceName.split('/')

  // For ad groups, keywords, ads - parent is campaign
  if (['AD_GROUP', 'AD_GROUP_AD', 'AD_GROUP_CRITERION', 'AD_GROUP_BID_MODIFIER'].includes(resourceType)) {
    const campaignIndex = parts.indexOf('campaigns')
    if (campaignIndex !== -1 && parts[campaignIndex + 1]) {
      return {
        parentResourceId: parts[campaignIndex + 1],
        // We don't have the name here, but we could look it up if needed
      }
    }
  }

  return {}
}

/**
 * Transform a ChangeEvent to the enhanced Convex format
 */
function transformToConvexFormat(
  change: ChangeEvent,
  customerId: string,
  accountName: string
): {
  changeId: string
  customerId: string
  accountName: string
  resourceType: string
  resourceId: string
  resourceName: string
  parentResourceId?: string
  parentResourceName?: string
  changeType: string
  changedAt: number
  detectedAt: number
  userEmail?: string
  clientType: string
  clientTypeFriendly: string
  isAutomated: boolean
  changedFields: Array<{
    field: string
    category: string
    oldValue?: string
    newValue?: string
    oldValueRaw?: unknown
    newValueRaw?: unknown
  }>
  summary: string
  impactCategory: string
  tags: string[]
  batchId?: string
  experimentId?: string
  algorithmId?: string
} {
  const parentInfo = extractParentResource(change.resourceName, change.resourceType)

  return {
    changeId: generateChangeId(change, customerId),
    customerId,
    accountName,
    resourceType: change.resourceType,
    resourceId: change.resourceId,
    resourceName: change.resourceName,
    parentResourceId: parentInfo.parentResourceId,
    parentResourceName: parentInfo.parentResourceName,
    changeType: change.changeType,
    changedAt: change.changedAt,
    detectedAt: Date.now(),
    userEmail: change.userEmail,
    clientType: change.clientType || 'Unknown',
    clientTypeFriendly: CLIENT_TYPE_FRIENDLY_NAMES[change.clientType || 'Unknown'] || change.clientType || 'Unknown',
    isAutomated: isAutomatedChange(change.clientType),
    changedFields: change.changedFields.map((f) => ({
      field: f.field,
      category: f.category,
      oldValue: f.oldValue,
      newValue: f.newValue,
      oldValueRaw: f.oldValue, // Could parse numbers, etc. if needed
      newValueRaw: f.newValue,
    })),
    summary: change.summary,
    impactCategory: calculateImpactCategory(change.changeType, change.changedFields),
    tags: generateTags(change, accountName),
  }
}

/**
 * POST /api/gads/changes/sync
 *
 * Trigger a sync of change events and store in Convex
 * Used by cron jobs and manual sync requests
 *
 * Request body:
 * - days: Number of days to look back (default: 7, max: 30)
 * - account: Optional specific account ID to sync (default: all accounts)
 * - source: Optional source identifier (e.g., "cron", "manual", "apps_script")
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json().catch(() => ({}))
    const days = Math.min(body.days || 7, 30)
    const specificAccount = body.account as string | undefined
    const source = body.source || 'api'

    console.log(`[API/GADS/CHANGES] Sync triggered - days: ${days}, source: ${source}`)

    // Initialize Convex client
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      throw new Error('NEXT_PUBLIC_CONVEX_URL not configured')
    }
    const convex = new ConvexHttpClient(convexUrl)

    // Fetch changes from accounts
    let responses
    if (specificAccount) {
      // Sync specific account
      const account = GOOGLE_ADS_ACCOUNTS.find(
        (acc) => acc.id === specificAccount || acc.customerId === specificAccount
      )
      if (!account) {
        throw new Error(`Account not found: ${specificAccount}`)
      }
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)
      const response = await fetchChangeEvents(account.customerId, startDate)
      responses = [response]
    } else {
      // Sync all accounts
      responses = await fetchAllAccountsChanges(days)
    }

    // Process and store changes
    const results: Array<{
      accountName: string
      customerId: string
      fetched: number
      inserted: number
      duplicates: number
      success: boolean
      error?: string
    }> = []

    for (const response of responses) {
      try {
        if (response.changes.length === 0) {
          results.push({
            accountName: response.accountName,
            customerId: response.customerId,
            fetched: 0,
            inserted: 0,
            duplicates: 0,
            success: true,
          })
          continue
        }

        // Transform changes to enhanced Convex format
        const transformedChanges = response.changes.map((change) =>
          transformToConvexFormat(change, response.customerId, response.accountName)
        )

        // Batch insert to Convex (in chunks of 50 to avoid hitting limits)
        const BATCH_SIZE = 50
        let totalInserted = 0
        let totalDuplicates = 0

        for (let i = 0; i < transformedChanges.length; i += BATCH_SIZE) {
          const batch = transformedChanges.slice(i, i + BATCH_SIZE)

          try {
            const result = await convex.mutation(api.googleAdsChanges.bulkInsert, {
              changes: batch,
            })
            totalInserted += result.inserted
            totalDuplicates += result.duplicates
          } catch (batchError) {
            console.error(
              `[API/GADS/CHANGES] Batch insert error for ${response.accountName}:`,
              batchError
            )
            // Continue with other batches
          }
        }

        results.push({
          accountName: response.accountName,
          customerId: response.customerId,
          fetched: response.changes.length,
          inserted: totalInserted,
          duplicates: totalDuplicates,
          success: true,
        })

        console.log(
          `[API/GADS/CHANGES] ${response.accountName}: fetched=${response.changes.length}, inserted=${totalInserted}, duplicates=${totalDuplicates}`
        )
      } catch (accountError) {
        const errorMsg = accountError instanceof Error ? accountError.message : String(accountError)
        console.error(`[API/GADS/CHANGES] Error processing ${response.accountName}:`, errorMsg)

        results.push({
          accountName: response.accountName,
          customerId: response.customerId,
          fetched: response.changes.length,
          inserted: 0,
          duplicates: 0,
          success: false,
          error: errorMsg,
        })
      }
    }

    // Calculate totals
    const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0)
    const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0)
    const totalDuplicates = results.reduce((sum, r) => sum + r.duplicates, 0)
    const successfulAccounts = results.filter((r) => r.success).length
    const duration = Date.now() - startTime

    console.log(
      `[API/GADS/CHANGES] Sync complete in ${duration}ms: ` +
        `fetched=${totalFetched}, inserted=${totalInserted}, duplicates=${totalDuplicates}, ` +
        `accounts=${successfulAccounts}/${results.length}`
    )

    return NextResponse.json({
      success: true,
      data: {
        results,
        totals: {
          fetched: totalFetched,
          inserted: totalInserted,
          duplicates: totalDuplicates,
        },
        accounts: {
          total: results.length,
          successful: successfulAccounts,
          failed: results.length - successfulAccounts,
        },
        syncedAt: new Date().toISOString(),
        durationMs: duration,
        source,
        days,
      },
    })
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('[API/GADS/CHANGES] Sync error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync changes',
        durationMs: duration,
      },
      { status: 500 }
    )
  }
}
