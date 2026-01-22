import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a new import record
export const create = mutation({
  args: {
    accountId: v.string(),
    accountName: v.string(),
    fileName: v.string(),
    fileHash: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if this file was already imported (same hash)
    const existing = await ctx.db
      .query("gadsEditorImport")
      .withIndex("by_hash", (q) => q.eq("fileHash", args.fileHash))
      .first();

    if (existing) {
      // Return existing import if it was completed
      if (existing.status === "completed") {
        return { id: existing._id, alreadyExists: true };
      }
      // If previous import failed, delete it and create new
      if (existing.status === "failed") {
        await ctx.db.delete(existing._id);
      }
    }

    const id = await ctx.db.insert("gadsEditorImport", {
      accountId: args.accountId,
      accountName: args.accountName,
      fileName: args.fileName,
      fileHash: args.fileHash,
      importedAt: Date.now(),
      status: "processing",
      stats: {
        totalRows: 0,
        campaigns: 0,
        adGroups: 0,
        keywords: 0,
        ads: 0,
        processedRows: 0,
      },
      progress: 0,
    });

    return { id, alreadyExists: false };
  },
});

// Update import progress
export const updateProgress = mutation({
  args: {
    importId: v.id("gadsEditorImport"),
    progress: v.number(),
    stats: v.object({
      totalRows: v.number(),
      campaigns: v.number(),
      adGroups: v.number(),
      keywords: v.number(),
      ads: v.number(),
      processedRows: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.importId, {
      progress: args.progress,
      stats: args.stats,
    });
  },
});

// Mark import as completed
export const complete = mutation({
  args: {
    importId: v.id("gadsEditorImport"),
    stats: v.object({
      totalRows: v.number(),
      campaigns: v.number(),
      adGroups: v.number(),
      keywords: v.number(),
      ads: v.number(),
      processedRows: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.importId, {
      status: "completed",
      progress: 100,
      stats: args.stats,
    });
  },
});

// Mark import as failed
export const fail = mutation({
  args: {
    importId: v.id("gadsEditorImport"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.importId, {
      status: "failed",
      error: args.error,
    });
  },
});

// Get import by ID
export const get = query({
  args: { importId: v.id("gadsEditorImport") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.importId);
  },
});

// Get latest import for account
export const getLatestForAccount = query({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("gadsEditorImport")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .first();
  },
});

// Get all imports
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    return ctx.db
      .query("gadsEditorImport")
      .withIndex("by_imported")
      .order("desc")
      .take(limit);
  },
});

// Insert campaign
export const insertCampaign = mutation({
  args: {
    importId: v.id("gadsEditorImport"),
    accountId: v.string(),
    campaignName: v.string(),
    labels: v.array(v.string()),
    campaignType: v.string(),
    networks: v.optional(v.string()),
    budget: v.optional(v.number()),
    budgetType: v.optional(v.string()),
    bidStrategyType: v.optional(v.string()),
    bidStrategyName: v.optional(v.string()),
    targetCpa: v.optional(v.number()),
    targetRoas: v.optional(v.number()),
    maxCpcBidLimit: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    adSchedule: v.optional(v.string()),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    // Check for existing campaign with same name in this import
    const existing = await ctx.db
      .query("gadsEditorCampaigns")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .filter((q) => q.eq(q.field("campaignName"), args.campaignName))
      .first();

    if (existing) return existing._id;

    return ctx.db.insert("gadsEditorCampaigns", args);
  },
});

// Insert ad group
export const insertAdGroup = mutation({
  args: {
    importId: v.id("gadsEditorImport"),
    accountId: v.string(),
    campaignName: v.string(),
    adGroupName: v.string(),
    adGroupType: v.optional(v.string()),
    maxCpc: v.optional(v.number()),
    maxCpm: v.optional(v.number()),
    targetCpc: v.optional(v.number()),
    targetRoas: v.optional(v.number()),
    desktopBidModifier: v.optional(v.number()),
    mobileBidModifier: v.optional(v.number()),
    tabletBidModifier: v.optional(v.number()),
    optimizedTargeting: v.optional(v.string()),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("gadsEditorAdGroups", args);
  },
});

