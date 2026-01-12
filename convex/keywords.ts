import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get cached keywords by cache key
 * Returns null if not found or expired
 */
export const getCached = query({
  args: {
    cacheKey: v.string(),
  },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("keywordCache")
      .withIndex("by_cache_key", q => q.eq("cacheKey", args.cacheKey))
      .first();

    if (!cached) {
      return null;
    }

    // Check if expired
    if (cached.expiresAt < Date.now()) {
      return null;
    }

    return {
      keywords: cached.keywords,
      source: cached.source,
      geoTarget: cached.geoTarget,
      createdAt: cached.createdAt,
      expiresAt: cached.expiresAt,
    };
  },
});

/**
 * Set cached keywords
 * Upserts - deletes existing cache entry if present
 */
export const setCached = mutation({
  args: {
    cacheKey: v.string(),
    geoTarget: v.string(),
    source: v.string(),
    keywords: v.array(v.object({
      keyword: v.string(),
      avgMonthlySearches: v.number(),
      competition: v.string(),
      competitionIndex: v.number(),
      lowTopOfPageBidMicros: v.optional(v.number()),
      highTopOfPageBidMicros: v.optional(v.number()),
      inAccount: v.optional(v.boolean()),
      inAccountNames: v.optional(v.array(v.string())),
    })),
    ttlHours: v.number(),
  },
  handler: async (ctx, args) => {
    // Delete existing cache entry if present
    const existing = await ctx.db
      .query("keywordCache")
      .withIndex("by_cache_key", q => q.eq("cacheKey", args.cacheKey))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    // Insert new cache entry
    const now = Date.now();
    await ctx.db.insert("keywordCache", {
      cacheKey: args.cacheKey,
      geoTarget: args.geoTarget,
      source: args.source,
      keywords: args.keywords,
      createdAt: now,
      expiresAt: now + args.ttlHours * 60 * 60 * 1000,
    });
  },
});

/**
 * Clear expired cache entries
 */
export const clearExpired = mutation({
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("keywordCache")
      .withIndex("by_expires", q => q.lt("expiresAt", now))
      .collect();

    let deleted = 0;
    for (const item of expired) {
      await ctx.db.delete(item._id);
      deleted++;
    }

    return { deleted };
  },
});

/**
 * Get cache statistics
 */
export const getStats = query({
  handler: async (ctx) => {
    const all = await ctx.db.query("keywordCache").collect();
    const now = Date.now();

    const stats = {
      totalEntries: all.length,
      expiredEntries: all.filter(c => c.expiresAt < now).length,
      activeEntries: all.filter(c => c.expiresAt >= now).length,
      totalKeywords: all.reduce((sum, c) => sum + c.keywords.length, 0),
      bySource: {} as Record<string, number>,
      byGeo: {} as Record<string, number>,
    };

    for (const cache of all) {
      stats.bySource[cache.source] = (stats.bySource[cache.source] || 0) + 1;
      stats.byGeo[cache.geoTarget] = (stats.byGeo[cache.geoTarget] || 0) + 1;
    }

    return stats;
  },
});
