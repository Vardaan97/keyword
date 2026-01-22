/**
 * API Route: Prompts
 *
 * GET - Get all active prompts (seed and analysis)
 * POST - Seed default prompts (first-time setup)
 */

import { NextRequest, NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import { FunctionReference, anyApi } from "convex/server"
import { DEFAULT_SEED_PROMPT, DEFAULT_ANALYSIS_PROMPT } from "@/lib/prompts"

// Use anyApi to avoid generated types dependency
const promptsApi = anyApi.prompts as unknown as {
  getAllActivePrompts: FunctionReference<"query", "public", Record<string, never>, unknown>
  seedDefaultPrompts: FunctionReference<"mutation", "public", {
    seedPrompt: { name: string; description: string; prompt: string; variables: string[] }
    analysisPrompt: { name: string; description: string; prompt: string; variables: string[] }
  }, unknown>
  getPromptStats: FunctionReference<"query", "public", Record<string, never>, unknown>
}

export async function GET() {
  try {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      // Return defaults if Convex not configured
      return NextResponse.json({
        seed: {
          type: "seed",
          name: DEFAULT_SEED_PROMPT.name,
          description: DEFAULT_SEED_PROMPT.description,
          prompt: DEFAULT_SEED_PROMPT.prompt,
          variables: DEFAULT_SEED_PROMPT.variables,
          version: 0,
          isActive: true,
          createdAt: Date.now(),
        },
        analysis: {
          type: "analysis",
          name: DEFAULT_ANALYSIS_PROMPT.name,
          description: DEFAULT_ANALYSIS_PROMPT.description,
          prompt: DEFAULT_ANALYSIS_PROMPT.prompt,
          variables: DEFAULT_ANALYSIS_PROMPT.variables,
          version: 0,
          isActive: true,
          createdAt: Date.now(),
        },
        source: "defaults",
      })
    }

    const client = new ConvexHttpClient(convexUrl)
    const prompts = await client.query(promptsApi.getAllActivePrompts, {})

    // If no prompts exist, return defaults and suggest seeding
    const result = prompts as { seed: unknown; analysis: unknown }
    if (!result.seed && !result.analysis) {
      return NextResponse.json({
        seed: null,
        analysis: null,
        needsSeeding: true,
        defaults: {
          seed: {
            name: DEFAULT_SEED_PROMPT.name,
            description: DEFAULT_SEED_PROMPT.description,
            prompt: DEFAULT_SEED_PROMPT.prompt,
            variables: DEFAULT_SEED_PROMPT.variables,
          },
          analysis: {
            name: DEFAULT_ANALYSIS_PROMPT.name,
            description: DEFAULT_ANALYSIS_PROMPT.description,
            prompt: DEFAULT_ANALYSIS_PROMPT.prompt,
            variables: DEFAULT_ANALYSIS_PROMPT.variables,
          },
        },
      })
    }

    return NextResponse.json({
      ...result,
      source: "convex",
    })
  } catch (error) {
    console.error("[API] Error fetching prompts:", error)
    return NextResponse.json(
      { error: "Failed to fetch prompts" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      return NextResponse.json(
        { error: "Convex not configured" },
        { status: 500 }
      )
    }

    const client = new ConvexHttpClient(convexUrl)

    if (action === "seed") {
      // Seed default prompts
      const result = await client.mutation(promptsApi.seedDefaultPrompts, {
        seedPrompt: {
          name: DEFAULT_SEED_PROMPT.name,
          description: DEFAULT_SEED_PROMPT.description,
          prompt: DEFAULT_SEED_PROMPT.prompt,
          variables: DEFAULT_SEED_PROMPT.variables,
        },
        analysisPrompt: {
          name: DEFAULT_ANALYSIS_PROMPT.name,
          description: DEFAULT_ANALYSIS_PROMPT.description,
          prompt: DEFAULT_ANALYSIS_PROMPT.prompt,
          variables: DEFAULT_ANALYSIS_PROMPT.variables,
        },
      })

      return NextResponse.json({
        success: true,
        ...(typeof result === 'object' && result !== null ? result as Record<string, unknown> : {}),
      })
    }

    return NextResponse.json(
      { error: "Invalid action. Use action: 'seed'" },
      { status: 400 }
    )
  } catch (error) {
    console.error("[API] Error in prompts POST:", error)
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    )
  }
}
