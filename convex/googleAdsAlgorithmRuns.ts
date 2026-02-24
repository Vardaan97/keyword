import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";

// ============================================
// Algorithm Runs CRUD Operations
// ============================================

// Metrics validator
const metricsValidator = v.object({
  dateRange: v.string(),
  impressions: v.number(),
  clicks: v.number(),
  costMicros: v.number(),
  conversions: v.number(),
  conversionValue: v.number(),
});

// Full algorithm run validator
const algorithmRunValidator = {
  algorithmId: v.string(),
  algorithmName: v.string(),
  runId: v.string(),

  // Timing
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  status: v.string(),             // "running", "completed", "failed", "partial"

  // Scope
  customerId: v.string(),
  accountName: v.string(),
  targetCampaigns: v.array(v.string()),

  // Input
  inputParams: v.optional(v.any()),

  // Output
  changesProposed: v.number(),
  changesApplied: v.number(),
  changeIds: v.array(v.string()),

  // Performance Comparison
  beforeMetrics: v.optional(metricsValidator),
  afterMetrics: v.optional(metricsValidator),

  // Notes
  notes: v.optional(v.string()),
  resultSummary: v.optional(v.string()),
};

/**
 * Create a new algorithm run
 */
export const create = mutation({
  args: algorithmRunValidator,
  handler: async (ctx, args) => {
    return await ctx.db.insert("googleAdsAlgorithmRuns", args);
  },
});

/**
 * Start a new algorithm run
 */
export const startRun = mutation({
  args: {
    algorithmId: v.string(),
    algorithmName: v.string(),
    runId: v.string(),
    customerId: v.string(),
    accountName: v.string(),
    targetCampaigns: v.array(v.string()),
    inputParams: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const run = {
      ...args,
      startedAt: Date.now(),
      status: "running",
      changesProposed: 0,
      changesApplied: 0,
      changeIds: [] as string[],
    };

    return await ctx.db.insert("googleAdsAlgorithmRuns", run);
  },
});

/**
 * Complete an algorithm run
 */
export const completeRun = mutation({
  args: {
    runId: v.string(),
    changesProposed: v.number(),
    changesApplied: v.number(),
    changeIds: v.array(v.string()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
    resultSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("googleAdsAlgorithmRuns")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .first();

    if (!run) {
      throw new Error(`Algorithm run not found: ${args.runId}`);
    }

    await ctx.db.patch(run._id, {
      completedAt: Date.now(),
      status: args.status || "completed",
      changesProposed: args.changesProposed,
      changesApplied: args.changesApplied,
      changeIds: args.changeIds,
      notes: args.notes,
      resultSummary: args.resultSummary,
    });

    return run._id;
  },
});

/**
 * Fail an algorithm run
 */
export const failRun = mutation({
  args: {
    runId: v.string(),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("googleAdsAlgorithmRuns")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .first();

    if (!run) {
      throw new Error(`Algorithm run not found: ${args.runId}`);
    }

    await ctx.db.patch(run._id, {
      completedAt: Date.now(),
      status: "failed",
      notes: args.notes,
    });

    return run._id;
  },
});

/**
 * Add before metrics to a run
 */
export const addBeforeMetrics = mutation({
  args: {
    runId: v.string(),
    metrics: metricsValidator,
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("googleAdsAlgorithmRuns")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .first();

    if (!run) {
      throw new Error(`Algorithm run not found: ${args.runId}`);
    }

    await ctx.db.patch(run._id, {
      beforeMetrics: args.metrics,
    });

    return run._id;
  },
});

/**
 * Add after metrics to a run
 */
export const addAfterMetrics = mutation({
  args: {
    runId: v.string(),
    metrics: metricsValidator,
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("googleAdsAlgorithmRuns")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .first();

    if (!run) {
      throw new Error(`Algorithm run not found: ${args.runId}`);
    }

    await ctx.db.patch(run._id, {
      afterMetrics: args.metrics,
    });

    return run._id;
  },
});

/**
 * Link a change to an algorithm run
 */
export const linkChange = mutation({
  args: {
    runId: v.string(),
    changeId: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("googleAdsAlgorithmRuns")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .first();

    if (!run) {
      throw new Error(`Algorithm run not found: ${args.runId}`);
    }

    const newChangeIds = [...run.changeIds, args.changeId];

    await ctx.db.patch(run._id, {
      changeIds: newChangeIds,
      changesApplied: newChangeIds.length,
    });

    return run._id;
  },
});

/**
 * Get a run by ID
 */
export const getByRunId = query({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleAdsAlgorithmRuns")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .first();
  },
});

/**
 * Get runs for an algorithm
 */
