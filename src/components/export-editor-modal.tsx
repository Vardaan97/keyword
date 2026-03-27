'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AnalyzedKeyword, Action } from '@/types'
import {
  generateMultiCampaignExport,
  generateMultiCampaignExtendedExport,
  SelectedCampaign,
  downloadExport,
  copyToClipboard,
} from '@/lib/export-gads-editor'
import {
  getVendorAuthorization,
  type GeoAuthorization,
} from '@/lib/geo-authorization'
import {
  Download,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  Filter,
  Search,
  MapPin,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react'

interface ExportEditorModalProps {
  open: boolean
  onClose: () => void
  keywords: AnalyzedKeyword[]
  courseUrl: string
  courseName: string
  targetCountry: string
  selectedAccountId: string
  vendor?: string
}

interface TursoCampaignMatch {
  accountName: string
  campaignName: string
  adGroupName: string
  campaignStatus: string | null
  adGroupStatus: string | null
  adStrength: string | null
  locations: string[]
  authorized: boolean
  finalUrl: string
}

const ACTION_OPTIONS: Action[] = ['ADD', 'BOOST', 'MONITOR', 'OPTIMIZE', 'REVIEW']
const MATCH_TYPE_OPTIONS = ['Exact', 'Phrase', 'Broad'] as const

function makeCampaignKey(m: TursoCampaignMatch): string {
  return `${m.accountName}|${m.campaignName}|${m.adGroupName}`
}

export function ExportEditorModal({
  open,
  onClose,
  keywords,
  courseUrl,
  courseName,
  targetCountry,
  selectedAccountId,
  vendor,
}: ExportEditorModalProps) {
  // Campaign selection state
  const [loading, setLoading] = useState(true)
  const [tursoMatches, setTursoMatches] = useState<TursoCampaignMatch[]>([])
  const [selectedCampaignKeys, setSelectedCampaignKeys] = useState<Set<string>>(new Set())
  const [campaignSearch, setCampaignSearch] = useState('')
  const [showOnlyAuthorized, setShowOnlyAuthorized] = useState(false)
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())
  const [vendorAuth, setVendorAuth] = useState<GeoAuthorization | null>(null)

  // Keyword & export state
  const [selectedActions, setSelectedActions] = useState<Action[]>(['ADD', 'BOOST'])
  const [selectedMatchTypes, setSelectedMatchTypes] = useState<('Exact' | 'Phrase' | 'Broad')[]>(['Exact', 'Phrase'])
  const [selectedKeywordSet, setSelectedKeywordSet] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const [showAllKeywords, setShowAllKeywords] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load data when modal opens
  useEffect(() => {
    if (!open) return

    const loadData = async () => {
      setLoading(true)
      setError(null)

      try {
        // Fetch Turso matches for the course URL
        const response = await fetch(`/api/gads/turso-lookup?url=${encodeURIComponent(courseUrl)}`)

        if (!response.ok) {
          throw new Error(`Turso lookup failed: ${response.status}`)
        }

        const data = await response.json()

        if (!data.success) {
          throw new Error(data.error || 'Turso lookup failed')
        }

        // Get vendor geo-authorization
        const auth = vendor ? getVendorAuthorization(vendor) : null
        setVendorAuth(auth)

        // Parse grouped response into flat list
        const matches: TursoCampaignMatch[] = []
        const accounts = data.data?.accounts || {}

        for (const [accountName, accountData] of Object.entries(accounts)) {
          const acct = accountData as {
            campaigns: {
              name: string
              status: string | null
              locations: string[]
              adGroups: { name: string; status: string | null; adStrength: string | null; finalUrl?: string }[]
            }[]
          }
          for (const campaign of acct.campaigns) {
            for (const adGroup of campaign.adGroups) {
              // Check geo authorization
              let authorized = true
              if (auth && !auth.isGlobal) {
                authorized = campaign.locations.some(loc =>
                  auth.authorizedCountries.some(c =>
                    loc.toLowerCase().includes(c.toLowerCase()) ||
                    c.toLowerCase().includes(loc.toLowerCase())
                  )
                )
              }

              matches.push({
                accountName,
                campaignName: campaign.name,
                adGroupName: adGroup.name,
                campaignStatus: campaign.status,
                adGroupStatus: adGroup.status,
                adStrength: adGroup.adStrength,
                locations: campaign.locations,
                authorized,
                finalUrl: adGroup.finalUrl || courseUrl,
              })
            }
          }
        }

        setTursoMatches(matches)

        // Auto-select authorized + enabled campaigns
        const autoSelected = new Set<string>()
        for (const m of matches) {
          if (m.authorized && m.campaignStatus === 'Enabled') {
            autoSelected.add(makeCampaignKey(m))
          }
        }
        setSelectedCampaignKeys(autoSelected)

        // Expand all accounts by default
        setExpandedAccounts(new Set(matches.map(m => m.accountName)))

        // Auto-select keywords by default actions
        setSelectedKeywordSet(new Set(
          keywords
            .filter(kw => ['ADD', 'BOOST'].includes(kw.action))
            .map(kw => kw.keyword)
        ))
      } catch (err) {
        console.error('[EXPORT-MODAL] Error loading Turso data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load campaign data')
      }

      setLoading(false)
    }

    loadData()
  }, [open, courseUrl, vendor, keywords])

  // Update keyword selection when action filters change
  useEffect(() => {
    setSelectedKeywordSet(new Set(
      keywords
        .filter(kw => selectedActions.includes(kw.action))
        .map(kw => kw.keyword)
    ))
  }, [selectedActions, keywords])

  // Filtered campaigns
  const filteredCampaigns = useMemo(() => {
    let filtered = tursoMatches
    if (showOnlyAuthorized) {
      filtered = filtered.filter(m => m.authorized)
    }
    if (campaignSearch) {
      const search = campaignSearch.toLowerCase()
      filtered = filtered.filter(m =>
        m.campaignName.toLowerCase().includes(search) ||
        m.adGroupName.toLowerCase().includes(search) ||
        m.accountName.toLowerCase().includes(search) ||
        m.locations.some(l => l.toLowerCase().includes(search))
      )
    }
    return filtered
  }, [tursoMatches, showOnlyAuthorized, campaignSearch])

  // Group campaigns by account
  const campaignsByAccount = useMemo(() => {
    const grouped: Record<string, TursoCampaignMatch[]> = {}
    for (const m of filteredCampaigns) {
      if (!grouped[m.accountName]) grouped[m.accountName] = []
      grouped[m.accountName].push(m)
    }
    return grouped
  }, [filteredCampaigns])

  // Keywords for display
  const displayKeywords = useMemo(() => {
    const filtered = keywords
      .filter(kw => selectedActions.includes(kw.action))
      .sort((a, b) => b.finalScore - a.finalScore)
    return showAllKeywords ? filtered : filtered.slice(0, 50)
  }, [keywords, selectedActions, showAllKeywords])

  const totalFilteredKeywords = useMemo(() => {
    return keywords.filter(kw => selectedActions.includes(kw.action)).length
  }, [keywords, selectedActions])

  // Stats
  const selectedKeywordsCount = selectedKeywordSet.size
  const selectedCampaignsCount = selectedCampaignKeys.size
  const exportRows = selectedKeywordsCount * selectedCampaignsCount * selectedMatchTypes.length

  // Toggle helpers
  const toggleAction = (action: Action) => {
    setSelectedActions(prev =>
      prev.includes(action) ? prev.filter(a => a !== action) : [...prev, action]
    )
  }

  const toggleMatchType = (matchType: 'Exact' | 'Phrase' | 'Broad') => {
    setSelectedMatchTypes(prev =>
      prev.includes(matchType) ? prev.filter(m => m !== matchType) : [...prev, matchType]
    )
  }

  const toggleCampaign = (key: string) => {
    setSelectedCampaignKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAccount = (accountName: string) => {
    setExpandedAccounts(prev => {
      const next = new Set(prev)
      if (next.has(accountName)) next.delete(accountName)
      else next.add(accountName)
      return next
    })
  }

  const toggleKeyword = (keyword: string) => {
    setSelectedKeywordSet(prev => {
      const next = new Set(prev)
      if (next.has(keyword)) next.delete(keyword)
      else next.add(keyword)
      return next
    })
  }

  // Bulk campaign selection
  const selectAllCampaigns = () => {
    setSelectedCampaignKeys(new Set(filteredCampaigns.map(m => makeCampaignKey(m))))
  }

  const selectAuthorizedOnly = () => {
    setSelectedCampaignKeys(new Set(
      filteredCampaigns
        .filter(m => m.authorized && m.campaignStatus === 'Enabled')
        .map(m => makeCampaignKey(m))
    ))
  }

  const clearCampaignSelection = () => {
    setSelectedCampaignKeys(new Set())
  }

  // Export helpers
  const getSelectedCampaigns = useCallback((): SelectedCampaign[] => {
    return tursoMatches
      .filter(m => selectedCampaignKeys.has(makeCampaignKey(m)))
      .map(m => ({
        campaignName: m.campaignName,
        adGroupName: m.adGroupName,
        finalUrl: m.finalUrl,
        accountName: m.accountName,
      }))
  }, [tursoMatches, selectedCampaignKeys])

  const getSelectedKeywords = useCallback((): AnalyzedKeyword[] => {
    return keywords.filter(kw => selectedKeywordSet.has(kw.keyword))
  }, [keywords, selectedKeywordSet])

  const handleExport = useCallback(() => {
    const content = generateMultiCampaignExport(
      getSelectedKeywords(),
      getSelectedCampaigns(),
      selectedMatchTypes
    )
    const filename = `${courseName.replace(/[^a-z0-9]/gi, '_')}_multi_campaign.txt`
    downloadExport(content, filename, 'tab')
  }, [getSelectedKeywords, getSelectedCampaigns, selectedMatchTypes, courseName])

  const handleExportExtended = useCallback(() => {
    const content = generateMultiCampaignExtendedExport(
      getSelectedKeywords(),
      getSelectedCampaigns(),
      selectedMatchTypes
    )
    const filename = `${courseName.replace(/[^a-z0-9]/gi, '_')}_multi_campaign_extended.txt`
    downloadExport(content, filename, 'tab')
  }, [getSelectedKeywords, getSelectedCampaigns, selectedMatchTypes, courseName])

  const handleCopy = useCallback(async () => {
    const content = generateMultiCampaignExport(
      getSelectedKeywords(),
      getSelectedCampaigns(),
      selectedMatchTypes
    )
    const success = await copyToClipboard(content)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [getSelectedKeywords, getSelectedCampaigns, selectedMatchTypes])

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            Export to Google Ads Editor
            {vendor && (
              <Badge variant="outline" className="ml-2 text-xs">
                {vendor}
                {vendorAuth && !vendorAuth.isGlobal && (
                  <span className="ml-1 text-amber-500">(Geo-restricted)</span>
                )}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Select campaigns and keywords for multi-campaign export
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading campaign data from Turso...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-red-600">
            <AlertTriangle className="h-6 w-6 mr-2" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            {/* Campaign Selection Panel */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 max-h-[35vh] overflow-hidden flex flex-col">
              {/* Campaign header bar */}
              <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-3 flex-shrink-0">
                <span className="text-sm font-medium text-gray-700">
                  Campaigns ({selectedCampaignsCount} of {tursoMatches.length} selected)
                </span>

                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Filter campaigns..."
                    value={campaignSearch}
                    onChange={(e) => setCampaignSearch(e.target.value)}
                    className="w-full pl-7 pr-3 py-1 text-xs border border-gray-200 rounded-md bg-white"
                  />
                </div>

                <div className="flex items-center gap-1 ml-auto">
                  <button onClick={selectAllCampaigns} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">
                    All
                  </button>
                  <button onClick={selectAuthorizedOnly} className="px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded">
                    Authorized
                  </button>
                  <button onClick={clearCampaignSelection} className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded">
                    Clear
                  </button>
                  {vendorAuth && !vendorAuth.isGlobal && (
                    <label className="flex items-center gap-1 text-xs text-gray-600 ml-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showOnlyAuthorized}
                        onChange={() => setShowOnlyAuthorized(!showOnlyAuthorized)}
                        className="rounded border-gray-300"
                      />
                      Hide unauthorized
                    </label>
                  )}
                </div>
              </div>

              {/* Campaign list grouped by account */}
              <div className="overflow-auto flex-1">
                {Object.keys(campaignsByAccount).length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">
                    No campaigns found for this URL
                  </div>
                ) : (
                  Object.entries(campaignsByAccount).map(([accountName, campaigns]) => (
                    <div key={accountName} className="border-b border-gray-100 last:border-0">
                      {/* Account header */}
                      <button
                        onClick={() => toggleAccount(accountName)}
                        className="w-full px-4 py-1.5 flex items-center gap-2 hover:bg-gray-100 text-left"
                      >
                        {expandedAccounts.has(accountName) ? (
                          <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-gray-600">{accountName}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {campaigns.length}
                        </Badge>
                        <span className="text-[10px] text-gray-400 ml-auto">
                          {campaigns.filter(c => selectedCampaignKeys.has(makeCampaignKey(c))).length} selected
                        </span>
                      </button>

                      {/* Campaign rows */}
                      {expandedAccounts.has(accountName) && (
                        <div className="pl-6">
                          {campaigns.map(campaign => {
                            const key = makeCampaignKey(campaign)
                            const isSelected = selectedCampaignKeys.has(key)

                            return (
                              <label
                                key={key}
                                className={`flex items-center gap-2 px-3 py-1 hover:bg-gray-100 cursor-pointer text-xs ${
                                  isSelected ? 'bg-blue-50/50' : ''
                                } ${!campaign.authorized ? 'opacity-60' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleCampaign(key)}
                                  className="rounded border-gray-300 h-3.5 w-3.5 flex-shrink-0"
                                />
                                <span className={`flex-1 truncate ${campaign.campaignStatus === 'Paused' ? 'text-gray-400' : 'text-gray-800'}`}>
                                  {campaign.campaignName}
                                </span>
                                <span className="text-[10px] text-gray-400 truncate max-w-[120px] flex-shrink-0">
                                  {campaign.adGroupName}
                                </span>
                                {campaign.campaignStatus === 'Paused' && (
                                  <Badge variant="secondary" className="text-[9px] px-1 py-0 flex-shrink-0">Paused</Badge>
                                )}
                                {campaign.locations.length > 0 && (
                                  <span className="flex items-center gap-0.5 flex-shrink-0">
                                    <MapPin className="h-3 w-3 text-gray-400" />
                                    <span className="text-[10px] text-gray-500 truncate max-w-[80px]">
                                      {campaign.locations.slice(0, 2).join(', ')}
                                      {campaign.locations.length > 2 && ` +${campaign.locations.length - 2}`}
                                    </span>
                                  </span>
                                )}
                                {vendorAuth && !vendorAuth.isGlobal && (
                                  campaign.authorized ? (
                                    <ShieldCheck className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                  ) : (
                                    <ShieldAlert className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                                  )
                                )}
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Filters Row */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-600">Actions:</span>
                {ACTION_OPTIONS.map(action => (
                  <button
                    key={action}
                    onClick={() => toggleAction(action)}
                    className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                      selectedActions.includes(action)
                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {action}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <span className="text-sm text-gray-600">Match Types:</span>
                {MATCH_TYPE_OPTIONS.map(matchType => (
                  <button
                    key={matchType}
                    onClick={() => toggleMatchType(matchType)}
                    className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                      selectedMatchTypes.includes(matchType)
                        ? 'bg-green-100 border-green-300 text-green-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {matchType}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats Row */}
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-600">
                Keywords: <span className="font-medium text-gray-900">{selectedKeywordsCount}</span>
              </span>
              <span className="text-gray-600">
                Campaigns: <span className="font-medium text-gray-900">{selectedCampaignsCount}</span>
              </span>
              <span className="text-gray-600">
                Export rows: <span className="font-medium text-blue-600">{exportRows.toLocaleString()}</span>
              </span>
              <span className="text-[10px] text-gray-400">
                ({selectedKeywordsCount} kw x {selectedCampaignsCount} camp x {selectedMatchTypes.length} match)
              </span>
            </div>

            {/* Keywords Table */}
            <div className="flex-1 overflow-auto border border-gray-200 rounded-lg min-h-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left w-10">
                      <input
                        type="checkbox"
                        checked={displayKeywords.length > 0 && displayKeywords.every(kw => selectedKeywordSet.has(kw.keyword))}
                        onChange={() => {
                          const allVisible = displayKeywords.every(kw => selectedKeywordSet.has(kw.keyword))
                          setSelectedKeywordSet(prev => {
                            const next = new Set(prev)
                            displayKeywords.forEach(kw => {
                              if (allVisible) next.delete(kw.keyword)
                              else next.add(kw.keyword)
                            })
                            return next
                          })
                        }}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-3 py-2 text-left">Keyword</th>
                    <th className="px-3 py-2 text-right w-20">Volume</th>
                    <th className="px-3 py-2 text-center w-16">Score</th>
                    <th className="px-3 py-2 text-center w-20">Action</th>
                    <th className="px-3 py-2 text-center w-16">In Acct</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayKeywords.map((kw, index) => {
                    const isSelected = selectedKeywordSet.has(kw.keyword)
                    return (
                      <tr
                        key={`${kw.keyword}-${index}`}
                        className={`${isSelected ? 'bg-blue-50/50' : ''} hover:bg-gray-50`}
                      >
                        <td className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleKeyword(kw.keyword)}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs text-gray-900">{kw.keyword}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600 text-xs">
                          {kw.avgMonthlySearches.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <Badge variant={kw.finalScore >= 75 ? 'default' : 'secondary'} className="text-[10px]">
                            {kw.finalScore}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <Badge
                            className={`text-[10px] ${
                              kw.action === 'ADD'
                                ? 'bg-green-100 text-green-700'
                                : kw.action === 'BOOST'
                                ? 'bg-blue-100 text-blue-700'
                                : kw.action === 'MONITOR'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {kw.action}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 text-center text-xs">
                          {kw.inAccount ? (
                            <span className="text-amber-600">Yes</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Show more/fewer */}
            {totalFilteredKeywords > 50 && (
              <button
                onClick={() => setShowAllKeywords(!showAllKeywords)}
                className="flex items-center justify-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                {showAllKeywords
                  ? 'Show fewer'
                  : `Show all ${totalFilteredKeywords} keywords`}
              </button>
            )}
          </div>
        )}

        <DialogFooter className="border-t pt-3">
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-gray-500">
              {tursoMatches.length > 0 && (
                <span>
                  {tursoMatches.filter(m => m.authorized).length} authorized / {tursoMatches.length} total campaigns
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose} size="sm">
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={selectedKeywordsCount === 0 || selectedCampaignsCount === 0}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExtended}
                disabled={selectedKeywordsCount === 0 || selectedCampaignsCount === 0}
              >
                <Download className="h-4 w-4 mr-1" />
                Extended
              </Button>
              <Button
                size="sm"
                onClick={handleExport}
                disabled={selectedKeywordsCount === 0 || selectedCampaignsCount === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Download className="h-4 w-4 mr-1" />
                Export ({exportRows.toLocaleString()} rows)
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
