/**
 * Google Ads Editor CSV Parser
 *
 * Parses Google Ads Editor exports which are:
 * - UTF-16 LE encoded (with BOM)
 * - Tab-separated values
 * - Single flat structure with all entities (campaigns, ad groups, keywords, ads)
 * - 241 columns
 *
 * Entity detection is done by checking which columns are populated:
 * - Campaign row: Has Campaign name, no Ad Group
 * - Ad Group row: Has Campaign + Ad Group, no Keyword
 * - Keyword row: Has Campaign + Ad Group + Keyword
 * - Ad row: Has Campaign + Ad Group + Ad type (no Keyword)
 */

// Column indices based on Google Ads Editor export structure
export const COLUMN_INDICES = {
  // Account (cols 0-1)
  ACCOUNT: 0,
  ACCOUNT_NAME: 1,

  // Campaign (cols 2-37)
  CAMPAIGN: 2,
  LABELS: 3,
  CAMPAIGN_TYPE: 4,
  NETWORKS: 5,
  BUDGET: 6,
  BUDGET_TYPE: 7,
  BID_STRATEGY_TYPE: 13,
  BID_STRATEGY_NAME: 14,
  TARGET_CPA: 16,
  MAX_CPC_BID_LIMIT: 17,
  START_DATE: 18,
  END_DATE: 19,
  AD_SCHEDULE: 21,

  // Ad Group (cols 38-56)
  AD_GROUP: 38,
  MAX_CPC: 39,
  MAX_CPM: 40,
  TARGET_ROAS: 46,
  TARGET_CPC: 47,
  DESKTOP_BID_MODIFIER: 48,
  MOBILE_BID_MODIFIER: 49,
  TABLET_BID_MODIFIER: 50,
  AD_GROUP_TYPE: 56,
  OPTIMIZED_TARGETING: 53,

  // Keyword (cols 89-98)
  KEYWORD: 90,
  FIRST_PAGE_BID: 91,
  TOP_OF_PAGE_BID: 92,
  FIRST_POSITION_BID: 93,
  QUALITY_SCORE: 94,
  LANDING_PAGE_EXPERIENCE: 95,
  EXPECTED_CTR: 96,
  AD_RELEVANCE: 97,

  // Match type (col 89)
  ACCOUNT_KEYWORD_TYPE: 89,

  // Ad (cols 99+)
  AD_TYPE: 102,
  HEADLINE_1: 103,
  HEADLINE_2: 104,
  HEADLINE_3: 105,
  DESCRIPTION_LINE_1: 106,
  DESCRIPTION_LINE_2: 107,
  PATH_1: 108,
  PATH_2: 109,
  FINAL_URL: 75,

  // Headlines 4-15 for RSA (cols starting around 145)
  HEADLINE_4: 145,
  HEADLINE_5: 147,
  HEADLINE_6: 149,
  HEADLINE_7: 151,
  HEADLINE_8: 153,
  HEADLINE_9: 155,
  HEADLINE_10: 157,
  HEADLINE_11: 159,
  HEADLINE_12: 161,
  HEADLINE_13: 163,
  HEADLINE_14: 165,
  HEADLINE_15: 167,

  // Descriptions 1-4 for RSA
  DESCRIPTION_1: 169,
  DESCRIPTION_2: 171,
  DESCRIPTION_3: 173,
  DESCRIPTION_4: 175,

  // Status columns (end of file)
  CAMPAIGN_STATUS: 237,
  AD_GROUP_STATUS: 238,
  STATUS: 240,
  APPROVAL_STATUS: 241,
  AD_STRENGTH: 242,
}

// Parsed entity types
export interface ParsedCampaign {
  campaignName: string
  labels: string[]
  campaignType: string
  networks?: string
  budget?: number
  budgetType?: string
  bidStrategyType?: string
  bidStrategyName?: string
  targetCpa?: number
  targetRoas?: number
  maxCpcBidLimit?: number
  startDate?: string
  endDate?: string
  adSchedule?: string
  status: string
}

