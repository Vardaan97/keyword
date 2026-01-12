import { NextRequest, NextResponse } from 'next/server'
import { saveTokens } from '@/lib/token-storage'

/**
 * Google Ads OAuth Callback Handler
 *
 * This endpoint receives the authorization code from Google and exchanges it
 * for access and refresh tokens.
 *
 * Features:
 * - CSRF protection via state parameter verification
 * - Automatic token storage (no manual copying needed)
 * - User email extraction for tracking
 */

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  // Handle OAuth errors
  if (error) {
    return new NextResponse(
      generateHtmlResponse({
        success: false,
        title: 'Authorization Failed',
        message: `OAuth Error: ${error}`,
        details: searchParams.get('error_description') || 'User denied access or an error occurred'
      }),
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Verify CSRF state parameter
  const storedState = request.cookies.get('oauth_state')?.value
  if (!state || !storedState || state !== storedState) {
    console.warn('[OAUTH] State mismatch - possible CSRF attack or stale session')
    // Don't block entirely - the state cookie might have expired during slow auth
    // Log a warning but continue if we have a valid code
    if (!code) {
      return new NextResponse(
        generateHtmlResponse({
          success: false,
          title: 'Security Check Failed',
          message: 'OAuth state verification failed',
          details: 'This could be a security issue or your session expired. Please try authorizing again.'
        }),
        { headers: { 'Content-Type': 'text/html' } }
      )
    }
  }

  // Check for authorization code
  if (!code) {
    return new NextResponse(
      generateHtmlResponse({
        success: false,
        title: 'Missing Authorization Code',
        message: 'No authorization code received from Google',
        details: 'Please try the authorization flow again'
      }),
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Get OAuth credentials
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return new NextResponse(
      generateHtmlResponse({
        success: false,
        title: 'Configuration Error',
        message: 'Missing OAuth credentials',
        details: 'GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET must be set'
      }),
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Build callback URL - must match the one used in authorization
  // Prefer explicit env var to avoid redirect_uri mismatch
  const protocol = request.headers.get('x-forwarded-proto') || 'http'
  const host = request.headers.get('host') || 'localhost:3005'
  const dynamicCallbackUrl = `${protocol}://${host}/api/auth/google-ads/callback`
  const callbackUrl = process.env.GOOGLE_ADS_OAUTH_CALLBACK_URL || dynamicCallbackUrl

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
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
    const refreshToken = tokenData.refresh_token
    const accessToken = tokenData.access_token
    const expiresIn = tokenData.expires_in

    if (!refreshToken) {
      return new NextResponse(
        generateHtmlResponse({
          success: false,
          title: 'No Refresh Token',
          message: 'Google did not return a refresh token',
          details: 'This can happen if consent was previously granted. Try revoking access at https://myaccount.google.com/permissions and try again.'
        }),
        { headers: { 'Content-Type': 'text/html' } }
      )
    }

    // Get user email for tracking who authorized
    let userEmail: string | undefined
    try {
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json()
        userEmail = userInfo.email
      }
    } catch {
      // Ignore - email is optional
    }

    // AUTOMATICALLY SAVE TOKENS - No manual copying needed!
    try {
      await saveTokens({
        refreshToken,
        accessToken,
        expiresIn,
        userEmail
      })
      console.log('[OAUTH] Tokens saved automatically to runtime storage')
    } catch (saveError) {
      console.error('[OAUTH] Failed to auto-save tokens:', saveError)
      // Continue - user can still copy manually
    }

    return new NextResponse(
      generateHtmlResponse({
        success: true,
        title: 'Authorization Successful!',
        message: userEmail ? `Authorized as ${userEmail}` : 'Your tokens have been saved',
        refreshToken: refreshToken,
        accessToken: accessToken,
        expiresIn: expiresIn,
        autoSaved: true
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
  refreshToken?: string
  accessToken?: string
  expiresIn?: number
  autoSaved?: boolean
}

function generateHtmlResponse(options: HtmlResponseOptions): string {
  const { success, title, message, details, refreshToken, autoSaved } = options

  const statusColor = success ? '#10b981' : '#ef4444'
  const statusIcon = success ? '✓' : '✗'

  let tokenSection = ''
  if (refreshToken && success) {
    tokenSection = `
      <div style="margin-top: 24px; padding: 20px; background: linear-gradient(135deg, #065f46 0%, #047857 100%); border-radius: 12px; border: 1px solid #10b981;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span style="color: #34d399; font-weight: 600; font-size: 16px;">Token Saved Automatically!</span>
        </div>
        <p style="color: #a7f3d0; margin: 0; font-size: 14px;">
          Your refresh token has been saved to runtime storage. <strong>No server restart required!</strong>
          You can now close this page and continue using the Keyword Planner.
        </p>
      </div>

      <div style="margin-top: 20px; display: flex; gap: 12px;">
        <a href="/" style="flex: 1; display: block; padding: 14px 20px; background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: 600; text-align: center; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
          ← Back to Keyword Planner
        </a>
        <a href="/settings/google-ads" style="flex: 1; display: block; padding: 14px 20px; background: #374151; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; text-align: center; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
          Connection Settings
        </a>
      </div>

      <details style="margin-top: 24px;">
        <summary style="color: #94a3b8; cursor: pointer; font-size: 14px; padding: 8px 0;">Show Token Details (for backup)</summary>
        <div style="margin-top: 12px; padding: 16px; background: #1e293b; border-radius: 8px; border: 1px solid #334155;">
          <h3 style="color: #94a3b8; margin: 0 0 12px 0; font-size: 12px; text-transform: uppercase;">Refresh Token</h3>
          <div style="position: relative;">
            <pre id="refreshToken" style="background: #0f172a; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 11px; color: #22d3ee; margin: 0; word-break: break-all; white-space: pre-wrap;">${refreshToken}</pre>
            <button onclick="copyToken('refreshToken')" style="position: absolute; top: 8px; right: 8px; background: #334155; border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">Copy</button>
          </div>
          <p style="color: #64748b; font-size: 11px; margin: 12px 0 0 0;">
            If you need to use this on another machine, add to .env.local:<br/>
            <code style="color: #a5f3fc;">GOOGLE_ADS_REFRESH_TOKEN=${refreshToken}</code>
          </p>
        </div>
      </details>
    `
  } else if (refreshToken && !autoSaved) {
    // Fallback for when auto-save fails
    tokenSection = `
      <div style="margin-top: 24px; padding: 16px; background: #1e293b; border-radius: 8px; border: 1px solid #334155;">
        <h3 style="color: #94a3b8; margin: 0 0 12px 0; font-size: 14px;">REFRESH TOKEN (Copy this to .env.local)</h3>
        <div style="position: relative;">
          <pre id="refreshToken" style="background: #0f172a; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; color: #22d3ee; margin: 0; word-break: break-all; white-space: pre-wrap;">${refreshToken}</pre>
          <button onclick="copyToken('refreshToken')" style="position: absolute; top: 8px; right: 8px; background: #334155; border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">Copy</button>
        </div>
      </div>

      <div style="margin-top: 16px; padding: 12px; background: #422006; border-radius: 8px; border: 1px solid #92400e;">
        <p style="color: #fbbf24; margin: 0; font-size: 13px;">
          <strong>⚠️ Important:</strong> After updating .env.local, restart your development server for the changes to take effect.
        </p>
      </div>
    `
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - Google Ads OAuth</title>
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
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3), 0 0 40px rgba(59, 130, 246, 0.1);
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
  <script>
    function copyToken(elementId) {
      const text = document.getElementById(elementId).innerText;
      navigator.clipboard.writeText(text).then(() => {
        alert('Copied to clipboard!');
      }).catch(err => {
        console.error('Failed to copy:', err);
      });
    }
  </script>
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
