/**
 * Stream processor for large Google Ads Editor export files
 *
 * Usage: npx tsx scripts/process-editor-export.ts /path/to/export.csv
 *
 * This script:
 * 1. Converts UTF-16 to UTF-8 (Editor exports are UTF-16)
 * 2. Streams through the file counting campaigns, ad groups, keywords
 * 3. Extracts quality score distribution
 * 4. Outputs a summary JSON file
 */

import * as fs from 'fs'
import * as readline from 'readline'
import * as iconv from 'iconv-lite'

interface ProcessingState {
  lineCount: number
  campaigns: Map<string, {
    name: string
    status: string
    type: string
    adGroups: Set<string>
  }>
  keywords: {
    total: number
    enabled: number
    byQualityScore: Map<number, number>
    noScore: number
  }
  adGroups: {
    total: Set<string>
    enabled: number
  }
}

interface Summary {
  accountName: string
  processedAt: string
  lineCount: number
  summary: {
    totalCampaigns: number
    enabledCampaigns: number
    pausedCampaigns: number
    totalAdGroups: number
    enabledAdGroups: number
    totalKeywords: number
    enabledKeywords: number
  }
  campaignTypes: Array<{ type: string; count: number }>
  qualityScoreDistribution: {
    score1to3: number
    score4to6: number
    score7to10: number
    noScore: number
  }
  topCampaigns: Array<{
    name: string
    status: string
    type: string
    adGroupCount: number
  }>
}

async function processFile(filePath: string): Promise<Summary> {
  console.log(`Processing: ${filePath}`)
  console.log('This may take a few minutes for large files...\n')

  const state: ProcessingState = {
    lineCount: 0,
    campaigns: new Map(),
    keywords: {
      total: 0,
      enabled: 0,
      byQualityScore: new Map(),
      noScore: 0,
    },
    adGroups: {
      total: new Set(),
      enabled: 0,
    },
  }

  // Column indices (will be set from header)
  let colIndices = {
    campaign: -1,
    campaignStatus: -1,
    campaignType: -1,
    adGroup: -1,
    adGroupStatus: -1,
    keyword: -1,
    qualityScore: -1,
    status: -1,
  }

  let accountName = ''
  let headerProcessed = false

  // Create read stream - handle UTF-16 encoding
  const fileStream = fs.createReadStream(filePath)
  const decoder = iconv.decodeStream('utf16le')
  fileStream.pipe(decoder)

  const rl = readline.createInterface({
    input: decoder,
    crlfDelay: Infinity,
  })

  let lastLogTime = Date.now()

  for await (const line of rl) {
    state.lineCount++

    // Progress logging every 10 seconds
    if (Date.now() - lastLogTime > 10000) {
      console.log(`  Processed ${state.lineCount.toLocaleString()} lines...`)
      lastLogTime = Date.now()
    }

    if (!line.trim()) continue

    const values = line.split('\t')

    // First line is header
    if (!headerProcessed) {
      // Find column indices
      values.forEach((col, i) => {
        const lower = col.toLowerCase().trim()
        if (lower === 'campaign') colIndices.campaign = i
        if (lower === 'campaign status') colIndices.campaignStatus = i
        if (lower === 'campaign type') colIndices.campaignType = i
        if (lower === 'ad group') colIndices.adGroup = i
        if (lower === 'ad group status') colIndices.adGroupStatus = i
        if (lower === 'keyword') colIndices.keyword = i
        if (lower === 'quality score') colIndices.qualityScore = i
        if (lower === 'status') colIndices.status = i
        if (lower === 'account name') {
          // This is actually in the data rows
        }
      })
      headerProcessed = true
      continue
    }

    // Extract account name from first data row
    if (!accountName && values[1]) {
      accountName = values[1].trim()
    }

    // Extract campaign info
    const campaignName = values[colIndices.campaign]?.trim()
    const campaignStatus = values[colIndices.campaignStatus]?.trim() || 'Unknown'
    const campaignType = values[colIndices.campaignType]?.trim() || 'Unknown'
    const adGroupName = values[colIndices.adGroup]?.trim()
    const adGroupStatus = values[colIndices.adGroupStatus]?.trim()
    const keyword = values[colIndices.keyword]?.trim()
    const qualityScoreStr = values[colIndices.qualityScore]?.trim()

    // Track campaigns
    if (campaignName && !state.campaigns.has(campaignName)) {
      state.campaigns.set(campaignName, {
        name: campaignName,
        status: campaignStatus,
        type: campaignType,
        adGroups: new Set(),
      })
    }

    // Track ad groups
    if (campaignName && adGroupName) {
      const campaign = state.campaigns.get(campaignName)
      if (campaign) {
        campaign.adGroups.add(adGroupName)
      }
      const adGroupKey = `${campaignName}::${adGroupName}`
      if (!state.adGroups.total.has(adGroupKey)) {
        state.adGroups.total.add(adGroupKey)
        if (adGroupStatus?.toLowerCase() === 'enabled') {
          state.adGroups.enabled++
        }
      }
    }

    // Track keywords and quality scores
    if (keyword) {
      state.keywords.total++
      const rowStatus = values[colIndices.status]?.trim()
      if (rowStatus?.toLowerCase() === 'enabled') {
        state.keywords.enabled++
      }

      if (qualityScoreStr && qualityScoreStr !== '' && qualityScoreStr !== '--') {
        const qs = parseInt(qualityScoreStr, 10)
        if (!isNaN(qs) && qs >= 1 && qs <= 10) {
          state.keywords.byQualityScore.set(
            qs,
            (state.keywords.byQualityScore.get(qs) || 0) + 1
          )
        } else {
          state.keywords.noScore++
        }
      } else {
        state.keywords.noScore++
      }
    }
  }

  console.log(`\nProcessed ${state.lineCount.toLocaleString()} lines total.`)

  // Build summary
  const campaignArray = Array.from(state.campaigns.values())
  const enabledCampaigns = campaignArray.filter(c =>
    c.status.toLowerCase() === 'enabled'
  ).length
  const pausedCampaigns = campaignArray.filter(c =>
    c.status.toLowerCase() === 'paused'
  ).length

  // Campaign types distribution
  const typeMap = new Map<string, number>()
  campaignArray.forEach(c => {
    typeMap.set(c.type, (typeMap.get(c.type) || 0) + 1)
  })
  const campaignTypes = Array.from(typeMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)

  // Quality score distribution
  let score1to3 = 0
  let score4to6 = 0
  let score7to10 = 0
  state.keywords.byQualityScore.forEach((count, score) => {
    if (score >= 1 && score <= 3) score1to3 += count
    else if (score >= 4 && score <= 6) score4to6 += count
    else if (score >= 7 && score <= 10) score7to10 += count
  })

  // Top campaigns by ad group count
  const topCampaigns = campaignArray
    .map(c => ({
      name: c.name,
      status: c.status,
      type: c.type,
      adGroupCount: c.adGroups.size,
    }))
    .sort((a, b) => b.adGroupCount - a.adGroupCount)
    .slice(0, 20)

  const summary: Summary = {
    accountName: accountName || 'Unknown',
    processedAt: new Date().toISOString(),
    lineCount: state.lineCount,
    summary: {
      totalCampaigns: campaignArray.length,
      enabledCampaigns,
      pausedCampaigns,
      totalAdGroups: state.adGroups.total.size,
      enabledAdGroups: state.adGroups.enabled,
      totalKeywords: state.keywords.total,
      enabledKeywords: state.keywords.enabled,
    },
    campaignTypes,
    qualityScoreDistribution: {
      score1to3,
      score4to6,
      score7to10,
      noScore: state.keywords.noScore,
    },
    topCampaigns,
  }

  return summary
}