export interface ParsedAdGroup {
  campaignName: string
  adGroupName: string
  adGroupType?: string
  maxCpc?: number
  maxCpm?: number
  targetCpc?: number
  targetRoas?: number
  desktopBidModifier?: number
  mobileBidModifier?: number
  tabletBidModifier?: number
  optimizedTargeting?: string
  status: string
}

export interface ParsedKeyword {
  campaignName: string
  adGroupName: string
  keyword: string
  matchType: string
  firstPageBid?: number
  topOfPageBid?: number
  firstPositionBid?: number
  qualityScore?: number
  landingPageExperience?: string
  expectedCtr?: string
  adRelevance?: string
  status: string
}

export interface ParsedAd {
  campaignName: string
  adGroupName: string
  adType: string
  finalUrl?: string
  headlines: string[]
  descriptions: string[]
  path1?: string
  path2?: string
  status: string
  approvalStatus?: string
  adStrength?: string
}

export interface ParsedData {
  campaigns: ParsedCampaign[]
  adGroups: ParsedAdGroup[]
  keywords: ParsedKeyword[]
  ads: ParsedAd[]
  accountId: string
  accountName: string
  totalRows: number
}

/**
 * Parse a single row from the CSV
 */
function parseRow(columns: string[]): {
  type: 'campaign' | 'adGroup' | 'keyword' | 'ad' | 'unknown'
  data: ParsedCampaign | ParsedAdGroup | ParsedKeyword | ParsedAd | null
  campaign: string
  adGroup: string
} {
  const campaign = columns[COLUMN_INDICES.CAMPAIGN]?.trim() || ''
  const adGroup = columns[COLUMN_INDICES.AD_GROUP]?.trim() || ''
  const keyword = columns[COLUMN_INDICES.KEYWORD]?.trim() || ''
  const adType = columns[COLUMN_INDICES.AD_TYPE]?.trim() || ''

  // Skip rows without campaign name
  if (!campaign) {
    return { type: 'unknown', data: null, campaign: '', adGroup: '' }
  }

  // Determine entity type based on populated columns
  if (keyword) {
    // This is a keyword row
    const matchTypeRaw = columns[COLUMN_INDICES.ACCOUNT_KEYWORD_TYPE]?.trim() || ''
    const matchType = matchTypeRaw || 'Broad' // Default to Broad if not specified

    const keywordData: ParsedKeyword = {
      campaignName: campaign,
      adGroupName: adGroup,
      keyword,
      matchType,
      firstPageBid: parseNumber(columns[COLUMN_INDICES.FIRST_PAGE_BID]),
      topOfPageBid: parseNumber(columns[COLUMN_INDICES.TOP_OF_PAGE_BID]),
      firstPositionBid: parseNumber(columns[COLUMN_INDICES.FIRST_POSITION_BID]),
      qualityScore: parseNumber(columns[COLUMN_INDICES.QUALITY_SCORE]),
      landingPageExperience: columns[COLUMN_INDICES.LANDING_PAGE_EXPERIENCE]?.trim() || undefined,
      expectedCtr: columns[COLUMN_INDICES.EXPECTED_CTR]?.trim() || undefined,
      adRelevance: columns[COLUMN_INDICES.AD_RELEVANCE]?.trim() || undefined,
      status: columns[COLUMN_INDICES.STATUS]?.trim() || 'Enabled',
    }
    return { type: 'keyword', data: keywordData, campaign, adGroup }
  }

  if (adType) {
    // This is an ad row
    const headlines: string[] = []
    const descriptions: string[] = []

    // Collect all headlines
    const headlineIndices = [
      COLUMN_INDICES.HEADLINE_1, COLUMN_INDICES.HEADLINE_2, COLUMN_INDICES.HEADLINE_3,
      COLUMN_INDICES.HEADLINE_4, COLUMN_INDICES.HEADLINE_5, COLUMN_INDICES.HEADLINE_6,
      COLUMN_INDICES.HEADLINE_7, COLUMN_INDICES.HEADLINE_8, COLUMN_INDICES.HEADLINE_9,
      COLUMN_INDICES.HEADLINE_10, COLUMN_INDICES.HEADLINE_11, COLUMN_INDICES.HEADLINE_12,
      COLUMN_INDICES.HEADLINE_13, COLUMN_INDICES.HEADLINE_14, COLUMN_INDICES.HEADLINE_15,
    ]
    for (const idx of headlineIndices) {
      const headline = columns[idx]?.trim()
      if (headline) headlines.push(headline)
    }

    // Collect all descriptions
    const descIndices = [
      COLUMN_INDICES.DESCRIPTION_LINE_1, COLUMN_INDICES.DESCRIPTION_LINE_2,
      COLUMN_INDICES.DESCRIPTION_1, COLUMN_INDICES.DESCRIPTION_2,
      COLUMN_INDICES.DESCRIPTION_3, COLUMN_INDICES.DESCRIPTION_4,
    ]
    for (const idx of descIndices) {
      const desc = columns[idx]?.trim()
      if (desc) descriptions.push(desc)
    }

    const adData: ParsedAd = {
      campaignName: campaign,
      adGroupName: adGroup,
      adType,
      finalUrl: columns[COLUMN_INDICES.FINAL_URL]?.trim() || undefined,
      headlines,
      descriptions,
      path1: columns[COLUMN_INDICES.PATH_1]?.trim() || undefined,
      path2: columns[COLUMN_INDICES.PATH_2]?.trim() || undefined,
      status: columns[COLUMN_INDICES.STATUS]?.trim() || 'Enabled',
      approvalStatus: columns[COLUMN_INDICES.APPROVAL_STATUS]?.trim() || undefined,
      adStrength: columns[COLUMN_INDICES.AD_STRENGTH]?.trim() || undefined,
    }
    return { type: 'ad', data: adData, campaign, adGroup }
  }

  if (adGroup) {
    // This is an ad group row
    const adGroupData: ParsedAdGroup = {
      campaignName: campaign,
      adGroupName: adGroup,
      adGroupType: columns[COLUMN_INDICES.AD_GROUP_TYPE]?.trim() || undefined,
      maxCpc: parseNumber(columns[COLUMN_INDICES.MAX_CPC]),
      maxCpm: parseNumber(columns[COLUMN_INDICES.MAX_CPM]),
      targetCpc: parseNumber(columns[COLUMN_INDICES.TARGET_CPC]),
      targetRoas: parseNumber(columns[COLUMN_INDICES.TARGET_ROAS]),
      desktopBidModifier: parseNumber(columns[COLUMN_INDICES.DESKTOP_BID_MODIFIER]),
      mobileBidModifier: parseNumber(columns[COLUMN_INDICES.MOBILE_BID_MODIFIER]),
      tabletBidModifier: parseNumber(columns[COLUMN_INDICES.TABLET_BID_MODIFIER]),
      optimizedTargeting: columns[COLUMN_INDICES.OPTIMIZED_TARGETING]?.trim() || undefined,
      status: columns[COLUMN_INDICES.AD_GROUP_STATUS]?.trim() || 'Enabled',
    }
    return { type: 'adGroup', data: adGroupData, campaign, adGroup }
  }

  // This is a campaign row
  const labels = columns[COLUMN_INDICES.LABELS]?.trim() || ''
  const campaignData: ParsedCampaign = {
    campaignName: campaign,
    labels: labels ? labels.split(';').map(l => l.trim()).filter(Boolean) : [],
    campaignType: columns[COLUMN_INDICES.CAMPAIGN_TYPE]?.trim() || 'Search',
    networks: columns[COLUMN_INDICES.NETWORKS]?.trim() || undefined,
    budget: parseNumber(columns[COLUMN_INDICES.BUDGET]),
    budgetType: columns[COLUMN_INDICES.BUDGET_TYPE]?.trim() || undefined,
    bidStrategyType: columns[COLUMN_INDICES.BID_STRATEGY_TYPE]?.trim() || undefined,
    bidStrategyName: columns[COLUMN_INDICES.BID_STRATEGY_NAME]?.trim() || undefined,
    targetCpa: parseNumber(columns[COLUMN_INDICES.TARGET_CPA]),
    maxCpcBidLimit: parseNumber(columns[COLUMN_INDICES.MAX_CPC_BID_LIMIT]),
    startDate: columns[COLUMN_INDICES.START_DATE]?.trim() || undefined,
    endDate: columns[COLUMN_INDICES.END_DATE]?.trim() || undefined,
    adSchedule: columns[COLUMN_INDICES.AD_SCHEDULE]?.trim() || undefined,
    status: columns[COLUMN_INDICES.CAMPAIGN_STATUS]?.trim() || 'Enabled',
  }
  return { type: 'campaign', data: campaignData, campaign, adGroup: '' }
}

