import { NextRequest, NextResponse } from 'next/server'
import { isGadsDbConfigured } from '@/lib/gads-knowledge-base'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function GET(request: NextRequest) {
  if (!isGadsDbConfigured()) {
    return NextResponse.json({
      success: false,
      error: 'Database not configured. Please set SUPABASE environment variables.'
    }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as 'enabled' | 'paused' | undefined

    const supabase = createClient(supabaseUrl!, supabaseKey!)

    // Get campaigns with labels from campaigns table
    let campaignsQuery = supabase
      .from('gads_campaigns')
      .select(`
        id,
        name,
        campaign_type,
        status,
        bid_strategy_type,
        target_cpa,
        labels,
        account_id,
        gads_accounts!inner (
          name,
          customer_id
        )
      `)

    if (status) {
      campaignsQuery = campaignsQuery.ilike('status', status)
    }

    const { data: campaigns, error: campaignsError } = await campaignsQuery

    if (campaignsError) {
      throw new Error(campaignsError.message)
    }

    // Get ad group counts per campaign
    const campaignIds = campaigns?.map(c => c.id) || []

    const { data: adGroupCounts } = await supabase
      .from('gads_ad_groups')
      .select('campaign_id')
      .in('campaign_id', campaignIds)

    // Count ad groups per campaign
    const adGroupCountMap = new Map<string, number>()
    adGroupCounts?.forEach(ag => {
      adGroupCountMap.set(ag.campaign_id, (adGroupCountMap.get(ag.campaign_id) || 0) + 1)
    })

    // Get keyword counts per campaign (via ad groups)
    const { data: adGroupsWithKeywords } = await supabase
      .from('gads_ad_groups')
      .select('id, campaign_id')
      .in('campaign_id', campaignIds)

    const adGroupIds = adGroupsWithKeywords?.map(ag => ag.id) || []
    const adGroupToCampaign = new Map<string, string>()
    adGroupsWithKeywords?.forEach(ag => {
      adGroupToCampaign.set(ag.id, ag.campaign_id)
    })

    const { data: keywordCounts } = await supabase
      .from('gads_keywords')
      .select('ad_group_id')
      .in('ad_group_id', adGroupIds)

    // Count keywords per campaign
    const keywordCountMap = new Map<string, number>()
    keywordCounts?.forEach(kw => {
      const campaignId = adGroupToCampaign.get(kw.ad_group_id)
      if (campaignId) {
        keywordCountMap.set(campaignId, (keywordCountMap.get(campaignId) || 0) + 1)
      }
    })

    // Transform to response format
    const result = campaigns?.map(campaign => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = campaign.gads_accounts as any
      return {
        id: campaign.id,
        campaign_name: campaign.name,
        campaign_type: campaign.campaign_type,
        campaign_status: campaign.status,
        bid_strategy_type: campaign.bid_strategy_type,
        target_cpa: campaign.target_cpa,
        labels: campaign.labels,
        account_name: account?.name || 'Unknown',
        customer_id: account?.customer_id || '',
        ad_group_count: adGroupCountMap.get(campaign.id) || 0,
        keyword_count: keywordCountMap.get(campaign.id) || 0,
        low_quality_keywords: 0 // Would need additional query
      }
    }) || []

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('[GADS-CAMPAIGNS] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
