/**
 * Keywords Everywhere API Client
 * Documentation: https://api.keywordseverywhere.com/docs/
 *
 * This is a READ-ONLY client for fetching keyword data.
 * Credits: 1 credit per keyword queried
 */

export interface KeywordsEverywhereConfig {
  apiKey: string
}

export interface KeywordData {
  keyword: string
  vol: number // Monthly search volume
  cpc: {
    currency: string
    value: number
  }
  competition: number // 0-1 scale
  trend: number[] // Monthly trend data
}

export interface KeywordDataResponse {
  data: KeywordData[]
  credits: number
  time: number
}

export interface RelatedKeyword {
  keyword: string
  vol: number
  cpc: {
    currency: string
    value: number
  }
  competition: number
}

export interface RelatedKeywordsResponse {
  data: RelatedKeyword[][]
  credits: number
  time: number
}

// Country codes supported by Keywords Everywhere
export const SUPPORTED_COUNTRIES = {
  'us': 'United States',
  'uk': 'United Kingdom',
  'ca': 'Canada',
  'au': 'Australia',
  'in': 'India',
  'de': 'Germany',
  'fr': 'France',
  'es': 'Spain',
  'it': 'Italy',
  'br': 'Brazil',
  'mx': 'Mexico',
  'nl': 'Netherlands',
  'be': 'Belgium',
  'ch': 'Switzerland',
  'at': 'Austria',
  'se': 'Sweden',
  'no': 'Norway',
  'dk': 'Denmark',
  'fi': 'Finland',
  'pl': 'Poland',
  'ru': 'Russia',
  'jp': 'Japan',
  'kr': 'South Korea',
  'sg': 'Singapore',
  'my': 'Malaysia',
  'ph': 'Philippines',
  'id': 'Indonesia',
  'th': 'Thailand',
  'vn': 'Vietnam',
  'ae': 'United Arab Emirates',
  'sa': 'Saudi Arabia',
  'za': 'South Africa',
  'ng': 'Nigeria',
  'eg': 'Egypt',
  'nz': 'New Zealand',
  'ie': 'Ireland',
  'pt': 'Portugal',
  'ar': 'Argentina',
  'cl': 'Chile',
  'co': 'Colombia'
} as const

export type CountryCode = keyof typeof SUPPORTED_COUNTRIES

// Data sources
export type DataSource = 'gkp' | 'cli' // gkp = Google Keyword Planner, cli = Clickstream

/**
 * Get Keywords Everywhere API configuration from environment
 */
export function getKeywordsEverywhereConfig(): KeywordsEverywhereConfig {
  return {
    apiKey: process.env.KEYWORDS_EVERYWHERE_API_KEY || ''
  }
}

/**
 * Get keyword data (search volume, CPC, competition) for a list of keywords
 * Maximum 100 keywords per request
 * Cost: 1 credit per keyword
 */
