"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { downloadCSV } from "@/lib/utils"
import {
  History,
  Search,
  Trash2,
  Download,
  RefreshCw,
  ExternalLink,
  Calendar,
  Tag,
  X,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  Loader2,
  Database,
  AlertTriangle,
  Eye,
  PlayCircle,
  FileText,
  Globe,
  TrendingUp,
  Zap,
} from "lucide-react"
import { AnalyzedKeyword, KeywordIdea } from "@/types"

// ============================================
// Types
// ============================================

interface SessionSummary {
  _id: string
  courseName: string
  courseUrl?: string
  vendor?: string
  certificationCode?: string
  seedKeywords: string[]
  keywordsCount: number
  analyzedCount: number
  toAddCount: number
  urgentCount: number
  highPriorityCount?: number
  geoTarget: string
  dataSource: string
  status?: string
  error?: string
  createdAt: number
  updatedAt?: number
}

export interface FullSession extends SessionSummary {
  keywordIdeas?: KeywordIdea[]
  analyzedKeywords?: AnalyzedKeyword[]
}

interface SessionStats {
  totalSessions: number
  totalKeywords: number
  totalToAdd: number
  totalUrgent: number
  vendors: string[]
  byVendor: Record<string, number>
  recentCount: number
}

interface SessionsResponse {
  sessions: SessionSummary[]
  nextCursor: string | null
  hasMore: boolean
  totalCount: number
}

interface SessionHistoryProps {
  isOpen: boolean
  onClose: () => void
  onLoadSession: (session: FullSession) => void
  onReanalyze?: (session: FullSession) => void
}

// ============================================
// Component
// ============================================

