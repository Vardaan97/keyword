import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/../convex/_generated/api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/gads/ad-group-lookup
 *
 * Look up ad group mappings for a URL or list all mappings
 *
 * Query params:
 * - url: URL to look up (normalized)
 * - accountId: Filter by account (optional)
 * - country: Filter by country (optional)
 * - listAll: If 'true', returns all unique campaign/adGroup combos for the account
 */
export async function GET(request: NextRequest) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    return NextResponse.json(
      { success: false, error: 'Convex URL not configured' },
      { status: 500 }
    )
  }

  const convex = new ConvexHttpClient(convexUrl)
  const { searchParams } = new URL(request.url)

  const url = searchParams.get('url')
  const accountId = searchParams.get('accountId')
  const country = searchParams.get('country')
  const listAll = searchParams.get('listAll') === 'true'

  try {
    if (listAll && accountId) {
      // Return all unique campaign/adGroup combinations for the account
      const mappings = await convex.query(api.urlAdGroupMappings.getByAccount, {
        accountId,
      })

      // Deduplicate by campaign + adGroup
      const seen = new Set<string>()
      const uniqueAdGroups: { campaign: string; adGroup: string; country: string | null }[] = []

      for (const mapping of mappings) {
        const key = `${mapping.campaignName}|${mapping.adGroupName}`
        if (!seen.has(key)) {
          seen.add(key)
          uniqueAdGroups.push({
            campaign: mapping.campaignName,
            adGroup: mapping.adGroupName,
            country: mapping.country || null,
          })
        }
      }

      // Sort by campaign, then adGroup
      uniqueAdGroups.sort((a, b) => {
        const campaignCompare = a.campaign.localeCompare(b.campaign)
        if (campaignCompare !== 0) return campaignCompare
        return a.adGroup.localeCompare(b.adGroup)
      })

      return NextResponse.json({
        success: true,
        data: uniqueAdGroups,
      })
    }

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL is required for lookup' },
        { status: 400 }
      )
    }

    // Look up by URL
    const mappings = await convex.query(api.urlAdGroupMappings.getByUrl, {
      url,
      accountId: accountId || undefined,
      country: country || undefined,
    })

    return NextResponse.json({
      success: true,
      data: mappings,
    })
  } catch (error) {
    console.error('[AD-GROUP-LOOKUP] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to lookup ad groups',
      },
      { status: 500 }
    )
  }
}
