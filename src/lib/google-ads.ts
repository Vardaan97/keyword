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
    // Query keywords with their account info
    let query = supabase
      .from('gads_keywords')
      .select(`
        keyword_text,
        match_type,
        gads_ad_groups!inner (
          gads_campaigns!inner (
            gads_accounts!inner (
              customer_id,
              name
            )
          )
        )
      `)
      .neq('status', 'Removed')
      .limit(50000) // Get all keywords

    if (customerId) {
      const cleanId = customerId.replace(/-/g, '')
      // Filter by customer_id if specified
      query = query.eq('gads_ad_groups.gads_campaigns.gads_accounts.customer_id', cleanId)
    }

    const { data, error } = await query

    if (error) {
      console.error('[GOOGLE-ADS-SUPABASE] Error fetching keywords:', error.message)
      return new Map()
    }

    const keywordMap = new Map<string, { accountName: string; matchType: string | null }>()

    if (data) {
      for (const kw of data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adGroup = kw.gads_ad_groups as any
        const accountName = adGroup?.gads_campaigns?.gads_accounts?.name || 'Unknown'
        const keywordText = kw.keyword_text?.toLowerCase()
        if (keywordText) {
          keywordMap.set(keywordText, {
            accountName,
            matchType: kw.match_type
          })
        }
      }
    }

    console.log(`[GOOGLE-ADS-SUPABASE] Found ${keywordMap.size} keywords in Supabase`)
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
    const normalizedKeywords = keywords.map(k => k.toLowerCase())

    // Query all matching keywords
    const { data, error } = await supabase
      .from('gads_keywords')
      .select(`
        keyword_text,
        gads_ad_groups!inner (
          gads_campaigns!inner (
            gads_accounts!inner (
              name
            )
          )
        )
      `)
      .in('keyword_text', normalizedKeywords)
      .neq('status', 'Removed')

    if (error) {
      console.error('[GOOGLE-ADS-SUPABASE] Error checking keywords:', error.message)
      return new Map()
    }

    const resultMap = new Map<string, string[]>()

    if (data) {
      for (const kw of data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adGroup = kw.gads_ad_groups as any
        const accountName = adGroup?.gads_campaigns?.gads_accounts?.name || 'Unknown'
        const keywordText = kw.keyword_text?.toLowerCase()

        if (keywordText) {
          if (!resultMap.has(keywordText)) {
            resultMap.set(keywordText, [])
          }
          const accounts = resultMap.get(keywordText)!
          if (!accounts.includes(accountName)) {
            accounts.push(accountName)
          }
        }
      }
    }

    console.log(`[GOOGLE-ADS-SUPABASE] Found ${resultMap.size} keywords in accounts`)
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

  // STEP 1: First check Supabase for imported keywords (faster, no API quota used)
  // This is the PRIMARY source for "in account" checking - we have Flexi data here
  console.log('[GOOGLE-ADS] STEP 1: Checking Supabase for imported keywords (PRIMARY)...')
  let hasSupabaseData = false
  try {
    const supabaseKeywords = await getKeywordsFromSupabase()
    if (supabaseKeywords.size > 0) {
      hasSupabaseData = true
      console.log(`[GOOGLE-ADS] Found ${supabaseKeywords.size} keywords in Supabase (Flexi account)`)
      for (const [kw, info] of supabaseKeywords) {
        accountKeywords.add(kw)
        if (!keywordToAccounts.has(kw)) {
          keywordToAccounts.set(kw, new Set())
        }
        keywordToAccounts.get(kw)!.add(info.accountName)
      }
    }
  } catch (supabaseError) {
    console.log('[GOOGLE-ADS] Supabase check failed:', supabaseError)
  }

  // STEP 2: Only fetch from Google Ads API if we DON'T have Supabase data
  // This saves API quota - Supabase has Flexi data which is our primary focus
  if (!hasSupabaseData) {
    console.log('[GOOGLE-ADS] STEP 2: No Supabase data, fetching from Google Ads API...')

    if (request.checkAllAccounts && request.allAccountIds && request.allAccountIds.length > 0) {
      // Fetch keywords from accounts SEQUENTIALLY (not parallel) to respect rate limits
      console.log(`[GOOGLE-ADS] Fetching keywords from ${request.allAccountIds.length} accounts sequentially...`)

      for (const accId of request.allAccountIds) {
        try {
          console.log(`[GOOGLE-ADS] Fetching from account ${accId}...`)
          const keywords = await getAccountKeywords(config, accId)
          const accountName = getAccountName(accId)

          for (const kw of keywords) {
            accountKeywords.add(kw)
            if (!keywordToAccounts.has(kw)) {
              keywordToAccounts.set(kw, new Set())
            }
            keywordToAccounts.get(kw)!.add(accountName)
          }
          console.log(`[GOOGLE-ADS] Account ${accountName}: ${keywords.size} keywords, total: ${accountKeywords.size}`)
        } catch (error) {
          console.error(`[GOOGLE-ADS] Failed to fetch from account ${accId}:`, error)
          // Continue with other accounts
        }
      }
      console.log('[GOOGLE-ADS] Combined keywords from all accounts:', accountKeywords.size, 'unique keywords')
    } else {
      // Single account mode
      try {
        const apiKeywords = await getAccountKeywords(config, request.customerId)
        const accountName = getAccountName(request.customerId)
        for (const kw of apiKeywords) {
          accountKeywords.add(kw)
          if (!keywordToAccounts.has(kw)) {
            keywordToAccounts.set(kw, new Set())
          }
          keywordToAccounts.get(kw)!.add(accountName)
        }
        console.log('[GOOGLE-ADS] Account keywords loaded from API:', accountKeywords.size, 'keywords')
      } catch (apiError) {
        console.log('[GOOGLE-ADS] API fetch failed:', apiError)
      }
    }
  } else {
    console.log('[GOOGLE-ADS] STEP 2: Skipping API calls - using Supabase data (saves quota)')
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
    const keywordText = (result.text as string).toLowerCase()
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
  console.log('[GOOGLE-ADS] Keywords already in account:', inAccountCount)
  if (filteredIdeas.length > 0) {
    console.log('[GOOGLE-ADS] Top keyword:', filteredIdeas[0])
    console.log('[GOOGLE-ADS] Volume range:', filteredIdeas[filteredIdeas.length - 1].avgMonthlySearches, '-', filteredIdeas[0].avgMonthlySearches)
  }

  return filteredIdeas
}

async function getAccessToken(config: GoogleAdsConfig): Promise<string> {
  const tokenUrl = 'https://oauth2.googleapis.com/token'
  console.log('[GOOGLE-ADS] Requesting access token...')

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
    throw new Error(error.error_description || 'Failed to get access token')
  }

  const data = await response.json()
  console.log('[GOOGLE-ADS] Token expires in:', data.expires_in, 'seconds')
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
