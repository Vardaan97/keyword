import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * LinkedIn OAuth Authorization URL Generator
 *
 * This endpoint generates the OAuth2 authorization URL for LinkedIn API.
 *
 * Flow:
 * 1. GET /api/auth/linkedin - Returns authorization URL with CSRF state
 * 2. User clicks the URL, logs in, grants permission
 * 3. LinkedIn redirects to /api/auth/linkedin/callback with authorization code
 * 4. Callback verifies state and exchanges code for tokens
 */

// OAuth scopes for LinkedIn
// Available scopes depend on which Products are enabled in your LinkedIn App
//
// Share on LinkedIn (Default):           w_member_social
// Sign In with OpenID Connect:           openid, profile, email
// Advertising API (Development Tier):    r_ads, rw_ads
// Events Management API:                 r_events, rw_events
// Verified on LinkedIn (Development):    r_verify
// Lead Sync API:                         r_marketing_leadgen_automation
//
// Only request scopes your app has access to!
const LINKEDIN_OAUTH_SCOPES = [
  // Sign In with LinkedIn using OpenID Connect
  'openid',
  'profile',
  'email',
  // Share on LinkedIn
  'w_member_social',
  // Advertising API
  'r_ads',
  'rw_ads',
  'r_ads_reporting',
  // Events Management API
  'r_events',
  'rw_events',
  // Verified on LinkedIn
  'r_verify',
  // Lead Sync API - for lead gen forms and responses
  'r_marketing_leadgen_automation',
  'r_ads_leadgen_automation',
  // Organization APIs
  'r_organization_admin',
  'rw_organization_admin',
  'r_organization_social',
  'w_organization_social',
]

export async function GET(request: NextRequest) {
  // Trim to handle accidental whitespace/newlines in env vars (common Vercel issue)
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim()
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim()

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      error: 'Missing OAuth credentials',
      message: 'Please set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in your .env.local file',
      setup: {
        step1: 'Go to https://developer.linkedin.com/apps',
        step2: 'Create or select your app',
        step3: 'Copy Client ID and Client Secret',
        step4: 'Add them to .env.local',
        step5: 'Request access to Lead Sync API in the Products tab'
      }
    }, { status: 500 })
  }

  // Build callback URL
  const protocol = request.headers.get('x-forwarded-proto') || 'http'
  const host = request.headers.get('host') || 'localhost:3005'
  const dynamicCallbackUrl = `${protocol}://${host}/api/auth/linkedin/callback`
  const callbackUrl = process.env.LINKEDIN_OAUTH_CALLBACK_URL || dynamicCallbackUrl

  // Generate CSRF state parameter
  const state = crypto.randomBytes(32).toString('hex')

  // Generate OAuth authorization URL
  const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization')
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', callbackUrl)
  authUrl.searchParams.set('scope', LINKEDIN_OAUTH_SCOPES.join(' '))
  authUrl.searchParams.set('state', state)

  // Check if JSON response is requested (for debugging/API usage)
  const wantsJson = request.nextUrl.searchParams.get('json') === 'true'

  if (wantsJson) {
    // Return JSON for debugging
    const response = NextResponse.json({
      success: true,
      message: 'Click the authorization URL to connect LinkedIn',
      instructions: [
        '1. Click the authorization URL below',
        '2. Log in with your LinkedIn account',
        '3. Grant access to the requested permissions',
        '4. You will be redirected back automatically',
        '5. Your tokens will be saved - no manual copying needed!'
      ],
      authorizationUrl: authUrl.toString(),
      callbackUrl: callbackUrl,
      requestedScopes: LINKEDIN_OAUTH_SCOPES,
      note: 'Make sure this callback URL is added to your LinkedIn App OAuth 2.0 settings'
    })

    // Set state cookie for CSRF verification (expires in 10 minutes)
    response.cookies.set('linkedin_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/'
    })

    return response
  }

  // Auto-redirect using HTML page (ensures cookie is set before redirect)
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting to LinkedIn...</title>
  <meta http-equiv="refresh" content="0;url=${authUrl.toString()}">
</head>
<body style="background: #0f172a; color: #e2e8f0; font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
  <div style="text-align: center;">
    <p>Redirecting to LinkedIn...</p>
    <p style="font-size: 14px; color: #64748b;">If not redirected, <a href="${authUrl.toString()}" style="color: #0077B5;">click here</a></p>
  </div>
</body>
</html>
  `

  const response = new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' }
  })

  // Set state cookie for CSRF verification (expires in 10 minutes)
  response.cookies.set('linkedin_oauth_state', state, {
    httpOnly: true,
    secure: false, // localhost doesn't use HTTPS
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/'
  })

  return response
}
