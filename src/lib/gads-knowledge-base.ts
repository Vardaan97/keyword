/**
 * Google Ads Knowledge Base
 * Functions for parsing, importing, and querying Google Ads data
 */

import { createClient } from '@supabase/supabase-js'
import {
  GadsAccount,
  GadsCampaign,
  GadsAdGroup,
  GadsKeyword,
  GadsCampaignGeoTarget,
  GadsSyncLog,
  GadsDataSummary,
  CampaignSummary,
  LowQualityKeyword,
  AdGroupByUrl,
  ImportProgress,
  EntityStatus,
  MatchType
} from '@/types/google-ads-kb'

// ============================================================================
// Supabase Client
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any>>
let supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient | null {
  if (!supabase && supabaseUrl && supabaseKey) {
    // Use 'any' to allow untyped table access for Google Ads tables not in schema yet
    supabase = createClient(supabaseUrl, supabaseKey)
  }
  return supabase
}

export function isGadsDbConfigured(): boolean {
  return !!(supabaseUrl && supabaseKey)
}

// ============================================================================
// CSV Column Mapping
// ============================================================================

// Column indices for Google Ads Editor CSV (0-indexed)
const CSV_COLUMNS = {
  // Account
  account: 0,
  accountName: 1,

  // Campaign
  campaign: 2,
  labels: 3,
  campaignType: 4,
  networks: 5,
  budget: 6,
  budgetType: 7,
  languages: 13,
  bidStrategyType: 14,
  targetCpa: 17,
  desktopBidModifier: 20,
  mobileBidModifier: 21,
  tabletBidModifier: 22,
  startDate: 24,
  endDate: 25,
  adRotation: 28,

  // Ad Group
  adGroup: 60,
  maxCpc: 61,
  targetCpc: 68,
  adGroupType: 73,
  optimizedTargeting: 70,
  finalUrl: 122,
  finalMobileUrl: 123,
  trackingTemplate: 58,
  finalUrlSuffix: 86,

  // Keywords
  keyword: 142,
  accountKeywordType: 141,  // For match type
  firstPageBid: 143,
  topOfPageBid: 144,
  firstPositionBid: 145,
  qualityScore: 146,
  landingPageExperience: 147,
  expectedCtr: 148,
  adRelevance: 149,

  // Location
  location: 131,
  bidModifier: 127,
  criterionType: 129,

  // Status
  campaignStatus: 263,
  adGroupStatus: 264,
  status: 266,
  approvalStatus: 267
}

// ============================================================================
// CSV Parser
// ============================================================================

interface ParsedGadsData {
  account: {
    customerId: string
    name: string
  }
  campaigns: Map<string, {
    name: string
    type: string | null
    status: EntityStatus
    budget: number | null
    budgetType: string | null
    bidStrategyType: string | null
    targetCpa: number | null
    networks: string | null
    languages: string | null
    labels: string | null
    desktopBidModifier: number | null
    mobileBidModifier: number | null
    tabletBidModifier: number | null
    adRotation: string | null
    startDate: string | null
    endDate: string | null
    geoTargets: Set<string>
  }>
  adGroups: Map<string, {
    campaignName: string
    name: string
    type: string | null
    status: EntityStatus
    maxCpc: number | null
    targetCpa: number | null
    finalUrl: string | null
    finalMobileUrl: string | null
    trackingTemplate: string | null
    finalUrlSuffix: string | null
    optimizedTargeting: boolean | null
  }>
  keywords: {
    adGroupKey: string  // campaign:adGroup
    keyword: string
    matchType: MatchType | null
    status: EntityStatus
    firstPageBid: number | null
    topOfPageBid: number | null
    firstPositionBid: number | null
    qualityScore: number | null
    landingPageExperience: string | null
    expectedCtr: string | null
    adRelevance: string | null
    approvalStatus: string | null
  }[]
  geoTargets: {
    campaignName: string
    location: string
    isNegative: boolean
    bidModifier: number | null
  }[]
}

