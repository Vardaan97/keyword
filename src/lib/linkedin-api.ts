/**
 * LinkedIn API Client
 *
 * Provides functions to interact with LinkedIn Marketing API
 * for lead generation and account management.
 */

import { getLinkedInAccessToken, markLinkedInTokenVerified } from './linkedin-token-storage'

// LinkedIn API version header (YYYYMM format)
// Note: v2 API endpoints don't require this header, but REST API does
// Using 202601 which is the working version for lead gen APIs
const LINKEDIN_API_VERSION = '202601'

// Base URLs
const LINKEDIN_API_BASE = 'https://api.linkedin.com'

interface LinkedInApiOptions {
  accessToken?: string
}

/**
 * Make a request to LinkedIn API with proper headers
 */
async function linkedInFetch(
  endpoint: string,
  options: RequestInit & { accessToken?: string } = {}
): Promise<Response> {
  const accessToken = options.accessToken || await getLinkedInAccessToken()
  const { accessToken: _, ...fetchOptions } = options

  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  headers.set('X-Restli-Protocol-Version', '2.0.0')

  // Only set Content-Type for non-GET requests (matching curl behavior)
  if (options.method && options.method !== 'GET') {
    headers.set('Content-Type', 'application/json')
  }

  // Determine if this is a REST API endpoint (requires version header)
  const isRestEndpoint = endpoint.includes('/rest/')

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${LINKEDIN_API_BASE}${endpoint}`

  // Only set version header for REST API endpoints
  if (isRestEndpoint) {
    headers.set('LinkedIn-Version', LINKEDIN_API_VERSION)
  }

  console.log(`[LINKEDIN-API] ${options.method || 'GET'} ${url}`)
  console.log(`[LINKEDIN-API] Token prefix: ${accessToken.substring(0, 20)}...`)

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  })

  if (response.ok) {
    await markLinkedInTokenVerified()
  }

  return response
}

/**
 * Get user info via OpenID Connect (preferred method)
 * Requires: openid, profile, email scopes
 */
export async function getUserInfo(options?: LinkedInApiOptions): Promise<{
  sub: string
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
  email?: string
  email_verified?: boolean
  locale?: string
}> {
  const response = await linkedInFetch('/v2/userinfo', {
    accessToken: options?.accessToken,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Failed to get user info: ${error.message || response.statusText}`)
  }

  return response.json()
}

/**
 * Get user profile
 * Uses OpenID Connect userinfo endpoint (works with openid, profile scopes)
 * Falls back to legacy /v2/me if userinfo fails
 */
