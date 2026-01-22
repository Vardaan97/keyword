import { NextRequest } from 'next/server'
import { getKeywordIdeas, getGoogleAdsConfig, getDefaultCustomerId, GOOGLE_ADS_ACCOUNTS, getAccountName, getRealAccountIds } from '@/lib/google-ads'
import { getKeywordData, getRelatedKeywords, getKeywordsEverywhereConfig, CountryCode } from '@/lib/keywords-everywhere'
import { getCachedKeywords, setCachedKeywords, getDatabaseStatus, UnifiedKeywordData, saveKeywordVolumes } from '@/lib/database'
import { getRefreshToken } from '@/lib/token-storage'
import { KeywordIdea } from '@/types'
import crypto from 'crypto'

interface FetchIdeasRequest {
  seedKeywords: string[]
  pageUrl?: string
  courseName?: string
  geoTarget?: string
  source?: 'google' | 'keywords_everywhere' | 'auto'
  skipCache?: boolean
  accountId?: string
}

// Map geo targets to geo target constants
const geoTargetMap: Record<string, string> = {
  'india': 'geoTargetConstants/2356',
  'usa': 'geoTargetConstants/2840',
  'uk': 'geoTargetConstants/2826',
  'uae': 'geoTargetConstants/2784',
  'singapore': 'geoTargetConstants/2702',
  'australia': 'geoTargetConstants/2036',
  'canada': 'geoTargetConstants/2124',
  'germany': 'geoTargetConstants/2276',
  'malaysia': 'geoTargetConstants/2458',
  'saudi': 'geoTargetConstants/2682',
  'global': 'geoTargetConstants/2840'
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
 * SSE Streaming endpoint for fetching keyword ideas
 * Sends real-time progress updates and keywords as they're fetched
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Parse request body
  let body: FetchIdeasRequest
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const {
    seedKeywords,
    pageUrl,
    courseName,
    geoTarget = 'india',
    source = 'auto',
    skipCache = false,
    accountId = 'all-accounts'
  } = body

  // Create a readable stream for SSE
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      // Helper to send SSE events
      const sendEvent = (type: string, data: unknown) => {
        const event = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(event))
      }

      try {
        // Send initial progress
        sendEvent('progress', {
          step: 'starting',
          message: 'Starting keyword fetch...',
          timestamp: Date.now()
        })

        // Validate input
        if (!seedKeywords || seedKeywords.length === 0) {
          sendEvent('error', { message: 'No seed keywords provided' })
          controller.close()
          return
        }

        // Determine account settings
        let customerId = getDefaultCustomerId()
        let accountName = 'Default'
        let checkAllAccounts = false
        let allAccountIds: string[] = []

        if (accountId === 'all-accounts') {
          checkAllAccounts = true
          allAccountIds = getRealAccountIds()
          accountName = 'All Accounts'
          customerId = allAccountIds[0]
        } else {
          const account = GOOGLE_ADS_ACCOUNTS.find(acc => acc.id === accountId)
          if (account && account.customerId !== 'ALL') {
            customerId = account.customerId
            accountName = account.name
          }
        }

        // Helper to generate hash for cache keys
        const hashForCache = (str: string): string => str.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50)

        // Normalize source for consistent cache keys
        const normalizedSource = (source === 'auto' || source === 'google') ? 'google_ads' : source

        // Generate cache keys
        const urlHash = pageUrl ? hashForCache(pageUrl) : ''
        const courseHash = courseName ? hashForCache(courseName) : ''
        const seedsHash = seedKeywords.length > 0 ? hashForCache(seedKeywords.sort().join(',')) : ''

        // Cache key definitions
        const combinedCacheKey = `combined_${seedsHash}_${urlHash}_${geoTarget}_${normalizedSource}`
        const seedsCacheKey = seedsHash ? `seeds_${seedsHash}_${geoTarget}_${normalizedSource}` : ''
        const urlCacheKey = urlHash ? `url_${urlHash}_${geoTarget}_${normalizedSource}` : ''

        // Check cache first
        sendEvent('progress', {
          step: 'checking_cache',
          message: 'Checking cache...',
          timestamp: Date.now()
        })

        // Track partial cache data for optimization
        let cachedSeedsData: UnifiedKeywordData[] | null = null
        let cachedUrlData: UnifiedKeywordData[] | null = null

        const dbStatus = getDatabaseStatus()
        if (!skipCache && dbStatus.hasAnyDatabase) {
          // 1. Check combined cache first
          try {
            const combinedCached = await getCachedKeywords([combinedCacheKey], geoTarget, normalizedSource)
            if (combinedCached && combinedCached.length > 0) {
              const processingTimeMs = Date.now() - startTime

              sendEvent('progress', {
                step: 'cache_hit',
                message: `Cache hit (combined)! Found ${combinedCached.length} keywords`,
                timestamp: Date.now()
              })

              // Send keywords in batches for smoother UI updates
              const batchSize = 50
              for (let i = 0; i < combinedCached.length; i += batchSize) {
                const batch = combinedCached.slice(i, i + batchSize).map(kw => ({
                  keyword: kw.keyword,
                  avgMonthlySearches: kw.avgMonthlySearches,
                  competition: kw.competition,
                  competitionIndex: kw.competitionIndex,
                  lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
                  highTopOfPageBidMicros: kw.highTopOfPageBidMicros,
                  bidCurrency: 'INR',
                  inAccount: kw.inAccount
                }))

                sendEvent('keywords', {
                  keywords: batch,
                  batch: Math.floor(i / batchSize) + 1,
                  total: Math.ceil(combinedCached.length / batchSize),
                  progress: Math.min(100, Math.round(((i + batch.length) / combinedCached.length) * 100))
                })

                await new Promise(resolve => setTimeout(resolve, 10))
              }

              sendEvent('complete', {
                success: true,
                totalKeywords: combinedCached.length,
                source: 'cache',
                cacheType: 'combined',
                cached: true,
                processingTimeMs
              })

              controller.close()
              return
            }
          } catch (cacheError) {
            console.log(`[STREAM] Combined cache check failed:`, cacheError)
          }

          // 2. Check if we can reconstruct from seeds + URL caches
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

                sendEvent('progress', {
                  step: 'cache_hit',
                  message: `Cache hit (reconstructed)! Found ${combined.length} keywords`,
                  timestamp: Date.now()
                })

                // Send keywords in batches
                const batchSize = 50
                for (let i = 0; i < combined.length; i += batchSize) {
                  const batch = combined.slice(i, i + batchSize).map(kw => ({
                    keyword: kw.keyword,
                    avgMonthlySearches: kw.avgMonthlySearches,
                    competition: kw.competition,
                    competitionIndex: kw.competitionIndex,
                    lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
                    highTopOfPageBidMicros: kw.highTopOfPageBidMicros,
                    bidCurrency: 'INR',
                    inAccount: kw.inAccount
                  }))

                  sendEvent('keywords', {
                    keywords: batch,
                    batch: Math.floor(i / batchSize) + 1,
                    total: Math.ceil(combined.length / batchSize),
                    progress: Math.min(100, Math.round(((i + batch.length) / combined.length) * 100))
                  })

                  await new Promise(resolve => setTimeout(resolve, 10))
                }

                // Save combined for faster future lookups
                await setCachedKeywords([combinedCacheKey], geoTarget, normalizedSource, combined, 168)

                sendEvent('complete', {
                  success: true,
                  totalKeywords: combined.length,
                  source: 'cache',
                  cacheType: 'reconstructed',
                  cached: true,
                  processingTimeMs
                })

                controller.close()
                return
              }
            } catch (cacheError) {
              console.log(`[STREAM] Separate cache reconstruction failed:`, cacheError)
            }
          }

          // 3. Check for PARTIAL cache hits
          if (seedsCacheKey) {
            try {
              cachedSeedsData = await getCachedKeywords([seedsCacheKey], geoTarget, normalizedSource)
              if (cachedSeedsData && cachedSeedsData.length > 0) {
                console.log(`[STREAM] Found SEEDS cache: ${cachedSeedsData.length} keywords`)
              }
            } catch (err) {
              console.log('[STREAM] Seeds cache check failed:', err)
            }
          }

          if (urlCacheKey) {
            try {
              cachedUrlData = await getCachedKeywords([urlCacheKey], geoTarget, normalizedSource)
              if (cachedUrlData && cachedUrlData.length > 0) {
                console.log(`[STREAM] Found URL cache: ${cachedUrlData.length} keywords`)
              }
            } catch (err) {
              console.log('[STREAM] URL cache check failed:', err)
            }
          }

          // Log partial cache status
          if (cachedSeedsData && cachedSeedsData.length > 0 && !cachedUrlData && pageUrl) {
            sendEvent('progress', {
              step: 'partial_cache',
              message: `Partial cache: seeds cached (${cachedSeedsData.length}), fetching URL keywords...`,
              timestamp: Date.now()
            })
          } else if (cachedUrlData && cachedUrlData.length > 0 && !cachedSeedsData && seedKeywords.length > 0) {
            sendEvent('progress', {
              step: 'partial_cache',
              message: `Partial cache: URL cached (${cachedUrlData.length}), fetching seed keywords...`,
              timestamp: Date.now()
            })
          }
        }

        // No cache hit - fetch from API
        sendEvent('progress', {
          step: 'fetching',
          message: `Fetching keywords from ${source === 'auto' ? 'Google Ads API' : source}...`,
          account: accountName,
          timestamp: Date.now()
        })

        let keywords: KeywordIdea[] = []
        let actualSource = 'google_ads'

        // Try Google Ads first
        const config = getGoogleAdsConfig()
        const refreshToken = await getRefreshToken()

        if (config.developerToken && config.clientId && (config.refreshToken || refreshToken)) {
          const activeConfig = refreshToken ? { ...config, refreshToken } : config

          sendEvent('progress', {
            step: 'fetching_google_ads',
            message: checkAllAccounts
              ? `Fetching keywords & checking "in account" across ${allAccountIds.length} accounts...`
              : `Fetching keywords & checking "in account" for ${accountName}...`,
            timestamp: Date.now()
          })

          try {
            const geoTargetConstant = geoTargetMap[geoTarget.toLowerCase()] || geoTargetMap['india']

            // Convert cached data to KeywordIdea format for partial cache optimization
            const cachedSeedsKeywords: KeywordIdea[] | undefined = cachedSeedsData && cachedSeedsData.length > 0
              ? cachedSeedsData.map(kw => ({
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

            const cachedUrlKeywords: KeywordIdea[] | undefined = cachedUrlData && cachedUrlData.length > 0
              ? cachedUrlData.map(kw => ({
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

            const result = await getKeywordIdeas(activeConfig, {
              customerId,
              seedKeywords,
              pageUrl,
              geoTargetConstants: [geoTargetConstant],
              checkAllAccounts,
              allAccountIds,
              cachedSeedsKeywords,
              cachedUrlKeywords
            })

            keywords = result.combined  // Extract combined keywords from result
            actualSource = 'google_ads'

            // Track what was from cache vs fresh
            const usedCachedSeeds = !!cachedSeedsKeywords
            const usedCachedUrl = !!cachedUrlKeywords

            // Send keywords in batches as they're "received"
            const batchSize = 50
            for (let i = 0; i < keywords.length; i += batchSize) {
              const batch = keywords.slice(i, i + batchSize)

              sendEvent('keywords', {
                keywords: batch,
                batch: Math.floor(i / batchSize) + 1,
                total: Math.ceil(keywords.length / batchSize),
                progress: Math.min(100, Math.round(((i + batch.length) / keywords.length) * 100))
              })

              // Small delay for smooth UI
              await new Promise(resolve => setTimeout(resolve, 10))
            }

            // Cache results (only fresh data, not already-cached data)
            if (keywords.length > 0 && dbStatus.hasAnyDatabase) {
              sendEvent('progress', {
                step: 'caching',
                message: 'Saving to cache...',
                timestamp: Date.now()
              })

              try {
                // Cache seeds keywords (only if fetched fresh)
                if (result.bySeedsOnly && result.bySeedsOnly.length > 0 && !usedCachedSeeds && seedsCacheKey) {
                  const seedsData: UnifiedKeywordData[] = result.bySeedsOnly.map(kw => ({
                    keyword: kw.keyword,
                    avgMonthlySearches: kw.avgMonthlySearches,
                    competition: kw.competition,
                    competitionIndex: kw.competitionIndex,
                    lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
                    highTopOfPageBidMicros: kw.highTopOfPageBidMicros,
                    inAccount: kw.inAccount
                  }))
                  await setCachedKeywords([seedsCacheKey], geoTarget, normalizedSource, seedsData, 168)
                  console.log(`[STREAM] Cached ${seedsData.length} keywords to SEEDS cache`)
                }

                // Cache URL keywords (only if fetched fresh)
                if (result.byUrlOnly && result.byUrlOnly.length > 0 && !usedCachedUrl && urlCacheKey) {
                  const urlData: UnifiedKeywordData[] = result.byUrlOnly.map(kw => ({
                    keyword: kw.keyword,
                    avgMonthlySearches: kw.avgMonthlySearches,
                    competition: kw.competition,
                    competitionIndex: kw.competitionIndex,
                    lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
                    highTopOfPageBidMicros: kw.highTopOfPageBidMicros,
                    inAccount: kw.inAccount
                  }))
                  await setCachedKeywords([urlCacheKey], geoTarget, normalizedSource, urlData, 168)
                  console.log(`[STREAM] Cached ${urlData.length} keywords to URL cache`)
                }

                // Cache combined results (always for faster exact-match lookups)
                const combinedData: UnifiedKeywordData[] = keywords.map(kw => ({
                  keyword: kw.keyword,
                  avgMonthlySearches: kw.avgMonthlySearches,
                  competition: kw.competition,
                  competitionIndex: kw.competitionIndex,
                  lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
                  highTopOfPageBidMicros: kw.highTopOfPageBidMicros,
                  inAccount: kw.inAccount
                }))
                await setCachedKeywords([combinedCacheKey], geoTarget, normalizedSource, combinedData, 168)

                // Also cache with course key if available
                if (courseHash) {
                  const courseCacheKey = `course_${courseHash}_${geoTarget}_${normalizedSource}`
                  await setCachedKeywords([courseCacheKey], geoTarget, normalizedSource, combinedData, 168)
                }
              } catch (cacheError) {
                console.log('[STREAM] Cache save error:', cacheError)
              }
            }

          } catch (googleError) {
            const errorMsg = googleError instanceof Error ? googleError.message : String(googleError)
            console.log('[STREAM] Google Ads error:', errorMsg)

            sendEvent('progress', {
              step: 'google_ads_failed',
              message: `Google Ads failed: ${errorMsg.substring(0, 100)}...`,
              timestamp: Date.now()
            })

            // Fall back to Keywords Everywhere
            if (source === 'auto') {
              sendEvent('progress', {
                step: 'fallback',
                message: 'Falling back to Keywords Everywhere...',
                timestamp: Date.now()
              })

              // Implement Keywords Everywhere fallback here if needed
              // For now, return the error
              sendEvent('error', {
                message: errorMsg,
                source: 'google_ads'
              })
              controller.close()
              return
            }
          }
        }

        const processingTimeMs = Date.now() - startTime

        sendEvent('complete', {
          success: true,
          totalKeywords: keywords.length,
          source: actualSource,
          cached: false,
          processingTimeMs,
          account: accountName
        })

        controller.close()

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        sendEvent('error', { message: errorMsg })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
