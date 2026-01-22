import { NextResponse } from 'next/server'
import { getAdAccounts, getOrganizations, getProfile, getEmail } from '@/lib/linkedin-api'
import { hasValidLinkedInToken } from '@/lib/linkedin-token-storage'

/**
 * LinkedIn Account Discovery Endpoint
 *
 * Discovers all ad accounts and organizations the user has access to.
 * Returns URNs that can be used for lead form queries.
 *
 * GET /api/linkedin/accounts
 */

export async function GET() {
  try {
    // Check if we have a valid token
    const hasToken = await hasValidLinkedInToken()
    if (!hasToken) {
      return NextResponse.json({
        success: false,
        error: 'No LinkedIn access token. Please authorize at /api/auth/linkedin',
      }, { status: 401 })
    }

    // Get user profile first
    let profile: { name?: string; email?: string } = {}
    try {
      const profileData = await getProfile()
      const firstName = profileData.localizedFirstName || ''
      const lastName = profileData.localizedLastName || ''
      profile.name = `${firstName} ${lastName}`.trim()

      const email = await getEmail()
      if (email) profile.email = email
    } catch {
      // Profile is optional
    }

    // Get ad accounts
    let adAccounts: Array<{
      urn: string
      id: string
      name: string
      status: string
      type: string
      currency?: string
    }> = []
    let adAccountsError: string | undefined

    try {
      adAccounts = await getAdAccounts()
    } catch (error) {
      adAccountsError = error instanceof Error ? error.message : 'Failed to fetch ad accounts'
      console.error('[LINKEDIN] Ad accounts error:', adAccountsError)
    }

    // Get organizations
    let organizations: Array<{
      urn: string
      id: string
      name: string
    }> = []
    let organizationsError: string | undefined

    try {
      organizations = await getOrganizations()
    } catch (error) {
      organizationsError = error instanceof Error ? error.message : 'Failed to fetch organizations'
      console.error('[LINKEDIN] Organizations error:', organizationsError)
    }

    return NextResponse.json({
      success: true,
      data: {
        profile,
        adAccounts: {
          items: adAccounts,
          count: adAccounts.length,
          error: adAccountsError,
        },
        organizations: {
          items: organizations,
          count: organizations.length,
          error: organizationsError,
        },
        usage: {
          note: 'Use the URN values to query lead forms and leads',
          examples: {
            leadForms: '/api/linkedin/forms?accountUrn=urn:li:sponsoredAccount:123456',
            leads: '/api/linkedin/leads?accountUrn=urn:li:sponsoredAccount:123456&leadType=SPONSORED',
          },
        },
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[LINKEDIN] Accounts error:', message)

    return NextResponse.json({
      success: false,
      error: message,
    }, { status: 500 })
  }
}