export async function getProfile(options?: LinkedInApiOptions): Promise<{
  id: string
  firstName?: string
  lastName?: string
  localizedFirstName?: string
  localizedLastName?: string
}> {
  // Try OpenID Connect userinfo first (preferred)
  try {
    const userInfo = await getUserInfo(options)
    return {
      id: userInfo.sub,
      firstName: userInfo.given_name,
      lastName: userInfo.family_name,
      localizedFirstName: userInfo.given_name,
      localizedLastName: userInfo.family_name,
    }
  } catch {
    // Fall back to legacy /v2/me endpoint
    const response = await linkedInFetch('/v2/me', {
      accessToken: options?.accessToken,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(`Failed to get profile: ${error.message || response.statusText}`)
    }

    return response.json()
  }
}

/**
 * Get user email (legacy v2 API)
 * Requires: r_emailaddress scope (legacy)
 */
export async function getEmail(options?: LinkedInApiOptions): Promise<string | null> {
  const response = await linkedInFetch(
    '/v2/emailAddress?q=members&projection=(elements*(handle~))',
    { accessToken: options?.accessToken }
  )

  if (!response.ok) {
    return null
  }

  const data = await response.json()
  return data.elements?.[0]?.['handle~']?.emailAddress || null
}

/**
 * Get ad accounts for the user
 * Uses v2 API (works with Development Tier)
 */
export async function getAdAccounts(options?: LinkedInApiOptions): Promise<Array<{
  urn: string
  id: string
  name: string
  status: string
  type: string
  currency?: string
}>> {
  // Use v2 API which works with Development Tier
  const response = await linkedInFetch(
    '/v2/adAccountsV2?q=search&count=100',
    { accessToken: options?.accessToken }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Failed to get ad accounts: ${error.message || response.statusText}`)
  }

  const data = await response.json()
  return (data.elements || []).map((account: Record<string, unknown>) => ({
    urn: `urn:li:sponsoredAccount:${account.id}`,
    id: String(account.id),
    name: String(account.name || 'Unnamed Account'),
    status: String(account.status || 'UNKNOWN'),
    type: String(account.type || 'UNKNOWN'),
    currency: account.currency ? String(account.currency) : undefined,
  }))
}

/**
 * Get organizations where the user is an admin
 */
export async function getOrganizations(options?: LinkedInApiOptions): Promise<Array<{
  urn: string
  id: string
  name: string
}>> {
  // First get organization roles
  const rolesResponse = await linkedInFetch(
    '/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&count=100',
    { accessToken: options?.accessToken }
  )

  if (!rolesResponse.ok) {
    // User may not have admin access to any organizations
    return []
  }

  const rolesData = await rolesResponse.json()
  const orgUrns = (rolesData.elements || [])
    .map((el: Record<string, string>) => el.organization)
    .filter(Boolean)

  if (orgUrns.length === 0) {
    return []
  }

  // Fetch organization details
  const organizations: Array<{ urn: string; id: string; name: string }> = []

  for (const urn of orgUrns.slice(0, 10)) {
    // Limit to first 10
    try {
      const orgId = urn.split(':').pop()
      const orgResponse = await linkedInFetch(`/v2/organizations/${orgId}`, {
        accessToken: options?.accessToken,
      })

      if (orgResponse.ok) {
        const org = await orgResponse.json()
        organizations.push({
          urn,
          id: String(orgId),
          name: org.localizedName || org.name || 'Unnamed Organization',
        })
      }
    } catch {
      // Skip failed org lookups
    }
  }

  return organizations
}

/**
 * List lead gen forms for an account
 */
export async function listLeadForms(
  ownerUrn: string,
  options?: LinkedInApiOptions & { count?: number; start?: number }
): Promise<{
  forms: Array<{
    id: string
    urn: string
    name: string
    status: string
    createdAt?: string
  }>
  paging: { start: number; count: number; total?: number }
}> {
  const count = options?.count || 50
  const start = options?.start || 0

  // Format owner parameter in LinkedIn's expected format: (sponsoredAccount:urn%3Ali%3AsponsoredAccount%3A123)
  const encodedUrn = ownerUrn.replace(/:/g, '%3A')
  const ownerParam = ownerUrn.includes('sponsoredAccount')
    ? `(sponsoredAccount:${encodedUrn})`
    : `(organization:${encodedUrn})`

  const response = await linkedInFetch(
    `/rest/leadForms?q=owner&owner=${ownerParam}&count=${count}&start=${start}`,
    { accessToken: options?.accessToken }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Failed to list lead forms: ${error.message || response.statusText}`)
  }

  const data = await response.json()

  return {
    forms: (data.elements || []).map((form: Record<string, unknown>) => ({
      id: String(form.id || ''),
      urn: form.leadGenFormUrn || `urn:li:leadGenForm:${form.id}`,
      name: String(form.name || 'Unnamed Form'),
      status: String(form.status || 'UNKNOWN'),
      createdAt: form.createdAt ? new Date(Number(form.createdAt)).toISOString() : undefined,
    })),
    paging: {
      start: data.paging?.start || start,
      count: data.paging?.count || count,
      total: data.paging?.total,
    },
  }
}

/**
 * Get lead responses (actual leads) from forms
 */
