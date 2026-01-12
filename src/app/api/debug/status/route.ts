import { NextResponse } from 'next/server'
import { getRefreshToken, getTokenStatus, getCachedAccessToken } from '@/lib/token-storage'
import { getGoogleAdsConfig, getDefaultCustomerId, GOOGLE_ADS_ACCOUNTS } from '@/lib/google-ads'
import { getKeywordsEverywhereConfig } from '@/lib/keywords-everywhere'

export const dynamic = 'force-dynamic'

/**
 * Debug Status Endpoint
 *
 * Returns the current status of all configurations and tokens.
 * Useful for diagnosing connection issues.
 */
export async function GET() {
  const timestamp = new Date().toISOString()

  // Check token status
  let tokenStatus
  try {
    tokenStatus = await getTokenStatus()
  } catch (error) {
    tokenStatus = { error: error instanceof Error ? error.message : 'Unknown error' }
  }

  // Check refresh token availability
  let refreshTokenAvailable = false
  let refreshTokenSource = 'none'
  try {
    const token = await getRefreshToken()
    refreshTokenAvailable = !!token
    refreshTokenSource = tokenStatus?.source || 'unknown'
  } catch {
    refreshTokenAvailable = false
  }

  // Check cached access token
  let accessTokenCached = false
  try {
    const cachedToken = await getCachedAccessToken()
    accessTokenCached = !!cachedToken
  } catch {
    accessTokenCached = false
  }

  // Get Google Ads config (without token for display)
  let googleAdsConfig
  try {
    const refreshToken = await getRefreshToken().catch(() => undefined)
    const config = getGoogleAdsConfig(refreshToken)
    googleAdsConfig = {
      developerToken: config.developerToken ? `${config.developerToken.substring(0, 8)}...` : 'NOT SET',
      clientId: config.clientId ? `${config.clientId.substring(0, 20)}...` : 'NOT SET',
      clientSecret: config.clientSecret ? 'SET (hidden)' : 'NOT SET',
      refreshToken: config.refreshToken ? `${config.refreshToken.substring(0, 10)}...` : 'NOT SET',
      loginCustomerId: config.loginCustomerId || 'NOT SET',
      customerId: getDefaultCustomerId() || 'NOT SET'
    }
  } catch (error) {
    googleAdsConfig = { error: error instanceof Error ? error.message : 'Failed to get config' }
  }

  // Get Keywords Everywhere config
  let keywordsEverywhereConfig
  try {
    const keConfig = getKeywordsEverywhereConfig()
    keywordsEverywhereConfig = {
      apiKey: keConfig.apiKey ? `${keConfig.apiKey.substring(0, 8)}...` : 'NOT SET'
    }
  } catch (error) {
    keywordsEverywhereConfig = { error: error instanceof Error ? error.message : 'Failed to get config' }
  }

  // Environment variables check
  const envVars = {
    GOOGLE_ADS_DEVELOPER_TOKEN: !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    GOOGLE_ADS_CLIENT_ID: !!process.env.GOOGLE_ADS_CLIENT_ID,
    GOOGLE_ADS_CLIENT_SECRET: !!process.env.GOOGLE_ADS_CLIENT_SECRET,
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: !!process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    GOOGLE_ADS_CUSTOMER_ID: !!process.env.GOOGLE_ADS_CUSTOMER_ID,
    GOOGLE_ADS_REFRESH_TOKEN: !!process.env.GOOGLE_ADS_REFRESH_TOKEN,
    KEYWORDS_EVERYWHERE_API_KEY: !!process.env.KEYWORDS_EVERYWHERE_API_KEY,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY
  }

  // Test OAuth token refresh
  let tokenRefreshTest: Record<string, unknown> = { status: 'not_tested' }
  if (refreshTokenAvailable) {
    try {
      const refreshToken = await getRefreshToken()
      const config = getGoogleAdsConfig(refreshToken)

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: config.refreshToken,
          grant_type: 'refresh_token'
        })
      })

      if (tokenResponse.ok) {
        const data = await tokenResponse.json()
        tokenRefreshTest = {
          status: 'success',
          expiresIn: data.expires_in,
          tokenType: data.token_type
        }
      } else {
        const error = await tokenResponse.json()
        tokenRefreshTest = {
          status: 'failed',
          error: error.error,
          errorDescription: error.error_description
        }
      }
    } catch (error) {
      tokenRefreshTest = {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  return NextResponse.json({
    success: true,
    timestamp,
    token: {
      status: tokenStatus,
      refreshTokenAvailable,
      refreshTokenSource,
      accessTokenCached
    },
    googleAds: {
      config: googleAdsConfig,
      accounts: GOOGLE_ADS_ACCOUNTS.map(acc => ({
        id: acc.id,
        name: acc.name,
        customerId: acc.customerId,
        currency: acc.currency
      })),
      tokenRefreshTest
    },
    keywordsEverywhere: keywordsEverywhereConfig,
    environment: envVars
  })
}