export async function getKeywordData(
  config: KeywordsEverywhereConfig,
  keywords: string[],
  options: {
    country?: CountryCode
    currency?: string
    dataSource?: DataSource
  } = {}
): Promise<KeywordData[]> {
  const { apiKey } = config
  const { country = 'in', currency = 'INR', dataSource = 'gkp' } = options

  console.log('[KE-API] getKeywordData called')
  console.log('[KE-API] Input keywords count:', keywords.length)
  console.log('[KE-API] Options:', { country, currency, dataSource })

  if (!apiKey) {
    console.error('[KE-API] ERROR: API key not configured')
    throw new Error('Keywords Everywhere API key not configured')
  }

  if (keywords.length === 0) {
    console.log('[KE-API] No keywords provided, returning empty array')
    return []
  }

  // Log sample of keywords being sent
  console.log('[KE-API] Sample keywords (first 10):', keywords.slice(0, 10))
  if (keywords.length > 10) {
    console.log('[KE-API] ... and', keywords.length - 10, 'more keywords')
  }

  // API accepts max 100 keywords at a time
  const batchSize = 100
  const results: KeywordData[] = []
  const totalBatches = Math.ceil(keywords.length / batchSize)

  console.log('[KE-API] Processing in', totalBatches, 'batch(es) of', batchSize, 'keywords each')

  for (let i = 0; i < keywords.length; i += batchSize) {
    const batchNum = Math.floor(i / batchSize) + 1
    const batch = keywords.slice(i, i + batchSize)
    console.log(`[KE-API] Batch ${batchNum}/${totalBatches}: Sending ${batch.length} keywords...`)

    const formData = new URLSearchParams()
    formData.append('country', country)
    formData.append('currency', currency)
    formData.append('dataSource', dataSource)
    batch.forEach(kw => formData.append('kw[]', kw))

    const startTime = Date.now()
    const response = await fetch('https://api.keywordseverywhere.com/v1/get_keyword_data', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    })
    const elapsed = Date.now() - startTime

    console.log(`[KE-API] Batch ${batchNum} response: ${response.status} (${elapsed}ms)`)

    if (!response.ok) {
      const error = await response.json()
      console.error(`[KE-API] Batch ${batchNum} ERROR:`, error)
      throw new Error(error.message || `Keywords Everywhere API error: ${response.status}`)
    }

    const data: KeywordDataResponse = await response.json()
    console.log(`[KE-API] Batch ${batchNum} returned ${data.data.length} keywords, used ${data.credits} credits, took ${data.time}ms server-side`)

    // Log keywords with volume vs without
    const withVolume = data.data.filter(kw => kw.vol > 0).length
    const withoutVolume = data.data.filter(kw => kw.vol === 0).length
    console.log(`[KE-API] Batch ${batchNum} volume breakdown: ${withVolume} with volume, ${withoutVolume} with zero volume`)

    results.push(...data.data)
  }

  // Final summary
  const totalWithVolume = results.filter(kw => kw.vol > 0).length
  console.log('[KE-API] getKeywordData complete:')
  console.log('[KE-API]   - Total keywords returned:', results.length)
  console.log('[KE-API]   - Keywords with volume:', totalWithVolume)
  console.log('[KE-API]   - Keywords without volume:', results.length - totalWithVolume)

  if (totalWithVolume > 0) {
    const volumes = results.filter(kw => kw.vol > 0).map(kw => kw.vol)
    console.log('[KE-API]   - Volume range:', Math.min(...volumes), '-', Math.max(...volumes))
    console.log('[KE-API]   - Top 5 by volume:', results.filter(kw => kw.vol > 0).sort((a, b) => b.vol - a.vol).slice(0, 5).map(kw => `${kw.keyword} (${kw.vol})`).join(', '))
  }

  return results
}

/**
 * Get related keywords for a list of seed keywords
 * Maximum 10 keywords per request
 * Cost: 10 credits per keyword
 */
export async function getRelatedKeywords(
  config: KeywordsEverywhereConfig,
  keywords: string[],
  options: {
    country?: CountryCode
    currency?: string
    dataSource?: DataSource
  } = {}
): Promise<RelatedKeyword[][]> {
  const { apiKey } = config
  const { country = 'in', currency = 'INR', dataSource = 'gkp' } = options

  console.log('[KE-API] getRelatedKeywords called')
  console.log('[KE-API] Input seed keywords:', keywords)
  console.log('[KE-API] Options:', { country, currency, dataSource })

  if (!apiKey) {
    console.error('[KE-API] ERROR: API key not configured')
    throw new Error('Keywords Everywhere API key not configured')
  }

  if (keywords.length === 0) {
    console.log('[KE-API] No keywords provided, returning empty array')
    return []
  }

  // API accepts max 10 keywords at a time for related keywords
  const batchSize = 10
  const results: RelatedKeyword[][] = []
  const totalBatches = Math.ceil(keywords.length / batchSize)

  console.log('[KE-API] Processing related keywords in', totalBatches, 'batch(es)')

  for (let i = 0; i < keywords.length; i += batchSize) {
    const batchNum = Math.floor(i / batchSize) + 1
    const batch = keywords.slice(i, i + batchSize)
    console.log(`[KE-API] Related batch ${batchNum}/${totalBatches}: Fetching for seeds:`, batch)

    const formData = new URLSearchParams()
    formData.append('country', country)
    formData.append('currency', currency)
    formData.append('dataSource', dataSource)
    batch.forEach(kw => formData.append('kw[]', kw))

    const startTime = Date.now()
    const response = await fetch('https://api.keywordseverywhere.com/v1/get_related_keywords', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    })
    const elapsed = Date.now() - startTime

    console.log(`[KE-API] Related batch ${batchNum} response: ${response.status} (${elapsed}ms)`)

    if (!response.ok) {
      const error = await response.json()
      console.error(`[KE-API] Related batch ${batchNum} ERROR:`, error)
      throw new Error(error.message || `Keywords Everywhere API error: ${response.status}`)
    }

    const data: RelatedKeywordsResponse = await response.json()
    console.log(`[KE-API] Related batch ${batchNum} used ${data.credits} credits, took ${data.time}ms server-side`)

    // Log how many related keywords were found per seed
    data.data.forEach((relatedList, idx) => {
      const seedKw = batch[idx]
      const withVolume = relatedList.filter(kw => kw.vol > 0).length
      console.log(`[KE-API]   - "${seedKw}": ${relatedList.length} related keywords (${withVolume} with volume)`)
    })

    results.push(...data.data)
  }

  // Final summary
  const totalRelated = results.reduce((sum, list) => sum + list.length, 0)
  const totalWithVolume = results.reduce((sum, list) => sum + list.filter(kw => kw.vol > 0).length, 0)
  console.log('[KE-API] getRelatedKeywords complete:')
  console.log('[KE-API]   - Total seeds processed:', keywords.length)
  console.log('[KE-API]   - Total related keywords found:', totalRelated)
  console.log('[KE-API]   - Related keywords with volume:', totalWithVolume)

  return results
}

