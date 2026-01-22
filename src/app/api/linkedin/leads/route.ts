import { NextRequest, NextResponse } from 'next/server'
import { getLeadResponses } from '@/lib/linkedin-api'
import { hasValidLinkedInToken } from '@/lib/linkedin-token-storage'

/**
 * LinkedIn Leads Endpoint
 *
 * Fetches lead submissions from lead gen forms with parsed contact info.
 *
 * GET /api/linkedin/leads?accountUrn=urn:li:sponsoredAccount:123456&leadType=SPONSORED
 *
 * Query Parameters:
 * - accountUrn (required): The sponsored account or organization URN
 * - leadType (required): SPONSORED | EVENT | COMPANY | ORGANIZATION_PRODUCT
 * - formUrn (optional): Filter by specific form URN
 * - count (optional): Number of leads to return (default: 100)
 * - start (optional): Pagination start index (default: 0)
 * - testOnly (optional): Set to 'true' to only fetch test leads
 */

const VALID_LEAD_TYPES = ['SPONSORED', 'EVENT', 'COMPANY', 'ORGANIZATION_PRODUCT'] as const
type LeadType = typeof VALID_LEAD_TYPES[number]

// Known question ID mappings for lead forms
// These map LinkedIn question IDs to standardized field names
const QUESTION_ID_MAPPINGS: Record<string, string> = {
  // Koenig's lead forms (account 517988166)
  '20695778492': 'firstName',
  '20695781980': 'lastName',
  '20695776444': 'personalEmail',
  '20695775660': 'email',
  '20695771820': 'phone',
  '20695781972': 'company',
  '20695776188': 'jobTitle',
  '20695777676': 'linkedinProfileUrl',
  '20695780404': 'city',
  '20695776180': 'country',

  // Vardaan's ad account lead forms (account 514911918)
  '20682142996': 'email',
  '20682148244': 'firstName',
  '20682145660': 'lastName',
  '20682148236': 'company',
}

interface AnswerDetails {
  textQuestionAnswer?: { answer: string }
  singleSelectQuestionAnswer?: { answer: string }
  multiSelectQuestionAnswer?: { answers: string[] }
}

interface LeadAnswer {
  questionId: number | string
  answerDetails?: AnswerDetails
  answer?: string
  fieldType?: string
}

// Parse lead answers and extract contact fields
function parseLeadAnswers(answers: LeadAnswer[]) {
  const fields: Record<string, string> = {}
  const customAnswers: Array<{ questionId: string; answer: string }> = []

  for (const ans of answers) {
    // Extract the actual answer value from nested structure
    let value = ''
    if (ans.answerDetails) {
      if (ans.answerDetails.textQuestionAnswer) {
        value = ans.answerDetails.textQuestionAnswer.answer || ''
      } else if (ans.answerDetails.singleSelectQuestionAnswer) {
        value = ans.answerDetails.singleSelectQuestionAnswer.answer || ''
      } else if (ans.answerDetails.multiSelectQuestionAnswer) {
        value = ans.answerDetails.multiSelectQuestionAnswer.answers?.join(', ') || ''
      }
    } else if (ans.answer) {
      value = ans.answer
    }

    const questionId = String(ans.questionId)

    // Try to map using known question ID mappings
    const mappedField = QUESTION_ID_MAPPINGS[questionId]
    if (mappedField && mappedField !== 'personalEmail') {
      fields[mappedField] = value
    } else {
      customAnswers.push({ questionId, answer: value })
    }
  }

  return { fields, customAnswers }
}

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
    const leadTypeParam = request.nextUrl.searchParams.get('leadType')
    const formUrn = request.nextUrl.searchParams.get('formUrn')
    const countParam = request.nextUrl.searchParams.get('count')
    const startParam = request.nextUrl.searchParams.get('start')
    const testOnly = request.nextUrl.searchParams.get('testOnly') === 'true'

    // Validate account URN
    if (!accountUrn) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameter: accountUrn',
        usage: {
          example: '/api/linkedin/leads?accountUrn=urn:li:sponsoredAccount:123456&leadType=SPONSORED',
          hint: 'Get your account URN from /api/linkedin/accounts',
        },
      }, { status: 400 })
    }

    // Validate lead type
    if (!leadTypeParam) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameter: leadType',
        validValues: VALID_LEAD_TYPES,
        example: '/api/linkedin/leads?accountUrn=urn:li:sponsoredAccount:123456&leadType=SPONSORED',
      }, { status: 400 })
    }

    const leadType = leadTypeParam.toUpperCase() as LeadType
    if (!VALID_LEAD_TYPES.includes(leadType)) {
      return NextResponse.json({
        success: false,
        error: `Invalid leadType: ${leadTypeParam}`,
        validValues: VALID_LEAD_TYPES,
      }, { status: 400 })
    }

    // Parse pagination
    const count = countParam ? parseInt(countParam, 10) : 100
    const start = startParam ? parseInt(startParam, 10) : 0

    // Fetch leads
    console.log(`[LINKEDIN] Fetching leads for: ${accountUrn}, type: ${leadType}`)
    const result = await getLeadResponses(accountUrn, leadType, {
      formUrn: formUrn || undefined,
      count,
      start,
      testLeadsOnly: testOnly,
    })

    // Parse leads to extract contact information
    const parsedLeads = result.leads.map((lead: {
      id: string
      formId: string
      submittedAt: string
      answers: LeadAnswer[]
    }) => {
      const { fields, customAnswers } = parseLeadAnswers(lead.answers || [])

      return {
        id: lead.id,
        formId: lead.formId,
        submittedAt: lead.submittedAt,

        // Parsed contact fields
        firstName: fields.firstName || '',
        lastName: fields.lastName || '',
        email: fields.email || '',
        phone: fields.phone || '',
        company: fields.company || '',
        jobTitle: fields.jobTitle || '',
        linkedinProfileUrl: fields.linkedinProfileUrl || '',
        city: fields.city || '',
        country: fields.country || '',

        // Full name for convenience
        fullName: [fields.firstName, fields.lastName].filter(Boolean).join(' ') || 'Unknown',

        // Raw answers (for debugging or custom fields)
        rawAnswers: lead.answers,
        customAnswers,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        accountUrn,
        leadType,
        formUrn: formUrn || 'all',
        testLeadsOnly: testOnly,
        leads: parsedLeads,
        paging: result.paging,
        summary: {
          count: parsedLeads.length,
          total: result.paging.total,
        },
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[LINKEDIN] Leads error:', message)

    // Check for specific error types
    if (message.includes('403') || message.includes('Forbidden')) {
      return NextResponse.json({
        success: false,
        error: 'Access denied. You may not have permission to view leads for this account.',
        suggestions: [
          'Verify you have the r_marketing_leadgen_automation scope',
          'Check that your account has Lead Sync API access approved',
          'Ensure you have the right role on the ad account (ACCOUNT_MANAGER, etc.)',
        ],
      }, { status: 403 })
    }

    return NextResponse.json({
      success: false,
      error: message,
    }, { status: 500 })
  }
}
