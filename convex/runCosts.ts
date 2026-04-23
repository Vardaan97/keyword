/**
 * Admin cost tracking — per-AI-call ledger.
 *
 * Writes happen from `generate-seeds` and `analyze` routes (best-effort; failure must never break the primary response).
 * Reads happen from the admin CLI: `npx convex run runCosts:getRunCosts '{"days":7}'`.
 * There is no HTTP endpoint — access is gated by who can run Convex CLI commands against the project.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const logRunCost = mutation({
  args: {
    runId: v.string(),
    courseId: v.optional(v.string()),
    phase: v.union(v.literal("seeds"), v.literal("analyze"), v.literal("other")),
    provider: v.string(),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("run_costs", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const getRunCosts = query({
  args: {
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.days ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const rows = await ctx.db
      .query("run_costs")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", cutoff))
      .collect();

    let totalUsd = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const byDay: Record<string, { usd: number; inputTokens: number; outputTokens: number; calls: number }> = {};
    const byModel: Record<string, { usd: number; inputTokens: number; outputTokens: number; calls: number }> = {};
    const byPhase: Record<string, { usd: number; inputTokens: number; outputTokens: number; calls: number }> = {};
    const byProvider: Record<string, { usd: number; inputTokens: number; outputTokens: number; calls: number }> = {};

    for (const row of rows) {
      totalUsd += row.costUsd;
      totalInputTokens += row.inputTokens;
      totalOutputTokens += row.outputTokens;

      const date = new Date(row.createdAt).toISOString().slice(0, 10);

      const bumpBucket = (bucket: Record<string, { usd: number; inputTokens: number; outputTokens: number; calls: number }>, key: string) => {
        if (!bucket[key]) bucket[key] = { usd: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
        bucket[key].usd += row.costUsd;
        bucket[key].inputTokens += row.inputTokens;
        bucket[key].outputTokens += row.outputTokens;
        bucket[key].calls += 1;
      };

      bumpBucket(byDay, date);
      bumpBucket(byModel, row.model);
      bumpBucket(byPhase, row.phase);
      bumpBucket(byProvider, row.provider);
    }

    const toArr = (bucket: Record<string, { usd: number; inputTokens: number; outputTokens: number; calls: number }>) =>
      Object.entries(bucket)
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => b.usd - a.usd);

    return {
      days,
      totalCalls: rows.length,
      totalUsd,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      byDay: toArr(byDay).sort((a, b) => a.key.localeCompare(b.key)),
      byModel: toArr(byModel),
      byPhase: toArr(byPhase),
      byProvider: toArr(byProvider),
    };
  },
});

export const getRunCostsByRunId = query({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("run_costs")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .collect();

    let totalUsd = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    for (const row of rows) {
      totalUsd += row.costUsd;
      totalInputTokens += row.inputTokens;
      totalOutputTokens += row.outputTokens;
    }

    return {
      runId: args.runId,
      totalCalls: rows.length,
      totalUsd,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      calls: rows,
    };
  },
});
