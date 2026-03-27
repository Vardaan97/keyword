'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface HealthSummary {
  totalUrls: number
  totalChecked: number
  unchecked: number
  ok: number
  redirects: number
  clientErrors: number
  serverErrors: number
  timeouts: number
  notFound: number
  avgResponseTime: number
}

interface HealthResult {
  url: string
  statusCode: number | null
  finalUrl: string | null
  redirectCount: number
  responseTimeMs: number
  error: string | null
  checkedAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

type FilterType = 'all' | 'ok' | 'redirect' | 'error' | 'not_found' | 'timeout'

export default function UrlHealthPage() {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [results, setResults] = useState<HealthResult[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  // Scan state
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState({ processed: 0, total: 0, remaining: 0 })
  const [scanLog, setScanLog] = useState<string[]>([])
  const scanAbortRef = useRef(false)

  // Fetch results
  const fetchResults = useCallback(async (filterType: FilterType = filter, pageNum: number = page) => {
    try {
      const res = await fetch(`/api/gads/url-health-check?filter=${filterType}&page=${pageNum}&limit=50`)
      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to load results')
        return
      }

      setSummary(data.data.summary)
      setResults(data.data.results)
      setPagination(data.data.pagination)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load results')
    }
  }, [filter, page])

  // Initial load
  useEffect(() => {
    setLoading(true)
    fetchResults().finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch on filter/page change
  useEffect(() => {
    fetchResults(filter, page)
  }, [filter, page]) // eslint-disable-line react-hooks/exhaustive-deps

  // Run scan in batches
  const startScan = useCallback(async (force = false) => {
    setScanning(true)
    scanAbortRef.current = false
    setScanLog([])

    let batchNum = 0

    while (!scanAbortRef.current) {
      batchNum++
      setScanLog(prev => [...prev, `Batch ${batchNum}: checking 50 URLs...`])

      try {
        const res = await fetch(`/api/gads/url-health-check?batch=50${force ? '&force=true' : ''}`, {
          method: 'POST',
        })
        const data = await res.json()

        if (!data.success) {
          setScanLog(prev => [...prev, `Error: ${data.error}`])
          break
        }

        const { processed, remaining, total, batchSummary } = data.data

        setScanProgress({ processed: total - remaining, total, remaining })

        const logParts = [
          `Batch ${batchNum}: ${processed} checked`,
          `(${batchSummary.ok} ok, ${batchSummary.redirects} redirect, ${batchSummary.errors} error, ${batchSummary.timeouts} timeout)`,
          `— ${remaining} remaining`,
        ]
        setScanLog(prev => [...prev.slice(-19), logParts.join(' ')])

        // Refresh summary after each batch
        await fetchResults(filter, page)

        if (remaining === 0) {
          setScanLog(prev => [...prev, 'Scan complete!'])
          break
        }

        // Force is only for the first batch
        force = false
      } catch (err) {
        setScanLog(prev => [...prev, `Network error: ${err instanceof Error ? err.message : 'unknown'}`])
        break
      }
    }

    setScanning(false)
  }, [filter, page, fetchResults])

  const stopScan = () => {
    scanAbortRef.current = true
  }

  // Status badge
  const statusBadge = (code: number | null, err: string | null) => {
    if (code === null) return <span className="px-2 py-0.5 rounded text-xs bg-gray-200 text-gray-700">Timeout</span>
    if (code >= 200 && code < 300) return <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">{code}</span>
    if (code >= 300 && code < 400) return <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">{code}</span>
    if (code === 404) return <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">404</span>
    return <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">{code}</span>
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
        <span className="ml-3 text-[var(--text-secondary)]">Loading URL health data...</span>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">URL Health Check</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Check all ad landing page URLs for broken links, redirects, and errors
          </p>
        </div>
        <div className="flex items-center gap-2">
          {scanning ? (
            <button
              onClick={stopScan}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
            >
              Stop Scan
            </button>
          ) : (
            <>
              <button
                onClick={() => startScan(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Run Check
              </button>
              <button
                onClick={() => startScan(true)}
                className="px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--bg-secondary)] text-sm"
              >
                Force Re-check All
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <SummaryCard label="Total URLs" value={summary.totalUrls} />
          <SummaryCard label="Checked" value={summary.totalChecked} subtext={`${summary.unchecked} remaining`} />
          <SummaryCard label="OK (2xx)" value={summary.ok} color="green" />
          <SummaryCard label="Redirects" value={summary.redirects} color="yellow" />
          <SummaryCard label="404 Not Found" value={summary.notFound} color="red" />
          <SummaryCard
            label="Errors/Timeouts"
            value={summary.clientErrors + summary.serverErrors + summary.timeouts}
            color="red"
          />
        </div>
      )}

      {/* Progress bar during scan */}
      {scanning && summary && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm text-[var(--text-secondary)] mb-1">
            <span>Scanning: {scanProgress.processed} / {scanProgress.total}</span>
            <span>{scanProgress.total > 0 ? Math.round((scanProgress.processed / scanProgress.total) * 100) : 0}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${scanProgress.total > 0 ? (scanProgress.processed / scanProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Scan log */}
      {scanLog.length > 0 && (
        <div className="mb-4 p-3 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg max-h-40 overflow-y-auto">
          <div className="space-y-0.5 font-mono text-xs text-[var(--text-secondary)]">
            {scanLog.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-[var(--border-subtle)]">
        {([
          ['all', 'All'],
          ['ok', 'OK (2xx)'],
          ['redirect', 'Redirects'],
          ['error', 'Errors'],
          ['not_found', '404s'],
          ['timeout', 'Timeouts'],
        ] as [FilterType, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setFilter(key); setPage(1) }}
            className={`px-3 py-2 text-sm border-b-2 transition-colors ${
              filter === key
                ? 'border-blue-500 text-blue-600 font-medium'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {label}
            {summary && (
              <span className="ml-1.5 text-xs text-[var(--text-muted)]">
                ({key === 'all' ? summary.totalChecked
                  : key === 'ok' ? summary.ok
                  : key === 'redirect' ? summary.redirects
                  : key === 'error' ? (summary.clientErrors + summary.serverErrors + summary.timeouts)
                  : key === 'not_found' ? summary.notFound
                  : summary.timeouts})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Results table */}
      <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-secondary)]">
            <tr>
              <th className="px-4 py-2.5 text-left text-[var(--text-secondary)] font-medium">URL</th>
              <th className="px-4 py-2.5 text-center text-[var(--text-secondary)] font-medium w-20">Status</th>
              <th className="px-4 py-2.5 text-left text-[var(--text-secondary)] font-medium w-48">Final URL / Error</th>
              <th className="px-4 py-2.5 text-right text-[var(--text-secondary)] font-medium w-20">Time</th>
              <th className="px-4 py-2.5 text-right text-[var(--text-secondary)] font-medium w-32">Checked</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {results.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-secondary)]">
                  {summary && summary.totalChecked === 0
                    ? 'No URLs checked yet. Click "Run Check" to start.'
                    : 'No results match this filter.'}
                </td>
              </tr>
            ) : (
              results.map((r, i) => (
                <tr key={i} className="hover:bg-[var(--bg-secondary)]/50">
                  <td className="px-4 py-2">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-mono text-xs truncate block max-w-md"
                      title={r.url}
                    >
                      {r.url.replace(/^https?:\/\//, '').substring(0, 80)}
                      {r.url.replace(/^https?:\/\//, '').length > 80 ? '...' : ''}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {statusBadge(r.statusCode, r.error)}
                  </td>
                  <td className="px-4 py-2">
                    {r.error ? (
                      <span className="text-xs text-red-600 truncate block max-w-[180px]" title={r.error}>
                        {r.error}
                      </span>
                    ) : r.finalUrl ? (
                      <span className="text-xs text-yellow-600 truncate block max-w-[180px]" title={r.finalUrl}>
                        → {r.finalUrl.replace(/^https?:\/\//, '').substring(0, 50)}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-[var(--text-secondary)]">
                    {r.responseTimeMs ? `${r.responseTimeMs}ms` : '-'}
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-[var(--text-muted)]">
                    {r.checkedAt ? new Date(r.checkedAt).toLocaleString() : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-[var(--text-secondary)]">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} results)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-secondary)] disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              className="px-3 py-1.5 text-sm border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-secondary)] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Average response time */}
      {summary && summary.avgResponseTime > 0 && (
        <div className="mt-4 text-xs text-[var(--text-muted)]">
          Average response time: {summary.avgResponseTime}ms
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, subtext, color }: {
  label: string
  value: number
  subtext?: string
  color?: 'green' | 'yellow' | 'red'
}) {
  const colorClasses = {
    green: 'text-green-600',
    yellow: 'text-yellow-600',
    red: 'text-red-600',
  }

  return (
    <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
      <div className="text-xs text-[var(--text-muted)] mb-1">{label}</div>
      <div className={`text-xl font-bold ${color ? colorClasses[color] : 'text-[var(--text-primary)]'}`}>
        {value.toLocaleString()}
      </div>
      {subtext && <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{subtext}</div>}
    </div>
  )
}
