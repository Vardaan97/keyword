import { NextRequest, NextResponse } from 'next/server'
import { parseGadsEditorCsv, importGadsData, isGadsDbConfigured } from '@/lib/gads-knowledge-base'
import { ImportProgress } from '@/types/google-ads-kb'

export const maxDuration = 300  // 5 minutes max for large imports
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  console.log('[GADS-IMPORT] Starting import...')

  if (!isGadsDbConfigured()) {
    return NextResponse.json({
      success: false,
      error: 'Database not configured. Please set SUPABASE environment variables.'
    }, { status: 500 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'No file provided'
      }, { status: 400 })
    }

    console.log(`[GADS-IMPORT] File received: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)

    // Read file content
    const content = await file.text()
    console.log(`[GADS-IMPORT] File read, ${content.length} characters`)

    // Parse CSV
    console.log('[GADS-IMPORT] Parsing CSV...')
    const parsedData = parseGadsEditorCsv(content)

    console.log('[GADS-IMPORT] CSV parsed successfully:')
    console.log(`  - Account: ${parsedData.account.customerId} (${parsedData.account.name})`)
    console.log(`  - Campaigns: ${parsedData.campaigns.size}`)
    console.log(`  - Ad Groups: ${parsedData.adGroups.size}`)
    console.log(`  - Keywords: ${parsedData.keywords.length}`)
    console.log(`  - Geo Targets: ${parsedData.geoTargets.length}`)

    // Import to database
    console.log('[GADS-IMPORT] Importing to database...')

    // Track progress using an object to avoid TypeScript narrowing issues
    const progressTracker: { current: ImportProgress | null } = { current: null }

    const result = await importGadsData(parsedData, (progress) => {
      progressTracker.current = progress
      console.log(`[GADS-IMPORT] Progress: ${progress.phase} - ${progress.processedRows}/${progress.totalRows}`)
    })

    const finalProgress = progressTracker.current

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        progress: finalProgress
      }, { status: 500 })
    }

    const processingTime = finalProgress?.endTime && finalProgress?.startTime
      ? (finalProgress.endTime - finalProgress.startTime) / 1000
      : 0

    console.log('[GADS-IMPORT] Import complete!')
    console.log(`  - Campaigns: ${finalProgress?.campaignsImported || 0}`)
    console.log(`  - Ad Groups: ${finalProgress?.adGroupsImported || 0}`)
    console.log(`  - Keywords: ${finalProgress?.keywordsImported || 0}`)
    console.log(`  - Geo Targets: ${finalProgress?.geoTargetsImported || 0}`)
    console.log(`  - Errors: ${finalProgress?.errors?.length || 0}`)
    console.log(`  - Time: ${processingTime.toFixed(1)}s`)

    return NextResponse.json({
      success: true,
      data: {
        account: parsedData.account,
        imported: {
          campaigns: finalProgress?.campaignsImported || 0,
          adGroups: finalProgress?.adGroupsImported || 0,
          keywords: finalProgress?.keywordsImported || 0,
          geoTargets: finalProgress?.geoTargetsImported || 0
        },
        errors: finalProgress?.errors?.slice(0, 10) || [],
        processingTimeSeconds: processingTime,
        syncLogId: result.syncLogId
      }
    })

  } catch (error) {
    console.error('[GADS-IMPORT] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during import'
    }, { status: 500 })
  }
}
