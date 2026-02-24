import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";

// ============================================
// Daily Snapshot CRUD Operations
// ============================================

// Campaign snapshot object validator
const campaignSnapshotValidator = v.object({
  id: v.string(),
  name: v.string(),
  status: v.string(),
  type: v.string(),             // SEARCH, PERFORMANCE_MAX, etc.
  budgetMicros: v.number(),
  biddingStrategy: v.string(),
  targetCpaMicros: v.optional(v.number()),
  targetRoas: v.optional(v.number()),
});

// Full daily snapshot validator
const dailySnapshotValidator = {
  snapshotDate: v.string(),       // YYYY-MM-DD
  customerId: v.string(),
  accountName: v.string(),

  // Aggregated Counts
  campaignCount: v.number(),
  adGroupCount: v.number(),
  keywordCount: v.number(),
  adCount: v.number(),

  // Status Breakdown
  activeCampaigns: v.number(),
  pausedCampaigns: v.number(),
  enabledAdGroups: v.number(),
  enabledKeywords: v.number(),

  // Budget Summary
  totalDailyBudgetMicros: v.number(),
  totalDailyBudgetFormatted: v.string(),

  // Performance (that day's metrics)
  impressions: v.number(),
  clicks: v.number(),
  costMicros: v.number(),
  conversions: v.number(),
  conversionValue: v.number(),

  // Detailed Snapshots
  campaigns: v.array(campaignSnapshotValidator),

  // State hash for quick comparison
  stateHash: v.string(),

  // Metadata
  createdAt: v.number(),
};

/**
 * Create a daily snapshot
 */
export const create = mutation({
  args: dailySnapshotValidator,
  handler: async (ctx, args) => {
    // Check if snapshot already exists for this date and customer
    const existing = await ctx.db
      .query("googleAdsDailySnapshots")
      .withIndex("by_date_customer", (q) =>
        q.eq("snapshotDate", args.snapshotDate).eq("customerId", args.customerId)
      )
      .first();

    if (existing) {
      // Update existing snapshot
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }

    // Insert new snapshot
    return await ctx.db.insert("googleAdsDailySnapshots", args);
  },
});

/**
 * Upsert a daily snapshot (insert or update)
 */
export const upsert = mutation({
  args: dailySnapshotValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("googleAdsDailySnapshots")
      .withIndex("by_date_customer", (q) =>
        q.eq("snapshotDate", args.snapshotDate).eq("customerId", args.customerId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return { id: existing._id, action: "updated" };
    }

    const id = await ctx.db.insert("googleAdsDailySnapshots", args);
    return { id, action: "inserted" };
  },
});

/**
 * Get snapshot for a specific date and account
 */
export const getByDateAndCustomer = query({
  args: {
    snapshotDate: v.string(),
    customerId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleAdsDailySnapshots")
      .withIndex("by_date_customer", (q) =>
        q.eq("snapshotDate", args.snapshotDate).eq("customerId", args.customerId)
      )
      .first();
  },
});

/**
 * Get latest snapshot for an account
 */
