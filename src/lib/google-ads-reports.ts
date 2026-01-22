/**
 * Google Ads Reporting API Functions
 *
 * READ-ONLY functions for fetching campaign performance, recommendations,
 * optimization scores, and other reporting data.
 *
 * Uses Google Ads API v22 with GAQL queries.
 */

// Re-use the existing config and auth from google-ads.ts
import { GOOGLE_ADS_ACCOUNTS, getAccountName } from './google-ads'
import { getRefreshToken, getCachedAccessToken, updateAccessToken } from './token-storage'

const GOOGLE_ADS_API_VERSION = 'v22'

// ============================================================================
// Types
// ============================================================================

export interface CampaignPerformance {
  campaignId: string
  campaignName: string
  status: string
  channelType: string
  biddingStrategy: string
  impressions: number
  clicks: number
  ctr: number
  averageCpc: number
  costMicros: number
  conversions: number
  conversionsValue: number
  costPerConversion: number
}

export interface Recommendation {
  resourceName: string
  type: string
  category: string
  impact: {
    baseImpressions: number
    potentialImpressions: number
    baseClicks: number
    potentialClicks: number
    baseConversions: number
    potentialConversions: number
  }
  campaignBudget?: {
    currentBudgetMicros: number
    recommendedBudgetMicros: number
  }
  keyword?: {
    keyword: string
    matchType: string
  }
  description?: string
}

export interface OptimizationScore {
  score: number // 0-100
  uplift: number
  accountName: string
}

export interface QualityScoreData {
  keyword: string
  qualityScore: number | null
  historicalQualityScore: number | null
  creativityScore: number | null
  landingPageScore: number | null
  searchImpressionShare: number | null
}

// ============================================================================
// OAuth Token Management (uses token-storage for runtime tokens)
// ============================================================================

interface GoogleAdsConfig {
  developerToken: string
  clientId: string
  clientSecret: string
  loginCustomerId: string
}

interface CachedToken {
  token: string
  expiresAt: number
}

let localCachedAccessToken: CachedToken | null = null

function getConfig(): GoogleAdsConfig | null {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID

  if (!developerToken || !clientId || !clientSecret || !loginCustomerId) {
    return null
  }

  return {
    developerToken,
    clientId,
    clientSecret,
    loginCustomerId: loginCustomerId.replace(/-/g, '')
  }
}

async function getAccessToken(config: GoogleAdsConfig): Promise<string> {
  // Check local cache first (with 5 minute buffer)
  if (localCachedAccessToken && localCachedAccessToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return localCachedAccessToken.token
  }

  // Check token storage cache
  const cachedToken = await getCachedAccessToken()
  if (cachedToken) {
    console.log('[GADS-REPORTS] Using cached access token from storage')
    return cachedToken
  }

  // Get refresh token from storage (prioritizes runtime over env)
  const refreshToken = await getRefreshToken()

  const tokenUrl = 'https://oauth2.googleapis.com/token'
  console.log('[GADS-REPORTS] Requesting new access token...')

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`OAuth error: ${error.error_description || error.error || 'Unknown error'}`)
  }

  const data = await response.json()

  // Update local cache
  localCachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000)
  }

  // Also update token storage for other modules
  await updateAccessToken(data.access_token, data.expires_in)

  return data.access_token
}

// ============================================================================
// Rate Limiting
// ============================================================================

const RATE_LIMIT_DELAY_MS = 1100 // 1.1 seconds between requests
let lastApiCallTime = 0

async function rateLimitedDelay(): Promise<void> {
  const now = Date.now()
  const timeSinceLastCall = now - lastApiCallTime
  if (timeSinceLastCall < RATE_LIMIT_DELAY_MS) {
    const waitTime = RATE_LIMIT_DELAY_MS - timeSinceLastCall
    console.log(`[GADS-REPORTS] Rate limiting: waiting ${waitTime}ms`)
    await new Promise(resolve => setTimeout(resolve, waitTime))
  }
  lastApiCallTime = Date.now()
}

