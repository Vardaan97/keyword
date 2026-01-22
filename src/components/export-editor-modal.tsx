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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { AnalyzedKeyword, Action } from '@/types'
import {
  KeywordWithAdGroup,
  ExportConfig,
  generateGadsEditorExport,
  generateExtendedExport,
  downloadExport,
  copyToClipboard,
  getExportStats,
} from '@/lib/export-gads-editor'
import {
  fetchAdGroupMatches,
  AdGroupMatch,
  normalizeUrl,
  mapAccountId,
  mapTargetCountry,
} from '@/lib/ad-group-matcher'
import {
  Download,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Filter,
} from 'lucide-react'

interface ExportEditorModalProps {
  open: boolean
  onClose: () => void
  keywords: AnalyzedKeyword[]
  courseUrl: string
  courseName: string
  targetCountry: string
  selectedAccountId: string
}

const ACTION_OPTIONS: Action[] = ['ADD', 'BOOST', 'MONITOR', 'OPTIMIZE', 'REVIEW']
const MATCH_TYPE_OPTIONS = ['Exact', 'Phrase', 'Broad'] as const

export function ExportEditorModal({
  open,
  onClose,
  keywords,
  courseUrl,
  courseName,
  targetCountry,
  selectedAccountId,
}: ExportEditorModalProps) {
  // State
  const [loading, setLoading] = useState(true)
  const [keywordsWithAdGroup, setKeywordsWithAdGroup] = useState<KeywordWithAdGroup[]>([])
  const [selectedActions, setSelectedActions] = useState<Action[]>(['ADD', 'BOOST'])
  const [selectedMatchTypes, setSelectedMatchTypes] = useState<('Exact' | 'Phrase' | 'Broad')[]>(['Exact', 'Phrase'])
  const [copied, setCopied] = useState(false)
  const [showAllKeywords, setShowAllKeywords] = useState(false)
  const [adGroupOptions, setAdGroupOptions] = useState<{ campaign: string; adGroup: string; country: string | null }[]>([])

  // Suggested ad group (from URL match)
  const [suggestedCampaign, setSuggestedCampaign] = useState<string | null>(null)
  const [suggestedAdGroup, setSuggestedAdGroup] = useState<string | null>(null)
  const [matchConfidence, setMatchConfidence] = useState<'exact' | 'partial' | 'none'>('none')

  // Load ad group mappings when modal opens
  useEffect(() => {
    if (!open) return

    const loadMappings = async () => {
      setLoading(true)

      try {
        // Fetch ad group match for the course URL
        const matchResult = await fetchAdGroupMatches(
          courseUrl,
          selectedAccountId,
          targetCountry
        )

        if (matchResult.bestMatch) {
          setSuggestedCampaign(matchResult.bestMatch.campaignName)
          setSuggestedAdGroup(matchResult.bestMatch.adGroupName)
          setMatchConfidence(matchResult.bestMatch.confidence)
        } else {
          setSuggestedCampaign(null)
          setSuggestedAdGroup(null)
          setMatchConfidence('none')
        }

        // Fetch all ad group options for dropdown
        const accountId = mapAccountId(selectedAccountId)
        const response = await fetch(`/api/gads/ad-group-lookup?accountId=${accountId}&listAll=true`)
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data) {
            setAdGroupOptions(data.data)
          }
        }

        // Initialize keywords with ad group info
        const initializedKeywords: KeywordWithAdGroup[] = keywords.map(kw => ({
          ...kw,
          campaignName: matchResult.bestMatch?.campaignName || '',
          adGroupName: matchResult.bestMatch?.adGroupName || '',
          adGroupMatch: matchResult.bestMatch || null,
          selected: selectedActions.includes(kw.action),
        }))

        setKeywordsWithAdGroup(initializedKeywords)
      } catch (error) {
        console.error('[EXPORT-MODAL] Error loading mappings:', error)
        // Initialize without ad group info
        const initializedKeywords: KeywordWithAdGroup[] = keywords.map(kw => ({
          ...kw,
          campaignName: '',
          adGroupName: '',
          adGroupMatch: null,
          selected: selectedActions.includes(kw.action),
        }))
        setKeywordsWithAdGroup(initializedKeywords)
      }

      setLoading(false)
    }

    loadMappings()
  }, [open, courseUrl, selectedAccountId, targetCountry, keywords])

  // Update selection when actions change
  useEffect(() => {
    setKeywordsWithAdGroup(prev =>
      prev.map(kw => ({
        ...kw,
        selected: selectedActions.includes(kw.action),
      }))
    )
  }, [selectedActions])

  // Filter keywords for display
  const displayKeywords = useMemo(() => {
    const filtered = keywordsWithAdGroup.filter(kw => selectedActions.includes(kw.action))
    if (showAllKeywords) return filtered
    return filtered.slice(0, 50)
  }, [keywordsWithAdGroup, selectedActions, showAllKeywords])

  const totalFiltered = useMemo(() => {
    return keywordsWithAdGroup.filter(kw => selectedActions.includes(kw.action)).length
  }, [keywordsWithAdGroup, selectedActions])

  // Get export stats
  const stats = useMemo(() => {
    return getExportStats(keywordsWithAdGroup, selectedActions)
  }, [keywordsWithAdGroup, selectedActions])

  // Toggle action
  const toggleAction = (action: Action) => {
    setSelectedActions(prev =>
      prev.includes(action)
        ? prev.filter(a => a !== action)
        : [...prev, action]
    )
  }

  // Toggle match type
  const toggleMatchType = (matchType: 'Exact' | 'Phrase' | 'Broad') => {
    setSelectedMatchTypes(prev =>
      prev.includes(matchType)
        ? prev.filter(m => m !== matchType)
        : [...prev, matchType]
    )
  }

  // Toggle keyword selection
  const toggleKeywordSelection = (index: number) => {
    const actualIndex = keywordsWithAdGroup.findIndex(kw => kw === displayKeywords[index])
    if (actualIndex === -1) return

    setKeywordsWithAdGroup(prev => {
      const updated = [...prev]
      updated[actualIndex] = { ...updated[actualIndex], selected: !updated[actualIndex].selected }
      return updated
    })
  }

  // Select/deselect all
  const toggleSelectAll = () => {
    const allSelected = displayKeywords.every(kw => kw.selected)
    setKeywordsWithAdGroup(prev =>
      prev.map(kw =>
        selectedActions.includes(kw.action)
          ? { ...kw, selected: !allSelected }
          : kw
      )
    )
  }

  // Apply suggested ad group to all
  const applyToAll = () => {
    if (!suggestedCampaign || !suggestedAdGroup) return

    setKeywordsWithAdGroup(prev =>
      prev.map(kw => ({
        ...kw,
        campaignName: suggestedCampaign,
        adGroupName: suggestedAdGroup,
        overrideCampaign: undefined,
        overrideAdGroup: undefined,
      }))
    )
  }

  // Update ad group for a keyword
  const updateKeywordAdGroup = (index: number, campaign: string, adGroup: string) => {
    const actualIndex = keywordsWithAdGroup.findIndex(kw => kw === displayKeywords[index])
    if (actualIndex === -1) return

    setKeywordsWithAdGroup(prev => {
      const updated = [...prev]
      updated[actualIndex] = {
        ...updated[actualIndex],
        overrideCampaign: campaign,
        overrideAdGroup: adGroup,
      }
      return updated
    })
  }

  // Export handlers
  const handleExport = useCallback(() => {
    const config: Partial<ExportConfig> = {
      includeActions: selectedActions,
      matchTypes: selectedMatchTypes,
      format: 'tab',
      includeHeader: true,
      includeTierLabel: true,
    }

    const content = generateGadsEditorExport(keywordsWithAdGroup, config)
    const filename = `${courseName.replace(/[^a-z0-9]/gi, '_')}_keywords_gads.txt`
    downloadExport(content, filename, 'tab')
  }, [keywordsWithAdGroup, selectedActions, selectedMatchTypes, courseName])

  const handleExportExtended = useCallback(() => {
    const config: Partial<ExportConfig> = {
      includeActions: selectedActions,
      matchTypes: selectedMatchTypes,
      format: 'tab',
      includeHeader: true,
    }

    const content = generateExtendedExport(keywordsWithAdGroup, config)
    const filename = `${courseName.replace(/[^a-z0-9]/gi, '_')}_keywords_extended.txt`
    downloadExport(content, filename, 'tab')
  }, [keywordsWithAdGroup, selectedActions, selectedMatchTypes, courseName])

  const handleCopy = useCallback(async () => {
    const config: Partial<ExportConfig> = {
      includeActions: selectedActions,
      matchTypes: selectedMatchTypes,
      format: 'tab',
      includeHeader: true,
      includeTierLabel: true,
    }

    const content = generateGadsEditorExport(keywordsWithAdGroup, config)
    const success = await copyToClipboard(content)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [keywordsWithAdGroup, selectedActions, selectedMatchTypes])

  // Group ad groups by campaign for dropdown
  const adGroupsByCampaign = useMemo(() => {
    const grouped: Record<string, { campaign: string; adGroup: string; country: string | null }[]> = {}
    for (const opt of adGroupOptions) {
      if (!grouped[opt.campaign]) {
        grouped[opt.campaign] = []
      }
      grouped[opt.campaign].push(opt)
    }
    return grouped
  }, [adGroupOptions])

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            Export to Google Ads Editor
          </DialogTitle>
          <DialogDescription>
            Review and export keywords with campaign/ad group assignments
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading ad group mappings...</span>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {/* Ad Group Info */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Suggested Assignment</p>
                  {suggestedCampaign && suggestedAdGroup ? (
                    <>
                      <p className="font-medium text-gray-900">
                        Campaign: <span className="text-blue-600">{suggestedCampaign}</span>
                      </p>
                      <p className="font-medium text-gray-900">
                        Ad Group: <span className="text-blue-600">{suggestedAdGroup}</span>
                      </p>
                      <Badge
                        variant={matchConfidence === 'exact' ? 'default' : 'secondary'}
                        className="mt-1"
                      >
                        {matchConfidence === 'exact' ? 'Exact match' : matchConfidence === 'partial' ? 'Partial match' : 'No match'}
                      </Badge>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm">No ad group mapping found for this URL</span>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={applyToAll}
                  disabled={!suggestedCampaign || !suggestedAdGroup}
                >
                  Apply to All
                </Button>
              </div>
            </div>

            {/* Filters */}
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

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-600">
                Selected: <span className="font-medium text-gray-900">{stats.selected}</span> of {stats.total}
              </span>
              <span className="text-gray-600">
                With Ad Group: <span className="font-medium text-green-600">{stats.withAdGroup}</span>
              </span>
              {stats.withoutAdGroup > 0 && (
                <span className="text-amber-600">
                  Missing: <span className="font-medium">{stats.withoutAdGroup}</span>
                </span>
              )}
              <span className="text-gray-600">
                Export rows: <span className="font-medium text-gray-900">
                  {stats.selected * selectedMatchTypes.length}
                </span>
              </span>
            </div>

            {/* Keywords Table */}
            <div className="flex-1 overflow-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left w-10">
                      <input
                        type="checkbox"
                        checked={displayKeywords.every(kw => kw.selected)}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-3 py-2 text-left">Keyword</th>
                    <th className="px-3 py-2 text-right w-20">Volume</th>
                    <th className="px-3 py-2 text-center w-16">Score</th>
                    <th className="px-3 py-2 text-center w-20">Action</th>
                    <th className="px-3 py-2 text-left w-48">Ad Group</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayKeywords.map((kw, index) => (
                    <tr
                      key={`${kw.keyword}-${index}`}
                      className={`${kw.selected ? 'bg-blue-50/50' : ''} hover:bg-gray-50`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={kw.selected}
                          onChange={() => toggleKeywordSelection(index)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-900">{kw.keyword}</td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {kw.avgMonthlySearches.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={kw.finalScore >= 75 ? 'default' : 'secondary'}>
                          {kw.finalScore}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge
                          className={
                            kw.action === 'ADD'
                              ? 'bg-green-100 text-green-700'
                              : kw.action === 'BOOST'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700'
                          }
                        >
                          {kw.action}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={`${kw.overrideCampaign || kw.campaignName}|${kw.overrideAdGroup || kw.adGroupName}`}
                          onValueChange={(value) => {
                            const [campaign, adGroup] = value.split('|')
                            updateKeywordAdGroup(index, campaign, adGroup)
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select ad group">
                              {(kw.overrideAdGroup || kw.adGroupName) || 'Select...'}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {Object.entries(adGroupsByCampaign).map(([campaign, adGroups]) => (
                              <div key={campaign}>
                                <div className="px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-50">
                                  {campaign}
                                </div>
                                {adGroups.map((ag) => (
                                  <SelectItem
                                    key={`${ag.campaign}|${ag.adGroup}`}
                                    value={`${ag.campaign}|${ag.adGroup}`}
                                    className="text-xs"
                                  >
                                    {ag.adGroup}
                                  </SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Show more */}
            {totalFiltered > 50 && (
              <button
                onClick={() => setShowAllKeywords(!showAllKeywords)}
                className="flex items-center justify-center gap-1 text-sm text-blue-600 hover:text-blue-700"
              >
                {showAllKeywords ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Show fewer
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    Show all {totalFiltered} keywords
                  </>
                )}
              </button>
            )}
          </div>
        )}

        <DialogFooter className="border-t pt-4">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {stats.withoutAdGroup > 0 && (
                <span className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {stats.withoutAdGroup} keywords missing ad group
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={handleCopy}
                disabled={stats.selected === 0}
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
                onClick={handleExportExtended}
                disabled={stats.selected === 0}
              >
                <Download className="h-4 w-4 mr-1" />
                Extended
              </Button>
              <Button
                onClick={handleExport}
                disabled={stats.selected === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Download className="h-4 w-4 mr-1" />
                Export for Ads Editor
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
