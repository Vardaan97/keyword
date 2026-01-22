/**
 * Google Ads Change Event API Integration
 *
 * Fetches and parses change events from Google Ads using the Change Event API.
 * Tracks all modifications to campaigns, ad groups, ads, keywords, etc.
 *
 * API Limitations:
 * - 30-day maximum lookback period
 * - 10,000 rows max per query
 * - ~3 minute delay for most recent changes
 *
 * Docs: https://developers.google.com/google-ads/api/docs/change-event/overview
 */

import { getGoogleAdsConfig, GOOGLE_ADS_ACCOUNTS, getAccountName } from './google-ads'

// Google Ads API v22
const GOOGLE_ADS_API_VERSION = 'v22'

// ============================================================================
// TYPES
// ============================================================================

export interface ChangedField {
  field: string
  category: 'budget' | 'bidding' | 'targeting' | 'status' | 'schedule' | 'creative' | 'metadata' | 'other'
  oldValue?: string
  newValue?: string
}

export interface ChangeEvent {
  resourceType: string
  resourceId: string
  resourceName: string
  changeType: 'CREATE' | 'UPDATE' | 'REMOVE'
  changedAt: number // timestamp
  userEmail?: string
  clientType?: string
  changedFields: ChangedField[]
  summary: string
}

export interface ChangeEventsResponse {
  changes: ChangeEvent[]
  total: number
  dateRange: {
    start: string
    end: string
  }
  customerId: string
  accountName: string
}

// ============================================================================
// FIELD CATEGORY MAPPINGS
// ============================================================================

/**
 * Map of Google Ads field paths to category for UI grouping
 */
const FIELD_CATEGORIES: Record<string, ChangedField['category']> = {
  // Status changes
  'campaign.status': 'status',
  'ad_group.status': 'status',
  'ad_group_ad.status': 'status',
  'ad_group_criterion.status': 'status',
  'campaign_criterion.status': 'status',

  // Budget changes
  'campaign_budget.amount_micros': 'budget',
  'campaign.campaign_budget': 'budget',

  // Bidding changes
  'campaign.bidding_strategy_type': 'bidding',
  'campaign.target_cpa.target_cpa_micros': 'bidding',
  'campaign.target_roas.target_roas': 'bidding',
  'campaign.maximize_conversions.target_cpa_micros': 'bidding',
  'campaign.maximize_conversion_value.target_roas': 'bidding',
  'campaign.manual_cpc.enhanced_cpc_enabled': 'bidding',
  'ad_group.cpc_bid_micros': 'bidding',
  'ad_group.target_cpa_micros': 'bidding',
  'ad_group_criterion.cpc_bid_micros': 'bidding',
  'ad_group_criterion.effective_cpc_bid_micros': 'bidding',

  // Targeting changes
  'campaign.geo_target_type_setting': 'targeting',
  'campaign.network_settings': 'targeting',
  'campaign.targeting_setting': 'targeting',
  'campaign_criterion.keyword': 'targeting',
  'campaign_criterion.location': 'targeting',
  'campaign_criterion.language': 'targeting',
  'ad_group_criterion.keyword': 'targeting',
  'ad_group.audience_setting': 'targeting',

  // Schedule changes
  'campaign.start_date': 'schedule',
  'campaign.end_date': 'schedule',
  'campaign.ad_schedule': 'schedule',
  'ad_group_ad.ad.responsive_search_ad.headlines': 'schedule',

  // Creative changes
  'ad_group_ad.ad': 'creative',
  'ad_group_ad.ad.responsive_search_ad': 'creative',
  'ad_group_ad.ad.expanded_text_ad': 'creative',
  'ad_group_ad.ad.text_ad': 'creative',
  'ad_group_ad.ad.final_urls': 'creative',
  'ad_group_ad.ad.final_mobile_urls': 'creative',
  'ad_group_ad.ad.display_url': 'creative',

  // Metadata changes
  'campaign.name': 'metadata',
  'ad_group.name': 'metadata',
  'ad_group_ad.ad.name': 'metadata',
}

/**
 * Human-readable names for client types
 */
