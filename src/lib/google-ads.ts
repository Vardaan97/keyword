import { KeywordIdea } from '@/types'
import { createClient } from '@supabase/supabase-js'

// Google Ads API v22 (latest as of December 2025)
// v18 sunset, v19/v20/v21 still active, v22 is current
const GOOGLE_ADS_API_VERSION = 'v22'

// Supabase client for faster keyword lookups from imported data
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseKey) return null
  return createClient(supabaseUrl, supabaseKey)
}

import { trackRateLimit, markQuotaExhausted, isConvexConfigured } from './convex'

// NOTE: Old accountKeywordsCacheMap removed - no longer needed
// The new efficient IN clause approach doesn't require caching all account keywords

// ============================================================================
// PER-ACCOUNT RATE LIMITING
// ============================================================================

// Rate limiting: Google Ads API allows ~1 request per second per customer ID
const RATE_LIMIT_DELAY_MS = 1100 // 1.1 seconds between requests

// Per-account tracking for rate limiting
interface AccountRateLimitState {
  lastApiCallTime: number
  requestCount: number
  windowStart: number
  quotaExhausted: boolean
  quotaResetAt?: number
}

const accountRateLimits: Map<string, AccountRateLimitState> = new Map()
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 60 // Max 60 requests per minute per account

/**
 * Get or create rate limit state for an account
 */
function getAccountRateLimitState(accountId: string): AccountRateLimitState {
  const cleanId = accountId.replace(/-/g, '')
  let state = accountRateLimits.get(cleanId)
  if (!state) {
    state = {
      lastApiCallTime: 0,
      requestCount: 0,
      windowStart: Date.now(),
      quotaExhausted: false
    }
    accountRateLimits.set(cleanId, state)
  }
  return state
}

/**
 * Check if rate limit window has reset
 */
function checkWindowReset(state: AccountRateLimitState): void {
  const now = Date.now()
  if (now - state.windowStart > RATE_LIMIT_WINDOW_MS) {
    state.requestCount = 0
    state.windowStart = now
  }
}

/**
 * Check if quota has reset
 */
function checkQuotaReset(state: AccountRateLimitState): void {
  if (state.quotaExhausted && state.quotaResetAt && Date.now() >= state.quotaResetAt) {
    state.quotaExhausted = false
    state.quotaResetAt = undefined
    console.log('[GOOGLE-ADS] Quota cooldown complete, requests allowed again')
  }
}

/**
 * Per-account rate limiting with Convex integration
 * Ensures we don't exceed API rate limits per customer ID
 */
async function rateLimitedDelay(accountId?: string): Promise<{ allowed: boolean; reason?: string }> {
  const cleanId = (accountId || 'default').replace(/-/g, '')
  const state = getAccountRateLimitState(cleanId)

  // Check if quota has reset
  checkQuotaReset(state)

  // If quota exhausted, don't allow requests
  if (state.quotaExhausted) {
    const waitTime = state.quotaResetAt ? state.quotaResetAt - Date.now() : 0
    console.log(`[GOOGLE-ADS] Quota exhausted for account ${cleanId}, reset in ${Math.round(waitTime / 1000)}s`)
    return { allowed: false, reason: `quota_exhausted (reset in ${Math.round(waitTime / 1000)}s)` }
  }

  // Check if we need to reset the window
  checkWindowReset(state)

  // Check if we've exceeded requests per window
  if (state.requestCount >= MAX_REQUESTS_PER_WINDOW) {
    const windowRemaining = RATE_LIMIT_WINDOW_MS - (Date.now() - state.windowStart)
    console.log(`[GOOGLE-ADS] Rate limit reached for account ${cleanId} (${state.requestCount}/${MAX_REQUESTS_PER_WINDOW}), wait ${Math.round(windowRemaining / 1000)}s`)
    // Wait for window to reset
    await new Promise(resolve => setTimeout(resolve, windowRemaining + 100))
    state.requestCount = 0
    state.windowStart = Date.now()
  }

  // Track with Convex if configured
  if (isConvexConfigured()) {
    try {
      const result = await trackRateLimit(cleanId)
      if (result && !result.allowed) {
        console.log(`[GOOGLE-ADS] Convex rate limit denied for ${cleanId}:`, result.reason)
        return result
      }
    } catch (error) {
      console.log('[GOOGLE-ADS] Convex rate limit check failed, using local tracking')
    }
  }

  // Per-request delay (1.1s between requests per account)
  const now = Date.now()
  const timeSinceLastCall = now - state.lastApiCallTime
  if (timeSinceLastCall < RATE_LIMIT_DELAY_MS) {
    const waitTime = RATE_LIMIT_DELAY_MS - timeSinceLastCall
    console.log(`[GOOGLE-ADS] Rate limiting account ${cleanId}: waiting ${waitTime}ms`)
    await new Promise(resolve => setTimeout(resolve, waitTime))
  }

  // Update state
  state.lastApiCallTime = Date.now()
  state.requestCount++

  return { allowed: true }
}