/**
 * Get "People Also Search For" keywords
 * Maximum 10 keywords per request
 * Cost: 10 credits per keyword
 */
export async function getPeopleAlsoSearch(
  config: KeywordsEverywhereConfig,
  keywords: string[],
  options: {
    country?: CountryCode
    currency?: string
    dataSource?: DataSource
  } = {}
): Promise<RelatedKeyword[][]> {
  const { apiKey } = config
  const { country = 'in', currency = 'INR', dataSource = 'gkp' } = options

  if (!apiKey) {
    throw new Error('Keywords Everywhere API key not configured')
  }

  if (keywords.length === 0) {
    return []
  }

  const batchSize = 10
  const results: RelatedKeyword[][] = []

  for (let i = 0; i < keywords.length; i += batchSize) {
    const batch = keywords.slice(i, i + batchSize)

    const formData = new URLSearchParams()
    formData.append('country', country)
    formData.append('currency', currency)
    formData.append('dataSource', dataSource)
    batch.forEach(kw => formData.append('kw[]', kw))

    const response = await fetch('https://api.keywordseverywhere.com/v1/get_paa', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || `Keywords Everywhere API error: ${response.status}`)
    }

    const data: RelatedKeywordsResponse = await response.json()
    results.push(...data.data)
  }

  return results
}

/**
 * Get trending keywords for a topic
 * Cost: 1 credit per result
 */
export async function getTrendingKeywords(
  config: KeywordsEverywhereConfig,
  topic: string,
  options: {
    country?: CountryCode
    currency?: string
  } = {}
): Promise<KeywordData[]> {
  const { apiKey } = config
  const { country = 'in', currency = 'INR' } = options

  if (!apiKey) {
    throw new Error('Keywords Everywhere API key not configured')
  }

  const formData = new URLSearchParams()
  formData.append('country', country)
  formData.append('currency', currency)
  formData.append('topic', topic)

  const response = await fetch('https://api.keywordseverywhere.com/v1/get_trending', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || `Keywords Everywhere API error: ${response.status}`)
  }

  const data: KeywordDataResponse = await response.json()
  return data.data
}

/**
 * Get remaining API credits
 */
export async function getCredits(config: KeywordsEverywhereConfig): Promise<number> {
  const { apiKey } = config

  console.log('[KE-API] Checking remaining credits...')

  if (!apiKey) {
    console.error('[KE-API] ERROR: API key not configured')
    throw new Error('Keywords Everywhere API key not configured')
  }

  const response = await fetch('https://api.keywordseverywhere.com/v1/account/credits', {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    }
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('[KE-API] Credits check ERROR:', error)
    throw new Error(error.message || `Keywords Everywhere API error: ${response.status}`)
  }

  const data = await response.json()
  console.log('[KE-API] Remaining credits:', data.credits)
  return data.credits
}
