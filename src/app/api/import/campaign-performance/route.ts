import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'

export const dynamic = 'force-dynamic'

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
  // Remove commas and percentage signs
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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const accountId = formData.get('accountId') as string || 'bouquet'
    const accountName = formData.get('accountName') as string || 'Bouquet INR'

    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'No file provided'
      }, { status: 400 })
    }

    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())

    // First line is title (e.g., "Campaign performance")
    // Second line is date range
    // Third line is headers
    // Rest is data

    if (lines.length < 4) {
      return NextResponse.json({
        success: false,
        error: 'Invalid CSV format - not enough lines'
      }, { status: 400 })
    }

    const dateRange = lines[1].replace(/"/g, '')
    const headers = parseCSVLine(lines[2])

    // Map header indices
    const headerMap: Record<string, number> = {}
    headers.forEach((h, i) => {
      headerMap[h.toLowerCase()] = i
    })

    const campaigns: ParsedCampaign[] = []

    for (let i = 3; i < lines.length; i++) {
      const values = parseCSVLine(lines[i])
      if (values.length < 5) continue // Skip invalid lines

      const campaignName = values[headerMap['campaign']] || ''
      const status = values[headerMap['campaign state']] || 'Unknown'

      // Skip removed campaigns
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

    // Import to Convex
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      return NextResponse.json({
        success: false,
        error: 'Convex not configured'
      }, { status: 500 })
    }

    const client = new ConvexHttpClient(convexUrl)
    const result = await client.mutation(api.imports.importCampaignPerformance, {
      accountId,
      accountName,
      dateRange,
      campaigns,
    })

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        dateRange,
        sampleCampaigns: campaigns.slice(0, 5).map(c => ({
          name: c.campaignName,
          type: c.campaignType,
          clicks: c.clicks,
          cost: c.cost,
        })),
      }
    })
  } catch (error) {
    console.error('[API] Import error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// GET endpoint to check import status
export async function GET() {
  try {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      return NextResponse.json({
        success: false,
        error: 'Convex not configured'
      }, { status: 500 })
    }

    const client = new ConvexHttpClient(convexUrl)
    const status = await client.query(api.imports.getImportStatus, {})

    return NextResponse.json({
      success: true,
      data: status
    })
  } catch (error) {
    console.error('[API] Import status error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
