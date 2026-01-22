/**
 * Google Ads Experiments API Integration
 *
 * Fetches and manages A/B test experiments from Google Ads.
 * Tracks experiment arms, performance metrics, and calculates statistical significance.
 *
 * Docs: https://developers.google.com/google-ads/api/docs/experiments/overview
 */

import { getGoogleAdsConfig, GOOGLE_ADS_ACCOUNTS, getAccountName } from './google-ads'

// Google Ads API v22
const GOOGLE_ADS_API_VERSION = 'v22'

// ============================================================================
// TYPES
// ============================================================================

export interface ArmMetrics {
  impressions: number
  clicks: number
  cost: number // In currency units (not micros)
  conversions: number
  conversionValue: number
  ctr: number
  cpc: number
  cpa: number
  roas: number
}

export interface ExperimentArm {
  googleArmId: string
  experimentId: string
  name: string
  isControl: boolean
  campaignId: string
  trafficSplitPercent: number
  metrics?: ArmMetrics
}

export interface Experiment {
  googleExperimentId: string
  customerId: string
  name: string
  description?: string
  status: string
  type: string
  startDate?: string
  endDate?: string
  baseCampaignId?: string
  baseCampaignName?: string
  trafficSplitPercent?: number
  arms?: ExperimentArm[]
  goals?: Array<{
    metric: string
    direction: string
  }>
  // Custom tracking fields
  hypothesis?: string
  expectedOutcome?: string
  actualOutcome?: string
  learnings?: string
  reportGeneratedAt?: number
}

export interface ExperimentsResponse {
  experiments: Experiment[]
  total: number
  customerId: string
  accountName: string
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

let cachedAccessToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  const config = getGoogleAdsConfig()

  // Check if we have a valid cached token (with 5 minute buffer)
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedAccessToken.token
  }

  const tokenUrl = 'https://oauth2.googleapis.com/token'

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error_description || 'Failed to get access token')
  }

  const data = await response.json()

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }

  return data.access_token
}

// ============================================================================
// GAQL QUERIES
// ============================================================================

/**
 * GAQL query to fetch experiments
 */
const EXPERIMENTS_QUERY = `
  SELECT
    experiment.resource_name,
    experiment.experiment_id,
    experiment.name,
    experiment.description,
    experiment.status,
    experiment.type,
    experiment.start_date,
    experiment.end_date
  FROM experiment
  WHERE experiment.status != 'REMOVED'
  ORDER BY experiment.start_date DESC
`

/**
 * Build GAQL query to fetch experiment arms
 */
function buildExperimentArmsQuery(experimentResourceName: string): string {
  return `
    SELECT
      experiment_arm.resource_name,
      experiment_arm.experiment,
      experiment_arm.name,
      experiment_arm.control,
      experiment_arm.traffic_split,
      experiment_arm.campaigns
    FROM experiment_arm
    WHERE experiment_arm.experiment = '${experimentResourceName}'
  `
}

/**
 * Build GAQL query to fetch campaign performance metrics
 */
