import { NextRequest, NextResponse } from 'next/server'
import { findAdGroupsForUrl, getKeywordsForAdGroup, isGadsDbConfigured } from '@/lib/gads-knowledge-base'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!isGadsDbConfigured()) {
    return NextResponse.json({
      success: false,
      error: 'Database not configured. Please set SUPABASE environment variables.'
    }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const url = searchParams.get('url')
    const adGroupId = searchParams.get('adGroupId')
    const accountId = searchParams.get('accountId') || undefined

    // Get keywords for a specific ad group
    if (adGroupId) {
      const keywords = await getKeywordsForAdGroup(adGroupId)
      return NextResponse.json({ success: true, data: keywords })
    }

    // Find ad groups by URL
    if (url) {
      const adGroups = await findAdGroupsForUrl(url, accountId)
      return NextResponse.json({ success: true, data: adGroups })
    }

    return NextResponse.json({
      success: false,
      error: 'Please provide either url or adGroupId parameter'
    }, { status: 400 })
  } catch (error) {
    console.error('[GADS-AD-GROUPS] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
