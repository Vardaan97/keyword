/**
 * API Route: Migrate Sessions from Supabase to Convex
 *
 * GET - Check how many sessions exist in Supabase
 * POST - Migrate sessions from Supabase to Convex
 */

import { NextRequest, NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import { FunctionReference, anyApi } from "convex/server"
import { getAllResearchSessions, isSupabaseConfigured } from "@/lib/supabase"

// Convex sessions API
const sessionsApi = anyApi.sessions as unknown as {
  saveSession: FunctionReference<"mutation", "public", Record<string, unknown>, string>
}

export async function GET() {
  try {
    // Check Supabase for existing sessions
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        supabaseConfigured: false,
        sessionsInSupabase: 0,
        message: "Supabase not configured"
      })
    }

    const sessions = await getAllResearchSessions(100)

    return NextResponse.json({
      supabaseConfigured: true,
      sessionsInSupabase: sessions.length,
      sessions: sessions.map(s => ({
        id: s.id,
        courseName: s.course_name,
        vendor: s.vendor,
        createdAt: s.created_at
      }))
    })
  } catch (error) {
    console.error("[API] Error checking Supabase sessions:", error)
    return NextResponse.json(
      { error: "Failed to check Supabase sessions" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check both databases are configured
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Convex not configured" },
        { status: 500 }
      )
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 }
      )
    }

    // Get sessions from Supabase
    const supabaseSessions = await getAllResearchSessions(100)

    if (supabaseSessions.length === 0) {
      return NextResponse.json({
        migratedCount: 0,
        message: "No sessions to migrate"
      })
    }

    // Create Convex client
    const client = new ConvexHttpClient(convexUrl)

    let migratedCount = 0
    const errors: string[] = []

    // Migrate each session
    for (const session of supabaseSessions) {
      try {
        // Convert Supabase field names to Convex format
        const seedKeywords = (session.seed_keywords || []).map((sk: { keyword?: string }) => sk.keyword || '').filter(Boolean)

        // Map keyword ideas to Convex format
        const keywordIdeas = (session.keyword_ideas || []).map((ki: {
          keyword: string
          avg_monthly_searches: number
          competition: string
          competition_index: number
          low_bid_micros?: number
          high_bid_micros?: number
          in_account?: boolean
          in_account_names?: string[]
        }) => ({
          keyword: ki.keyword,
          avgMonthlySearches: ki.avg_monthly_searches,
          competition: ki.competition,
          competitionIndex: ki.competition_index,
          lowTopOfPageBidMicros: ki.low_bid_micros,
          highTopOfPageBidMicros: ki.high_bid_micros,
          inAccount: ki.in_account,
          inAccountNames: ki.in_account_names,
        }))

        // Map analyzed keywords to Convex format
        const analyzedKeywords = (session.analyzed_keywords || []).map((ak: {
          keyword: string
          avg_monthly_searches: number
          competition: string
          competition_index: number
          low_bid_micros?: number
          high_bid_micros?: number
          in_account?: boolean
          in_account_names?: string[]
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
        }) => ({
          keyword: ak.keyword,
          avgMonthlySearches: ak.avg_monthly_searches,
          competition: ak.competition,
          competitionIndex: ak.competition_index,
          lowTopOfPageBidMicros: ak.low_bid_micros,
          highTopOfPageBidMicros: ak.high_bid_micros,
          inAccount: ak.in_account,
          inAccountNames: ak.in_account_names,
          courseRelevance: ak.course_relevance,
          relevanceStatus: ak.relevance_status,
          conversionPotential: ak.conversion_potential,
          searchIntent: ak.search_intent,
          vendorSpecificity: ak.vendor_specificity,
          keywordSpecificity: ak.keyword_specificity,
          actionWordStrength: ak.action_word_strength,
          commercialSignals: ak.commercial_signals,
          negativeSignals: ak.negative_signals,
          koenigFit: ak.koenig_fit,
          baseScore: ak.base_score,
          competitionBonus: ak.competition_bonus,
          finalScore: ak.final_score,
          tier: ak.tier,
          matchType: ak.match_type,
          action: ak.action,
          exclusionReason: ak.exclusion_reason,
          priority: ak.priority,
        }))

        // Calculate counts from analyzed keywords
        const toAddCount = analyzedKeywords.filter((k: { action: string }) => k.action === 'ADD').length
        const urgentCount = analyzedKeywords.filter((k: { priority?: string }) => k.priority?.includes('URGENT')).length
        const highPriorityCount = analyzedKeywords.filter((k: { priority?: string }) => k.priority?.includes('HIGH')).length

        await client.mutation(sessionsApi.saveSession, {
          courseName: session.course_name,
          courseUrl: session.course_url || undefined,
          vendor: session.vendor || undefined,
          certificationCode: session.certification_code || undefined,
          seedKeywords,
          keywordsCount: session.total_keywords || keywordIdeas.length,
          analyzedCount: analyzedKeywords.length,
          toAddCount,
          urgentCount,
          highPriorityCount,
          geoTarget: session.target_country || "india",
          dataSource: session.data_source || "unknown",
          keywordIdeas: keywordIdeas.length > 0 ? keywordIdeas : undefined,
          analyzedKeywords: analyzedKeywords.length > 0 ? analyzedKeywords : undefined,
          status: session.status === 'completed' ? "completed" : "error",
        })
        migratedCount++
      } catch (err) {
        console.error(`Failed to migrate session ${session.id}:`, err)
        errors.push(`Session ${session.course_name}: ${err}`)
      }
    }

    return NextResponse.json({
      totalInSupabase: supabaseSessions.length,
      migratedCount,
      errors: errors.length > 0 ? errors : undefined,
      message: `Migrated ${migratedCount} of ${supabaseSessions.length} sessions`
    })
  } catch (error) {
    console.error("[API] Error migrating sessions:", error)
    return NextResponse.json(
      { error: "Failed to migrate sessions" },
      { status: 500 }
    )
  }
}