const CLIENT_TYPE_NAMES: Record<string, string> = {
  'GOOGLE_ADS_WEB_CLIENT': 'Google Ads Web',
  'GOOGLE_ADS_AUTOMATED_RULE': 'Automated Rule',
  'GOOGLE_ADS_SCRIPTS': 'Google Ads Scripts',
  'GOOGLE_ADS_BULK_UPLOAD': 'Bulk Upload',
  'GOOGLE_ADS_API': 'API',
  'GOOGLE_ADS_EDITOR': 'Google Ads Editor',
  'GOOGLE_ADS_MOBILE_APP': 'Mobile App',
  'GOOGLE_ADS_RECOMMENDATIONS_AI': 'Recommendations AI',
  'GOOGLE_ADS_SMART_CAMPAIGN': 'Smart Campaign',
  'GOOGLE_ADS_INSIGHTS': 'Google Ads Insights',
  'OTHER': 'Other',
  'UNKNOWN': 'Unknown',
}

/**
 * Human-readable names for resource types
 */
const RESOURCE_TYPE_NAMES: Record<string, string> = {
  'CAMPAIGN': 'Campaign',
  'AD_GROUP': 'Ad Group',
  'AD_GROUP_AD': 'Ad',
  'AD_GROUP_CRITERION': 'Keyword',
  'CAMPAIGN_BUDGET': 'Budget',
  'CAMPAIGN_CRITERION': 'Campaign Targeting',
  'BIDDING_STRATEGY': 'Bidding Strategy',
  'AD_GROUP_BID_MODIFIER': 'Bid Modifier',
  'CAMPAIGN_ASSET': 'Campaign Asset',
  'AD_GROUP_ASSET': 'Ad Group Asset',
  'ASSET': 'Asset',
  'FEED': 'Feed',
  'FEED_ITEM': 'Feed Item',
}

// ============================================================================
// TOKEN MANAGEMENT (reuse pattern from google-ads.ts)
// ============================================================================

let cachedAccessToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  const config = getGoogleAdsConfig()

  // Check if we have a valid cached token (with 5 minute buffer)
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedAccessToken.token
  }

  const tokenUrl = 'https://oauth2.googleapis.com/token'
  console.log('[GOOGLE-ADS-CHANGES] Requesting new access token...')

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('[GOOGLE-ADS-CHANGES] Token error:', error)

    if (error.error === 'invalid_grant') {
      const errorDesc = error.error_description || ''
      if (errorDesc.includes('expired') || errorDesc.includes('revoked')) {
        throw new Error(
          'Token has been expired or revoked. ' +
            'Please visit /api/auth/google-ads to get a new refresh token.'
        )
      }
    }

    throw new Error(error.error_description || 'Failed to get access token')
  }

  const data = await response.json()

  // Cache the token
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }

  return data.access_token
}

// ============================================================================
// GAQL QUERIES
// ============================================================================

/**
 * Build GAQL query for Change Event API
 * Max 30-day lookback period
 */
function buildChangeEventQuery(startDate: Date, endDate?: Date): string {
  const startDateStr = formatDateForGAQL(startDate)
  const endDateStr = endDate ? formatDateForGAQL(endDate) : formatDateForGAQL(new Date())

  return `
    SELECT
      change_event.resource_type,
      change_event.change_date_time,
      change_event.change_resource_type,
      change_event.change_resource_name,
      change_event.client_type,
      change_event.user_email,
      change_event.old_resource,
      change_event.new_resource,
      change_event.resource_change_operation,
      change_event.changed_fields
    FROM change_event
    WHERE change_event.change_date_time >= '${startDateStr}'
      AND change_event.change_date_time <= '${endDateStr}'
    ORDER BY change_event.change_date_time DESC
    LIMIT 10000
  `
}

/**
 * Format date for GAQL (YYYY-MM-DD HH:MM:SS format in account timezone)
 */
