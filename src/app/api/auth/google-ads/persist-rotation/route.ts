/**
 * Internal endpoint for persisting a rotated refresh token captured by getAccessToken
 * in src/lib/google-ads.ts. Called via fetch from server-side code paths only.
 *
 * Why this exists: getAccessToken in google-ads.ts is statically imported by
 * src/lib/store.ts (for GOOGLE_ADS_ACCOUNTS), which puts google-ads.ts into the
 * client bundle. A direct lazy import of token-storage.ts (which uses 'fs')
 * causes Turbopack to bundle 'fs' into the browser. Using an HTTP fetch to a
 * server-only route handler avoids that — the bundler never sees a path
 * connecting client code to 'fs'.
 *
 * This route is unauthenticated by design — it's only callable from inside the
 * Vercel deployment's runtime (we use the deployment's own URL via VERCEL_URL).
 * If you wanted to harden it further, add an internal-API key shared between
 * google-ads.ts and this route via an env var.
 */

import { NextRequest, NextResponse } from 'next/server'
import { saveTokens } from '@/lib/token-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PersistBody {
  refreshToken: string
  accessToken?: string
  expiresIn?: number
  userEmail?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PersistBody
    if (!body.refreshToken || typeof body.refreshToken !== 'string') {
      return NextResponse.json({ ok: false, error: 'refreshToken required' }, { status: 400 })
    }

    await saveTokens({
      refreshToken: body.refreshToken,
      accessToken: body.accessToken,
      expiresIn: body.expiresIn,
      userEmail: body.userEmail,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[persist-rotation] error:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
