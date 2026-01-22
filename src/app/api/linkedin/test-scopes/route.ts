import { NextRequest, NextResponse } from 'next/server'
import { testScope, getAdAccounts } from '@/lib/linkedin-api'
import { hasValidLinkedInToken, getLinkedInTokenStatus } from '@/lib/linkedin-token-storage'

/**
 * LinkedIn Scope Testing Endpoint
 *
 * Tests which API scopes are actually available to the current access token.
 * Makes minimal API calls to verify each scope.
 *
 * GET /api/linkedin/test-scopes
 * GET /api/linkedin/test-scopes?accountUrn=urn:li:sponsoredAccount:123456
 */

// OpenID Connect scopes (Standard Tier - Active)
const OPENID_SCOPES = [
  {
    scope: 'openid',
    description: 'OpenID Connect user identification',
    required: false,
    category: 'OpenID Connect',
  },
  {
    scope: 'profile',
    description: 'Basic profile info (name, picture)',
    required: false,
    category: 'OpenID Connect',
  },
  {
    scope: 'email',
    description: 'Email address access',
    required: false,
    category: 'OpenID Connect',
  },
]

// Share on LinkedIn (Default Tier - Active)
const SHARE_SCOPES = [
  {
    scope: 'w_member_social',
    description: 'Share/post on LinkedIn',
    required: false,
    category: 'Share on LinkedIn',
  },
]

// Advertising API scopes (Development Tier - Active)
const ADVERTISING_SCOPES = [
  {
    scope: 'r_ads',
    description: 'Read ad accounts and campaigns',
    required: false,
    category: 'Advertising API',
  },
]

// Events Management API (Standard Tier - Active)
const EVENTS_SCOPES = [
  {
    scope: 'r_events',
    description: 'Read organization events',
    required: false,
    category: 'Events Management API',
  },
]

// Verified on LinkedIn (Development Tier - Active)
const VERIFIED_SCOPES = [
  {
    scope: 'r_verify',
    description: 'Member verification status',
    required: false,
    category: 'Verified on LinkedIn',
  },
]

// Lead Sync API (Pending approval)
const LEADSYNC_SCOPES = [
  {
    scope: 'r_marketing_leadgen_automation',
    description: 'Lead Gen Forms and Lead Sync API',
    required: false,
    needsAccountUrn: true,
    category: 'Lead Sync API',
    pending: true,
  },
]

// All scopes to test
const SCOPES_TO_TEST = [
  ...OPENID_SCOPES,
  ...SHARE_SCOPES,
  ...ADVERTISING_SCOPES,
  ...EVENTS_SCOPES,
  ...VERIFIED_SCOPES,
  ...LEADSYNC_SCOPES,
]