function formatDateForGAQL(date: Date): string {
  // Format: YYYY-MM-DD HH:MM:SS
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

// ============================================================================
// PARSING HELPERS
// ============================================================================

/**
 * Extract resource ID from Google Ads resource name
 * e.g., "customers/1234567890/campaigns/9876543210" -> "9876543210"
 */
function extractResourceId(resourceName: string): string {
  if (!resourceName) return ''
  const parts = resourceName.split('/')
  return parts[parts.length - 1] || ''
}

/**
 * Get field category from field path
 */
function getFieldCategory(fieldPath: string): ChangedField['category'] {
  // Direct match
  if (FIELD_CATEGORIES[fieldPath]) {
    return FIELD_CATEGORIES[fieldPath]
  }

  // Partial match (for nested fields)
  for (const [pattern, category] of Object.entries(FIELD_CATEGORIES)) {
    if (fieldPath.includes(pattern) || pattern.includes(fieldPath)) {
      return category
    }
  }

  return 'other'
}

/**
 * Extract field value from resource object
 * Handles nested fields like "campaign.status" from campaign resource
 */
function extractFieldValue(resource: Record<string, unknown> | undefined, fieldPath: string): string | undefined {
  if (!resource) return undefined

  const parts = fieldPath.split('.')

  // Navigate nested object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let value: any = resource
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part]
    } else {
      return undefined
    }
  }

  // Format special values
  if (typeof value === 'undefined' || value === null) {
    return undefined
  }

  // Handle micros (budget amounts)
  if (fieldPath.includes('micros') && typeof value === 'number') {
    return formatMicros(value)
  }

  return String(value)
}

/**
 * Format micros to readable currency
 * Google returns amounts in micros (1,000,000 = 1 unit)
 */
