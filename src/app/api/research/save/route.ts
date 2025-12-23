import { NextRequest, NextResponse } from 'next/server'
import { saveAnalysisMongo, StoredAnalysis } from '@/lib/mongodb'
import { saveResearchSession, DbResearchSession, isSupabaseConfigured } from '@/lib/supabase'
import { generateId } from '@/lib/utils'

interface SaveResearchRequest {
  courseId: string
  courseName: string
  courseUrl: string
  vendor?: string
  certificationCode?: string
  seedKeywords: { keyword: string; source: string }[]
  rawKeywords: {
    keyword: string
    avgMonthlySearches: number
    competition: string
    competitionIndex: number
    lowTopOfPageBidMicros?: number
    highTopOfPageBidMicros?: number
    inAccount?: boolean
  }[]
  analyzedKeywords: {
    keyword: string
    avgMonthlySearches: number
    competition: string
    competitionIndex: number
    courseRelevance: number
    relevanceStatus: string
    conversionPotential: number
    searchIntent: number
    vendorSpecificity: number
    keywordSpecificity: number
    actionWordStrength: number
    commercialSignals: number
    negativeSignals: number
    koenigFit: number
    baseScore: number
    competitionBonus: number
    finalScore: number
    tier: string
    matchType: string
    action: string
    exclusionReason?: string
    priority?: string
  }[]
  dataSource: string
  geoTarget: string
  processingTimeMs: number
  aiProvider?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: SaveResearchRequest = await request.json()

    console.log('[SAVE-RESEARCH] Saving research for:', body.courseName)

    const now = new Date()
    const results: { mongodb: string | null; supabase: string | null } = {
      mongodb: null,
      supabase: null
    }

    // Calculate summary stats
    const summary = {
      total_analyzed: body.analyzedKeywords.length,
      to_add: body.analyzedKeywords.filter(k => k.action === 'ADD').length,
      to_review: body.analyzedKeywords.filter(k => k.action === 'REVIEW').length,
      excluded: body.analyzedKeywords.filter(k => k.action === 'EXCLUDE' || k.action === 'EXCLUDE_RELEVANCE').length,
      urgent_count: body.analyzedKeywords.filter(k => k.priority?.includes('URGENT')).length,
      high_priority_count: body.analyzedKeywords.filter(k => k.priority?.includes('HIGH')).length
    }

    // Save to MongoDB
    try {
      const mongoData: Omit<StoredAnalysis, '_id'> = {
        courseId: body.courseId,
        courseName: body.courseName,
        courseUrl: body.courseUrl,
        vendor: body.vendor,
        seedKeywords: body.seedKeywords,
        rawKeywords: body.rawKeywords.map(kw => ({
          keyword: kw.keyword,
          avgMonthlySearches: kw.avgMonthlySearches,
          competition: kw.competition,
          competitionIndex: kw.competitionIndex,
          lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
          highTopOfPageBidMicros: kw.highTopOfPageBidMicros
        })),
        analyzedKeywords: body.analyzedKeywords,
        dataSource: body.dataSource,
        geoTarget: body.geoTarget,
        processingTimeMs: body.processingTimeMs,
        createdAt: now,
        updatedAt: now
      }

      results.mongodb = await saveAnalysisMongo(mongoData)
      console.log('[SAVE-RESEARCH] MongoDB save result:', results.mongodb ? 'success' : 'skipped (not configured)')
    } catch (mongoError) {
      console.error('[SAVE-RESEARCH] MongoDB error:', mongoError)
    }

    // Save to Supabase
    if (isSupabaseConfigured()) {
      try {
        const supabaseData: Partial<DbResearchSession> = {
          id: body.courseId || generateId(),
          course_name: body.courseName,
          course_url: body.courseUrl,
          vendor: body.vendor || null,
          certification_code: body.certificationCode || null,
          status: 'completed',
          error: null,
          seed_keywords: body.seedKeywords.map(sk => ({
            keyword: sk.keyword,
            source: sk.source
          })),
          keyword_ideas: body.rawKeywords.map(kw => ({
            keyword: kw.keyword,
            avg_monthly_searches: kw.avgMonthlySearches,
            competition: kw.competition,
            competition_index: kw.competitionIndex,
            low_bid_micros: kw.lowTopOfPageBidMicros,
            high_bid_micros: kw.highTopOfPageBidMicros
          })),
          analyzed_keywords: body.analyzedKeywords.map(kw => ({
            keyword: kw.keyword,
            avg_monthly_searches: kw.avgMonthlySearches,
            competition: kw.competition,
            competition_index: kw.competitionIndex,
            course_relevance: kw.courseRelevance,
            relevance_status: kw.relevanceStatus,
            conversion_potential: kw.conversionPotential,
            search_intent: kw.searchIntent,
            vendor_specificity: kw.vendorSpecificity,
            keyword_specificity: kw.keywordSpecificity,
            action_word_strength: kw.actionWordStrength,
            commercial_signals: kw.commercialSignals,
            negative_signals: kw.negativeSignals,
            koenig_fit: kw.koenigFit,
            base_score: kw.baseScore,
            competition_bonus: kw.competitionBonus,
            final_score: kw.finalScore,
            tier: kw.tier,
            match_type: kw.matchType,
            action: kw.action,
            exclusion_reason: kw.exclusionReason,
            priority: kw.priority
          })),
          summary,
          data_source: body.dataSource,
          target_country: body.geoTarget,
          ai_provider: body.aiProvider || 'openai',
          total_keywords: body.rawKeywords.length,
          keywords_to_add: summary.to_add,
          processing_time_ms: body.processingTimeMs
        }

        const savedSession = await saveResearchSession(supabaseData)
        results.supabase = savedSession?.id || null
        console.log('[SAVE-RESEARCH] Supabase save result:', results.supabase ? 'success' : 'failed')
      } catch (supabaseError) {
        console.error('[SAVE-RESEARCH] Supabase error:', supabaseError)
      }
    } else {
      console.log('[SAVE-RESEARCH] Supabase not configured, skipping')
    }

    return NextResponse.json({
      success: true,
      data: {
        mongoId: results.mongodb,
        supabaseId: results.supabase,
        summary
      }
    })

  } catch (error) {
    console.error('[SAVE-RESEARCH] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save research data'
    }, { status: 500 })
  }
}
