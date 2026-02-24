import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================
// Conversions/Leads CRUD Operations
// ============================================

// Lead data validator
const leadDataValidator = v.object({
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  company: v.optional(v.string()),
  customFields: v.optional(v.any()),
});

// Full conversion validator
const conversionValidator = {
  // Identity
  conversionId: v.string(),
  customerId: v.string(),
  accountName: v.string(),

  // Attribution
  campaignId: v.string(),
  campaignName: v.string(),
  adGroupId: v.optional(v.string()),
  adGroupName: v.optional(v.string()),
  keywordId: v.optional(v.string()),
  keywordText: v.optional(v.string()),

  // Conversion Details
  conversionAction: v.string(),
  conversionActionId: v.string(),
  conversionName: v.string(),
  conversionValue: v.number(),
  conversionDate: v.string(),
  conversionDateTime: v.number(),

  // Click Data
  gclid: v.optional(v.string()),
  clickDate: v.optional(v.string()),
  daysToConversion: v.optional(v.number()),

  // Lead Details
  leadFormId: v.optional(v.string()),
  leadFormName: v.optional(v.string()),
  leadData: v.optional(leadDataValidator),

  // Enrichment
  enrichedAt: v.optional(v.number()),
  enrichmentSource: v.optional(v.string()),
  enrichmentData: v.optional(v.any()),

  // Metadata
  createdAt: v.number(),
  syncedAt: v.number(),
};

/**
 * Upsert a conversion (insert or update if exists)
 */
export const upsert = mutation({
  args: conversionValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("googleAdsConversions")
      .withIndex("by_conversionId", (q) => q.eq("conversionId", args.conversionId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }

    return await ctx.db.insert("googleAdsConversions", args);
  },
});

/**
 * Bulk insert conversions (for efficient syncing)
 */
export const bulkInsert = mutation({
  args: {
    conversions: v.array(v.object(conversionValidator)),
  },
  handler: async (ctx, args) => {
    const insertedIds: Id<"googleAdsConversions">[] = [];
    let duplicates = 0;

    for (const conversion of args.conversions) {
      const existing = await ctx.db
        .query("googleAdsConversions")
        .withIndex("by_conversionId", (q) => q.eq("conversionId", conversion.conversionId))
        .first();

      if (!existing) {
        const id = await ctx.db.insert("googleAdsConversions", conversion);
        insertedIds.push(id);
      } else {
        duplicates++;
      }
    }

    return { inserted: insertedIds.length, duplicates, total: args.conversions.length };
  },
});

/**
 * Bulk upsert conversions (insert or update)
 */
export const bulkUpsert = mutation({
  args: {
    conversions: v.array(v.object(conversionValidator)),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const conversion of args.conversions) {
      const existing = await ctx.db
        .query("googleAdsConversions")
        .withIndex("by_conversionId", (q) => q.eq("conversionId", conversion.conversionId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, conversion);
        updated++;
      } else {
        await ctx.db.insert("googleAdsConversions", conversion);
        inserted++;
      }
    }

    return { inserted, updated, total: args.conversions.length };
  },
});

/**
 * Get conversions for an account
 */