/**
 * Mark an account's quota as exhausted
 * Called when API returns RESOURCE_EXHAUSTED error
 */
export async function markAccountQuotaExhausted(accountId: string, resetInMinutes: number = 5): Promise<void> {
  const cleanId = accountId.replace(/-/g, '')
  const state = getAccountRateLimitState(cleanId)

  state.quotaExhausted = true
  state.quotaResetAt = Date.now() + (resetInMinutes * 60 * 1000)

  console.log(`[GOOGLE-ADS] Marked quota exhausted for account ${cleanId}, reset at ${new Date(state.quotaResetAt).toISOString()}`)

  // Track in Convex if configured
  if (isConvexConfigured()) {
    try {
      await markQuotaExhausted(cleanId, resetInMinutes)
    } catch (error) {
      console.log('[GOOGLE-ADS] Failed to mark quota in Convex:', error)
    }
  }
}

/**
 * Get rate limit status for all accounts (for debugging)
 */
export function getRateLimitStatus(): Record<string, {
  requestCount: number
  windowRemainingMs: number
  quotaExhausted: boolean
  quotaResetAt?: number
}> {
  const status: Record<string, {
    requestCount: number
    windowRemainingMs: number
    quotaExhausted: boolean
    quotaResetAt?: number
  }> = {}

  const now = Date.now()
  for (const [accountId, state] of accountRateLimits) {
    status[accountId] = {
      requestCount: state.requestCount,
      windowRemainingMs: Math.max(0, RATE_LIMIT_WINDOW_MS - (now - state.windowStart)),
      quotaExhausted: state.quotaExhausted,
      quotaResetAt: state.quotaResetAt
    }
  }

  return status
}

/**
 * Normalize keyword for consistent comparison
 * Handles various Google Ads match type formats:
 * - Broad Match Modifier: +azure +certification → azure certification
 * - Phrase Match: "azure certification" → azure certification
 * - Exact Match: [azure certification] → azure certification
 * - Leading quotes/special chars: '+azure → azure
 */
function normalizeKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    .trim()
    // Remove leading/trailing quotes and brackets
    .replace(/^["'\[\]]+|["'\[\]]+$/g, '')
    // Remove + modifiers (Broad Match Modifier)
    .replace(/\+/g, '')
    // Normalize multiple spaces to single space
    .replace(/\s+/g, ' ')
    .trim()
    // Normalize unicode characters
    .normalize('NFKC')
}

// ============================================================================
// EFFICIENT "IN ACCOUNT" CHECK VIA GAQL IN CLAUSE
// ============================================================================

/**
 * Efficiently check if specific keywords exist in a Google Ads account
 * Uses GAQL IN clause - O(1) efficient regardless of total account keywords
 *
 * This is the preferred approach for accounts with large keyword counts (45L+)
 * because it queries only the specific keywords we need instead of fetching all.
 *
 * @param config - Google Ads API config
 * @param customerId - Account to check
 * @param keywords - List of keywords to check (will be batched if > 500)
 * @returns Map of normalized keyword -> { matchType: string }
 */
async function checkKeywordsExistInAccount(
  config: GoogleAdsConfig,
  customerId: string,
  keywords: string[]
): Promise<Map<string, { matchType: string }>> {
  const cleanCustomerId = customerId.replace(/-/g, '')
  const accessToken = await getAccessToken(config)
  const loginCustomerId = config.loginCustomerId.replace(/-/g, '')

  // Normalize keywords for consistent matching
  const normalizedKeywords = keywords.map(k => normalizeKeyword(k))

  // Build keyword list string for GAQL IN clause
  // Escape single quotes in keywords
  const keywordListStr = normalizedKeywords
    .map(k => `'${k.replace(/'/g, "\\'")}'`)
    .join(', ')

  // GAQL query with IN clause - efficient indexed lookup
  const query = `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type
    FROM ad_group_criterion
    WHERE ad_group_criterion.keyword.text IN (${keywordListStr})
      AND ad_group_criterion.type = 'KEYWORD'
      AND ad_group_criterion.status != 'REMOVED'
      AND ad_group_criterion.negative = FALSE
  `

  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:search`

  // Rate limit before API call
  const rateLimitResult = await rateLimitedDelay(cleanCustomerId)
  if (!rateLimitResult.allowed) {
    console.log(`[GOOGLE-ADS] Rate limit blocked for in-account check: ${rateLimitResult.reason}`)
    return new Map()
  }

  console.log(`[GOOGLE-ADS] Checking ${keywords.length} keywords in account ${cleanCustomerId}...`)

  try {
    // Use retry wrapper for resilient API calls
    const data = await withRetry(
      async () => {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': config.developerToken,
            'login-customer-id': loginCustomerId,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query })
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error?.message || 'Failed to check keywords')
        }

        return response.json()
      },
      `checkKeywordsExistInAccount(${cleanCustomerId})`
    )

    const resultMap = new Map<string, { matchType: string }>()

    // Mark found keywords
    if (data.results) {
      for (const result of data.results) {
        const keywordText = normalizeKeyword(result.adGroupCriterion?.keyword?.text || '')
        const matchType = result.adGroupCriterion?.keyword?.matchType || 'UNSPECIFIED'
        if (keywordText) {
          resultMap.set(keywordText, { matchType })
        }
      }
      console.log(`[GOOGLE-ADS] Found ${resultMap.size}/${keywords.length} keywords in account ${cleanCustomerId}`)
    }

    return resultMap
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[GOOGLE-ADS] Error checking keywords in account ${cleanCustomerId}:`, errorMsg)

    // Mark quota exhausted if needed
    if (errorMsg.includes('exhausted') || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
      await markAccountQuotaExhausted(cleanCustomerId, 5)
    }

    return new Map()
  }
}

/**
 * Check keywords against multiple accounts in batches
 * Returns a map of keyword -> Set of account names that contain it
 */
async function checkKeywordsInMultipleAccounts(
  config: GoogleAdsConfig,
  keywords: string[],
  accountIds: string[]
): Promise<Map<string, Set<string>>> {
  const keywordToAccounts = new Map<string, Set<string>>()
  const BATCH_SIZE = 500 // Safe batch size for GAQL IN clause

  for (const accountId of accountIds) {
    const accountName = getAccountName(accountId)
    console.log(`[GOOGLE-ADS] Checking keywords in ${accountName}...`)

    // Process keywords in batches
    for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
      const batch = keywords.slice(i, i + BATCH_SIZE)

      const existsMap = await checkKeywordsExistInAccount(config, accountId, batch)

      for (const [keyword] of existsMap) {
        if (!keywordToAccounts.has(keyword)) {
          keywordToAccounts.set(keyword, new Set())
        }
        keywordToAccounts.get(keyword)!.add(accountName)
      }
    }
  }

  return keywordToAccounts
}

// ============================================================================
// RETRY LOGIC WITH EXPONENTIAL BACKOFF
// ============================================================================

interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  retryableErrors: string[]
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 2000,  // 2 seconds
  maxDelayMs: 30000,  // 30 seconds max
  retryableErrors: [
    'RESOURCE_EXHAUSTED',
    'quota',
    'exhausted',
    'RATE_LIMIT_EXCEEDED',
    'DEADLINE_EXCEEDED',
    '429',  // Too Many Requests
    '503',  // Service Unavailable
    '504',  // Gateway Timeout
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
  ]
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown, config: RetryConfig): boolean {
  const errorMsg = error instanceof Error ? error.message : String(error)
  return config.retryableErrors.some(e => errorMsg.includes(e))
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt)
  // Add jitter (random 0-25% of delay)
  const jitter = exponentialDelay * Math.random() * 0.25
  // Cap at maxDelay
  return Math.min(exponentialDelay + jitter, config.maxDelayMs)
}

