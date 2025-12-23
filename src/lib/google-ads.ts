import { KeywordIdea } from '@/types'

// Google Ads API v22 (latest as of December 2025)
// v18 sunset, v19/v20/v21 still active, v22 is current
const GOOGLE_ADS_API_VERSION = 'v22'

// Per-account cache for keywords (refreshed every 10 minutes)
const accountKeywordsCacheMap: Map<string, { keywords: Set<string>; timestamp: number }> = new Map()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

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
// Priority: Higher number = check first (Bouquet INR has most keywords)
export const GOOGLE_ADS_ACCOUNTS: GoogleAdsAccount[] = [
  { id: 'all-accounts', name: 'All Accounts', customerId: 'ALL', currency: 'INR' },  // Special option to check all accounts
  { id: 'bouquet-inr', name: 'Bouquet INR', customerId: '6153038296', currency: 'INR', priority: 3 },  // Default - most keywords
  { id: 'bouquet-inr-2', name: 'Bouquet INR - 2', customerId: '6601080005', currency: 'INR', priority: 2 },
  { id: 'flexi', name: 'Flexi', customerId: '3515012934', currency: 'INR', priority: 1 }
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
 */
async function getAccountKeywords(config: GoogleAdsConfig, customerId: string): Promise<Set<string>> {
  const cleanCustomerId = customerId.replace(/-/g, '')

  // Check per-account cache first
  const cached = accountKeywordsCacheMap.get(cleanCustomerId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[GOOGLE-ADS] Using cached keywords for account ${cleanCustomerId}:`, cached.keywords.size, 'keywords')
    return cached.keywords
  }

  console.log(`[GOOGLE-ADS] Fetching keywords for account ${cleanCustomerId}...`)
  const accessToken = await getAccessToken(config)
  const loginCustomerId = config.loginCustomerId.replace(/-/g, '')

  // Query to get all active keywords in the account
  const query = `
    SELECT
      ad_group_criterion.keyword.text
    FROM keyword_view
    WHERE ad_group_criterion.status != 'REMOVED'
    LIMIT 10000
  `

  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:search`

  try {
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
      console.error(`[GOOGLE-ADS] Failed to fetch keywords for account ${cleanCustomerId}:`, error.error?.message || 'Unknown error')
      return new Set()
    }

    const data = await response.json()
    const keywords = new Set<string>()

    if (data.results) {
      for (const result of data.results) {
        const keywordText = result.adGroupCriterion?.keyword?.text
        if (keywordText) {
          keywords.add(keywordText.toLowerCase())
        }
      }
    }

    console.log(`[GOOGLE-ADS] Found ${keywords.size} keywords in account ${cleanCustomerId}`)

    // Update per-account cache
    accountKeywordsCacheMap.set(cleanCustomerId, {
      keywords,
      timestamp: Date.now()
    })

    return keywords
  } catch (error) {
    console.error(`[GOOGLE-ADS] Error fetching keywords for account ${cleanCustomerId}:`, error)
    return new Set()
  }
}

/**
 * Get account name by customer ID
 */
export function getAccountName(customerId: string): string {
  const cleanId = customerId.replace(/-/g, '')
  const account = GOOGLE_ADS_ACCOUNTS.find(acc => acc.customerId === cleanId)
  return account?.name || `Account ${cleanId}`
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
  let accountKeywords: Set<string>
  // Map keyword -> list of account names that contain it
  const keywordToAccounts: AccountKeywordsMap = new Map()
  const accessToken = await getAccessToken(config)

  // Get currency for bid display - default to INR for Indian accounts
  const currentAccount = GOOGLE_ADS_ACCOUNTS.find(acc => acc.customerId === request.customerId.replace(/-/g, ''))
  const bidCurrency = currentAccount?.currency || 'INR'

  if (request.checkAllAccounts && request.allAccountIds && request.allAccountIds.length > 0) {
    // Fetch keywords from all accounts in parallel and track which account has each keyword
    console.log(`[GOOGLE-ADS] Fetching keywords from ${request.allAccountIds.length} accounts...`)
    const accountResults = await Promise.all(
      request.allAccountIds.map(async (accId) => {
        const keywords = await getAccountKeywords(config, accId)
        const accountName = getAccountName(accId)
        return { accId, accountName, keywords }
      })
    )

    // Combine all keywords and track which accounts have each keyword
    accountKeywords = new Set<string>()
    for (const { accountName, keywords } of accountResults) {
      for (const kw of keywords) {
        accountKeywords.add(kw)
        // Track which accounts have this keyword
        if (!keywordToAccounts.has(kw)) {
          keywordToAccounts.set(kw, new Set())
        }
        keywordToAccounts.get(kw)!.add(accountName)
      }
    }
    console.log('[GOOGLE-ADS] Combined keywords from all accounts:', accountKeywords.size, 'unique keywords')
  } else {
    // Single account mode
    accountKeywords = await getAccountKeywords(config, request.customerId)
    const accountName = getAccountName(request.customerId)
    // Track all keywords as belonging to this single account
    for (const kw of accountKeywords) {
      keywordToAccounts.set(kw, new Set([accountName]))
    }
    console.log('[GOOGLE-ADS] Account keywords loaded:', accountKeywords.size, 'keywords')
  }

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
    console.error('[GOOGLE-ADS] API Error:', JSON.stringify(error, null, 2))
    throw new Error(error.error?.message || 'Failed to fetch keyword ideas')
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