function formatMicros(micros: number | string): string {
  const value = typeof micros === 'string' ? parseInt(micros, 10) : micros
  const amount = value / 1_000_000
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Generate human-readable summary for a change event
 */
function generateChangeSummary(
  changeType: string,
  resourceType: string,
  changedFields: ChangedField[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  oldResource?: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newResource?: any
): string {
  const resourceTypeName = RESOURCE_TYPE_NAMES[resourceType] || resourceType

  // Handle CREATE
  if (changeType === 'CREATE') {
    const name = newResource?.name || newResource?.campaign?.name || newResource?.adGroup?.name
    if (name) {
      return `Created ${resourceTypeName}: "${name}"`
    }
    return `Created new ${resourceTypeName}`
  }

  // Handle REMOVE
  if (changeType === 'REMOVE') {
    const name = oldResource?.name || oldResource?.campaign?.name || oldResource?.adGroup?.name
    if (name) {
      return `Removed ${resourceTypeName}: "${name}"`
    }
    return `Removed ${resourceTypeName}`
  }

  // Handle UPDATE - provide specific info based on changed fields
  if (changeType === 'UPDATE' && changedFields.length > 0) {
    // Budget change
    const budgetField = changedFields.find((f) => f.category === 'budget')
    if (budgetField && budgetField.oldValue && budgetField.newValue) {
      return `Budget changed: ${budgetField.oldValue} → ${budgetField.newValue}`
    }

    // Status change
    const statusField = changedFields.find((f) => f.category === 'status')
    if (statusField && statusField.oldValue && statusField.newValue) {
      return `Status changed: ${statusField.oldValue} → ${statusField.newValue}`
    }

    // Bidding change
    const biddingField = changedFields.find((f) => f.category === 'bidding')
    if (biddingField) {
      if (biddingField.field.includes('target_cpa')) {
        return `Target CPA changed: ${biddingField.oldValue || 'N/A'} → ${biddingField.newValue || 'N/A'}`
      }
      if (biddingField.field.includes('target_roas')) {
        return `Target ROAS changed: ${biddingField.oldValue || 'N/A'} → ${biddingField.newValue || 'N/A'}`
      }
      if (biddingField.field.includes('cpc_bid')) {
        return `CPC bid changed: ${biddingField.oldValue || 'N/A'} → ${biddingField.newValue || 'N/A'}`
      }
      return `Bidding strategy changed`
    }

    // Name change
    const nameField = changedFields.find((f) => f.field.includes('name'))
    if (nameField && nameField.oldValue && nameField.newValue) {
      return `Renamed: "${nameField.oldValue}" → "${nameField.newValue}"`
    }

    // Generic field count
    const categoryGroups = new Set(changedFields.map((f) => f.category))
    const categories = Array.from(categoryGroups).filter((c) => c !== 'other')
    if (categories.length > 0) {
      return `${resourceTypeName} updated: ${categories.join(', ')} changes`
    }

    return `${resourceTypeName} updated: ${changedFields.length} field(s) modified`
  }

  return `${resourceTypeName} ${changeType.toLowerCase()}`
}

/**
 * Parse a single change event from API response
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseChangeEvent(row: any): ChangeEvent {
  const changeEvent = row.changeEvent || {}

  // Parse changed fields
  const changedFieldPaths: string[] = changeEvent.changedFields?.paths || []
  const oldResource = changeEvent.oldResource
  const newResource = changeEvent.newResource

  const changedFields: ChangedField[] = changedFieldPaths.map((fieldPath: string) => ({
    field: fieldPath,
    category: getFieldCategory(fieldPath),
    oldValue: extractFieldValue(oldResource, fieldPath),
    newValue: extractFieldValue(newResource, fieldPath),
  }))

  const changeType = changeEvent.resourceChangeOperation || 'UPDATE'
  const resourceType = changeEvent.changeResourceType || changeEvent.resourceType || 'UNKNOWN'

  return {
    resourceType,
    resourceId: extractResourceId(changeEvent.changeResourceName || ''),
    resourceName: changeEvent.changeResourceName || '',
    changeType: changeType as ChangeEvent['changeType'],
    changedAt: new Date(changeEvent.changeDateTime || Date.now()).getTime(),
    userEmail: changeEvent.userEmail,
    clientType: CLIENT_TYPE_NAMES[changeEvent.clientType] || changeEvent.clientType || 'Unknown',
    changedFields,
    summary: generateChangeSummary(changeType, resourceType, changedFields, oldResource, newResource),
  }
}

// ============================================================================
// MAIN API FUNCTIONS
// ============================================================================

/**
 * Fetch change events from Google Ads Change Event API
 *
 * @param customerId - Google Ads customer ID
 * @param startDate - Start of date range (max 30 days ago)
 * @param endDate - End of date range (defaults to now)
 * @returns Parsed change events
 */
export async function fetchChangeEvents(
  customerId: string,
  startDate: Date,
  endDate?: Date
): Promise<ChangeEventsResponse> {
  const config = getGoogleAdsConfig()
  const cleanCustomerId = customerId.replace(/-/g, '')
  const loginCustomerId = config.loginCustomerId.replace(/-/g, '')

  // Validate date range (max 30 days)
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  if (startDate < thirtyDaysAgo) {
    console.warn('[GOOGLE-ADS-CHANGES] Start date exceeds 30-day limit, clamping to 30 days ago')
    startDate = thirtyDaysAgo
  }

  console.log(`[GOOGLE-ADS-CHANGES] Fetching changes for account ${cleanCustomerId}...`)
  console.log(`[GOOGLE-ADS-CHANGES] Date range: ${startDate.toISOString()} to ${(endDate || now).toISOString()}`)

  const accessToken = await getAccessToken()
  const query = buildChangeEventQuery(startDate, endDate)

  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:search`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': config.developerToken,
        'login-customer-id': loginCustomerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      const error = await response.json()
      const errorMsg = error.error?.message || 'Failed to fetch change events'

      // Check for quota exhaustion
      if (errorMsg.includes('exhausted') || errorMsg.includes('quota')) {
        throw new Error('Google Ads API quota exhausted. Please wait a few minutes and try again.')
      }

      throw new Error(errorMsg)
    }

    const data = await response.json()
    const results = data.results || []

    console.log(`[GOOGLE-ADS-CHANGES] Received ${results.length} change events`)

    const changes = results.map(parseChangeEvent)

    return {
      changes,
      total: changes.length,
      dateRange: {
        start: startDate.toISOString(),
        end: (endDate || now).toISOString(),
      },
      customerId: cleanCustomerId,
      accountName: getAccountName(cleanCustomerId),
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[GOOGLE-ADS-CHANGES] Error fetching changes: ${errorMsg}`)
    throw error
  }
}

/**
 * Fetch change events from all accounts
 *
 * @param days - Number of days to look back (max 30)
 * @returns Combined change events from all accounts
 */