/**
 * Retry wrapper with exponential backoff
 * Use this for all Google Ads API calls
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = calculateBackoffDelay(attempt - 1, config)
        console.log(`[GOOGLE-ADS] ${operationName}: Retry ${attempt}/${config.maxRetries} after ${Math.round(delay)}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (!isRetryableError(error, config)) {
        // Non-retryable error - throw immediately
        console.log(`[GOOGLE-ADS] ${operationName}: Non-retryable error: ${lastError.message}`)
        throw lastError
      }

      if (attempt === config.maxRetries) {
        // Last attempt failed
        console.log(`[GOOGLE-ADS] ${operationName}: Max retries (${config.maxRetries}) exceeded`)
        throw lastError
      }

      console.log(`[GOOGLE-ADS] ${operationName}: Retryable error (attempt ${attempt + 1}): ${lastError.message}`)
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError || new Error('Unknown error in retry loop')
}

// ============================================================================
// GOOGLE ADS ACCOUNT CONFIGURATION
// ============================================================================

// Google Ads Account configuration
export interface GoogleAdsAccount {
  id: string
  name: string
  customerId: string
  currency: 'INR' | 'USD' | string  // Account billing currency
  priority?: number  // Higher = check first for "in account" (Bouquet has most keywords)
}

// Available accounts under the MCC (Manager account)
// These are the sub-accounts accessible via the login customer ID
// Priority: Higher number = check first for "in account" status
// Flexi is the primary focus account for keyword research
export const GOOGLE_ADS_ACCOUNTS: GoogleAdsAccount[] = [
  { id: 'all-accounts', name: 'All Accounts', customerId: 'ALL', currency: 'INR' },  // Check all accounts
  { id: 'flexi', name: 'Flexi', customerId: '3515012934', currency: 'INR', priority: 3 },  // Primary focus - default
  { id: 'bouquet-inr', name: 'Bouquet INR', customerId: '6153038296', currency: 'INR', priority: 2 },
  { id: 'bouquet-inr-2', name: 'Bouquet INR - 2', customerId: '6601080005', currency: 'INR', priority: 1 }
]

// Get all real account IDs (excluding the "ALL" option)
export function getRealAccountIds(): string[] {
  return GOOGLE_ADS_ACCOUNTS
    .filter(acc => acc.customerId !== 'ALL')
    .map(acc => acc.customerId)
}

interface GoogleAdsConfig {
  developerToken: string
  clientId: string
  clientSecret: string
  refreshToken: string
  loginCustomerId: string
}

interface KeywordPlannerRequest {
  customerId: string
  seedKeywords: string[]
  pageUrl?: string
  geoTargetConstants?: string[]
  language?: string
  checkAllAccounts?: boolean  // If true, check "in account" against all accounts
  allAccountIds?: string[]    // List of all account IDs to check against
}

// NOTE: Old getAccountKeywords() function REMOVED
// It was inefficient for large accounts (45L+ keywords) because it fetched ALL keywords via pagination.
// Replaced by checkKeywordsExistInAccount() which uses GAQL IN clause for O(1) efficient lookups.

/**
 * Get account name by customer ID
 */
export function getAccountName(customerId: string): string {
  const cleanId = customerId.replace(/-/g, '')
  const account = GOOGLE_ADS_ACCOUNTS.find(acc => acc.customerId === cleanId)
  return account?.name || `Account ${cleanId}`
}

/**
 * Get all keywords from Supabase for a specific account
 * This uses our imported Google Ads data for faster lookups
 * Returns: Map of lowercase keyword -> { accountName, matchType }
 */