function buildCampaignMetricsQuery(campaignId: string, startDate: string, endDate: string): string {
  return `
    SELECT
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'
  `
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Execute a GAQL query against Google Ads API
 */
async function executeQuery(
  customerId: string,
  query: string
): Promise<Record<string, unknown>[]> {
  const config = getGoogleAdsConfig()
  const cleanCustomerId = customerId.replace(/-/g, '')
  const loginCustomerId = config.loginCustomerId.replace(/-/g, '')
  const accessToken = await getAccessToken()

  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:search`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': config.developerToken,
      'login-customer-id': loginCustomerId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Query failed')
  }

  const data = await response.json()
  return data.results || []
}

/**
 * Parse experiment from API response
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseExperiment(row: any, customerId: string): Experiment {
  const exp = row.experiment || {}

  return {
    googleExperimentId: exp.experimentId || extractResourceId(exp.resourceName),
    customerId: customerId.replace(/-/g, ''),
    name: exp.name || '',
    description: exp.description,
    status: exp.status || 'UNKNOWN',
    type: exp.type || 'UNKNOWN',
    startDate: exp.startDate,
    endDate: exp.endDate,
  }
}

/**
 * Parse experiment arm from API response
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseExperimentArm(row: any, experimentId: string): ExperimentArm {
  const arm = row.experimentArm || {}

  // Extract campaign ID from campaigns array
  const campaigns = arm.campaigns || []
  const campaignResourceName = campaigns[0] || ''
  const campaignId = extractResourceId(campaignResourceName)

  return {
    googleArmId: extractResourceId(arm.resourceName),
    experimentId,
    name: arm.name || '',
    isControl: arm.control === true,
    campaignId,
    trafficSplitPercent: arm.trafficSplit || 0,
  }
}

/**
 * Extract ID from Google Ads resource name
 */
function extractResourceId(resourceName: string): string {
  if (!resourceName) return ''
  const parts = resourceName.split('/')
  return parts[parts.length - 1] || ''
}

/**
 * Fetch all experiments for an account
 */
export async function fetchExperiments(customerId: string): Promise<ExperimentsResponse> {
  const cleanCustomerId = customerId.replace(/-/g, '')

  console.log(`[GOOGLE-ADS-EXPERIMENTS] Fetching experiments for account ${cleanCustomerId}...`)

  try {
    const results = await executeQuery(cleanCustomerId, EXPERIMENTS_QUERY)

    const experiments = results.map((row) => parseExperiment(row, cleanCustomerId))

    console.log(`[GOOGLE-ADS-EXPERIMENTS] Found ${experiments.length} experiments`)

    return {
      experiments,
      total: experiments.length,
      customerId: cleanCustomerId,
      accountName: getAccountName(cleanCustomerId),
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[GOOGLE-ADS-EXPERIMENTS] Error: ${errorMsg}`)
    throw error
  }
}

/**
 * Fetch experiment arms for a specific experiment
 */
export async function fetchExperimentArms(
  customerId: string,
  experimentId: string,
  experimentResourceName?: string
): Promise<ExperimentArm[]> {
  const cleanCustomerId = customerId.replace(/-/g, '')

  // Build resource name if not provided
  const resourceName =
    experimentResourceName || `customers/${cleanCustomerId}/experiments/${experimentId}`

  console.log(`[GOOGLE-ADS-EXPERIMENTS] Fetching arms for experiment ${experimentId}...`)

  try {
    const query = buildExperimentArmsQuery(resourceName)
    const results = await executeQuery(cleanCustomerId, query)

    const arms = results.map((row) => parseExperimentArm(row, experimentId))

    console.log(`[GOOGLE-ADS-EXPERIMENTS] Found ${arms.length} arms`)

    return arms
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[GOOGLE-ADS-EXPERIMENTS] Error fetching arms: ${errorMsg}`)
    return []
  }
}

/**
 * Fetch performance metrics for a campaign (experiment arm)
 */
export async function fetchArmPerformance(
  customerId: string,
  campaignId: string,
  startDate: string,
  endDate: string
): Promise<ArmMetrics> {
  const cleanCustomerId = customerId.replace(/-/g, '')

  try {
    const query = buildCampaignMetricsQuery(campaignId, startDate, endDate)
    const results = await executeQuery(cleanCustomerId, query)

    // Aggregate metrics across all date segments
    let totalImpressions = 0
    let totalClicks = 0
    let totalCostMicros = 0
    let totalConversions = 0
    let totalConversionValue = 0

    for (const row of results) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const metrics = (row as any).metrics || {}
      totalImpressions += Number(metrics.impressions) || 0
      totalClicks += Number(metrics.clicks) || 0
      totalCostMicros += Number(metrics.costMicros) || 0
      totalConversions += Number(metrics.conversions) || 0
      totalConversionValue += Number(metrics.conversionsValue) || 0
    }

    // Calculate derived metrics
    const cost = totalCostMicros / 1_000_000
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
    const cpc = totalClicks > 0 ? cost / totalClicks : 0
    const cpa = totalConversions > 0 ? cost / totalConversions : 0
    const roas = cost > 0 ? totalConversionValue / cost : 0

    return {
      impressions: totalImpressions,
      clicks: totalClicks,
      cost,
      conversions: totalConversions,
      conversionValue: totalConversionValue,
      ctr: Math.round(ctr * 100) / 100,
      cpc: Math.round(cpc * 100) / 100,
      cpa: Math.round(cpa * 100) / 100,
      roas: Math.round(roas * 100) / 100,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[GOOGLE-ADS-EXPERIMENTS] Error fetching metrics: ${errorMsg}`)

    // Return empty metrics on error
    return {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      conversionValue: 0,
      ctr: 0,
      cpc: 0,
      cpa: 0,
      roas: 0,
    }
  }
}

