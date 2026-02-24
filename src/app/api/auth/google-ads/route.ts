import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * Google Ads OAuth Authorization URL Generator
 *
 * This endpoint generates the OAuth2 authorization URL for Google Ads API.
 * Used when the refresh token expires or is revoked.
 *
 * Flow:
 * 1. GET /api/auth/google-ads - Returns authorization URL with CSRF state
 * 2. User clicks the URL, logs in, grants permission
 * 3. Google redirects to /api/auth/google-ads/callback with authorization code
 * 4. Callback verifies state and exchanges code for tokens
 */

// OAuth scopes - include email for user identification
const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/adwords',           // Google Ads API access
  'https://www.googleapis.com/auth/userinfo.email',    // User email for identification
  'https://www.googleapis.com/auth/userinfo.profile'   // User profile info
]

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      error: 'Missing OAuth credentials',
      message: 'Please set GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET in your .env.local file'
    }, { status: 500 })
  }

  // Accept optional returnTo param for post-auth redirect
  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/'

  // Build callback URL - prefer explicit env var to avoid redirect_uri mismatch
  const protocol = request.headers.get('x-forwarded-proto') || 'http'
  const host = request.headers.get('host') || 'localhost:3005'
  const dynamicCallbackUrl = `${protocol}://${host}/api/auth/google-ads/callback`
  const callbackUrl = process.env.GOOGLE_ADS_OAUTH_CALLBACK_URL || dynamicCallbackUrl

  // Generate CSRF state parameter — encode returnTo alongside for retrieval in callback
  const csrfToken = crypto.randomBytes(32).toString('hex')
  const statePayload = JSON.stringify({ csrf: csrfToken, returnTo })
  const state = Buffer.from(statePayload).toString('base64url')

  // Generate OAuth authorization URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', callbackUrl)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', GOOGLE_OAUTH_SCOPES.join(' '))
  authUrl.searchParams.set('access_type', 'offline')  // Required for refresh token
  authUrl.searchParams.set('prompt', 'consent')       // Force consent to get new refresh token
  authUrl.searchParams.set('state', state)            // CSRF + returnTo

  // Create redirect response — go straight to Google OAuth consent
  const response = NextResponse.redirect(authUrl.toString())

  // Set state cookie for CSRF verification (expires in 10 minutes)
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/'
  })

  return response
}
