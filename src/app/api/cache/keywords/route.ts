import { NextRequest, NextResponse } from 'next/server'
import { getCachedKeywords, setCachedKeywords, KeywordData } from '@/lib/mongodb'
import { ApiResponse, KeywordIdea } from '@/types'

interface CacheRequest {
  action: 'get' | 'set'
  seeds: string[]
  geoTarget: string
  source: string
  keywords?: KeywordIdea[]
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<KeywordIdea[]>>> {
  try {
    const body: CacheRequest = await request.json()
    const { action, seeds, geoTarget, source, keywords } = body

    console.log('[CACHE-API]', action, 'for', seeds.length, 'seeds,', geoTarget, source)

    if (action === 'get') {
      const cached = await getCachedKeywords(seeds, geoTarget, source)

      if (cached) {
        // Convert KeywordData to KeywordIdea format
        const keywordIdeas: KeywordIdea[] = cached.map(kw => ({
          keyword: kw.keyword,
          avgMonthlySearches: kw.avgMonthlySearches,
          competition: kw.competition as 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED',
          competitionIndex: kw.competitionIndex,
          lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
          highTopOfPageBidMicros: kw.highTopOfPageBidMicros
        }))

        return NextResponse.json({
          success: true,
          data: keywordIdeas,
          meta: { cached: true }
        })
      }

      return NextResponse.json({
        success: false,
        error: 'Cache miss'
      }, { status: 404 })
    }

    if (action === 'set' && keywords) {
      // Convert KeywordIdea to KeywordData format
      const keywordData: KeywordData[] = keywords.map(kw => ({
        keyword: kw.keyword,
        avgMonthlySearches: kw.avgMonthlySearches,
        competition: kw.competition,
        competitionIndex: kw.competitionIndex,
        lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
        highTopOfPageBidMicros: kw.highTopOfPageBidMicros
      }))

      await setCachedKeywords(seeds, geoTarget, source, keywordData)

      return NextResponse.json({
        success: true,
        data: keywords
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })

  } catch (error) {
    console.error('[CACHE-API] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Cache operation failed'
    }, { status: 500 })
  }
}
