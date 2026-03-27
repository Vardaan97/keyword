/**
 * URL Health Check API
 *
 * Checks all unique ad URLs from Turso for broken links, redirects, and errors.
 * Processes in batches to work within Vercel serverless timeouts.
 *
 * GET  /api/gads/url-health-check              → Summary + paginated results
 * GET  /api/gads/url-health-check?filter=error  → Filter by status (ok|error|redirect|not_found|timeout)
 * POST /api/gads/url-health-check               → Run a batch of URL checks
 * POST /api/gads/url-health-check?batch=100     → Custom batch size (max 100)
 * POST /api/gads/url-health-check?force=true    → Re-check already checked URLs
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTursoClient, getAllTursoClients, isTursoConfigured } from '@/lib/turso-client'
import PQueue from 'p-queue'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function ensureTable() {
  const client = getTursoClient()
  if (!client) return false

  await client.execute(`
    CREATE TABLE IF NOT EXISTS url_health_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      status_code INTEGER,
      final_url TEXT,
      redirect_count INTEGER DEFAULT 0,
      response_time_ms INTEGER,
      error TEXT,
      checked_at TEXT NOT NULL
    )
  `)
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_health_status ON url_health_checks(status_code)'
  )
  return true
}

async function getAllUniqueUrls(): Promise<string[]> {
  const clients = getAllTursoClients()
  const urlSet = new Set<string>()

  for (const { client } of clients) {
    const result = await client.execute(
      'SELECT DISTINCT final_url FROM ads WHERE final_url IS NOT NULL AND final_url != \'\''
    )
    for (const row of result.rows) {
      const url = row.final_url as string
      if (url.startsWith('http')) urlSet.add(url)
    }
  }

  return Array.from(urlSet).sort()
}

// Realistic browser User-Agent to avoid bot blocking
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function checkUrl(url: string): Promise<{
  statusCode: number | null
  finalUrl: string | null
  redirectCount: number
  responseTimeMs: number
  error: string | null
}> {
  const start = Date.now()

  // Use GET only — many servers (including koenig-solutions.com) redirect
  // HEAD requests to error pages, returning false 500s
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    })

    clearTimeout(timeout)

    // Consume and discard response body to avoid memory leaks
    await response.text().catch(() => {})

    return {
      statusCode: response.status,
      finalUrl: response.url !== url ? response.url : null,
      redirectCount: response.redirected ? 1 : 0,
      responseTimeMs: Date.now() - start,
      error: null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return {
      statusCode: null,
      finalUrl: null,
      redirectCount: 0,
      responseTimeMs: Date.now() - start,
      error: message.length > 200 ? message.substring(0, 200) : message,
    }
  }
}

/**
 * Group URLs by domain so we can rate-limit per domain.
 * Returns groups sorted so different domains are interleaved.
 */
function interleaveByDomain(urls: string[]): string[] {
  const byDomain: Record<string, string[]> = {}
  for (const url of urls) {
    try {
      const domain = new URL(url).hostname
      if (!byDomain[domain]) byDomain[domain] = []
      byDomain[domain].push(url)
    } catch {
      // Invalid URL, just append at end
      if (!byDomain['_invalid']) byDomain['_invalid'] = []
      byDomain['_invalid'].push(url)
    }
  }

  // Round-robin across domains to spread load
  const result: string[] = []
  const queues = Object.values(byDomain)
  let maxLen = 0
  for (const q of queues) maxLen = Math.max(maxLen, q.length)

  for (let i = 0; i < maxLen; i++) {
    for (const q of queues) {
      if (i < q.length) result.push(q[i])
    }
  }

  return result
}

