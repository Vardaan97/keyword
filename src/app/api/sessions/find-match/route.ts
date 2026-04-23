/**
 * API Route: Find Matching Session (Smart Cache Check)
 *
 * POST - Check if a URL + seeds + prompt versions combo has been processed before
 *
 * Returns the matching session with full data if found.
 * This prevents unnecessary Google Ads API calls when the same
 * processing has been done before with the same prompt versions.
 */

import { NextRequest, NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import { FunctionReference, anyApi } from "convex/server"

// Use anyApi to avoid generated types dependency
const sessionsApi = anyApi.sessions as unknown as {
  findMatchingSession: FunctionReference<
    "query",
    "public",
    {
      courseUrl: string
      seedKeywords: string[]
      geoTarget: string
      seedPromptVersion: number
      analysisPromptVersion: number
    },
    unknown
  >
  // URL-only probe: called from the Step 0 pre-seed cache check. Matches on URL +
  // geoTarget + prompt versions, within 7-day TTL. Returns most recent completed session.
  findMatchingSessionByUrl: FunctionReference<
    "query",
    "public",
    {
      courseUrl: string
      geoTarget: string
      seedPromptVersion: number
      analysisPromptVersion: number
    },
    unknown
  >
  getSessionAllKeywords: FunctionReference<
    "query",
    "public",
    { sessionId: string },
    { keywordIdeas: unknown[]; analyzedKeywords: unknown[] }
  >
}

interface MatchingSession {
  _id: string
  keywordsStoredExternally?: boolean
  [key: string]: unknown
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      courseUrl,
      seedKeywords,
      geoTarget,
      seedPromptVersion,
      analysisPromptVersion,
    } = body

    // Validate required fields. seedKeywords is OPTIONAL: when omitted/empty,
    // we use the URL-only probe (Step 0 pre-seed check). When present, we use
    // the classic URL+seeds match (Step 2 post-seed check).
    if (!courseUrl || !geoTarget) {
      return NextResponse.json(
        { error: "Missing required fields: courseUrl, geoTarget" },
        { status: 400 }
      )
    }

    if (typeof seedPromptVersion !== "number" || typeof analysisPromptVersion !== "number") {
      return NextResponse.json(
        { error: "Missing prompt versions" },
        { status: 400 }
      )
    }

    const urlOnlyMode = !Array.isArray(seedKeywords) || seedKeywords.length === 0

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      // Convex not configured - no smart cache available
      return NextResponse.json({
        match: null,
        reason: "Convex not configured",
      })
    }

    const client = new ConvexHttpClient(convexUrl)

    // Dispatch to URL-only (Step 0) or URL+seeds (Step 2) query based on whether seeds were provided.
    const matchingSession = urlOnlyMode
      ? await client.query(sessionsApi.findMatchingSessionByUrl, {
          courseUrl,
          geoTarget,
          seedPromptVersion,
          analysisPromptVersion,
        })
      : await client.query(sessionsApi.findMatchingSession, {
          courseUrl,
          seedKeywords,
          geoTarget,
          seedPromptVersion,
          analysisPromptVersion,
        })

    if (matchingSession) {
      // Found a match!
      const session = matchingSession as MatchingSession
      const matchType = urlOnlyMode ? "url" : "url+seeds"

      // If keywords are stored externally, fetch them
      if (session.keywordsStoredExternally) {
        const keywordsData = await client.query(sessionsApi.getSessionAllKeywords, {
          sessionId: session._id,
        })

        return NextResponse.json({
          match: {
            ...session,
            keywordIdeas: keywordsData.keywordIdeas,
            analyzedKeywords: keywordsData.analyzedKeywords,
          },
          cacheHit: true,
          matchType,
          message: urlOnlyMode
            ? "Found existing session with same URL + prompt versions (URL-only probe)"
            : "Found existing session with same URL, seeds, and prompt versions",
        })
      }

      return NextResponse.json({
        match: matchingSession,
        cacheHit: true,
        matchType,
        message: urlOnlyMode
          ? "Found existing session with same URL + prompt versions (URL-only probe)"
          : "Found existing session with same URL, seeds, and prompt versions",
      })
    }

    // No match found
    return NextResponse.json({
      match: null,
      cacheHit: false,
      matchType: urlOnlyMode ? "url" : "url+seeds",
      message: "No matching session found - proceed with processing",
    })
  } catch (error) {
    console.error("[API] Error finding matching session:", error)
    return NextResponse.json(
      { error: "Failed to check for matching session" },
      { status: 500 }
    )
  }
}