/**
 * Fetch a complete experiment with arms and metrics
 */
export async function fetchExperimentWithMetrics(
  customerId: string,
  experimentId: string,
  startDate?: string,
  endDate?: string
): Promise<Experiment | null> {
  const cleanCustomerId = customerId.replace(/-/g, '')

  console.log(`[GOOGLE-ADS-EXPERIMENTS] Fetching complete experiment ${experimentId}...`)

  try {
    // First fetch the experiment
    const experimentsResponse = await fetchExperiments(cleanCustomerId)
    const experiment = experimentsResponse.experiments.find(
      (e) => e.googleExperimentId === experimentId
    )

    if (!experiment) {
      console.log(`[GOOGLE-ADS-EXPERIMENTS] Experiment ${experimentId} not found`)
      return null
    }

    // Fetch arms
    const arms = await fetchExperimentArms(cleanCustomerId, experimentId)
    experiment.arms = arms

    // Use experiment dates if not provided
    const metricsStartDate = startDate || experiment.startDate || formatDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    const metricsEndDate = endDate || experiment.endDate || formatDate(new Date())

    // Fetch metrics for each arm
    for (const arm of arms) {
      if (arm.campaignId) {
        // Add delay to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 1100))

        arm.metrics = await fetchArmPerformance(
          cleanCustomerId,
          arm.campaignId,
          metricsStartDate,
          metricsEndDate
        )
      }
    }

    return experiment
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[GOOGLE-ADS-EXPERIMENTS] Error: ${errorMsg}`)
    return null
  }
}

/**
 * Fetch experiments from all accounts
 */
export async function fetchAllAccountsExperiments(): Promise<ExperimentsResponse[]> {
  const accounts = GOOGLE_ADS_ACCOUNTS.filter((acc) => acc.customerId !== 'ALL')

  console.log(`[GOOGLE-ADS-EXPERIMENTS] Fetching experiments from ${accounts.length} accounts...`)

  const results: ExperimentsResponse[] = []

  for (const account of accounts) {
    try {
      // Add delay between accounts
      if (results.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1100))
      }

      const response = await fetchExperiments(account.customerId)
      results.push(response)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[GOOGLE-ADS-EXPERIMENTS] Error for ${account.name}: ${errorMsg}`)

      results.push({
        experiments: [],
        total: 0,
        customerId: account.customerId,
        accountName: account.name,
      })
    }
  }

  return results
}

// ============================================================================
// STATISTICAL SIGNIFICANCE
// ============================================================================

/**
 * Standard normal cumulative distribution function (CDF)
 * Used for calculating statistical significance
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const sign = x < 0 ? -1 : 1
  x = Math.abs(x) / Math.sqrt(2)

  const t = 1.0 / (1.0 + p * x)
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)

  return 0.5 * (1.0 + sign * y)
}

/**
 * Calculate statistical significance using two-proportion z-test
 *
 * This is the industry-standard method for A/B testing significance.
 *
 * @param controlConversions - Number of conversions in control
 * @param controlImpressions - Number of impressions in control
 * @param treatmentConversions - Number of conversions in treatment
 * @param treatmentImpressions - Number of impressions in treatment
 * @returns Confidence percentage (0-100)
 */
