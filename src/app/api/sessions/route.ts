/**
 * API Route: Sessions
 *
 * GET  - Fetch paginated sessions from Convex
 * POST - Save a new session to Convex
 */

import { NextRequest, NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import { FunctionReference, anyApi } from "convex/server"

// Use anyApi to avoid generated types dependency
const sessionsApi = anyApi.sessions as unknown as {
  saveSession: FunctionReference<"mutation", "public", Record<string, unknown>, string>
  getSessions: FunctionReference<"query", "public", {
    limit?: number
    cursor?: string
    vendor?: string
    searchQuery?: string
  }, unknown>
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const cursor = searchParams.get('cursor') || undefined
    const vendor = searchParams.get('vendor') || undefined
    const searchQuery = searchParams.get('search') || undefined

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      return NextResponse.json({
        sessions: [],
        hasMore: false,
        nextCursor: null,
        totalCount: 0,
        source: 'none'
      })
    }

    const client = new ConvexHttpClient(convexUrl)
    const result = await client.query(sessionsApi.getSessions, {
      limit,
      cursor,
      vendor,
      searchQuery
    })

    return NextResponse.json({
      ...(typeof result === 'object' && result !== null ? result : {}),
      source: 'convex'
    })
  } catch (error) {
    console.error("[API] Error fetching sessions:", error)
    return NextResponse.json(
      { error: "Failed to fetch sessions", sessions: [] },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.courseName || !body.seedKeywords) {
      return NextResponse.json(
        { error: "Missing required fields: courseName, seedKeywords" },
        { status: 400 }
      )
    }

    // Validate Convex is configured
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      console.log("[API] Convex not configured, skipping session save")
      return NextResponse.json(
        { success: true, saved: false, reason: "Convex not configured" },
        { status: 200 }
      )
    }

    // Create Convex client
    const client = new ConvexHttpClient(convexUrl)

    // Calculate counts from analyzed keywords
    const analyzedKeywords = body.analyzedKeywords || []
    const toAddCount = analyzedKeywords.filter(
      (kw: { action: string }) => kw.action === "ADD"
    ).length
    const urgentCount = analyzedKeywords.filter(
      (kw: { priority?: string }) => kw.priority?.includes("URGENT")
    ).length
    const highPriorityCount = analyzedKeywords.filter(
      (kw: { priority?: string }) => kw.priority?.includes("HIGH")
    ).length

    // Save session to Convex
    const sessionId = await client.mutation(sessionsApi.saveSession, {
      courseName: body.courseName,
      courseUrl: body.courseUrl,
      vendor: body.vendor,
      certificationCode: body.certificationCode,
      seedKeywords: body.seedKeywords,
      keywordsCount: body.keywordIdeas?.length || 0,
      analyzedCount: analyzedKeywords.length,
      toAddCount,
      urgentCount,
      highPriorityCount,
      geoTarget: body.geoTarget || "india",
      dataSource: body.dataSource || "unknown",
      // Prompt versions for smart cache matching
      seedPromptVersion: body.seedPromptVersion,
      analysisPromptVersion: body.analysisPromptVersion,
      keywordIdeas: body.keywordIdeas,
      analyzedKeywords: body.analyzedKeywords,
      status: body.status || "completed",
      error: body.error,
    })

    console.log("[API] Session saved to Convex:", sessionId)

    return NextResponse.json({
      success: true,
      saved: true,
      sessionId,
    })
  } catch (error) {
    console.error("[API] Error saving session:", error)
    return NextResponse.json(
      { error: "Failed to save session" },
      { status: 500 }
    )
  }
}
