import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// TTL constants in milliseconds
const ONE_HOUR = 60 * 60 * 1000;
const FOUR_HOURS = 4 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

// ============================================
// Campaign Performance Cache
// ============================================

export const getCampaignPerformance = query({
  args: {
    accountId: v.string(),
    dateRange: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cached = await ctx.db
      .query("campaignPerformanceCache")
      .withIndex("by_account_date", (q) =>
        q.eq("accountId", args.accountId).eq("dateRange", args.dateRange)
      )
      .first();

    if (cached && cached.expiresAt > now) {
      return cached;
    }
    return null;
  },
});

export const setCampaignPerformance = mutation({
  args: {
    accountId: v.string(),
    dateRange: v.string(),
    campaigns: v.array(v.object({
      campaignId: v.string(),
      campaignName: v.string(),
      status: v.string(),
      channelType: v.string(),
      biddingStrategy: v.string(),
      impressions: v.number(),
      clicks: v.number(),
      ctr: v.number(),
      averageCpc: v.number(),
      costMicros: v.number(),
      conversions: v.number(),
      conversionsValue: v.number(),
      costPerConversion: v.number(),
    })),
    totals: v.object({
      impressions: v.number(),
      clicks: v.number(),
      costMicros: v.number(),
      conversions: v.number(),
      conversionsValue: v.number(),
      ctr: v.number(),
      averageCpc: v.number(),
      costPerConversion: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing entry
    const existing = await ctx.db
      .query("campaignPerformanceCache")
      .withIndex("by_account_date", (q) =>
        q.eq("accountId", args.accountId).eq("dateRange", args.dateRange)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        campaigns: args.campaigns,
        totals: args.totals,
        fetchedAt: now,
        expiresAt: now + ONE_HOUR,
      });
      return existing._id;
    }

    return await ctx.db.insert("campaignPerformanceCache", {
      accountId: args.accountId,
      dateRange: args.dateRange,
      campaigns: args.campaigns,
      totals: args.totals,
      fetchedAt: now,
      expiresAt: now + ONE_HOUR,
    });
  },
});

// ============================================
// Recommendations Cache
// ============================================

export const getRecommendations = query({
  args: {
    accountId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cached = await ctx.db
      .query("recommendationsCache")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .first();

    if (cached && cached.expiresAt > now) {
      return cached;
    }
    return null;
  },
});

export const setRecommendations = mutation({
  args: {
    accountId: v.string(),
    recommendations: v.array(v.object({
      resourceName: v.string(),
      type: v.string(),
      category: v.string(),
      impact: v.object({
        baseImpressions: v.number(),
        potentialImpressions: v.number(),
        baseClicks: v.number(),
        potentialClicks: v.number(),
        baseConversions: v.number(),
        potentialConversions: v.number(),
      }),
      campaignBudget: v.optional(v.object({
        currentBudgetMicros: v.number(),
        recommendedBudgetMicros: v.number(),
      })),
      keyword: v.optional(v.object({
        keyword: v.string(),
        matchType: v.string(),
      })),
      description: v.optional(v.string()),
    })),
    summary: v.object({
      total: v.number(),
      byCategory: v.any(),
      potentialClicks: v.number(),
      potentialConversions: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing entry
    const existing = await ctx.db
      .query("recommendationsCache")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        recommendations: args.recommendations,
        summary: args.summary,
        fetchedAt: now,
        expiresAt: now + FOUR_HOURS,
      });
      return existing._id;
    }

    return await ctx.db.insert("recommendationsCache", {
      accountId: args.accountId,
      recommendations: args.recommendations,
      summary: args.summary,
      fetchedAt: now,
      expiresAt: now + FOUR_HOURS,
    });
  },
});

// ============================================
// Optimization Score Cache
// ============================================

export const getOptimizationScore = query({
  args: {
    accountId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cached = await ctx.db
      .query("optimizationScoreCache")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .first();

    if (cached && cached.expiresAt > now) {
      return cached;
    }
    return null;
  },
});

export const setOptimizationScore = mutation({
  args: {
    accountId: v.string(),
    score: v.number(),
    upliftPotential: v.number(),
    recommendationCount: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing entry
    const existing = await ctx.db
      .query("optimizationScoreCache")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        score: args.score,
        upliftPotential: args.upliftPotential,
        recommendationCount: args.recommendationCount,
        fetchedAt: now,
        expiresAt: now + TWENTY_FOUR_HOURS,
      });
      return existing._id;
    }

    return await ctx.db.insert("optimizationScoreCache", {
      accountId: args.accountId,
      score: args.score,
      upliftPotential: args.upliftPotential,
      recommendationCount: args.recommendationCount,
      fetchedAt: now,
      expiresAt: now + TWENTY_FOUR_HOURS,
    });
  },
});

// ============================================
// Account Summary Cache
// ============================================