function parseNumber(value: string | undefined): number | null {
  if (!value || value.trim() === '' || value === ' -') return null
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function parseStatus(value: string | undefined): EntityStatus {
  if (!value) return 'Paused'
  const v = value.trim().toLowerCase()
  if (v === 'enabled') return 'Enabled'
  if (v === 'paused') return 'Paused'
  if (v === 'ended') return 'Ended'
  if (v === 'removed') return 'Removed'
  return 'Paused'
}

function parseMatchType(value: string | undefined): MatchType | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  if (v.includes('exact')) return 'Exact'
  if (v.includes('phrase')) return 'Phrase'
  if (v.includes('broad')) return 'Broad'
  return 'Broad'  // Default to broad
}

function parseBoolean(value: string | undefined): boolean | null {
  if (!value || value.trim() === '') return null
  const v = value.trim().toLowerCase()
  return v === 'true' || v === 'yes' || v === 'enabled' || v === 'on'
}

export function parseGadsEditorCsv(csvContent: string): ParsedGadsData {
  console.log('[GADS-PARSER] Starting CSV parse...')

  const lines = csvContent.split('\n')
  const header = lines[0]
  const dataLines = lines.slice(1).filter(line => line.trim())

  console.log(`[GADS-PARSER] Found ${dataLines.length} data rows`)

  const result: ParsedGadsData = {
    account: { customerId: '', name: '' },
    campaigns: new Map(),
    adGroups: new Map(),
    keywords: [],
    geoTargets: []
  }

  // Track seen entities to avoid duplicates
  const seenKeywords = new Set<string>()
  const seenGeoTargets = new Set<string>()

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i]
    const cols = line.split('\t')

    // Get account info from first row
    if (i === 0 && cols[CSV_COLUMNS.account]) {
      result.account.customerId = cols[CSV_COLUMNS.account].trim()
      result.account.name = cols[CSV_COLUMNS.accountName]?.trim() || 'Unknown'
    }

    // Campaign data
    const campaignName = cols[CSV_COLUMNS.campaign]?.trim()
    if (campaignName && campaignName !== '' && !result.campaigns.has(campaignName)) {
      result.campaigns.set(campaignName, {
        name: campaignName,
        type: cols[CSV_COLUMNS.campaignType]?.trim() || null,
        status: parseStatus(cols[CSV_COLUMNS.campaignStatus]),
        budget: parseNumber(cols[CSV_COLUMNS.budget]),
        budgetType: cols[CSV_COLUMNS.budgetType]?.trim() || null,
        bidStrategyType: cols[CSV_COLUMNS.bidStrategyType]?.trim() || null,
        targetCpa: parseNumber(cols[CSV_COLUMNS.targetCpa]),
        networks: cols[CSV_COLUMNS.networks]?.trim() || null,
        languages: cols[CSV_COLUMNS.languages]?.trim() || null,
        labels: cols[CSV_COLUMNS.labels]?.trim() || null,
        desktopBidModifier: parseNumber(cols[CSV_COLUMNS.desktopBidModifier]),
        mobileBidModifier: parseNumber(cols[CSV_COLUMNS.mobileBidModifier]),
        tabletBidModifier: parseNumber(cols[CSV_COLUMNS.tabletBidModifier]),
        adRotation: cols[CSV_COLUMNS.adRotation]?.trim() || null,
        startDate: cols[CSV_COLUMNS.startDate]?.trim() || null,
        endDate: cols[CSV_COLUMNS.endDate]?.trim() || null,
        geoTargets: new Set()
      })
    }

    // Ad Group data
    const adGroupName = cols[CSV_COLUMNS.adGroup]?.trim()
    if (adGroupName && adGroupName !== '' && campaignName) {
      const adGroupKey = `${campaignName}:${adGroupName}`
      if (!result.adGroups.has(adGroupKey)) {
        result.adGroups.set(adGroupKey, {
          campaignName,
          name: adGroupName,
          type: cols[CSV_COLUMNS.adGroupType]?.trim() || null,
          status: parseStatus(cols[CSV_COLUMNS.adGroupStatus]),
          maxCpc: parseNumber(cols[CSV_COLUMNS.maxCpc]),
          targetCpa: parseNumber(cols[CSV_COLUMNS.targetCpc]),
          finalUrl: cols[CSV_COLUMNS.finalUrl]?.trim() || null,
          finalMobileUrl: cols[CSV_COLUMNS.finalMobileUrl]?.trim() || null,
          trackingTemplate: cols[CSV_COLUMNS.trackingTemplate]?.trim() || null,
          finalUrlSuffix: cols[CSV_COLUMNS.finalUrlSuffix]?.trim() || null,
          optimizedTargeting: parseBoolean(cols[CSV_COLUMNS.optimizedTargeting])
        })
      }
    }

    // Keyword data
    const keyword = cols[CSV_COLUMNS.keyword]?.trim()
    if (keyword && keyword !== '' && adGroupName && campaignName) {
      const adGroupKey = `${campaignName}:${adGroupName}`
      const keywordKey = `${adGroupKey}:${keyword}`

      if (!seenKeywords.has(keywordKey)) {
        seenKeywords.add(keywordKey)
        result.keywords.push({
          adGroupKey,
          keyword,
          matchType: parseMatchType(cols[CSV_COLUMNS.accountKeywordType]),
          status: parseStatus(cols[CSV_COLUMNS.status]),
          firstPageBid: parseNumber(cols[CSV_COLUMNS.firstPageBid]),
          topOfPageBid: parseNumber(cols[CSV_COLUMNS.topOfPageBid]),
          firstPositionBid: parseNumber(cols[CSV_COLUMNS.firstPositionBid]),
          qualityScore: parseNumber(cols[CSV_COLUMNS.qualityScore]),
          landingPageExperience: cols[CSV_COLUMNS.landingPageExperience]?.trim() || null,
          expectedCtr: cols[CSV_COLUMNS.expectedCtr]?.trim() || null,
          adRelevance: cols[CSV_COLUMNS.adRelevance]?.trim() || null,
          approvalStatus: cols[CSV_COLUMNS.approvalStatus]?.trim() || null
        })
      }
    }

    // Location/Geo Target data
    const location = cols[CSV_COLUMNS.location]?.trim()
    const criterionType = cols[CSV_COLUMNS.criterionType]?.trim()
    if (location && location !== '' && campaignName && criterionType?.toLowerCase().includes('location')) {
      const geoKey = `${campaignName}:${location}`
      if (!seenGeoTargets.has(geoKey)) {
        seenGeoTargets.add(geoKey)
        result.geoTargets.push({
          campaignName,
          location,
          isNegative: false,  // Would need to check negative criteria column
          bidModifier: parseNumber(cols[CSV_COLUMNS.bidModifier])
        })

        // Also add to campaign's geoTargets set
        const campaign = result.campaigns.get(campaignName)
        if (campaign) {
          campaign.geoTargets.add(location)
        }
      }
    }

    // Progress logging every 50k rows
    if ((i + 1) % 50000 === 0) {
      console.log(`[GADS-PARSER] Processed ${i + 1} rows...`)
    }
  }

  console.log(`[GADS-PARSER] Parse complete:`)
  console.log(`  - Account: ${result.account.customerId} (${result.account.name})`)
  console.log(`  - Campaigns: ${result.campaigns.size}`)
  console.log(`  - Ad Groups: ${result.adGroups.size}`)
  console.log(`  - Keywords: ${result.keywords.length}`)
  console.log(`  - Geo Targets: ${result.geoTargets.length}`)

  return result
}

