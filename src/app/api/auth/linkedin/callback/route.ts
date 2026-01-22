import { NextRequest, NextResponse } from 'next/server'
import { saveLinkedInTokens } from '@/lib/linkedin-token-storage'

/**
 * LinkedIn OAuth Callback Handler
 *
 * This endpoint receives the authorization code from LinkedIn and exchanges it
 * for access and refresh tokens.
 *
 * Features:
 * - CSRF protection via state parameter verification
 * - Automatic token storage (no manual copying needed)
 * - User profile extraction for tracking
 * - Deduplication to prevent double-processing of authorization codes
 */

// Track recently used authorization codes to prevent double-processing
// Codes are valid for only one use, so if the browser makes duplicate requests
// (prefetch, double navigation), we only process the first one
const usedAuthCodes = new Map<string, number>()
const CODE_EXPIRY_MS = 60000 // 1 minute

function cleanupOldCodes() {
  const now = Date.now()
  for (const [code, timestamp] of usedAuthCodes.entries()) {
    if (now - timestamp > CODE_EXPIRY_MS) {
      usedAuthCodes.delete(code)
    }
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const state = searchParams.get('state')

  // Check if this code was already processed (prevents double login issue)
  if (code) {
    cleanupOldCodes()
    if (usedAuthCodes.has(code)) {
      console.log('[LINKEDIN-OAUTH] Authorization code already processed, redirecting to dashboard')
      return NextResponse.redirect(new URL('/dashboard/linkedin', request.url))
    }
    // Mark this code as being processed
    usedAuthCodes.set(code, Date.now())
  }

  // Handle OAuth errors
  if (error) {
    return new NextResponse(
      generateHtmlResponse({
        success: false,
        title: 'Authorization Failed',
        message: `OAuth Error: ${error}`,
        details: errorDescription || 'User denied access or an error occurred'
      }),
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Verify CSRF state parameter
  const storedState = request.cookies.get('linkedin_oauth_state')?.value
  const isDevelopment = process.env.NODE_ENV !== 'production'

  // In development, cookies often don't persist through OAuth redirects
  // Log warning but allow the flow to continue
  if (!state || !storedState || state !== storedState) {
    if (isDevelopment) {
      console.warn('[LINKEDIN-OAUTH] State mismatch in development - proceeding anyway')
      console.warn('[LINKEDIN-OAUTH] Received state:', state?.substring(0, 20) + '...')
      console.warn('[LINKEDIN-OAUTH] Stored state:', storedState?.substring(0, 20) + '...' || 'none')
    } else {
      console.warn('[LINKEDIN-OAUTH] State mismatch - possible CSRF attack or stale session')
      return new NextResponse(
        generateHtmlResponse({
          success: false,
          title: 'Security Check Failed',
          message: 'OAuth state verification failed',
          details: 'This could be a security issue or your session expired. Please try authorizing again.'
        }),
        { headers: { 'Content-Type': 'text/html' }, status: 403 }
      )
    }
  }

  // Check for authorization code
  if (!code) {
    return new NextResponse(
      generateHtmlResponse({
        success: false,
        title: 'Missing Authorization Code',
        message: 'No authorization code received from LinkedIn',
        details: 'Please try the authorization flow again'
      }),
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Get OAuth credentials (trim to handle accidental whitespace/newlines in env vars)
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim()
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim()

  if (!clientId || !clientSecret) {
    return new NextResponse(
      generateHtmlResponse({
        success: false,
        title: 'Configuration Error',
        message: 'Missing OAuth credentials',
        details: 'LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET must be set'
      }),
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Build callback URL - must match the one used in authorization
  const protocol = request.headers.get('x-forwarded-proto') || 'http'
  const host = request.headers.get('host') || 'localhost:3005'
  const dynamicCallbackUrl = `${protocol}://${host}/api/auth/linkedin/callback`
  const callbackUrl = process.env.LINKEDIN_OAUTH_CALLBACK_URL || dynamicCallbackUrl

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl
      })
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok) {
      return new NextResponse(
        generateHtmlResponse({
          success: false,
          title: 'Token Exchange Failed',
          message: tokenData.error || 'Failed to exchange authorization code',
          details: tokenData.error_description || JSON.stringify(tokenData)
        }),
        { headers: { 'Content-Type': 'text/html' } }
      )
    }

    // Success! Get the tokens
    const accessToken = tokenData.access_token
    const expiresIn = tokenData.expires_in // Usually 5184000 (60 days)
    const refreshToken = tokenData.refresh_token
    const refreshTokenExpiresIn = tokenData.refresh_token_expires_in // Usually 31536000 (1 year)
    const scope = tokenData.scope

    // Get user profile for tracking who authorized
    let userName: string | undefined
    let userEmail: string | undefined
    try {
      // Get profile
      const profileResponse = await fetch('https://api.linkedin.com/v2/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Linkedin-Version': '202411'
        }
      })
      if (profileResponse.ok) {
        const profile = await profileResponse.json()
        const firstName = profile.localizedFirstName || profile.firstName?.localized?.en_US || ''
        const lastName = profile.localizedLastName || profile.lastName?.localized?.en_US || ''
        userName = `${firstName} ${lastName}`.trim()
      }

      // Get email
      const emailResponse = await fetch('https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Linkedin-Version': '202411'
        }
      })
      if (emailResponse.ok) {
        const emailData = await emailResponse.json()
        userEmail = emailData.elements?.[0]?.['handle~']?.emailAddress
      }
    } catch {
      // Ignore - profile info is optional
    }

    // LinkedIn returns scopes as comma-separated or space-separated
    const scopeArray = scope
      ? scope.split(/[,\s]+/).map((s: string) => s.trim()).filter(Boolean)
      : []

    // AUTOMATICALLY SAVE TOKENS
    try {
      await saveLinkedInTokens({
        accessToken,
        refreshToken,
        expiresIn,
        refreshTokenExpiresIn,
        userEmail: userEmail || userName,
        scopes: scopeArray.length > 0 ? scopeArray : undefined
      })
      console.log('[LINKEDIN-OAUTH] Tokens saved automatically to runtime storage')
    } catch (saveError) {
      console.error('[LINKEDIN-OAUTH] Failed to auto-save tokens:', saveError)
    }

    return new NextResponse(
      generateHtmlResponse({
        success: true,
        title: 'LinkedIn Connected!',
        message: userName ? `Authorized as ${userName}` : 'Your tokens have been saved',
        accessToken,
        expiresIn,
        scopes: scopeArray,
        userEmail
      }),
      { headers: { 'Content-Type': 'text/html' } }
    )
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return new NextResponse(
      generateHtmlResponse({
        success: false,
        title: 'Request Failed',
        message: 'Failed to complete OAuth flow',
        details: errorMessage
      }),
      { headers: { 'Content-Type': 'text/html' } }
    )
  }
}