export const getAccountSummary = query({
  args: {
    accountId: v.string(),
    dateRange: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const cached = await ctx.db
      .query("accountSummaryCache")
      .withIndex("by_account_date", (q) =>
        q.eq("accountId", args.accountId).eq("dateRange", args.dateRange)
      )
      .first();

    if (cached && cached.expiresAt > now) {
      return cached;
    }
    return null;
  },
});

export const setAccountSummary = mutation({
  args: {
    accountId: v.string(),
    dateRange: v.string(),
    accountName: v.string(),
    currencyCode: v.string(),
    totalCampaigns: v.number(),
    enabledCampaigns: v.number(),
    metrics: v.object({
      impressions: v.number(),
      clicks: v.number(),
      costMicros: v.number(),
      conversions: v.number(),
      conversionsValue: v.number(),
      ctr: v.number(),
      averageCpc: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing entry
    const existing = await ctx.db
      .query("accountSummaryCache")
      .withIndex("by_account_date", (q) =>
        q.eq("accountId", args.accountId).eq("dateRange", args.dateRange)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accountName: args.accountName,
        currencyCode: args.currencyCode,
        totalCampaigns: args.totalCampaigns,
        enabledCampaigns: args.enabledCampaigns,
        metrics: args.metrics,
        fetchedAt: now,
        expiresAt: now + ONE_HOUR,
      });
      return existing._id;
    }

    return await ctx.db.insert("accountSummaryCache", {
      accountId: args.accountId,
      dateRange: args.dateRange,
      accountName: args.accountName,
      currencyCode: args.currencyCode,
      totalCampaigns: args.totalCampaigns,
      enabledCampaigns: args.enabledCampaigns,
      metrics: args.metrics,
      fetchedAt: now,
      expiresAt: now + ONE_HOUR,
    });
  },
});

// ============================================
// Cache Maintenance
// ============================================

export const clearExpiredCaches = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let deletedCount = 0;

    // Clear expired campaign performance cache
    const expiredPerformance = await ctx.db
      .query("campaignPerformanceCache")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .collect();
    for (const entry of expiredPerformance) {
      await ctx.db.delete(entry._id);
      deletedCount++;
    }

    // Clear expired recommendations cache
    const expiredRecommendations = await ctx.db
      .query("recommendationsCache")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .collect();
    for (const entry of expiredRecommendations) {
      await ctx.db.delete(entry._id);
      deletedCount++;
    }

    // Clear expired optimization score cache
    const expiredScores = await ctx.db
      .query("optimizationScoreCache")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .collect();
    for (const entry of expiredScores) {
      await ctx.db.delete(entry._id);
      deletedCount++;
    }

    // Clear expired account summary cache
    const expiredSummaries = await ctx.db
      .query("accountSummaryCache")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .collect();
    for (const entry of expiredSummaries) {
      await ctx.db.delete(entry._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});

// Internal version for cron jobs
export const clearExpiredCachesInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let deletedCount = 0;

    const expiredPerformance = await ctx.db
      .query("campaignPerformanceCache")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .collect();
    for (const entry of expiredPerformance) {
      await ctx.db.delete(entry._id);
      deletedCount++;
    }

    const expiredRecommendations = await ctx.db
      .query("recommendationsCache")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .collect();
    for (const entry of expiredRecommendations) {
      await ctx.db.delete(entry._id);
      deletedCount++;
    }

    const expiredScores = await ctx.db
      .query("optimizationScoreCache")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .collect();
    for (const entry of expiredScores) {
      await ctx.db.delete(entry._id);
      deletedCount++;
    }

    const expiredSummaries = await ctx.db
      .query("accountSummaryCache")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .collect();
    for (const entry of expiredSummaries) {
      await ctx.db.delete(entry._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});

// Get cache statistics
export const getCacheStats = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const performanceCache = await ctx.db
      .query("campaignPerformanceCache")
      .collect();
    const recommendationsCache = await ctx.db
      .query("recommendationsCache")
      .collect();
    const scoresCache = await ctx.db
      .query("optimizationScoreCache")
      .collect();
    const summaryCache = await ctx.db
      .query("accountSummaryCache")
      .collect();

    return {
      campaignPerformance: {
        total: performanceCache.length,
        active: performanceCache.filter(c => c.expiresAt > now).length,
        expired: performanceCache.filter(c => c.expiresAt <= now).length,
      },
      recommendations: {
        total: recommendationsCache.length,
        active: recommendationsCache.filter(c => c.expiresAt > now).length,
        expired: recommendationsCache.filter(c => c.expiresAt <= now).length,
      },
      optimizationScore: {
        total: scoresCache.length,
        active: scoresCache.filter(c => c.expiresAt > now).length,
        expired: scoresCache.filter(c => c.expiresAt <= now).length,
      },
      accountSummary: {
        total: summaryCache.length,
        active: summaryCache.filter(c => c.expiresAt > now).length,
        expired: summaryCache.filter(c => c.expiresAt <= now).length,
      },
    };
  },
});