// ============================================================================
// Database Import Functions
// ============================================================================

export async function importGadsData(
  parsedData: ParsedGadsData,
  onProgress?: (progress: ImportProgress) => void
): Promise<{ success: boolean; error?: string; syncLogId?: string }> {
  const db = getSupabase()
  if (!db) {
    return { success: false, error: 'Database not configured' }
  }

  const progress: ImportProgress = {
    status: 'importing',
    phase: 'Starting import...',
    totalRows: parsedData.campaigns.size + parsedData.adGroups.size + parsedData.keywords.length,
    processedRows: 0,
    campaignsImported: 0,
    adGroupsImported: 0,
    keywordsImported: 0,
    geoTargetsImported: 0,
    errors: [],
    startTime: Date.now(),
    endTime: null
  }

  onProgress?.(progress)

  try {
    // Step 1: Create or update account
    progress.phase = 'Creating account...'
    onProgress?.(progress)

    const { data: account, error: accountError } = await db
      .from('gads_accounts')
      .upsert({
        customer_id: parsedData.account.customerId,
        name: parsedData.account.name,
        currency: 'INR',
        is_active: true,
        updated_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString()
      }, { onConflict: 'customer_id' })
      .select()
      .single()

    if (accountError) throw new Error(`Account error: ${accountError.message}`)

    // Create sync log
    const { data: syncLog } = await db
      .from('gads_sync_logs')
      .insert({
        account_id: account.id,
        sync_type: 'FULL',
        entity_type: 'all',
        source: 'csv_import',
        status: 'running'
      })
      .select()
      .single()

    // Step 2: Import campaigns
    progress.phase = 'Importing campaigns...'
    onProgress?.(progress)

    const campaignIdMap = new Map<string, string>()  // name -> id

    for (const [name, campaign] of parsedData.campaigns) {
      try {
        const { data: campaignData, error } = await db
          .from('gads_campaigns')
          .upsert({
            account_id: account.id,
            name: campaign.name,
            campaign_type: campaign.type,
            status: campaign.status,
            budget: campaign.budget,
            budget_type: campaign.budgetType,
            bid_strategy_type: campaign.bidStrategyType,
            target_cpa: campaign.targetCpa,
            networks: campaign.networks,
            languages: campaign.languages,
            labels: campaign.labels,
            desktop_bid_modifier: campaign.desktopBidModifier,
            mobile_bid_modifier: campaign.mobileBidModifier,
            tablet_bid_modifier: campaign.tabletBidModifier,
            ad_rotation: campaign.adRotation,
            start_date: campaign.startDate || null,
            end_date: campaign.endDate || null,
            updated_at: new Date().toISOString(),
            synced_at: new Date().toISOString()
          }, { onConflict: 'account_id,name' })
          .select()
          .single()

        if (error) {
          progress.errors.push(`Campaign "${name}": ${error.message}`)
        } else if (campaignData) {
          campaignIdMap.set(name, campaignData.id)
          progress.campaignsImported++
        }
      } catch (e) {
        progress.errors.push(`Campaign "${name}": ${e}`)
      }

      progress.processedRows++
      if (progress.processedRows % 50 === 0) onProgress?.(progress)
    }

    // Step 3: Import geo targets
    progress.phase = 'Importing geo targets...'
    onProgress?.(progress)

    for (const geoTarget of parsedData.geoTargets) {
      const campaignId = campaignIdMap.get(geoTarget.campaignName)
      if (!campaignId) continue

      try {
        await db
          .from('gads_campaign_geo_targets')
          .upsert({
            campaign_id: campaignId,
            location_name: geoTarget.location,
            is_negative: geoTarget.isNegative,
            bid_modifier: geoTarget.bidModifier
          }, { onConflict: 'campaign_id,location_name,is_negative' })

        progress.geoTargetsImported++
      } catch (e) {
        // Ignore geo target errors
      }
    }

    // Step 4: Import ad groups
    progress.phase = 'Importing ad groups...'
    onProgress?.(progress)

    const adGroupIdMap = new Map<string, string>()  // key -> id

    for (const [key, adGroup] of parsedData.adGroups) {
      const campaignId = campaignIdMap.get(adGroup.campaignName)
      if (!campaignId) continue

      try {
        const { data: adGroupData, error } = await db
          .from('gads_ad_groups')
          .upsert({
            campaign_id: campaignId,
            name: adGroup.name,
            ad_group_type: adGroup.type,
            status: adGroup.status,
            max_cpc: adGroup.maxCpc,
            target_cpa: adGroup.targetCpa,
            final_url: adGroup.finalUrl,
            final_mobile_url: adGroup.finalMobileUrl,
            tracking_template: adGroup.trackingTemplate,
            final_url_suffix: adGroup.finalUrlSuffix,
            optimized_targeting: adGroup.optimizedTargeting,
            updated_at: new Date().toISOString(),
            synced_at: new Date().toISOString()
          }, { onConflict: 'campaign_id,name' })
          .select()
          .single()

        if (error) {
          progress.errors.push(`Ad Group "${adGroup.name}": ${error.message}`)
        } else if (adGroupData) {
          adGroupIdMap.set(key, adGroupData.id)
          progress.adGroupsImported++
        }
      } catch (e) {
        progress.errors.push(`Ad Group "${adGroup.name}": ${e}`)
      }

      progress.processedRows++
      if (progress.processedRows % 100 === 0) onProgress?.(progress)
    }

    // Step 5: Import keywords in batches
    progress.phase = 'Importing keywords...'
    onProgress?.(progress)

    const BATCH_SIZE = 500
    for (let i = 0; i < parsedData.keywords.length; i += BATCH_SIZE) {
      const batch = parsedData.keywords.slice(i, i + BATCH_SIZE)

      const keywordRecords = batch
        .map(kw => {
          const adGroupId = adGroupIdMap.get(kw.adGroupKey)
          if (!adGroupId) return null

          return {
            ad_group_id: adGroupId,
            keyword_text: kw.keyword,
            match_type: kw.matchType,
            status: kw.status,
            first_page_bid: kw.firstPageBid,
            top_of_page_bid: kw.topOfPageBid,
            first_position_bid: kw.firstPositionBid,
            quality_score: kw.qualityScore,
            landing_page_experience: kw.landingPageExperience,
            expected_ctr: kw.expectedCtr,
            ad_relevance: kw.adRelevance,
            approval_status: kw.approvalStatus,
            is_negative: false,
            updated_at: new Date().toISOString(),
            synced_at: new Date().toISOString()
          }
        })
        .filter(Boolean)

      if (keywordRecords.length > 0) {
        try {
          const { error } = await db
            .from('gads_keywords')
            .upsert(keywordRecords, { onConflict: 'ad_group_id,keyword_text,match_type,is_negative' })

          if (error) {
            progress.errors.push(`Keyword batch ${i / BATCH_SIZE + 1}: ${error.message}`)
          } else {
            progress.keywordsImported += keywordRecords.length
          }
        } catch (e) {
          progress.errors.push(`Keyword batch ${i / BATCH_SIZE + 1}: ${e}`)
        }
      }

      progress.processedRows += batch.length
      if (i % 1000 === 0) onProgress?.(progress)
    }

    // Update sync log
    if (syncLog) {
      await db
        .from('gads_sync_logs')
        .update({
          status: progress.errors.length > 0 ? 'completed' : 'completed',
          records_processed: progress.processedRows,
          records_created: progress.campaignsImported + progress.adGroupsImported + progress.keywordsImported,
          records_failed: progress.errors.length,
          error_message: progress.errors.length > 0 ? progress.errors.slice(0, 10).join('; ') : null,
          completed_at: new Date().toISOString()
        })
        .eq('id', syncLog.id)
    }

    progress.status = 'completed'
    progress.endTime = Date.now()
    onProgress?.(progress)

    return {
      success: true,
      syncLogId: syncLog?.id
    }

  } catch (error) {
    progress.status = 'error'
    progress.errors.push(error instanceof Error ? error.message : String(error))
    progress.endTime = Date.now()
    onProgress?.(progress)

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

// ============================================================================
// Query Functions
// ============================================================================

export async function getGadsDataSummary(customerId?: string): Promise<GadsDataSummary | null> {
  const db = getSupabase()
  if (!db) return null

  try {
    // Get account
    let accountQuery = db.from('gads_accounts').select('*')
    if (customerId) {
      accountQuery = accountQuery.eq('customer_id', customerId)
    }
    const { data: account } = await accountQuery.single()

    if (!account) return null

    // Get campaign stats
    const { data: campaigns } = await db
      .from('gads_campaigns')
      .select('id, status, campaign_type, bid_strategy_type')
      .eq('account_id', account.id)

    const { data: adGroups } = await db
      .from('gads_ad_groups')
      .select('id, status, campaign_id')
      .in('campaign_id', campaigns?.map(c => c.id) || [])

    const { data: keywords } = await db
      .from('gads_keywords')
      .select('id, status, quality_score, ad_group_id')
      .in('ad_group_id', adGroups?.map(ag => ag.id) || [])

    const { data: geoTargets } = await db
      .from('gads_campaign_geo_targets')
      .select('location_name, campaign_id')
      .in('campaign_id', campaigns?.map(c => c.id) || [])

    const { data: lastSync } = await db
      .from('gads_sync_logs')
      .select('*')
      .eq('account_id', account.id)
      .order('started_at', { ascending: false })
      .limit(1)
      .single()

    // Calculate stats
    const campaignTypes = new Map<string, number>()
    const bidStrategies = new Map<string, number>()
    campaigns?.forEach(c => {
      if (c.campaign_type) {
        campaignTypes.set(c.campaign_type, (campaignTypes.get(c.campaign_type) || 0) + 1)
      }
      if (c.bid_strategy_type) {
        bidStrategies.set(c.bid_strategy_type, (bidStrategies.get(c.bid_strategy_type) || 0) + 1)
      }
    })

    const locationCounts = new Map<string, number>()
    geoTargets?.forEach(gt => {
      locationCounts.set(gt.location_name, (locationCounts.get(gt.location_name) || 0) + 1)
    })

    return {
      account,
      stats: {
        totalCampaigns: campaigns?.length || 0,
        enabledCampaigns: campaigns?.filter(c => c.status === 'Enabled').length || 0,
        pausedCampaigns: campaigns?.filter(c => c.status === 'Paused').length || 0,
        totalAdGroups: adGroups?.length || 0,
        enabledAdGroups: adGroups?.filter(ag => ag.status === 'Enabled').length || 0,
        totalKeywords: keywords?.length || 0,
        enabledKeywords: keywords?.filter(k => k.status === 'Enabled').length || 0,
        lowQualityKeywords: keywords?.filter(k => k.quality_score !== null && k.quality_score < 5).length || 0,
        geoTargets: geoTargets?.length || 0
      },
      campaignTypes: Array.from(campaignTypes.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      bidStrategies: Array.from(bidStrategies.entries())
        .map(([strategy, count]) => ({ strategy, count }))
        .sort((a, b) => b.count - a.count),
      topLocations: Array.from(locationCounts.entries())
        .map(([location, count]) => ({ location, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      lastSync
    }
  } catch (error) {
    console.error('[GADS-KB] Error getting summary:', error)
    return null
  }
}

export async function getCampaignSummaries(accountId?: string, status?: 'enabled' | 'paused'): Promise<CampaignSummary[]> {
  const db = getSupabase()
  if (!db) return []

  let query = db.from('gads_campaign_summary').select('*')

  if (status) {
    query = query.ilike('campaign_status', status)
  }

  const { data, error } = await query

  if (error) {
    console.error('[GADS-KB] Error getting campaign summaries:', error)
    return []
  }

  return data || []
}

export async function getLowQualityKeywords(accountId?: string, maxQualityScore = 5, limit = 100): Promise<LowQualityKeyword[]> {
  const db = getSupabase()
  if (!db) return []

  const { data, error } = await db
    .from('gads_low_quality_keywords')
    .select('*')
    .lte('quality_score', maxQualityScore)
    .order('quality_score', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[GADS-KB] Error getting low quality keywords:', error)
    return []
  }

  return data || []
}

export async function findAdGroupsForUrl(urlPattern: string, accountId?: string): Promise<AdGroupByUrl[]> {
  const db = getSupabase()
  if (!db) return []

  const { data, error } = await db
    .from('gads_ad_groups_by_url')
    .select('*')
    .ilike('final_url', `%${urlPattern}%`)
    .limit(50)

  if (error) {
    console.error('[GADS-KB] Error finding ad groups for URL:', error)
    return []
  }

  return data || []
}

export async function getKeywordsForAdGroup(adGroupId: string): Promise<GadsKeyword[]> {
  const db = getSupabase()
  if (!db) return []

  const { data, error } = await db
    .from('gads_keywords')
    .select('*')
    .eq('ad_group_id', adGroupId)
    .order('keyword_text')

  if (error) {
    console.error('[GADS-KB] Error getting keywords for ad group:', error)
    return []
  }

  return data || []
}

export async function searchKeywords(query: string, options?: { accountId?: string; limit?: number }): Promise<LowQualityKeyword[]> {
  const db = getSupabase()
  if (!db) return []

  const limit = options?.limit || 100

  // Use the low_quality_keywords view for rich data, but without the QS filter
  // We'll search in the gads_keywords table directly with joins
  const { data, error } = await db
    .from('gads_low_quality_keywords')
    .select('*')
    .ilike('keyword_text', `%${query}%`)
    .limit(limit)

  if (error) {
    console.error('[GADS-KB] Error searching keywords:', error)
    return []
  }

  return data || []
}
