import { NextRequest, NextResponse } from 'next/server'
import { getRecommendations, GOOGLE_ADS_ACCOUNTS } from '@/lib/google-ads-reports'
import {
  getCachedRecommendations,
  setCachedRecommendations,
  isConvexConfigured
} from '@/lib/convex'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId') || 'flexi'
    const category = searchParams.get('category') // Optional filter
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
      const cached = await getCachedRecommendations(accountId)
      if (cached) {
        console.log(`[API] Returning cached recommendations for ${account.name}`)

        // Filter by category if specified
        const filtered = category
          ? cached.recommendations.filter(r => r.category.toLowerCase() === category.toLowerCase())
          : cached.recommendations

        return NextResponse.json({
          success: true,
          data: {
            accountId: account.id,
            accountName: account.name,
            recommendations: filtered,
            summary: cached.summary,
            cached: true,
            cachedAt: cached.fetchedAt,
          }
        })
      }
    }

    console.log(`[API] Fetching recommendations for ${account.name}`)

    const recommendations = await getRecommendations(account.customerId)

    // Filter by category if specified
    const filtered = category
      ? recommendations.filter(r => r.category.toLowerCase() === category.toLowerCase())
      : recommendations

    // Group by category for summary
    const byCategory = recommendations.reduce((acc, r) => {
      acc[r.category] = (acc[r.category] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Calculate total potential uplift
    const totalPotentialClicks = recommendations.reduce(
      (sum, r) => sum + (r.impact.potentialClicks - r.impact.baseClicks),
      0
    )
    const totalPotentialConversions = recommendations.reduce(
      (sum, r) => sum + (r.impact.potentialConversions - r.impact.baseConversions),
      0
    )

    const summary = {
      total: recommendations.length,
      byCategory,
      potentialClicks: totalPotentialClicks,
      potentialConversions: totalPotentialConversions,
    }

    // Cache the results in Convex (background, non-blocking)
    if (isConvexConfigured()) {
      setCachedRecommendations(accountId, recommendations, summary)
        .catch(err => console.error('[API] Failed to cache recommendations:', err))
    }

    return NextResponse.json({
      success: true,
      data: {
        accountId: account.id,
        accountName: account.name,
        recommendations: filtered,
        summary,
        cached: false,
      }
    })
  } catch (error) {
    console.error('[API] Recommendations error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
