import { NextRequest, NextResponse } from 'next/server'
import { getKeywordIdeas, getGoogleAdsConfig, getDefaultCustomerId, GOOGLE_ADS_ACCOUNTS, getAccountName, getRealAccountIds } from '@/lib/google-ads'
import { getKeywordData, getRelatedKeywords, getKeywordsEverywhereConfig, CountryCode } from '@/lib/keywords-everywhere'
import { getCachedKeywords, setCachedKeywords, getDatabaseStatus, UnifiedKeywordData, saveKeywordVolumes } from '@/lib/database'
import { KeywordIdea, ApiResponse } from '@/types'

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

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<KeywordIdea[]>>> {
  const startTime = Date.now()

  // Parse body outside try block so it's accessible in catch for fallback
  const body: FetchIdeasRequest = await request.json()
  const { seedKeywords, pageUrl, courseName, geoTarget = 'india', source = 'auto', skipCache = false, accountId } = body

  // Create a cache key that includes URL for better cache hits
  // This allows reusing cached data when processing the same course URL again
  const urlHash = pageUrl ? pageUrl.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50) : ''
  const courseHash = courseName ? courseName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30) : ''

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

  console.log('[FETCH-IDEAS] Request received')
  console.log('[FETCH-IDEAS] Seeds:', seedKeywords)
  console.log('[FETCH-IDEAS] Geo Target:', geoTarget)
  console.log('[FETCH-IDEAS] Source:', source)
  console.log('[FETCH-IDEAS] Skip Cache:', skipCache)
  console.log('[FETCH-IDEAS] Account:', accountName, checkAllAccounts ? `(checking ${allAccountIds.length} accounts)` : `(${customerId})`)

  if (!seedKeywords || seedKeywords.length === 0) {
    console.log('[FETCH-IDEAS] Error: No seed keywords provided')
    return NextResponse.json({
      success: false,
      error: 'Missing required field: seedKeywords'
    }, { status: 400 })
  }

  // Check cache first (unless skipCache is true)
  // Try multiple cache keys for better hit rate:
  // 1. URL-based key (best - same URL = same keywords)
  // 2. Course name-based key
  // 3. Seeds-based key (original)
  const dbStatus = getDatabaseStatus()
  if (!skipCache && dbStatus.hasAnyDatabase) {
    // Try URL-based cache first (most specific)
    const cacheKeys = [
      urlHash ? `url_${urlHash}_${geoTarget}_${source}` : null,  // URL-based
      courseHash ? `course_${courseHash}_${geoTarget}_${source}` : null,  // Course name-based
    ].filter(Boolean) as string[]

    for (const cacheKey of cacheKeys) {
      try {
        const cached = await getCachedKeywords([cacheKey], geoTarget, source)
        if (cached && cached.length > 0) {
          const processingTimeMs = Date.now() - startTime
          console.log(`[FETCH-IDEAS] Cache hit (${cacheKey.split('_')[0]}-based)!`, cached.length, 'keywords in', processingTimeMs, 'ms')

          // Convert to KeywordIdea with currency info
          const keywordIdeas: KeywordIdea[] = cached.map(kw => ({
            keyword: kw.keyword,
            avgMonthlySearches: kw.avgMonthlySearches,
            competition: kw.competition as 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED',
            competitionIndex: kw.competitionIndex,
            lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
            highTopOfPageBidMicros: kw.highTopOfPageBidMicros,
            bidCurrency: 'INR',  // Default to INR for cached data (all our accounts are INR)
            inAccount: kw.inAccount
          }))

          return NextResponse.json({
            success: true,
            data: keywordIdeas,
            meta: { source: 'cache', cached: true, processingTimeMs, databases: dbStatus, cacheKey: cacheKey.split('_')[0] }
          })
        }
      } catch (cacheError) {
        console.log(`[FETCH-IDEAS] Cache check (${cacheKey}) failed:`, cacheError)
      }
    }

    // Fallback to seed-based cache
    try {
      const cached = await getCachedKeywords(seedKeywords, geoTarget, source)
      if (cached && cached.length > 0) {
        const processingTimeMs = Date.now() - startTime
        console.log('[FETCH-IDEAS] Cache hit (seeds-based)!', cached.length, 'keywords in', processingTimeMs, 'ms')

        const keywordIdeas: KeywordIdea[] = cached.map(kw => ({
          keyword: kw.keyword,
          avgMonthlySearches: kw.avgMonthlySearches,
          competition: kw.competition as 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED',
          competitionIndex: kw.competitionIndex,
          lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
          highTopOfPageBidMicros: kw.highTopOfPageBidMicros,
          bidCurrency: 'INR',
          inAccount: kw.inAccount
        }))

        return NextResponse.json({
          success: true,
          data: keywordIdeas,
          meta: { source: 'cache', cached: true, processingTimeMs, databases: dbStatus, cacheKey: 'seeds' }
        })
      }
    } catch (cacheError) {
      console.log('[FETCH-IDEAS] Seeds cache check failed:', cacheError)
    }
  }

  // Helper function to cache results (writes to multiple cache keys for better hit rate)
  const cacheResults = async (keywords: KeywordIdea[], actualSource: string) => {
    if (!dbStatus.hasAnyDatabase) return
    try {
      const keywordData: UnifiedKeywordData[] = keywords.map(kw => ({
        keyword: kw.keyword,
        avgMonthlySearches: kw.avgMonthlySearches,
        competition: kw.competition,
        competitionIndex: kw.competitionIndex,
        lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
        highTopOfPageBidMicros: kw.highTopOfPageBidMicros,
        inAccount: kw.inAccount
      }))

      // Save to seeds-based cache (7 day TTL)
      await setCachedKeywords(seedKeywords, geoTarget, actualSource, keywordData, 168)

      // Also save with URL-based key for better cache hits when same URL is processed again
      if (urlHash) {
        await setCachedKeywords([`url_${urlHash}_${geoTarget}_${actualSource}`], geoTarget, actualSource, keywordData)
        console.log(`[FETCH-IDEAS] Saved URL-based cache: url_${urlHash.slice(0, 20)}...`)
      }

      // Save with course name-based key as well
      if (courseHash) {
        await setCachedKeywords([`course_${courseHash}_${geoTarget}_${actualSource}`], geoTarget, actualSource, keywordData)
        console.log(`[FETCH-IDEAS] Saved course-based cache: course_${courseHash}`)
      }

      // Also save individual keyword volumes for future lookups (7 day TTL)
      // This allows reusing volume data across different seed keyword searches
      const volumeSource = actualSource === 'google_ads' ? 'google_ads' : 'keywords_everywhere'
      const savedCount = await saveKeywordVolumes(keywordData, geoTarget, volumeSource as 'google_ads' | 'keywords_everywhere', 7)
      console.log(`[FETCH-IDEAS] Saved ${savedCount} keyword volumes to cache`)
    } catch (err) {
      console.log('[FETCH-IDEAS] Failed to cache results:', err)
    }
  }

  // If source is explicitly keywords_everywhere, use that directly
  if (source === 'keywords_everywhere') {
    try {
      console.log('[FETCH-IDEAS] Using Keywords Everywhere API directly...')
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
  try {
    const config = getGoogleAdsConfig()

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
    const keywordIdeas = await getKeywordIdeas(config, {
      customerId,
      seedKeywords,
      geoTargetConstants: [geoTargetConstant],
      checkAllAccounts,
      allAccountIds
    })

    const processingTimeMs = Date.now() - startTime
    console.log('[FETCH-IDEAS] Google Ads returned', keywordIdeas.length, 'keywords in', processingTimeMs, 'ms')

    // Cache the results
    await cacheResults(keywordIdeas, 'google_ads')

    return NextResponse.json({
      success: true,
      data: keywordIdeas,
      meta: { source: 'google_ads', processingTimeMs, accountName, customerId }
    })

  } catch (googleError) {
    console.error('[FETCH-IDEAS] Google Ads API error:', googleError)
    const errorMessage = googleError instanceof Error ? googleError.message : 'Unknown error'

    // If source is explicitly 'google', don't fallback
    if (source === 'google') {
      console.log('[FETCH-IDEAS] Source is "google", not falling back')
      return NextResponse.json({
        success: false,
        error: errorMessage
      }, { status: 500 })
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
        meta: { source: 'keywords_everywhere', fallback: true, googleError: errorMessage, processingTimeMs }
      })
    } catch (keError) {
      console.error('[FETCH-IDEAS] Keywords Everywhere API also failed:', keError)

      // Both APIs failed
      return NextResponse.json({
        success: false,
        error: `Google Ads: ${errorMessage}. Keywords Everywhere: ${keError instanceof Error ? keError.message : 'Unknown error'}`
      }, { status: 500 })
    }
  }
}