async function main() {
  const filePath = process.argv[2]

  if (!filePath) {
    console.error('Usage: npx tsx scripts/process-editor-export.ts /path/to/export.csv')
    process.exit(1)
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    process.exit(1)
  }

  try {
    const summary = await processFile(filePath)

    // Print summary
    console.log('\n' + '='.repeat(60))
    console.log('ACCOUNT STRUCTURE SUMMARY')
    console.log('='.repeat(60))
    console.log(`Account: ${summary.accountName}`)
    console.log(`Processed: ${summary.lineCount.toLocaleString()} lines`)
    console.log('')
    console.log(`Campaigns: ${summary.summary.totalCampaigns}`)
    console.log(`  - Enabled: ${summary.summary.enabledCampaigns}`)
    console.log(`  - Paused: ${summary.summary.pausedCampaigns}`)
    console.log('')
    console.log(`Ad Groups: ${summary.summary.totalAdGroups.toLocaleString()}`)
    console.log(`  - Enabled: ${summary.summary.enabledAdGroups.toLocaleString()}`)
    console.log('')
    console.log(`Keywords: ${summary.summary.totalKeywords.toLocaleString()}`)
    console.log(`  - Enabled: ${summary.summary.enabledKeywords.toLocaleString()}`)
    console.log('')
    console.log('Campaign Types:')
    summary.campaignTypes.forEach(ct => {
      console.log(`  - ${ct.type}: ${ct.count}`)
    })
    console.log('')
    console.log('Quality Score Distribution:')
    console.log(`  - Score 1-3 (Low): ${summary.qualityScoreDistribution.score1to3.toLocaleString()}`)
    console.log(`  - Score 4-6 (Medium): ${summary.qualityScoreDistribution.score4to6.toLocaleString()}`)
    console.log(`  - Score 7-10 (High): ${summary.qualityScoreDistribution.score7to10.toLocaleString()}`)
    console.log(`  - No Score: ${summary.qualityScoreDistribution.noScore.toLocaleString()}`)
    console.log('')
    console.log('Top Campaigns by Ad Groups:')
    summary.topCampaigns.slice(0, 10).forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.name} (${c.adGroupCount} ad groups) - ${c.status}`)
    })

    // Save to JSON
    const outputPath = filePath.replace('.csv', '-summary.json')
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2))
    console.log(`\nSummary saved to: ${outputPath}`)

  } catch (error) {
    console.error('Error processing file:', error)
    process.exit(1)
  }
}

main()