/**
 * Parse a number from string, handling various formats
 */
function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? undefined : num
}

/**
 * Parse Google Ads Editor CSV content (already converted to UTF-8)
 *
 * @param content UTF-8 string content of the CSV
 * @param onProgress Optional callback for progress updates
 */
export function parseGoogleAdsEditorCSV(
  content: string,
  onProgress?: (progress: number, stats: { campaigns: number; adGroups: number; keywords: number; ads: number }) => void
): ParsedData {
  const lines = content.split('\n')
  const totalLines = lines.length

  const campaigns: ParsedCampaign[] = []
  const adGroups: ParsedAdGroup[] = []
  const keywords: ParsedKeyword[] = []
  const ads: ParsedAd[] = []

  // Track unique entities (avoid duplicates)
  const seenCampaigns = new Set<string>()
  const seenAdGroups = new Set<string>()
  const seenKeywords = new Set<string>()
  const seenAds = new Set<string>()

  let accountId = ''
  let accountName = ''

  // Skip header row
  for (let i = 1; i < totalLines; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    const columns = line.split('\t')

    // Extract account info from first data row
    if (!accountId && columns[COLUMN_INDICES.ACCOUNT]) {
      accountId = columns[COLUMN_INDICES.ACCOUNT].trim()
      accountName = columns[COLUMN_INDICES.ACCOUNT_NAME]?.trim() || accountId
    }

    const parsed = parseRow(columns)

    if (parsed.type === 'campaign' && parsed.data) {
      const key = (parsed.data as ParsedCampaign).campaignName
      if (!seenCampaigns.has(key)) {
        seenCampaigns.add(key)
        campaigns.push(parsed.data as ParsedCampaign)
      }
    } else if (parsed.type === 'adGroup' && parsed.data) {
      const ag = parsed.data as ParsedAdGroup
      const key = `${ag.campaignName}|${ag.adGroupName}`
      if (!seenAdGroups.has(key)) {
        seenAdGroups.add(key)
        adGroups.push(ag)
      }
    } else if (parsed.type === 'keyword' && parsed.data) {
      const kw = parsed.data as ParsedKeyword
      const key = `${kw.campaignName}|${kw.adGroupName}|${kw.keyword}|${kw.matchType}`
      if (!seenKeywords.has(key)) {
        seenKeywords.add(key)
        keywords.push(kw)
      }
    } else if (parsed.type === 'ad' && parsed.data) {
      const ad = parsed.data as ParsedAd
      const key = `${ad.campaignName}|${ad.adGroupName}|${ad.adType}|${ad.headlines.join('|')}`
      if (!seenAds.has(key)) {
        seenAds.add(key)
        ads.push(ad)
      }
    }

    // Report progress every 10000 rows
    if (onProgress && i % 10000 === 0) {
      const progress = Math.round((i / totalLines) * 100)
      onProgress(progress, {
        campaigns: campaigns.length,
        adGroups: adGroups.length,
        keywords: keywords.length,
        ads: ads.length,
      })
    }
  }

  return {
    campaigns,
    adGroups,
    keywords,
    ads,
    accountId,
    accountName,
    totalRows: totalLines - 1, // Exclude header
  }
}

