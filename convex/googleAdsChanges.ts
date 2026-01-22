import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================
// Change Event CRUD Operations
// ============================================

/**
 * Upsert a change event (insert or update if exists)
 * Uses resourceId + changedAt as unique key
 */
export const upsert = mutation({
  args: {
    customerId: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    resourceName: v.string(),
    changeType: v.string(),
    changedAt: v.number(),
    detectedAt: v.number(),
    userEmail: v.optional(v.string()),
    clientType: v.optional(v.string()),
    changedFields: v.array(v.object({
      field: v.string(),
      category: v.string(),
      oldValue: v.optional(v.string()),
      newValue: v.optional(v.string()),
    })),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if this change already exists
    const existing = await ctx.db
      .query("googleAdsChanges")
      .withIndex("by_resourceId", (q) => q.eq("resourceId", args.resourceId))
      .filter((q) => q.eq(q.field("changedAt"), args.changedAt))
      .first();

    if (existing) {
      // Update existing record
      await ctx.db.patch(existing._id, {
        ...args,
      });
      return existing._id;
    }

    // Insert new record
    return await ctx.db.insert("googleAdsChanges", args);
  },
});

/**
 * Bulk insert changes (for efficient syncing)
 */
export const bulkInsert = mutation({
  args: {
    changes: v.array(v.object({
      customerId: v.string(),
      resourceType: v.string(),
      resourceId: v.string(),
      resourceName: v.string(),
      changeType: v.string(),
      changedAt: v.number(),
      detectedAt: v.number(),
      userEmail: v.optional(v.string()),
      clientType: v.optional(v.string()),
      changedFields: v.array(v.object({
        field: v.string(),
        category: v.string(),
        oldValue: v.optional(v.string()),
        newValue: v.optional(v.string()),
      })),
      summary: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const insertedIds: Id<"googleAdsChanges">[] = [];

    for (const change of args.changes) {
      // Check for existing
      const existing = await ctx.db
        .query("googleAdsChanges")
        .withIndex("by_resourceId", (q) => q.eq("resourceId", change.resourceId))
        .filter((q) => q.eq(q.field("changedAt"), change.changedAt))
        .first();

      if (!existing) {
        const id = await ctx.db.insert("googleAdsChanges", change);
        insertedIds.push(id);
      }
    }

    return { inserted: insertedIds.length, total: args.changes.length };
  },
});

/**
 * Get changes for a specific account
 */
export const getByAccount = query({
  args: {
    customerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    const changes = await ctx.db
      .query("googleAdsChanges")
      .withIndex("by_customerId", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .take(limit);

    return changes;
  },
});

/**
 * Get changes within a date range
 */
export const getByDateRange = query({
  args: {
    customerId: v.optional(v.string()),
    startDate: v.number(),
    endDate: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 500;
    const customerId = args.customerId;

    let query;
    if (customerId) {
      query = ctx.db
        .query("googleAdsChanges")
        .withIndex("by_customerId_changedAt", (q) =>
          q
            .eq("customerId", customerId)
            .gte("changedAt", args.startDate)
            .lte("changedAt", args.endDate)
        );
    } else {
      query = ctx.db
        .query("googleAdsChanges")
        .withIndex("by_changedAt", (q) =>
          q.gte("changedAt", args.startDate).lte("changedAt", args.endDate)
        );
    }

    const changes = await query.order("desc").take(limit);
    return changes;
  },
});

/**
 * Get changes by resource type
 */
export const getByResourceType = query({
  args: {
    resourceType: v.string(),
    customerId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    let changes = await ctx.db
      .query("googleAdsChanges")
      .withIndex("by_resourceType", (q) => q.eq("resourceType", args.resourceType))
      .order("desc")
      .take(limit * 2); // Fetch more to allow filtering

    if (args.customerId) {
      changes = changes.filter((c) => c.customerId === args.customerId);
    }

    return changes.slice(0, limit);
  },
});

/**
 * Get recent changes across all accounts
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

    const changes = await ctx.db
      .query("googleAdsChanges")
      .withIndex("by_changedAt", (q) => q.gte("changedAt", startDate))
      .order("desc")
      .take(limit);

    return changes;
  },
});

/**
 * Get change statistics
 */
export const getStatistics = query({
  args: {
    customerId: v.optional(v.string()),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.days || 7;
    const startDate = Date.now() - days * 24 * 60 * 60 * 1000;
    const customerId = args.customerId;

    // Get all changes in the date range
    let changes;
    if (customerId) {
      changes = await ctx.db
        .query("googleAdsChanges")
        .withIndex("by_customerId_changedAt", (q) =>
          q.eq("customerId", customerId).gte("changedAt", startDate)
        )
        .collect();
    } else {
      changes = await ctx.db
        .query("googleAdsChanges")
        .withIndex("by_changedAt", (q) => q.gte("changedAt", startDate))
        .collect();
    }

    // Calculate statistics
    const byResourceType: Record<string, number> = {};
    const byChangeType: Record<string, number> = {};
    const byClientType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byDay: Record<string, number> = {};

    for (const change of changes) {
      // By resource type
      byResourceType[change.resourceType] = (byResourceType[change.resourceType] || 0) + 1;

      // By change type
      byChangeType[change.changeType] = (byChangeType[change.changeType] || 0) + 1;

      // By client type
      const clientType = change.clientType || "Unknown";
      byClientType[clientType] = (byClientType[clientType] || 0) + 1;

      // By category
      for (const field of change.changedFields) {
        byCategory[field.category] = (byCategory[field.category] || 0) + 1;
      }

      // By day
      const day = new Date(change.changedAt).toISOString().split("T")[0];
      byDay[day] = (byDay[day] || 0) + 1;
    }

    return {
      total: changes.length,
      byResourceType,
      byChangeType,
      byClientType,
      byCategory,
      byDay,
    };
  },
});

/**
 * Delete old changes (for maintenance)
 * Keeps changes from the last N days
 */
export const cleanupOldChangesInternal = internalMutation({
  args: {
    keepDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const keepDays = args.keepDays || 90;
    const cutoffDate = Date.now() - keepDays * 24 * 60 * 60 * 1000;

    const oldChanges = await ctx.db
      .query("googleAdsChanges")
      .withIndex("by_changedAt", (q) => q.lt("changedAt", cutoffDate))
      .collect();

    let deletedCount = 0;
    for (const change of oldChanges) {
      await ctx.db.delete(change._id);
      deletedCount++;
    }

    return { deletedCount, cutoffDate };
  },
});

/**
 * Delete old changes (for maintenance) - Public version
 * Keeps changes from the last N days
 */
export const cleanupOldChanges = mutation({
  args: {
    keepDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const keepDays = args.keepDays || 90; // Keep 90 days by default
    const cutoffDate = Date.now() - keepDays * 24 * 60 * 60 * 1000;

    const oldChanges = await ctx.db
      .query("googleAdsChanges")
      .withIndex("by_changedAt", (q) => q.lt("changedAt", cutoffDate))
      .collect();

    let deletedCount = 0;
    for (const change of oldChanges) {
      await ctx.db.delete(change._id);
      deletedCount++;
    }

    return { deletedCount, cutoffDate };
  },
});

// ============================================
// Campaign Snapshot Operations
// ============================================

/**
 * Create a campaign snapshot
 */
export const createSnapshot = mutation({
  args: {
    googleCampaignId: v.string(),
    customerId: v.string(),
    snapshotAt: v.number(),
    name: v.string(),
    status: v.string(),
    advertisingChannelType: v.string(),
    biddingStrategyType: v.optional(v.string()),
    budgetAmountMicros: v.optional(v.string()),
    targetCpaMicros: v.optional(v.string()),
    targetRoas: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    stateHash: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("googleAdsCampaignSnapshots", args);
  },
});

/**
 * Get the latest snapshot for a campaign
 */
export const getLatestSnapshot = query({
  args: {
    googleCampaignId: v.string(),
  },
  handler: async (ctx, args) => {
    const snapshot = await ctx.db
      .query("googleAdsCampaignSnapshots")
      .withIndex("by_campaignId", (q) => q.eq("googleCampaignId", args.googleCampaignId))
      .order("desc")
      .first();

    return snapshot;
  },
});

/**
 * Get snapshots for a campaign over time
 */
export const getSnapshotHistory = query({
  args: {
    googleCampaignId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 30;

    const snapshots = await ctx.db
      .query("googleAdsCampaignSnapshots")
      .withIndex("by_campaignId", (q) => q.eq("googleCampaignId", args.googleCampaignId))
      .order("desc")
      .take(limit);

    return snapshots;
  },
});

/**
 * Compare current state with latest snapshot
 * Returns changes detected between snapshots
 */
export const detectChanges = query({
  args: {
    googleCampaignId: v.string(),
    currentStateHash: v.string(),
  },
  handler: async (ctx, args) => {
    const latestSnapshot = await ctx.db
      .query("googleAdsCampaignSnapshots")
      .withIndex("by_campaignId", (q) => q.eq("googleCampaignId", args.googleCampaignId))
      .order("desc")
      .first();

    if (!latestSnapshot) {
      return { hasChanges: true, isNew: true };
    }

    return {
      hasChanges: latestSnapshot.stateHash !== args.currentStateHash,
      isNew: false,
      lastSnapshotAt: latestSnapshot.snapshotAt,
    };
  },
});

// ============================================
// Internal Functions (for cron jobs)
// ============================================

/**
 * Get change statistics (internal)
 */
export const getStatisticsInternal = internalQuery({
  args: {
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.days || 7;
    const startDate = Date.now() - days * 24 * 60 * 60 * 1000;

    const changes = await ctx.db
      .query("googleAdsChanges")
      .withIndex("by_changedAt", (q) => q.gte("changedAt", startDate))
      .collect();

    const byResourceType: Record<string, number> = {};
    const byChangeType: Record<string, number> = {};
    const byClientType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byDay: Record<string, number> = {};

    for (const change of changes) {
      byResourceType[change.resourceType] = (byResourceType[change.resourceType] || 0) + 1;
      byChangeType[change.changeType] = (byChangeType[change.changeType] || 0) + 1;
      const clientType = change.clientType || "Unknown";
      byClientType[clientType] = (byClientType[clientType] || 0) + 1;
      for (const field of change.changedFields) {
        byCategory[field.category] = (byCategory[field.category] || 0) + 1;
      }
      const day = new Date(change.changedAt).toISOString().split("T")[0];
      byDay[day] = (byDay[day] || 0) + 1;
    }

    return { total: changes.length, byResourceType, byChangeType, byClientType, byCategory, byDay };
  },
});

/**
 * Get changes that need to be synced (internal)
 */
export const getUnsyncedChanges = internalQuery({
  args: {
    since: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleAdsChanges")
      .withIndex("by_changedAt", (q) => q.gte("changedAt", args.since))
      .collect();
  },
});

/**
 * Mark changes as synced (internal)
 */
export const markAsSynced = internalMutation({
  args: {
    ids: v.array(v.id("googleAdsChanges")),
    syncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      await ctx.db.patch(id, { detectedAt: args.syncedAt });
    }
    return { updated: args.ids.length };
  },
});
