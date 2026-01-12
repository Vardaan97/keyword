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

        // Generate cache keys
        const urlHash = pageUrl ? crypto.createHash('md5').update(pageUrl).digest('hex').substring(0, 12) : null
        const courseHash = courseName ? crypto.createHash('md5').update(courseName.toLowerCase()).digest('hex').substring(0, 12) : null

        // Check cache first
        sendEvent('progress', {
          step: 'checking_cache',
          message: 'Checking cache...',
          timestamp: Date.now()
        })

        const dbStatus = getDatabaseStatus()
        if (!skipCache && dbStatus.hasAnyDatabase) {
          const cacheKeys = [
            urlHash ? `url_${urlHash}_${geoTarget}_${source}` : null,
            courseHash ? `course_${courseHash}_${geoTarget}_${source}` : null,
          ].filter(Boolean) as string[]

          for (const cacheKey of cacheKeys) {
            try {
              const cached = await getCachedKeywords([cacheKey], geoTarget, source)
              if (cached && cached.length > 0) {
                const processingTimeMs = Date.now() - startTime

                sendEvent('progress', {
                  step: 'cache_hit',
                  message: `Cache hit! Found ${cached.length} keywords`,
                  timestamp: Date.now()
                })

                // Send keywords in batches for smoother UI updates
                const batchSize = 50
                for (let i = 0; i < cached.length; i += batchSize) {
                  const batch = cached.slice(i, i + batchSize).map(kw => ({
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
                    total: Math.ceil(cached.length / batchSize),
                    progress: Math.min(100, Math.round(((i + batch.length) / cached.length) * 100))
                  })

                  // Small delay between batches for smooth UI
                  await new Promise(resolve => setTimeout(resolve, 10))
                }

                sendEvent('complete', {
                  success: true,
                  totalKeywords: cached.length,
                  source: 'cache',
                  cached: true,
                  processingTimeMs
                })

                controller.close()
                return
              }
            } catch (cacheError) {
              console.log(`[STREAM] Cache check failed:`, cacheError)
            }
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

            keywords = await getKeywordIdeas(activeConfig, {
              customerId,
              seedKeywords,
              pageUrl,
              geoTargetConstants: [geoTargetConstant],
              checkAllAccounts,
              allAccountIds
            })

            actualSource = 'google_ads'

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

        // Cache the results
        if (keywords.length > 0 && dbStatus.hasAnyDatabase) {
          sendEvent('progress', {
            step: 'caching',
            message: 'Saving to cache...',
            timestamp: Date.now()
          })

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

            // Save to various cache keys
            await setCachedKeywords(seedKeywords, geoTarget, actualSource, keywordData)

            if (urlHash) {
              const urlCacheKey = `url_${urlHash}_${geoTarget}_${actualSource}`
              await setCachedKeywords([urlCacheKey], geoTarget, actualSource, keywordData)
            }

            if (courseHash) {
              const courseCacheKey = `course_${courseHash}_${geoTarget}_${actualSource}`
              await setCachedKeywords([courseCacheKey], geoTarget, actualSource, keywordData)
            }
          } catch (cacheError) {
            console.log('[STREAM] Cache save error:', cacheError)
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