// ============================================================================
// GAQL Query Execution
// ============================================================================

interface GAQLResponse {
  results?: Array<Record<string, unknown>>
  nextPageToken?: string
}

async function executeGAQL(
  config: GoogleAdsConfig,
  customerId: string,
  query: string,
  pageToken?: string
): Promise<GAQLResponse> {
  await rateLimitedDelay()

  const accessToken = await getAccessToken(config)
  const cleanCustomerId = customerId.replace(/-/g, '')
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:search`

  const body: Record<string, unknown> = { query }
  if (pageToken) {
    body.pageToken = pageToken
  }

  console.log(`[GADS-REPORTS] Executing GAQL query for customer ${cleanCustomerId}`)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': config.developerToken,
      'login-customer-id': config.loginCustomerId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const error = await response.json()
    const errorMessage = error.error?.message || JSON.stringify(error)
    console.error(`[GADS-REPORTS] GAQL error:`, errorMessage)
    throw new Error(`Google Ads API error: ${errorMessage}`)
  }

  return response.json()
}

// ============================================================================
// Campaign Performance
// ============================================================================

export async function getCampaignPerformance(
  customerId: string,
  dateRange: string = 'LAST_30_DAYS'
): Promise<CampaignPerformance[]> {
  const config = getConfig()
  if (!config) {
    throw new Error('Google Ads API not configured')
  }

  // Map common date range names to GAQL format
  const dateRangeMap: Record<string, string> = {
    'today': 'TODAY',
    'yesterday': 'YESTERDAY',
    'last_7_days': 'LAST_7_DAYS',
    'last_30_days': 'LAST_30_DAYS',
    'this_month': 'THIS_MONTH',
    'last_month': 'LAST_MONTH',
  }

  const gaqlDateRange = dateRangeMap[dateRange.toLowerCase()] || 'LAST_30_DAYS'

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.bidding_strategy_type,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.cost_per_conversion
    FROM campaign
    WHERE segments.date DURING ${gaqlDateRange}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `

  const data = await executeGAQL(config, customerId, query)

  if (!data.results) {
    return []
  }

  return data.results.map((result: Record<string, unknown>) => {
    const campaign = result.campaign as Record<string, unknown> || {}
    const metrics = result.metrics as Record<string, unknown> || {}

    return {
      campaignId: String(campaign.id || ''),
      campaignName: String(campaign.name || ''),
      status: String(campaign.status || 'UNKNOWN'),
      channelType: String(campaign.advertisingChannelType || 'UNKNOWN'),
      biddingStrategy: String(campaign.biddingStrategyType || 'UNKNOWN'),
      impressions: Number(metrics.impressions) || 0,
      clicks: Number(metrics.clicks) || 0,
      ctr: Number(metrics.ctr) || 0,
      averageCpc: Number(metrics.averageCpc) || 0,
      costMicros: Number(metrics.costMicros) || 0,
      conversions: Number(metrics.conversions) || 0,
      conversionsValue: Number(metrics.conversionsValue) || 0,
      costPerConversion: Number(metrics.costPerConversion) || 0,
    }
  })
}

// ============================================================================
// Recommendations
// ============================================================================

