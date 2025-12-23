/**
 * Unified Database Abstraction Layer
 * Writes to both Supabase and MongoDB for comparison
 * Reads from the first available source
 */

import {
  isSupabaseConfigured,
  getCachedKeywords as getSupabaseCache,
  setCachedKeywords as setSupabaseCache,
  saveResearchSession as saveSupabaseSession,
  getAllResearchSessions as getSupabaseSessions,
  KeywordIdeaDb
} from './supabase'

import {
  isMongoConfigured,
  getCachedKeywordsMongo,
  setCachedKeywordsMongo,
  saveAnalysisMongo,
  getRecentAnalysesMongo,
  getKeywordVolumesCached,
  setKeywordVolumesCached,
  getKeywordVolumeCacheStats,
  cleanupExpiredKeywordVolumes,
  KeywordData
} from './mongodb'

// Unified keyword data type (using Supabase naming convention)
export interface UnifiedKeywordData {
  keyword: string
  avgMonthlySearches: number
  competition: string
  competitionIndex: number
  lowTopOfPageBidMicros?: number
  highTopOfPageBidMicros?: number
  inAccount?: boolean  // Whether keyword is already in Google Ads account
}

// Convert between formats
function toSupabaseFormat(data: UnifiedKeywordData[]): KeywordIdeaDb[] {
  return data.map(kw => ({
    keyword: kw.keyword,
    avg_monthly_searches: kw.avgMonthlySearches,
    competition: kw.competition,
    competition_index: kw.competitionIndex,
    low_bid_micros: kw.lowTopOfPageBidMicros,
    high_bid_micros: kw.highTopOfPageBidMicros
  }))
}

function fromSupabaseFormat(data: KeywordIdeaDb[]): UnifiedKeywordData[] {
  return data.map(kw => ({
    keyword: kw.keyword,
    avgMonthlySearches: kw.avg_monthly_searches,
    competition: kw.competition,
    competitionIndex: kw.competition_index,
    lowTopOfPageBidMicros: kw.low_bid_micros,
    highTopOfPageBidMicros: kw.high_bid_micros
  }))
}

/**
 * Get database status
 */
export function getDatabaseStatus() {
  return {
    supabase: isSupabaseConfigured(),
    mongodb: isMongoConfigured(),
    hasAnyDatabase: isSupabaseConfigured() || isMongoConfigured()
  }
}

/**
 * Get cached keywords - tries Supabase first, then MongoDB
 */
export async function getCachedKeywords(
  seedKeywords: string[],
  geoTarget: string,
  source: string
): Promise<UnifiedKeywordData[] | null> {
  const cacheKey = `${seedKeywords.sort().join(',')}_${geoTarget}_${source}`

  // Try Supabase first
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

  // Try MongoDB as fallback
  if (isMongoConfigured()) {
    try {
      const cached = await getCachedKeywordsMongo(seedKeywords, geoTarget, source)
      if (cached && cached.length > 0) {
        console.log('[DB] Cache hit from MongoDB')
        return cached
      }
    } catch (error) {
      console.log('[DB] MongoDB cache read failed:', error)
    }
  }

  return null
}

/**
 * Set cached keywords - writes to ALL configured databases
 */
export async function setCachedKeywords(
  seedKeywords: string[],
  geoTarget: string,
  source: string,
  keywords: UnifiedKeywordData[],
  ttlHours = 168  // 7 days (168 hours) - Google recommends 30 days, 7 is good balance
): Promise<void> {
  const cacheKey = `${seedKeywords.sort().join(',')}_${geoTarget}_${source}`
  const results: string[] = []

  // Write to Supabase
  if (isSupabaseConfigured()) {
    try {
      await setSupabaseCache(cacheKey, toSupabaseFormat(keywords), ttlHours)
      results.push('supabase')
    } catch (error) {
      console.log('[DB] Supabase cache write failed:', error)
    }
  }

  // Write to MongoDB
  if (isMongoConfigured()) {
    try {
      await setCachedKeywordsMongo(seedKeywords, geoTarget, source, keywords as KeywordData[], ttlHours)
      results.push('mongodb')
    } catch (error) {
      console.log('[DB] MongoDB cache write failed:', error)
    }
  }

  if (results.length > 0) {
    console.log('[DB] Cached to:', results.join(', '))
  } else {
    console.log('[DB] No database available for caching')
  }
}