export const getByAlgorithm = query({
  args: {
    algorithmId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    return await ctx.db
      .query("googleAdsAlgorithmRuns")
      .withIndex("by_algorithmId", (q) => q.eq("algorithmId", args.algorithmId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Get runs for an account
 */
export const getByAccount = query({
  args: {
    customerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    return await ctx.db
      .query("googleAdsAlgorithmRuns")
      .withIndex("by_customerId", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Get runs by status
 */
export const getByStatus = query({
  args: {
    status: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    return await ctx.db
      .query("googleAdsAlgorithmRuns")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .take(limit);
  },
});

/**
 * Get recent runs
 */
export const getRecent = query({
  args: {
    limit: v.optional(v.number()),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const days = args.days || 7;
    const startDate = Date.now() - days * 24 * 60 * 60 * 1000;

    const runs = await ctx.db
      .query("googleAdsAlgorithmRuns")
      .filter((q) => q.gte(q.field("startedAt"), startDate))
      .order("desc")
      .take(limit);

    return runs;
  },
});

/**
 * Get algorithm run statistics
 */
export const getStatistics = query({
  args: {
    algorithmId: v.optional(v.string()),
    customerId: v.optional(v.string()),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.days || 30;
    const startDate = Date.now() - days * 24 * 60 * 60 * 1000;

    let runs = await ctx.db
      .query("googleAdsAlgorithmRuns")
      .filter((q) => q.gte(q.field("startedAt"), startDate))
      .collect();

    if (args.algorithmId) {
      runs = runs.filter(r => r.algorithmId === args.algorithmId);
    }

    if (args.customerId) {
      runs = runs.filter(r => r.customerId === args.customerId);
    }

    // Calculate statistics
    const byAlgorithm: Record<string, { runs: number; changes: number; successes: number }> = {};
    const byStatus: Record<string, number> = {};
    let totalChanges = 0;
    let totalRuns = 0;
    let successfulRuns = 0;

    for (const run of runs) {
      totalRuns++;
      totalChanges += run.changesApplied;

      // By algorithm
      if (!byAlgorithm[run.algorithmId]) {
        byAlgorithm[run.algorithmId] = { runs: 0, changes: 0, successes: 0 };
      }
      byAlgorithm[run.algorithmId].runs++;
      byAlgorithm[run.algorithmId].changes += run.changesApplied;
      if (run.status === "completed") {
        byAlgorithm[run.algorithmId].successes++;
        successfulRuns++;
      }

      // By status
      byStatus[run.status] = (byStatus[run.status] || 0) + 1;
    }

    return {
      totalRuns,
      totalChanges,
      successfulRuns,
      successRate: totalRuns > 0 ? successfulRuns / totalRuns : 0,
      byAlgorithm,
      byStatus,
    };
  },
});

/**
 * Get performance comparison for completed runs
 */
export const getPerformanceComparison = query({
  args: {
    algorithmId: v.optional(v.string()),
    customerId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    let runs = await ctx.db
      .query("googleAdsAlgorithmRuns")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "completed"),
          q.neq(q.field("beforeMetrics"), undefined),
          q.neq(q.field("afterMetrics"), undefined)
        )
      )
      .order("desc")
      .take(limit * 2);

    if (args.algorithmId) {
      runs = runs.filter(r => r.algorithmId === args.algorithmId);
    }

    if (args.customerId) {
      runs = runs.filter(r => r.customerId === args.customerId);
    }

    // Calculate performance deltas
    const comparisons = runs.slice(0, limit).map(run => {
      const before = run.beforeMetrics!;
      const after = run.afterMetrics!;

      return {
        runId: run.runId,
        algorithmId: run.algorithmId,
        algorithmName: run.algorithmName,
        customerId: run.customerId,
        accountName: run.accountName,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        changesApplied: run.changesApplied,
        beforeDateRange: before.dateRange,
        afterDateRange: after.dateRange,
        deltas: {
          impressions: after.impressions - before.impressions,
          impressionsPct: before.impressions > 0 ? ((after.impressions - before.impressions) / before.impressions) * 100 : 0,
          clicks: after.clicks - before.clicks,
          clicksPct: before.clicks > 0 ? ((after.clicks - before.clicks) / before.clicks) * 100 : 0,
          cost: after.costMicros - before.costMicros,
          costPct: before.costMicros > 0 ? ((after.costMicros - before.costMicros) / before.costMicros) * 100 : 0,
          conversions: after.conversions - before.conversions,
          conversionsPct: before.conversions > 0 ? ((after.conversions - before.conversions) / before.conversions) * 100 : 0,
          value: after.conversionValue - before.conversionValue,
          valuePct: before.conversionValue > 0 ? ((after.conversionValue - before.conversionValue) / before.conversionValue) * 100 : 0,
        },
      };
    });

    return comparisons;
  },
});

// ============================================
// Internal Functions (for cron jobs)
// ============================================

/**
 * Create run (internal)
 */
export const createInternal = internalMutation({
  args: algorithmRunValidator,
  handler: async (ctx, args) => {
    return await ctx.db.insert("googleAdsAlgorithmRuns", args);
  },
});

/**
 * Get running algorithms (internal)
 */
export const getRunningInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("googleAdsAlgorithmRuns")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();
  },
});

/**
 * Cleanup stuck runs (mark as failed if running for too long)
 */
export const cleanupStuckRuns = internalMutation({
  args: {
    maxRunTimeHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxRunTimeHours = args.maxRunTimeHours || 24;
    const cutoff = Date.now() - maxRunTimeHours * 60 * 60 * 1000;

    const stuckRuns = await ctx.db
      .query("googleAdsAlgorithmRuns")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .filter((q) => q.lt(q.field("startedAt"), cutoff))
      .collect();

    let cleanedCount = 0;
    for (const run of stuckRuns) {
      await ctx.db.patch(run._id, {
        status: "failed",
        completedAt: Date.now(),
        notes: `Auto-failed: Exceeded max runtime of ${maxRunTimeHours} hours`,
      });
      cleanedCount++;
    }

    return { cleanedCount };
  },
});

/**
 * Cleanup old runs (keep last N days)
 */
export const cleanupOldRuns = internalMutation({
  args: {
    keepDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const keepDays = args.keepDays || 180; // Keep 6 months by default
    const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;

    const oldRuns = await ctx.db
      .query("googleAdsAlgorithmRuns")
      .filter((q) => q.lt(q.field("startedAt"), cutoff))
      .collect();

    let deletedCount = 0;
    for (const run of oldRuns) {
      await ctx.db.delete(run._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});