export async function getKeywordsFromSupabase(customerId?: string): Promise<Map<string, { accountName: string; matchType: string | null }>> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    console.log('[GOOGLE-ADS-SUPABASE] Supabase not configured, skipping')
    return new Map()
  }

  console.log('[GOOGLE-ADS-SUPABASE] Fetching keywords from Supabase...')

  try {
    // First, check if we have any data at all
    const { count: totalCount } = await supabase
      .from('gads_keywords')
      .select('*', { count: 'exact', head: true })

    console.log(`[GOOGLE-ADS-SUPABASE] Total keywords in database: ${totalCount || 0}`)

    if (!totalCount || totalCount === 0) {
      console.log('[GOOGLE-ADS-SUPABASE] No keywords found in database')
      return new Map()
    }

    // Query keywords with their account info using a simpler approach
    // First get keywords, then join manually if needed
    const { data, error } = await supabase
      .from('gads_keywords')
      .select(`
        keyword_text,
        match_type,
        status,
        ad_group_id,
        gads_ad_groups (
          name,
          campaign_id,
          gads_campaigns (
            name,
            account_id,
            gads_accounts (
              customer_id,
              name
            )
          )
        )
      `)
      .neq('status', 'Removed')
      .limit(50000)

    if (error) {
      console.error('[GOOGLE-ADS-SUPABASE] Error fetching keywords:', error.message)
      console.error('[GOOGLE-ADS-SUPABASE] Error details:', JSON.stringify(error, null, 2))
      return new Map()
    }

    console.log(`[GOOGLE-ADS-SUPABASE] Query returned ${data?.length || 0} rows`)

    const keywordMap = new Map<string, { accountName: string; matchType: string | null }>()

    if (data && data.length > 0) {
      // Debug: Log first raw result to understand structure
      console.log('[GOOGLE-ADS-SUPABASE] First result structure:', JSON.stringify(data[0], null, 2))

      for (const kw of data) {
        // Navigate the nested structure carefully
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adGroups = kw.gads_ad_groups as any
        // Handle both single object and array cases
        const adGroup = Array.isArray(adGroups) ? adGroups[0] : adGroups
        const campaigns = adGroup?.gads_campaigns
        const campaign = Array.isArray(campaigns) ? campaigns[0] : campaigns
        const accounts = campaign?.gads_accounts
        const account = Array.isArray(accounts) ? accounts[0] : accounts

        const accountName = account?.name || 'Unknown'
        // Use normalizeKeyword for consistent comparison with API keywords
        const keywordText = kw.keyword_text ? normalizeKeyword(kw.keyword_text) : null

        if (keywordText) {
          keywordMap.set(keywordText, {
            accountName,
            matchType: kw.match_type
          })
        }
      }
    }

    console.log(`[GOOGLE-ADS-SUPABASE] Parsed ${keywordMap.size} unique keywords`)

    // Debug: Show sample keywords to verify format
    if (keywordMap.size > 0) {
      const sampleKeywords = Array.from(keywordMap.entries()).slice(0, 5)
      console.log('[GOOGLE-ADS-SUPABASE] Sample keywords from Supabase:')
      sampleKeywords.forEach(([kw, info]) => {
        console.log(`  - "${kw}" (account: ${info.accountName}, match: ${info.matchType})`)
      })
    } else if (data && data.length > 0) {
      console.log('[GOOGLE-ADS-SUPABASE] WARNING: Data returned but no keywords parsed!')
      console.log('[GOOGLE-ADS-SUPABASE] Check the data structure above')
    }

    return keywordMap
  } catch (error) {
    console.error('[GOOGLE-ADS-SUPABASE] Error:', error)
    return new Map()
  }
}

/**
 * Check if keywords exist in any account using Supabase
 * Returns: Map of keyword -> array of account names that contain it
 */
export async function checkKeywordsInAccounts(keywords: string[]): Promise<Map<string, string[]>> {
  const supabase = getSupabaseClient()
  if (!supabase || keywords.length === 0) {
    return new Map()
  }

  console.log(`[GOOGLE-ADS-SUPABASE] Checking ${keywords.length} keywords against Supabase...`)

  try {
    // Normalize keywords for consistent comparison
    const normalizedKeywords = keywords.map(k => normalizeKeyword(k))

    // Query all keywords with nested joins
    const { data, error } = await supabase
      .from('gads_keywords')
      .select(`
        keyword_text,
        gads_ad_groups (
          gads_campaigns (
            gads_accounts (
              name
            )
          )
        )
      `)
      .neq('status', 'Removed')
      .limit(50000)

    if (error) {
      console.error('[GOOGLE-ADS-SUPABASE] Error checking keywords:', error.message)
      return new Map()
    }

    // Create a Set from normalized keywords for O(1) lookup
    const keywordSet = new Set(normalizedKeywords)
    const resultMap = new Map<string, string[]>()

    if (data) {
      for (const kw of data) {
        // Use normalizeKeyword for consistent comparison
        const keywordText = kw.keyword_text ? normalizeKeyword(kw.keyword_text) : null

        // Only process if this keyword is in our search set
        if (keywordText && keywordSet.has(keywordText)) {
          // Navigate the nested structure carefully
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const adGroups = kw.gads_ad_groups as any
          const adGroup = Array.isArray(adGroups) ? adGroups[0] : adGroups
          const campaigns = adGroup?.gads_campaigns
          const campaign = Array.isArray(campaigns) ? campaigns[0] : campaigns
          const accounts = campaign?.gads_accounts
          const account = Array.isArray(accounts) ? accounts[0] : accounts

          const accountName = account?.name || 'Unknown'

          if (!resultMap.has(keywordText)) {
            resultMap.set(keywordText, [])
          }
          const accountList = resultMap.get(keywordText)!
          if (!accountList.includes(accountName)) {
            accountList.push(accountName)
          }
        }
      }
    }

    console.log(`[GOOGLE-ADS-SUPABASE] Found ${resultMap.size}/${keywords.length} keywords in accounts`)
    return resultMap
  } catch (error) {
    console.error('[GOOGLE-ADS-SUPABASE] Error:', error)
    return new Map()
  }
}

