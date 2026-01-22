import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/../convex/_generated/api'

export const maxDuration = 120 // 2 minutes max
export const dynamic = 'force-dynamic'

// Max file size (100MB should be plenty for ad reports)
const MAX_FILE_SIZE = 100 * 1024 * 1024

/**
 * Convert UTF-16 LE buffer to UTF-8 string
 * Google Ads exports are typically UTF-16 LE encoded
 */
function convertUTF16LEToUTF8(buffer: Buffer): string {
  // Check for UTF-16 LE BOM (0xFF 0xFE)
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    // UTF-16 LE with BOM
    return buffer.toString('utf16le').slice(1) // Skip BOM
  }

  // Try UTF-16 LE without BOM
  // If first few chars look like ASCII with null bytes, it's likely UTF-16 LE
  if (buffer.length >= 4 && buffer[1] === 0x00 && buffer[3] === 0x00) {
    return buffer.toString('utf16le')
  }

  // Fall back to UTF-8
  return buffer.toString('utf8')
}

/**
 * Extract country from campaign name
 * Patterns:
 * - "India - Cisco Courses" → "india"
 * - "Australia Popular Courses" → "australia"
 * - "India Tier 1 Popular Courses" → "india"
 * - "USA - Microsoft Courses" → "usa"
 */
function extractCountry(campaignName: string): string | null {
  const normalizedName = campaignName.toLowerCase().trim()

  // Known countries to check for
  const countries = [
    'india', 'australia', 'usa', 'uk', 'uae', 'singapore',
    'malaysia', 'canada', 'germany', 'saudi', 'netherlands',
    'qatar', 'bahrain', 'kuwait', 'oman', 'new zealand'
  ]

  for (const country of countries) {
    if (normalizedName.startsWith(country)) {
      return country
    }
  }

  // Check for country in format "X - Y Courses"
  const dashPattern = /^([a-z\s]+)\s*-\s*/i
  const dashMatch = campaignName.match(dashPattern)
  if (dashMatch) {
    const potentialCountry = dashMatch[1].toLowerCase().trim()
    if (countries.includes(potentialCountry)) {
      return potentialCountry
    }
  }

  return null
}

/**
 * Extract vendor from campaign name
 * Patterns:
 * - "India - Cisco Courses" → "cisco"
 * - "Australia - Microsoft Azure Courses" → "microsoft"
 * - "India Popular Courses" → null (no vendor)
 */
function extractVendor(campaignName: string): string | null {
  const normalizedName = campaignName.toLowerCase()

  // Known vendors to check for
  const vendors = [
    'cisco', 'microsoft', 'aws', 'google', 'oracle', 'vmware',
    'comptia', 'salesforce', 'sap', 'ibm', 'red hat', 'linux',
    'palo alto', 'fortinet', 'checkpoint', 'juniper', 'citrix',
    'servicenow', 'splunk', 'tableau', 'power bi'
  ]

  for (const vendor of vendors) {
    if (normalizedName.includes(vendor)) {
      return vendor
    }
  }

  // Check for " - X Courses" pattern
  const dashPattern = /\s*-\s*([a-z\s]+)\s+courses/i
  const dashMatch = campaignName.match(dashPattern)
  if (dashMatch) {
    const potentialVendor = dashMatch[1].toLowerCase().trim()
    for (const vendor of vendors) {
      if (potentialVendor.includes(vendor)) {
        return vendor
      }
    }
  }

  return null
}

/**
 * Normalize URL for consistent matching
 */
function normalizeUrl(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '')  // Remove protocol
    .replace(/^www\./, '')        // Remove www
    .replace(/\/$/, '')           // Remove trailing slash
    .replace(/\?.*$/, '')         // Remove query params
    .replace(/#.*$/, '')          // Remove hash
}

interface UrlMapping {
  url: string
  campaignName: string
  adGroupName: string
  country: string | null
  vendor: string | null
}

/**
 * Parse Ad Report CSV and extract URL → Campaign → Ad Group mappings
 */
function parseAdReportCSV(content: string): UrlMapping[] {
  const lines = content.split(/\r?\n/)
  const mappings: UrlMapping[] = []
  const seen = new Set<string>()

  // Find the header row (contains "Final URL" and "Campaign")
  let headerIndex = -1
  let finalUrlCol = -1
  let campaignCol = -1
  let adGroupCol = -1

  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i]
    const cols = line.split('\t')

    // Look for header by checking column names
    const finalUrlIdx = cols.findIndex(c => c.toLowerCase().includes('final url'))
    const campaignIdx = cols.findIndex(c => c.toLowerCase() === 'campaign')
    const adGroupIdx = cols.findIndex(c => c.toLowerCase() === 'ad group')

    if (finalUrlIdx !== -1 && campaignIdx !== -1 && adGroupIdx !== -1) {
      headerIndex = i
      finalUrlCol = finalUrlIdx
      campaignCol = campaignIdx
      adGroupCol = adGroupIdx
      console.log(`[AD-REPORT-IMPORT] Found header at line ${i + 1}: Final URL=${finalUrlCol}, Campaign=${campaignCol}, Ad Group=${adGroupCol}`)
      break
    }
  }

  if (headerIndex === -1) {
    throw new Error('Could not find header row. Expected columns: "Final URL", "Campaign", "Ad group"')
  }

  // Parse data rows
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = line.split('\t')
    if (cols.length <= Math.max(finalUrlCol, campaignCol, adGroupCol)) continue

    const url = cols[finalUrlCol]?.trim()
    const campaign = cols[campaignCol]?.trim()
    const adGroup = cols[adGroupCol]?.trim()

    // Skip invalid rows
    if (!url || !campaign || !adGroup) continue
    if (!url.includes('.')) continue  // Must be a valid URL
    if (campaign === '--' || adGroup === '--') continue  // Skip placeholder values

    // Normalize URL
    const normalizedUrl = normalizeUrl(url)

    // Create unique key to deduplicate
    const key = `${normalizedUrl}|${campaign}|${adGroup}`
    if (seen.has(key)) continue
    seen.add(key)

    // Extract country and vendor from campaign name
    const country = extractCountry(campaign)
    const vendor = extractVendor(campaign)

    mappings.push({
      url: normalizedUrl,
      campaignName: campaign,
      adGroupName: adGroup,
      country,
      vendor,
    })
  }

  return mappings
}

