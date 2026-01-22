/**
 * Ad Group Matcher
 *
 * Handles matching course URLs to their Campaign/Ad Group mappings
 * from imported Google Ads Ad Report data stored in Convex.
 */

export interface AdGroupMatch {
  campaignName: string
  adGroupName: string
  country: string | null
  vendor: string | null
  confidence: 'exact' | 'partial' | 'none'
}

export interface MatchResult {
  matches: AdGroupMatch[]
  bestMatch: AdGroupMatch | null
  hasMultipleOptions: boolean
}

/**
 * Normalize URL for consistent matching
 * Removes protocol, www, trailing slash, query params, and hash
 */
export function normalizeUrl(url: string): string {
  if (!url) return ''
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '')  // Remove protocol
    .replace(/^www\./, '')        // Remove www
    .replace(/\/$/, '')           // Remove trailing slash
    .replace(/\?.*$/, '')         // Remove query params
    .replace(/#.*$/, '')          // Remove hash
}

/**
 * Map target country to expected country value in campaigns
 */
export function mapTargetCountry(targetCountry: string): string {
  const countryMap: Record<string, string> = {
    'india': 'india',
    'usa': 'usa',
    'uk': 'uk',
    'uae': 'uae',
    'singapore': 'singapore',
    'australia': 'australia',
    'canada': 'canada',
    'germany': 'germany',
    'malaysia': 'malaysia',
    'saudi': 'saudi',
    'global': 'usa', // Global typically targets USA
  }

  return countryMap[targetCountry.toLowerCase()] || targetCountry.toLowerCase()
}

/**
 * Map account ID from our system to convex storage format
 */
export function mapAccountId(accountId: string): string {
  const accountMap: Record<string, string> = {
    'flexi': 'flexi',
    'bouquet-inr': 'bouquet-inr',
    'bouquet-inr-2': 'bouquet-inr', // Map to same account
    'all': 'flexi', // Default to flexi when checking all
  }

  return accountMap[accountId] || accountId
}

/**
 * Find the best ad group match for a URL
 * Considers account, country, and returns confidence level
 */
export function findBestMatch(
  matches: AdGroupMatch[],
  targetCountry?: string
): AdGroupMatch | null {
  if (matches.length === 0) return null

  // If target country specified, prefer matches for that country
  if (targetCountry) {
    const mappedCountry = mapTargetCountry(targetCountry)
    const countryMatches = matches.filter(m =>
      m.country?.toLowerCase() === mappedCountry
    )

    if (countryMatches.length > 0) {
      // Return first match for the target country
      return { ...countryMatches[0], confidence: 'exact' }
    }
  }

  // No country match - return first match with partial confidence
  return { ...matches[0], confidence: 'partial' }
}

/**
 * Client-side function to fetch ad group matches from API
 */
export async function fetchAdGroupMatches(
  url: string,
  accountId?: string,
  country?: string
): Promise<MatchResult> {
  try {
    const params = new URLSearchParams()
    params.set('url', normalizeUrl(url))
    if (accountId) params.set('accountId', mapAccountId(accountId))
    if (country) params.set('country', mapTargetCountry(country))

    const response = await fetch(`/api/gads/ad-group-lookup?${params.toString()}`)

    if (!response.ok) {
      console.error('[AD-GROUP-MATCHER] API error:', response.status)
      return { matches: [], bestMatch: null, hasMultipleOptions: false }
    }

    const data = await response.json()

    if (!data.success || !data.data) {
      return { matches: [], bestMatch: null, hasMultipleOptions: false }
    }

    const matches: AdGroupMatch[] = data.data.map((m: {
      campaignName: string
      adGroupName: string
      country?: string | null
      vendor?: string | null
    }) => ({
      campaignName: m.campaignName,
      adGroupName: m.adGroupName,
      country: m.country || null,
      vendor: m.vendor || null,
      confidence: 'exact' as const,
    }))

    const bestMatch = findBestMatch(matches, country)

    return {
      matches,
      bestMatch,
      hasMultipleOptions: matches.length > 1,
    }
  } catch (error) {
    console.error('[AD-GROUP-MATCHER] Error:', error)
    return { matches: [], bestMatch: null, hasMultipleOptions: false }
  }
}

/**
 * Batch fetch ad group matches for multiple URLs
 * More efficient than individual calls
 */
export async function batchFetchAdGroupMatches(
  urls: string[],
  accountId?: string,
  country?: string
): Promise<Map<string, MatchResult>> {
  const results = new Map<string, MatchResult>()

  // Normalize URLs for consistent keys
  const normalizedUrls = urls.map(normalizeUrl)
  const uniqueUrls = [...new Set(normalizedUrls)]

  // Fetch in parallel batches of 10
  const batchSize = 10
  for (let i = 0; i < uniqueUrls.length; i += batchSize) {
    const batch = uniqueUrls.slice(i, i + batchSize)
    const promises = batch.map(url => fetchAdGroupMatches(url, accountId, country))
    const batchResults = await Promise.all(promises)

    batch.forEach((url, index) => {
      results.set(url, batchResults[index])
    })
  }

  return results
}

/**
 * Get all unique ad groups for an account (for dropdown options)
 */
export async function getAccountAdGroups(
  accountId: string
): Promise<{ campaign: string; adGroup: string; country: string | null }[]> {
  try {
    const response = await fetch(`/api/gads/ad-group-lookup?accountId=${mapAccountId(accountId)}&listAll=true`)

    if (!response.ok) {
      console.error('[AD-GROUP-MATCHER] API error:', response.status)
      return []
    }

    const data = await response.json()
    return data.success && data.data ? data.data : []
  } catch (error) {
    console.error('[AD-GROUP-MATCHER] Error:', error)
    return []
  }
}

/**
 * Get import summary showing what URL mappings are available
 */
export async function getImportSummary(): Promise<{
  totalMappings: number
  accounts: {
    accountId: string
    totalMappings: number
    uniqueUrls: number
    uniqueCampaigns: number
    uniqueAdGroups: number
    countries: string[]
    lastImportedAt: number
  }[]
} | null> {
  try {
    const response = await fetch('/api/gads/ad-report-import')

    if (!response.ok) {
      console.error('[AD-GROUP-MATCHER] API error:', response.status)
      return null
    }

    const data = await response.json()
    return data.success ? data.data : null
  } catch (error) {
    console.error('[AD-GROUP-MATCHER] Error:', error)
    return null
  }
}
