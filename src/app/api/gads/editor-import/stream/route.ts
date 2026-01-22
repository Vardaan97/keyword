import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/../convex/_generated/api'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import crypto from 'crypto'
import { Transform } from 'stream'

export const maxDuration = 300 // 5 minutes
export const dynamic = 'force-dynamic'

// Batch sizes
const CAMPAIGN_BATCH_SIZE = 100
const AD_GROUP_BATCH_SIZE = 500
const KEYWORD_BATCH_SIZE = 1000
const AD_BATCH_SIZE = 500

// Header names to look for (case-insensitive)
const HEADER_NAMES = {
  account: ['account', '﻿account'], // BOM variant
  accountName: ['account name'],
  campaign: ['campaign'],
  campaignLabels: ['labels'],
  campaignType: ['campaign type'],
  networks: ['networks'],
  budget: ['budget'],
  budgetType: ['budget type'],
  bidStrategyType: ['bid strategy type'],
  bidStrategyName: ['bid strategy name'],
  targetCpa: ['target cpa'],
  targetRoas: ['target roas'],
  maxCpcBidLimit: ['maximum cpc bid limit'],
  desktopBidModifier: ['desktop bid modifier'],
  mobileBidModifier: ['mobile bid modifier'],
  tabletBidModifier: ['tablet bid modifier'],
  startDate: ['start date'],
  endDate: ['end date'],
  adSchedule: ['ad schedule'],
  adGroup: ['ad group'],
  maxCpc: ['max cpc'],
  maxCpm: ['max cpm'],
  targetCpc: ['target cpc'],
  adGroupTargetRoas: ['target roas'], // Same as targetRoas
  optimizedTargeting: ['optimized targeting'],
  adGroupType: ['ad group type'],
  keywordMatchType: ['account keyword type', 'match type'],
  keyword: ['keyword'],
  firstPageBid: ['first page bid'],
  topOfPageBid: ['top of page bid'],
  firstPositionBid: ['first position bid'],
  qualityScore: ['quality score'],
  landingPageExperience: ['landing page experience'],
  expectedCtr: ['expected ctr'],
  adRelevance: ['ad relevance'],
  adType: ['ad type'],
  path1: ['path 1'],
  path2: ['path 2'],
  finalUrl: ['final url'],
  campaignStatus: ['campaign status'],
  adGroupStatus: ['ad group status'],
  status: ['status'],
  approvalStatus: ['approval status'],
  adStrength: ['ad strength'],
}

// Build column map dynamically from headers
function buildColumnMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  const lowerHeaders = headers.map(h => h.toLowerCase().trim())

  for (const [key, names] of Object.entries(HEADER_NAMES)) {
    for (const name of names) {
      const idx = lowerHeaders.indexOf(name.toLowerCase())
      if (idx !== -1) {
        map[key] = idx
        break
      }
    }
  }

  // Find headline columns (Headline 1, Headline 2, etc.)
  const headlineIndices: number[] = []
  for (let i = 1; i <= 15; i++) {
    const idx = lowerHeaders.indexOf(`headline ${i}`)
    if (idx !== -1) headlineIndices.push(idx)
  }
  if (headlineIndices.length > 0) {
    map['headlines'] = headlineIndices[0] // Store first index, we'll iterate from there
  }

  // Find description columns
  const descIndices: number[] = []
  for (let i = 1; i <= 5; i++) {
    const idx = lowerHeaders.indexOf(`description ${i}`)
    if (idx !== -1) descIndices.push(idx)
  }
  if (descIndices.length > 0) {
    map['descriptions'] = descIndices[0]
  }

  return map
}

// Store headline/description indices separately
let headlineIndices: number[] = []
let descriptionIndices: number[] = []

function buildHeadlineDescriptionIndices(headers: string[]) {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim())

  headlineIndices = []
  for (let i = 1; i <= 15; i++) {
    const idx = lowerHeaders.indexOf(`headline ${i}`)
    if (idx !== -1) headlineIndices.push(idx)
  }

  descriptionIndices = []
  for (let i = 1; i <= 5; i++) {
    const idx = lowerHeaders.indexOf(`description ${i}`)
    if (idx !== -1) descriptionIndices.push(idx)
  }
}