export function SessionHistory({
  isOpen,
  onClose,
  onLoadSession,
  onReanalyze,
}: SessionHistoryProps) {
  // State
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedVendor, setSelectedVendor] = useState<string>("all")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<SessionSummary | null>(null)
  const [sessionToView, setSessionToView] = useState<FullSession | null>(null)
  const [isLoadingSession, setIsLoadingSession] = useState(false)
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | undefined>(undefined)

  // Data state
  const [sessionsData, setSessionsData] = useState<SessionsResponse | null>(null)
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [vendors, setVendors] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch sessions from API
  const fetchSessions = useCallback(async () => {
    if (!isOpen) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('limit', '20')
      if (cursor) params.set('cursor', cursor)
      if (selectedVendor !== 'all') params.set('vendor', selectedVendor)
      if (searchQuery) params.set('search', searchQuery)

      const response = await fetch(`/api/sessions/list?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setSessionsData(data)
      } else {
        setError('Failed to load sessions')
      }
    } catch (err) {
      console.error('Error fetching sessions:', err)
      setError('Failed to load sessions')
    } finally {
      setIsLoading(false)
    }
  }, [isOpen, cursor, selectedVendor, searchQuery])

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!isOpen) return

    try {
      const response = await fetch('/api/sessions/stats')
      if (response.ok) {
        const data = await response.json()
        setStats(data)
        setVendors(data.vendors || [])
      }
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }, [isOpen])

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchSessions()
      fetchStats()
    }
  }, [isOpen, fetchSessions, fetchStats])

  // Refresh when filters change
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set())
      setCursor(undefined)
      fetchSessions()
    }
  }, [searchQuery, selectedVendor])

  // Selection handlers
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (!sessionsData?.sessions) return
    if (selectedIds.size === sessionsData.sessions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sessionsData.sessions.map(s => s._id)))
    }
  }

  // Action handlers
  const handleLoadSession = async (session: SessionSummary) => {
    setIsLoadingSession(true)
    setLoadingSessionId(session._id)
    try {
      const response = await fetch(`/api/sessions/${session._id}`)
      if (response.ok) {
        const fullSession = await response.json()
        onLoadSession(fullSession)
        onClose()
      }
    } catch (error) {
      console.error("Error loading session:", error)
    } finally {
      setIsLoadingSession(false)
      setLoadingSessionId(null)
    }
  }

  const handleViewDetails = async (session: SessionSummary) => {
    setIsLoadingSession(true)
    setLoadingSessionId(session._id)
    try {
      const response = await fetch(`/api/sessions/${session._id}`)
      if (response.ok) {
        const fullSession = await response.json()
        setSessionToView(fullSession)
      }
    } catch (error) {
      console.error("Error loading session details:", error)
    } finally {
      setIsLoadingSession(false)
      setLoadingSessionId(null)
    }
  }

  const handleExportSession = async (session: SessionSummary) => {
    try {
      const response = await fetch(`/api/sessions/${session._id}`)
      if (!response.ok) return

      const fullSession: FullSession = await response.json()
      if (!fullSession.analyzedKeywords?.length) return

      const headers = [
        'Keyword', 'Search Volume', 'Competition', 'Competition Index',
        'Final Score', 'Tier', 'Match Type', 'Action', 'Priority',
        'In Account', 'Account Names', 'Course Relevance', 'Course URL'
      ]

      const rows = fullSession.analyzedKeywords.map(kw => [
        kw.keyword,
        kw.avgMonthlySearches,
        kw.competition,
        kw.competitionIndex,
        kw.finalScore,
        kw.tier,
        kw.matchType,
        kw.action,
        kw.priority || '',
        kw.inAccount ? 'Y' : 'N',
        kw.inAccountNames?.join('; ') || '-',
        kw.courseRelevance,
        fullSession.courseUrl || ''
      ])

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell =>
          typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))
            ? `"${cell.replace(/"/g, '""')}"`
            : cell
        ).join(','))
      ].join('\n')

      const filename = `session-${session.courseName.toLowerCase().replace(/\s+/g, '-')}-${new Date(session.createdAt).toISOString().split('T')[0]}.csv`
      downloadCSV(csvContent, filename)
    } catch (error) {
      console.error("Error exporting session:", error)
    }
  }

  const handleDeleteSession = async () => {
    if (!sessionToDelete) return
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/sessions/${sessionToDelete._id}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        setSessionToDelete(null)
        fetchSessions()
        fetchStats()
      }
    } catch (error) {
      console.error("Error deleting session:", error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    setIsDeleting(true)
    try {
      const response = await fetch('/api/sessions/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIds: Array.from(selectedIds) })
      })
      if (response.ok) {
        setSelectedIds(new Set())
        fetchSessions()
        fetchStats()
      }
    } catch (error) {
      console.error("Error bulk deleting sessions:", error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleBulkExport = async () => {
    if (selectedIds.size === 0 || !sessionsData?.sessions) return

    // Get full data for all selected sessions and merge
    const allKeywords: Array<AnalyzedKeyword & {
      courseName: string
      courseUrl?: string
    }> = []

    for (const sessionId of selectedIds) {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`)
        if (response.ok) {
          const session: FullSession = await response.json()
          session.analyzedKeywords?.forEach(kw => {
            allKeywords.push({
              ...kw,
              courseName: session.courseName,
              courseUrl: session.courseUrl,
            })
          })
        }
      } catch (error) {
        console.error("Error fetching session:", sessionId, error)
      }
    }

    if (allKeywords.length === 0) return

    const headers = [
      'Keyword', 'Search Volume', 'Competition', 'Competition Index',
      'Final Score', 'Tier', 'Match Type', 'Action', 'Priority',
      'In Account', 'Account Names', 'Course Relevance',
      'Course Name', 'Course URL'
    ]

    const rows = allKeywords.map(kw => [
      kw.keyword,
      kw.avgMonthlySearches,
      kw.competition,
      kw.competitionIndex,
      kw.finalScore,
      kw.tier,
      kw.matchType,
      kw.action,
      kw.priority || '',
      kw.inAccount ? 'Y' : 'N',
      kw.inAccountNames?.join('; ') || '-',
      kw.courseRelevance,
      kw.courseName,
      kw.courseUrl || ''
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell =>
        typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))
          ? `"${cell.replace(/"/g, '""')}"`
          : cell
      ).join(','))
    ].join('\n')

    const filename = `sessions-export-${selectedIds.size}-courses-${new Date().toISOString().split('T')[0]}.csv`
    downloadCSV(csvContent, filename)
  }

  // Format date
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Format relative time
  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return formatDate(timestamp)
  }

  // Get geo target display name
  const getGeoDisplayName = (geoTarget: string) => {
    const geoMap: Record<string, string> = {
      'india': '🇮🇳 India',
      'usa': '🇺🇸 USA',
      'uk': '🇬🇧 UK',
      'uae': '🇦🇪 UAE',
      'singapore': '🇸🇬 Singapore',
      'australia': '🇦🇺 Australia',
      'canada': '🇨🇦 Canada',
      'germany': '🇩🇪 Germany',
      'malaysia': '🇲🇾 Malaysia',
      'saudi': '🇸🇦 Saudi',
      'global': '🌍 Global',
    }
    return geoMap[geoTarget.toLowerCase()] || geoTarget
  }

  // Render
  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-white dark:bg-slate-900">
        <DialogHeader className="pb-4 border-b border-slate-200 dark:border-slate-700">
          <DialogTitle className="flex items-center gap-2 text-xl text-slate-900 dark:text-white">
            <History className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            Session History
            {stats && (
              <Badge variant="default" className="ml-2 text-sm bg-blue-600 text-white">
                {stats.totalSessions} sessions
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-base text-slate-600 dark:text-slate-300">
            View, load, export, and manage your previous keyword research sessions.
          </DialogDescription>
        </DialogHeader>

        {/* Stats Summary */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 py-4 border-b border-slate-200 dark:border-slate-700">
            <div className="text-center p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <div className="text-3xl font-bold text-slate-900 dark:text-white">{stats.totalSessions}</div>
              <div className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Sessions</div>
            </div>
            <div className="text-center p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <div className="text-3xl font-bold text-slate-900 dark:text-white">{stats.totalKeywords.toLocaleString()}</div>
              <div className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Keywords</div>
            </div>
            <div className="text-center p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg border border-emerald-300 dark:border-emerald-700">
              <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">{stats.totalToAdd.toLocaleString()}</div>
              <div className="text-sm font-medium text-emerald-700 dark:text-emerald-400">To Add</div>
            </div>
            <div className="text-center p-3 bg-red-100 dark:bg-red-900/30 rounded-lg border border-red-300 dark:border-red-700">
              <div className="text-3xl font-bold text-red-700 dark:text-red-400">{stats.totalUrgent.toLocaleString()}</div>
              <div className="text-sm font-medium text-red-700 dark:text-red-400">Urgent</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 items-center py-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search by course name, URL, or vendor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-slate-900 dark:text-white bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Select value={selectedVendor} onValueChange={setSelectedVendor}>
            <SelectTrigger className="w-[180px] text-slate-900 dark:text-white bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600">
              <Tag className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Vendors" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <SelectItem value="all" className="text-slate-900 dark:text-white">All Vendors</SelectItem>
              {vendors.map(vendor => (
                <SelectItem key={vendor} value={vendor} className="text-slate-900 dark:text-white">{vendor}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleBulkExport}>
                <Download className="h-4 w-4 mr-1" />
                Export ({selectedIds.size})
              </Button>
              <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={isDeleting}>
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1" />
                )}
                Delete ({selectedIds.size})
              </Button>
            </div>
          )}
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-40">
              <AlertTriangle className="h-12 w-12 mb-2 text-red-600" />
              <p className="text-slate-900 dark:text-white font-medium">{error}</p>
              <Button variant="link" onClick={fetchSessions} className="text-blue-600">
                Try again
              </Button>
            </div>
          ) : !sessionsData || sessionsData.sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40">
              <Database className="h-12 w-12 mb-2 text-slate-400" />
              <p className="text-slate-900 dark:text-white font-medium">No sessions found</p>
              {(searchQuery || selectedVendor !== "all") && (
                <Button variant="link" onClick={() => { setSearchQuery(""); setSelectedVendor("all") }} className="text-blue-600">
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Select All Header */}
              <div className="flex items-center gap-2 px-2 py-1 sticky top-0 bg-white dark:bg-slate-900 z-10 border-b border-slate-200 dark:border-slate-700">
                <button onClick={toggleSelectAll} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                  {selectedIds.size === sessionsData.sessions.length ? (
                    <CheckSquare className="h-5 w-5 text-blue-600" />
                  ) : (
                    <Square className="h-5 w-5 text-slate-400" />
                  )}
                </button>
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {selectedIds.size > 0
                    ? `${selectedIds.size} selected`
                    : `${sessionsData.sessions.length} sessions`
                  }
                </span>
              </div>

              {/* Session Cards */}
              {sessionsData.sessions.map((session) => (
                <div
                  key={session._id}
                  className={`p-4 border-2 rounded-xl transition-all ${
                    selectedIds.has(session._id)
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md'
                      : 'border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:shadow-sm bg-white dark:bg-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelection(session._id)}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded mt-1 flex-shrink-0"
                    >
                      {selectedIds.has(session._id) ? (
                        <CheckSquare className="h-5 w-5 text-blue-600" />
                      ) : (
                        <Square className="h-5 w-5 text-slate-400" />
                      )}
                    </button>

                    {/* Session Info */}
                    <div className="flex-1 min-w-0">
                      {/* Title Row */}
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="min-w-0">
                          <h4 className="font-bold text-lg text-slate-900 dark:text-white truncate leading-tight">
                            {session.courseName}
                          </h4>
                          {session.courseUrl && (
                            <a
                              href={session.courseUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate block max-w-lg mt-0.5"
                            >
                              {session.courseUrl}
                              <ExternalLink className="h-3 w-3 inline ml-1" />
                            </a>
                          )}
                        </div>

                        {/* Primary Action - Resume Button */}
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleLoadSession(session)}
                          disabled={loadingSessionId === session._id}
                          className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {loadingSessionId === session._id ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <PlayCircle className="h-4 w-4 mr-2" />
                          )}
                          Resume Session
                        </Button>
                      </div>

                      {/* Tags Row */}
                      <div className="flex items-center gap-2 flex-wrap mb-3">
                        {session.vendor && (
                          <Badge className="text-xs font-semibold bg-purple-600 text-white">
                            {session.vendor}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs font-medium text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600">
                          <Globe className="h-3 w-3 mr-1" />
                          {getGeoDisplayName(session.geoTarget)}
                        </Badge>
                        <Badge className="text-xs font-medium bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                          <Database className="h-3 w-3 mr-1" />
                          {session.dataSource === 'google_ads' ? 'Google Ads' : 'Keywords Everywhere'}
                        </Badge>
                        {session.status === 'error' && (
                          <Badge className="text-xs font-semibold bg-red-600 text-white">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Error
                          </Badge>
                        )}
                      </div>

                      {/* Stats Row */}
                      <div className="flex items-center gap-6 text-sm">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-slate-500" />
                          <span className="font-medium text-slate-900 dark:text-white">{formatRelativeTime(session.createdAt)}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-slate-500" />
                          <span className="font-bold text-slate-900 dark:text-white">{session.keywordsCount.toLocaleString()}</span>
                          <span className="text-slate-600 dark:text-slate-400">keywords</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <TrendingUp className="h-4 w-4 text-emerald-600" />
                          <span className="font-bold text-emerald-700 dark:text-emerald-400">{session.toAddCount.toLocaleString()}</span>
                          <span className="text-emerald-700 dark:text-emerald-400">to add</span>
                        </span>
                        {session.urgentCount > 0 && (
                          <span className="flex items-center gap-1.5">
                            <Zap className="h-4 w-4 text-red-600" />
                            <span className="font-bold text-red-700 dark:text-red-400">{session.urgentCount}</span>
                            <span className="text-red-700 dark:text-red-400">urgent</span>
                          </span>
                        )}
                        {session.highPriorityCount && session.highPriorityCount > 0 && (
                          <span className="flex items-center gap-1.5">
                            <span className="font-bold text-orange-700 dark:text-orange-400">{session.highPriorityCount}</span>
                            <span className="text-orange-700 dark:text-orange-400">high priority</span>
                          </span>
                        )}
                      </div>

                      {/* Seed Keywords Preview */}
                      {session.seedKeywords && session.seedKeywords.length > 0 && (
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Seeds:</span>
                          {session.seedKeywords.slice(0, 5).map((kw, i) => (
                            <Badge key={i} variant="outline" className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600">
                              {kw}
                            </Badge>
                          ))}
                          {session.seedKeywords.length > 5 && (
                            <span className="text-xs text-slate-600 dark:text-slate-400">
                              +{session.seedKeywords.length - 5} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Secondary Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleViewDetails(session)}
                        disabled={loadingSessionId === session._id}
                        title="View Details"
                        className="h-9 w-9 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleExportSession(session)}
                        title="Export CSV"
                        className="h-9 w-9 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSessionToDelete(session)}
                        className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {sessionsData && sessionsData.totalCount > 20 && (
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-4">
            <span className="text-sm font-medium text-slate-900 dark:text-white">
              Showing {sessionsData.sessions.length} of {sessionsData.totalCount}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCursor(undefined)}
                disabled={!cursor}
                className="text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCursor(sessionsData.nextCursor || undefined)}
                disabled={!sessionsData.hasMore}
                className="text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!sessionToDelete} onOpenChange={() => setSessionToDelete(null)}>
          <DialogContent className="bg-white dark:bg-slate-900">
            <DialogHeader>
              <DialogTitle className="text-slate-900 dark:text-white">Delete Session</DialogTitle>
              <DialogDescription className="text-slate-600 dark:text-slate-300">
                Are you sure you want to delete the session for <strong className="text-slate-900 dark:text-white">{sessionToDelete?.courseName}</strong>?
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSessionToDelete(null)} className="text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600">
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteSession} disabled={isDeleting} className="bg-red-600 hover:bg-red-700 text-white">
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Session Details Dialog */}
        <Dialog open={!!sessionToView} onOpenChange={() => setSessionToView(null)}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto bg-white dark:bg-slate-900">
            <DialogHeader>
              <DialogTitle className="text-xl text-slate-900 dark:text-white">{sessionToView?.courseName}</DialogTitle>
              <DialogDescription>
                {sessionToView?.courseUrl && (
                  <a
                    href={sessionToView.courseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {sessionToView.courseUrl}
                    <ExternalLink className="h-3 w-3 inline ml-1" />
                  </a>
                )}
              </DialogDescription>
            </DialogHeader>

            {sessionToView && (
              <div className="space-y-6">
                {/* Metadata */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Vendor</div>
                    <div className="font-semibold text-slate-900 dark:text-white">{sessionToView.vendor || 'N/A'}</div>
                  </div>
                  <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Data Source</div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {sessionToView.dataSource === 'google_ads' ? 'Google Ads' : 'Keywords Everywhere'}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Geo Target</div>
                    <div className="font-semibold text-slate-900 dark:text-white">{getGeoDisplayName(sessionToView.geoTarget)}</div>
                  </div>
                  <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Created</div>
                    <div className="font-semibold text-slate-900 dark:text-white">{formatDate(sessionToView.createdAt)}</div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{sessionToView.keywordsCount.toLocaleString()}</div>
                    <div className="text-sm font-medium text-slate-600 dark:text-slate-400">Keywords</div>
                  </div>
                  <div className="text-center p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{sessionToView.analyzedCount.toLocaleString()}</div>
                    <div className="text-sm font-medium text-slate-600 dark:text-slate-400">Analyzed</div>
                  </div>
                  <div className="text-center p-4 bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 rounded-lg">
                    <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{sessionToView.toAddCount.toLocaleString()}</div>
                    <div className="text-sm font-medium text-emerald-700 dark:text-emerald-400">To Add</div>
                  </div>
                  <div className="text-center p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg">
                    <div className="text-2xl font-bold text-red-700 dark:text-red-400">{sessionToView.urgentCount.toLocaleString()}</div>
                    <div className="text-sm font-medium text-red-700 dark:text-red-400">Urgent</div>
                  </div>
                </div>

                {/* Seed Keywords */}
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Seed Keywords</h4>
                  <div className="flex flex-wrap gap-2">
                    {sessionToView.seedKeywords.map((kw, i) => (
                      <Badge key={i} className="text-sm font-medium bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Top Keywords Preview */}
                {sessionToView.analyzedKeywords && sessionToView.analyzedKeywords.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Top Keywords (by score)</h4>
                    <div className="max-h-64 overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                          <tr>
                            <th className="text-left p-3 font-semibold text-slate-900 dark:text-white">Keyword</th>
                            <th className="text-right p-3 font-semibold text-slate-900 dark:text-white">Volume</th>
                            <th className="text-center p-3 font-semibold text-slate-900 dark:text-white">Score</th>
                            <th className="text-center p-3 font-semibold text-slate-900 dark:text-white">Tier</th>
                            <th className="text-center p-3 font-semibold text-slate-900 dark:text-white">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sessionToView.analyzedKeywords
                            .sort((a, b) => b.finalScore - a.finalScore)
                            .slice(0, 15)
                            .map((kw, i) => (
                              <tr key={i} className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <td className="p-3 text-slate-900 dark:text-white">{kw.keyword}</td>
                                <td className="text-right p-3 font-medium text-slate-900 dark:text-white">{kw.avgMonthlySearches.toLocaleString()}</td>
                                <td className="text-center p-3">
                                  <span className="font-bold text-slate-900 dark:text-white">{Math.round(kw.finalScore)}</span>
                                </td>
                                <td className="text-center p-3">
                                  <Badge variant="outline" className="text-xs font-medium text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600">{kw.tier}</Badge>
                                </td>
                                <td className="text-center p-3">
                                  <Badge
                                    className={`text-xs font-medium ${
                                      kw.action === 'ADD'
                                        ? 'bg-emerald-600 text-white'
                                        : kw.action === 'EXCLUDE'
                                        ? 'bg-red-600 text-white'
                                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                                    }`}
                                  >
                                    {kw.action}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    {sessionToView.analyzedKeywords.length > 15 && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 text-center">
                        Showing top 15 of {sessionToView.analyzedKeywords.length} keywords
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setSessionToView(null)} className="text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600">
                Close
              </Button>
              <Button variant="outline" onClick={() => handleExportSession(sessionToView!)} className="text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button onClick={() => {
                if (sessionToView) {
                  onLoadSession(sessionToView)
                  setSessionToView(null)
                  onClose()
                }
              }} className="bg-blue-600 hover:bg-blue-700 text-white">
                <PlayCircle className="h-4 w-4 mr-2" />
                Resume Session
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
