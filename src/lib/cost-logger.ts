/**
 * Best-effort cost logger — writes a per-AI-call row to Convex `run_costs`.
 *
 * Called from API routes AFTER the AI response is received and the primary
 * response has been shaped. Any failure here (Convex unavailable, schema
 * mismatch, network hiccup) MUST be swallowed — this is accounting, not
 * critical-path. The primary AI response never blocks on this.
 */

import { ConvexHttpClient } from 'convex/browser'
import { FunctionReference, anyApi } from 'convex/server'

const runCostsApi = anyApi.runCosts as unknown as {
  logRunCost: FunctionReference<
    'mutation',
    'public',
    {
      runId: string
      courseId?: string
      phase: 'seeds' | 'analyze' | 'other'
      provider: string
      model: string
      inputTokens: number
      outputTokens: number
      costUsd: number
    },
    string
  >
}

export interface LogCostArgs {
  runId?: string
  courseId?: string
  phase: 'seeds' | 'analyze' | 'other'
  provider: string
  model: string
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
}

/**
 * Fire-and-forget cost log. Never throws. Never blocks the caller.
 * Silently skips when Convex isn't configured (demo mode).
 */
export async function logCostBestEffort(args: LogCostArgs): Promise<void> {
  try {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!convexUrl) {
      return // demo mode
    }
    if (!args.runId) {
      return // caller didn't pass a runId — skip
    }
    const inputTokens = args.inputTokens ?? 0
    const outputTokens = args.outputTokens ?? 0
    if (inputTokens === 0 && outputTokens === 0) {
      return // nothing worth logging
    }

    const client = new ConvexHttpClient(convexUrl)
    await client.mutation(runCostsApi.logRunCost, {
      runId: args.runId,
      courseId: args.courseId,
      phase: args.phase,
      provider: args.provider,
      model: args.model,
      inputTokens,
      outputTokens,
      costUsd: args.costUsd ?? 0,
    })
  } catch (err) {
    // Best-effort: log and move on. Do NOT propagate.
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[cost-logger] logRunCost failed (ignored):', msg)
  }
}
