/**
 * API Route: Get/Delete Session by ID
 *
 * GET - Fetches full session data from Convex including all keywords.
 *       Handles both inline and chunked keyword storage.
 * DELETE - Removes a session and its keyword chunks from Convex.
 */

import { NextRequest, NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import { FunctionReference, anyApi } from "convex/server"

// Use anyApi to avoid generated types dependency
const sessionsApi = anyApi.sessions as unknown as {
  getSession: FunctionReference<"query", "public", { sessionId: string }, unknown>
  getSessionAllKeywords: FunctionReference<"query", "public", { sessionId: string }, unknown>
  deleteSession: FunctionReference<"mutation", "public", { sessionId: string }, unknown>
}

interface Session {
  _id: string
  courseName: string
  courseUrl?: string
  vendor?: string
  certificationCode?: string
  seedKeywords: string[]
  keywordsCount: number
  analyzedCount: number
  toAddCount: number
  urgentCount: number
  highPriorityCount?: number
  geoTarget: string
  dataSource: string
  seedPromptVersion?: number
  analysisPromptVersion?: number
  keywordIdeas?: unknown[]
  analyzedKeywords?: unknown[]
  status?: string
  error?: string
  keywordsStoredExternally?: boolean
  totalKeywordChunks?: number
  createdAt: number
  updatedAt?: number
}

interface KeywordsData {
  keywordIdeas: unknown[]
  analyzedKeywords: unknown[]
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

    // Fetch session metadata from Convex
    const session = await client.query(sessionsApi.getSession, {
      sessionId: id,
    }) as Session | null

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      )
    }

    // If keywords are stored externally, fetch them from chunks
    if (session.keywordsStoredExternally) {
      const keywordsData = await client.query(sessionsApi.getSessionAllKeywords, {
        sessionId: id,
      }) as KeywordsData

      // Merge keywords into session response
      return NextResponse.json({
        ...session,
        keywordIdeas: keywordsData.keywordIdeas,
        analyzedKeywords: keywordsData.analyzedKeywords,
      })
    }

    // Keywords stored inline - return as-is
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

    // Delete session from Convex (also deletes keyword chunks)
    const result = await client.mutation(sessionsApi.deleteSession, {
      sessionId: id,
    }) as { success?: boolean; chunksDeleted?: number } | undefined

    return NextResponse.json({
      success: true,
      chunksDeleted: result?.chunksDeleted || 0,
    })
  } catch (error) {
    console.error("[API] Error deleting session:", error)
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    )
  }
}