export async function getLeadResponses(
  ownerUrn: string,
  leadType: 'SPONSORED' | 'EVENT' | 'COMPANY' | 'ORGANIZATION_PRODUCT' = 'SPONSORED',
  options?: LinkedInApiOptions & {
    formUrn?: string
    count?: number
    start?: number
    testLeadsOnly?: boolean
  }
): Promise<{
  leads: Array<{
    id: string
    formId: string
    submittedAt: string
    answers: Array<{
      questionId: string
      answer: string
    }>
  }>
  paging: { start: number; count: number; total?: number }
}> {
  const count = options?.count || 100
  const start = options?.start || 0
  const testLeadsOnly = options?.testLeadsOnly || false

  // Format parameters in LinkedIn's expected format
  const encodedUrn = ownerUrn.replace(/:/g, '%3A')
  const ownerParam = ownerUrn.includes('sponsoredAccount')
    ? `(sponsoredAccount:${encodedUrn})`
    : `(organization:${encodedUrn})`
  const leadTypeParam = `(leadType:${leadType})`

  let url = `/rest/leadFormResponses?q=owner&owner=${ownerParam}&leadType=${leadTypeParam}&limitedToTestLeads=${testLeadsOnly}&count=${count}&start=${start}`

  if (options?.formUrn) {
    url += `&versionedLeadGenFormUrn=${encodeURIComponent(options.formUrn)}`
  }

  const response = await linkedInFetch(url, { accessToken: options?.accessToken })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(`Failed to get lead responses: ${error.message || response.statusText}`)
  }

  const data = await response.json()

  return {
    leads: (data.elements || []).map((lead: Record<string, unknown>) => {
      // LinkedIn puts answers under formResponse.answers, not directly on the lead
      const formResponse = lead.formResponse as { answers?: Array<Record<string, unknown>> } | undefined
      const rawAnswers = formResponse?.answers || lead.answers as Array<Record<string, unknown>> || []

      // Preserve full answer structure including answerDetails
      const answers = rawAnswers.map((a) => ({
        questionId: String(a.questionId || a.fieldId || ''),
        // Preserve the full answerDetails object for proper parsing
        answerDetails: a.answerDetails as {
          textQuestionAnswer?: { answer: string }
          singleSelectQuestionAnswer?: { answer: string }
          multiSelectQuestionAnswer?: { answers: string[] }
        } | undefined,
        answer: a.answer ? String(a.answer) : undefined,
        fieldType: a.fieldType ? String(a.fieldType) : undefined,
      }))

      return {
        id: String(lead.id || lead.leadId || ''),
        formId: String(lead.leadGenFormId || lead.versionedLeadGenFormUrn || ''),
        submittedAt: lead.submittedAt
          ? new Date(Number(lead.submittedAt)).toISOString()
          : new Date().toISOString(),
        answers,
      }
    }),
    paging: {
      start: data.paging?.start || start,
      count: data.paging?.count || count,
      total: data.paging?.total,
    },
  }
}

/**
 * Test a specific API scope
 */