// Insert keyword
export const insertKeyword = mutation({
  args: {
    importId: v.id("gadsEditorImport"),
    accountId: v.string(),
    campaignName: v.string(),
    adGroupName: v.string(),
    keyword: v.string(),
    matchType: v.string(),
    firstPageBid: v.optional(v.number()),
    topOfPageBid: v.optional(v.number()),
    firstPositionBid: v.optional(v.number()),
    qualityScore: v.optional(v.number()),
    landingPageExperience: v.optional(v.string()),
    expectedCtr: v.optional(v.string()),
    adRelevance: v.optional(v.string()),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("gadsEditorKeywords", args);
  },
});

// Insert ad
export const insertAd = mutation({
  args: {
    importId: v.id("gadsEditorImport"),
    accountId: v.string(),
    campaignName: v.string(),
    adGroupName: v.string(),
    adType: v.string(),
    finalUrl: v.optional(v.string()),
    headlines: v.array(v.string()),
    descriptions: v.array(v.string()),
    path1: v.optional(v.string()),
    path2: v.optional(v.string()),
    status: v.string(),
    approvalStatus: v.optional(v.string()),
    adStrength: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("gadsEditorAds", args);
  },
});

// Batch insert campaigns
export const batchInsertCampaigns = mutation({
  args: {
    campaigns: v.array(v.object({
      importId: v.id("gadsEditorImport"),
      accountId: v.string(),
      campaignName: v.string(),
      labels: v.array(v.string()),
      campaignType: v.string(),
      networks: v.optional(v.string()),
      budget: v.optional(v.number()),
      budgetType: v.optional(v.string()),
      bidStrategyType: v.optional(v.string()),
      bidStrategyName: v.optional(v.string()),
      targetCpa: v.optional(v.number()),
      targetRoas: v.optional(v.number()),
      maxCpcBidLimit: v.optional(v.number()),
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      adSchedule: v.optional(v.string()),
      status: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    for (const campaign of args.campaigns) {
      await ctx.db.insert("gadsEditorCampaigns", campaign);
    }
    return args.campaigns.length;
  },
});

// Batch insert ad groups
export const batchInsertAdGroups = mutation({
  args: {
    adGroups: v.array(v.object({
      importId: v.id("gadsEditorImport"),
      accountId: v.string(),
      campaignName: v.string(),
      adGroupName: v.string(),
      adGroupType: v.optional(v.string()),
      maxCpc: v.optional(v.number()),
      maxCpm: v.optional(v.number()),
      targetCpc: v.optional(v.number()),
      targetRoas: v.optional(v.number()),
      desktopBidModifier: v.optional(v.number()),
      mobileBidModifier: v.optional(v.number()),
      tabletBidModifier: v.optional(v.number()),
      optimizedTargeting: v.optional(v.string()),
      status: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    for (const adGroup of args.adGroups) {
      await ctx.db.insert("gadsEditorAdGroups", adGroup);
    }
    return args.adGroups.length;
  },
});

// Batch insert keywords
export const batchInsertKeywords = mutation({
  args: {
    keywords: v.array(v.object({
      importId: v.id("gadsEditorImport"),
      accountId: v.string(),
      campaignName: v.string(),
      adGroupName: v.string(),
      keyword: v.string(),
      matchType: v.string(),
      firstPageBid: v.optional(v.number()),
      topOfPageBid: v.optional(v.number()),
      firstPositionBid: v.optional(v.number()),
      qualityScore: v.optional(v.number()),
      landingPageExperience: v.optional(v.string()),
      expectedCtr: v.optional(v.string()),
      adRelevance: v.optional(v.string()),
      status: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    for (const keyword of args.keywords) {
      await ctx.db.insert("gadsEditorKeywords", keyword);
    }
    return args.keywords.length;
  },
});

// Batch insert ads
export const batchInsertAds = mutation({
  args: {
    ads: v.array(v.object({
      importId: v.id("gadsEditorImport"),
      accountId: v.string(),
      campaignName: v.string(),
      adGroupName: v.string(),
      adType: v.string(),
      finalUrl: v.optional(v.string()),
      headlines: v.array(v.string()),
      descriptions: v.array(v.string()),
      path1: v.optional(v.string()),
      path2: v.optional(v.string()),
      status: v.string(),
      approvalStatus: v.optional(v.string()),
      adStrength: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    for (const ad of args.ads) {
      await ctx.db.insert("gadsEditorAds", ad);
    }
    return args.ads.length;
  },
});

// Get import summary with entity counts
export const getSummary = query({
  args: { importId: v.id("gadsEditorImport") },
  handler: async (ctx, args) => {
    const importData = await ctx.db.get(args.importId);
    if (!importData) return null;

    // Get quality score distribution
    const keywords = await ctx.db
      .query("gadsEditorKeywords")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();

    const qualityScoreDistribution = {
      score1to3: 0,
      score4to6: 0,
      score7to10: 0,
      noScore: 0,
    };

    for (const kw of keywords) {
      if (kw.qualityScore === undefined || kw.qualityScore === null) {
        qualityScoreDistribution.noScore++;
      } else if (kw.qualityScore <= 3) {
        qualityScoreDistribution.score1to3++;
      } else if (kw.qualityScore <= 6) {
        qualityScoreDistribution.score4to6++;
      } else {
        qualityScoreDistribution.score7to10++;
      }
    }

    return {
      ...importData,
      qualityScoreDistribution,
    };
  },
});

// Delete a single batch of import data - call repeatedly until done
export const deleteImportBatch = mutation({
  args: { importId: v.id("gadsEditorImport") },
  handler: async (ctx, args) => {
    const BATCH_SIZE = 500; // Stay under read/write limits
    let deleted = 0;

    // Check if import exists
    const importData = await ctx.db.get(args.importId);
    if (!importData) {
      return { done: true, deleted: 0, error: "Import not found" };
    }

    // Delete keywords first (largest table)
    const keywords = await ctx.db
      .query("gadsEditorKeywords")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .take(BATCH_SIZE);

    if (keywords.length > 0) {
      for (const kw of keywords) {
        await ctx.db.delete(kw._id);
        deleted++;
      }
      return { done: false, deleted, remaining: "keywords" };
    }

    // Delete ads
    const ads = await ctx.db
      .query("gadsEditorAds")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .take(BATCH_SIZE);

    if (ads.length > 0) {
      for (const ad of ads) {
        await ctx.db.delete(ad._id);
        deleted++;
      }
      return { done: false, deleted, remaining: "ads" };
    }

    // Delete ad groups
    const adGroups = await ctx.db
      .query("gadsEditorAdGroups")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .take(BATCH_SIZE);

    if (adGroups.length > 0) {
      for (const ag of adGroups) {
        await ctx.db.delete(ag._id);
        deleted++;
      }
      return { done: false, deleted, remaining: "adGroups" };
    }

    // Delete campaigns
    const campaigns = await ctx.db
      .query("gadsEditorCampaigns")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .take(BATCH_SIZE);

    if (campaigns.length > 0) {
      for (const c of campaigns) {
        await ctx.db.delete(c._id);
        deleted++;
      }
      return { done: false, deleted, remaining: "campaigns" };
    }

    // All related data deleted, now delete the import itself
    await ctx.db.delete(args.importId);

    return { done: true, deleted: 1, remaining: null };
  },
});

// Legacy delete - only use for small imports
export const deleteImport = mutation({
  args: { importId: v.id("gadsEditorImport") },
  handler: async (ctx, args) => {
    // For backward compatibility, just mark as deleting and let API handle batches
    await ctx.db.patch(args.importId, { status: "deleting" as any });
    return { started: true };
  },
});
