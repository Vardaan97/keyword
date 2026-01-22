/**
 * API Route: Get/Update Prompt by Type
 *
 * GET - Get active prompt for a type (seed/analysis)
 * POST - Save new version of prompt
 */

import { NextRequest, NextResponse } from "next/server"
import { ConvexHttpClient } from "convex/browser"
import { FunctionReference, anyApi } from "convex/server"
import { DEFAULT_SEED_PROMPT, DEFAULT_ANALYSIS_PROMPT } from "@/lib/prompts"

// Use anyApi to avoid generated types dependency
const promptsApi = anyApi.prompts as unknown as {
  getActivePrompt: FunctionReference<"query", "public", { type: "seed" | "analysis" }, unknown>
  savePrompt: FunctionReference<"mutation", "public", {
    type: "seed" | "analysis"
    name: string
    description: string
    prompt: string
    variables: string[]
    createdBy?: string
  }, { promptId: string; version: number }>
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

    if (!isValidPromptType(type)) {
      return NextResponse.json(
        { error: "Invalid prompt type. Use 'seed' or 'analysis'" },
        { status: 400 }
      )
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      // Return default prompt
      const defaultPrompt = type === "seed" ? DEFAULT_SEED_PROMPT : DEFAULT_ANALYSIS_PROMPT
      return NextResponse.json({
        type,
        name: defaultPrompt.name,
        description: defaultPrompt.description,
        prompt: defaultPrompt.prompt,
        variables: defaultPrompt.variables,
        version: 0,
        isActive: true,
        createdAt: Date.now(),
        source: "defaults",
      })
    }

    const client = new ConvexHttpClient(convexUrl)
    const prompt = await client.query(promptsApi.getActivePrompt, { type })

    if (!prompt) {
      // Return default if not seeded yet
      const defaultPrompt = type === "seed" ? DEFAULT_SEED_PROMPT : DEFAULT_ANALYSIS_PROMPT
      return NextResponse.json({
        type,
        name: defaultPrompt.name,
        description: defaultPrompt.description,
        prompt: defaultPrompt.prompt,
        variables: defaultPrompt.variables,
        version: 0,
        isActive: true,
        createdAt: Date.now(),
        needsSeeding: true,
        source: "defaults",
      })
    }

    return NextResponse.json({
      ...prompt,
      source: "convex",
    })
  } catch (error) {
    console.error("[API] Error fetching prompt:", error)
    return NextResponse.json(
      { error: "Failed to fetch prompt" },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params
    const body = await request.json()

    if (!isValidPromptType(type)) {
      return NextResponse.json(
        { error: "Invalid prompt type. Use 'seed' or 'analysis'" },
        { status: 400 }
      )
    }

    const { name, description, prompt, variables, createdBy } = body

    if (!name || !prompt || !variables) {
      return NextResponse.json(
        { error: "Missing required fields: name, prompt, variables" },
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
    const result = await client.mutation(promptsApi.savePrompt, {
      type,
      name,
      description: description || "",
      prompt,
      variables,
      createdBy,
    })

    return NextResponse.json({
      success: true,
      promptId: result.promptId,
      version: result.version,
    })
  } catch (error) {
    console.error("[API] Error saving prompt:", error)
    return NextResponse.json(
      { error: "Failed to save prompt" },
      { status: 500 }
    )
  }
}
