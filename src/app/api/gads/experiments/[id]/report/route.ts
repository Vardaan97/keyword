import { NextRequest, NextResponse } from 'next/server'
import {
  generateExperimentReport,
  formatReportAsText,
  formatReportAsHTML,
} from '@/lib/google-ads-experiment-report'
import { getDefaultCustomerId } from '@/lib/google-ads'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/gads/experiments/[id]/report
 *
 * Generate a report for a specific experiment
 *
 * Query params:
 * - customerId: Google Ads customer ID (optional, defaults to env)
 * - format: 'json' | 'text' | 'html' (default: json)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: experimentId } = await params
    const { searchParams } = new URL(request.url)

    const customerId = searchParams.get('customerId') || getDefaultCustomerId()
    const format = searchParams.get('format') || 'json'

    console.log(`[API/GADS/EXPERIMENTS/REPORT] Generating report for ${experimentId}...`)
    console.log(`[API/GADS/EXPERIMENTS/REPORT] Customer ID: ${customerId}`)
    console.log(`[API/GADS/EXPERIMENTS/REPORT] Format: ${format}`)

    // Generate the report
    const report = await generateExperimentReport(customerId, experimentId)

    // Return in requested format
    if (format === 'text') {
      const textReport = formatReportAsText(report)
      return new NextResponse(textReport, {
        headers: {
          'Content-Type': 'text/plain',
        },
      })
    }

    if (format === 'html') {
      const htmlReport = formatReportAsHTML(report)
      return new NextResponse(htmlReport, {
        headers: {
          'Content-Type': 'text/html',
        },
      })
    }

    // Default: JSON
    return NextResponse.json({
      success: true,
      data: {
        report,
        textReport: formatReportAsText(report),
      },
    })
  } catch (error) {
    console.error('[API/GADS/EXPERIMENTS/REPORT] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate report',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/gads/experiments/[id]/report
 *
 * Get a previously generated report (from Convex cache if available)
 * Falls back to generating a new report if not cached
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: experimentId } = await params
    const { searchParams } = new URL(request.url)

    const customerId = searchParams.get('customerId') || getDefaultCustomerId()
    const format = searchParams.get('format') || 'json'

    // TODO: Check Convex for cached report first
    // For now, generate fresh report

    console.log(`[API/GADS/EXPERIMENTS/REPORT] Fetching/generating report for ${experimentId}...`)

    const report = await generateExperimentReport(customerId, experimentId)

    if (format === 'text') {
      return new NextResponse(formatReportAsText(report), {
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    if (format === 'html') {
      return new NextResponse(formatReportAsHTML(report), {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    return NextResponse.json({
      success: true,
      data: { report },
    })
  } catch (error) {
    console.error('[API/GADS/EXPERIMENTS/REPORT] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get report',
      },
      { status: 500 }
    )
  }
}
