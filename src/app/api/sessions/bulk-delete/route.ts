/**
 * API Route: Bulk Delete Sessions
 *
 * POST - Delete multiple sessions at once
 */

import { NextRequest, NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import { FunctionReference, anyApi } from "convex/server"

// Use anyApi to avoid generated types dependency
const sessionsApi = anyApi.sessions as unknown as {
  bulkDeleteSessions: FunctionReference<"mutation", "public", { sessionIds: string[] }, { deletedCount: number }>
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionIds } = body

    if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
      return NextResponse.json(
        { error: "No session IDs provided" },
        { status: 400 }
      )
    }

    // Validate Convex is configured
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Convex not configured" },
        { status: 500 }
      )
    }

    // Create Convex client
    const client = new ConvexHttpClient(convexUrl)

    // Bulk delete sessions
    const result = await client.mutation(sessionsApi.bulkDeleteSessions, {
      sessionIds: sessionIds,
    })

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount
    })
  } catch (error) {
    console.error("[API] Error bulk deleting sessions:", error)
    return NextResponse.json(
      { error: "Failed to delete sessions" },
      { status: 500 }
    )
  }
}