/**
 * Convert UTF-16 LE buffer to UTF-8 string
 */
export function convertUTF16LEToUTF8(buffer: Buffer): string {
  // Check for BOM (FF FE for UTF-16 LE)
  let start = 0
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    start = 2 // Skip BOM
  }

  // Convert UTF-16 LE to string
  return buffer.slice(start).toString('utf16le')
}

/**
 * Parse CSV in streaming chunks (for very large files)
 * Returns an async generator that yields parsed entities
 */
export async function* parseGoogleAdsEditorCSVStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onProgress?: (bytesRead: number, totalBytes: number) => void
): AsyncGenerator<{
  type: 'campaign' | 'adGroup' | 'keyword' | 'ad'
  data: ParsedCampaign | ParsedAdGroup | ParsedKeyword | ParsedAd
  accountId: string
  accountName: string
}> {
  let buffer = ''
  let headerSkipped = false
  let accountId = ''
  let accountName = ''
  let bytesRead = 0

  // Track unique entities
  const seenCampaigns = new Set<string>()
  const seenAdGroups = new Set<string>()
  const seenKeywords = new Set<string>()
  const seenAds = new Set<string>()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    // Convert chunk to string (assuming already UTF-8 converted)
    const chunk = new TextDecoder().decode(value)
    buffer += chunk
    bytesRead += value.length

    // Process complete lines
    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue

      // Skip header
      if (!headerSkipped) {
        headerSkipped = true
        continue
      }

      const columns = line.split('\t')

      // Extract account info
      if (!accountId && columns[COLUMN_INDICES.ACCOUNT]) {
        accountId = columns[COLUMN_INDICES.ACCOUNT].trim()
        accountName = columns[COLUMN_INDICES.ACCOUNT_NAME]?.trim() || accountId
      }

      const parsed = parseRow(columns)

      if (parsed.type !== 'unknown' && parsed.data) {
        // Check for duplicates
        let isDuplicate = false
        if (parsed.type === 'campaign') {
          const key = (parsed.data as ParsedCampaign).campaignName
          isDuplicate = seenCampaigns.has(key)
          if (!isDuplicate) seenCampaigns.add(key)
        } else if (parsed.type === 'adGroup') {
          const ag = parsed.data as ParsedAdGroup
          const key = `${ag.campaignName}|${ag.adGroupName}`
          isDuplicate = seenAdGroups.has(key)
          if (!isDuplicate) seenAdGroups.add(key)
        } else if (parsed.type === 'keyword') {
          const kw = parsed.data as ParsedKeyword
          const key = `${kw.campaignName}|${kw.adGroupName}|${kw.keyword}|${kw.matchType}`
          isDuplicate = seenKeywords.has(key)
          if (!isDuplicate) seenKeywords.add(key)
        } else if (parsed.type === 'ad') {
          const ad = parsed.data as ParsedAd
          const key = `${ad.campaignName}|${ad.adGroupName}|${ad.adType}|${ad.headlines.join('|')}`
          isDuplicate = seenAds.has(key)
          if (!isDuplicate) seenAds.add(key)
        }

        if (!isDuplicate) {
          yield {
            type: parsed.type,
            data: parsed.data,
            accountId,
            accountName,
          }
        }
      }
    }

    if (onProgress) {
      onProgress(bytesRead, 0) // We don't know total bytes in streaming mode
    }
  }

  // Process remaining buffer
  if (buffer.trim()) {
    const columns = buffer.split('\t')
    const parsed = parseRow(columns)
    if (parsed.type !== 'unknown' && parsed.data) {
      yield {
        type: parsed.type,
        data: parsed.data,
        accountId,
        accountName,
      }
    }
  }
}

// Types are already exported as interfaces above
