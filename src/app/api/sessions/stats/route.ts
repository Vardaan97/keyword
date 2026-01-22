/**
 * API Route: Session Stats
 *
 * GET - Get aggregate statistics for all sessions
 */

import { NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import { FunctionReference, anyApi } from "convex/server"

// Use anyApi to avoid generated types dependency
const sessionsApi = anyApi.sessions as unknown as {
  getSessionStats: FunctionReference<"query", "public", Record<string, never>, unknown>
}

export async function GET() {
  try {
    // Validate Convex is configured
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      return NextResponse.json({
        totalSessions: 0,
        totalKeywords: 0,
        totalToAdd: 0,
        totalUrgent: 0,
        vendors: [],
        byVendor: {},
        recentCount: 0
      })
    }

    // Create Convex client
    const client = new ConvexHttpClient(convexUrl)

    // Fetch stats from Convex
    const stats = await client.query(sessionsApi.getSessionStats, {})

    return NextResponse.json(stats)
  } catch (error) {
    console.error("[API] Error fetching session stats:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch stats",
        totalSessions: 0,
        totalKeywords: 0,
        totalToAdd: 0,
        totalUrgent: 0,
        vendors: [],
        byVendor: {},
        recentCount: 0
      },
      { status: 500 }
    )
  }
}