export const getLatest = query({
  args: {
    customerId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleAdsDailySnapshots")
      .withIndex("by_customerId", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .first();
  },
});

/**
 * Get snapshot history for an account
 */
export const getHistory = query({
  args: {
    customerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 30;

    return await ctx.db
      .query("googleAdsDailySnapshots")
      .withIndex("by_customerId", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Get all snapshots for a specific date (across all accounts)
 */
export const getByDate = query({
  args: {
    snapshotDate: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleAdsDailySnapshots")
      .withIndex("by_snapshotDate", (q) => q.eq("snapshotDate", args.snapshotDate))
      .collect();
  },
});

/**
 * Compare two snapshots
 */
export const compare = query({
  args: {
    customerId: v.string(),
    date1: v.string(),
    date2: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot1 = await ctx.db
      .query("googleAdsDailySnapshots")
      .withIndex("by_date_customer", (q) =>
        q.eq("snapshotDate", args.date1).eq("customerId", args.customerId)
      )
      .first();

    const snapshot2 = await ctx.db
      .query("googleAdsDailySnapshots")
      .withIndex("by_date_customer", (q) =>
        q.eq("snapshotDate", args.date2).eq("customerId", args.customerId)
      )
      .first();

    if (!snapshot1 || !snapshot2) {
      return {
        error: "One or both snapshots not found",
        snapshot1: snapshot1 ? args.date1 : null,
        snapshot2: snapshot2 ? args.date2 : null,
      };
    }

    // Calculate differences
    const changes = {
      campaignCountDelta: snapshot2.campaignCount - snapshot1.campaignCount,
      adGroupCountDelta: snapshot2.adGroupCount - snapshot1.adGroupCount,
      keywordCountDelta: snapshot2.keywordCount - snapshot1.keywordCount,
      activeCampaignsDelta: snapshot2.activeCampaigns - snapshot1.activeCampaigns,
      budgetDeltaMicros: snapshot2.totalDailyBudgetMicros - snapshot1.totalDailyBudgetMicros,
      impressionsDelta: snapshot2.impressions - snapshot1.impressions,
      clicksDelta: snapshot2.clicks - snapshot1.clicks,
      costDeltaMicros: snapshot2.costMicros - snapshot1.costMicros,
      conversionsDelta: snapshot2.conversions - snapshot1.conversions,
      stateHashChanged: snapshot1.stateHash !== snapshot2.stateHash,
    };

    // Find campaign-level changes
    const campaign1Map = new Map(snapshot1.campaigns.map(c => [c.id, c]));
    const campaign2Map = new Map(snapshot2.campaigns.map(c => [c.id, c]));

    const addedCampaigns = snapshot2.campaigns.filter(c => !campaign1Map.has(c.id));
    const removedCampaigns = snapshot1.campaigns.filter(c => !campaign2Map.has(c.id));
    const modifiedCampaigns: Array<{
      id: string;
      name: string;
      changes: Array<{ field: string; old: any; new: any }>;
    }> = [];

    for (const [id, campaign1] of campaign1Map) {
      const campaign2 = campaign2Map.get(id);
      if (campaign2) {
        const campaignChanges: Array<{ field: string; old: any; new: any }> = [];
        if (campaign1.status !== campaign2.status) {
          campaignChanges.push({ field: "status", old: campaign1.status, new: campaign2.status });
        }
        if (campaign1.budgetMicros !== campaign2.budgetMicros) {
          campaignChanges.push({ field: "budget", old: campaign1.budgetMicros, new: campaign2.budgetMicros });
        }
        if (campaign1.biddingStrategy !== campaign2.biddingStrategy) {
          campaignChanges.push({ field: "biddingStrategy", old: campaign1.biddingStrategy, new: campaign2.biddingStrategy });
        }
        if (campaign1.targetCpaMicros !== campaign2.targetCpaMicros) {
          campaignChanges.push({ field: "targetCpa", old: campaign1.targetCpaMicros, new: campaign2.targetCpaMicros });
        }
        if (campaignChanges.length > 0) {
          modifiedCampaigns.push({ id, name: campaign2.name, changes: campaignChanges });
        }
      }
    }

    return {
      date1: args.date1,
      date2: args.date2,
      customerId: args.customerId,
      changes,
      campaignChanges: {
        added: addedCampaigns,
        removed: removedCampaigns,
        modified: modifiedCampaigns,
      },
    };
  },
});

/**
 * Get date range summary (for dashboard charts)
 */
export const getDateRangeSummary = query({
  args: {
    customerId: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshots = await ctx.db
      .query("googleAdsDailySnapshots")
      .withIndex("by_customerId", (q) => q.eq("customerId", args.customerId))
      .filter((q) =>
        q.and(
          q.gte(q.field("snapshotDate"), args.startDate),
          q.lte(q.field("snapshotDate"), args.endDate)
        )
      )
      .collect();

    // Sort by date
    snapshots.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));

    return {
      dateRange: { start: args.startDate, end: args.endDate },
      snapshotCount: snapshots.length,
      data: snapshots.map(s => ({
        date: s.snapshotDate,
        campaigns: s.campaignCount,
        activeCampaigns: s.activeCampaigns,
        budget: s.totalDailyBudgetMicros,
        impressions: s.impressions,
        clicks: s.clicks,
        cost: s.costMicros,
        conversions: s.conversions,
      })),
    };
  },
});

// ============================================
// Internal Functions (for cron jobs)
// ============================================

/**
 * Create snapshot (internal - for cron jobs)
 */
export const createInternal = internalMutation({
  args: dailySnapshotValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("googleAdsDailySnapshots")
      .withIndex("by_date_customer", (q) =>
        q.eq("snapshotDate", args.snapshotDate).eq("customerId", args.customerId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return { id: existing._id, action: "updated" };
    }

    const id = await ctx.db.insert("googleAdsDailySnapshots", args);
    return { id, action: "inserted" };
  },
});

/**
 * Get latest snapshot (internal)
 */
export const getLatestInternal = internalQuery({
  args: {
    customerId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleAdsDailySnapshots")
      .withIndex("by_customerId", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .first();
  },
});

/**
 * Cleanup old snapshots (keep last N days)
 */
export const cleanupOldSnapshots = internalMutation({
  args: {
    keepDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const keepDays = args.keepDays || 365; // Keep 1 year by default
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);
    const cutoffDateString = cutoffDate.toISOString().split("T")[0];

    const oldSnapshots = await ctx.db
      .query("googleAdsDailySnapshots")
      .withIndex("by_snapshotDate", (q) => q.lt("snapshotDate", cutoffDateString))
      .collect();

    let deletedCount = 0;
    for (const snapshot of oldSnapshots) {
      await ctx.db.delete(snapshot._id);
      deletedCount++;
    }

    return { deletedCount, cutoffDate: cutoffDateString };
  },
});
