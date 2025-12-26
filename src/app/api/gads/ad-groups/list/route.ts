import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function GET() {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({
      success: false,
      error: 'Database not configured'
    }, { status: 500 })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get ad groups with campaign info and keyword count
    const { data, error } = await supabase
      .from('gads_ad_groups')
      .select(`
        id,
        name,
        status,
        max_cpc,
        final_url,
        campaign_id,
        gads_campaigns!inner (
          name,
          campaign_type
        )
      `)
      .limit(1000)

    if (error) {
      console.error('[GADS-AD-GROUPS-LIST] Error:', error)
      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 500 })
    }

    // Get keyword counts per ad group
    const adGroupIds = data?.map(ag => ag.id) || []

    const { data: keywordCounts } = await supabase
      .from('gads_keywords')
      .select('ad_group_id')
      .in('ad_group_id', adGroupIds)

    // Count keywords per ad group
    const countMap = new Map<string, number>()
    keywordCounts?.forEach(kw => {
      countMap.set(kw.ad_group_id, (countMap.get(kw.ad_group_id) || 0) + 1)
    })

    // Transform data
    const adGroups = data?.map(ag => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const campaign = ag.gads_campaigns as any
      return {
        id: ag.id,
        name: ag.name,
        campaign_name: campaign?.name || 'Unknown',
        campaign_type: campaign?.campaign_type || null,
        status: ag.status,
        max_cpc: ag.max_cpc,
        final_url: ag.final_url,
        keyword_count: countMap.get(ag.id) || 0
      }
    }) || []

    return NextResponse.json({
      success: true,
      data: adGroups
    })
  } catch (error) {
    console.error('[GADS-AD-GROUPS-LIST] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
