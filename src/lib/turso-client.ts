/**
 * Turso Client for Google Ads Account Data
 *
 * Connects to the Turso database containing campaigns, ad groups, keywords,
 * ads, locations synced from Google Ads Editor exports.
 *
 * Used by the keyword planner for:
 * - URL matching (find campaigns/ad groups for a course URL)
 * - Keyword lookup (check if keyword exists in specific accounts)
 * - Campaign/geo target data for export
 */

import { createClient, type Client } from '@libsql/client'

// Cache clients per database
const tursoClients: Map<string, Client> = new Map()

function toHttpUrl(url: string): string {
  return url.replace('libsql://', 'https://')
}

/**
 * Get the main Turso client (Flexi + Bouquet INR 2)
 */
export function getTursoClient(): Client | null {
  if (tursoClients.has('main')) return tursoClients.get('main')!

  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!url || !authToken) {
    console.log('[TURSO] Main DB not configured')
    return null
  }

  const client = createClient({ url: toHttpUrl(url), authToken })
  tursoClients.set('main', client)
  return client
}

/**
 * Get the Bouquet INR Turso client (separate database)
 */
export function getBouquetInrClient(): Client | null {
  if (tursoClients.has('bouquet-inr')) return tursoClients.get('bouquet-inr')!

  const url = process.env.TURSO_BOUQUET_INR_URL
  const authToken = process.env.TURSO_BOUQUET_INR_TOKEN

  if (!url || !authToken) {
    console.log('[TURSO] Bouquet INR DB not configured')
    return null
  }

  const client = createClient({ url: toHttpUrl(url), authToken })
  tursoClients.set('bouquet-inr', client)
  return client
}

/**
 * Get all configured Turso clients
 */
export function getAllTursoClients(): { name: string; client: Client }[] {
  const clients: { name: string; client: Client }[] = []
  const main = getTursoClient()
  if (main) clients.push({ name: 'main', client: main })
  const bouquetInr = getBouquetInrClient()
  if (bouquetInr) clients.push({ name: 'bouquet-inr', client: bouquetInr })
  return clients
}

export function isTursoConfigured(): boolean {
  return !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN)
}

// ============================================================================
// URL LOOKUP — Find campaigns/ad groups for a given course URL
// ============================================================================

export interface UrlMatchResult {
  accountName: string
  campaignName: string
  adGroupName: string
  finalUrl: string
  adStrength: string | null
  campaignStatus: string | null
  adGroupStatus: string | null
  locations: string[]
}

/**
 * Find all campaigns/ad groups that advertise a given URL.
 * Searches the `ads` table for matching final_url, then enriches
 * with campaign status, ad group status, and geo targets.
 */
export async function lookupByUrl(
  url: string,
  accountName?: string
): Promise<UrlMatchResult[]> {
  const clients = getAllTursoClients()
  if (clients.length === 0) return []

  // Query all databases in parallel and merge results
  const allResults = await Promise.all(clients.map(({ client }) => lookupByUrlSingle(client, url, accountName)))
  return allResults.flat()
}

async function lookupByUrlSingle(
  client: Client,
  url: string,
  accountName?: string
): Promise<UrlMatchResult[]> {

  // Normalize URL for matching
  const normalizedUrl = url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .replace(/\?.*$/, '')

  // Find ads with matching URL
  const accountFilter = accountName ? 'AND a.account_name = ?' : ''
  const args: (string | number)[] = [`%${normalizedUrl}%`]
  if (accountName) args.push(accountName)

  const result = await client.execute({
    sql: `
      SELECT DISTINCT
        a.account_name,
        a.campaign_name,
        a.ad_group_name,
        a.final_url,
        a.ad_strength,
        c.status as campaign_status,
        ag.status as ad_group_status
      FROM ads a
      LEFT JOIN campaigns c ON c.account_name = a.account_name AND c.name = a.campaign_name
      LEFT JOIN ad_groups ag ON ag.account_name = a.account_name AND ag.campaign_name = a.campaign_name AND ag.name = a.ad_group_name
      WHERE LOWER(a.final_url) LIKE ?
      ${accountFilter}
      ORDER BY a.account_name, a.campaign_name, a.ad_group_name
    `,
    args
  })

  // Get locations for matched campaigns
  const campaignKeys = new Set(result.rows.map(r => `${r.account_name}|${r.campaign_name}`))
  const locationsMap = new Map<string, string[]>()

  if (campaignKeys.size > 0) {
    // Fetch locations for all matched campaigns
    for (const key of campaignKeys) {
      const [acct, camp] = key.split('|')
      const locResult = await client.execute({
        sql: 'SELECT location FROM locations WHERE account_name = ? AND campaign_name = ?',
        args: [acct, camp]
      })
      locationsMap.set(key, locResult.rows.map(r => r.location as string))
    }
  }

  return result.rows.map(row => ({
    accountName: row.account_name as string,
    campaignName: row.campaign_name as string,
    adGroupName: row.ad_group_name as string,
    finalUrl: row.final_url as string,
    adStrength: row.ad_strength as string | null,
    campaignStatus: row.campaign_status as string | null,
    adGroupStatus: row.ad_group_status as string | null,
    locations: locationsMap.get(`${row.account_name}|${row.campaign_name}`) || []
  }))
}

