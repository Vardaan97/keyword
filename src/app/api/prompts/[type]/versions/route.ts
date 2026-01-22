/**
 * API Route: Prompt Version History
 *
 * GET - Get version history for a prompt type
 */

import { NextRequest, NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import { FunctionReference, anyApi } from "convex/server"

// Use anyApi to avoid generated types dependency
const promptsApi = anyApi.prompts as unknown as {
  getPromptVersions: FunctionReference<"query", "public", { type: "seed" | "analysis"; limit?: number }, unknown>
}

type PromptType = "seed" | "analysis"

function isValidPromptType(type: string): type is PromptType {
  return type === "seed" || type === "analysis"
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get("limit") || "20")

    if (!isValidPromptType(type)) {
      return NextResponse.json(
        { error: "Invalid prompt type. Use 'seed' or 'analysis'" },
        { status: 400 }
      )
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      return NextResponse.json({
        versions: [],
        message: "Convex not configured - using defaults",
      })
    }

    const client = new ConvexHttpClient(convexUrl)
    const versions = await client.query(promptsApi.getPromptVersions, {
      type,
      limit,
    })

    return NextResponse.json({
      type,
      versions,
      count: Array.isArray(versions) ? versions.length : 0,
    })
  } catch (error) {
    console.error("[API] Error fetching prompt versions:", error)
    return NextResponse.json(
      { error: "Failed to fetch prompt versions" },
      { status: 500 }
    )
  }
}