export const getByAccount = query({
  args: {
    customerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    return await ctx.db
      .query("googleAdsConversions")
      .withIndex("by_customerId", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Get conversions within a date range
 */
export const getByDateRange = query({
  args: {
    customerId: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 500;

    const conversions = await ctx.db
      .query("googleAdsConversions")
      .withIndex("by_customerId_date", (q) =>
        q.eq("customerId", args.customerId)
          .gte("conversionDate", args.startDate)
          .lte("conversionDate", args.endDate)
      )
      .order("desc")
      .take(limit);

    return conversions;
  },
});

/**
 * Get conversions by campaign
 */
export const getByCampaign = query({
  args: {
    campaignId: v.string(),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    let query = ctx.db
      .query("googleAdsConversions")
      .withIndex("by_campaignId", (q) => q.eq("campaignId", args.campaignId));

    if (args.startDate && args.endDate) {
      const startDate = args.startDate;
      const endDate = args.endDate;
      query = query.filter((q) =>
        q.and(
          q.gte(q.field("conversionDate"), startDate),
          q.lte(q.field("conversionDate"), endDate)
        )
      );
    }

    return await query.order("desc").take(limit);
  },
});

/**
 * Get conversions by GCLID
 */
export const getByGclid = query({
  args: {
    gclid: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleAdsConversions")
      .withIndex("by_gclid", (q) => q.eq("gclid", args.gclid))
      .collect();
  },
});

/**
 * Get conversions by conversion action type
 */
export const getByConversionAction = query({
  args: {
    conversionAction: v.string(),
    customerId: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    let conversions = await ctx.db
      .query("googleAdsConversions")
      .withIndex("by_conversionAction", (q) => q.eq("conversionAction", args.conversionAction))
      .order("desc")
      .take(limit * 2);

    if (args.customerId) {
      conversions = conversions.filter(c => c.customerId === args.customerId);
    }

    if (args.startDate && args.endDate) {
      conversions = conversions.filter(c =>
        c.conversionDate >= args.startDate! && c.conversionDate <= args.endDate!
      );
    }

    return conversions.slice(0, limit);
  },
});

/**
 * Get lead form submissions
 */
export const getLeadFormSubmissions = query({
  args: {
    customerId: v.optional(v.string()),
    leadFormId: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;

    let conversions = await ctx.db
      .query("googleAdsConversions")
      .filter((q) => q.neq(q.field("leadFormId"), undefined))
      .order("desc")
      .take(limit * 2);

    if (args.customerId) {
      conversions = conversions.filter(c => c.customerId === args.customerId);
    }

    if (args.leadFormId) {
      conversions = conversions.filter(c => c.leadFormId === args.leadFormId);
    }

    if (args.startDate && args.endDate) {
      conversions = conversions.filter(c =>
        c.conversionDate >= args.startDate! && c.conversionDate <= args.endDate!
      );
    }

    return conversions.slice(0, limit);
  },
});

/**
 * Get conversion statistics
 */
export const getStatistics = query({
  args: {
    customerId: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Default to last 30 days if no date range specified
    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const startDate = args.startDate || thirtyDaysAgo;
    const endDate = args.endDate || today;

    let conversions;
    if (args.customerId) {
      const customerId = args.customerId;
      conversions = await ctx.db
        .query("googleAdsConversions")
        .withIndex("by_customerId_date", (q) =>
          q.eq("customerId", customerId)
            .gte("conversionDate", startDate)
            .lte("conversionDate", endDate)
        )
        .collect();
    } else {
      conversions = await ctx.db
        .query("googleAdsConversions")
        .filter((q) =>
          q.and(
            q.gte(q.field("conversionDate"), startDate),
            q.lte(q.field("conversionDate"), endDate)
          )
        )
        .collect();
    }

    // Calculate statistics
    const byConversionAction: Record<string, { count: number; value: number }> = {};
    const byCampaign: Record<string, { name: string; count: number; value: number }> = {};
    const byDate: Record<string, { count: number; value: number }> = {};
    let totalValue = 0;
    let leadCount = 0;
    let averageDaysToConversion = 0;
    let daysToConversionSum = 0;
    let daysToConversionCount = 0;

    for (const conversion of conversions) {
      totalValue += conversion.conversionValue;

      // By conversion action
      if (!byConversionAction[conversion.conversionAction]) {
        byConversionAction[conversion.conversionAction] = { count: 0, value: 0 };
      }
      byConversionAction[conversion.conversionAction].count++;
      byConversionAction[conversion.conversionAction].value += conversion.conversionValue;

      // By campaign
      if (!byCampaign[conversion.campaignId]) {
        byCampaign[conversion.campaignId] = { name: conversion.campaignName, count: 0, value: 0 };
      }
      byCampaign[conversion.campaignId].count++;
      byCampaign[conversion.campaignId].value += conversion.conversionValue;

      // By date
      if (!byDate[conversion.conversionDate]) {
        byDate[conversion.conversionDate] = { count: 0, value: 0 };
      }
      byDate[conversion.conversionDate].count++;
      byDate[conversion.conversionDate].value += conversion.conversionValue;

      // Lead count
      if (conversion.leadFormId || conversion.conversionAction.toLowerCase().includes("lead")) {
        leadCount++;
      }

      // Days to conversion
      if (conversion.daysToConversion !== undefined) {
        daysToConversionSum += conversion.daysToConversion;
        daysToConversionCount++;
      }
    }

    if (daysToConversionCount > 0) {
      averageDaysToConversion = daysToConversionSum / daysToConversionCount;
    }

    return {
      dateRange: { start: startDate, end: endDate },
      total: conversions.length,
      totalValue,
      leadCount,
      averageDaysToConversion,
      byConversionAction,
      byCampaign,
      byDate,
    };
  },
});

/**
 * Update enrichment data for a conversion
 */
export const updateEnrichment = mutation({
  args: {
    conversionId: v.string(),
    enrichmentSource: v.string(),
    enrichmentData: v.any(),
  },
  handler: async (ctx, args) => {
    const conversion = await ctx.db
      .query("googleAdsConversions")
      .withIndex("by_conversionId", (q) => q.eq("conversionId", args.conversionId))
      .first();

    if (!conversion) {
      throw new Error(`Conversion not found: ${args.conversionId}`);
    }

    await ctx.db.patch(conversion._id, {
      enrichedAt: Date.now(),
      enrichmentSource: args.enrichmentSource,
      enrichmentData: args.enrichmentData,
    });

    return conversion._id;
  },
});

/**
 * Get conversions that need enrichment
 */
export const getUnEnriched = query({
  args: {
    customerId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    let conversions = await ctx.db
      .query("googleAdsConversions")
      .filter((q) =>
        q.and(
          q.eq(q.field("enrichedAt"), undefined),
          q.neq(q.field("leadData"), undefined)
        )
      )
      .order("desc")
      .take(limit * 2);

    if (args.customerId) {
      conversions = conversions.filter(c => c.customerId === args.customerId);
    }

    return conversions.slice(0, limit);
  },
});

// ============================================
// Internal Functions (for cron jobs)
// ============================================

/**
 * Bulk upsert conversions (internal)
 */
export const bulkUpsertInternal = internalMutation({
  args: {
    conversions: v.array(v.object(conversionValidator)),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const conversion of args.conversions) {
      const existing = await ctx.db
        .query("googleAdsConversions")
        .withIndex("by_conversionId", (q) => q.eq("conversionId", conversion.conversionId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, conversion);
        updated++;
      } else {
        await ctx.db.insert("googleAdsConversions", conversion);
        inserted++;
      }
    }

    return { inserted, updated, total: args.conversions.length };
  },
});

/**
 * Get recent conversions for sync status check
 */
export const getRecentInternal = internalQuery({
  args: {
    customerId: v.string(),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.days || 7;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    return await ctx.db
      .query("googleAdsConversions")
      .withIndex("by_customerId_date", (q) =>
        q.eq("customerId", args.customerId).gte("conversionDate", startDate)
      )
      .collect();
  },
});

/**
 * Cleanup old conversions (keep last N days)
 */
export const cleanupOldConversions = internalMutation({
  args: {
    keepDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const keepDays = args.keepDays || 365; // Keep 1 year by default
    const cutoffDate = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const oldConversions = await ctx.db
      .query("googleAdsConversions")
      .filter((q) => q.lt(q.field("conversionDate"), cutoffDate))
      .collect();

    let deletedCount = 0;
    for (const conversion of oldConversions) {
      await ctx.db.delete(conversion._id);
      deletedCount++;
    }

    return { deletedCount, cutoffDate };
  },
});
