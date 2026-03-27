import { NextResponse } from 'next/server'
import { getRefreshToken, updateAccessToken, getCachedAccessToken } from '@/lib/token-storage'

export const dynamic = 'force-dynamic'

/**
 * Proactive token health check.
 * Tests the current refresh token by attempting a token refresh with Google.
 * Returns { valid: true } or { valid: false, reAuthUrl: '...' }
 *
 * Optimized: if a cached access token exists (from a recent API call on this instance),
 * returns valid immediately without hitting Google's token endpoint.
 */
export async function GET() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      valid: false,
      reason: 'missing_credentials',
      message: 'Google Ads OAuth credentials not configured',
      reAuthUrl: '/api/auth/google-ads?returnTo=/'
    })
  }

  // Fast path: if we have a cached access token that's still valid, skip the refresh check
  const cachedToken = await getCachedAccessToken()
  if (cachedToken) {
    return NextResponse.json({ valid: true })
  }

  let refreshToken: string
  try {
    refreshToken = await getRefreshToken()
    console.log('[TOKEN-VERIFY] Got refresh token, attempting verification...')
  } catch (err) {
    console.log('[TOKEN-VERIFY] No refresh token available:', err instanceof Error ? err.message : err)
    return NextResponse.json({
      valid: false,
      reason: 'no_token',
      message: 'No refresh token available',
      reAuthUrl: '/api/auth/google-ads?returnTo=/'
    })
  }

  // Attempt a token refresh to verify the refresh token is still valid
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.log('[TOKEN-VERIFY] Token refresh failed:', error.error)
      return NextResponse.json({
        valid: false,
        reason: error.error || 'token_refresh_failed',
        message: error.error_description || 'Token refresh failed',
        reAuthUrl: '/api/auth/google-ads?returnTo=/'
      })
    }

    // Cache the access token so subsequent verify calls and API calls skip the refresh
    const data = await response.json()
    if (data.access_token && data.expires_in) {
      try {
        await updateAccessToken(data.access_token, data.expires_in)
      } catch {
        // Non-fatal — access token caching is an optimization
      }
    }

    return NextResponse.json({ valid: true })
  } catch (error) {
    console.error('[TOKEN-VERIFY] Network error:', error)
    return NextResponse.json({
      valid: false,
      reason: 'network_error',
      message: 'Could not reach Google servers to verify token'
    })
  }
}
