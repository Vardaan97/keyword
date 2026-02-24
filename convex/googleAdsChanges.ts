import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================
// Change Event CRUD Operations (Enhanced Schema)
// ============================================

// Enhanced changed field validator
const changedFieldValidator = v.object({
  field: v.string(),
  category: v.string(),         // budget, bidding, status, targeting, schedule, creative, metadata
  oldValue: v.optional(v.string()),
  newValue: v.optional(v.string()),
  oldValueRaw: v.optional(v.any()),  // Original type preserved
  newValueRaw: v.optional(v.any()),
});

// Full change event validator
const changeEventValidator = {
  // Identity
  changeId: v.string(),           // Unique change event ID from Google
  customerId: v.string(),
  accountName: v.string(),

  // Resource
  resourceType: v.string(),
  resourceId: v.string(),
  resourceName: v.string(),
  parentResourceId: v.optional(v.string()),
  parentResourceName: v.optional(v.string()),

  // Change Details
  changeType: v.string(),
  changedAt: v.number(),
  detectedAt: v.number(),

  // Attribution
  userEmail: v.optional(v.string()),
  clientType: v.string(),
  clientTypeFriendly: v.string(),
  isAutomated: v.boolean(),

  // Field-Level Changes
  changedFields: v.array(changedFieldValidator),

  // AI-Ready Summary
  summary: v.string(),
  impactCategory: v.string(),     // "high", "medium", "low"
  tags: v.array(v.string()),

  // Correlation
  batchId: v.optional(v.string()),
  experimentId: v.optional(v.string()),
  algorithmId: v.optional(v.string()),
};

/**
 * Upsert a change event (insert or update if exists)
 * Uses changeId as unique key (from Google's change event ID)
 */
export const upsert = mutation({
  args: changeEventValidator,
  handler: async (ctx, args) => {
    // Check if this change already exists by changeId
    const existing = await ctx.db
      .query("googleAdsChanges")
      .withIndex("by_changeId", (q) => q.eq("changeId", args.changeId))
      .first();

    if (existing) {
      // Update existing record
      await ctx.db.patch(existing._id, { ...args });
      return existing._id;
    }

    // Insert new record
    return await ctx.db.insert("googleAdsChanges", args);
  },
});

/**
 * Bulk insert changes (for efficient syncing)
 * Deduplicates by changeId
 */
export const bulkInsert = mutation({
  args: {
    changes: v.array(v.object(changeEventValidator)),
  },
  handler: async (ctx, args) => {
    const insertedIds: Id<"googleAdsChanges">[] = [];
    const skippedCount = { duplicates: 0 };

    for (const change of args.changes) {
      // Check for existing by changeId
      const existing = await ctx.db
        .query("googleAdsChanges")
        .withIndex("by_changeId", (q) => q.eq("changeId", change.changeId))
        .first();

      if (!existing) {
        const id = await ctx.db.insert("googleAdsChanges", change);
        insertedIds.push(id);
      } else {
        skippedCount.duplicates++;
      }
    }

    return {
      inserted: insertedIds.length,
      duplicates: skippedCount.duplicates,
      total: args.changes.length
    };
  },
});

/**
 * Bulk upsert changes (insert or update)
 * More permissive - updates existing records
 */
export const bulkUpsert = mutation({
  args: {
    changes: v.array(v.object(changeEventValidator)),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const change of args.changes) {
      const existing = await ctx.db
        .query("googleAdsChanges")
        .withIndex("by_changeId", (q) => q.eq("changeId", change.changeId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { ...change });
        updated++;
      } else {
        await ctx.db.insert("googleAdsChanges", change);
        inserted++;
      }
    }

    return { inserted, updated, total: args.changes.length };
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
 * Get changes by impact category
 */
export const getByImpactCategory = query({
  args: {
    impactCategory: v.string(), // "high", "medium", "low"
    customerId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    let changes = await ctx.db
      .query("googleAdsChanges")
      .withIndex("by_impactCategory", (q) => q.eq("impactCategory", args.impactCategory))
      .order("desc")
      .take(limit * 2);

    if (args.customerId) {
      changes = changes.filter((c) => c.customerId === args.customerId);
    }

    return changes.slice(0, limit);
  },
});

/**
 * Get changes by user email
 */
export const getByUserEmail = query({
  args: {
    userEmail: v.string(),
    limit: v.optional(v.number()),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    const days = args.days || 30;
    const startDate = Date.now() - days * 24 * 60 * 60 * 1000;

    const changes = await ctx.db
      .query("googleAdsChanges")
      .withIndex("by_userEmail", (q) => q.eq("userEmail", args.userEmail).gte("changedAt", startDate))
      .order("desc")
      .take(limit);

    return changes;
  },
});

/**
 * Get changes by automation status
 */
export const getByAutomationStatus = query({
  args: {
    isAutomated: v.boolean(),
    customerId: v.optional(v.string()),
    limit: v.optional(v.number()),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    const days = args.days || 7;
    const startDate = Date.now() - days * 24 * 60 * 60 * 1000;

    let changes = await ctx.db
      .query("googleAdsChanges")
      .withIndex("by_changedAt", (q) => q.gte("changedAt", startDate))
      .filter((q) => q.eq(q.field("isAutomated"), args.isAutomated))
      .order("desc")
      .take(limit * 2);

    if (args.customerId) {
      changes = changes.filter((c) => c.customerId === args.customerId);
    }

    return changes.slice(0, limit);
  },
});

/**
 * Search changes by summary text
 */
export const searchChanges = query({
  args: {
    searchText: v.string(),
    customerId: v.optional(v.string()),
    resourceType: v.optional(v.string()),
    changeType: v.optional(v.string()),
    impactCategory: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    // Build the search query with filters
    let searchQuery = ctx.db
      .query("googleAdsChanges")
      .withSearchIndex("search_changes", (q) => {
        let search = q.search("summary", args.searchText);
        if (args.customerId) search = search.eq("customerId", args.customerId);
        if (args.resourceType) search = search.eq("resourceType", args.resourceType);
        if (args.changeType) search = search.eq("changeType", args.changeType);
        if (args.impactCategory) search = search.eq("impactCategory", args.impactCategory);
        return search;
      });

    const changes = await searchQuery.take(limit);
    return changes;
  },
});

/**
 * Get change statistics (enhanced with new fields)
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
    const byImpactCategory: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    const byAccount: Record<string, number> = {};
    let automatedCount = 0;
    let manualCount = 0;

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

      // By impact category (new)
      if (change.impactCategory) {
        byImpactCategory[change.impactCategory] = (byImpactCategory[change.impactCategory] || 0) + 1;
      }

      // By user (new)
      const user = change.userEmail || "System/Unknown";
      byUser[user] = (byUser[user] || 0) + 1;

      // By account (new)
      const account = change.accountName || change.customerId;
      byAccount[account] = (byAccount[account] || 0) + 1;

      // Automated vs manual (new)
      if (change.isAutomated) {
        automatedCount++;
      } else {
        manualCount++;
      }
    }

    return {
      total: changes.length,
      byResourceType,
      byChangeType,
      byClientType,
      byCategory,
      byDay,
      // New fields
      byImpactCategory,
      byUser,
      byAccount,
      automatedVsManual: {
        automated: automatedCount,
        manual: manualCount,
      },
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