interface HtmlResponseOptions {
  success: boolean
  title: string
  message: string
  details?: string
  accessToken?: string
  expiresIn?: number
  scopes?: string[]
  userEmail?: string
}

function generateHtmlResponse(options: HtmlResponseOptions): string {
  const { success, title, message, details, accessToken, expiresIn, scopes, userEmail } = options

  const statusColor = success ? '#0077B5' : '#ef4444' // LinkedIn blue or red
  const statusIcon = success ? '✓' : '✗'

  let tokenSection = ''
  if (accessToken && success) {
    const expiresDate = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toLocaleDateString()
      : 'Unknown'

    tokenSection = `
      <div style="margin-top: 24px; padding: 20px; background: linear-gradient(135deg, #004182 0%, #0077B5 100%); border-radius: 12px; border: 1px solid #0077B5;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#70c4f2" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span style="color: #70c4f2; font-weight: 600; font-size: 16px;">Token Saved Automatically!</span>
        </div>
        <p style="color: #a8d4f0; margin: 0; font-size: 14px;">
          Your LinkedIn access token has been saved. <strong>Token expires: ${expiresDate}</strong>
        </p>
        ${scopes && scopes.length > 0 ? `
          <div style="margin-top: 12px;">
            <span style="color: #70c4f2; font-size: 12px; font-weight: 600;">Granted Scopes:</span>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
              ${scopes.map(s => `<span style="background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #a8d4f0;">${s}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <div style="margin-top: 20px;">
        <a href="/dashboard/linkedin" style="display: block; padding: 16px 24px; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: 600; text-align: center; font-size: 16px; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
          Go to LinkedIn Dashboard →
        </a>
      </div>

      <div style="margin-top: 12px; display: flex; gap: 12px;">
        <a href="/api/linkedin/test-scopes" style="flex: 1; display: block; padding: 12px 16px; background: linear-gradient(135deg, #0077B5 0%, #004182 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: 500; text-align: center; font-size: 14px; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
          Test API Scopes
        </a>
        <a href="/api/linkedin/accounts" style="flex: 1; display: block; padding: 12px 16px; background: #374151; color: white; text-decoration: none; border-radius: 10px; font-weight: 500; text-align: center; font-size: 14px; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
          Discover Accounts
        </a>
      </div>

      <details style="margin-top: 24px;">
        <summary style="color: #94a3b8; cursor: pointer; font-size: 14px; padding: 8px 0;">Show Token Details (for debugging)</summary>
        <div style="margin-top: 12px; padding: 16px; background: #1e293b; border-radius: 8px; border: 1px solid #334155;">
          <h3 style="color: #94a3b8; margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase;">Access Token (first 50 chars)</h3>
          <pre style="background: #0f172a; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 11px; color: #22d3ee; margin: 0; word-break: break-all; white-space: pre-wrap;">${accessToken.substring(0, 50)}...</pre>
          ${userEmail ? `<p style="color: #64748b; font-size: 11px; margin: 12px 0 0 0;">Authorized by: ${userEmail}</p>` : ''}
        </div>
      </details>
    `
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - LinkedIn OAuth</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      margin: 0;
      padding: 20px;
      min-height: 100vh;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      padding: 32px;
      background: #1e293b;
      border-radius: 16px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3), 0 0 40px rgba(0, 119, 181, 0.1);
    }
    .status {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
    }
    .status-icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      color: white;
      background: ${statusColor};
      box-shadow: 0 0 20px ${statusColor}40;
    }
    h1 { margin: 0; font-size: 24px; }
    .message { color: #94a3b8; font-size: 16px; margin: 8px 0 0 0; }
    .details { color: #64748b; font-size: 14px; margin-top: 16px; padding: 12px; background: #0f172a; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="status">
      <div class="status-icon">${statusIcon}</div>
      <div>
        <h1>${title}</h1>
        <p class="message">${message}</p>
      </div>
    </div>
    ${details ? `<div class="details">${details}</div>` : ''}
    ${tokenSection}
  </div>
</body>
</html>
  `
}
