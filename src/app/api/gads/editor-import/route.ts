import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/../convex/_generated/api'
import {
  parseGoogleAdsEditorCSV,
  convertUTF16LEToUTF8,
  ParsedCampaign,
  ParsedAdGroup,
  ParsedKeyword,
  ParsedAd,
} from '@/lib/google-ads-csv-parser'
import crypto from 'crypto'

export const maxDuration = 300 // 5 minutes max for large imports
export const dynamic = 'force-dynamic'

// Batch size for Convex mutations (to avoid hitting limits)
const BATCH_SIZE = 100

// Max file size in bytes (500MB - adjust based on your needs)
const MAX_FILE_SIZE = 500 * 1024 * 1024

/**
 * POST /api/gads/editor-import
 *
 * Import Google Ads Editor CSV export to Convex database
 *
 * Body: FormData with 'file' field containing CSV
 */
export async function POST(request: NextRequest) {
  console.log('[EDITOR-IMPORT] Starting import...')

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    return NextResponse.json(
      { success: false, error: 'Convex URL not configured' },
      { status: 500 }
    )
  }

  const convex = new ConvexHttpClient(convexUrl)

  try {
    // Check content-length header first
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB. For larger files, please split the CSV or use Google Ads Editor to export specific campaigns.`
        },
        { status: 413 }
      )
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (formError) {
      console.error('[EDITOR-IMPORT] FormData parse error:', formError)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to parse upload. The file may be too large or the upload was interrupted. Try a smaller file (under 100MB) or check your network connection.'
        },
        { status: 400 }
      )
    }

    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB. For larger files, please export specific campaigns from Google Ads Editor.`
        },
        { status: 413 }
      )
    }

    console.log(`[EDITOR-IMPORT] File received: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Convert UTF-16 LE to UTF-8
    console.log('[EDITOR-IMPORT] Converting UTF-16 LE to UTF-8...')
    const content = convertUTF16LEToUTF8(buffer)
    console.log(`[EDITOR-IMPORT] Converted to ${content.length} characters`)

    // Generate file hash for deduplication
    const fileHash = crypto.createHash('sha256').update(content.slice(0, 10000)).digest('hex')
    console.log(`[EDITOR-IMPORT] File hash: ${fileHash.slice(0, 16)}...`)

    // Parse CSV
    console.log('[EDITOR-IMPORT] Parsing CSV...')
    let lastProgress = 0

    const parsedData = parseGoogleAdsEditorCSV(content, (progress, stats) => {
      if (progress - lastProgress >= 10) {
        console.log(`[EDITOR-IMPORT] Parse progress: ${progress}% - C:${stats.campaigns} AG:${stats.adGroups} KW:${stats.keywords} Ads:${stats.ads}`)
        lastProgress = progress
      }
    })

    console.log('[EDITOR-IMPORT] CSV parsed successfully:')
    console.log(`  - Account: ${parsedData.accountId} (${parsedData.accountName})`)
    console.log(`  - Total Rows: ${parsedData.totalRows}`)
    console.log(`  - Campaigns: ${parsedData.campaigns.length}`)
    console.log(`  - Ad Groups: ${parsedData.adGroups.length}`)
    console.log(`  - Keywords: ${parsedData.keywords.length}`)
    console.log(`  - Ads: ${parsedData.ads.length}`)

    // Create import record in Convex
    console.log('[EDITOR-IMPORT] Creating import record in Convex...')
    const importResult = await convex.mutation(api.gadsEditorImport.create, {
      accountId: parsedData.accountId,
      accountName: parsedData.accountName,
      fileName: file.name,
      fileHash,
    })

    if (importResult.alreadyExists) {
      console.log('[EDITOR-IMPORT] File already imported, returning existing import')
      const existingImport = await convex.query(api.gadsEditorImport.get, {
        importId: importResult.id,
      })
      return NextResponse.json({
        success: true,
        data: {
          importId: importResult.id,
          alreadyExists: true,
          accountId: parsedData.accountId,
          accountName: parsedData.accountName,
          stats: existingImport?.stats,
        },
      })
    }

    const importId = importResult.id

    // Insert campaigns in batches
    console.log('[EDITOR-IMPORT] Inserting campaigns...')
    const campaignBatches = chunkArray(parsedData.campaigns, BATCH_SIZE)
    let campaignsInserted = 0

    for (const batch of campaignBatches) {
      await convex.mutation(api.gadsEditorImport.batchInsertCampaigns, {
        campaigns: batch.map((c: ParsedCampaign) => ({
          importId,
          accountId: parsedData.accountId,
          campaignName: c.campaignName,
          labels: c.labels,
          campaignType: c.campaignType,
          networks: c.networks,
          budget: c.budget,
          budgetType: c.budgetType,
          bidStrategyType: c.bidStrategyType,
          bidStrategyName: c.bidStrategyName,
          targetCpa: c.targetCpa,
          targetRoas: c.targetRoas,
          maxCpcBidLimit: c.maxCpcBidLimit,
          startDate: c.startDate,
          endDate: c.endDate,
          adSchedule: c.adSchedule,
          status: c.status,
        })),
      })
      campaignsInserted += batch.length
    }
    console.log(`[EDITOR-IMPORT] Inserted ${campaignsInserted} campaigns`)

    // Update progress
    await convex.mutation(api.gadsEditorImport.updateProgress, {
      importId,
      progress: 25,
      stats: {
        totalRows: parsedData.totalRows,
        campaigns: campaignsInserted,
        adGroups: 0,
        keywords: 0,
        ads: 0,
        processedRows: campaignsInserted,
      },
    })

    // Insert ad groups in batches
    console.log('[EDITOR-IMPORT] Inserting ad groups...')
    const adGroupBatches = chunkArray(parsedData.adGroups, BATCH_SIZE)
    let adGroupsInserted = 0

    for (const batch of adGroupBatches) {
      await convex.mutation(api.gadsEditorImport.batchInsertAdGroups, {
        adGroups: batch.map((ag: ParsedAdGroup) => ({
          importId,
          accountId: parsedData.accountId,
          campaignName: ag.campaignName,
          adGroupName: ag.adGroupName,
          adGroupType: ag.adGroupType,
          maxCpc: ag.maxCpc,
          maxCpm: ag.maxCpm,
          targetCpc: ag.targetCpc,
          targetRoas: ag.targetRoas,
          desktopBidModifier: ag.desktopBidModifier,
          mobileBidModifier: ag.mobileBidModifier,
          tabletBidModifier: ag.tabletBidModifier,
          optimizedTargeting: ag.optimizedTargeting,
          status: ag.status,
        })),
      })
      adGroupsInserted += batch.length

      // Update progress every 1000 ad groups
      if (adGroupsInserted % 1000 === 0) {
        console.log(`[EDITOR-IMPORT] Ad groups progress: ${adGroupsInserted}/${parsedData.adGroups.length}`)
      }
    }
    console.log(`[EDITOR-IMPORT] Inserted ${adGroupsInserted} ad groups`)

    // Update progress
    await convex.mutation(api.gadsEditorImport.updateProgress, {
      importId,
      progress: 50,
      stats: {
        totalRows: parsedData.totalRows,
        campaigns: campaignsInserted,
        adGroups: adGroupsInserted,
        keywords: 0,
        ads: 0,
        processedRows: campaignsInserted + adGroupsInserted,
      },
    })

    // Insert keywords in batches
    console.log('[EDITOR-IMPORT] Inserting keywords...')
    const keywordBatches = chunkArray(parsedData.keywords, BATCH_SIZE)
    let keywordsInserted = 0

    for (const batch of keywordBatches) {
      await convex.mutation(api.gadsEditorImport.batchInsertKeywords, {
        keywords: batch.map((kw: ParsedKeyword) => ({
          importId,
          accountId: parsedData.accountId,
          campaignName: kw.campaignName,
          adGroupName: kw.adGroupName,
          keyword: kw.keyword,
          matchType: kw.matchType,
          firstPageBid: kw.firstPageBid,
          topOfPageBid: kw.topOfPageBid,
          firstPositionBid: kw.firstPositionBid,
          qualityScore: kw.qualityScore,
          landingPageExperience: kw.landingPageExperience,
          expectedCtr: kw.expectedCtr,
          adRelevance: kw.adRelevance,
          status: kw.status,
        })),
      })
      keywordsInserted += batch.length

      // Update progress every 5000 keywords
      if (keywordsInserted % 5000 === 0) {
        console.log(`[EDITOR-IMPORT] Keywords progress: ${keywordsInserted}/${parsedData.keywords.length}`)
      }
    }
    console.log(`[EDITOR-IMPORT] Inserted ${keywordsInserted} keywords`)

    // Update progress
    await convex.mutation(api.gadsEditorImport.updateProgress, {
      importId,
      progress: 75,
      stats: {
        totalRows: parsedData.totalRows,
        campaigns: campaignsInserted,
        adGroups: adGroupsInserted,
        keywords: keywordsInserted,
        ads: 0,
        processedRows: campaignsInserted + adGroupsInserted + keywordsInserted,
      },
    })

    // Insert ads in batches
    console.log('[EDITOR-IMPORT] Inserting ads...')
    const adBatches = chunkArray(parsedData.ads, BATCH_SIZE)
    let adsInserted = 0

    for (const batch of adBatches) {
      await convex.mutation(api.gadsEditorImport.batchInsertAds, {
        ads: batch.map((ad: ParsedAd) => ({
          importId,
          accountId: parsedData.accountId,
          campaignName: ad.campaignName,
          adGroupName: ad.adGroupName,
          adType: ad.adType,
          finalUrl: ad.finalUrl,
          headlines: ad.headlines,
          descriptions: ad.descriptions,
          path1: ad.path1,
          path2: ad.path2,
          status: ad.status,
          approvalStatus: ad.approvalStatus,
          adStrength: ad.adStrength,
        })),
      })
      adsInserted += batch.length
    }
    console.log(`[EDITOR-IMPORT] Inserted ${adsInserted} ads`)

    // Mark import as completed
    await convex.mutation(api.gadsEditorImport.complete, {
      importId,
      stats: {
        totalRows: parsedData.totalRows,
        campaigns: campaignsInserted,
        adGroups: adGroupsInserted,
        keywords: keywordsInserted,
        ads: adsInserted,
        processedRows: campaignsInserted + adGroupsInserted + keywordsInserted + adsInserted,
      },
    })

    console.log('[EDITOR-IMPORT] Import completed successfully!')

    return NextResponse.json({
      success: true,
      data: {
        importId,
        accountId: parsedData.accountId,
        accountName: parsedData.accountName,
        stats: {
          totalRows: parsedData.totalRows,
          campaigns: campaignsInserted,
          adGroups: adGroupsInserted,
          keywords: keywordsInserted,
          ads: adsInserted,
        },
      },
    })
  } catch (error) {
    console.error('[EDITOR-IMPORT] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during import',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/gads/editor-import
 *
 * Get import status or list of imports
 *
 * Query params:
 * - importId: Get specific import status
 * - limit: Max number of imports to return (default: 10)
 */
export async function GET(request: NextRequest) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    return NextResponse.json(
      { success: false, error: 'Convex URL not configured' },
      { status: 500 }
    )
  }

  const convex = new ConvexHttpClient(convexUrl)
  const { searchParams } = new URL(request.url)
  const importId = searchParams.get('importId')
  const limit = parseInt(searchParams.get('limit') || '10', 10)

  try {
    if (importId) {
      // Get specific import
      const importData = await convex.query(api.gadsEditorImport.get, {
        importId: importId as any, // Trust the ID from query param
      })

      if (!importData) {
        return NextResponse.json(
          { success: false, error: 'Import not found' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        success: true,
        data: importData,
      })
    } else {
      // List all imports
      const imports = await convex.query(api.gadsEditorImport.list, { limit })

      return NextResponse.json({
        success: true,
        data: imports,
      })
    }
  } catch (error) {
    console.error('[EDITOR-IMPORT] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch imports',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/gads/editor-import
 *
 * Delete an import and all related data
 *
 * Query params:
 * - importId: Import to delete (required)
 */
export async function DELETE(request: NextRequest) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    return NextResponse.json(
      { success: false, error: 'Convex URL not configured' },
      { status: 500 }
    )
  }

  const convex = new ConvexHttpClient(convexUrl)
  const { searchParams } = new URL(request.url)
  const importId = searchParams.get('importId')

  if (!importId) {
    return NextResponse.json(
      { success: false, error: 'importId is required' },
      { status: 400 }
    )
  }

  try {
    await convex.mutation(api.gadsEditorImport.deleteImport, {
      importId: importId as any,
    })

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    })
  } catch (error) {
    console.error('[EDITOR-IMPORT] Delete error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete import',
      },
      { status: 500 }
    )
  }
}

// Helper function to chunk an array into batches
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}