export async function GET(request: NextRequest) {
  try {
    // Check if we have a valid token
    const hasToken = await hasValidLinkedInToken()
    if (!hasToken) {
      return NextResponse.json({
        success: false,
        error: 'No LinkedIn access token. Please authorize at /api/auth/linkedin',
        authUrl: '/api/auth/linkedin',
      }, { status: 401 })
    }

    // Get account URN from query params or try to discover one
    let accountUrn = request.nextUrl.searchParams.get('accountUrn')

    // If no URN provided, try to get one from ad accounts
    if (!accountUrn) {
      try {
        const accounts = await getAdAccounts()
        if (accounts.length > 0) {
          accountUrn = accounts[0].urn
          console.log(`[LINKEDIN] Using discovered account URN: ${accountUrn}`)
        }
      } catch {
        // Ignore - will test without URN
      }
    }

    // Test each scope
    const results = await Promise.all(
      SCOPES_TO_TEST.map(async (scopeConfig) => {
        const { scope, description, required, category } = scopeConfig
        const needsAccountUrn = 'needsAccountUrn' in scopeConfig ? Boolean(scopeConfig.needsAccountUrn) : false
        const pending = 'pending' in scopeConfig ? Boolean(scopeConfig.pending) : false
        // Skip URN-dependent scopes if we don't have a URN
        if (needsAccountUrn && !accountUrn) {
          return {
            scope,
            description,
            required,
            category,
            pending,
            status: 'skipped' as const,
            error: 'Need account URN to test (provide ?accountUrn=... or have ad account access)',
          }
        }

        const result = await testScope(scope, accountUrn || undefined)

        return {
          ...result,
          scope,
          description,
          required,
          category,
          pending,
        }
      })
    )

    // Calculate summary
    const granted = results.filter((r) => r.status === 'granted').length
    const denied = results.filter((r) => r.status === 'denied').length
    const skipped = results.filter((r) => r.status === 'skipped').length

    // Get token status
    const tokenStatus = await getLinkedInTokenStatus()

    return NextResponse.json({
      success: true,
      data: {
        scopes: results,
        summary: {
          granted,
          denied,
          skipped,
          total: SCOPES_TO_TEST.length,
        },
        accountUrnUsed: accountUrn,
        tokenStatus: {
          source: tokenStatus.source,
          expiresAt: tokenStatus.expiresAt,
          isExpired: tokenStatus.isExpired,
          lastVerified: tokenStatus.lastVerified,
        },
        recommendations: generateRecommendations(results),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[LINKEDIN] Scope test error:', message)

    return NextResponse.json({
      success: false,
      error: message,
    }, { status: 500 })
  }
}

function generateRecommendations(
  results: Array<{
    scope: string
    status: string
    required?: boolean
    error?: string
    category?: string
    pending?: boolean
  }>
): string[] {
  const recommendations: string[] = []

  // Check OpenID Connect scopes
  const openidResults = results.filter((r) => r.category === 'OpenID Connect')
  const openidGranted = openidResults.filter((r) => r.status === 'granted')
  if (openidGranted.length === openidResults.length && openidResults.length > 0) {
    recommendations.push('✅ OpenID Connect: All scopes working - you can get user profile and email')
  } else if (openidGranted.length > 0) {
    recommendations.push(`OpenID Connect: ${openidGranted.length}/${openidResults.length} scopes granted`)
  }

  // Check Share on LinkedIn
  const shareResult = results.find((r) => r.scope === 'w_member_social')
  if (shareResult?.status === 'granted') {
    recommendations.push('✅ Share on LinkedIn: You can post content on behalf of users')
  }

  // Check for pending API access
  const pendingApis = results.filter((r) => r.pending && r.status === 'denied')
  if (pendingApis.length > 0) {
    const pendingNames = [...new Set(pendingApis.map((r) => r.category))].filter(Boolean)
    recommendations.push(
      `⏳ Pending approval: ${pendingNames.join(', ')}. Check your LinkedIn Developer App for status.`
    )
  }

  // Check for lead sync access
  const leadSyncResult = results.find((r) => r.scope === 'r_marketing_leadgen_automation')
  if (leadSyncResult?.status === 'granted') {
    recommendations.push('✅ Lead Sync API: You can fetch lead gen form submissions')
  } else if (leadSyncResult?.status === 'skipped') {
    recommendations.push('Lead Sync API: Need an account URN to test. Get one from /api/linkedin/accounts')
  }

  // Check Advertising API
  const adsResult = results.find((r) => r.scope === 'r_ads')
  if (adsResult?.status === 'granted') {
    recommendations.push('✅ Advertising API: You can read ad accounts and campaigns')
  }

  // Check for expired token
  const tokenExpired = results.some(
    (r) => r.error?.includes('expired') || r.error?.includes('Unauthorized')
  )
  if (tokenExpired) {
    recommendations.push('⚠️ Access token may be expired. Re-authorize at /api/auth/linkedin')
  }

  if (recommendations.length === 0) {
    recommendations.push('No scopes were granted. Please re-authorize at /api/auth/linkedin')
  }

  return recommendations
}