// Map recommendation types to categories
const RECOMMENDATION_CATEGORIES: Record<string, string> = {
  // Budget
  'CAMPAIGN_BUDGET': 'Budget',
  'FORECASTING_CAMPAIGN_BUDGET': 'Budget',
  'MOVE_UNUSED_BUDGET': 'Budget',
  'MARGINAL_ROI_CAMPAIGN_BUDGET': 'Budget',

  // Bidding
  'TARGET_CPA_OPT_IN': 'Bidding',
  'MAXIMIZE_CONVERSIONS_OPT_IN': 'Bidding',
  'TARGET_ROAS_OPT_IN': 'Bidding',
  'MAXIMIZE_CLICKS_OPT_IN': 'Bidding',
  'ENHANCED_CPC_OPT_IN': 'Bidding',
  'MAXIMIZE_CONVERSION_VALUE_OPT_IN': 'Bidding',

  // Keywords
  'KEYWORD': 'Keywords',
  'KEYWORD_MATCH_TYPE': 'Keywords',
  'USE_BROAD_MATCH_KEYWORD': 'Keywords',

  // Ads
  'RESPONSIVE_SEARCH_AD': 'Ads',
  'RESPONSIVE_SEARCH_AD_ASSET': 'Ads',
  'RESPONSIVE_SEARCH_AD_IMPROVE_AD_STRENGTH': 'Ads',
  'TEXT_AD': 'Ads',
  'EXPANDED_TEXT_AD': 'Ads',

  // Assets
  'SITELINK_ASSET': 'Assets',
  'CALLOUT_ASSET': 'Assets',
  'CALL_ASSET': 'Assets',
  'STRUCTURED_SNIPPET_ASSET': 'Assets',
  'LEAD_FORM_ASSET': 'Assets',

  // PMax
  'PERFORMANCE_MAX_OPT_IN': 'PMax',
  'UPGRADE_SMART_SHOPPING_CAMPAIGN_TO_PERFORMANCE_MAX': 'PMax',
  'UPGRADE_LOCAL_CAMPAIGN_TO_PERFORMANCE_MAX': 'PMax',
}

export async function getRecommendations(
  customerId: string
): Promise<Recommendation[]> {
  const config = getConfig()
  if (!config) {
    throw new Error('Google Ads API not configured')
  }

  // Note: GAQL doesn't allow selecting conditional/oneof fields directly.
  // Only select the most basic fields for recommendations.
  const query = `
    SELECT
      recommendation.resource_name,
      recommendation.type
    FROM recommendation
    LIMIT 100
  `

  const data = await executeGAQL(config, customerId, query)

  if (!data.results) {
    return []
  }

  return data.results.map((result: Record<string, unknown>) => {
    const rec = result.recommendation as Record<string, unknown> || {}

    const type = String(rec.type || 'UNKNOWN')
    const category = RECOMMENDATION_CATEGORIES[type] || 'Other'

    const recommendation: Recommendation = {
      resourceName: String(rec.resourceName || ''),
      type,
      category,
      impact: {
        baseImpressions: 0,
        potentialImpressions: 0,
        baseClicks: 0,
        potentialClicks: 0,
        baseConversions: 0,
        potentialConversions: 0,
      }
    }

    return recommendation
  })
}

// ============================================================================
// Optimization Score
// ============================================================================

export async function getOptimizationScore(
  customerId: string
): Promise<OptimizationScore> {
  const config = getConfig()
  if (!config) {
    throw new Error('Google Ads API not configured')
  }

  const query = `
    SELECT
      customer.optimization_score,
      customer.optimization_score_weight
    FROM customer
  `

  const data = await executeGAQL(config, customerId, query)

  if (!data.results || data.results.length === 0) {
    return {
      score: 0,
      uplift: 0,
      accountName: getAccountName(customerId)
    }
  }

  const result = data.results[0] as Record<string, unknown>
  const customer = result.customer as Record<string, unknown> || {}

  return {
    score: Math.round((Number(customer.optimizationScore) || 0) * 100),
    uplift: Number(customer.optimizationScoreWeight) || 0,
    accountName: getAccountName(customerId)
  }
}

// ============================================================================
// Quality Scores (for top keywords by spend)
// ============================================================================