// ParsedRow interface removed - not used (row parsing is inline in POST handler)

interface ImportStats {
  totalRows: number
  campaigns: number
  adGroups: number
  keywords: number
  ads: number
  processedRows: number
  errors: number
}

/**
 * POST /api/gads/editor-import/stream
 *
 * Stream-process a large Google Ads Editor CSV file from local filesystem
 *
 * Body: { filePath: string }
 */
export async function POST(request: NextRequest) {
  console.log('[STREAM-IMPORT] Starting stream import...')

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    return NextResponse.json(
      { success: false, error: 'Convex URL not configured' },
      { status: 500 }
    )
  }

  const convex = new ConvexHttpClient(convexUrl)

  try {
    const body = await request.json()
    const { filePath, force } = body

    if (!filePath) {
      return NextResponse.json(
        { success: false, error: 'filePath is required' },
        { status: 400 }
      )
    }

    // Resolve and validate path
    const resolvedPath = path.resolve(filePath)

    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json(
        { success: false, error: `File not found: ${resolvedPath}` },
        { status: 404 }
      )
    }

    const fileStats = fs.statSync(resolvedPath)
    const fileSizeMB = fileStats.size / 1024 / 1024
    console.log(`[STREAM-IMPORT] File: ${resolvedPath} (${fileSizeMB.toFixed(2)} MB)`)

    // Generate file hash from first 10KB for deduplication
    const hashBuffer = Buffer.alloc(10240)
    const fd = fs.openSync(resolvedPath, 'r')
    fs.readSync(fd, hashBuffer, 0, 10240, 0)
    fs.closeSync(fd)
    // If force=true, add timestamp to hash to bypass duplicate check
    const baseHash = crypto.createHash('sha256').update(hashBuffer).digest('hex')
    const fileHash = force ? `${baseHash}_${Date.now()}` : baseHash

    // Create UTF-16 LE to UTF-8 transform stream
    const utf16ToUtf8Transform = createUTF16LEToUTF8Transform()

    // Create read stream
    const fileStream = fs.createReadStream(resolvedPath)
    const utf8Stream = fileStream.pipe(utf16ToUtf8Transform)

    // Create readline interface for line-by-line processing
    const rl = readline.createInterface({
      input: utf8Stream,
      crlfDelay: Infinity,
    })

    // Initialize stats
    const stats: ImportStats = {
      totalRows: 0,
      campaigns: 0,
      adGroups: 0,
      keywords: 0,
      ads: 0,
      processedRows: 0,
      errors: 0,
    }

    // Track unique entities
    const seenCampaigns = new Set<string>()
    const seenAdGroups = new Set<string>()

    // Batches for insertion
    const campaignBatch: Record<string, unknown>[] = []
    const adGroupBatch: Record<string, unknown>[] = []
    const keywordBatch: Record<string, unknown>[] = []
    const adBatch: Record<string, unknown>[] = []

    // Account info
    let accountId = ''
    let accountName = ''
    let headers: string[] = []
    let isFirstLine = true
    let COLUMN_MAP: Record<string, number> = {} // Dynamic column map

    // Create import record
    let importId: string | null = null

    // Process each line
    for await (const line of rl) {
      stats.totalRows++

      // Skip empty lines
      if (!line.trim()) continue

      // Parse TSV line
      const columns = line.split('\t')

      // First line is headers - build dynamic column map
      if (isFirstLine) {
        headers = columns
        isFirstLine = false
        COLUMN_MAP = buildColumnMap(headers)
        buildHeadlineDescriptionIndices(headers)
        console.log(`[STREAM-IMPORT] Headers parsed: ${headers.length} columns`)
        console.log(`[STREAM-IMPORT] Ad Group column index: ${COLUMN_MAP.adGroup}`)
        continue
      }

      // Get account info from first data row
      if (!accountId && columns[COLUMN_MAP.account] !== undefined) {
        accountId = columns[COLUMN_MAP.account]?.trim() || 'unknown'
        accountName = columns[COLUMN_MAP.accountName]?.trim() || 'Unknown Account'
        console.log(`[STREAM-IMPORT] Account: ${accountName} (${accountId})`)

        // Create import record in Convex
        const importResult = await convex.mutation(api.gadsEditorImport.create, {
          accountId,
          accountName,
          fileName: path.basename(resolvedPath),
          fileHash,
        })

        if (importResult.alreadyExists) {
          console.log('[STREAM-IMPORT] File already imported')
          return NextResponse.json({
            success: true,
            data: {
              importId: importResult.id,
              alreadyExists: true,
              accountId,
              accountName,
            },
          })
        }

        importId = importResult.id
      }

      // Extract campaign and ad group from every row (they're present in keyword/ad rows too)
      const campaign = columns[COLUMN_MAP.campaign]?.trim()
      const adGroup = columns[COLUMN_MAP.adGroup]?.trim()

      // Always try to capture campaign if we haven't seen it
      if (campaign && !seenCampaigns.has(campaign)) {
        seenCampaigns.add(campaign)
        const campaignData = {
          importId,
          accountId,
          campaignName: campaign,
          labels: parseLabels(columns[COLUMN_MAP.campaignLabels]),
          campaignType: columns[COLUMN_MAP.campaignType]?.trim(),
          networks: columns[COLUMN_MAP.networks]?.trim(),
          budget: parseNumber(columns[COLUMN_MAP.budget]),
          budgetType: columns[COLUMN_MAP.budgetType]?.trim(),
          bidStrategyType: columns[COLUMN_MAP.bidStrategyType]?.trim(),
          bidStrategyName: columns[COLUMN_MAP.bidStrategyName]?.trim(),
          targetCpa: parseNumber(columns[COLUMN_MAP.targetCpa]),
          targetRoas: parseNumber(columns[COLUMN_MAP.targetRoas]),
          maxCpcBidLimit: parseNumber(columns[COLUMN_MAP.maxCpcBidLimit]),
          startDate: columns[COLUMN_MAP.startDate]?.trim(),
          endDate: columns[COLUMN_MAP.endDate]?.trim(),
          adSchedule: columns[COLUMN_MAP.adSchedule]?.trim(),
          status: columns[COLUMN_MAP.campaignStatus]?.trim() || 'Enabled',
        }
        campaignBatch.push(campaignData)
        stats.campaigns++

        if (campaignBatch.length >= CAMPAIGN_BATCH_SIZE) {
          await flushCampaignBatch(convex, campaignBatch)
          campaignBatch.length = 0
        }
      }

      // Always try to capture ad group if we haven't seen it
      if (campaign && adGroup) {
        const adGroupKey = `${campaign}|${adGroup}`
        if (!seenAdGroups.has(adGroupKey)) {
          seenAdGroups.add(adGroupKey)
          const adGroupData = {
            importId,
            accountId,
            campaignName: campaign,
            adGroupName: adGroup,
            adGroupType: columns[COLUMN_MAP.adGroupType]?.trim() || undefined,
            maxCpc: parseNumber(columns[COLUMN_MAP.maxCpc]),
            maxCpm: parseNumber(columns[COLUMN_MAP.maxCpm]),
            targetCpc: parseNumber(columns[COLUMN_MAP.targetCpc]),
            targetRoas: parseNumber(columns[COLUMN_MAP.adGroupTargetRoas]),
            desktopBidModifier: parseNumber(columns[COLUMN_MAP.desktopBidModifier]),
            mobileBidModifier: parseNumber(columns[COLUMN_MAP.mobileBidModifier]),
            tabletBidModifier: parseNumber(columns[COLUMN_MAP.tabletBidModifier]),
            // Schema expects string, not boolean
            optimizedTargeting: columns[COLUMN_MAP.optimizedTargeting]?.trim() || undefined,
            status: columns[COLUMN_MAP.adGroupStatus]?.trim() || 'Enabled',
          }
          adGroupBatch.push(adGroupData)
          stats.adGroups++

          if (adGroupBatch.length >= AD_GROUP_BATCH_SIZE) {
            await flushAdGroupBatch(convex, adGroupBatch)
            adGroupBatch.length = 0
          }
        }
      }

      // Now handle specific row types (keywords, ads)
      const keyword = columns[COLUMN_MAP.keyword]?.trim()
      const adType = columns[COLUMN_MAP.adType]?.trim()

      if (keyword) {
        const keywordData = {
          importId,
          accountId,
          campaignName: campaign || '',
          adGroupName: adGroup || '',
          keyword,
          matchType: columns[COLUMN_MAP.keywordMatchType]?.trim() || 'Broad',
          firstPageBid: parseNumber(columns[COLUMN_MAP.firstPageBid]),
          topOfPageBid: parseNumber(columns[COLUMN_MAP.topOfPageBid]),
          firstPositionBid: parseNumber(columns[COLUMN_MAP.firstPositionBid]),
          qualityScore: parseNumber(columns[COLUMN_MAP.qualityScore]),
          landingPageExperience: columns[COLUMN_MAP.landingPageExperience]?.trim(),
          expectedCtr: columns[COLUMN_MAP.expectedCtr]?.trim(),
          adRelevance: columns[COLUMN_MAP.adRelevance]?.trim(),
          status: columns[COLUMN_MAP.status]?.trim() || 'Enabled',
        }
        keywordBatch.push(keywordData)
        stats.keywords++

        if (keywordBatch.length >= KEYWORD_BATCH_SIZE) {
          await flushKeywordBatch(convex, keywordBatch)
          keywordBatch.length = 0
        }
      } else if (adType) {
        const headlines: string[] = []
        const descriptions: string[] = []

        // Use global headline/description indices
        for (const idx of headlineIndices) {
          const h = columns[idx]?.trim()
          if (h) headlines.push(h)
        }

        for (const idx of descriptionIndices) {
          const d = columns[idx]?.trim()
          if (d) descriptions.push(d)
        }

        const adData = {
          importId,
          accountId,
          campaignName: campaign || '',
          adGroupName: adGroup || '',
          adType,
          finalUrl: columns[COLUMN_MAP.finalUrl]?.trim(),
          headlines,
          descriptions,
          path1: columns[COLUMN_MAP.path1]?.trim(),
          path2: columns[COLUMN_MAP.path2]?.trim(),
          status: columns[COLUMN_MAP.status]?.trim() || 'Enabled',
          approvalStatus: columns[COLUMN_MAP.approvalStatus]?.trim(),
          adStrength: columns[COLUMN_MAP.adStrength]?.trim(),
        }
        adBatch.push(adData)
        stats.ads++

        if (adBatch.length >= AD_BATCH_SIZE) {
          await flushAdBatch(convex, adBatch)
          adBatch.length = 0
        }
      }

      stats.processedRows++

      // Log progress every 100k rows
      if (stats.processedRows % 100000 === 0) {
        console.log(`[STREAM-IMPORT] Progress: ${stats.processedRows} rows - C:${stats.campaigns} AG:${stats.adGroups} KW:${stats.keywords} Ads:${stats.ads}`)

        // Update progress in Convex
        if (importId) {
          await convex.mutation(api.gadsEditorImport.updateProgress, {
            importId: importId as any,
            progress: Math.min(95, Math.round((stats.processedRows / (fileStats.size / 100)) * 100)),
            stats: {
              totalRows: stats.totalRows,
              campaigns: stats.campaigns,
              adGroups: stats.adGroups,
              keywords: stats.keywords,
              ads: stats.ads,
              processedRows: stats.processedRows,
            },
          })
        }
      }
    }

    // Flush remaining batches
    if (campaignBatch.length > 0) {
      await flushCampaignBatch(convex, campaignBatch)
    }
    if (adGroupBatch.length > 0) {
      await flushAdGroupBatch(convex, adGroupBatch)
    }
    if (keywordBatch.length > 0) {
      await flushKeywordBatch(convex, keywordBatch)
    }
    if (adBatch.length > 0) {
      await flushAdBatch(convex, adBatch)
    }

    // Mark import as complete
    if (importId) {
      await convex.mutation(api.gadsEditorImport.complete, {
        importId: importId as any,
        stats: {
          totalRows: stats.totalRows,
          campaigns: stats.campaigns,
          adGroups: stats.adGroups,
          keywords: stats.keywords,
          ads: stats.ads,
          processedRows: stats.processedRows,
        },
      })
    }

    console.log('[STREAM-IMPORT] Import completed!')
    console.log(`  Total rows: ${stats.totalRows}`)
    console.log(`  Campaigns: ${stats.campaigns}`)
    console.log(`  Ad Groups: ${stats.adGroups}`)
    console.log(`  Keywords: ${stats.keywords}`)
    console.log(`  Ads: ${stats.ads}`)

    return NextResponse.json({
      success: true,
      data: {
        importId,
        accountId,
        accountName,
        stats,
      },
    })
  } catch (error) {
    console.error('[STREAM-IMPORT] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Stream import failed',
      },
      { status: 500 }
    )
  }
}

