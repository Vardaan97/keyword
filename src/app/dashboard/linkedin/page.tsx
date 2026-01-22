'use client'

import { useState, useEffect, useCallback } from 'react'
import { MetricCard } from '@/components/dashboard/MetricCard'

interface AdAccount {
  urn: string
  id: string
  name: string
  status: string
  type: string
  currency?: string
}

interface LeadForm {
  id: string
  urn: string
  name: string
  status: string
  createdAt?: string
}

interface Lead {
  id: string
  formId: string
  submittedAt: string
  // Parsed contact fields
  firstName: string
  lastName: string
  fullName: string
  email: string
  phone: string
  company: string
  jobTitle: string
  linkedinProfileUrl: string
  city: string
  country: string
  // Raw data
  rawAnswers: Array<{
    questionId: string
    answer: string
  }>
  customAnswers: Array<{
    questionId: string
    answer: string
  }>
}

interface LinkedInData {
  accounts: AdAccount[]
  forms: LeadForm[]
  leads: Lead[]
  user?: {
    name?: string
    email?: string
  }
}

interface LeadStats {
  total: number
  last7Days: number
  last30Days: number
  byStatus: Record<string, number>
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    contacted: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    qualified: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    converted: 'bg-green-500/20 text-green-400 border-green-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
  }
  return (
    <span className={`px-2 py-0.5 text-xs rounded border font-medium ${colors[status] || colors.new}`}>
      {status.toUpperCase()}
    </span>
  )
}