export async function GET(request: NextRequest) {
  if (!isTursoConfigured()) {
    return NextResponse.json({ success: false, error: 'Turso not configured' }, { status: 500 })
  }

  const client = getTursoClient()
  if (!client) {
    return NextResponse.json({ success: false, error: 'Turso client unavailable' }, { status: 500 })
  }

  await ensureTable()

  const params = request.nextUrl.searchParams
  const filter = params.get('filter') || 'all'
  const page = parseInt(params.get('page') || '1')
  const limit = Math.min(parseInt(params.get('limit') || '50'), 200)
  const offset = (page - 1) * limit

  try {
    // Total unique URLs across all Turso databases
    const allUrls = await getAllUniqueUrls()
    const totalUrls = allUrls.length

    // Summary stats
    const summary = await client.execute(`
      SELECT
        COUNT(*) as total_checked,
        SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as ok,
        SUM(CASE WHEN status_code >= 300 AND status_code < 400 THEN 1 ELSE 0 END) as redirects,
        SUM(CASE WHEN status_code >= 400 AND status_code < 500 THEN 1 ELSE 0 END) as client_errors,
        SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as server_errors,
        SUM(CASE WHEN status_code IS NULL AND error IS NOT NULL THEN 1 ELSE 0 END) as timeouts,
        SUM(CASE WHEN status_code = 404 THEN 1 ELSE 0 END) as not_found,
        ROUND(AVG(response_time_ms)) as avg_response_time
      FROM url_health_checks
    `)

    const s = summary.rows[0]

    // Filter clause
    let where = ''
    switch (filter) {
      case 'ok':        where = 'WHERE status_code >= 200 AND status_code < 300'; break
      case 'redirect':  where = 'WHERE status_code >= 300 AND status_code < 400'; break
      case 'error':     where = 'WHERE status_code >= 400 OR (status_code IS NULL AND error IS NOT NULL)'; break
      case 'not_found': where = 'WHERE status_code = 404'; break
      case 'timeout':   where = 'WHERE status_code IS NULL AND error IS NOT NULL'; break
      default:          where = ''
    }

    // Paginated results
    const results = await client.execute({
      sql: `SELECT url, status_code, final_url, redirect_count, response_time_ms, error, checked_at
            FROM url_health_checks ${where}
            ORDER BY CASE WHEN status_code IS NULL THEN 0 WHEN status_code >= 400 THEN 1 ELSE 2 END, checked_at DESC
            LIMIT ? OFFSET ?`,
      args: [limit, offset],
    })

    const countResult = await client.execute(
      `SELECT COUNT(*) as count FROM url_health_checks ${where}`
    )

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalUrls,
          totalChecked: (s.total_checked as number) || 0,
          unchecked: totalUrls - ((s.total_checked as number) || 0),
          ok: (s.ok as number) || 0,
          redirects: (s.redirects as number) || 0,
          clientErrors: (s.client_errors as number) || 0,
          serverErrors: (s.server_errors as number) || 0,
          timeouts: (s.timeouts as number) || 0,
          notFound: (s.not_found as number) || 0,
          avgResponseTime: (s.avg_response_time as number) || 0,
        },
        results: results.rows.map(r => ({
          url: r.url,
          statusCode: r.status_code,
          finalUrl: r.final_url,
          redirectCount: r.redirect_count,
          responseTimeMs: r.response_time_ms,
          error: r.error,
          checkedAt: r.checked_at,
        })),
        pagination: {
          page,
          limit,
          total: countResult.rows[0].count as number,
          totalPages: Math.ceil((countResult.rows[0].count as number) / limit),
        },
      },
    })
  } catch (error) {
    console.error('[URL-HEALTH] GET error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get results',
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!isTursoConfigured()) {
    return NextResponse.json({ success: false, error: 'Turso not configured' }, { status: 500 })
  }

  const client = getTursoClient()
  if (!client) {
    return NextResponse.json({ success: false, error: 'Turso client unavailable' }, { status: 500 })
  }

  await ensureTable()

  const params = request.nextUrl.searchParams
  const batchSize = Math.min(parseInt(params.get('batch') || '50'), 100)
  const force = params.get('force') === 'true'

  try {
    const allUrls = await getAllUniqueUrls()

    // Determine which URLs need checking
    let uncheckedUrls: string[]
    if (force) {
      uncheckedUrls = allUrls
    } else {
      const checked = await client.execute('SELECT url FROM url_health_checks')
      const checkedSet = new Set(checked.rows.map(r => r.url as string))
      uncheckedUrls = allUrls.filter(url => !checkedSet.has(url))
    }

    if (uncheckedUrls.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          message: 'All URLs already checked',
          processed: 0,
          remaining: 0,
          total: allUrls.length,
        },
      })
    }

    // Process a batch — interleave by domain to avoid hammering one server
    const batch = interleaveByDomain(uncheckedUrls.slice(0, batchSize))

    // Low concurrency (3) with 500ms spacing to avoid rate-limiting
    const queue = new PQueue({ concurrency: 3, interval: 500, intervalCap: 3 })

    const results: { url: string; result: Awaited<ReturnType<typeof checkUrl>> }[] = []

    for (const url of batch) {
      queue.add(async () => {
        const result = await checkUrl(url)
        results.push({ url, result })
        // Small delay between requests to same domain
        await sleep(100)
      })
    }

    await queue.onIdle()

    // Batch insert results into Turso
    const insertStatements = results.map(({ url, result }) => ({
      sql: 'INSERT OR REPLACE INTO url_health_checks (url, status_code, final_url, redirect_count, response_time_ms, error, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [
        url,
        result.statusCode,
        result.finalUrl,
        result.redirectCount,
        result.responseTimeMs,
        result.error,
        new Date().toISOString(),
      ] as (string | number | null)[],
    }))

    // Batch insert in chunks of 20 (Turso batch limit)
    for (let i = 0; i < insertStatements.length; i += 20) {
      await client.batch(insertStatements.slice(i, i + 20), 'write')
    }

    // Batch summary
    const batchSummary = {
      ok: results.filter(r => r.result.statusCode && r.result.statusCode >= 200 && r.result.statusCode < 300).length,
      redirects: results.filter(r => r.result.statusCode && r.result.statusCode >= 300 && r.result.statusCode < 400).length,
      errors: results.filter(r => r.result.statusCode && r.result.statusCode >= 400).length,
      timeouts: results.filter(r => !r.result.statusCode && r.result.error).length,
    }

    return NextResponse.json({
      success: true,
      data: {
        processed: batch.length,
        remaining: uncheckedUrls.length - batch.length,
        total: allUrls.length,
        batchSummary,
        problems: results
          .filter(r => !r.result.statusCode || r.result.statusCode >= 400)
          .slice(0, 20)
          .map(r => ({
            url: r.url,
            statusCode: r.result.statusCode,
            error: r.result.error,
          })),
      },
    })
  } catch (error) {
    console.error('[URL-HEALTH] POST error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run health check',
    }, { status: 500 })
  }
}
