/**
 * API Route: Get/Delete Session by ID
 *
 * GET - Fetches full session data from Convex including all keywords.
 * DELETE - Removes a session from Convex.
 */

import { NextRequest, NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import { FunctionReference, anyApi } from "convex/server"

// Use anyApi to avoid generated types dependency
const sessionsApi = anyApi.sessions as unknown as {
  getSession: FunctionReference<"query", "public", { sessionId: string }, unknown>
  deleteSession: FunctionReference<"mutation", "public", { sessionId: string }, unknown>
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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

    // Fetch session from Convex
    const session = await client.query(sessionsApi.getSession, {
      sessionId: id,
    })

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(session)
  } catch (error) {
    console.error("[API] Error fetching session:", error)
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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

    // Delete session from Convex
    await client.mutation(sessionsApi.deleteSession, {
      sessionId: id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[API] Error deleting session:", error)
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    )
  }
}
