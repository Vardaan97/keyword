import { NextRequest, NextResponse } from 'next/server'
import { getLinkedInAccessToken } from '@/lib/linkedin-token-storage'

/**
 * LinkedIn Analytics Endpoint
 *
 * Fetches performance analytics for campaigns.
 *
 * GET /api/linkedin/analytics?accountId=517988166&dateRange=last30days
 */

const LINKEDIN_API_BASE = 'https://api.linkedin.com'

async function linkedInFetch(endpoint: string, accessToken: string): Promise<Response> {
  const url = `${LINKEDIN_API_BASE}${endpoint}`
  console.log(`[LINKEDIN-ANALYTICS] GET ${url}`)

  return fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'Linkedin-Version': '202501',
    },
  })
}

function getDateRange(range: string): { start: { year: number; month: number; day: number }; end: { year: number; month: number; day: number } } {
  const now = new Date()
  const end = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }

  let startDate: Date
  switch (range) {
    case 'last7days':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case 'last30days':
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    case 'last90days':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      break
    case 'thisMonth':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'lastMonth':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      break
  }

  return {
    start: { year: startDate.getFullYear(), month: startDate.getMonth() + 1, day: startDate.getDate() },
    end,
  }
}

export async function GET(request: NextRequest) {
  try {
    const accessToken = await getLinkedInAccessToken()
    const accountId = request.nextUrl.searchParams.get('accountId')

    // Security: Require accountId parameter - never default to a hardcoded account
    if (!accountId) {
      return NextResponse.json({
        success: false,
        error: 'accountId parameter is required',
      }, { status: 400 })
    }

    const dateRange = request.nextUrl.searchParams.get('dateRange') || 'last30days'
    const pivot = request.nextUrl.searchParams.get('pivot') || 'CAMPAIGN' // CAMPAIGN, CREATIVE, COMPANY, etc.

    const accountUrn = `urn:li:sponsoredAccount:${accountId}`
    const { start, end } = getDateRange(dateRange)

    // Build analytics query using REST API format
    // REST API: /rest/adAnalytics?q=analytics&pivot=CAMPAIGN&dateRange=(start:(year:2026,month:1,day:1),end:(...))
    const restAnalyticsUrl = `/rest/adAnalytics?q=analytics` +
      `&pivot=${pivot}` +
      `&dateRange=(start:(year:${start.year},month:${start.month},day:${start.day}),end:(year:${end.year},month:${end.month},day:${end.day}))` +
      `&timeGranularity=DAILY` +
      `&accounts=List(${encodeURIComponent(accountUrn)})` +
      `&fields=impressions,clicks,costInLocalCurrency,conversions,leads,shares,comments,reactions,follows`

    let analyticsResp = await linkedInFetch(restAnalyticsUrl, accessToken)
    let analyticsUrl = restAnalyticsUrl

    // If REST API fails, try v2 API format
    if (!analyticsResp.ok) {
      console.log('[LINKEDIN-ANALYTICS] REST API failed, trying v2 API...')
      const v2AnalyticsUrl = `/v2/adAnalyticsV2?q=analytics` +
        `&pivot=${pivot}` +
        `&dateRange.start.day=${start.day}&dateRange.start.month=${start.month}&dateRange.start.year=${start.year}` +
        `&dateRange.end.day=${end.day}&dateRange.end.month=${end.month}&dateRange.end.year=${end.year}` +
        `&timeGranularity=DAILY` +
        `&accounts=List(${encodeURIComponent(accountUrn)})` +
        `&fields=impressions,clicks,costInLocalCurrency,conversions,leads,shares,comments,reactions,follows`

      analyticsResp = await linkedInFetch(v2AnalyticsUrl, accessToken)
      analyticsUrl = v2AnalyticsUrl
    }

    if (!analyticsResp.ok) {
      const errorText = await analyticsResp.text()
      return NextResponse.json({
        success: false,
        error: `Analytics API error: ${analyticsResp.status}`,
        details: errorText,
        requestedUrl: analyticsUrl,
      }, { status: analyticsResp.status })
    }

    const analyticsData = await analyticsResp.json()

    // Process and aggregate analytics
    const elements = analyticsData.elements || []

    // Calculate totals
    const totals = elements.reduce((acc: Record<string, number>, el: Record<string, number>) => {
      acc.impressions = (acc.impressions || 0) + (el.impressions || 0)
      acc.clicks = (acc.clicks || 0) + (el.clicks || 0)
      acc.costInLocalCurrency = (acc.costInLocalCurrency || 0) + (Number(el.costInLocalCurrency) || 0)
      acc.conversions = (acc.conversions || 0) + (el.conversions || 0)
      acc.leads = (acc.leads || 0) + (el.leads || 0)
      acc.shares = (acc.shares || 0) + (el.shares || 0)
      acc.comments = (acc.comments || 0) + (el.comments || 0)
      acc.reactions = (acc.reactions || 0) + (el.reactions || 0)
      acc.follows = (acc.follows || 0) + (el.follows || 0)
      return acc
    }, {})

    // Calculate derived metrics
    const ctr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : '0.00'
    const cpc = totals.clicks > 0 ? (totals.costInLocalCurrency / totals.clicks).toFixed(2) : '0.00'
    const cpm = totals.impressions > 0 ? ((totals.costInLocalCurrency / totals.impressions) * 1000).toFixed(2) : '0.00'

    return NextResponse.json({
      success: true,
      data: {
        accountId,
        accountUrn,
        dateRange: {
          type: dateRange,
          start: `${start.year}-${String(start.month).padStart(2, '0')}-${String(start.day).padStart(2, '0')}`,
          end: `${end.year}-${String(end.month).padStart(2, '0')}-${String(end.day).padStart(2, '0')}`,
        },
        pivot,
        summary: {
          impressions: totals.impressions || 0,
          clicks: totals.clicks || 0,
          spend: totals.costInLocalCurrency || 0,
          conversions: totals.conversions || 0,
          leads: totals.leads || 0,
          engagement: {
            shares: totals.shares || 0,
            comments: totals.comments || 0,
            reactions: totals.reactions || 0,
            follows: totals.follows || 0,
          },
          metrics: {
            ctr: `${ctr}%`,
            cpc: cpc,
            cpm: cpm,
          },
        },
        breakdown: elements.map((el: Record<string, unknown>) => ({
          pivotValue: el.pivotValue || el.pivot,
          dateRange: el.dateRange,
          impressions: el.impressions,
          clicks: el.clicks,
          spend: el.costInLocalCurrency,
          conversions: el.conversions,
          leads: el.leads,
        })),
        count: elements.length,
        paging: analyticsData.paging,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[LINKEDIN-ANALYTICS] Error:', message)

    return NextResponse.json({
      success: false,
      error: message,
    }, { status: 500 })
  }
}