/**
 * Save research session - writes to ALL configured databases
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
}): Promise<{ supabaseId?: string; mongoId?: string }> {
  const results: { supabaseId?: string; mongoId?: string } = {}

  // Save to Supabase
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

  // Save to MongoDB
  if (isMongoConfigured()) {
    try {
      const mongoId = await saveAnalysisMongo({
        courseId: sessionData.courseName.toLowerCase().replace(/\s+/g, '-'),
        courseName: sessionData.courseName,
        courseUrl: sessionData.courseUrl || '',
        vendor: sessionData.vendor,
        seedKeywords: sessionData.seedKeywords,
        rawKeywords: sessionData.keywordIdeas as KeywordData[],
        analyzedKeywords: sessionData.analyzedKeywords as any[],
        dataSource: sessionData.dataSource,
        geoTarget: sessionData.geoTarget,
        processingTimeMs: sessionData.processingTimeMs,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      if (mongoId) {
        results.mongoId = mongoId
        console.log('[DB] Saved to MongoDB:', mongoId)
      }
    } catch (error) {
      console.error('[DB] MongoDB save failed:', error)
    }
  }

  return results
}

/**
 * Get all research sessions - tries Supabase first
 */
export async function getAllResearchSessions(limit = 50) {
  // Try Supabase first
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

  // Try MongoDB as fallback
  if (isMongoConfigured()) {
    try {
      const sessions = await getRecentAnalysesMongo(limit)
      if (sessions.length > 0) {
        console.log('[DB] Retrieved', sessions.length, 'sessions from MongoDB')
        return sessions
      }
    } catch (error) {
      console.log('[DB] MongoDB sessions fetch failed:', error)
    }
  }

  return []
}

// ============================================================================
// Individual Keyword Volume Cache (Smart Caching)
// ============================================================================

/**
 * Get cached keyword volumes - returns cached data and list of missing keywords
 * Use this to check cache before making API calls
 */
export async function getKeywordVolumes(
  keywords: string[],
  country: string,
  source: 'google_ads' | 'keywords_everywhere'
): Promise<{ cached: UnifiedKeywordData[]; missing: string[] }> {
  if (!isMongoConfigured()) {
    return { cached: [], missing: keywords }
  }

  try {
    const result = await getKeywordVolumesCached(keywords, country, source)
    return {
      cached: result.cached.map(kw => ({
        keyword: kw.keyword,
        avgMonthlySearches: kw.avgMonthlySearches,
        competition: kw.competition,
        competitionIndex: kw.competitionIndex,
        lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
        highTopOfPageBidMicros: kw.highTopOfPageBidMicros
      })),
      missing: result.missing
    }
  } catch (error) {
    console.error('[DB] Get keyword volumes failed:', error)
    return { cached: [], missing: keywords }
  }
}

/**
 * Save keyword volumes to cache
 * Call this after fetching fresh data from APIs
 */
export async function saveKeywordVolumes(
  keywords: UnifiedKeywordData[],
  country: string,
  source: 'google_ads' | 'keywords_everywhere',
  ttlDays = 7
): Promise<number> {
  if (!isMongoConfigured()) {
    return 0
  }

  try {
    const keywordData: KeywordData[] = keywords.map(kw => ({
      keyword: kw.keyword,
      avgMonthlySearches: kw.avgMonthlySearches,
      competition: kw.competition,
      competitionIndex: kw.competitionIndex,
      lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
      highTopOfPageBidMicros: kw.highTopOfPageBidMicros
    }))
    return await setKeywordVolumesCached(keywordData, country, source, ttlDays)
  } catch (error) {
    console.error('[DB] Save keyword volumes failed:', error)
    return 0
  }
}

/**
 * Get cache statistics
 */
export async function getVolumeCacheStats() {
  if (!isMongoConfigured()) {
    return null
  }
  return await getKeywordVolumeCacheStats()
}

/**
 * Cleanup expired cache entries
 */
export async function cleanupExpiredVolumes(): Promise<number> {
  if (!isMongoConfigured()) {
    return 0
  }
  return await cleanupExpiredKeywordVolumes()
}
