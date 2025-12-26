/**
 * Google Ads Knowledge Base Types
 * Types for the Google Ads account structure stored in the database
 */

// ============================================================================
// Database Entity Types
// ============================================================================

export interface GadsAccount {
  id: string
  customer_id: string
  name: string
  currency: string
  timezone: string
  is_active: boolean
  created_at: string
  updated_at: string
  last_sync_at: string | null
}

export interface GadsCampaign {
  id: string
  account_id: string
  google_campaign_id: string | null
  name: string
  campaign_type: CampaignType | null
  status: EntityStatus

  // Budget & Bidding
  budget: number | null
  budget_type: string | null
  bid_strategy_type: BidStrategyType | null
  target_cpa: number | null
  target_roas: number | null

  // Targeting
  networks: string | null
  languages: string | null

  // Device Modifiers
  desktop_bid_modifier: number | null
  mobile_bid_modifier: number | null
  tablet_bid_modifier: number | null

  // Settings
  ad_rotation: string | null
  start_date: string | null
  end_date: string | null

  // Metadata
  labels: string | null
  created_at: string
  updated_at: string
  synced_at: string
}

export interface GadsCampaignGeoTarget {
  id: string
  campaign_id: string
  location_name: string
  location_type: string | null
  is_negative: boolean
  bid_modifier: number | null
  reach: string | null
  created_at: string
}

export interface GadsAdGroup {
  id: string
  campaign_id: string
  google_ad_group_id: string | null
  name: string
  ad_group_type: string | null
  status: EntityStatus

  // Bidding
  max_cpc: number | null
  target_cpa: number | null
  target_roas: number | null

  // URLs
  final_url: string | null
  final_mobile_url: string | null
  tracking_template: string | null
  final_url_suffix: string | null
  custom_parameters: Record<string, string> | null

  // Targeting
  optimized_targeting: boolean | null
  audience_targeting: string | null

  // Metadata
  created_at: string
  updated_at: string
  synced_at: string
}

export interface GadsKeyword {
  id: string
  ad_group_id: string
  google_keyword_id: string | null
  keyword_text: string
  match_type: MatchType | null
  status: EntityStatus

  // Bidding
  max_cpc: number | null
  first_page_bid: number | null
  top_of_page_bid: number | null
  first_position_bid: number | null

  // Quality Metrics
  quality_score: number | null
  landing_page_experience: QualityRating | null
  expected_ctr: QualityRating | null
  ad_relevance: QualityRating | null

  // Metadata
  approval_status: string | null
  is_negative: boolean
  created_at: string
  updated_at: string
  synced_at: string
}

export interface GadsSyncLog {
  id: string
  account_id: string
  sync_type: 'FULL' | 'INCREMENTAL'
  entity_type: string | null
  source: 'csv_import' | 'api_sync'
  records_processed: number
  records_created: number
  records_updated: number
  records_failed: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  error_message: string | null
  started_at: string
  completed_at: string | null
}

export interface GadsChange {
  id: string
  account_id: string
  entity_type: 'campaign' | 'ad_group' | 'keyword' | 'ad'
  entity_id: string | null
  entity_name: string | null
  change_type: 'CREATE' | 'UPDATE' | 'DELETE'
  field_name: string | null
  old_value: string | null
  new_value: string | null
  changed_by: 'RMS' | 'MANUAL' | 'API' | 'CLAUDE' | null
  change_source: string | null
  created_at: string
}

// ============================================================================
// Enum Types
// ============================================================================

export type CampaignType = 'Search' | 'Display' | 'Performance Max' | 'Demand Gen' | 'Video' | 'Shopping'

export type EntityStatus = 'Enabled' | 'Paused' | 'Ended' | 'Removed'

export type BidStrategyType =
  | 'Maximize conversions'
  | 'Maximize clicks'
  | 'Target CPA'
  | 'Target ROAS'
  | 'Manual CPC'
  | 'Manual CPM'
  | 'Enhanced CPC'

export type MatchType = 'Exact' | 'Phrase' | 'Broad'

export type QualityRating = 'Above average' | 'Average' | 'Below average' | ' -'

// ============================================================================
// CSV Import Types
// ============================================================================

export interface CsvRowData {
  // Account
  account: string
  accountName: string

  // Campaign
  campaign: string
  labels: string
  campaignType: string
  networks: string
  budget: string
  budgetType: string
  bidStrategyType: string
  targetCpa: string
  targetRoas: string
  languages: string
  desktopBidModifier: string
  mobileBidModifier: string
  tabletBidModifier: string
  adRotation: string
  startDate: string
  endDate: string
  campaignStatus: string

  // Ad Group
  adGroup: string
  maxCpc: string
  targetCpc: string
  adGroupType: string
  adGroupStatus: string
  finalUrl: string
  finalMobileUrl: string
  trackingTemplate: string
  finalUrlSuffix: string
  optimizedTargeting: string

  // Keyword
  keyword: string
  matchType: string
  firstPageBid: string
  topOfPageBid: string
  firstPositionBid: string
  qualityScore: string
  landingPageExperience: string
  expectedCtr: string
  adRelevance: string
  keywordStatus: string
  approvalStatus: string

  // Location
  location: string
  bidModifier: string
  criterionType: string
}

export interface ImportProgress {
  status: 'idle' | 'parsing' | 'importing' | 'completed' | 'error'
  phase: string
  totalRows: number
  processedRows: number
  campaignsImported: number
  adGroupsImported: number
  keywordsImported: number
  geoTargetsImported: number
  errors: string[]
  startTime: number | null
  endTime: number | null
}

// ============================================================================
// View/Query Types
// ============================================================================

export interface CampaignSummary {
  id: string
  campaign_name: string
  campaign_type: string | null
  campaign_status: string
  bid_strategy_type: string | null
  target_cpa: number | null
  account_name: string
  customer_id: string
  ad_group_count: number
  keyword_count: number
  low_quality_keywords: number
}

export interface LowQualityKeyword {
  id: string
  keyword_text: string
  match_type: string | null
  quality_score: number
  landing_page_experience: string | null
  expected_ctr: string | null
  ad_relevance: string | null
  keyword_status: string
  ad_group_name: string
  final_url: string | null
  campaign_name: string
  campaign_type: string | null
  account_name: string
}

export interface AdGroupByUrl {
  ad_group_id: string
  ad_group_name: string
  final_url: string
  ad_group_status: string
  campaign_name: string
  campaign_type: string | null
  campaign_status: string
  account_name: string
  customer_id: string
  keyword_count: number
}

// ============================================================================
// API Response Types
// ============================================================================

export interface GadsDataSummary {
  account: GadsAccount | null
  stats: {
    totalCampaigns: number
    enabledCampaigns: number
    pausedCampaigns: number
    totalAdGroups: number
    enabledAdGroups: number
    totalKeywords: number
    enabledKeywords: number
    lowQualityKeywords: number
    geoTargets: number
  }
  campaignTypes: { type: string; count: number }[]
  bidStrategies: { strategy: string; count: number }[]
  topLocations: { location: string; count: number }[]
  lastSync: GadsSyncLog | null
}
