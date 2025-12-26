/**
 * Script to import Flexi Google Ads data directly from CSV to Supabase
 * Run with: npx tsx scripts/import-flexi.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// Load environment variables
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// CSV file path
const csvPath = '/Users/vardaanaggarwal/Downloads/Claude code/Google Ads API/flexi_utf8.csv'

// Column indices (0-based) from Google Ads Editor export
const COL = {
  account: 0,
  accountName: 1,
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
  adGroup: 60,
  maxCpc: 61,
  adGroupType: 73,
  optimizedTargeting: 70,
  finalUrl: 122,
  finalMobileUrl: 123,
  trackingTemplate: 58,
  finalUrlSuffix: 86,
  keyword: 142,
  firstPageBid: 143,
  topOfPageBid: 144,
  firstPositionBid: 145,
  qualityScore: 146,
  landingPageExperience: 147,
  expectedCtr: 148,
  adRelevance: 149,
  location: 131,
  bidModifier: 127,
  criterionType: 129,
  campaignStatus: 263,
  adGroupStatus: 264,
  status: 266,
}

function parseNumber(val: string | undefined): number | null {
  if (!val || val === '--' || val === '') return null
  const clean = val.replace(/[₹$,\s]/g, '')
  const num = parseFloat(clean)
  return isNaN(num) ? null : num
}

function parseDate(val: string | undefined): string | null {
  if (!val || val === '--' || val === '') return null
  // Format: Dec 24, 2024 -> 2024-12-24
  try {
    const d = new Date(val)
    if (isNaN(d.getTime())) return null
    return d.toISOString().split('T')[0]
  } catch {
    return null
  }
}

function normalizeStatus(status: string | undefined): string {
  if (!status) return 'Paused'
  const s = status.toLowerCase().trim()
  if (s === 'enabled') return 'Enabled'
  if (s === 'paused') return 'Paused'
  if (s === 'ended') return 'Ended'
  if (s === 'removed') return 'Removed'
  return 'Paused'
}

async function main() {
  console.log('Reading CSV file...')
  const content = fs.readFileSync(csvPath, 'utf-8')
  const lines = content.split('\n')

  console.log(`Total lines: ${lines.length}`)

  // Parse header
  const header = lines[0].split('\t')
  console.log(`Columns: ${header.length}`)

  // Data structures
  const accountInfo = { customerId: '', name: '' }
  const campaigns = new Map<string, any>()
  const adGroups = new Map<string, any>()
  const keywords: any[] = []
  const geoTargets: { campaignName: string; location: string; bidModifier: number | null }[] = []

  // Parse rows
  console.log('Parsing rows...')
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    const cols = line.split('\t')

    // Get account info from first valid row
    if (!accountInfo.customerId && cols[COL.account]) {
      accountInfo.customerId = cols[COL.account].trim()
      accountInfo.name = cols[COL.accountName]?.trim() || 'Flexi'
    }

    const campaignName = cols[COL.campaign]?.trim()
    const adGroupName = cols[COL.adGroup]?.trim()
    const keywordText = cols[COL.keyword]?.trim()
    const location = cols[COL.location]?.trim()

    // Campaign data
    if (campaignName && !campaigns.has(campaignName)) {
      campaigns.set(campaignName, {
        name: campaignName,
        campaign_type: cols[COL.campaignType]?.trim() || null,
        status: normalizeStatus(cols[COL.campaignStatus]),
        budget: parseNumber(cols[COL.budget]),
        budget_type: cols[COL.budgetType]?.trim() || null,
        bid_strategy_type: cols[COL.bidStrategyType]?.trim() || null,
        target_cpa: parseNumber(cols[COL.targetCpa]),
        networks: cols[COL.networks]?.trim() || null,
        languages: cols[COL.languages]?.trim() || null,
        labels: cols[COL.labels]?.trim() || null,
        desktop_bid_modifier: parseNumber(cols[COL.desktopBidModifier]),
        mobile_bid_modifier: parseNumber(cols[COL.mobileBidModifier]),
        tablet_bid_modifier: parseNumber(cols[COL.tabletBidModifier]),
        ad_rotation: cols[COL.adRotation]?.trim() || null,
        start_date: parseDate(cols[COL.startDate]),
        end_date: parseDate(cols[COL.endDate]),
      })
    }

    // Ad Group data
    const adGroupKey = `${campaignName}::${adGroupName}`
    if (campaignName && adGroupName && !adGroups.has(adGroupKey)) {
      adGroups.set(adGroupKey, {
        campaignName,
        name: adGroupName,
        ad_group_type: cols[COL.adGroupType]?.trim() || null,
        status: normalizeStatus(cols[COL.adGroupStatus]),
        max_cpc: parseNumber(cols[COL.maxCpc]),
        final_url: cols[COL.finalUrl]?.trim() || null,
        final_mobile_url: cols[COL.finalMobileUrl]?.trim() || null,
        tracking_template: cols[COL.trackingTemplate]?.trim() || null,
        final_url_suffix: cols[COL.finalUrlSuffix]?.trim() || null,
        optimized_targeting: cols[COL.optimizedTargeting]?.toLowerCase() === 'true',
      })
    }

    // Keyword data
    if (keywordText && adGroupName && campaignName) {
      keywords.push({
        adGroupKey,
        keyword_text: keywordText,
        match_type: 'Broad', // Default, will be updated based on keyword format
        status: normalizeStatus(cols[COL.status]),
        first_page_bid: parseNumber(cols[COL.firstPageBid]),
        top_of_page_bid: parseNumber(cols[COL.topOfPageBid]),
        first_position_bid: parseNumber(cols[COL.firstPositionBid]),
        quality_score: parseNumber(cols[COL.qualityScore]),
        landing_page_experience: cols[COL.landingPageExperience]?.trim() || null,
        expected_ctr: cols[COL.expectedCtr]?.trim() || null,
        ad_relevance: cols[COL.adRelevance]?.trim() || null,
      })
    }

    // Geo target data
    if (location && campaignName && cols[COL.criterionType]?.toLowerCase().includes('location')) {
      geoTargets.push({
        campaignName,
        location,
        bidModifier: parseNumber(cols[COL.bidModifier])
      })
    }

    if (i % 50000 === 0) {
      console.log(`  Parsed ${i} rows...`)
    }
  }

  console.log('\n=== Parsed Data Summary ===')
  console.log(`Account: ${accountInfo.customerId} (${accountInfo.name})`)
  console.log(`Campaigns: ${campaigns.size}`)
  console.log(`Ad Groups: ${adGroups.size}`)
  console.log(`Keywords: ${keywords.length}`)
  console.log(`Geo Targets: ${geoTargets.length}`)

  // === INSERT INTO DATABASE ===
  console.log('\n=== Importing to Supabase ===')

  // 1. Upsert account
  console.log('1. Creating account...')
  const { data: accountData, error: accountError } = await supabase
    .from('gads_accounts')
    .upsert({
      customer_id: accountInfo.customerId,
      name: accountInfo.name,
      currency: 'INR',
      is_active: true,
      updated_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString()
    }, { onConflict: 'customer_id' })
    .select()
    .single()

  if (accountError) {
    console.error('Account error:', accountError.message)
    process.exit(1)
  }

  const accountId = accountData.id
  console.log(`   Account ID: ${accountId}`)

  // 2. Insert campaigns
  console.log('2. Importing campaigns...')
  const campaignIdMap = new Map<string, string>()
  let campaignCount = 0

  for (const [name, campaign] of campaigns) {
    const { data, error } = await supabase
      .from('gads_campaigns')
      .upsert({
        account_id: accountId,
        ...campaign,
        updated_at: new Date().toISOString(),
        synced_at: new Date().toISOString()
      }, { onConflict: 'account_id,name' })
      .select()
      .single()

    if (error) {
      console.error(`   Campaign "${name}": ${error.message}`)
    } else if (data) {
      campaignIdMap.set(name, data.id)
      campaignCount++
    }

    if (campaignCount % 50 === 0) {
      console.log(`   Imported ${campaignCount} campaigns...`)
    }
  }
  console.log(`   Total campaigns: ${campaignCount}`)

  // 3. Insert geo targets
  console.log('3. Importing geo targets...')
  let geoCount = 0
  const uniqueGeos = new Map<string, any>()

  for (const geo of geoTargets) {
    const campaignId = campaignIdMap.get(geo.campaignName)
    if (!campaignId) continue

    const key = `${campaignId}::${geo.location}`
    if (!uniqueGeos.has(key)) {
      uniqueGeos.set(key, {
        campaign_id: campaignId,
        location_name: geo.location,
        is_negative: false,
        bid_modifier: geo.bidModifier
      })
    }
  }

  const geoRecords = Array.from(uniqueGeos.values())
  if (geoRecords.length > 0) {
    const { error } = await supabase
      .from('gads_campaign_geo_targets')
      .upsert(geoRecords, { onConflict: 'campaign_id,location_name,is_negative' })

    if (error) {
      console.error(`   Geo targets error: ${error.message}`)
    } else {
      geoCount = geoRecords.length
    }
  }
  console.log(`   Total geo targets: ${geoCount}`)

  // 4. Insert ad groups
  console.log('4. Importing ad groups...')
  const adGroupIdMap = new Map<string, string>()
  let adGroupCount = 0

  for (const [key, adGroup] of adGroups) {
    const campaignId = campaignIdMap.get(adGroup.campaignName)
    if (!campaignId) continue

    const { data, error } = await supabase
      .from('gads_ad_groups')
      .upsert({
        campaign_id: campaignId,
        name: adGroup.name,
        ad_group_type: adGroup.ad_group_type,
        status: adGroup.status,
        max_cpc: adGroup.max_cpc,
        final_url: adGroup.final_url,
        final_mobile_url: adGroup.final_mobile_url,
        tracking_template: adGroup.tracking_template,
        final_url_suffix: adGroup.final_url_suffix,
        optimized_targeting: adGroup.optimized_targeting,
        updated_at: new Date().toISOString(),
        synced_at: new Date().toISOString()
      }, { onConflict: 'campaign_id,name' })
      .select()
      .single()

    if (error) {
      // Ignore duplicates
    } else if (data) {
      adGroupIdMap.set(key, data.id)
      adGroupCount++
    }

    if (adGroupCount % 500 === 0) {
      console.log(`   Imported ${adGroupCount} ad groups...`)
    }
  }
  console.log(`   Total ad groups: ${adGroupCount}`)

  // 5. Insert keywords in batches
  console.log('5. Importing keywords...')
  let keywordCount = 0
  const BATCH_SIZE = 500

  for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
    const batch = keywords.slice(i, i + BATCH_SIZE)

    const keywordRecords = batch
      .map(kw => {
        const adGroupId = adGroupIdMap.get(kw.adGroupKey)
        if (!adGroupId) return null

        return {
          ad_group_id: adGroupId,
          keyword_text: kw.keyword_text,
          match_type: kw.match_type,
          status: kw.status,
          first_page_bid: kw.first_page_bid,
          top_of_page_bid: kw.top_of_page_bid,
          first_position_bid: kw.first_position_bid,
          quality_score: kw.quality_score,
          landing_page_experience: kw.landing_page_experience,
          expected_ctr: kw.expected_ctr,
          ad_relevance: kw.ad_relevance,
          is_negative: false,
          updated_at: new Date().toISOString(),
          synced_at: new Date().toISOString()
        }
      })
      .filter(Boolean)

    if (keywordRecords.length > 0) {
      const { error } = await supabase
        .from('gads_keywords')
        .upsert(keywordRecords as any[], { onConflict: 'ad_group_id,keyword_text,match_type,is_negative' })

      if (!error) {
        keywordCount += keywordRecords.length
      }
    }

    if (i % 5000 === 0) {
      console.log(`   Imported ${keywordCount} keywords...`)
    }
  }
  console.log(`   Total keywords: ${keywordCount}`)

  // 6. Create sync log
  console.log('6. Creating sync log...')
  await supabase
    .from('gads_sync_logs')
    .insert({
      account_id: accountId,
      sync_type: 'FULL',
      entity_type: 'all',
      source: 'csv_import',
      records_processed: lines.length,
      records_created: campaignCount + adGroupCount + keywordCount,
      status: 'completed',
      completed_at: new Date().toISOString()
    })

  console.log('\n=== Import Complete ===')
  console.log(`Campaigns: ${campaignCount}`)
  console.log(`Ad Groups: ${adGroupCount}`)
  console.log(`Keywords: ${keywordCount}`)
  console.log(`Geo Targets: ${geoCount}`)
}

main().catch(console.error)