// Map to track which accounts contain which keywords (keyword -> account names)
type AccountKeywordsMap = Map<string, Set<string>>

// ============================================================================
// PAGINATION HELPERS FOR KEYWORD IDEAS
// ============================================================================

/**
 * Fetch a single page of keyword ideas from the API
 */
async function fetchKeywordIdeasPage(
  config: GoogleAdsConfig,
  customerId: string,
  requestBody: Record<string, unknown>
): Promise<{ results: Record<string, unknown>[]; nextPageToken?: string }> {
  const cleanCustomerId = customerId.replace(/-/g, '')
  const loginCustomerId = config.loginCustomerId.replace(/-/g, '')
  const accessToken = await getAccessToken(config)

  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}:generateKeywordIdeas`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': config.developerToken,
      'login-customer-id': loginCustomerId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const error = await response.json()
    const errorMsg = error.error?.message || 'Failed to fetch keyword ideas'

    // Provide more helpful error message for quota issues
    if (errorMsg.includes('exhausted') || errorMsg.includes('quota')) {
      throw new Error('Google Ads API quota exhausted. Please wait a few minutes and try again, or use Keywords Everywhere as the data source.')
    }
    throw new Error(errorMsg)
  }

  return response.json()
}

/**
 * Parse keyword ideas from API response
 */
function parseKeywordIdeasResponse(
  results: Record<string, unknown>[],
  bidCurrency: string
): KeywordIdea[] {
  return results.map(result => {
    const metrics = result.keywordIdeaMetrics as Record<string, unknown> || {}

    // Parse competition
    let competition: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED' = 'UNSPECIFIED'
    const competitionStr = String(metrics.competition || '')
    if (competitionStr === 'LOW') competition = 'LOW'
    else if (competitionStr === 'MEDIUM') competition = 'MEDIUM'
    else if (competitionStr === 'HIGH') competition = 'HIGH'

    return {
      keyword: result.text as string,
      avgMonthlySearches: Number(metrics.avgMonthlySearches) || 0,
      competition,
      competitionIndex: Number(metrics.competitionIndex) || 0,
      lowTopOfPageBidMicros: Number(metrics.lowTopOfPageBidMicros) || undefined,
      highTopOfPageBidMicros: Number(metrics.highTopOfPageBidMicros) || undefined,
      bidCurrency,
      inAccount: false,
      inAccountNames: []
    }
  })
}

export async function getKeywordIdeas(
  config: GoogleAdsConfig,
  request: KeywordPlannerRequest
): Promise<KeywordIdea[]> {
  console.log('[GOOGLE-ADS] Starting keyword ideas request')
  console.log('[GOOGLE-ADS] API Version:', GOOGLE_ADS_API_VERSION)
  console.log('[GOOGLE-ADS] Seeds:', request.seedKeywords)
  console.log('[GOOGLE-ADS] Geo Targets:', request.geoTargetConstants)
  console.log('[GOOGLE-ADS] Check All Accounts:', request.checkAllAccounts || false)

  // Get currency for bid display - default to INR for Indian accounts
  const currentAccount = GOOGLE_ADS_ACCOUNTS.find(acc => acc.customerId === request.customerId.replace(/-/g, ''))
  const bidCurrency = currentAccount?.currency || 'INR'

  // Determine which accounts to check based on user selection
  const accountsToCheck: string[] = []
  if (request.checkAllAccounts && request.allAccountIds && request.allAccountIds.length > 0) {
    accountsToCheck.push(...request.allAccountIds)
    console.log(`[GOOGLE-ADS] Mode: ALL ACCOUNTS (${accountsToCheck.length} accounts)`)
  } else {
    accountsToCheck.push(request.customerId)
    console.log(`[GOOGLE-ADS] Mode: SINGLE ACCOUNT (${getAccountName(request.customerId)})`)
  }

  // NOTE: New efficient approach - we first get keyword ideas with PAGINATION,
  // THEN check only those specific keywords against account(s) using GAQL IN clause.
  // This works efficiently even for accounts with 45L+ keywords.

  const customerId = request.customerId.replace(/-/g, '')

  // Build the base request body
  // Note: Google Ads API only allows ONE seed type at a time (keywordSeed OR urlSeed)
  // pageSize controls the max results per page (up to 1000)
  const baseRequestBody: Record<string, unknown> = {
    geoTargetConstants: request.geoTargetConstants || ['geoTargetConstants/2356'], // India
    language: request.language || 'languageConstants/1000', // English
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    includeAdultKeywords: false,
    pageSize: 1000,
    historicalMetricsOptions: {
      includeAverageCpc: true
    }
  }

  // Only use keywordSeed - Google Ads API doesn't allow both seeds at once
  if (request.seedKeywords && request.seedKeywords.length > 0) {
    baseRequestBody.keywordSeed = {
      keywords: request.seedKeywords
    }
    console.log('[GOOGLE-ADS] Using keywordSeed with', request.seedKeywords.length, 'keywords:', request.seedKeywords.join(', '))
  } else if (request.pageUrl) {
    // Fallback to urlSeed only if no keywords provided
    baseRequestBody.urlSeed = {
      url: request.pageUrl
    }
    console.log('[GOOGLE-ADS] Using urlSeed:', request.pageUrl)
  }

  // ============================================================================
  // PAGINATION LOOP - Fetch ALL pages of keyword ideas
  // ============================================================================
  const MAX_PAGES = 10  // Safety limit: 10 pages = 10,000 keywords max
  const allKeywordIdeas: KeywordIdea[] = []
  let pageToken: string | undefined = undefined
  let pageCount = 0

  console.log('[GOOGLE-ADS] Starting pagination - fetching ALL keyword ideas...')

  do {
    // Build request body for this page
    const requestBody = { ...baseRequestBody }
    if (pageToken) {
      requestBody.pageToken = pageToken
    }

    // Rate limit before each API call
    const rateLimitResult = await rateLimitedDelay(customerId)
    if (!rateLimitResult.allowed) {
      console.log(`[GOOGLE-ADS] Rate limit hit after ${pageCount} pages, returning partial results`)
      break
    }

    // Fetch page with retry wrapper
    const data = await withRetry(
      async () => fetchKeywordIdeasPage(config, customerId, requestBody),
      `getKeywordIdeas-page${pageCount + 1}`
    )

    // Parse this page's keywords
    const pageKeywords = parseKeywordIdeasResponse(data.results || [], bidCurrency)
    allKeywordIdeas.push(...pageKeywords)

    // Get next page token
    pageToken = data.nextPageToken
    pageCount++

    console.log(`[GOOGLE-ADS] Fetched page ${pageCount}: ${pageKeywords.length} keywords (total: ${allKeywordIdeas.length})`)

    // Log sample from first page
    if (pageCount === 1 && data.results && data.results.length > 0) {
      console.log('[GOOGLE-ADS] Sample result structure (first keyword):', JSON.stringify(data.results[0], null, 2))
    }

  } while (pageToken && pageCount < MAX_PAGES)

  console.log(`[GOOGLE-ADS] Pagination complete: ${allKeywordIdeas.length} keywords fetched across ${pageCount} page(s)`)

  if (pageToken) {
    console.log('[GOOGLE-ADS] WARNING: More pages available but hit MAX_PAGES limit')
  }

  // Filter out zero-volume keywords which are less useful
  const filteredIdeas = allKeywordIdeas.filter(kw => kw.avgMonthlySearches > 0)

  console.log('[GOOGLE-ADS] Keywords with volume:', filteredIdeas.length)

  if (filteredIdeas.length > 0) {
    console.log('[GOOGLE-ADS] Top keyword:', filteredIdeas[0].keyword, '- volume:', filteredIdeas[0].avgMonthlySearches)
  }

  // STEP 2: Efficient "in account" check using GAQL IN clause
  // This queries only the specific keywords we need - works for accounts with 45L+ keywords
  console.log('[GOOGLE-ADS] STEP 2: Checking "in account" status using efficient IN clause...')

  const keywordsToCheck = filteredIdeas.map(k => k.keyword)

  if (keywordsToCheck.length > 0 && accountsToCheck.length > 0) {
    try {
      // Use efficient IN clause lookup instead of fetching all account keywords
      const keywordToAccounts = await checkKeywordsInMultipleAccounts(
        config,
        keywordsToCheck,
        accountsToCheck
      )

      // Enrich keyword ideas with "in account" info
      let inAccountCount = 0
      for (const kw of filteredIdeas) {
        const normalized = normalizeKeyword(kw.keyword)
        const accounts = keywordToAccounts.get(normalized)
        if (accounts && accounts.size > 0) {
          kw.inAccount = true
          kw.inAccountNames = Array.from(accounts)
          inAccountCount++
        }
      }

      console.log('[GOOGLE-ADS] Keywords already in account:', inAccountCount, '/', filteredIdeas.length)

      // Debug: Show sample "in account" keywords
      if (inAccountCount > 0) {
        const inAccountKeywords = filteredIdeas.filter(kw => kw.inAccount).slice(0, 5)
        console.log('[GOOGLE-ADS] Sample "in account" keywords:')
        inAccountKeywords.forEach(kw => {
          console.log(`  - "${kw.keyword}" (accounts: ${kw.inAccountNames?.join(', ') || 'N/A'})`)
        })
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('[GOOGLE-ADS] Error checking "in account" status:', errorMsg)
      // Continue without "in account" info - keywords still have search volume data
    }
  }

  if (filteredIdeas.length > 0) {
    console.log('[GOOGLE-ADS] Volume range:', filteredIdeas[filteredIdeas.length - 1].avgMonthlySearches, '-', filteredIdeas[0].avgMonthlySearches)
  }

  return filteredIdeas
}

// Token cache to avoid regenerating on every request
let cachedAccessToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(config: GoogleAdsConfig): Promise<string> {
  // Check if we have a valid cached token (with 5 minute buffer)
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    console.log('[GOOGLE-ADS] Using cached access token')
    return cachedAccessToken.token
  }

  const tokenUrl = 'https://oauth2.googleapis.com/token'
  console.log('[GOOGLE-ADS] Requesting new access token...')

  // Use retry wrapper for token refresh (can have transient failures)
  // Use shorter retries for auth - auth errors are usually not transient
  const authRetryConfig: RetryConfig = {
    maxRetries: 2,
    baseDelayMs: 1000,
    maxDelayMs: 5000,
    retryableErrors: ['503', '504', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'fetch failed']
  }

  const data = await withRetry(
    async () => {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: config.refreshToken,
          grant_type: 'refresh_token'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('[GOOGLE-ADS] Token error:', error)

        // Provide specific guidance for token expiration/revocation
        // These are non-retryable errors
        if (error.error === 'invalid_grant') {
          const errorDesc = error.error_description || ''
          if (errorDesc.includes('expired') || errorDesc.includes('revoked')) {
            throw new Error(
              'Token has been expired or revoked. ' +
              'Please visit /api/auth/google-ads to get a new refresh token, ' +
              'then update GOOGLE_ADS_REFRESH_TOKEN in your .env.local file and restart the server.'
            )
          }
        }

        throw new Error(error.error_description || 'Failed to get access token')
      }

      return response.json()
    },
    'getAccessToken',
    authRetryConfig
  )

  console.log('[GOOGLE-ADS] Token expires in:', data.expires_in, 'seconds')

  // Cache the token
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000)
  }

  return data.access_token
}

export function getGoogleAdsConfig(refreshTokenOverride?: string): GoogleAdsConfig {
  return {
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    clientId: process.env.GOOGLE_ADS_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
    refreshToken: refreshTokenOverride || process.env.GOOGLE_ADS_REFRESH_TOKEN || '',
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || ''
  }
}

export function getDefaultCustomerId(): string {
  return process.env.GOOGLE_ADS_CUSTOMER_ID || ''
}
