/**
 * useSessions Hook
 *
 * Fetches sessions from Convex for real-time sync across all instances.
 * Replaces localStorage-based session history.
 */

import { useState, useEffect, useCallback } from 'react'

export interface SessionSummary {
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

export interface SessionStats {
  totalSessions: number
  totalKeywords: number
  totalToAdd: number
  totalUrgent: number
  vendors: string[]
  byVendor: Record<string, number>
  recentCount: number
}

interface UseSessionsReturn {
  // Session data
  sessions: SessionSummary[]
  stats: SessionStats | null

  // Loading states
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null

  // Pagination
  hasMore: boolean
  loadMore: () => Promise<void>

  // Actions
  refreshSessions: () => Promise<void>
  deleteSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  loadFullSession: (sessionId: string) => Promise<unknown>

  // Search/Filter
  searchQuery: string
  setSearchQuery: (query: string) => void
  vendorFilter: string | null
  setVendorFilter: (vendor: string | null) => void
}

export function useSessions(): UseSessionsReturn {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [vendorFilter, setVendorFilter] = useState<string | null>(null)

  // Fetch sessions from API
  const fetchSessions = useCallback(async (cursor?: string, append = false) => {
    try {
      if (append) {
        setIsLoadingMore(true)
      } else {
        setIsLoading(true)
      }
      setError(null)

      // Build query params
      const params = new URLSearchParams()
      params.set('limit', '20')
      if (cursor) params.set('cursor', cursor)
      if (searchQuery) params.set('search', searchQuery)
      if (vendorFilter) params.set('vendor', vendorFilter)

      const response = await fetch(`/api/sessions?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch sessions')
      }

      const data = await response.json()

      if (append) {
        setSessions(prev => [...prev, ...(data.sessions || [])])
      } else {
        setSessions(data.sessions || [])
      }

      setHasMore(data.hasMore || false)
      setNextCursor(data.nextCursor || null)

    } catch (err) {
      console.error('[useSessions] Error fetching sessions:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch sessions')
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }, [searchQuery, vendorFilter])

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/sessions/stats')
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (err) {
      console.error('[useSessions] Error fetching stats:', err)
    }
  }, [])

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchSessions()
    fetchStats()
  }, [fetchSessions, fetchStats])

  // Auto-refresh every 30 seconds for real-time sync
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSessions()
      fetchStats()
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [fetchSessions, fetchStats])

  // Load more (pagination)
  const loadMore = useCallback(async () => {
    if (hasMore && nextCursor && !isLoadingMore) {
      await fetchSessions(nextCursor, true)
    }
  }, [hasMore, nextCursor, isLoadingMore, fetchSessions])

  // Refresh sessions
  const refreshSessions = useCallback(async () => {
    setNextCursor(null)
    await fetchSessions()
    await fetchStats()
  }, [fetchSessions, fetchStats])

  // Delete a session
  const deleteSession = useCallback(async (sessionId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete session')
      }

      // Remove from local state
      setSessions(prev => prev.filter(s => s._id !== sessionId))

      // Refresh stats
      await fetchStats()

      return { success: true }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete session'
      return { success: false, error: errorMsg }
    }
  }, [fetchStats])

  // Load full session with keyword data
  const loadFullSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`)
      if (!response.ok) {
        throw new Error('Failed to load session')
      }
      return await response.json()
    } catch (err) {
      console.error('[useSessions] Error loading full session:', err)
      return null
    }
  }, [])

  return {
    sessions,
    stats,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refreshSessions,
    deleteSession,
    loadFullSession,
    searchQuery,
    setSearchQuery,
    vendorFilter,
    setVendorFilter
  }
}