export function calculateStatisticalSignificance(
  controlConversions: number,
  controlImpressions: number,
  treatmentConversions: number,
  treatmentImpressions: number
): number {
  // Need minimum sample size for valid test
  if (controlImpressions < 100 || treatmentImpressions < 100) {
    return 0
  }

  // Calculate conversion rates
  const p1 = controlConversions / controlImpressions
  const p2 = treatmentConversions / treatmentImpressions

  // Pooled probability
  const pPooled =
    (controlConversions + treatmentConversions) / (controlImpressions + treatmentImpressions)

  // Standard error
  const se = Math.sqrt(
    pPooled * (1 - pPooled) * (1 / controlImpressions + 1 / treatmentImpressions)
  )

  // Avoid division by zero
  if (se === 0) {
    return 0
  }

  // Z-score
  const z = (p2 - p1) / se

  // Convert z-score to confidence percentage (two-tailed test)
  const confidence = Math.abs(normalCDF(z) - 0.5) * 200

  return Math.min(99.9, Math.round(confidence * 10) / 10)
}

/**
 * Determine experiment winner based on metrics and significance
 */
export function determineWinner(
  control: ArmMetrics,
  treatment: ArmMetrics,
  significance: number
): 'control' | 'treatment' | 'inconclusive' {
  // Need at least 95% confidence for a winner
  if (significance < 95) {
    return 'inconclusive'
  }

  // Compare conversion rates
  const controlConvRate = control.impressions > 0 ? control.conversions / control.impressions : 0
  const treatmentConvRate =
    treatment.impressions > 0 ? treatment.conversions / treatment.impressions : 0

  if (treatmentConvRate > controlConvRate) {
    return 'treatment'
  } else if (controlConvRate > treatmentConvRate) {
    return 'control'
  }

  return 'inconclusive'
}

/**
 * Calculate lift (percentage improvement) between control and treatment
 */
export function calculateLift(
  control: ArmMetrics,
  treatment: ArmMetrics
): {
  conversions: number
  conversionRate: number
  costPerConversion: number
  roas: number
} {
  const controlConvRate =
    control.impressions > 0 ? (control.conversions / control.impressions) * 100 : 0
  const treatmentConvRate =
    treatment.impressions > 0 ? (treatment.conversions / treatment.impressions) * 100 : 0

  return {
    conversions:
      control.conversions > 0
        ? ((treatment.conversions - control.conversions) / control.conversions) * 100
        : 0,
    conversionRate:
      controlConvRate > 0 ? ((treatmentConvRate - controlConvRate) / controlConvRate) * 100 : 0,
    costPerConversion:
      control.cpa > 0 ? ((treatment.cpa - control.cpa) / control.cpa) * 100 : 0,
    roas: control.roas > 0 ? ((treatment.roas - control.roas) / control.roas) * 100 : 0,
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format date for GAQL (YYYY-MM-DD)
 */
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get experiments that have ended and need reports
 */
export function getEndedExperiments(experiments: Experiment[]): Experiment[] {
  const now = new Date()
  const today = formatDate(now)

  return experiments.filter((exp) => {
    // Experiment has ended if:
    // 1. Status is GRADUATED or specific end statuses
    // 2. End date has passed
    if (['GRADUATED', 'ENDED', 'REMOVED'].includes(exp.status)) {
      return true
    }

    if (exp.endDate && exp.endDate < today) {
      return true
    }

    return false
  })
}

/**
 * Get active (running) experiments
 */
export function getActiveExperiments(experiments: Experiment[]): Experiment[] {
  return experiments.filter((exp) => {
    return ['ENABLED', 'INITIATED', 'SETUP'].includes(exp.status)
  })
}

// Export experiment status constants
export const EXPERIMENT_STATUS = {
  SETUP: 'SETUP',
  INITIATED: 'INITIATED',
  ENABLED: 'ENABLED',
  GRADUATED: 'GRADUATED',
  REMOVED: 'REMOVED',
} as const
