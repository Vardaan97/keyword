import { NextRequest, NextResponse } from 'next/server'
import { getLinkedInAccessToken } from '@/lib/linkedin-token-storage'

/**
 * LinkedIn Campaigns Endpoint
 *
 * Fetches campaigns and their performance data for an ad account.
 *
 * GET /api/linkedin/campaigns?accountId=517988166
 */

const LINKEDIN_API_BASE = 'https://api.linkedin.com'

async function linkedInFetch(endpoint: string, accessToken: string): Promise<Response> {
  const url = `${LINKEDIN_API_BASE}${endpoint}`
  console.log(`[LINKEDIN-CAMPAIGNS] GET ${url}`)

  return fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'Linkedin-Version': '202501',
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    const accessToken = await getLinkedInAccessToken()
    const accountId = request.nextUrl.searchParams.get('accountId') || '517988166'
    const accountUrn = `urn:li:sponsoredAccount:${accountId}`

    // Try REST API format first (recommended for newer API versions)
    // /rest/adAccounts/{id}/adCampaignGroups?q=search
    const groupsResp = await linkedInFetch(
      `/rest/adAccounts/${accountId}/adCampaignGroups?q=search&count=50`,
      accessToken
    )
    let groupsData = groupsResp.ok
      ? await groupsResp.json()
      : { elements: [], error: await groupsResp.text() }

    // If REST API fails, try v2 API format
    if (!groupsResp.ok) {
      console.log('[LINKEDIN-CAMPAIGNS] REST API failed, trying v2 API...')
      const v2GroupsResp = await linkedInFetch(
        `/v2/adCampaignGroupsV2?q=search&search=(account:(values:List(${encodeURIComponent(accountUrn)})))&count=50`,
        accessToken
      )
      groupsData = v2GroupsResp.ok
        ? await v2GroupsResp.json()
        : { elements: [], error: await v2GroupsResp.text(), v2Error: true }
    }

    // Try REST API format for campaigns
    const campaignsResp = await linkedInFetch(
      `/rest/adAccounts/${accountId}/adCampaigns?q=search&count=50`,
      accessToken
    )
    let campaignsData = campaignsResp.ok
      ? await campaignsResp.json()
      : { elements: [], error: await campaignsResp.text() }

    // If REST API fails, try v2 API format
    if (!campaignsResp.ok) {
      console.log('[LINKEDIN-CAMPAIGNS] REST API failed, trying v2 API...')
      const v2CampaignsResp = await linkedInFetch(
        `/v2/adCampaignsV2?q=search&search=(account:(values:List(${encodeURIComponent(accountUrn)})))&count=50`,
        accessToken
      )
      campaignsData = v2CampaignsResp.ok
        ? await v2CampaignsResp.json()
        : { elements: [], error: await v2CampaignsResp.text(), v2Error: true }
    }

    // Format campaign groups
    const campaignGroups = (groupsData.elements || []).map((g: Record<string, unknown>) => ({
      id: g.id,
      name: g.name,
      status: g.status,
      totalBudget: g.totalBudget,
      runSchedule: g.runSchedule,
    }))

    // Format campaigns
    const campaigns = (campaignsData.elements || []).map((c: Record<string, unknown>) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      type: c.type,
      costType: c.costType,
      dailyBudget: c.dailyBudget,
      unitCost: c.unitCost,
      objectiveType: c.objectiveType,
      optimizationTargetType: c.optimizationTargetType,
      runSchedule: c.runSchedule,
      campaignGroup: c.campaignGroup,
    }))

    return NextResponse.json({
      success: true,
      data: {
        accountId,
        accountUrn,
        campaignGroups: {
          items: campaignGroups,
          count: campaignGroups.length,
          total: groupsData.paging?.total || campaignGroups.length,
        },
        campaigns: {
          items: campaigns,
          count: campaigns.length,
          total: campaignsData.paging?.total || campaigns.length,
        },
        raw: {
          groupsError: groupsData.error,
          campaignsError: campaignsData.error,
        }
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[LINKEDIN-CAMPAIGNS] Error:', message)

    return NextResponse.json({
      success: false,
      error: message,
    }, { status: 500 })
  }
}
