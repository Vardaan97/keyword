/**
 * Turso Lookup API
 *
 * Queries Google Ads account data stored in Turso for:
 * - URL matching: find campaigns/ad groups advertising a specific course URL
 * - Keyword search: check if a keyword exists across accounts
 * - Account summary: get sync status and counts
 *
 * GET /api/gads/turso-lookup?url=<course_url>           → URL match results
 * GET /api/gads/turso-lookup?keyword=<keyword>          → Keyword search
 * GET /api/gads/turso-lookup?summary=true               → Account summaries
 * GET /api/gads/turso-lookup?url=<url>&account=<name>   → Filter by account
 */

import { NextRequest, NextResponse } from 'next/server'
import { isTursoConfigured, lookupByUrl, lookupKeyword, getAccountSummaries } from '@/lib/turso-client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!isTursoConfigured()) {
    return NextResponse.json({
      success: false,
      error: 'Turso not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.'
    }, { status: 500 })
  }

  const params = request.nextUrl.searchParams
  const url = params.get('url')
  const keyword = params.get('keyword')
  const summary = params.get('summary')
  const account = params.get('account') || undefined

  try {
    // Account summary mode
    if (summary === 'true') {
      const summaries = await getAccountSummaries()
      return NextResponse.json({ success: true, data: summaries })
    }

    // URL lookup mode
    if (url) {
      const results = await lookupByUrl(url, account)

      // Group by account for cleaner response
      const grouped: Record<string, {
        campaigns: { name: string; status: string | null; locations: string[]; adGroups: { name: string; status: string | null; adStrength: string | null; finalUrl: string }[] }[]
      }> = {}

      for (const r of results) {
        if (!grouped[r.accountName]) {
          grouped[r.accountName] = { campaigns: [] }
        }
        let campaign = grouped[r.accountName].campaigns.find(c => c.name === r.campaignName)
        if (!campaign) {
          campaign = { name: r.campaignName, status: r.campaignStatus, locations: r.locations, adGroups: [] }
          grouped[r.accountName].campaigns.push(campaign)
        }
        if (!campaign.adGroups.find(ag => ag.name === r.adGroupName)) {
          campaign.adGroups.push({ name: r.adGroupName, status: r.adGroupStatus, adStrength: r.adStrength, finalUrl: r.finalUrl })
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          url,
          totalMatches: results.length,
          accounts: grouped
        }
      })
    }

    // Keyword lookup mode
    if (keyword) {
      const results = await lookupKeyword(keyword, account)

      // Group by account
      const grouped: Record<string, {
        matches: { campaign: string; adGroup: string; matchType: string; status: string | null; qualityScore: number | null }[]
      }> = {}

      for (const r of results) {
        if (!grouped[r.accountName]) {
          grouped[r.accountName] = { matches: [] }
        }
        grouped[r.accountName].matches.push({
          campaign: r.campaignName,
          adGroup: r.adGroupName,
          matchType: r.matchType,
          status: r.status,
          qualityScore: r.qualityScore
        })
      }

      return NextResponse.json({
        success: true,
        data: {
          keyword,
          totalMatches: results.length,
          accounts: grouped
        }
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Provide ?url=<course_url>, ?keyword=<keyword>, or ?summary=true'
    }, { status: 400 })

  } catch (error) {
    console.error('[TURSO-LOOKUP] Error:', error)
    const message = error instanceof Error ? error.message : 'Turso query failed'
    const stack = error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined
    return NextResponse.json({
      success: false,
      error: message,
      debug: {
        tursoUrl: process.env.TURSO_DATABASE_URL?.substring(0, 30) + '...',
        hasToken: !!process.env.TURSO_AUTH_TOKEN,
        stack
      }
    }, { status: 500 })
  }
}
