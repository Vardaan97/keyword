import { NextRequest, NextResponse } from 'next/server'
import { getKeywordIdeas, getGoogleAdsConfig, getDefaultCustomerId, GOOGLE_ADS_ACCOUNTS, getAccountName, getRealAccountIds, classifyError, markAccountQuotaExhausted } from '@/lib/google-ads'
import { getKeywordData, getRelatedKeywords, getKeywordsEverywhereConfig, CountryCode } from '@/lib/keywords-everywhere'
import { getCachedKeywords, setCachedKeywords, getDatabaseStatus, UnifiedKeywordData, saveKeywordVolumes } from '@/lib/database'
import { getRefreshToken } from '@/lib/token-storage'
import { KeywordIdea, ApiResponse, EnhancedApiResponse, ApiErrorResponse } from '@/types'

interface FetchIdeasRequest {
  seedKeywords: string[]
  pageUrl?: string
  courseName?: string  // Course name for cache key
  geoTarget?: string
  source?: 'google' | 'keywords_everywhere' | 'auto' // Allow choosing data source
  skipCache?: boolean // Force fresh fetch
  accountId?: string // Google Ads account ID for "in account" check
}

// Map geo targets to Keywords Everywhere country codes
const geoToCountryCode: Record<string, CountryCode> = {
  'india': 'in',
  'usa': 'us',
  'uk': 'uk',
  'uae': 'ae',
  'singapore': 'sg',
  'australia': 'au',
  'canada': 'ca',
  'germany': 'de',
  'malaysia': 'my',
  'saudi': 'sa',
  'global': 'us'
}

/**
 * Normalize source name for consistent cache keys
 * 'auto' and 'google' → 'google_ads'
 * 'keywords_everywhere' stays the same
 */
function normalizeSource(source: string): string {
  if (source === 'auto' || source === 'google') return 'google_ads'
  return source
}

/**
 * Generate hash for cache key (consistent, short)
 */
function hashForCache(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50)
}

/**
 * Fetch keyword ideas using Keywords Everywhere API
 * Returns real search volume data
 *
 * Credit usage:
 * - get_keyword_data: 1 credit per keyword
 * - get_related_keywords: 10 credits per keyword
 */
