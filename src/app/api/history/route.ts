import { NextRequest, NextResponse } from 'next/server'
import { saveAnalysis, getRecentAnalyses, getAnalysis, StoredAnalysis } from '@/lib/mongodb'
import { ApiResponse } from '@/types'

interface SaveHistoryRequest {
  courseId: string
  courseName: string
  courseUrl: string
  vendor?: string
  seedKeywords: { keyword: string; source: string }[]
  rawKeywords: {
    keyword: string
    avgMonthlySearches: number
    competition: string
    competitionIndex: number
    lowTopOfPageBidMicros?: number
    highTopOfPageBidMicros?: number
  }[]
  analyzedKeywords: unknown[]
  dataSource: string
  geoTarget: string
  processingTimeMs: number
}

// GET - Retrieve history
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<StoredAnalysis[]>>> {
  try {
    const { searchParams } = new URL(request.url)
    const courseId = searchParams.get('courseId')
    const limit = parseInt(searchParams.get('limit') || '50')

    console.log('[HISTORY-API] GET request, courseId:', courseId, 'limit:', limit)

    if (courseId) {
      const analysis = await getAnalysis(courseId)
      if (analysis) {
        return NextResponse.json({
          success: true,
          data: [analysis]
        })
      }
      return NextResponse.json({
        success: false,
        error: 'Analysis not found'
      }, { status: 404 })
    }

    const analyses = await getRecentAnalyses(limit)
    console.log('[HISTORY-API] Retrieved', analyses.length, 'analyses')

    return NextResponse.json({
      success: true,
      data: analyses
    })

  } catch (error) {
    console.error('[HISTORY-API] GET Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve history'
    }, { status: 500 })
  }
}

// POST - Save to history
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<{ id: string }>>> {
  try {
    const body: SaveHistoryRequest = await request.json()

    console.log('[HISTORY-API] POST request for:', body.courseName)

    const analysis: Omit<StoredAnalysis, '_id'> = {
      courseId: body.courseId,
      courseName: body.courseName,
      courseUrl: body.courseUrl,
      vendor: body.vendor,
      seedKeywords: body.seedKeywords,
      rawKeywords: body.rawKeywords,
      analyzedKeywords: body.analyzedKeywords as StoredAnalysis['analyzedKeywords'],
      dataSource: body.dataSource,
      geoTarget: body.geoTarget,
      processingTimeMs: body.processingTimeMs,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const id = await saveAnalysis(analysis)

    if (id) {
      return NextResponse.json({
        success: true,
        data: { id }
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to save analysis'
    }, { status: 500 })

  } catch (error) {
    console.error('[HISTORY-API] POST Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save history'
    }, { status: 500 })
  }
}
