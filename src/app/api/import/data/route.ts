import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId') || 'bouquet'
    const type = searchParams.get('type') || 'performance' // 'performance' | 'structure' | 'all'

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      return NextResponse.json({
        success: false,
        error: 'Convex not configured'
      }, { status: 500 })
    }

    const client = new ConvexHttpClient(convexUrl)

    if (type === 'performance') {
      const data = await client.query(api.imports.getImportedPerformance, { accountId })
      return NextResponse.json({
        success: true,
        data
      })
    }

    if (type === 'structure') {
      // Try old system first
      const legacyData = await client.query(api.imports.getAccountStructure, { accountId })

      // If no data, try new gadsEditorImport system
      const data = legacyData || await getStructureFromEditorImport(client)

      return NextResponse.json({
        success: true,
        data
      })
    }

    // Return all
    const [performance, legacyStructure, status] = await Promise.all([
      client.query(api.imports.getImportedPerformance, { accountId }),
      client.query(api.imports.getAccountStructure, { accountId }),
      client.query(api.imports.getImportStatus, {}),
    ])

    // Try new system for structure if legacy is empty
    const structure = legacyStructure || await getStructureFromEditorImport(client)

    return NextResponse.json({
      success: true,
      data: {
        performance,
        structure,
        status,
      }
    })
  } catch (error) {
    console.error('[API] Get imported data error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Helper to get structure data from the new gadsEditorImport system
async function getStructureFromEditorImport(client: ConvexHttpClient) {
  try {
    // Get the latest completed import
    const imports = await client.query(api.gadsEditorImport.list, { limit: 10 })
    const latestImport = imports.find((i: any) => i.status === 'completed')

    if (!latestImport) return null

    // Get summary from the import (it already has counts in stats)
    const stats = latestImport.stats || {}

    // We don't have detailed breakdown, but we can provide the basics
    return {
      accountId: latestImport.accountId,
      accountName: latestImport.accountName,
      importedAt: latestImport.importedAt,
      summary: {
        totalCampaigns: stats.campaigns || 0,
        enabledCampaigns: stats.campaigns || 0, // We don't track enabled vs paused in basic stats
        pausedCampaigns: 0,
        totalAdGroups: stats.adGroups || 0,
        enabledAdGroups: stats.adGroups || 0,
        totalKeywords: stats.keywords || 0,
        enabledKeywords: stats.keywords || 0,
      },
      campaignTypes: [],
      qualityScoreDistribution: null, // Would need to query keywords for this
      topCampaigns: [],
    }
  } catch (error) {
    console.error('[API] Error fetching editor import structure:', error)
    return null
  }
}