export async function getKeywordQualityScores(
  customerId: string,
  limit: number = 100
): Promise<QualityScoreData[]> {
  const config = getConfig()
  if (!config) {
    throw new Error('Google Ads API not configured')
  }

  // Fetch keywords ordered by cost, limited to avoid huge data sets
  const query = `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.quality_info.quality_score,
      metrics.historical_quality_score,
      metrics.historical_creative_quality_score,
      metrics.historical_landing_page_quality_score,
      metrics.search_impression_share
    FROM keyword_view
    WHERE ad_group_criterion.type = 'KEYWORD'
      AND ad_group_criterion.status = 'ENABLED'
      AND metrics.cost_micros > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT ${limit}
  `

  const data = await executeGAQL(config, customerId, query)

  if (!data.results) {
    return []
  }

  return data.results.map((result: Record<string, unknown>) => {
    const criterion = result.adGroupCriterion as Record<string, unknown> || {}
    const keyword = criterion.keyword as Record<string, unknown> || {}
    const qualityInfo = criterion.qualityInfo as Record<string, unknown> || {}
    const metrics = result.metrics as Record<string, unknown> || {}

    return {
      keyword: String(keyword.text || ''),
      qualityScore: qualityInfo.qualityScore !== undefined ? Number(qualityInfo.qualityScore) : null,
      historicalQualityScore: metrics.historicalQualityScore !== undefined ? Number(metrics.historicalQualityScore) : null,
      creativityScore: metrics.historicalCreativeQualityScore !== undefined ? Number(metrics.historicalCreativeQualityScore) : null,
      landingPageScore: metrics.historicalLandingPageQualityScore !== undefined ? Number(metrics.historicalLandingPageQualityScore) : null,
      searchImpressionShare: metrics.searchImpressionShare !== undefined ? Number(metrics.searchImpressionShare) : null,
    }
  })
}

// ============================================================================
// Account Summary (for dashboard overview)
// ============================================================================

export interface AccountSummary {
  customerId: string
  accountName: string
  optimizationScore: number
  totalCampaigns: number
  activeCampaigns: number
  totalSpendMicros: number
  totalImpressions: number
  totalClicks: number
  totalConversions: number
  recommendationCount: number
}

export async function getAccountSummary(
  customerId: string,
  dateRange: string = 'LAST_30_DAYS'
): Promise<AccountSummary> {
  const config = getConfig()
  if (!config) {
    throw new Error('Google Ads API not configured')
  }

  // Get campaign count and aggregate metrics
  const campaignQuery = `
    SELECT
      campaign.id,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE segments.date DURING ${dateRange}
  `

  const campaignData = await executeGAQL(config, customerId, campaignQuery)

  let totalCampaigns = 0
  let activeCampaigns = 0
  let totalSpendMicros = 0
  let totalImpressions = 0
  let totalClicks = 0
  let totalConversions = 0

  if (campaignData.results) {
    const seenCampaigns = new Set<string>()
    for (const result of campaignData.results) {
      const campaign = result.campaign as Record<string, unknown> || {}
      const metrics = result.metrics as Record<string, unknown> || {}
      const campaignId = String(campaign.id || '')

      if (!seenCampaigns.has(campaignId)) {
        seenCampaigns.add(campaignId)
        totalCampaigns++
        if (campaign.status === 'ENABLED') {
          activeCampaigns++
        }
      }

      totalSpendMicros += Number(metrics.costMicros) || 0
      totalImpressions += Number(metrics.impressions) || 0
      totalClicks += Number(metrics.clicks) || 0
      totalConversions += Number(metrics.conversions) || 0
    }
  }

  // Get optimization score
  const optimizationData = await getOptimizationScore(customerId)

  // Get recommendation count
  const recQuery = `
    SELECT recommendation.type
    FROM recommendation
  `
  const recData = await executeGAQL(config, customerId, recQuery)
  const recommendationCount = recData.results?.length || 0

  return {
    customerId,
    accountName: getAccountName(customerId),
    optimizationScore: optimizationData.score,
    totalCampaigns,
    activeCampaigns,
    totalSpendMicros,
    totalImpressions,
    totalClicks,
    totalConversions,
    recommendationCount,
  }
}

// ============================================================================
// Exports for easy access
// ============================================================================

export { GOOGLE_ADS_ACCOUNTS, getAccountName }
