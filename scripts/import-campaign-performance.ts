/**
 * Quick import script for Campaign Performance CSV
 *
 * Usage: npx tsx scripts/import-campaign-performance.ts /path/to/campaign-performance.csv
 */

import * as fs from 'fs'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'

interface ParsedCampaign {
  campaignName: string
  status: string
  campaignType: string
  clicks: number
  impressions: number
  ctr: number
  currencyCode: string
  averageCpc: number
  cost: number
  impressionsAbsTop: number
  impressionsTop: number
  conversions: number
  viewThroughConversions: number
  costPerConversion: number
  conversionRate: number
}

function parseNumber(value: string): number {
  if (!value || value === '0' || value === '') return 0
  const cleaned = value.replace(/,/g, '').replace(/%/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

async function main() {
  const filePath = process.argv[2]
  const accountId = process.argv[3] || 'bouquet'
  const accountName = process.argv[4] || 'Bouquet INR'

  if (!filePath) {
    console.error('Usage: npx tsx scripts/import-campaign-performance.ts /path/to/csv [accountId] [accountName]')
    process.exit(1)
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    process.exit(1)
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    console.error('NEXT_PUBLIC_CONVEX_URL not set. Run: source .env.local')
    process.exit(1)
  }

  console.log(`\nImporting Campaign Performance`)
  console.log(`  File: ${filePath}`)
  console.log(`  Account: ${accountName} (${accountId})`)
  console.log(`  Convex: ${convexUrl}`)
  console.log('')

  const text = fs.readFileSync(filePath, 'utf-8')
  const lines = text.split('\n').filter(line => line.trim())

  if (lines.length < 4) {
    console.error('Invalid CSV format')
    process.exit(1)
  }

  const dateRange = lines[1].replace(/"/g, '')
  console.log(`  Date Range: ${dateRange}`)

  const headers = parseCSVLine(lines[2])
  const headerMap: Record<string, number> = {}
  headers.forEach((h, i) => {
    headerMap[h.toLowerCase()] = i
  })

  const campaigns: ParsedCampaign[] = []

  for (let i = 3; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length < 5) continue

    const campaignName = values[headerMap['campaign']] || ''
    const status = values[headerMap['campaign state']] || 'Unknown'

    if (status.toLowerCase() === 'removed') continue

    campaigns.push({
      campaignName,
      status,
      campaignType: values[headerMap['campaign type']] || 'Unknown',
      clicks: parseNumber(values[headerMap['clicks']]),
      impressions: parseNumber(values[headerMap['impr.']]),
      ctr: parseNumber(values[headerMap['ctr']]),
      currencyCode: values[headerMap['currency code']] || 'INR',
      averageCpc: parseNumber(values[headerMap['avg. cpc']]),
      cost: parseNumber(values[headerMap['cost']]),
      impressionsAbsTop: parseNumber(values[headerMap['impr. (abs. top) %']]),
      impressionsTop: parseNumber(values[headerMap['impr. (top) %']]),
      conversions: parseNumber(values[headerMap['conversions']]),
      viewThroughConversions: parseNumber(values[headerMap['view-through conv.']]),
      costPerConversion: parseNumber(values[headerMap['cost / conv.']]),
      conversionRate: parseNumber(values[headerMap['conv. rate']]),
    })
  }

  console.log(`  Campaigns found: ${campaigns.length}`)
  console.log('')

  // Calculate totals
  const totals = {
    clicks: campaigns.reduce((sum, c) => sum + c.clicks, 0),
    impressions: campaigns.reduce((sum, c) => sum + c.impressions, 0),
    cost: campaigns.reduce((sum, c) => sum + c.cost, 0),
    conversions: campaigns.reduce((sum, c) => sum + c.conversions, 0),
  }

  console.log('Totals:')
  console.log(`  Clicks: ${totals.clicks.toLocaleString()}`)
  console.log(`  Impressions: ${totals.impressions.toLocaleString()}`)
  console.log(`  Cost: ₹${totals.cost.toLocaleString()}`)
  console.log(`  Conversions: ${totals.conversions.toFixed(2)}`)
  console.log('')

  // Import to Convex
  console.log('Importing to Convex...')
  const client = new ConvexHttpClient(convexUrl)

  try {
    const result = await client.mutation(api.imports.importCampaignPerformance, {
      accountId,
      accountName,
      dateRange,
      campaigns,
    })

    console.log('')
    console.log('Import successful!')
    console.log(`  ID: ${result.id}`)
    console.log(`  Updated: ${result.updated}`)
    console.log(`  Campaigns: ${result.campaignCount}`)
  } catch (error) {
    console.error('Import failed:', error)
    process.exit(1)
  }
}

main()
