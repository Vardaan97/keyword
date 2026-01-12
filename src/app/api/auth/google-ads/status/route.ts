import { NextResponse } from 'next/server'
import { getTokenStatus, getCachedAccessToken } from '@/lib/token-storage'
import type { TokenStatus } from '@/types/auth'

export const dynamic = 'force-dynamic'

/**
 * Google Ads Token Status Endpoint
 *
 * Returns current token status without making Google API calls.
 * Used by the settings page and status indicator to show connection state.
 */
export async function GET() {
  try {
    // Get token status from storage
    const tokenStatus = await getTokenStatus()

    // Get cached access token expiration
    const cachedAccessToken = await getCachedAccessToken()
    let expiresIn: number | undefined

    // If we have a cached token, calculate time remaining
    // Note: getCachedAccessToken returns null if expired, so we'd need to check storage directly
    // For now, we'll rely on the storage metadata

    // Check configuration completeness
    const config = {
      hasClientId: Boolean(process.env.GOOGLE_ADS_CLIENT_ID),
      hasClientSecret: Boolean(process.env.GOOGLE_ADS_CLIENT_SECRET),
      hasDeveloperToken: Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
      hasLoginCustomerId: Boolean(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID),
      hasCustomerId: Boolean(process.env.GOOGLE_ADS_CUSTOMER_ID)
    }

    // Build response
    const response: TokenStatus = {
      hasToken: tokenStatus.hasToken,
      source: tokenStatus.source,
      updatedAt: tokenStatus.updatedAt,
      updatedBy: tokenStatus.updatedBy,
      expiresIn,
      config
    }

    return NextResponse.json({
      success: true,
      data: response
    })
  } catch (error) {
    console.error('[AUTH-STATUS] Error getting token status:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get token status'
    }, { status: 500 })
  }
}
