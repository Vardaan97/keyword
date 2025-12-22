import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export interface DbResearchSession {
  id: string
  created_at: string
  updated_at: string
  course_name: string
  course_url: string
  vendor: string | null
  certification_code: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error: string | null
  seed_keywords: SeedKeywordDb[]
  keyword_ideas: KeywordIdeaDb[]
  analyzed_keywords: AnalyzedKeywordDb[]
  summary: SessionSummary | null
  data_source: string
  target_country: string
  ai_provider: string
  total_keywords: number
  keywords_to_add: number
  processing_time_ms: number | null
}

export interface SeedKeywordDb {
  keyword: string
  source: string
}

export interface KeywordIdeaDb {
  keyword: string
  avg_monthly_searches: number
  competition: string
  competition_index: number
  low_bid_micros?: number
  high_bid_micros?: number
}

export interface AnalyzedKeywordDb {
  keyword: string
  avg_monthly_searches: number
  competition: string
  competition_index: number
  course_relevance: number
  relevance_status: string
  conversion_potential: number
  search_intent: number
  vendor_specificity: number
  keyword_specificity: number
  action_word_strength: number
  commercial_signals: number
  negative_signals: number
  koenig_fit: number
  base_score: number
  competition_bonus: number
  final_score: number
  tier: string
  match_type: string
  action: string
  exclusion_reason?: string
  priority?: string
}

export interface SessionSummary {
  total_analyzed: number
  to_add: number
  to_review: number
  excluded: number
  urgent_count: number
  high_priority_count: number
}

// Helper functions for database operations
export async function saveResearchSession(session: Partial<DbResearchSession>) {
  const { data, error } = await supabase
    .from('research_sessions')
    .upsert(session, { onConflict: 'id' })
    .select()
    .single()

  if (error) {
    console.error('[SUPABASE] Error saving session:', error)
    throw error
  }
  return data
}

export async function getResearchSession(id: string) {
  const { data, error } = await supabase
    .from('research_sessions')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('[SUPABASE] Error fetching session:', error)
    return null
  }
  return data as DbResearchSession
}

export async function getAllResearchSessions(limit = 50) {
  const { data, error } = await supabase
    .from('research_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[SUPABASE] Error fetching sessions:', error)
    return []
  }
  return data as DbResearchSession[]
}

export async function deleteResearchSession(id: string) {
  const { error } = await supabase
    .from('research_sessions')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[SUPABASE] Error deleting session:', error)
    throw error
  }
}

// Keyword cache functions
export async function getCachedKeywords(cacheKey: string) {
  const { data, error } = await supabase
    .from('keyword_cache')
    .select('*')
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (error || !data) {
    return null
  }
  return data.keywords as KeywordIdeaDb[]
}

export async function setCachedKeywords(cacheKey: string, keywords: KeywordIdeaDb[], ttlHours = 48) {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('keyword_cache')
    .upsert({
      cache_key: cacheKey,
      keywords,
      expires_at: expiresAt,
      updated_at: new Date().toISOString()
    }, { onConflict: 'cache_key' })

  if (error) {
    console.error('[SUPABASE] Error caching keywords:', error)
  }
}
