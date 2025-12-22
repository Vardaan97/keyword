"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AnalyzedKeyword } from "@/types"
import { formatNumber, downloadCSV } from "@/lib/utils"
import {
  Download,
  Search,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Filter,
  X
} from "lucide-react"

interface KeywordResultsTableProps {
  keywords: AnalyzedKeyword[]
  courseName: string
}

type SortField = 'keyword' | 'avgMonthlySearches' | 'finalScore' | 'competition' | 'tier'
type SortDirection = 'asc' | 'desc'

export function KeywordResultsTable({ keywords, courseName }: KeywordResultsTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [sortField, setSortField] = useState<SortField>('finalScore')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [filterAction, setFilterAction] = useState<string>("all")
  const [filterTier, setFilterTier] = useState<string>("all")
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const filteredAndSortedKeywords = useMemo(() => {
    let result = [...keywords]

    // Filter by search term
    if (searchTerm) {
      result = result.filter(kw =>
        kw.keyword.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Filter by action
    if (filterAction !== "all") {
      result = result.filter(kw => kw.action === filterAction)
    }

    // Filter by tier
    if (filterTier !== "all") {
      result = result.filter(kw => kw.tier === filterTier)
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'keyword':
          comparison = a.keyword.localeCompare(b.keyword)
          break
        case 'avgMonthlySearches':
          comparison = a.avgMonthlySearches - b.avgMonthlySearches
          break
        case 'finalScore':
          comparison = a.finalScore - b.finalScore
          break
        case 'competition':
          const compOrder = { LOW: 1, MEDIUM: 2, HIGH: 3, UNSPECIFIED: 4 }
          comparison = (compOrder[a.competition] || 4) - (compOrder[b.competition] || 4)
          break
        case 'tier':
          const tierOrder = { 'Tier 1': 1, 'Tier 2': 2, 'Tier 3': 3, 'Tier 4': 4, 'Review': 5, 'Exclude': 6 }
          comparison = (tierOrder[a.tier] || 6) - (tierOrder[b.tier] || 6)
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [keywords, searchTerm, sortField, sortDirection, filterAction, filterTier])

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const toggleRowExpansion = (keyword: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(keyword)) {
        next.delete(keyword)
      } else {
        next.add(keyword)
      }
      return next
    })
  }

  const exportToCSV = () => {
    const headers = [
      'Keyword', 'Search Volume', 'Competition', 'Competition Index',
      'Final Score', 'Base Score', 'Tier', 'Match Type', 'Action', 'Priority',
      'Course Relevance', 'Relevance Status', 'Conversion Potential', 'Search Intent',
      'Vendor Specificity', 'Keyword Specificity', 'Action Word Strength',
      'Commercial Signals', 'Negative Signals', 'Koenig Fit', 'Exclusion Reason'
    ]

    const rows = filteredAndSortedKeywords.map(kw => [
      kw.keyword,
      kw.avgMonthlySearches,
      kw.competition,
      kw.competitionIndex,
      kw.finalScore,
      kw.baseScore,
      kw.tier,
      kw.matchType,
      kw.action,
      kw.priority || '',
      kw.courseRelevance,
      kw.relevanceStatus,
      kw.conversionPotential,
      kw.searchIntent,
      kw.vendorSpecificity,
      kw.keywordSpecificity,
      kw.actionWordStrength,
      kw.commercialSignals,
      kw.negativeSignals,
      kw.koenigFit,
      kw.exclusionReason || ''
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell =>
        typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
      ).join(','))
    ].join('\n')

    const filename = `keyword-analysis-${courseName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`
    downloadCSV(csvContent, filename)
  }

  const getPriorityBadgeVariant = (priority?: string) => {
    if (!priority) return 'secondary'
    if (priority.includes('URGENT')) return 'urgent'
    if (priority.includes('HIGH')) return 'high'
    if (priority.includes('MEDIUM')) return 'medium'
    if (priority.includes('STANDARD')) return 'standard'
    return 'review'
  }

  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case 'ADD': return 'success'
      case 'BOOST': return 'info'
      case 'MONITOR': return 'secondary'
      case 'REVIEW': return 'warning'
      case 'EXCLUDE':
      case 'EXCLUDE_RELEVANCE': return 'destructive'
      default: return 'secondary'
    }
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'Tier 1': return 'text-emerald-600 bg-emerald-50'
      case 'Tier 2': return 'text-blue-600 bg-blue-50'
      case 'Tier 3': return 'text-amber-600 bg-amber-50'
      case 'Tier 4': return 'text-orange-600 bg-orange-50'
      default: return 'text-gray-500 bg-gray-50'
    }
  }

  const getCompetitionColor = (comp: string) => {
    switch (comp) {
      case 'LOW': return 'text-emerald-600'
      case 'MEDIUM': return 'text-amber-600'
      case 'HIGH': return 'text-red-600'
      default: return 'text-gray-500'
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle>Keyword Analysis Results</CardTitle>
            <CardDescription>
              {filteredAndSortedKeywords.length} of {keywords.length} keywords
            </CardDescription>
          </div>
          <Button onClick={exportToCSV} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 pt-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search keywords..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="ADD">ADD</SelectItem>
              <SelectItem value="BOOST">BOOST</SelectItem>
              <SelectItem value="MONITOR">MONITOR</SelectItem>
              <SelectItem value="REVIEW">REVIEW</SelectItem>
              <SelectItem value="EXCLUDE">EXCLUDE</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterTier} onValueChange={setFilterTier}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="Tier 1">Tier 1</SelectItem>
              <SelectItem value="Tier 2">Tier 2</SelectItem>
              <SelectItem value="Tier 3">Tier 3</SelectItem>
              <SelectItem value="Tier 4">Tier 4</SelectItem>
              <SelectItem value="Review">Review</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-2 font-medium text-gray-500">
                  <button
                    onClick={() => handleSort('keyword')}
                    className="flex items-center gap-1 hover:text-gray-900"
                  >
                    Keyword
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="text-right py-3 px-2 font-medium text-gray-500">
                  <button
                    onClick={() => handleSort('avgMonthlySearches')}
                    className="flex items-center gap-1 hover:text-gray-900 ml-auto"
                  >
                    Volume
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="text-center py-3 px-2 font-medium text-gray-500">
                  <button
                    onClick={() => handleSort('competition')}
                    className="flex items-center gap-1 hover:text-gray-900 mx-auto"
                  >
                    Comp
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="text-center py-3 px-2 font-medium text-gray-500">
                  <button
                    onClick={() => handleSort('finalScore')}
                    className="flex items-center gap-1 hover:text-gray-900 mx-auto"
                  >
                    Score
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="text-center py-3 px-2 font-medium text-gray-500">
                  <button
                    onClick={() => handleSort('tier')}
                    className="flex items-center gap-1 hover:text-gray-900 mx-auto"
                  >
                    Tier
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="text-center py-3 px-2 font-medium text-gray-500">Match</th>
                <th className="text-center py-3 px-2 font-medium text-gray-500">Action</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Priority</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedKeywords.map((kw) => (
                <>
                  <tr
                    key={kw.keyword}
                    className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${
                      kw.action.includes('EXCLUDE') ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="py-3 px-2">
                      <span className="font-medium text-gray-900">{kw.keyword}</span>
                    </td>
                    <td className="py-3 px-2 text-right font-mono text-gray-700">
                      {formatNumber(kw.avgMonthlySearches)}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`font-medium ${getCompetitionColor(kw.competition)}`}>
                        {kw.competition}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className="font-semibold text-gray-900">{kw.finalScore}</span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getTierColor(kw.tier)}`}>
                        {kw.tier}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className="text-gray-600 font-mono text-xs">{kw.matchType}</span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <Badge variant={getActionBadgeVariant(kw.action)}>
                        {kw.action}
                      </Badge>
                    </td>
                    <td className="py-3 px-2">
                      {kw.priority && (
                        <Badge variant={getPriorityBadgeVariant(kw.priority)} className="text-xs whitespace-nowrap">
                          {kw.priority}
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <button
                        onClick={() => toggleRowExpansion(kw.keyword)}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        {expandedRows.has(kw.keyword) ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                    </td>
                  </tr>
                  {expandedRows.has(kw.keyword) && (
                    <tr className="bg-gray-50/50">
                      <td colSpan={9} className="py-4 px-6">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Relevance:</span>
                            <span className="ml-2 font-medium">{kw.courseRelevance}/10</span>
                            <span className="ml-1 text-gray-400">({kw.relevanceStatus})</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Conversion:</span>
                            <span className="ml-2 font-medium">{kw.conversionPotential}/10</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Intent:</span>
                            <span className="ml-2 font-medium">{kw.searchIntent}/10</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Vendor:</span>
                            <span className="ml-2 font-medium">{kw.vendorSpecificity}/10</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Specificity:</span>
                            <span className="ml-2 font-medium">{kw.keywordSpecificity}/10</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Action Words:</span>
                            <span className="ml-2 font-medium">{kw.actionWordStrength}/10</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Commercial:</span>
                            <span className="ml-2 font-medium">{kw.commercialSignals}/10</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Negative:</span>
                            <span className="ml-2 font-medium">{kw.negativeSignals}/10</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Koenig Fit:</span>
                            <span className="ml-2 font-medium">{kw.koenigFit}/10</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Base Score:</span>
                            <span className="ml-2 font-medium">{kw.baseScore}</span>
                            <span className="text-emerald-600 ml-1">+{kw.competitionBonus}</span>
                          </div>
                        </div>
                        {kw.exclusionReason && (
                          <div className="mt-3 text-sm text-red-600">
                            <span className="font-medium">Exclusion Reason:</span> {kw.exclusionReason}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>

          {filteredAndSortedKeywords.length === 0 && (
            <div className="py-12 text-center text-gray-500">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No keywords match your filters</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
