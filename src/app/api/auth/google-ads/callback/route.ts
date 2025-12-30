import { NextRequest, NextResponse } from 'next/server'

/**
 * Google Ads OAuth Callback Handler
 *
 * This endpoint receives the authorization code from Google and exchanges it
 * for access and refresh tokens.
 *
 * The new refresh token is displayed for the user to copy into their .env.local
 */

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')

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

  // Build callback URL (must match the one used in authorization)
  const protocol = request.headers.get('x-forwarded-proto') || 'http'
  const host = request.headers.get('host') || 'localhost:3005'
  const callbackUrl = `${protocol}://${host}/api/auth/google-ads/callback`

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

    // Success! Display the new refresh token
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

    return new NextResponse(
      generateHtmlResponse({
        success: true,
        title: 'Authorization Successful!',
        message: 'Your new refresh token is ready',
        refreshToken: refreshToken,
        accessToken: accessToken,
        expiresIn: expiresIn
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
}

function generateHtmlResponse(options: HtmlResponseOptions): string {
  const { success, title, message, details, refreshToken, accessToken, expiresIn } = options

  const statusColor = success ? '#10b981' : '#ef4444'
  const statusIcon = success ? '✓' : '✗'

  let tokenSection = ''
  if (refreshToken) {
    tokenSection = `
      <div style="margin-top: 24px; padding: 16px; background: #1e293b; border-radius: 8px; border: 1px solid #334155;">
        <h3 style="color: #94a3b8; margin: 0 0 12px 0; font-size: 14px;">REFRESH TOKEN (Copy this to .env.local)</h3>
        <div style="position: relative;">
          <pre id="refreshToken" style="background: #0f172a; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; color: #22d3ee; margin: 0; word-break: break-all; white-space: pre-wrap;">${refreshToken}</pre>
          <button onclick="copyToken('refreshToken')" style="position: absolute; top: 8px; right: 8px; background: #334155; border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">Copy</button>
        </div>
      </div>

      <div style="margin-top: 16px; padding: 16px; background: #1e293b; border-radius: 8px; border: 1px solid #334155;">
        <h3 style="color: #94a3b8; margin: 0 0 12px 0; font-size: 14px;">Update your .env.local file:</h3>
        <pre style="background: #0f172a; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; color: #a5f3fc; margin: 0;">GOOGLE_ADS_REFRESH_TOKEN=${refreshToken}</pre>
      </div>

      <div style="margin-top: 16px; padding: 12px; background: #422006; border-radius: 8px; border: 1px solid #92400e;">
        <p style="color: #fbbf24; margin: 0; font-size: 13px;">
          <strong>⚠️ Important:</strong> After updating .env.local, restart your development server for the changes to take effect.
        </p>
      </div>

      ${accessToken ? `
      <details style="margin-top: 16px;">
        <summary style="color: #94a3b8; cursor: pointer; font-size: 14px;">Access Token (expires in ${expiresIn || 3600} seconds)</summary>
        <pre style="background: #0f172a; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 11px; color: #6b7280; margin-top: 8px; word-break: break-all; white-space: pre-wrap;">${accessToken}</pre>
      </details>
      ` : ''}
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
      max-width: 700px;
      margin: 0 auto;
      padding: 32px;
      background: #1e293b;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    }
    .status {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .status-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      color: white;
      background: ${statusColor};
    }
    h1 { margin: 0; font-size: 24px; }
    .message { color: #94a3b8; font-size: 16px; margin: 8px 0 0 0; }
    .details { color: #64748b; font-size: 14px; margin-top: 16px; padding: 12px; background: #0f172a; border-radius: 4px; }
    .back-link {
      display: inline-block;
      margin-top: 24px;
      color: #22d3ee;
      text-decoration: none;
    }
    .back-link:hover { text-decoration: underline; }
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
    <a href="/" class="back-link">← Back to Keyword Planner</a>
  </div>
</body>
</html>
  `
}