export default function LinkedInDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<LinkedInData>({ accounts: [], forms: [], leads: [] })
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'company'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    checkConnection()
  }, [])

  const checkConnection = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/linkedin/accounts')
      const result = await response.json()

      if (result.success) {
        const adAccountItems = result.data?.adAccounts?.items || []
        const adAccountError = result.data?.adAccounts?.error
        const profile = result.data?.profile

        if (adAccountError && adAccountError.toLowerCase().includes('revoked')) {
          setIsConnected(false)
          setError('LinkedIn access has been revoked. Please reconnect your account.')
          return
        }

        if (adAccountItems.length > 0) {
          setIsConnected(true)
          setData(prev => ({
            ...prev,
            accounts: adAccountItems,
            user: profile
          }))
          // Default to Vardaan's ad account (514911918) if available
          const vardaanAccount = adAccountItems.find((a: AdAccount) => a.id === '514911918')
          setSelectedAccount(vardaanAccount?.id || adAccountItems[0].id)
        } else {
          setIsConnected(true)
          setData(prev => ({ ...prev, accounts: [], user: profile }))
          if (adAccountError) {
            setError(`Connected but couldn't fetch ad accounts: ${adAccountError}`)
          }
        }
      } else {
        setIsConnected(false)
        setError(result.error)
      }
    } catch (err) {
      setIsConnected(false)
      setError('Failed to check LinkedIn connection')
    } finally {
      setLoading(false)
    }
  }

  const loadForms = async (accountId: string) => {
    try {
      const accountUrn = `urn:li:sponsoredAccount:${accountId}`
      const response = await fetch(`/api/linkedin/forms?accountUrn=${encodeURIComponent(accountUrn)}`)
      const result = await response.json()

      if (result.success) {
        setData(prev => ({ ...prev, forms: result.data.forms || [] }))
      }
    } catch (err) {
      console.error('Failed to load forms:', err)
    }
  }

  const loadLeads = async (accountId: string) => {
    try {
      const accountUrn = `urn:li:sponsoredAccount:${accountId}`
      const response = await fetch(`/api/linkedin/leads?accountUrn=${encodeURIComponent(accountUrn)}&leadType=SPONSORED`)
      const result = await response.json()

      if (result.success) {
        setData(prev => ({ ...prev, leads: result.data.leads || [] }))
      }
    } catch (err) {
      console.error('Failed to load leads:', err)
    }
  }

  useEffect(() => {
    if (selectedAccount) {
      loadForms(selectedAccount)
      loadLeads(selectedAccount)
    }
  }, [selectedAccount])

  const handleConnect = () => {
    window.location.href = '/api/auth/linkedin'
  }

  // Safely get arrays
  const accounts = Array.isArray(data.accounts) ? data.accounts : []
  const forms = Array.isArray(data.forms) ? data.forms : []
  const leads = Array.isArray(data.leads) ? data.leads : []

  // Calculate stats
  const calculateStats = useCallback((): LeadStats => {
    const now = Date.now()
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

    return {
      total: leads.length,
      last7Days: leads.filter(l => new Date(l.submittedAt).getTime() > sevenDaysAgo).length,
      last30Days: leads.filter(l => new Date(l.submittedAt).getTime() > thirtyDaysAgo).length,
      byStatus: {
        new: leads.length, // All leads are "new" since we don't have status management yet
        contacted: 0,
        qualified: 0,
      }
    }
  }, [leads])

  const stats = calculateStats()

  // Get date range
  const oldestLeadDate = leads.length > 0
    ? Math.min(...leads.map(l => new Date(l.submittedAt).getTime()))
    : null
  const newestLeadDate = leads.length > 0
    ? Math.max(...leads.map(l => new Date(l.submittedAt).getTime()))
    : null

  // Filter and sort leads
  const filteredLeads = leads
    .filter(lead => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          lead.firstName?.toLowerCase().includes(query) ||
          lead.lastName?.toLowerCase().includes(query) ||
          lead.fullName?.toLowerCase().includes(query) ||
          lead.email?.toLowerCase().includes(query) ||
          lead.company?.toLowerCase().includes(query) ||
          lead.jobTitle?.toLowerCase().includes(query)
        )
      }
      return true
    })
    .sort((a, b) => {
      let comparison = 0
      if (sortBy === 'date') {
        comparison = new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
      } else if (sortBy === 'name') {
        comparison = (a.fullName || '').localeCompare(b.fullName || '')
      } else if (sortBy === 'company') {
        comparison = (a.company || '').localeCompare(b.company || '')
      }
      return sortDir === 'asc' ? comparison : -comparison
    })

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-[var(--text-primary)]">
            LinkedIn Ads
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Monitor LinkedIn advertising and lead generation performance
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Account Selector */}
          {isConnected && accounts.length > 0 && (
            <select
              value={selectedAccount || ''}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-sm focus:outline-none focus:border-[var(--accent-electric)]"
            >
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          )}

          {/* Refresh Button */}
          <button
            onClick={checkConnection}
            disabled={loading}
            className="p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-electric)] transition-colors disabled:opacity-50"
          >
            <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && !loading && (
        <div className="rounded-xl border border-[var(--accent-rose)]/30 bg-[var(--accent-rose)]/5 p-4 mb-6 flex items-start gap-3">
          <svg className="w-5 h-5 text-[var(--accent-rose)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--accent-rose)]">LinkedIn Connection Issue</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">{error}</p>
          </div>
          {error.toLowerCase().includes('revoked') && (
            <button
              onClick={handleConnect}
              className="px-4 py-2 rounded-lg bg-[#0A66C2] text-white font-medium text-sm hover:bg-[#0A66C2]/90 transition-colors flex items-center gap-2 flex-shrink-0"
            >
              Reconnect
            </button>
          )}
        </div>
      )}

      {/* Connection Status Banner */}
      {!isConnected && !loading && (
        <div className="rounded-2xl bg-gradient-to-r from-[#0A66C2]/20 via-[#0A66C2]/10 to-transparent border border-[#0A66C2]/30 p-8 mb-8">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-xl bg-[#0A66C2] flex items-center justify-center">
              <svg className="w-12 h-12 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                Connect LinkedIn Ads
              </h2>
              <p className="text-[var(--text-secondary)] text-sm mb-4">
                Connect your LinkedIn Ads account to view campaigns, lead gen forms, and leads.
              </p>
              <button
                onClick={handleConnect}
                className="px-6 py-2.5 rounded-lg bg-[#0A66C2] text-white font-medium text-sm hover:bg-[#0A66C2]/90 transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
                Connect with LinkedIn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connected State */}
      {isConnected && (
        <>
          {/* Data Freshness Header */}
          {leads.length > 0 && oldestLeadDate && newestLeadDate && (
            <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2 bg-[var(--bg-elevated)] rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 text-[var(--accent-electric)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs text-[var(--text-muted)]">Lead data range:</span>
                  <span className="text-sm text-[var(--text-primary)] font-medium">
                    {new Date(oldestLeadDate).toLocaleDateString()} → {new Date(newestLeadDate).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-[var(--bg-elevated)] rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 text-[var(--accent-lime)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs text-[var(--text-muted)]">Latest:</span>
                  <span className="text-sm text-[var(--text-primary)] font-medium">
                    {new Date(newestLeadDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[var(--text-muted)] text-xs">Total Leads</p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.total}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[var(--text-muted)] text-xs">Last 7 Days</p>
              <p className="text-2xl font-bold text-[var(--accent-lime)]">{stats.last7Days}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[var(--text-muted)] text-xs">Last 30 Days</p>
              <p className="text-2xl font-bold text-[var(--accent-electric)]">{stats.last30Days}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[var(--text-muted)] text-xs">New</p>
              <p className="text-2xl font-bold text-blue-400">{stats.byStatus.new}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[var(--text-muted)] text-xs">Contacted</p>
              <p className="text-2xl font-bold text-yellow-400">{stats.byStatus.contacted}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[var(--text-muted)] text-xs">Qualified</p>
              <p className="text-2xl font-bold text-purple-400">{stats.byStatus.qualified}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 mb-6">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search by name, email, company, campaign..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-4 py-2 pl-10 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-electric)]"
                  />
                  <svg className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[var(--text-muted)] text-sm">Sort:</span>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as typeof sortBy)}
                  className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-electric)]"
                >
                  <option value="date">Date</option>
                  <option value="name">Name</option>
                  <option value="company">Company</option>
                </select>
                <button
                  onClick={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg text-[var(--text-secondary)]"
                >
                  {sortDir === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>
          </div>

          {/* Leads Table */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[var(--accent-electric)] border-t-transparent" />
                <p className="mt-2 text-[var(--text-muted)]">Loading leads...</p>
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="text-center py-12 text-[var(--text-muted)]">
                {searchQuery
                  ? 'No leads match your search'
                  : 'No leads found for this account.'}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[var(--bg-tertiary)]">
                      <tr>
                        <th className="text-left p-3 text-xs font-medium text-[var(--text-muted)]">Name</th>
                        <th className="text-left p-3 text-xs font-medium text-[var(--text-muted)]">Contact</th>
                        <th className="text-left p-3 text-xs font-medium text-[var(--text-muted)]">Company</th>
                        <th className="text-left p-3 text-xs font-medium text-[var(--text-muted)]">Job Title</th>
                        <th className="text-left p-3 text-xs font-medium text-[var(--text-muted)]">Location</th>
                        <th className="text-left p-3 text-xs font-medium text-[var(--text-muted)]">Status</th>
                        <th className="text-left p-3 text-xs font-medium text-[var(--text-muted)]">Date & Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {filteredLeads.map(lead => (
                        <tr
                          key={lead.id}
                          className="hover:bg-[var(--bg-tertiary)]/50 transition-colors"
                        >
                          {/* Name */}
                          <td className="p-3">
                            <div className="font-medium text-[var(--text-primary)] text-sm">
                              {lead.fullName || 'Unknown'}
                            </div>
                            {lead.linkedinProfileUrl && (
                              <a
                                href={lead.linkedinProfileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[#0A66C2] hover:underline"
                              >
                                LinkedIn
                              </a>
                            )}
                          </td>

                          {/* Contact */}
                          <td className="p-3">
                            {lead.email && (
                              <a href={`mailto:${lead.email}`} className="text-sm text-[var(--accent-electric)] hover:underline block">
                                {lead.email}
                              </a>
                            )}
                            {lead.phone && (
                              <a href={`tel:${lead.phone}`} className="text-xs text-[var(--text-muted)] hover:underline">
                                {lead.phone}
                              </a>
                            )}
                            {!lead.email && !lead.phone && (
                              <span className="text-sm text-[var(--text-muted)]">-</span>
                            )}
                          </td>

                          {/* Company */}
                          <td className="p-3">
                            <div className="text-sm text-[var(--text-secondary)]">
                              {lead.company || '-'}
                            </div>
                          </td>

                          {/* Job Title */}
                          <td className="p-3 text-sm text-[var(--text-secondary)]">
                            {lead.jobTitle || '-'}
                          </td>

                          {/* Location */}
                          <td className="p-3 text-sm text-[var(--text-secondary)]">
                            {[lead.city, lead.country].filter(Boolean).join(', ') || '-'}
                          </td>

                          {/* Status */}
                          <td className="p-3">
                            <StatusBadge status="new" />
                          </td>

                          {/* Date & Time */}
                          <td className="p-3">
                            <div className="text-sm text-[var(--text-secondary)]">
                              {new Date(lead.submittedAt).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-[var(--text-muted)]">
                              {new Date(lead.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredLeads.length > 0 && (
                  <div className="p-4 border-t border-[var(--border-subtle)] text-sm text-[var(--text-muted)]">
                    Showing {filteredLeads.length} of {leads.length} leads
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
