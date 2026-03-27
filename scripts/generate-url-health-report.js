#!/usr/bin/env node
/**
 * Generate URL Health Report
 *
 * Queries Turso for all URL health check results and generates:
 * - data/url-health-report.md   — Markdown report with summary + tables
 * - data/url-health-report.tsv  — Tab-separated file for Google Sheets
 *
 * Usage: node scripts/generate-url-health-report.js
 * Re-run anytime to update with latest scan results.
 */

const { createClient } = require('@libsql/client')
const fs = require('fs')
const path = require('path')

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const TURSO_URL = (process.env.TURSO_DATABASE_URL || '').replace('libsql://', 'https://')
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || ''

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env.local')
  process.exit(1)
}

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })
const OUT_DIR = path.join(__dirname, '..', 'data')

async function main() {
  // Ensure output directory exists
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

  // Get summary stats
  const summary = await client.execute(`
    SELECT
      COUNT(*) as total_checked,
      SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as ok,
      SUM(CASE WHEN status_code >= 300 AND status_code < 400 THEN 1 ELSE 0 END) as redirects,
      SUM(CASE WHEN status_code = 404 THEN 1 ELSE 0 END) as not_found,
      SUM(CASE WHEN status_code >= 400 AND status_code < 500 AND status_code != 404 THEN 1 ELSE 0 END) as other_client,
      SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as server_errors,
      SUM(CASE WHEN status_code IS NULL AND error IS NOT NULL THEN 1 ELSE 0 END) as timeouts,
      ROUND(AVG(response_time_ms)) as avg_time
    FROM url_health_checks
  `)
  const s = summary.rows[0]

  // Get all problem URLs (non-200)
  const problems = await client.execute(`
    SELECT url, status_code, final_url, response_time_ms, error, checked_at
    FROM url_health_checks
    WHERE status_code IS NULL OR status_code >= 400 OR (status_code >= 300 AND status_code < 400)
    ORDER BY
      CASE
        WHEN status_code = 404 THEN 1
        WHEN status_code >= 500 THEN 2
        WHEN status_code IS NULL THEN 3
        WHEN status_code >= 400 THEN 4
        ELSE 5
      END,
      url
  `)

  // Get all results for TSV
  const allResults = await client.execute(`
    SELECT url, status_code, final_url, redirect_count, response_time_ms, error, checked_at
    FROM url_health_checks
    ORDER BY
      CASE
        WHEN status_code IS NULL THEN 0
        WHEN status_code >= 500 THEN 1
        WHEN status_code = 404 THEN 2
        WHEN status_code >= 400 THEN 3
        ELSE 9
      END,
      url
  `)

  // Domain breakdown of problems
  const domainCounts = {}
  for (const r of problems.rows) {
    const url = new URL(r.url)
    const domain = url.hostname
    const status = r.status_code || 'TIMEOUT'
    const key = `${domain}`
    if (!domainCounts[key]) domainCounts[key] = { domain, total: 0, statuses: {} }
    domainCounts[key].total++
    domainCounts[key].statuses[status] = (domainCounts[key].statuses[status] || 0) + 1
  }
  const sortedDomains = Object.values(domainCounts).sort((a, b) => b.total - a.total)

  const now = new Date().toISOString().replace('T', ' ').split('.')[0]
  const totalChecked = Number(s.total_checked) || 0
  const okCount = Number(s.ok) || 0
  const notFound = Number(s.not_found) || 0
  const timeouts = Number(s.timeouts) || 0
  const serverErrors = Number(s.server_errors) || 0
  const otherClient = Number(s.other_client) || 0
  const redirects = Number(s.redirects) || 0

  // ===================== MARKDOWN REPORT =====================
  const md = []
  md.push('# URL Health Check Report')
  md.push('')
  md.push(`**Generated:** ${now}`)
  md.push(`**Total URLs in Google Ads:** 9,482`)
  md.push(`**URLs Checked:** ${totalChecked.toLocaleString()}`)
  md.push(`**Average Response Time:** ${s.avg_time || 0}ms`)
  md.push('')
  md.push('## Summary')
  md.push('')
  md.push('| Status | Count | % |')
  md.push('|--------|------:|---:|')
  const pct = (v) => totalChecked > 0 ? (v / totalChecked * 100).toFixed(1) + '%' : '0%'
  md.push(`| OK (200) | ${okCount.toLocaleString()} | ${pct(okCount)} |`)
  md.push(`| Redirects (3xx) | ${redirects.toLocaleString()} | ${pct(redirects)} |`)
  md.push(`| 404 Not Found | ${notFound.toLocaleString()} | ${pct(notFound)} |`)
  md.push(`| Other Client Errors | ${otherClient.toLocaleString()} | ${pct(otherClient)} |`)
  md.push(`| Server Errors (5xx) | ${serverErrors.toLocaleString()} | ${pct(serverErrors)} |`)
  md.push(`| Timeouts | ${timeouts.toLocaleString()} | ${pct(timeouts)} |`)
  md.push('')
  md.push('## Problem Domains')
  md.push('')
  md.push('| Domain | Count | Status Codes |')
  md.push('|--------|------:|-------------|')
  for (const d of sortedDomains) {
    const statuses = Object.entries(d.statuses).map(([s, c]) => `${s}(${c})`).join(', ')
    md.push(`| ${d.domain} | ${d.total} | ${statuses} |`)
  }
  md.push('')
  md.push('## Action Required: 404 URLs to Disable in Google Ads')
  md.push('')
  md.push('These URLs return 404 and should be paused/removed from campaigns:')
  md.push('')
  md.push('| URL | Status | Checked |')
  md.push('|-----|-------:|---------|')
  for (const r of problems.rows) {
    if (r.status_code === 404) {
      const shortUrl = String(r.url).replace('https://www.koenig-solutions.com', '')
        .replace('https://koenig-solutions.com', '')
      const date = String(r.checked_at).split('T')[0]
      md.push(`| ${shortUrl} | 404 | ${date} |`)
    }
  }
  md.push('')
  md.push('## Timeout URLs (Dead Domains)')
  md.push('')
  md.push('These domains are completely unreachable:')
  md.push('')
  md.push('| URL | Error | Checked |')
  md.push('|-----|-------|---------|')
  const seenTimeoutDomains = new Set()
  for (const r of problems.rows) {
    if (r.status_code === null) {
      try {
        const domain = new URL(String(r.url)).hostname
        if (seenTimeoutDomains.has(domain)) continue
        seenTimeoutDomains.add(domain)
        const date = String(r.checked_at).split('T')[0]
        md.push(`| ${domain} (${problems.rows.filter(x => x.status_code === null && String(x.url).includes(domain)).length} URLs) | ${r.error || 'timeout'} | ${date} |`)
      } catch { /* skip invalid URLs */ }
    }
  }
  md.push('')
  md.push('---')
  md.push(`*Report auto-generated by URL Health Check. Re-run: \`node scripts/generate-url-health-report.js\`*`)

  const mdPath = path.join(OUT_DIR, 'url-health-report.md')
  fs.writeFileSync(mdPath, md.join('\n'))
  console.log(`Markdown report: ${mdPath}`)

  // ===================== TSV FILE =====================
  const tsv = []
  tsv.push(['URL', 'Status Code', 'Status', 'Final URL', 'Response Time (ms)', 'Error', 'Checked At', 'Action'].join('\t'))

  for (const r of allResults.rows) {
    const code = r.status_code
    let status = 'Unknown'
    let action = ''
    if (code === null) {
      status = 'TIMEOUT'
      action = 'DISABLE - Domain unreachable'
    } else if (code >= 200 && code < 300) {
      status = 'OK'
      action = ''
    } else if (code >= 300 && code < 400) {
      status = 'REDIRECT'
      action = 'Review redirect target'
    } else if (code === 404) {
      status = '404 NOT FOUND'
      action = 'DISABLE - Page does not exist'
    } else if (code === 410) {
      status = '410 GONE'
      action = 'DISABLE - Page permanently removed'
    } else if (code >= 400) {
      status = `CLIENT ERROR ${code}`
      action = 'Review - access issue'
    } else if (code >= 500) {
      status = `SERVER ERROR ${code}`
      action = 'Review - server issue'
    }

    tsv.push([
      r.url,
      code || '',
      status,
      r.final_url || '',
      r.response_time_ms || '',
      r.error || '',
      r.checked_at || '',
      action,
    ].join('\t'))
  }

  const tsvPath = path.join(OUT_DIR, 'url-health-report.tsv')
  fs.writeFileSync(tsvPath, tsv.join('\n'))
  console.log(`TSV report:      ${tsvPath} (${allResults.rows.length} rows — open in Google Sheets)`)

  // Print summary
  console.log()
  console.log(`Checked: ${totalChecked} | OK: ${okCount} | 404: ${notFound} | Timeout: ${timeouts} | Errors: ${serverErrors + otherClient}`)
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
