import { NextRequest, NextResponse } from 'next/server'
import { listLeadForms } from '@/lib/linkedin-api'
import { hasValidLinkedInToken } from '@/lib/linkedin-token-storage'

/**
 * LinkedIn Lead Forms Endpoint
 *
 * Lists all lead gen forms for a given account.
 *
 * GET /api/linkedin/forms?accountUrn=urn:li:sponsoredAccount:123456
 * GET /api/linkedin/forms?accountUrn=urn:li:organization:123456
 *
 * Query Parameters:
 * - accountUrn (required): The sponsored account or organization URN
 * - count (optional): Number of forms to return (default: 50)
 * - start (optional): Pagination start index (default: 0)
 */

export async function GET(request: NextRequest) {
  try {
    // Check if we have a valid token
    const hasToken = await hasValidLinkedInToken()
    if (!hasToken) {
      return NextResponse.json({
        success: false,
        error: 'No LinkedIn access token. Please authorize at /api/auth/linkedin',
      }, { status: 401 })
    }

    // Get parameters
    const accountUrn = request.nextUrl.searchParams.get('accountUrn')
    const countParam = request.nextUrl.searchParams.get('count')
    const startParam = request.nextUrl.searchParams.get('start')

    // Validate account URN
    if (!accountUrn) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameter: accountUrn',
        usage: {
          example: '/api/linkedin/forms?accountUrn=urn:li:sponsoredAccount:123456',
          hint: 'Get your account URN from /api/linkedin/accounts',
        },
      }, { status: 400 })
    }

    // Parse pagination
    const count = countParam ? parseInt(countParam, 10) : 50
    const start = startParam ? parseInt(startParam, 10) : 0

    // Fetch lead forms
    console.log(`[LINKEDIN] Fetching lead forms for: ${accountUrn}`)
    const result = await listLeadForms(accountUrn, { count, start })

    return NextResponse.json({
      success: true,
      data: {
        accountUrn,
        forms: result.forms,
        paging: result.paging,
        usage: {
          getLeads: `/api/linkedin/leads?accountUrn=${encodeURIComponent(accountUrn)}&leadType=SPONSORED`,
          getLeadsForForm: `/api/linkedin/leads?accountUrn=${encodeURIComponent(accountUrn)}&leadType=SPONSORED&formUrn=<formUrn>`,
        },
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[LINKEDIN] Forms error:', message)

    // Check for specific error types
    if (message.includes('403') || message.includes('Forbidden')) {
      return NextResponse.json({
        success: false,
        error: 'Access denied. You may not have permission to view lead forms for this account.',
        suggestion: 'Verify you have the r_marketing_leadgen_automation scope and proper account access.',
      }, { status: 403 })
    }

    return NextResponse.json({
      success: false,
      error: message,
    }, { status: 500 })
  }
}
