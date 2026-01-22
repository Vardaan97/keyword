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
    }
  }

  const handleViewDetails = async (session: SessionSummary) => {
    setIsLoadingSession(true)
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

  // Render
  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Session History
            {stats && (
              <Badge variant="secondary" className="ml-2">
                {stats.totalSessions} sessions
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            View, load, export, and manage your previous keyword research sessions.
          </DialogDescription>
        </DialogHeader>

        {/* Stats Summary */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.totalSessions}</div>
              <div className="text-xs text-muted-foreground">Total Sessions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.totalKeywords.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Total Keywords</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-600">{stats.totalToAdd.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">To Add</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.totalUrgent.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Urgent</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by course name, URL, or vendor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Select value={selectedVendor} onValueChange={setSelectedVendor}>
            <SelectTrigger className="w-[180px]">
              <Tag className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              {vendors.map(vendor => (
                <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>
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
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mb-2 opacity-50" />
              <p>{error}</p>
              <Button variant="link" onClick={fetchSessions}>
                Try again
              </Button>
            </div>
          ) : !sessionsData || sessionsData.sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Database className="h-12 w-12 mb-2 opacity-50" />
              <p>No sessions found</p>
              {(searchQuery || selectedVendor !== "all") && (
                <Button variant="link" onClick={() => { setSearchQuery(""); setSelectedVendor("all") }}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Select All Header */}
              <div className="flex items-center gap-2 p-2 border-b">
                <button onClick={toggleSelectAll} className="p-1 hover:bg-muted rounded">
                  {selectedIds.size === sessionsData.sessions.length ? (
                    <CheckSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
                <span className="text-sm text-muted-foreground">
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
                  className={`p-4 border rounded-lg hover:bg-muted/30 transition-colors ${
                    selectedIds.has(session._id) ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelection(session._id)}
                      className="p-1 hover:bg-muted rounded mt-1"
                    >
                      {selectedIds.has(session._id) ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>

                    {/* Session Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold truncate">{session.courseName}</h4>
                        {session.vendor && (
                          <Badge variant="outline" className="text-xs">
                            {session.vendor}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {session.dataSource === 'google_ads' ? 'Google Ads' : 'Keywords Everywhere'}
                        </Badge>
                        {session.status === 'error' && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Error
                          </Badge>
                        )}
                      </div>

                      {session.courseUrl && (
                        <a
                          href={session.courseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-muted-foreground hover:text-primary truncate block max-w-md"
                        >
                          {session.courseUrl}
                          <ExternalLink className="h-3 w-3 inline ml-1" />
                        </a>
                      )}

                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(session.createdAt)}
                        </span>
                        <span>
                          <strong>{session.keywordsCount}</strong> keywords
                        </span>
                        <span className="text-emerald-600">
                          <strong>{session.toAddCount}</strong> to add
                        </span>
                        {session.urgentCount > 0 && (
                          <span className="text-red-600">
                            <strong>{session.urgentCount}</strong> urgent
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(session)}
                        disabled={isLoadingSession}
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleLoadSession(session)}
                        disabled={isLoadingSession}
                        title="Load Session"
                      >
                        {isLoadingSession ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleExportSession(session)}
                        title="Export CSV"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSessionToDelete(session)}
                        className="text-destructive hover:text-destructive"
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
          <div className="flex items-center justify-between border-t pt-4">
            <span className="text-sm text-muted-foreground">
              Showing {sessionsData.sessions.length} of {sessionsData.totalCount}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCursor(undefined)}
                disabled={!cursor}
              >
                <ChevronLeft className="h-4 w-4" />
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCursor(sessionsData.nextCursor || undefined)}
                disabled={!sessionsData.hasMore}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!sessionToDelete} onOpenChange={() => setSessionToDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Session</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the session for <strong>{sessionToDelete?.courseName}</strong>?
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSessionToDelete(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteSession} disabled={isDeleting}>
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
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>{sessionToView?.courseName}</DialogTitle>
              <DialogDescription>
                {sessionToView?.courseUrl && (
                  <a
                    href={sessionToView.courseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {sessionToView.courseUrl}
                    <ExternalLink className="h-3 w-3 inline ml-1" />
                  </a>
                )}
              </DialogDescription>
            </DialogHeader>

            {sessionToView && (
              <div className="space-y-4">
                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Vendor:</strong> {sessionToView.vendor || 'N/A'}
                  </div>
                  <div>
                    <strong>Data Source:</strong> {sessionToView.dataSource}
                  </div>
                  <div>
                    <strong>Geo Target:</strong> {sessionToView.geoTarget}
                  </div>
                  <div>
                    <strong>Created:</strong> {formatDate(sessionToView.createdAt)}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                  <div className="text-center">
                    <div className="text-xl font-bold">{sessionToView.keywordsCount}</div>
                    <div className="text-xs text-muted-foreground">Keywords</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold">{sessionToView.analyzedCount}</div>
                    <div className="text-xs text-muted-foreground">Analyzed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-emerald-600">{sessionToView.toAddCount}</div>
                    <div className="text-xs text-muted-foreground">To Add</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-red-600">{sessionToView.urgentCount}</div>
                    <div className="text-xs text-muted-foreground">Urgent</div>
                  </div>
                </div>

                {/* Seed Keywords */}
                <div>
                  <strong className="text-sm">Seed Keywords:</strong>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {sessionToView.seedKeywords.map((kw, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Top Keywords Preview */}
                {sessionToView.analyzedKeywords && sessionToView.analyzedKeywords.length > 0 && (
                  <div>
                    <strong className="text-sm">Top Keywords (by score):</strong>
                    <div className="mt-2 max-h-48 overflow-auto border rounded">
                      <table className="w-full text-sm">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="text-left p-2">Keyword</th>
                            <th className="text-right p-2">Volume</th>
                            <th className="text-center p-2">Score</th>
                            <th className="text-center p-2">Tier</th>
                            <th className="text-center p-2">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sessionToView.analyzedKeywords
                            .sort((a, b) => b.finalScore - a.finalScore)
                            .slice(0, 10)
                            .map((kw, i) => (
                              <tr key={i} className="border-b">
                                <td className="p-2">{kw.keyword}</td>
                                <td className="text-right p-2">{kw.avgMonthlySearches.toLocaleString()}</td>
                                <td className="text-center p-2 font-semibold">{kw.finalScore}</td>
                                <td className="text-center p-2">
                                  <Badge variant="outline" className="text-xs">{kw.tier}</Badge>
                                </td>
                                <td className="text-center p-2">
                                  <Badge
                                    variant={kw.action === 'ADD' ? 'default' : 'secondary'}
                                    className="text-xs"
                                  >
                                    {kw.action}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setSessionToView(null)}>
                Close
              </Button>
              <Button onClick={() => handleExportSession(sessionToView!)}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button onClick={() => {
                if (sessionToView) {
                  onLoadSession(sessionToView)
                  setSessionToView(null)
                  onClose()
                }
              }}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Load Session
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