export async function fetchAllAccountsChanges(days: number = 7): Promise<ChangeEventsResponse[]> {
  // Get all real account IDs (exclude "ALL")
  const accounts = GOOGLE_ADS_ACCOUNTS.filter((acc) => acc.customerId !== 'ALL')

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - Math.min(days, 30))

  console.log(`[GOOGLE-ADS-CHANGES] Fetching changes for ${accounts.length} accounts...`)

  const results: ChangeEventsResponse[] = []

  for (const account of accounts) {
    try {
      // Add delay between accounts to respect rate limits
      if (results.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1100))
      }

      const response = await fetchChangeEvents(account.customerId, startDate)
      results.push(response)

      console.log(`[GOOGLE-ADS-CHANGES] ${account.name}: ${response.total} changes`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[GOOGLE-ADS-CHANGES] Error fetching ${account.name}: ${errorMsg}`)

      // Continue with other accounts even if one fails
      results.push({
        changes: [],
        total: 0,
        dateRange: {
          start: startDate.toISOString(),
          end: new Date().toISOString(),
        },
        customerId: account.customerId,
        accountName: account.name,
      })
    }
  }

  return results
}

/**
 * Get change event statistics for a time period
 */
export function getChangeStatistics(changes: ChangeEvent[]): {
  total: number
  byResourceType: Record<string, number>
  byChangeType: Record<string, number>
  byClientType: Record<string, number>
  byCategory: Record<string, number>
  byDay: Record<string, number>
} {
  const stats = {
    total: changes.length,
    byResourceType: {} as Record<string, number>,
    byChangeType: {} as Record<string, number>,
    byClientType: {} as Record<string, number>,
    byCategory: {} as Record<string, number>,
    byDay: {} as Record<string, number>,
  }

  for (const change of changes) {
    // By resource type
    const resourceTypeName = RESOURCE_TYPE_NAMES[change.resourceType] || change.resourceType
    stats.byResourceType[resourceTypeName] = (stats.byResourceType[resourceTypeName] || 0) + 1

    // By change type
    stats.byChangeType[change.changeType] = (stats.byChangeType[change.changeType] || 0) + 1

    // By client type
    const clientType = change.clientType || 'Unknown'
    stats.byClientType[clientType] = (stats.byClientType[clientType] || 0) + 1

    // By category (aggregate from changed fields)
    for (const field of change.changedFields) {
      stats.byCategory[field.category] = (stats.byCategory[field.category] || 0) + 1
    }

    // By day
    const day = new Date(change.changedAt).toISOString().split('T')[0]
    stats.byDay[day] = (stats.byDay[day] || 0) + 1
  }

  return stats
}

/**
 * Filter changes by criteria
 */
export function filterChanges(
  changes: ChangeEvent[],
  filters: {
    resourceType?: string | string[]
    changeType?: string | string[]
    clientType?: string | string[]
    category?: string | string[]
    startDate?: Date
    endDate?: Date
    searchTerm?: string
  }
): ChangeEvent[] {
  return changes.filter((change) => {
    // Resource type filter
    if (filters.resourceType) {
      const types = Array.isArray(filters.resourceType) ? filters.resourceType : [filters.resourceType]
      if (!types.includes(change.resourceType)) return false
    }

    // Change type filter
    if (filters.changeType) {
      const types = Array.isArray(filters.changeType) ? filters.changeType : [filters.changeType]
      if (!types.includes(change.changeType)) return false
    }

    // Client type filter
    if (filters.clientType) {
      const types = Array.isArray(filters.clientType) ? filters.clientType : [filters.clientType]
      if (!types.includes(change.clientType || '')) return false
    }

    // Category filter (check if any changed field matches)
    if (filters.category) {
      const categories = Array.isArray(filters.category) ? filters.category : [filters.category]
      const hasCategory = change.changedFields.some((f) => categories.includes(f.category))
      if (!hasCategory) return false
    }

    // Date range filter
    if (filters.startDate && change.changedAt < filters.startDate.getTime()) return false
    if (filters.endDate && change.changedAt > filters.endDate.getTime()) return false

    // Search term filter (search in summary and resource name)
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase()
      const inSummary = change.summary.toLowerCase().includes(term)
      const inResourceName = change.resourceName.toLowerCase().includes(term)
      const inUserEmail = (change.userEmail || '').toLowerCase().includes(term)
      if (!inSummary && !inResourceName && !inUserEmail) return false
    }

    return true
  })
}

// Export constants for use in UI
export { RESOURCE_TYPE_NAMES, CLIENT_TYPE_NAMES, FIELD_CATEGORIES }
