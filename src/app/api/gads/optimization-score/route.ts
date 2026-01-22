import { NextRequest, NextResponse } from 'next/server'
import { getOptimizationScore, GOOGLE_ADS_ACCOUNTS } from '@/lib/google-ads-reports'
import {
  getCachedOptimizationScore,
  setCachedOptimizationScore,
  isConvexConfigured
} from '@/lib/convex'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId') || 'flexi'
    const skipCache = searchParams.get('skipCache') === 'true'

    // Find the account
    const account = GOOGLE_ADS_ACCOUNTS.find(a => a.id === accountId)
    if (!account || account.customerId === 'ALL') {
      return NextResponse.json({
        success: false,
        error: 'Invalid account ID'
      }, { status: 400 })
    }

    // Check Convex cache first (unless skipCache is true)
    if (!skipCache && isConvexConfigured()) {
      const cached = await getCachedOptimizationScore(accountId)
      if (cached) {
        console.log(`[API] Returning cached optimization score for ${account.name}`)
        return NextResponse.json({
          success: true,
          data: {
            accountId: account.id,
            score: cached.score,
            upliftPotential: cached.upliftPotential,
            recommendationCount: cached.recommendationCount,
            cached: true,
            cachedAt: cached.fetchedAt,
          }
        })
      }
    }

    console.log(`[API] Fetching optimization score for ${account.name}`)

    const score = await getOptimizationScore(account.customerId)

    // Cache the results in Convex (background, non-blocking)
    if (isConvexConfigured()) {
      setCachedOptimizationScore(
        accountId,
        score.score,
        score.uplift,
        0 // recommendationCount fetched separately
      ).catch(err => console.error('[API] Failed to cache optimization score:', err))
    }

    return NextResponse.json({
      success: true,
      data: {
        accountId: account.id,
        score: score.score,
        upliftPotential: score.uplift,
        accountName: score.accountName,
        cached: false,
      }
    })
  } catch (error) {
    console.error('[API] Optimization score error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
