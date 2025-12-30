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

// Per-account cache for keywords (refreshed every 30 minutes to reduce API calls)
const accountKeywordsCacheMap: Map<string, { keywords: Set<string>; timestamp: number }> = new Map()
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes (increased to reduce API calls)

// Rate limiting: Google Ads API allows ~1 request per second per customer ID
const RATE_LIMIT_DELAY_MS = 1100 // 1.1 seconds between requests
let lastApiCallTime = 0

async function rateLimitedDelay(): Promise<void> {
  const now = Date.now()
  const timeSinceLastCall = now - lastApiCallTime
  if (timeSinceLastCall < RATE_LIMIT_DELAY_MS) {
    const waitTime = RATE_LIMIT_DELAY_MS - timeSinceLastCall
    console.log(`[GOOGLE-ADS] Rate limiting: waiting ${waitTime}ms`)
    await new Promise(resolve => setTimeout(resolve, waitTime))
  }
  lastApiCallTime = Date.now()
}

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

/**
 * Fetch all keywords currently in a specific Google Ads account
 * Uses per-account caching to support multiple sub-accounts under MCC
 * Implements pagination to get ALL keywords (not limited to 10k)
 */
async function getAccountKeywords(config: GoogleAdsConfig, customerId: string): Promise<Set<string>> {
  const cleanCustomerId = customerId.replace(/-/g, '')

  // Check per-account cache first
  const cached = accountKeywordsCacheMap.get(cleanCustomerId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[GOOGLE-ADS] Using cached keywords for account ${cleanCustomerId}:`, cached.keywords.size, 'keywords')
    return cached.keywords
  }

  console.log(`[GOOGLE-ADS] Fetching ALL keywords for account ${cleanCustomerId}...`)
  const accessToken = await getAccessToken(config)
  const loginCustomerId = config.loginCustomerId.replace(/-/g, '')

  const keywords = new Set<string>()
  let pageToken: string | undefined = undefined
  let pageCount = 0
  const PAGE_SIZE = 10000

  // Pagination loop to get ALL keywords (with rate limiting)
  do {
    pageCount++

    // Rate limit between pages
    await rateLimitedDelay()

    console.log(`[GOOGLE-ADS] Fetching page ${pageCount} for account ${cleanCustomerId}...`)

    // Query to get all active keywords in the account
    // Using ad_group_criterion directly for more reliable results
    const query = `
      SELECT
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type
      FROM ad_group_criterion
      WHERE ad_group_criterion.type = 'KEYWORD'
        AND ad_group_criterion.status != 'REMOVED'
        AND ad_group_criterion.negative = FALSE
      ORDER BY ad_group_criterion.keyword.text
      LIMIT ${PAGE_SIZE}
    `

    const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:search`

    try {
      const requestBody: Record<string, unknown> = { query }
      if (pageToken) {
        requestBody.pageToken = pageToken
      }

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
        const errorMsg = error.error?.message || 'Unknown error'
        console.error(`[GOOGLE-ADS] Failed to fetch keywords for account ${cleanCustomerId}:`, errorMsg)
        // If quota exhausted, break and use what we have
        if (errorMsg.includes('exhausted') || errorMsg.includes('quota')) {
          console.log(`[GOOGLE-ADS] Quota exhausted, using ${keywords.size} keywords collected so far`)
        }
        break
      }

      const data = await response.json()

      if (data.results) {
        for (const result of data.results) {
          const keywordText = result.adGroupCriterion?.keyword?.text
          if (keywordText) {
            keywords.add(keywordText.toLowerCase())
          }
        }
        console.log(`[GOOGLE-ADS] Page ${pageCount}: Got ${data.results.length} keywords, total so far: ${keywords.size}`)
      }

      // Check for next page
      pageToken = data.nextPageToken
    } catch (error) {
      console.error(`[GOOGLE-ADS] Error fetching keywords page ${pageCount} for account ${cleanCustomerId}:`, error)
      break
    }
  } while (pageToken && pageCount < 5) // Reduced to 5 pages (50k keywords) to avoid quota issues

  console.log(`[GOOGLE-ADS] TOTAL: Found ${keywords.size} keywords in account ${cleanCustomerId} (${pageCount} pages)`)

  // Update per-account cache
  accountKeywordsCacheMap.set(cleanCustomerId, {
    keywords,
    timestamp: Date.now()
  })

  return keywords
}

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
        const keywordText = kw.keyword_text?.toLowerCase().trim()

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
    // Normalize keywords to lowercase for comparison
    const normalizedKeywords = keywords.map(k => k.toLowerCase().trim())

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
        const keywordText = kw.keyword_text?.toLowerCase().trim()

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