async function fetchFromKeywordsEverywhere(
  seedKeywords: string[],
  geoTarget: string
): Promise<KeywordIdea[]> {
  console.log('[KE] ========================================')
  console.log('[KE] fetchFromKeywordsEverywhere STARTED')
  console.log('[KE] Input seeds:', seedKeywords)
  console.log('[KE] Geo target:', geoTarget)
  console.log('[KE] ========================================')

  const config = getKeywordsEverywhereConfig()

  if (!config.apiKey) {
    console.error('[KE] ERROR: API key not configured!')
    throw new Error('Keywords Everywhere API key not configured')
  }
  console.log('[KE] API key found:', config.apiKey.substring(0, 8) + '...')

  const countryCode = geoToCountryCode[geoTarget.toLowerCase()] || 'in'

  // Generate comprehensive keyword variations from seeds
  // More modifiers = more keywords discovered
  const allKeywords: string[] = []
  const modifiers = {
    prefix: ['best', 'top', 'learn', 'free', 'online', 'professional', 'advanced', 'beginner'],
    suffix: [
      'training', 'certification', 'course', 'courses', 'tutorial', 'tutorials',
      'exam', 'test', 'classes', 'bootcamp', 'program', 'programmes',
      'cost', 'price', 'fees', 'duration', 'syllabus', 'curriculum',
      'jobs', 'salary', 'career', 'opportunities', 'requirements',
      'online', 'offline', 'classroom', 'virtual', 'live',
      'for beginners', 'for professionals', 'for developers',
      'certification cost', 'exam preparation', 'study guide', 'practice test',
      'interview questions', 'learning path', 'roadmap'
    ]
  }

  seedKeywords.forEach(seed => {
    // Add the seed itself
    allKeywords.push(seed)

    // Add prefix variations
    modifiers.prefix.forEach(prefix => {
      allKeywords.push(`${prefix} ${seed}`)
    })

    // Add suffix variations
    modifiers.suffix.forEach(suffix => {
      allKeywords.push(`${seed} ${suffix}`)
    })

    // Add some combined variations for high-intent keywords
    allKeywords.push(
      `${seed} certification training`,
      `${seed} course online`,
      `${seed} training near me`,
      `how to learn ${seed}`,
      `what is ${seed}`,
      `${seed} vs`,
      `${seed} certification exam`
    )
  })

  // Remove duplicates and normalize
  const uniqueKeywords = [...new Set(allKeywords.map(k => k.toLowerCase().trim()))]
  console.log(`[KE] Generated ${uniqueKeywords.length} keyword variations from ${seedKeywords.length} seeds`)

  // Get keyword data from Keywords Everywhere (1 credit per keyword)
  console.log(`[KE] Fetching data for ${uniqueKeywords.length} keywords...`)
  const keywordData = await getKeywordData(config, uniqueKeywords, {
    country: countryCode,
    currency: countryCode === 'in' ? 'INR' : 'USD',
    dataSource: 'gkp'
  })
  console.log(`[KE] Got data for ${keywordData.length} keywords`)

  // Also get related keywords for seeds (10 credits per keyword - use up to 5 seeds)
  let relatedKeywords: KeywordIdea[] = []
  try {
    const seedsForRelated = seedKeywords.slice(0, 5) // Use first 5 seeds
    console.log(`[KE] Fetching related keywords for ${seedsForRelated.length} seeds...`)

    const relatedData = await getRelatedKeywords(config, seedsForRelated, {
      country: countryCode,
      currency: countryCode === 'in' ? 'INR' : 'USD',
      dataSource: 'gkp'
    })

    // Flatten related keywords and convert to KeywordIdea format
    relatedKeywords = relatedData.flat().map(kw => ({
      keyword: kw.keyword,
      avgMonthlySearches: kw.vol || 0,
      competition: kw.competition > 0.66 ? 'HIGH' : kw.competition > 0.33 ? 'MEDIUM' : 'LOW',
      competitionIndex: Math.round(kw.competition * 100),
      lowTopOfPageBidMicros: (kw.cpc?.value || 0) * 0.7 * 1000000,
      highTopOfPageBidMicros: (kw.cpc?.value || 0) * 1.3 * 1000000
    }))
    console.log(`[KE] Got ${relatedKeywords.length} related keywords`)
  } catch (relatedError) {
    console.log('[KE] Could not fetch related keywords:', relatedError)
  }

  // Convert to KeywordIdea format
  const keywordIdeas: KeywordIdea[] = keywordData.map(kw => ({
    keyword: kw.keyword,
    avgMonthlySearches: kw.vol || 0,
    competition: kw.competition > 0.66 ? 'HIGH' : kw.competition > 0.33 ? 'MEDIUM' : 'LOW',
    competitionIndex: Math.round(kw.competition * 100),
    lowTopOfPageBidMicros: (kw.cpc?.value || 0) * 0.7 * 1000000,
    highTopOfPageBidMicros: (kw.cpc?.value || 0) * 1.3 * 1000000
  }))

  // Combine and deduplicate
  const allResults = [...keywordIdeas, ...relatedKeywords]
  const uniqueResults = allResults.filter((kw, idx, arr) =>
    arr.findIndex(k => k.keyword.toLowerCase() === kw.keyword.toLowerCase()) === idx
  )

  // Filter out zero-volume keywords and sort by volume
  // Increased limit to 200 for more comprehensive results
  const filteredResults = uniqueResults
    .filter(kw => kw.avgMonthlySearches > 0)
    .sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches)
    .slice(0, 200)

  console.log('[KE] ========================================')
  console.log(`[KE] COMPLETED: ${filteredResults.length} keywords with search volume`)
  if (filteredResults.length > 0) {
    console.log('[KE] Sample results (top 5):', filteredResults.slice(0, 5).map(k => `${k.keyword} (${k.avgMonthlySearches})`))
  }
  console.log('[KE] ========================================')
  return filteredResults
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<KeywordIdea[]> | EnhancedApiResponse<KeywordIdea[]>>> {
  const startTime = Date.now()

  // Parse body outside try block so it's accessible in catch for fallback
  const body: FetchIdeasRequest = await request.json()
  const { seedKeywords, pageUrl, courseName, geoTarget = 'india', source = 'auto', skipCache = false, accountId } = body

  // Normalize source for consistent cache keys ('auto'/'google' → 'google_ads')
  const normalizedSource = normalizeSource(source)

  // Create cache key components
  const urlHash = pageUrl ? hashForCache(pageUrl) : ''
  const courseHash = courseName ? hashForCache(courseName) : ''
  const seedsHash = seedKeywords.length > 0 ? hashForCache(seedKeywords.sort().join(',')) : ''

  // Resolve customer ID from accountId or use default
  // Special handling for "ALL" - will check all accounts
  let customerId = getDefaultCustomerId()
  let accountName = getAccountName(customerId)
  let checkAllAccounts = false
  let allAccountIds: string[] = []

  if (accountId) {
    const account = GOOGLE_ADS_ACCOUNTS.find(acc => acc.id === accountId)
    if (account) {
      if (account.customerId === 'ALL') {
        checkAllAccounts = true
        allAccountIds = getRealAccountIds()
        accountName = 'All Accounts'
        customerId = allAccountIds[0] // Use first account for keyword generation
      } else {
        customerId = account.customerId
        accountName = account.name
      }
    }
  }

  console.log('[FETCH-IDEAS] ========================================')
  console.log('[FETCH-IDEAS] Request received')
  console.log('[FETCH-IDEAS] Course:', courseName || 'N/A')
  console.log('[FETCH-IDEAS] Seeds:', seedKeywords.slice(0, 3).join(', '), seedKeywords.length > 3 ? `... (${seedKeywords.length} total)` : '')
  console.log('[FETCH-IDEAS] Geo Target:', geoTarget)
  console.log('[FETCH-IDEAS] Source:', source)
  console.log('[FETCH-IDEAS] Skip Cache:', skipCache)
  console.log('[FETCH-IDEAS] Account:', accountName, checkAllAccounts ? `(checking ${allAccountIds.length} accounts)` : `(${customerId})`)
  console.log('[FETCH-IDEAS] ========================================')
  console.log('[FETCH-IDEAS] STEP 1: Checking database cache FIRST...')

  if (!seedKeywords || seedKeywords.length === 0) {
    console.log('[FETCH-IDEAS] Error: No seed keywords provided')
    return NextResponse.json({
      success: false,
      error: 'Missing required field: seedKeywords'
    }, { status: 400 })
  }

  // ==========================================================================
  // CACHE CHECK - Check for cached data before making API calls
  // Uses separate caches for:
  // 1. Combined cache (seeds + URL) - best match for exact same request
  // 2. Seeds-only cache - reusable across different URLs
  // 3. URL-only cache - reusable across different seed sets
  // TTL: 7 days (168 hours)
  // ==========================================================================
  const dbStatus = getDatabaseStatus()

  // Cache key definitions (using normalized source for consistency)
  const combinedCacheKey = `combined_${seedsHash}_${urlHash}_${geoTarget}_${normalizedSource}`
  const seedsCacheKey = seedsHash ? `seeds_${seedsHash}_${geoTarget}_${normalizedSource}` : ''
  const urlCacheKey = urlHash ? `url_${urlHash}_${geoTarget}_${normalizedSource}` : ''

  // Track partial cache data for use in API section (defined outside if block)
  let partialCacheData: {
    seedsCached: UnifiedKeywordData[] | null
    urlCached: UnifiedKeywordData[] | null
  } = { seedsCached: null, urlCached: null }

  console.log('[FETCH-IDEAS] Cache keys:')
  console.log('[FETCH-IDEAS]   Combined:', combinedCacheKey.slice(0, 60) + '...')
  console.log('[FETCH-IDEAS]   Seeds:', seedsCacheKey.slice(0, 60) + '...')
  console.log('[FETCH-IDEAS]   URL:', urlCacheKey.slice(0, 60) + '...')

  if (!skipCache && dbStatus.hasAnyDatabase) {
    // Helper function to convert cached data to KeywordIdea[]
    const convertCachedToKeywordIdeas = (cached: UnifiedKeywordData[]): KeywordIdea[] => {
      return cached.map(kw => ({
        keyword: kw.keyword,
        avgMonthlySearches: kw.avgMonthlySearches,
        competition: kw.competition as 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED',
        competitionIndex: kw.competitionIndex,
        lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
        highTopOfPageBidMicros: kw.highTopOfPageBidMicros,
        bidCurrency: 'INR',
        inAccount: kw.inAccount,
        inAccountNames: kw.inAccountNames
      }))
    }

    // 1. Check combined cache first (exact match for same seeds + URL + geo)
    try {
      const combinedCached = await getCachedKeywords([combinedCacheKey], geoTarget, normalizedSource)
      if (combinedCached && combinedCached.length > 0) {
        const processingTimeMs = Date.now() - startTime
        console.log(`[FETCH-IDEAS] ✓ CACHE HIT (combined)! ${combinedCached.length} keywords in ${processingTimeMs}ms`)
        return NextResponse.json({
          success: true,
          data: convertCachedToKeywordIdeas(combinedCached),
          meta: { source: 'cache', cached: true, cacheType: 'combined', processingTimeMs, databases: dbStatus }
        })
      }
    } catch (err) {
      console.log('[FETCH-IDEAS] Combined cache check failed:', err)
    }

    // 2. Check if we can reconstruct from separate seeds + URL caches
    if (seedsCacheKey && urlCacheKey) {
      try {
        const [seedsCached, urlCached] = await Promise.all([
          getCachedKeywords([seedsCacheKey], geoTarget, normalizedSource),
          getCachedKeywords([urlCacheKey], geoTarget, normalizedSource)
        ])

        if (seedsCached && seedsCached.length > 0 && urlCached && urlCached.length > 0) {
          // Combine and deduplicate (UNION)
          const seenKeywords = new Set<string>()
          const combined: UnifiedKeywordData[] = []

          for (const kw of [...seedsCached, ...urlCached]) {
            const normalizedKw = kw.keyword.toLowerCase().trim()
            if (!seenKeywords.has(normalizedKw)) {
              seenKeywords.add(normalizedKw)
              combined.push(kw)
            }
          }

          const processingTimeMs = Date.now() - startTime
          console.log(`[FETCH-IDEAS] ✓ CACHE HIT (seeds+url reconstructed)! ${combined.length} keywords (${seedsCached.length} seeds + ${urlCached.length} url, deduplicated) in ${processingTimeMs}ms`)

          // Save combined result for faster future lookups
          await setCachedKeywords([combinedCacheKey], geoTarget, normalizedSource, combined, 168)

          return NextResponse.json({
            success: true,
            data: convertCachedToKeywordIdeas(combined),
            meta: { source: 'cache', cached: true, cacheType: 'reconstructed', processingTimeMs, databases: dbStatus }
          })
        }
      } catch (err) {
        console.log('[FETCH-IDEAS] Separate cache reconstruction failed:', err)
      }
    }

    // 3. Check for PARTIAL cache hits - use cached data + fetch only what's missing
    // This is the key optimization: URL keywords don't change based on seeds,
    // so we can reuse URL cache and only fetch seed keywords (or vice versa)

    let cachedSeedsData: UnifiedKeywordData[] | null = null
    let cachedUrlData: UnifiedKeywordData[] | null = null

    // Check seeds cache
    if (seedsCacheKey) {
      try {
        cachedSeedsData = await getCachedKeywords([seedsCacheKey], geoTarget, normalizedSource)
        if (cachedSeedsData && cachedSeedsData.length > 0) {
          console.log(`[FETCH-IDEAS] Found SEEDS cache: ${cachedSeedsData.length} keywords`)
        }
      } catch (err) {
        console.log('[FETCH-IDEAS] Seeds cache check failed:', err)
      }
    }

    // Check URL cache
    if (urlCacheKey) {
      try {
        cachedUrlData = await getCachedKeywords([urlCacheKey], geoTarget, normalizedSource)
        if (cachedUrlData && cachedUrlData.length > 0) {
          console.log(`[FETCH-IDEAS] Found URL cache: ${cachedUrlData.length} keywords`)
        }
      } catch (err) {
        console.log('[FETCH-IDEAS] URL cache check failed:', err)
      }
    }

    // If we have seeds cache but no URL provided, return seeds cache
    if (cachedSeedsData && cachedSeedsData.length > 0 && !pageUrl) {
      const processingTimeMs = Date.now() - startTime
      console.log(`[FETCH-IDEAS] ✓ CACHE HIT (seeds only, no URL needed)! ${cachedSeedsData.length} keywords in ${processingTimeMs}ms`)
      return NextResponse.json({
        success: true,
        data: convertCachedToKeywordIdeas(cachedSeedsData),
        meta: { source: 'cache', cached: true, cacheType: 'seeds', processingTimeMs, databases: dbStatus }
      })
    }

    // If we have URL cache but no seeds provided, return URL cache
    if (cachedUrlData && cachedUrlData.length > 0 && seedKeywords.length === 0) {
      const processingTimeMs = Date.now() - startTime
      console.log(`[FETCH-IDEAS] ✓ CACHE HIT (url only, no seeds needed)! ${cachedUrlData.length} keywords in ${processingTimeMs}ms`)
      return NextResponse.json({
        success: true,
        data: convertCachedToKeywordIdeas(cachedUrlData),
        meta: { source: 'cache', cached: true, cacheType: 'url', processingTimeMs, databases: dbStatus }
      })
    }

    // PARTIAL CACHE HIT: If URL cache exists but seeds cache doesn't match,
    // we can use cached URL keywords and only fetch seed keywords from API
    // This saves one API call!
    if (cachedUrlData && cachedUrlData.length > 0 && !cachedSeedsData && seedKeywords.length > 0) {
      console.log(`[FETCH-IDEAS] ⚡ PARTIAL CACHE HIT: URL cached (${cachedUrlData.length}), will fetch only SEED keywords`)
      // Store for later use in API section
      // We'll handle this in the Google Ads API section below
    }

    // PARTIAL CACHE HIT: If seeds cache exists but URL cache doesn't,
    // we can use cached seeds keywords and only fetch URL keywords from API
    if (cachedSeedsData && cachedSeedsData.length > 0 && !cachedUrlData && pageUrl) {
      console.log(`[FETCH-IDEAS] ⚡ PARTIAL CACHE HIT: Seeds cached (${cachedSeedsData.length}), will fetch only URL keywords`)
    }

    // Store partial cache data for use in API section (update outer variable)
    partialCacheData = {
      seedsCached: cachedSeedsData,
      urlCached: cachedUrlData
    }

    console.log('[FETCH-IDEAS] ✗ FULL CACHE MISS - will fetch from API (partial cache may be used)')
  } else if (skipCache) {
    console.log('[FETCH-IDEAS] Cache check SKIPPED (skipCache=true)')
  } else {
    console.log('[FETCH-IDEAS] Cache check SKIPPED (no database)')
  }

  // ==========================================================================
  // CACHE SAVE HELPERS - Save to separate caches for better reuse
  // ==========================================================================

  // Helper to convert KeywordIdea[] to UnifiedKeywordData[]
  const toUnifiedData = (keywords: KeywordIdea[]): UnifiedKeywordData[] => {
    return keywords.map(kw => ({
      keyword: kw.keyword,
      avgMonthlySearches: kw.avgMonthlySearches,
      competition: kw.competition,
      competitionIndex: kw.competitionIndex,
      lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
      highTopOfPageBidMicros: kw.highTopOfPageBidMicros,
      inAccount: kw.inAccount,
      inAccountNames: kw.inAccountNames
    }))
  }

  // Save keywords from keywordSeed approach to seeds-specific cache
  const cacheSeedsKeywords = async (keywords: KeywordIdea[]) => {
    if (!dbStatus.hasAnyDatabase || !seedsCacheKey) return
    try {
      await setCachedKeywords([seedsCacheKey], geoTarget, normalizedSource, toUnifiedData(keywords), 168)
      console.log(`[FETCH-IDEAS] ✓ Cached ${keywords.length} keywords to SEEDS cache`)
    } catch (err) {
      console.log('[FETCH-IDEAS] Failed to cache seeds keywords:', err)
    }
  }

  // Save keywords from urlSeed approach to URL-specific cache
  const cacheUrlKeywords = async (keywords: KeywordIdea[]) => {
    if (!dbStatus.hasAnyDatabase || !urlCacheKey) return
    try {
      await setCachedKeywords([urlCacheKey], geoTarget, normalizedSource, toUnifiedData(keywords), 168)
      console.log(`[FETCH-IDEAS] ✓ Cached ${keywords.length} keywords to URL cache`)
    } catch (err) {
      console.log('[FETCH-IDEAS] Failed to cache URL keywords:', err)
    }
  }

  // Save combined results to combined cache
  const cacheCombinedKeywords = async (keywords: KeywordIdea[]) => {
    if (!dbStatus.hasAnyDatabase) return
    try {
      await setCachedKeywords([combinedCacheKey], geoTarget, normalizedSource, toUnifiedData(keywords), 168)
      console.log(`[FETCH-IDEAS] ✓ Cached ${keywords.length} keywords to COMBINED cache`)

      // Also save with course name key if available
      if (courseHash) {
        const courseCacheKey = `course_${courseHash}_${geoTarget}_${normalizedSource}`
        await setCachedKeywords([courseCacheKey], geoTarget, normalizedSource, toUnifiedData(keywords), 168)
        console.log(`[FETCH-IDEAS] ✓ Cached to course cache: ${courseHash.slice(0, 20)}...`)
      }
    } catch (err) {
      console.log('[FETCH-IDEAS] Failed to cache combined keywords:', err)
    }
  }

  // Legacy cacheResults function for Keywords Everywhere fallback
  const cacheResults = async (keywords: KeywordIdea[], _actualSource: string) => {
    await cacheCombinedKeywords(keywords)
  }

  // If source is explicitly keywords_everywhere, use that directly
  if (source === 'keywords_everywhere') {
    try {
      console.log('[FETCH-IDEAS] STEP 2: Cache MISS - fetching from Keywords Everywhere API...')
      const keywordIdeas = await fetchFromKeywordsEverywhere(seedKeywords, geoTarget)
      const processingTimeMs = Date.now() - startTime
      console.log('[FETCH-IDEAS] Keywords Everywhere returned', keywordIdeas.length, 'keywords in', processingTimeMs, 'ms')

      // Cache the results
      await cacheResults(keywordIdeas, 'keywords_everywhere')

      return NextResponse.json({
        success: true,
        data: keywordIdeas,
        meta: { source: 'keywords_everywhere', processingTimeMs }
      })
    } catch (error) {
      console.error('[FETCH-IDEAS] Keywords Everywhere API error:', error)
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Keywords Everywhere API error'
      }, { status: 500 })
    }
  }

  // Try Google Ads first (if source is 'google' or 'auto')
  // NOTE: This only runs AFTER all cache checks have failed
  console.log('[FETCH-IDEAS] STEP 2: Cache MISS - fetching from Google Ads API...')
  try {
    // Get refresh token from runtime storage (falls back to env var)
    let refreshToken: string | undefined
    try {
      refreshToken = await getRefreshToken()
    } catch {
      console.warn('[FETCH-IDEAS] No refresh token in storage, using env var')
    }
    const config = getGoogleAdsConfig(refreshToken)

    console.log('[FETCH-IDEAS] Google Ads config check:')
    console.log('[FETCH-IDEAS] - Developer token:', config.developerToken ? 'SET' : 'NOT SET')
    console.log('[FETCH-IDEAS] - Refresh token:', config.refreshToken ? 'SET' : 'NOT SET')
    console.log('[FETCH-IDEAS] - Customer ID:', customerId)
    console.log('[FETCH-IDEAS] - Account Name:', accountName)

    if (!config.developerToken || !config.refreshToken || !customerId) {
      throw new Error('Google Ads API credentials not configured')
    }

    // Map geo target to constant
    const geoTargetMap: Record<string, string> = {
      'india': 'geoTargetConstants/2356',
      'usa': 'geoTargetConstants/2840',
      'uk': 'geoTargetConstants/2826',
      'global': 'geoTargetConstants/2840',
      'uae': 'geoTargetConstants/2784',
      'singapore': 'geoTargetConstants/2702',
      'australia': 'geoTargetConstants/2036',
      'canada': 'geoTargetConstants/2124',
      'germany': 'geoTargetConstants/2276',
      'malaysia': 'geoTargetConstants/2458',
      'saudi': 'geoTargetConstants/2682'
    }

    const geoTargetConstant = geoTargetMap[geoTarget.toLowerCase()] || 'geoTargetConstants/2356'
    console.log('[FETCH-IDEAS] Using geo target constant:', geoTargetConstant)

    console.log('[FETCH-IDEAS] Calling Google Ads Keyword Planner API...')
    console.log('[FETCH-IDEAS] Using UNION approach: keywordSeed + urlSeed (if URL provided)')

    // Convert cached data to KeywordIdea format for passing to getKeywordIdeas
    // This enables partial cache optimization - reuse cached data, only fetch missing
    const cachedSeedsKeywords: KeywordIdea[] | undefined = partialCacheData.seedsCached && partialCacheData.seedsCached.length > 0
      ? partialCacheData.seedsCached.map(kw => ({
          keyword: kw.keyword,
          avgMonthlySearches: kw.avgMonthlySearches,
          competition: kw.competition as 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED',
          competitionIndex: kw.competitionIndex,
          lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
          highTopOfPageBidMicros: kw.highTopOfPageBidMicros,
          bidCurrency: 'INR',
          inAccount: kw.inAccount,
          inAccountNames: kw.inAccountNames
        }))
      : undefined

    const cachedUrlKeywords: KeywordIdea[] | undefined = partialCacheData.urlCached && partialCacheData.urlCached.length > 0
      ? partialCacheData.urlCached.map(kw => ({
          keyword: kw.keyword,
          avgMonthlySearches: kw.avgMonthlySearches,
          competition: kw.competition as 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED',
          competitionIndex: kw.competitionIndex,
          lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
          highTopOfPageBidMicros: kw.highTopOfPageBidMicros,
          bidCurrency: 'INR',
          inAccount: kw.inAccount,
          inAccountNames: kw.inAccountNames
        }))
      : undefined

    if (cachedSeedsKeywords) {
      console.log(`[FETCH-IDEAS] ⚡ PARTIAL CACHE: Passing ${cachedSeedsKeywords.length} cached SEEDS keywords (skipping keywordSeed API call)`)
    }
    if (cachedUrlKeywords) {
      console.log(`[FETCH-IDEAS] ⚡ PARTIAL CACHE: Passing ${cachedUrlKeywords.length} cached URL keywords (skipping urlSeed API call)`)
    }

    const result = await getKeywordIdeas(config, {
      customerId,
      seedKeywords,
      pageUrl,
      geoTargetConstants: [geoTargetConstant],
      checkAllAccounts,
      allAccountIds,
      cachedSeedsKeywords,
      cachedUrlKeywords
    })

    const processingTimeMs = Date.now() - startTime
    console.log('[FETCH-IDEAS] Google Ads returned', result.combined.length, 'combined keywords in', processingTimeMs, 'ms')

    // ==========================================================================
    // CACHE RESULTS SEPARATELY for better reuse
    // - Seeds cache: can be reused when same seeds are used with different URL
    // - URL cache: can be reused when same URL is used with different seeds
    // - Combined cache: fastest lookup for exact same request
    // NOTE: Don't re-cache data that was already from cache (partial cache optimization)
    // ==========================================================================

    // Track what was used from cache vs fetched fresh
    const usedCachedSeeds = !!cachedSeedsKeywords
    const usedCachedUrl = !!cachedUrlKeywords

    // Cache seeds-derived keywords separately (only if we fetched them fresh)
    if (result.bySeedsOnly && result.bySeedsOnly.length > 0 && !usedCachedSeeds) {
      await cacheSeedsKeywords(result.bySeedsOnly)
    } else if (usedCachedSeeds) {
      console.log('[FETCH-IDEAS] ⚡ SKIP caching seeds (already from cache)')
    }

    // Cache URL-derived keywords separately (only if we fetched them fresh)
    if (result.byUrlOnly && result.byUrlOnly.length > 0 && !usedCachedUrl) {
      await cacheUrlKeywords(result.byUrlOnly)
    } else if (usedCachedUrl) {
      console.log('[FETCH-IDEAS] ⚡ SKIP caching URL (already from cache)')
    }

    // Cache combined results (always cache for faster exact-match lookups)
    await cacheCombinedKeywords(result.combined)

    console.log('[FETCH-IDEAS] ✓ Cached to separate caches (seeds, url, combined)')

    // Determine the actual source description
    let sourceDescription = 'google_ads'
    if (usedCachedSeeds && usedCachedUrl) {
      sourceDescription = 'cache (full)'
    } else if (usedCachedSeeds) {
      sourceDescription = 'google_ads+cache (url fetched, seeds cached)'
    } else if (usedCachedUrl) {
      sourceDescription = 'google_ads+cache (seeds fetched, url cached)'
    }

    return NextResponse.json({
      success: true,
      data: result.combined,
      meta: {
        source: 'google_ads',
        sourceDetail: sourceDescription,
        processingTimeMs,
        accountName,
        customerId,
        keywordsBySource: {
          seeds: result.bySeedsOnly?.length || 0,
          url: result.byUrlOnly?.length || 0,
          combined: result.combined.length,
          seedsFromCache: usedCachedSeeds,
          urlFromCache: usedCachedUrl
        }
      }
    })

  } catch (googleError) {
    console.error('[FETCH-IDEAS] Google Ads API error:', googleError)

    // Classify the error for structured response
    const structuredError = classifyError(googleError, customerId)
    const errorMessage = googleError instanceof Error ? googleError.message : 'Unknown error'

    console.log('[FETCH-IDEAS] Error classified as:', structuredError.type)

    // Mark quota exhausted if applicable
    if (structuredError.type === 'QUOTA_EXHAUSTED') {
      await markAccountQuotaExhausted(customerId, 5)
      console.log('[FETCH-IDEAS] Marked account quota as exhausted, will reset in 5 minutes')
    }

    // If source is explicitly 'google', don't fallback - return structured error
    if (source === 'google') {
      console.log('[FETCH-IDEAS] Source is "google", not falling back')
      const response: EnhancedApiResponse<KeywordIdea[]> = {
        success: false,
        error: structuredError,
        meta: {
          source: 'google_ads',
          processingTimeMs: Date.now() - startTime
        }
      }
      return NextResponse.json(response, { status: structuredError.type === 'AUTH' ? 401 : 500 })
    }

    // Auto mode: Try Keywords Everywhere as fallback
    console.log('[FETCH-IDEAS] Auto mode - trying Keywords Everywhere as fallback...')

    try {
      const keywordIdeas = await fetchFromKeywordsEverywhere(seedKeywords, geoTarget)
      const processingTimeMs = Date.now() - startTime
      console.log('[FETCH-IDEAS] Fallback successful, Keywords Everywhere returned', keywordIdeas.length, 'keywords in', processingTimeMs, 'ms')

      // Cache the results
      await cacheResults(keywordIdeas, 'keywords_everywhere')

      return NextResponse.json({
        success: true,
        data: keywordIdeas,
        meta: {
          source: 'keywords_everywhere',
          fallback: true,
          googleError: errorMessage,
          googleErrorType: structuredError.type,
          processingTimeMs
        }
      })
    } catch (keError) {
      console.error('[FETCH-IDEAS] Keywords Everywhere API also failed:', keError)

      // Both APIs failed - return structured error with details about both failures
      const keErrorClassified = classifyError(keError)

      const combinedError: ApiErrorResponse = {
        type: structuredError.type, // Use Google Ads error type as primary
        message: `Google Ads: ${structuredError.message}. Keywords Everywhere: ${keErrorClassified.message}`,
        isRetryable: structuredError.isRetryable || keErrorClassified.isRetryable,
        retryAfter: structuredError.retryAfter,
        accountId: customerId,
        details: JSON.stringify({
          googleAds: structuredError,
          keywordsEverywhere: keErrorClassified
        })
      }

      const response: EnhancedApiResponse<KeywordIdea[]> = {
        success: false,
        error: combinedError,
        meta: {
          source: 'none',
          processingTimeMs: Date.now() - startTime
        }
      }

      return NextResponse.json(response, { status: 500 })
    }
  }
}
