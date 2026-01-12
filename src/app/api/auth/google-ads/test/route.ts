import { NextResponse } from 'next/server'
import { getRefreshToken, markTokenVerified } from '@/lib/token-storage'
import type { ConnectionTestResult } from '@/types/auth'

export const dynamic = 'force-dynamic'

// Google Ads API version
const GOOGLE_ADS_API_VERSION = 'v22'

/**
 * Google Ads Connection Test Endpoint
 *
 * Makes a lightweight Google Ads API call to verify:
 * 1. Refresh token is valid
 * 2. Access token can be obtained
 * 3. API credentials are correct
 * 4. Account access is working
 *
 * Returns detailed error information with fix suggestions.
 */
export async function GET() {
  const timestamp = new Date().toISOString()

  try {
    // Check configuration first
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID

    // Check for missing config
    const missingConfig: string[] = []
    if (!clientId) missingConfig.push('GOOGLE_ADS_CLIENT_ID')
    if (!clientSecret) missingConfig.push('GOOGLE_ADS_CLIENT_SECRET')
    if (!developerToken) missingConfig.push('GOOGLE_ADS_DEVELOPER_TOKEN')
    if (!loginCustomerId) missingConfig.push('GOOGLE_ADS_LOGIN_CUSTOMER_ID')
    if (!customerId) missingConfig.push('GOOGLE_ADS_CUSTOMER_ID')

    if (missingConfig.length > 0) {
      const result: ConnectionTestResult = {
        success: false,
        message: 'Missing configuration',
        error: `Missing environment variables: ${missingConfig.join(', ')}`,
        errorCode: 'MISSING_CONFIG',
        suggestion: 'Add the missing environment variables to your .env.local file',
        timestamp
      }
      return NextResponse.json({ success: false, data: result })
    }

    // Get refresh token
    let refreshToken: string
    try {
      refreshToken = await getRefreshToken()
    } catch {
      const result: ConnectionTestResult = {
        success: false,
        message: 'No refresh token available',
        error: 'Refresh token not found in runtime storage or environment variables',
        errorCode: 'NO_REFRESH_TOKEN',
        suggestion: 'Click "Authorize Google Ads" to get a new refresh token',
        timestamp
      }
      return NextResponse.json({ success: false, data: result })
    }

    // Step 1: Get access token
    console.log('[AUTH-TEST] Getting access token...')
    let tokenResponse: Response
    let tokenData: Record<string, unknown>

    try {
      tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: clientId!,
          client_secret: clientSecret!,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        })
      })

      const responseText = await tokenResponse.text()
      try {
        tokenData = JSON.parse(responseText)
      } catch {
        console.error('[AUTH-TEST] Token response not JSON:', responseText.substring(0, 200))
        const result: ConnectionTestResult = {
          success: false,
          message: 'Invalid response from Google OAuth',
          error: `Expected JSON but got: ${responseText.substring(0, 100)}...`,
          errorCode: 'INVALID_RESPONSE',
          suggestion: 'This may be a temporary issue. Please try again.',
          timestamp
        }
        return NextResponse.json({ success: false, data: result })
      }
    } catch (fetchError) {
      console.error('[AUTH-TEST] Fetch error:', fetchError)
      const result: ConnectionTestResult = {
        success: false,
        message: 'Network error connecting to Google',
        error: fetchError instanceof Error ? fetchError.message : 'Failed to connect',
        errorCode: 'NETWORK_ERROR',
        suggestion: 'Check your internet connection and try again.',
        timestamp
      }
      return NextResponse.json({ success: false, data: result })
    }

    if (!tokenResponse.ok) {
      console.error('[AUTH-TEST] Token error:', tokenData)

      let errorCode = 'TOKEN_ERROR'
      let suggestion = 'Try re-authorizing with Google Ads'
      const tokenError = String(tokenData.error || '')
      const errorDesc = String(tokenData.error_description || '')

      if (tokenError === 'invalid_grant') {
        if (errorDesc.includes('expired') || errorDesc.includes('revoked')) {
          errorCode = 'TOKEN_EXPIRED'
          suggestion = 'Your refresh token has expired or been revoked. Click "Authorize Google Ads" to get a new token.'
        } else if (errorDesc.includes('invalid')) {
          errorCode = 'TOKEN_INVALID'
          suggestion = 'The refresh token is invalid. Click "Authorize Google Ads" to get a new token.'
        }
      } else if (tokenError === 'invalid_client') {
        errorCode = 'INVALID_CLIENT'
        suggestion = 'Check that GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET are correct in your .env.local file'
      }

      const result: ConnectionTestResult = {
        success: false,
        message: 'Failed to get access token',
        error: errorDesc || tokenError || 'Unknown token error',
        errorCode,
        suggestion,
        timestamp
      }
      return NextResponse.json({ success: false, data: result })
    }

    const accessToken = tokenData.access_token
    console.log('[AUTH-TEST] Access token obtained successfully')

    // Step 2: Make a lightweight API call to verify account access
    // Using the search endpoint with a simple customer query (same pattern as google-ads.ts)
    const cleanLoginCustomerId = loginCustomerId!.replace(/-/g, '')
    const cleanCustomerId = customerId!.replace(/-/g, '')

    console.log('[AUTH-TEST] Testing API access to customer:', cleanCustomerId)

    // Use the googleAds:search endpoint with a simple query to get customer info
    const apiUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${cleanCustomerId}/googleAds:search`
    const query = `SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1`

    let apiResponse: Response
    let apiData: Record<string, unknown>

    try {
      apiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': developerToken!,
          'login-customer-id': cleanLoginCustomerId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      })

      const apiResponseText = await apiResponse.text()
      try {
        apiData = JSON.parse(apiResponseText)
      } catch {
        console.error('[AUTH-TEST] API response not JSON:', apiResponseText.substring(0, 200))
        const result: ConnectionTestResult = {
          success: false,
          message: 'Invalid response from Google Ads API',
          error: `Expected JSON but got: ${apiResponseText.substring(0, 100)}...`,
          errorCode: 'INVALID_API_RESPONSE',
          suggestion: 'This may be a temporary API issue. Please try again.',
          timestamp
        }
        return NextResponse.json({ success: false, data: result })
      }
    } catch (apiFetchError) {
      console.error('[AUTH-TEST] API fetch error:', apiFetchError)
      const result: ConnectionTestResult = {
        success: false,
        message: 'Network error connecting to Google Ads API',
        error: apiFetchError instanceof Error ? apiFetchError.message : 'Failed to connect',
        errorCode: 'API_NETWORK_ERROR',
        suggestion: 'Check your internet connection and try again.',
        timestamp
      }
      return NextResponse.json({ success: false, data: result })
    }

    if (!apiResponse.ok) {
      console.error('[AUTH-TEST] API error:', apiData)

      let errorCode = 'API_ERROR'
      let suggestion = 'Check your Google Ads API configuration'

      // Safely extract error message from various response formats
      let errorMessage: string
      const errorObj = apiData.error as Record<string, unknown> | undefined
      if (errorObj && typeof errorObj.message === 'string') {
        errorMessage = errorObj.message
      } else if (typeof apiData.message === 'string') {
        errorMessage = apiData.message
      } else {
        errorMessage = JSON.stringify(apiData)
      }

      if (errorMessage.includes('PERMISSION_DENIED') || errorMessage.includes('permission')) {
        errorCode = 'PERMISSION_DENIED'
        suggestion = 'Your developer token may not have access to this account. Check your Google Ads API access level.'
      } else if (errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
        errorCode = 'QUOTA_EXHAUSTED'
        suggestion = 'API quota has been exhausted. Wait a few minutes and try again.'
      } else if (errorMessage.includes('UNAUTHENTICATED')) {
        errorCode = 'UNAUTHENTICATED'
        suggestion = 'Authentication failed. Try re-authorizing with Google Ads.'
      } else if (errorMessage.includes('NOT_FOUND')) {
        errorCode = 'ACCOUNT_NOT_FOUND'
        suggestion = 'The customer ID may be incorrect. Check GOOGLE_ADS_CUSTOMER_ID in your .env.local file.'
      }

      const result: ConnectionTestResult = {
        success: false,
        message: 'API call failed',
        error: errorMessage,
        errorCode,
        suggestion,
        customerId: cleanCustomerId,
        timestamp
      }
      return NextResponse.json({ success: false, data: result })
    }

    // Success! Extract account info from search response
    // Response format: { results: [{ customer: { id, descriptiveName } }] }
    let accountName = 'Unknown Account'
    const results = apiData.results as Array<Record<string, unknown>> | undefined
    if (results && results.length > 0) {
      const customer = results[0].customer as Record<string, unknown> | undefined
      if (customer && typeof customer.descriptiveName === 'string') {
        accountName = customer.descriptiveName
      }
    }
    console.log('[AUTH-TEST] Connection successful! Account:', accountName)

    // Mark token as verified
    await markTokenVerified()

    const result: ConnectionTestResult = {
      success: true,
      message: 'Connection successful',
      accountName: String(accountName),
      customerId: cleanCustomerId,
      timestamp
    }

    return NextResponse.json({ success: true, data: result })

  } catch (error) {
    console.error('[AUTH-TEST] Unexpected error:', error)

    const result: ConnectionTestResult = {
      success: false,
      message: 'Unexpected error',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      errorCode: 'UNEXPECTED_ERROR',
      suggestion: 'Check the server logs for more details',
      timestamp
    }

    return NextResponse.json({ success: false, data: result }, { status: 500 })
  }
}
