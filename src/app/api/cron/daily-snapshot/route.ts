import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max for cron jobs

/**
 * Cron job endpoint for creating daily snapshots
 * Runs at midnight UTC via Vercel Cron
 *
 * Schedule: 0 0 * * * (daily at midnight)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  // Verify this is a Vercel Cron request (in production)
  const authHeader = request.headers.get('authorization')
  if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.warn('[CRON/DAILY-SNAPSHOT] Unauthorized cron request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  console.log('[CRON/DAILY-SNAPSHOT] Starting scheduled daily snapshot...')

  try {
    // Call the snapshot endpoint internally
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3005'

    const response = await fetch(`${baseUrl}/api/gads/snapshots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // No specific account = all accounts
      }),
    })

    const result = await response.json()
    const duration = Date.now() - startTime

    if (!result.success) {
      console.error('[CRON/DAILY-SNAPSHOT] Snapshot failed:', result.error)
      return NextResponse.json({
        success: false,
        error: result.error,
        durationMs: duration,
        source: 'vercel_cron',
      }, { status: 500 })
    }

    console.log(`[CRON/DAILY-SNAPSHOT] Snapshot completed in ${duration}ms`)
    console.log(`[CRON/DAILY-SNAPSHOT] Results:`, {
      date: result.data?.snapshotDate,
      accounts: result.data?.accounts,
    })

    return NextResponse.json({
      success: true,
      data: result.data,
      source: 'vercel_cron',
      durationMs: duration,
    })
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[CRON/DAILY-SNAPSHOT] Error:', errorMsg)

    return NextResponse.json({
      success: false,
      error: errorMsg,
      durationMs: duration,
      source: 'vercel_cron',
    }, { status: 500 })
  }
}

// Also support POST for manual triggers
export { GET as POST }
