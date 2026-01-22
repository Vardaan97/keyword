/**
 * Import account structure summary from JSON to Convex
 */

import * as fs from 'fs'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'

async function main() {
  const jsonPath = process.argv[2]
  const accountId = process.argv[3] || 'bouquet'

  if (!jsonPath) {
    console.error('Usage: npx tsx scripts/import-structure-summary.ts /path/to/summary.json [accountId]')
    process.exit(1)
  }

  if (!fs.existsSync(jsonPath)) {
    console.error(`File not found: ${jsonPath}`)
    process.exit(1)
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    console.error('NEXT_PUBLIC_CONVEX_URL not set')
    process.exit(1)
  }

  const summary = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))

  console.log(`\nImporting Account Structure`)
  console.log(`  Account: ${summary.accountName}`)
  console.log(`  Campaigns: ${summary.summary.totalCampaigns}`)
  console.log(`  Ad Groups: ${summary.summary.totalAdGroups.toLocaleString()}`)
  console.log(`  Keywords: ${summary.summary.totalKeywords.toLocaleString()}`)
  console.log('')

  const client = new ConvexHttpClient(convexUrl)

  try {
    const result = await client.mutation(api.imports.importAccountStructure, {
      accountId,
      accountName: summary.accountName,
      summary: summary.summary,
      campaignTypes: summary.campaignTypes,
      qualityScoreDistribution: summary.qualityScoreDistribution,
      topCampaigns: summary.topCampaigns,
    })

    console.log('Import successful!')
    console.log(`  ID: ${result.id}`)
    console.log(`  Updated: ${result.updated}`)
  } catch (error) {
    console.error('Import failed:', error)
    process.exit(1)
  }
}

main()