export async function testScope(
  scope: string,
  ownerUrn?: string,
  options?: LinkedInApiOptions
): Promise<{
  scope: string
  status: 'granted' | 'denied' | 'unknown'
  result?: string
  error?: string
}> {
  try {
    let endpoint: string

    switch (scope) {
      // OpenID Connect scopes (new)
      case 'openid':
      case 'profile':
      case 'email':
        // All three are tested via /v2/userinfo endpoint
        endpoint = '/v2/userinfo'
        const userInfoResp = await linkedInFetch(endpoint, options)
        if (userInfoResp.ok) {
          const data = await userInfoResp.json()
          if (scope === 'openid') {
            return { scope, status: 'granted', result: `User ID: ${data.sub}` }
          } else if (scope === 'profile') {
            const name = data.name || `${data.given_name || ''} ${data.family_name || ''}`.trim()
            return { scope, status: 'granted', result: name || 'Profile accessible' }
          } else if (scope === 'email') {
            return { scope, status: 'granted', result: data.email || 'Email accessible' }
          }
        }
        throw new Error(userInfoResp.statusText)

      // Share on LinkedIn scope
      case 'w_member_social':
        // This scope allows posting - we just verify the token works
        // We can't easily test without actually posting, so just verify the token is valid
        endpoint = '/v2/userinfo'
        const socialResp = await linkedInFetch(endpoint, options)
        if (socialResp.ok) {
          return { scope, status: 'granted', result: 'Posting permissions granted' }
        }
        throw new Error(socialResp.statusText)

      // Legacy scopes
      case 'r_liteprofile':
        endpoint = '/v2/me'
        const profile = await linkedInFetch(endpoint, options)
        if (profile.ok) {
          const data = await profile.json()
          const name = `${data.localizedFirstName || ''} ${data.localizedLastName || ''}`.trim()
          return { scope, status: 'granted', result: name || 'Profile accessible' }
        }
        throw new Error(profile.statusText)

      case 'r_emailaddress':
        endpoint = '/v2/emailAddress?q=members&projection=(elements*(handle~))'
        const emailResp = await linkedInFetch(endpoint, options)
        if (emailResp.ok) {
          const data = await emailResp.json()
          const email = data.elements?.[0]?.['handle~']?.emailAddress
          return { scope, status: 'granted', result: email || 'Email accessible' }
        }
        throw new Error(emailResp.statusText)

      case 'r_ads':
        // Use v2 API which works with Development Tier
        endpoint = '/v2/adAccountsV2?q=search&count=1'
        const adsResp = await linkedInFetch(endpoint, options)
        if (adsResp.ok) {
          const data = await adsResp.json()
          const count = data.paging?.total || data.elements?.length || 0
          return { scope, status: 'granted', result: `${count} ad account(s) accessible` }
        }
        throw new Error(adsResp.statusText)

      // Events Management API
      case 'r_events':
      case 'rw_events':
        // Test by trying to list events for an organization
        // This will fail gracefully if user doesn't have an organization
        endpoint = '/rest/events?q=eventsByOrganizer&count=1'
        const eventsResp = await linkedInFetch(endpoint, options)
        if (eventsResp.ok) {
          return { scope, status: 'granted', result: 'Events API accessible' }
        }
        // Events API may return 400 if no organizer param - that's ok, means scope is granted
        if (eventsResp.status === 400) {
          return { scope, status: 'granted', result: 'Events API accessible (need org URN to list)' }
        }
        throw new Error(eventsResp.statusText)

      // Verified on LinkedIn API
      case 'r_verify':
        endpoint = '/rest/verificationReport'
        const verifyResp = await linkedInFetch(endpoint, options)
        if (verifyResp.ok) {
          const data = await verifyResp.json()
          const verifications = data.verifications || []
          return {
            scope,
            status: 'granted',
            result: verifications.length > 0
              ? `Verified: ${verifications.join(', ')}`
              : 'Verification API accessible (no verifications)'
          }
        }
        throw new Error(verifyResp.statusText)

      case 'r_marketing_leadgen_automation':
        if (!ownerUrn) {
          return { scope, status: 'unknown', error: 'Need account URN to test' }
        }
        endpoint = `/rest/leadForms?q=owner&owner=${encodeURIComponent(ownerUrn)}&count=1`
        const leadResp = await linkedInFetch(endpoint, options)
        if (leadResp.ok) {
          const data = await leadResp.json()
          const count = data.elements?.length || 0
          return { scope, status: 'granted', result: `Lead forms accessible (${count} found)` }
        }
        throw new Error(leadResp.statusText)

      default:
        return { scope, status: 'unknown', error: 'Unknown scope' }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    // Check if it's a permission error
    if (message.includes('403') || message.includes('Forbidden')) {
      return { scope, status: 'denied', error: 'Permission denied' }
    }
    if (message.includes('401') || message.includes('Unauthorized')) {
      return { scope, status: 'denied', error: 'Invalid or expired token' }
    }
    return { scope, status: 'denied', error: message }
  }
}