export async function getKeywordIdeas(
  config: GoogleAdsConfig,
  request: KeywordPlannerRequest
): Promise<KeywordIdea[]> {
  console.log('[GOOGLE-ADS] Starting keyword ideas request')
  console.log('[GOOGLE-ADS] API Version:', GOOGLE_ADS_API_VERSION)
  console.log('[GOOGLE-ADS] Seeds:', request.seedKeywords)
  console.log('[GOOGLE-ADS] Geo Targets:', request.geoTargetConstants)
  console.log('[GOOGLE-ADS] Check All Accounts:', request.checkAllAccounts || false)

  // Fetch account keywords - either from single account or all accounts
  let accountKeywords: Set<string> = new Set()
  // Map keyword -> list of account names that contain it
  const keywordToAccounts: AccountKeywordsMap = new Map()
  const accessToken = await getAccessToken(config)

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

  // STEP 1: ALWAYS fetch from Google Ads API for accurate "in account" checking
  // API is the source of truth - Supabase is only a fallback
  console.log('[GOOGLE-ADS] STEP 1: Fetching keywords from Google Ads API (PRIMARY)...')
  let apiSuccessful = false

  for (const accId of accountsToCheck) {
    const accountName = getAccountName(accId)
    console.log(`[GOOGLE-ADS] Fetching from ${accountName} (${accId})...`)

    try {
      const keywords = await getAccountKeywords(config, accId)

      if (keywords.size > 0) {
        apiSuccessful = true
        for (const kw of keywords) {
          accountKeywords.add(kw)
          if (!keywordToAccounts.has(kw)) {
            keywordToAccounts.set(kw, new Set())
          }
          keywordToAccounts.get(kw)!.add(accountName)
        }
        console.log(`[GOOGLE-ADS] ✓ ${accountName}: ${keywords.size} keywords (total: ${accountKeywords.size})`)
      } else {
        console.log(`[GOOGLE-ADS] ⚠ ${accountName}: 0 keywords returned`)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[GOOGLE-ADS] ✗ ${accountName} failed:`, errorMsg)

      // Check if it's a quota error
      if (errorMsg.includes('exhausted') || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        console.log('[GOOGLE-ADS] Quota exhausted - will try Supabase fallback')
        break // Stop trying more accounts
      }
      // Continue with other accounts for non-quota errors
    }
  }

  // STEP 2: FALLBACK to Supabase if API failed or returned no data
  if (!apiSuccessful || accountKeywords.size === 0) {
    console.log('[GOOGLE-ADS] STEP 2: API failed/empty - trying Supabase fallback...')

    try {
      const supabaseKeywords = await getKeywordsFromSupabase()
      if (supabaseKeywords.size > 0) {
        console.log(`[GOOGLE-ADS] Supabase fallback: Found ${supabaseKeywords.size} keywords`)
        for (const [kw, info] of supabaseKeywords) {
          accountKeywords.add(kw)
          if (!keywordToAccounts.has(kw)) {
            keywordToAccounts.set(kw, new Set())
          }
          keywordToAccounts.get(kw)!.add(info.accountName)
        }
      } else {
        console.log('[GOOGLE-ADS] Supabase fallback also empty')
      }
    } catch (supabaseError) {
      console.log('[GOOGLE-ADS] Supabase fallback failed:', supabaseError)
    }
  } else {
    console.log('[GOOGLE-ADS] STEP 2: Skipping Supabase - API returned data successfully')
  }

  console.log('[GOOGLE-ADS] TOTAL unique keywords for "in account" check:', accountKeywords.size)
  console.log('[GOOGLE-ADS] Access token obtained successfully')

  const customerId = request.customerId.replace(/-/g, '')
  const loginCustomerId = config.loginCustomerId.replace(/-/g, '')

  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}:generateKeywordIdeas`
  console.log('[GOOGLE-ADS] Request URL:', url)

  // Build the request body
  // Note: Google Ads API only allows ONE seed type at a time (keywordSeed OR urlSeed)
  // pageSize controls the max results (up to 1000)
  const requestBody: Record<string, unknown> = {
    // Default to India geo target if not specified
    geoTargetConstants: request.geoTargetConstants || ['geoTargetConstants/2356'], // India
    language: request.language || 'languageConstants/1000', // English
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    includeAdultKeywords: false,
    // Request more results - Google may return fewer based on relevance
    pageSize: 1000,
    // Request keyword annotations to get "in account" status
    historicalMetricsOptions: {
      includeAverageCpc: true
    }
  }

  // Only use keywordSeed - Google Ads API doesn't allow both seeds at once
  if (request.seedKeywords && request.seedKeywords.length > 0) {
    requestBody.keywordSeed = {
      keywords: request.seedKeywords
    }
    console.log('[GOOGLE-ADS] Using keywordSeed with', request.seedKeywords.length, 'keywords:', request.seedKeywords.join(', '))
  } else if (request.pageUrl) {
    // Fallback to urlSeed only if no keywords provided
    requestBody.urlSeed = {
      url: request.pageUrl
    }
    console.log('[GOOGLE-ADS] Using urlSeed:', request.pageUrl)
  }

  console.log('[GOOGLE-ADS] Request body:', JSON.stringify(requestBody, null, 2))

  // Rate limit before making the generateKeywordIdeas call
  await rateLimitedDelay()

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

  console.log('[GOOGLE-ADS] Response status:', response.status)

  if (!response.ok) {
    const error = await response.json()
    const errorMsg = error.error?.message || 'Failed to fetch keyword ideas'
    console.error('[GOOGLE-ADS] API Error:', JSON.stringify(error, null, 2))

    // Provide more helpful error message for quota issues
    if (errorMsg.includes('exhausted') || errorMsg.includes('quota')) {
      throw new Error('Google Ads API quota exhausted. Please wait a few minutes and try again, or use Keywords Everywhere as the data source.')
    }
    throw new Error(errorMsg)
  }

  const data = await response.json()
  console.log('[GOOGLE-ADS] Raw results count:', data.results?.length || 0)
  if (data.nextPageToken) {
    console.log('[GOOGLE-ADS] Has next page token - more results available')
  }

  // Log first few results to debug keywordAnnotations structure
  if (data.results && data.results.length > 0) {
    console.log('[GOOGLE-ADS] Sample result structure (first keyword):', JSON.stringify(data.results[0], null, 2))
    // Check if any results have keywordAnnotations
    const withAnnotations = data.results.filter((r: Record<string, unknown>) => r.keywordAnnotations)
    console.log('[GOOGLE-ADS] Results with keywordAnnotations:', withAnnotations.length)
    if (withAnnotations.length > 0) {
      console.log('[GOOGLE-ADS] Sample annotation:', JSON.stringify(withAnnotations[0].keywordAnnotations, null, 2))
    }
  }

  // Parse the response
  let inAccountCount = 0
  const keywordIdeas: KeywordIdea[] = (data.results || []).map((result: Record<string, unknown>) => {
    const metrics = result.keywordIdeaMetrics as Record<string, unknown> || {}

    // Parse competition
    let competition: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED' = 'UNSPECIFIED'
    const competitionStr = String(metrics.competition || '')
    if (competitionStr === 'LOW') competition = 'LOW'
    else if (competitionStr === 'MEDIUM') competition = 'MEDIUM'
    else if (competitionStr === 'HIGH') competition = 'HIGH'

    // Check if keyword is already in the Google Ads account
    // Cross-reference against actual keywords fetched from the account
    // IMPORTANT: Must match the same normalization used when fetching from Supabase
    const keywordText = (result.text as string).toLowerCase().trim()
    const inAccount = accountKeywords.has(keywordText)
    // Get list of account names that contain this keyword
    const accountsWithKeyword = keywordToAccounts.get(keywordText)
    const inAccountNames = accountsWithKeyword ? Array.from(accountsWithKeyword) : []

    if (inAccount) inAccountCount++

    return {
      keyword: result.text as string,
      avgMonthlySearches: Number(metrics.avgMonthlySearches) || 0,
      competition,
      competitionIndex: Number(metrics.competitionIndex) || 0,
      lowTopOfPageBidMicros: Number(metrics.lowTopOfPageBidMicros) || undefined,
      highTopOfPageBidMicros: Number(metrics.highTopOfPageBidMicros) || undefined,
      bidCurrency,  // Include the account's currency for proper display
      inAccount,
      inAccountNames  // List of account names containing this keyword
    }
  })

  // Filter out zero-volume keywords which are less useful
  const filteredIdeas = keywordIdeas.filter(kw => kw.avgMonthlySearches > 0)

  console.log('[GOOGLE-ADS] Parsed keyword ideas:', keywordIdeas.length, '(with volume:', filteredIdeas.length, ')')
  console.log('[GOOGLE-ADS] Keywords already in account:', inAccountCount, '/', filteredIdeas.length)

  // Debug: Show which keywords are in account
  if (inAccountCount > 0) {
    const inAccountKeywords = filteredIdeas.filter(kw => kw.inAccount).slice(0, 5)
    console.log('[GOOGLE-ADS] Sample "in account" keywords:')
    inAccountKeywords.forEach(kw => {
      console.log(`  - "${kw.keyword}" (accounts: ${kw.inAccountNames?.join(', ') || 'N/A'})`)
    })
  } else if (accountKeywords.size > 0) {
    // Debug: Check why no matches - show sample keywords from both sides
    console.log('[GOOGLE-ADS] WARNING: No keyword matches found!')
    console.log('[GOOGLE-ADS] Sample from Google API (first 5):')
    filteredIdeas.slice(0, 5).forEach(kw => {
      console.log(`  - "${kw.keyword.toLowerCase().trim()}"`)
    })
    console.log('[GOOGLE-ADS] Sample from Account (first 5):')
    Array.from(accountKeywords).slice(0, 5).forEach(kw => {
      console.log(`  - "${kw}"`)
    })
  }

  if (filteredIdeas.length > 0) {
    console.log('[GOOGLE-ADS] Top keyword:', filteredIdeas[0].keyword, '- volume:', filteredIdeas[0].avgMonthlySearches)
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

  const data = await response.json()
  console.log('[GOOGLE-ADS] Token expires in:', data.expires_in, 'seconds')

  // Cache the token
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000)
  }

  return data.access_token
}

export function getGoogleAdsConfig(): GoogleAdsConfig {
  return {
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    clientId: process.env.GOOGLE_ADS_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN || '',
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || ''
  }
}

export function getDefaultCustomerId(): string {
  return process.env.GOOGLE_ADS_CUSTOMER_ID || ''
}
