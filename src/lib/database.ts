/**
 * Unified Database Abstraction Layer
 * Uses Supabase as the primary (and only) database
 * MongoDB support removed - was causing SSL connection issues
 */

import {
  isSupabaseConfigured,
  getCachedKeywords as getSupabaseCache,
  setCachedKeywords as setSupabaseCache,
  saveResearchSession as saveSupabaseSession,
  getAllResearchSessions as getSupabaseSessions,
  KeywordIdeaDb
} from './supabase'

// Unified keyword data type (using Supabase naming convention)
export interface UnifiedKeywordData {
  keyword: string
  avgMonthlySearches: number
  competition: string
  competitionIndex: number
  lowTopOfPageBidMicros?: number
  highTopOfPageBidMicros?: number
  inAccount?: boolean  // Whether keyword is already in Google Ads account
  inAccountNames?: string[]  // Names of accounts containing this keyword
}

// Convert between formats
function toSupabaseFormat(data: UnifiedKeywordData[]): KeywordIdeaDb[] {
  return data.map(kw => ({
    keyword: kw.keyword,
    avg_monthly_searches: kw.avgMonthlySearches,
    competition: kw.competition,
    competition_index: kw.competitionIndex,
    low_bid_micros: kw.lowTopOfPageBidMicros,
    high_bid_micros: kw.highTopOfPageBidMicros,
    in_account: kw.inAccount,
    in_account_names: kw.inAccountNames
  }))
}

function fromSupabaseFormat(data: KeywordIdeaDb[]): UnifiedKeywordData[] {
  return data.map(kw => ({
    keyword: kw.keyword,
    avgMonthlySearches: kw.avg_monthly_searches,
    competition: kw.competition,
    competitionIndex: kw.competition_index,
    lowTopOfPageBidMicros: kw.low_bid_micros,
    highTopOfPageBidMicros: kw.high_bid_micros,
    inAccount: kw.in_account,
    inAccountNames: kw.in_account_names
  }))
}

/**
 * Get database status
 */
export function getDatabaseStatus() {
  return {
    supabase: isSupabaseConfigured(),
    mongodb: false,  // MongoDB removed - was causing SSL issues
    hasAnyDatabase: isSupabaseConfigured()
  }
}

/**
 * Get cached keywords from Supabase
 */
export async function getCachedKeywords(
  seedKeywords: string[],
  geoTarget: string,
  source: string
): Promise<UnifiedKeywordData[] | null> {
  const cacheKey = `${seedKeywords.sort().join(',')}_${geoTarget}_${source}`

  if (isSupabaseConfigured()) {
    try {
      const cached = await getSupabaseCache(cacheKey)
      if (cached && cached.length > 0) {
        console.log('[DB] Cache hit from Supabase')
        return fromSupabaseFormat(cached)
      }
    } catch (error) {
      console.log('[DB] Supabase cache read failed:', error)
    }
  }

  return null
}

/**
 * Set cached keywords to Supabase
 */
export async function setCachedKeywords(
  seedKeywords: string[],
  geoTarget: string,
  source: string,
  keywords: UnifiedKeywordData[],
  ttlHours = 168  // 7 days (168 hours) - Google recommends 30 days, 7 is good balance
): Promise<void> {
  const cacheKey = `${seedKeywords.sort().join(',')}_${geoTarget}_${source}`

  if (isSupabaseConfigured()) {
    try {
      await setSupabaseCache(cacheKey, toSupabaseFormat(keywords), ttlHours)
      console.log('[DB] Cached to Supabase')
    } catch (error) {
      console.log('[DB] Supabase cache write failed:', error)
    }
  } else {
    console.log('[DB] No database available for caching')
  }
}

/**
 * Save research session to Supabase
 */
export async function saveResearchSession(sessionData: {
  courseName: string
  courseUrl?: string
  vendor?: string
  seedKeywords: { keyword: string; source: string }[]
  keywordIdeas: UnifiedKeywordData[]
  analyzedKeywords: unknown[]
  dataSource: string
  geoTarget: string
  aiProvider: string
  processingTimeMs: number
  summary?: {
    totalAnalyzed: number
    toAdd: number
    toReview: number
    excluded: number
    urgentCount: number
    highPriorityCount: number
  }
}): Promise<{ supabaseId?: string }> {
  const results: { supabaseId?: string } = {}

  if (isSupabaseConfigured()) {
    try {
      const session = await saveSupabaseSession({
        course_name: sessionData.courseName,
        course_url: sessionData.courseUrl || null,
        vendor: sessionData.vendor || null,
        status: 'completed',
        seed_keywords: sessionData.seedKeywords,
        keyword_ideas: toSupabaseFormat(sessionData.keywordIdeas),
        analyzed_keywords: sessionData.analyzedKeywords as any[],
        data_source: sessionData.dataSource,
        target_country: sessionData.geoTarget,
        ai_provider: sessionData.aiProvider,
        total_keywords: sessionData.keywordIdeas.length,
        keywords_to_add: sessionData.summary?.toAdd || 0,
        processing_time_ms: sessionData.processingTimeMs,
        summary: sessionData.summary ? {
          total_analyzed: sessionData.summary.totalAnalyzed,
          to_add: sessionData.summary.toAdd,
          to_review: sessionData.summary.toReview,
          excluded: sessionData.summary.excluded,
          urgent_count: sessionData.summary.urgentCount,
          high_priority_count: sessionData.summary.highPriorityCount
        } : null
      })
      if (session) {
        results.supabaseId = session.id
        console.log('[DB] Saved to Supabase:', session.id)
      }
    } catch (error) {
      console.error('[DB] Supabase save failed:', error)
    }
  }

  return results
}

/**
 * Get all research sessions from Supabase
 */
export async function getAllResearchSessions(limit = 50) {
  if (isSupabaseConfigured()) {
    try {
      const sessions = await getSupabaseSessions(limit)
      if (sessions.length > 0) {
        console.log('[DB] Retrieved', sessions.length, 'sessions from Supabase')
        return sessions
      }
    } catch (error) {
      console.log('[DB] Supabase sessions fetch failed:', error)
    }
  }

  return []
}

// ============================================================================
// Individual Keyword Volume Cache
// Note: These functions are stubs since MongoDB was removed.
// Keyword volumes are fetched fresh from Google Ads API each time.
// If caching is needed, implement using Supabase keyword_volumes table.
// ============================================================================

/**
 * Get cached keyword volumes
 * Returns empty cache since MongoDB was removed
 */
export async function getKeywordVolumes(
  keywords: string[],
  _country: string,
  _source: 'google_ads' | 'keywords_everywhere'
): Promise<{ cached: UnifiedKeywordData[]; missing: string[] }> {
  // MongoDB removed - return all keywords as missing (will be fetched fresh)
  return { cached: [], missing: keywords }
}

/**
 * Save keyword volumes to cache
 * No-op since MongoDB was removed
 */
export async function saveKeywordVolumes(
  _keywords: UnifiedKeywordData[],
  _country: string,
  _source: 'google_ads' | 'keywords_everywhere',
  _ttlDays = 7
): Promise<number> {
  // MongoDB removed - no caching
  return 0
}

/**
 * Get cache statistics
 * Returns null since MongoDB was removed
 */
export async function getVolumeCacheStats() {
  return null
}

/**
 * Cleanup expired cache entries
 * No-op since MongoDB was removed
 */
export async function cleanupExpiredVolumes(): Promise<number> {
  return 0
}
