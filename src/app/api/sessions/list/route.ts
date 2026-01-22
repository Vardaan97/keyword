/**
 * API Route: List Sessions
 *
 * GET - List sessions with pagination, filtering, and search
 */

import { NextRequest, NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import { FunctionReference, anyApi } from "convex/server"

// Use anyApi to avoid generated types dependency
const sessionsApi = anyApi.sessions as unknown as {
  getSessions: FunctionReference<"query", "public", Record<string, unknown>, unknown>
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '20')
    const cursor = searchParams.get('cursor') || undefined
    const vendor = searchParams.get('vendor') || undefined
    const search = searchParams.get('search') || undefined

    // Validate Convex is configured
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      return NextResponse.json({
        sessions: [],
        nextCursor: null,
        hasMore: false,
        totalCount: 0
      })
    }

    // Create Convex client
    const client = new ConvexHttpClient(convexUrl)

    // Fetch sessions from Convex
    const result = await client.query(sessionsApi.getSessions, {
      limit,
      cursor,
      vendor,
      searchQuery: search,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[API] Error listing sessions:", error)
    return NextResponse.json(
      { error: "Failed to list sessions", sessions: [], totalCount: 0 },
      { status: 500 }
    )
  }
}
