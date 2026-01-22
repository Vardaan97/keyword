/**
 * API Route: Rollback Prompt to Previous Version
 *
 * POST - Activate a specific version (rollback)
 */

import { NextRequest, NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import { FunctionReference, anyApi } from "convex/server"

// Use anyApi to avoid generated types dependency
const promptsApi = anyApi.prompts as unknown as {
  activateVersion: FunctionReference<"mutation", "public", { type: "seed" | "analysis"; version: number }, { success: boolean; activatedVersion: number }>
}

type PromptType = "seed" | "analysis"

function isValidPromptType(type: string): type is PromptType {
  return type === "seed" || type === "analysis"
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params
    const body = await request.json()
    const { version } = body

    if (!isValidPromptType(type)) {
      return NextResponse.json(
        { error: "Invalid prompt type. Use 'seed' or 'analysis'" },
        { status: 400 }
      )
    }

    if (typeof version !== "number" || version < 1) {
      return NextResponse.json(
        { error: "Invalid version number" },
        { status: 400 }
      )
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Convex not configured" },
        { status: 500 }
      )
    }

    const client = new ConvexHttpClient(convexUrl)
    const result = await client.mutation(promptsApi.activateVersion, {
      type,
      version,
    })

    return NextResponse.json({
      success: true,
      activatedVersion: result.activatedVersion,
      message: `Rolled back to version ${result.activatedVersion}`,
    })
  } catch (error) {
    console.error("[API] Error rolling back prompt:", error)
    const message = error instanceof Error ? error.message : "Failed to rollback"
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