/**
 * Create a transform stream that converts UTF-16 LE to UTF-8
 */
function createUTF16LEToUTF8Transform(): Transform {
  let buffer = Buffer.alloc(0)
  let skipBOM = true

  return new Transform({
    transform(chunk: Buffer, encoding, callback) {
      // Concatenate with any leftover bytes
      buffer = Buffer.concat([buffer, chunk])

      // Skip BOM if present (first 2 bytes: FF FE)
      if (skipBOM && buffer.length >= 2) {
        if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
          buffer = buffer.subarray(2)
        }
        skipBOM = false
      }

      // Process complete UTF-16 LE code units (2 bytes each)
      const completeBytes = buffer.length - (buffer.length % 2)
      if (completeBytes > 0) {
        const utf16Buffer = buffer.subarray(0, completeBytes)
        const utf8String = utf16Buffer.toString('utf16le')
        this.push(utf8String)
        buffer = buffer.subarray(completeBytes)
      }

      callback()
    },
    flush(callback) {
      // Handle any remaining bytes
      if (buffer.length > 0) {
        const utf8String = buffer.toString('utf16le')
        this.push(utf8String)
      }
      callback()
    },
  })
}

// parseRow function removed - logic is inline in the POST handler

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? undefined : num
}

function parseLabels(value: string | undefined): string[] {
  if (!value) return []
  return value.split(';').map(l => l.trim()).filter(Boolean)
}

