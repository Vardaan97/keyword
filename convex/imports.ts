import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// Campaign Performance Import
// ============================================

export const importCampaignPerformance = mutation({
  args: {
    accountId: v.string(),
    accountName: v.string(),
    dateRange: v.string(),
    campaigns: v.array(v.object({
      campaignName: v.string(),
      status: v.string(),
      campaignType: v.string(),
      clicks: v.number(),
      impressions: v.number(),
      ctr: v.number(),
      currencyCode: v.string(),
      averageCpc: v.number(),
      cost: v.number(),
      impressionsAbsTop: v.number(),
      impressionsTop: v.number(),
      conversions: v.number(),
      viewThroughConversions: v.number(),
      costPerConversion: v.number(),
      conversionRate: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Calculate totals
    const totals = args.campaigns.reduce((acc, c) => ({
      clicks: acc.clicks + c.clicks,
      impressions: acc.impressions + c.impressions,
      cost: acc.cost + c.cost,
      conversions: acc.conversions + c.conversions,
      ctr: 0,
      averageCpc: 0,
      costPerConversion: 0,
    }), { clicks: 0, impressions: 0, cost: 0, conversions: 0, ctr: 0, averageCpc: 0, costPerConversion: 0 });

    // Calculate derived metrics
    totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    totals.averageCpc = totals.clicks > 0 ? totals.cost / totals.clicks : 0;
    totals.costPerConversion = totals.conversions > 0 ? totals.cost / totals.conversions : 0;

    // Check for existing import for this account
    const existing = await ctx.db
      .query("importedCampaignPerformance")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        accountName: args.accountName,
        dateRange: args.dateRange,
        importedAt: now,
        campaigns: args.campaigns,
        totals,
      });
      return { id: existing._id, updated: true, campaignCount: args.campaigns.length };
    }

    // Create new
    const id = await ctx.db.insert("importedCampaignPerformance", {
      accountId: args.accountId,
      accountName: args.accountName,
      dateRange: args.dateRange,
      importedAt: now,
      source: "csv_import",
      campaigns: args.campaigns,
      totals,
    });

    return { id, updated: false, campaignCount: args.campaigns.length };
  },
});

export const getImportedPerformance = query({
  args: {
    accountId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("importedCampaignPerformance")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .first();
  },
});

export const getAllImportedPerformance = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("importedCampaignPerformance")
      .order("desc")
      .collect();
  },
});

// ============================================
// Account Structure Import
// ============================================

export const importAccountStructure = mutation({
  args: {
    accountId: v.string(),
    accountName: v.string(),
    summary: v.object({
      totalCampaigns: v.number(),
      enabledCampaigns: v.number(),
      pausedCampaigns: v.number(),
      totalAdGroups: v.number(),
      enabledAdGroups: v.number(),
      totalKeywords: v.number(),
      enabledKeywords: v.number(),
    }),
    campaignTypes: v.array(v.object({
      type: v.string(),
      count: v.number(),
    })),
    qualityScoreDistribution: v.optional(v.object({
      score1to3: v.number(),
      score4to6: v.number(),
      score7to10: v.number(),
      noScore: v.number(),
    })),
    topCampaigns: v.array(v.object({
      name: v.string(),
      status: v.string(),
      type: v.string(),
      adGroupCount: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing
    const existing = await ctx.db
      .query("accountStructure")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        accountName: args.accountName,
        importedAt: now,
        summary: args.summary,
        campaignTypes: args.campaignTypes,
        qualityScoreDistribution: args.qualityScoreDistribution,
        topCampaigns: args.topCampaigns,
      });
      return { id: existing._id, updated: true };
    }

    const id = await ctx.db.insert("accountStructure", {
      accountId: args.accountId,
      accountName: args.accountName,
      importedAt: now,
      source: "editor_export",
      summary: args.summary,
      campaignTypes: args.campaignTypes,
      qualityScoreDistribution: args.qualityScoreDistribution,
      topCampaigns: args.topCampaigns,
    });

    return { id, updated: false };
  },
});

export const getAccountStructure = query({
  args: {
    accountId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("accountStructure")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .first();
  },
});

// ============================================
// Import Status
// ============================================

export const getImportStatus = query({
  args: {},
  handler: async (ctx) => {
    const performance = await ctx.db
      .query("importedCampaignPerformance")
      .collect();

    const structure = await ctx.db
      .query("accountStructure")
      .collect();

    return {
      performanceImports: performance.map(p => ({
        accountId: p.accountId,
        accountName: p.accountName,
        dateRange: p.dateRange,
        campaignCount: p.campaigns.length,
        importedAt: p.importedAt,
      })),
      structureImports: structure.map(s => ({
        accountId: s.accountId,
        accountName: s.accountName,
        ...s.summary,
        importedAt: s.importedAt,
      })),
    };
  },
});
