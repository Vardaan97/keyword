import { NextRequest, NextResponse } from 'next/server'

/**
 * Google Ads OAuth Authorization URL Generator
 *
 * This endpoint generates the OAuth2 authorization URL for Google Ads API.
 * Used when the refresh token expires or is revoked.
 *
 * Flow:
 * 1. GET /api/auth/google-ads - Returns authorization URL
 * 2. User clicks the URL, logs in, grants permission
 * 3. Google redirects to /api/auth/google-ads/callback with authorization code
 * 4. Callback exchanges code for tokens and displays the new refresh token
 */

const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/adwords'  // Google Ads API access
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

  // Build callback URL based on current request
  const protocol = request.headers.get('x-forwarded-proto') || 'http'
  const host = request.headers.get('host') || 'localhost:3005'
  const callbackUrl = `${protocol}://${host}/api/auth/google-ads/callback`

  // Generate OAuth authorization URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', callbackUrl)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', GOOGLE_OAUTH_SCOPES.join(' '))
  authUrl.searchParams.set('access_type', 'offline')  // Required for refresh token
  authUrl.searchParams.set('prompt', 'consent')  // Force consent to get new refresh token

  // Return instructions and the auth URL
  return NextResponse.json({
    success: true,
    message: 'Click the authorization URL to get a new refresh token',
    instructions: [
      '1. Click the authorization URL below',
      '2. Log in with the Google account that has access to your Google Ads accounts',
      '3. Grant access to Google Ads',
      '4. You will be redirected back with your new refresh token',
      '5. Copy the refresh token and update GOOGLE_ADS_REFRESH_TOKEN in your .env.local'
    ],
    authorizationUrl: authUrl.toString(),
    callbackUrl: callbackUrl,
    note: 'Make sure this callback URL is added to your OAuth Authorized redirect URIs in Google Cloud Console'
  })
}