// ============================================================================
// KEYWORD LOOKUP — Check if keywords exist in accounts
// ============================================================================

export interface KeywordMatchResult {
  accountName: string
  campaignName: string
  adGroupName: string
  keyword: string
  matchType: string
  status: string | null
  qualityScore: number | null
}

/**
 * Search for a keyword across all accounts in Turso.
 * Returns all instances of the keyword with campaign/ad group context.
 */
export async function lookupKeyword(
  keyword: string,
  accountName?: string
): Promise<KeywordMatchResult[]> {
  const clients = getAllTursoClients()
  if (clients.length === 0) return []

  const allResults = await Promise.all(clients.map(({ client }) => lookupKeywordSingle(client, keyword, accountName)))
  return allResults.flat()
}

async function lookupKeywordSingle(
  client: Client,
  keyword: string,
  accountName?: string
): Promise<KeywordMatchResult[]> {

  const normalizedKeyword = keyword.toLowerCase().trim()
  const accountFilter = accountName ? 'AND account_name = ?' : ''
  const args: (string | number)[] = [normalizedKeyword]
  if (accountName) args.push(accountName)

  const result = await client.execute({
    sql: `
      SELECT account_name, campaign_name, ad_group_name, keyword, match_type, status, quality_score
      FROM keywords
      WHERE LOWER(keyword) = ? AND is_negative = 0
      ${accountFilter}
      ORDER BY account_name, campaign_name
    `,
    args
  })

  return result.rows.map(row => ({
    accountName: row.account_name as string,
    campaignName: row.campaign_name as string,
    adGroupName: row.ad_group_name as string,
    keyword: row.keyword as string,
    matchType: row.match_type as string,
    status: row.status as string | null,
    qualityScore: row.quality_score as number | null
  }))
}

// ============================================================================
// ACCOUNT SUMMARY
// ============================================================================

export interface AccountSummary {
  accountName: string
  customerId: string | null
  campaignsCount: number
  enabledCampaigns: number
  adGroupsCount: number
  keywordsCount: number
  adsCount: number
  syncedAt: string | null
}

/**
 * Get summary stats for all accounts in Turso.
 */
export async function getAccountSummaries(): Promise<AccountSummary[]> {
  const clients = getAllTursoClients()
  if (clients.length === 0) return []

  const allResults = await Promise.all(clients.map(({ client }) => getAccountSummariesSingle(client)))
  return allResults.flat()
}

async function getAccountSummariesSingle(client: Client): Promise<AccountSummary[]> {
  const result = await client.execute(`
    SELECT
      sm.account_name,
      c.customer_id,
      sm.campaigns_count,
      sm.ad_groups_count,
      sm.keywords_count,
      sm.ads_count,
      sm.synced_at,
      (SELECT COUNT(*) FROM campaigns WHERE account_name = sm.account_name AND status = 'Enabled') as enabled_campaigns
    FROM sync_metadata sm
    LEFT JOIN campaigns c ON c.account_name = sm.account_name LIMIT 1
  `)

  return result.rows.map(row => ({
    accountName: row.account_name as string,
    customerId: row.customer_id as string | null,
    campaignsCount: row.campaigns_count as number,
    enabledCampaigns: row.enabled_campaigns as number,
    adGroupsCount: row.ad_groups_count as number,
    keywordsCount: row.keywords_count as number,
    adsCount: row.ads_count as number,
    syncedAt: row.synced_at as string | null
  }))
}