/**
 * POST /api/gads/ad-report-import
 *
 * Import Google Ads Ad Report CSV to extract URL → Campaign → Ad Group mappings
 *
 * Body: FormData with:
 * - file: CSV file
 * - accountId: 'flexi' | 'bouquet-inr'
 * - clearExisting: 'true' | 'false' (optional)
 */
export async function POST(request: NextRequest) {
  console.log('[AD-REPORT-IMPORT] Starting import...')

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    return NextResponse.json(
      { success: false, error: 'Convex URL not configured' },
      { status: 500 }
    )
  }

  const convex = new ConvexHttpClient(convexUrl)

  try {
    // Check content-length
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` },
        { status: 413 }
      )
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (formError) {
      console.error('[AD-REPORT-IMPORT] FormData parse error:', formError)
      return NextResponse.json(
        { success: false, error: 'Failed to parse upload' },
        { status: 400 }
      )
    }

    const file = formData.get('file') as File | null
    const accountId = formData.get('accountId') as string | null
    const clearExisting = formData.get('clearExisting') === 'true'

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!accountId) {
      return NextResponse.json(
        { success: false, error: 'accountId is required (flexi or bouquet-inr)' },
        { status: 400 }
      )
    }

    if (!['flexi', 'bouquet-inr'].includes(accountId)) {
      return NextResponse.json(
        { success: false, error: 'accountId must be "flexi" or "bouquet-inr"' },
        { status: 400 }
      )
    }

    console.log(`[AD-REPORT-IMPORT] File: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)
    console.log(`[AD-REPORT-IMPORT] Account: ${accountId}, Clear existing: ${clearExisting}`)

    // Read and convert file
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const content = convertUTF16LEToUTF8(buffer)
    console.log(`[AD-REPORT-IMPORT] Converted to ${content.length} characters`)

    // Parse CSV
    console.log('[AD-REPORT-IMPORT] Parsing CSV...')
    const mappings = parseAdReportCSV(content)
    console.log(`[AD-REPORT-IMPORT] Found ${mappings.length} unique URL mappings`)

    if (mappings.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No URL mappings found in CSV. Check column names.' },
        { status: 400 }
      )
    }

    // Get unique counts for logging
    const uniqueUrls = new Set(mappings.map(m => m.url))
    const uniqueCampaigns = new Set(mappings.map(m => m.campaignName))
    const uniqueCountries = new Set(mappings.map(m => m.country).filter(Boolean))

    console.log(`[AD-REPORT-IMPORT] Unique URLs: ${uniqueUrls.size}`)
    console.log(`[AD-REPORT-IMPORT] Unique campaigns: ${uniqueCampaigns.size}`)
    console.log(`[AD-REPORT-IMPORT] Countries found: ${[...uniqueCountries].join(', ')}`)

    // Import to Convex
    console.log('[AD-REPORT-IMPORT] Importing to Convex...')
    const result = await convex.mutation(api.urlAdGroupMappings.bulkImport, {
      accountId,
      mappings: mappings.map(m => ({
        url: m.url,
        campaignName: m.campaignName,
        adGroupName: m.adGroupName,
        country: m.country || undefined,
        vendor: m.vendor || undefined,
      })),
      clearExisting,
    })

    console.log(`[AD-REPORT-IMPORT] Import complete: ${result.inserted} inserted, ${result.skipped} skipped`)

    return NextResponse.json({
      success: true,
      data: {
        accountId,
        totalMappings: mappings.length,
        inserted: result.inserted,
        skipped: result.skipped,
        uniqueUrls: uniqueUrls.size,
        uniqueCampaigns: uniqueCampaigns.size,
        countries: [...uniqueCountries],
      },
    })
  } catch (error) {
    console.error('[AD-REPORT-IMPORT] Error:', error)
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
 * GET /api/gads/ad-report-import
 *
 * Get import summary for all accounts
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

  try {
    const summary = await convex.query(api.urlAdGroupMappings.getSummary, {})

    return NextResponse.json({
      success: true,
      data: summary,
    })
  } catch (error) {
    console.error('[AD-REPORT-IMPORT] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch summary',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/gads/ad-report-import
 *
 * Clear all mappings for an account
 *
 * Query params:
 * - accountId: Account to clear (required)
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
  const accountId = searchParams.get('accountId')

  if (!accountId) {
    return NextResponse.json(
      { success: false, error: 'accountId is required' },
      { status: 400 }
    )
  }

  try {
    const result = await convex.mutation(api.urlAdGroupMappings.clearAccount, {
      accountId,
    })

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[AD-REPORT-IMPORT] Delete error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear account',
      },
      { status: 500 }
    )
  }
}
