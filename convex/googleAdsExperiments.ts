import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";

// ============================================
// Experiment CRUD Operations
// ============================================

/**
 * Upsert an experiment (insert or update if exists)
 */
export const upsert = mutation({
  args: {
    googleExperimentId: v.string(),
    customerId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.string(),
    type: v.string(),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    baseCampaignId: v.optional(v.string()),
    baseCampaignName: v.optional(v.string()),
    trafficSplitPercent: v.optional(v.number()),
    goals: v.optional(v.array(v.object({
      metric: v.string(),
      direction: v.string(),
    }))),
    hypothesis: v.optional(v.string()),
    expectedOutcome: v.optional(v.string()),
    actualOutcome: v.optional(v.string()),
    learnings: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if experiment exists
    const existing = await ctx.db
      .query("googleAdsExperiments")
      .withIndex("by_experimentId", (q) => q.eq("googleExperimentId", args.googleExperimentId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        lastSyncedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("googleAdsExperiments", {
      ...args,
      createdAt: now,
      lastSyncedAt: now,
    });
  },
});

/**
 * Get all experiments for an account
 */
export const getByAccount = query({
  args: {
    customerId: v.string(),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let experiments = await ctx.db
      .query("googleAdsExperiments")
      .withIndex("by_customerId", (q) => q.eq("customerId", args.customerId))
      .collect();

    if (args.status) {
      experiments = experiments.filter((e) => e.status === args.status);
    }

    return experiments;
  },
});

/**
 * Get experiment by ID
 */
export const getById = query({
  args: {
    googleExperimentId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleAdsExperiments")
      .withIndex("by_experimentId", (q) => q.eq("googleExperimentId", args.googleExperimentId))
      .first();
  },
});

/**
 * Get experiments by status
 */
export const getByStatus = query({
  args: {
    status: v.string(),
    customerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let experiments = await ctx.db
      .query("googleAdsExperiments")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();

    if (args.customerId) {
      experiments = experiments.filter((e) => e.customerId === args.customerId);
    }

    return experiments;
  },
});

/**
 * Get ended experiments that don't have reports yet
 */
export const getEndedWithoutReports = query({
  args: {},
  handler: async (ctx) => {
    const endedStatuses = ["GRADUATED", "ENDED", "REMOVED"];
    const experiments = await ctx.db
      .query("googleAdsExperiments")
      .collect();

    return experiments.filter(
      (e) => endedStatuses.includes(e.status) && !e.reportGeneratedAt
    );
  },
});

/**
 * Update experiment with custom tracking fields
 */
export const updateTracking = mutation({
  args: {
    googleExperimentId: v.string(),
    hypothesis: v.optional(v.string()),
    expectedOutcome: v.optional(v.string()),
    actualOutcome: v.optional(v.string()),
    learnings: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const experiment = await ctx.db
      .query("googleAdsExperiments")
      .withIndex("by_experimentId", (q) => q.eq("googleExperimentId", args.googleExperimentId))
      .first();

    if (!experiment) {
      throw new Error("Experiment not found");
    }

    const updates: Record<string, string | undefined> = {};
    if (args.hypothesis !== undefined) updates.hypothesis = args.hypothesis;
    if (args.expectedOutcome !== undefined) updates.expectedOutcome = args.expectedOutcome;
    if (args.actualOutcome !== undefined) updates.actualOutcome = args.actualOutcome;
    if (args.learnings !== undefined) updates.learnings = args.learnings;

    await ctx.db.patch(experiment._id, updates);
    return experiment._id;
  },
});

/**
 * Mark experiment as reported
 */
export const markReported = mutation({
  args: {
    googleExperimentId: v.string(),
    reportGeneratedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const experiment = await ctx.db
      .query("googleAdsExperiments")
      .withIndex("by_experimentId", (q) => q.eq("googleExperimentId", args.googleExperimentId))
      .first();

    if (!experiment) {
      throw new Error("Experiment not found");
    }

    await ctx.db.patch(experiment._id, {
      reportGeneratedAt: args.reportGeneratedAt,
    });

    return experiment._id;
  },
});

// ============================================
// Experiment Arm CRUD Operations
// ============================================

/**
 * Upsert an experiment arm
 */
export const upsertArm = mutation({
  args: {
    googleArmId: v.string(),
    experimentId: v.string(),
    customerId: v.string(),
    name: v.string(),
    isControl: v.boolean(),
    campaignId: v.string(),
    trafficSplitPercent: v.number(),
    metrics: v.optional(v.object({
      impressions: v.number(),
      clicks: v.number(),
      cost: v.number(),
      conversions: v.number(),
      conversionValue: v.number(),
      ctr: v.number(),
      cpc: v.number(),
      cpa: v.number(),
      roas: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if arm exists
    const existing = await ctx.db
      .query("googleAdsExperimentArms")
      .withIndex("by_armId", (q) => q.eq("googleArmId", args.googleArmId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        lastMetricsAt: args.metrics ? now : existing.lastMetricsAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("googleAdsExperimentArms", {
      ...args,
      lastMetricsAt: args.metrics ? now : undefined,
    });
  },
});

/**
 * Get arms for an experiment
 */
export const getArmsByExperiment = query({
  args: {
    experimentId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleAdsExperimentArms")
      .withIndex("by_experimentId", (q) => q.eq("experimentId", args.experimentId))
      .collect();
  },
});

/**
 * Update arm metrics
 */
export const updateArmMetrics = mutation({
  args: {
    googleArmId: v.string(),
    metrics: v.object({
      impressions: v.number(),
      clicks: v.number(),
      cost: v.number(),
      conversions: v.number(),
      conversionValue: v.number(),
      ctr: v.number(),
      cpc: v.number(),
      cpa: v.number(),
      roas: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const arm = await ctx.db
      .query("googleAdsExperimentArms")
      .withIndex("by_armId", (q) => q.eq("googleArmId", args.googleArmId))
      .first();

    if (!arm) {
      throw new Error("Arm not found");
    }

    await ctx.db.patch(arm._id, {
      metrics: args.metrics,
      lastMetricsAt: Date.now(),
    });

    return arm._id;
  },
});

// ============================================
// Report CRUD Operations
// ============================================

/**
 * Create a report
 */
export const createReport = mutation({
  args: {
    customerId: v.string(),
    reportType: v.string(),
    title: v.string(),
    summary: v.string(),
    details: v.string(), // JSON string of full report data
    experimentId: v.optional(v.string()),
    generatedAt: v.number(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("googleAdsReports", args);
  },
});

/**
 * Get reports for an account
 */
export const getReports = query({
  args: {
    customerId: v.optional(v.string()),
    reportType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    let reports = await ctx.db
      .query("googleAdsReports")
      .order("desc")
      .take(limit * 2);

    if (args.customerId) {
      reports = reports.filter((r) => r.customerId === args.customerId);
    }

    if (args.reportType) {
      reports = reports.filter((r) => r.reportType === args.reportType);
    }

    return reports.slice(0, limit);
  },
});

/**
 * Get report by experiment
 */
export const getReportByExperiment = query({
  args: {
    experimentId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleAdsReports")
      .filter((q) => q.eq(q.field("experimentId"), args.experimentId))
      .order("desc")
      .first();
  },
});

/**
 * Update report status
 */
export const updateReportStatus = mutation({
  args: {
    reportId: v.id("googleAdsReports"),
    status: v.string(),
    sentAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, string | number | undefined> = {
      status: args.status,
    };

    if (args.sentAt) {
      updates.sentAt = args.sentAt;
    }

    await ctx.db.patch(args.reportId, updates);
    return args.reportId;
  },
});

// ============================================
// Internal Functions (for cron jobs)
// ============================================

/**
 * Get experiments that need reports (internal)
 */
export const listEndedWithoutReports = internalQuery({
  args: {},
  handler: async (ctx) => {
    const endedStatuses = ["GRADUATED", "ENDED", "REMOVED"];
    const experiments = await ctx.db
      .query("googleAdsExperiments")
      .collect();

    return experiments.filter(
      (e) => endedStatuses.includes(e.status) && !e.reportGeneratedAt
    );
  },
});

/**
 * Mark experiment as reported (internal)
 */
export const markReportedInternal = internalMutation({
  args: {
    googleExperimentId: v.string(),
    reportGeneratedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const experiment = await ctx.db
      .query("googleAdsExperiments")
      .withIndex("by_experimentId", (q) => q.eq("googleExperimentId", args.googleExperimentId))
      .first();

    if (experiment) {
      await ctx.db.patch(experiment._id, {
        reportGeneratedAt: args.reportGeneratedAt,
      });
    }
  },
});

// ============================================
// Statistics and Aggregation
// ============================================

/**
 * Get experiment statistics (internal for cron)
 */
export const getStatisticsInternal = internalQuery({
  args: {
    customerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let experiments = await ctx.db
      .query("googleAdsExperiments")
      .collect();

    if (args.customerId) {
      experiments = experiments.filter((e) => e.customerId === args.customerId);
    }

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const exp of experiments) {
      byStatus[exp.status] = (byStatus[exp.status] || 0) + 1;
      byType[exp.type] = (byType[exp.type] || 0) + 1;
    }

    const withReports = experiments.filter((e) => e.reportGeneratedAt).length;
    const endedWithoutReports = experiments.filter(
      (e) =>
        ["GRADUATED", "ENDED", "REMOVED"].includes(e.status) && !e.reportGeneratedAt
    ).length;

    return {
      total: experiments.length,
      byStatus,
      byType,
      withReports,
      endedWithoutReports,
    };
  },
});

/**
 * Get experiment statistics
 */
export const getStatistics = query({
  args: {
    customerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let experiments = await ctx.db
      .query("googleAdsExperiments")
      .collect();

    if (args.customerId) {
      experiments = experiments.filter((e) => e.customerId === args.customerId);
    }

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const exp of experiments) {
      byStatus[exp.status] = (byStatus[exp.status] || 0) + 1;
      byType[exp.type] = (byType[exp.type] || 0) + 1;
    }

    // Count those with/without reports
    const withReports = experiments.filter((e) => e.reportGeneratedAt).length;
    const endedWithoutReports = experiments.filter(
      (e) =>
        ["GRADUATED", "ENDED", "REMOVED"].includes(e.status) && !e.reportGeneratedAt
    ).length;

    return {
      total: experiments.length,
      byStatus,
      byType,
      withReports,
      endedWithoutReports,
    };
  },
});