async function flushCampaignBatch(convex: ConvexHttpClient, batch: Record<string, unknown>[]) {
  if (batch.length === 0) return
  try {
    await convex.mutation(api.gadsEditorImport.batchInsertCampaigns, {
      campaigns: batch as any,
    })
  } catch (error) {
    console.error('[STREAM-IMPORT] Campaign batch error:', error)
  }
}

async function flushAdGroupBatch(convex: ConvexHttpClient, batch: Record<string, unknown>[]) {
  if (batch.length === 0) return
  try {
    await convex.mutation(api.gadsEditorImport.batchInsertAdGroups, {
      adGroups: batch as any,
    })
  } catch (error) {
    console.error('[STREAM-IMPORT] Ad group batch error:', error)
  }
}

async function flushKeywordBatch(convex: ConvexHttpClient, batch: Record<string, unknown>[]) {
  if (batch.length === 0) return
  try {
    await convex.mutation(api.gadsEditorImport.batchInsertKeywords, {
      keywords: batch as any,
    })
  } catch (error) {
    console.error('[STREAM-IMPORT] Keyword batch error:', error)
  }
}

async function flushAdBatch(convex: ConvexHttpClient, batch: Record<string, unknown>[]) {
  if (batch.length === 0) return
  try {
    await convex.mutation(api.gadsEditorImport.batchInsertAds, {
      ads: batch as any,
    })
  } catch (error) {
    console.error('[STREAM-IMPORT] Ad batch error:', error)
  }
}
