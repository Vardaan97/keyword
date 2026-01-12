import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAdsConfig, GOOGLE_ADS_ACCOUNTS, getAccountName, getRealAccountIds } from '@/lib/google-ads'
import { getRefreshToken } from '@/lib/token-storage'

export const dynamic = 'force-dynamic'

// Per-account cache for keywords (same as in google-ads.ts)
// This is a copy to access the cache state for debugging
const accountKeywordsCacheMap: Map<string, { keywords: Set<string>; timestamp: number }> = new Map()
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes
const GOOGLE_ADS_API_VERSION = 'v22'

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

/**
 * Fetch access token from Google OAuth
 */
async function getAccessToken(config: {
  clientId: string
  clientSecret: string
  refreshToken: string
}): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token'
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error_description || 'Failed to get access token')
  }

  const data = await response.json()
  return data.access_token
}

/**
 * Check specific keywords against a Google Ads account using GAQL IN clause
 * This is the CORRECT way to check - it queries the full account database
 */
async function checkKeywordsInAccount(
  config: ReturnType<typeof getGoogleAdsConfig>,
  customerId: string,
  keywordsToCheck: string[]
): Promise<{ found: Set<string>; matchTypes: Map<string, string[]>; error?: string }> {
  const cleanCustomerId = customerId.replace(/-/g, '')
  const found = new Set<string>()
  const matchTypes = new Map<string, string[]>()

  try {
    const accessToken = await getAccessToken(config)
    const loginCustomerId = config.loginCustomerId.replace(/-/g, '')

    // Normalize and prepare keywords for GAQL IN clause
    const normalizedKeywords = keywordsToCheck.map(k => normalizeKeyword(k))
    const keywordListStr = normalizedKeywords
      .map(k => `'${k.replace(/'/g, "\\'")}'`)
      .join(', ')

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
      return {
        found,
        matchTypes,
        error: error.error?.message || 'API error'
      }
    }

    const data = await response.json()

    if (data.results) {
      for (const result of data.results) {
        const keywordText = result.adGroupCriterion?.keyword?.text
        const matchType = result.adGroupCriterion?.keyword?.matchType || 'UNKNOWN'
        if (keywordText) {
          const normalized = normalizeKeyword(keywordText)
          found.add(normalized)

          // Track match types
          if (!matchTypes.has(normalized)) {
            matchTypes.set(normalized, [])
          }
          if (!matchTypes.get(normalized)!.includes(matchType)) {
            matchTypes.get(normalized)!.push(matchType)
          }
        }
      }
    }

    return { found, matchTypes }
  } catch (error) {
    return {
      found,
      matchTypes,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Debug IN Account Endpoint
 *
 * POST /api/debug/in-account
 * Body: { keywords: string[], accountId?: string, forceRefresh?: boolean }
 *
 * Returns detailed info about keyword matching against Google Ads accounts
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { keywords = [], accountId, forceRefresh = false } = body

  if (!keywords || keywords.length === 0) {
    return NextResponse.json({
      success: false,
      error: 'Please provide keywords array in request body'
    }, { status: 400 })
  }

  // Get config
  let refreshToken: string | undefined
  try {
    refreshToken = await getRefreshToken()
  } catch {
    // Fall back to env
  }
  const config = getGoogleAdsConfig(refreshToken)

  if (!config.developerToken || !config.refreshToken) {
    return NextResponse.json({
      success: false,
      error: 'Google Ads API not configured'
    }, { status: 500 })
  }

  // Determine which accounts to check
  const accountsToCheck: string[] = []
  if (accountId && accountId !== 'all-accounts') {
    const account = GOOGLE_ADS_ACCOUNTS.find(acc => acc.id === accountId)
    if (account && account.customerId !== 'ALL') {
      accountsToCheck.push(account.customerId)
    }
  }

  if (accountsToCheck.length === 0) {
    accountsToCheck.push(...getRealAccountIds())
  }

  // Check keywords using efficient GAQL IN clause
  const accountResults: Record<string, {
    accountName: string
    keywordsFound: number
    error?: string
  }> = {}

  const keywordToAccounts = new Map<string, string[]>()
  const keywordMatchTypes = new Map<string, string[]>()

  for (const accId of accountsToCheck) {
    const accountName = getAccountName(accId)
    console.log(`[IN-ACCOUNT-DEBUG] Checking ${keywords.length} keywords in ${accountName} (${accId})...`)

    const result = await checkKeywordsInAccount(config, accId, keywords)

    accountResults[accId] = {
      accountName,
      keywordsFound: result.found.size,
      error: result.error
    }

    // Track which accounts contain each keyword
    for (const kw of result.found) {
      if (!keywordToAccounts.has(kw)) {
        keywordToAccounts.set(kw, [])
      }
      keywordToAccounts.get(kw)!.push(accountName)
    }

    // Track match types
    for (const [kw, types] of result.matchTypes) {
      if (!keywordMatchTypes.has(kw)) {
        keywordMatchTypes.set(kw, [])
      }
      for (const t of types) {
        if (!keywordMatchTypes.get(kw)!.includes(t)) {
          keywordMatchTypes.get(kw)!.push(t)
        }
      }
    }
  }

  // Build results for each input keyword
  const keywordResults: Record<string, {
    original: string
    normalized: string
    found: boolean
    inAccounts: string[]
    matchTypes: string[]
  }> = {}

  for (const kw of keywords) {
    const normalized = normalizeKeyword(kw)
    const inAccounts = keywordToAccounts.get(normalized) || []
    const matchTypes = keywordMatchTypes.get(normalized) || []

    keywordResults[kw] = {
      original: kw,
      normalized,
      found: inAccounts.length > 0,
      inAccounts,
      matchTypes
    }
  }

  // Summary stats
  const foundCount = Object.values(keywordResults).filter(r => r.found).length
  const totalChecked = keywords.length

  return NextResponse.json({
    success: true,
    summary: {
      keywordsChecked: totalChecked,
      keywordsFound: foundCount,
      accountsChecked: accountsToCheck.map(id => getAccountName(id)),
      method: 'GAQL IN clause (queries full account database)'
    },
    accounts: accountResults,
    keywordResults,
    note: 'This uses the same efficient GAQL IN clause method as the main keyword fetch flow.'
  })
}

/**
 * GET endpoint for quick status check
 */
export async function GET() {
  // Get config
  let refreshToken: string | undefined
  try {
    refreshToken = await getRefreshToken()
  } catch {
    // Fall back to env
  }
  const config = getGoogleAdsConfig(refreshToken)

  const status = {
    configured: !!(config.developerToken && config.refreshToken),
    accounts: GOOGLE_ADS_ACCOUNTS.filter(a => a.customerId !== 'ALL').map(acc => ({
      id: acc.id,
      name: acc.name,
      customerId: acc.customerId
    })),
    cacheInfo: {
      entriesCount: accountKeywordsCacheMap.size,
      cacheTTLMinutes: CACHE_TTL_MS / 60000
    }
  }

  return NextResponse.json({
    success: true,
    status,
    usage: {
      POST: {
        body: '{ keywords: string[], accountId?: string, forceRefresh?: boolean }',
        example: '{ "keywords": ["azure certification", "aws training"] }'
      }
    }
  })
}
