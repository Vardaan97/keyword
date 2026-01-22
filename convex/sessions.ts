/**
 * Convex Sessions Functions
 *
 * CRUD operations for research session management.
 * Stores full keyword data for reload, export, and re-analysis.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// Types
// ============================================

const keywordIdeaValidator = v.object({
  keyword: v.string(),
  avgMonthlySearches: v.number(),
  competition: v.string(),
  competitionIndex: v.number(),
  lowTopOfPageBidMicros: v.optional(v.number()),
  highTopOfPageBidMicros: v.optional(v.number()),
  inAccount: v.optional(v.boolean()),
  inAccountNames: v.optional(v.array(v.string())),
});

const analyzedKeywordValidator = v.object({
  keyword: v.string(),
  avgMonthlySearches: v.number(),
  competition: v.string(),
  competitionIndex: v.number(),
  lowTopOfPageBidMicros: v.optional(v.number()),
  highTopOfPageBidMicros: v.optional(v.number()),
  inAccount: v.optional(v.boolean()),
  inAccountNames: v.optional(v.array(v.string())),
  courseRelevance: v.number(),
  relevanceStatus: v.string(),
  conversionPotential: v.number(),
  searchIntent: v.number(),
  vendorSpecificity: v.number(),
  keywordSpecificity: v.number(),
  actionWordStrength: v.number(),
  commercialSignals: v.number(),
  negativeSignals: v.number(),
  koenigFit: v.number(),
  baseScore: v.number(),
  competitionBonus: v.number(),
  finalScore: v.number(),
  tier: v.string(),
  matchType: v.string(),
  action: v.string(),
  exclusionReason: v.optional(v.string()),
  priority: v.optional(v.string()),
});

// ============================================
// Mutations
// ============================================

/**
 * Save a new research session
 */
export const saveSession = mutation({
  args: {
    courseName: v.string(),
    courseUrl: v.optional(v.string()),
    vendor: v.optional(v.string()),
    certificationCode: v.optional(v.string()),
    seedKeywords: v.array(v.string()),
    keywordsCount: v.number(),
    analyzedCount: v.number(),
    toAddCount: v.number(),
    urgentCount: v.number(),
    highPriorityCount: v.optional(v.number()),
    geoTarget: v.string(),
    dataSource: v.string(),
    // Prompt versions used for this session
    seedPromptVersion: v.optional(v.number()),
    analysisPromptVersion: v.optional(v.number()),
    keywordIdeas: v.optional(v.array(keywordIdeaValidator)),
    analyzedKeywords: v.optional(v.array(analyzedKeywordValidator)),
    status: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sessionId = await ctx.db.insert("researchSessions", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
    return sessionId;
  },
});

/**
 * Update an existing session (e.g., after re-analysis)
 */
export const updateSession = mutation({
  args: {
    sessionId: v.id("researchSessions"),
    analyzedKeywords: v.optional(v.array(analyzedKeywordValidator)),
    analyzedCount: v.optional(v.number()),
    toAddCount: v.optional(v.number()),
    urgentCount: v.optional(v.number()),
    highPriorityCount: v.optional(v.number()),
    status: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { sessionId, ...updates } = args;
    await ctx.db.patch(sessionId, {
      ...updates,
      updatedAt: Date.now(),
    });
    return sessionId;
  },
});

/**
 * Delete a single session
 */
export const deleteSession = mutation({
  args: {
    sessionId: v.id("researchSessions"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.sessionId);
    return { success: true };
  },
});

/**
 * Bulk delete sessions
 */
export const bulkDeleteSessions = mutation({
  args: {
    sessionIds: v.array(v.id("researchSessions")),
  },
  handler: async (ctx, args) => {
    let deletedCount = 0;
    for (const sessionId of args.sessionIds) {
      await ctx.db.delete(sessionId);
      deletedCount++;
    }
    return { deletedCount };
  },
});

/**
 * Clear all sessions (with confirmation token)
 */
export const clearAllSessions = mutation({
  args: {
    confirmToken: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.confirmToken !== "CLEAR_ALL_SESSIONS") {
      throw new Error("Invalid confirmation token");
    }

    const sessions = await ctx.db.query("researchSessions").collect();
    let deletedCount = 0;
    for (const session of sessions) {
      await ctx.db.delete(session._id);
      deletedCount++;
    }
    return { deletedCount };
  },
});

// ============================================
// Queries
// ============================================

/**
 * Get paginated list of sessions (lightweight - no keyword data)
 */
export const getSessions = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    vendor: v.optional(v.string()),
    searchQuery: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    let sessionsQuery = ctx.db
      .query("researchSessions")
      .withIndex("by_created")
      .order("desc");

    // Apply vendor filter if provided
    if (args.vendor) {
      sessionsQuery = ctx.db
        .query("researchSessions")
        .withIndex("by_vendor", (q) => q.eq("vendor", args.vendor))
        .order("desc");
    }

    const allSessions = await sessionsQuery.collect();

    // Filter by search query if provided
    let filteredSessions = allSessions;
    if (args.searchQuery) {
      const query = args.searchQuery.toLowerCase();
      filteredSessions = allSessions.filter(s =>
        s.courseName.toLowerCase().includes(query) ||
        s.courseUrl?.toLowerCase().includes(query) ||
        s.vendor?.toLowerCase().includes(query)
      );
    }

    // Handle cursor-based pagination
    let startIndex = 0;
    if (args.cursor) {
      const cursorIndex = filteredSessions.findIndex(s => s._id === args.cursor);
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      }
    }

    const paginatedSessions = filteredSessions.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < filteredSessions.length;
    const nextCursor = hasMore ? paginatedSessions[paginatedSessions.length - 1]?._id : null;

    // Return lightweight session data (no keywords arrays)
    const sessions = paginatedSessions.map(s => ({
      _id: s._id,
      courseName: s.courseName,
      courseUrl: s.courseUrl,
      vendor: s.vendor,
      certificationCode: s.certificationCode,
      seedKeywords: s.seedKeywords,
      keywordsCount: s.keywordsCount,
      analyzedCount: s.analyzedCount,
      toAddCount: s.toAddCount,
      urgentCount: s.urgentCount,
      highPriorityCount: s.highPriorityCount,
      geoTarget: s.geoTarget,
      dataSource: s.dataSource,
      status: s.status,
      error: s.error,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    return {
      sessions,
      nextCursor,
      hasMore,
      totalCount: filteredSessions.length,
    };
  },
});

/**
 * Get a single session with full keyword data
 */
export const getSession = query({
  args: {
    sessionId: v.id("researchSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    return session;
  },
});

/**
 * Get session count and summary stats
 */
export const getSessionStats = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("researchSessions").collect();

    const totalSessions = sessions.length;
    const totalKeywords = sessions.reduce((sum, s) => sum + s.keywordsCount, 0);
    const totalToAdd = sessions.reduce((sum, s) => sum + s.toAddCount, 0);
    const totalUrgent = sessions.reduce((sum, s) => sum + s.urgentCount, 0);

    // Get unique vendors
    const vendors = [...new Set(sessions.map(s => s.vendor).filter(Boolean))];

    // Get sessions by vendor
    const byVendor: Record<string, number> = {};
    sessions.forEach(s => {
      const vendor = s.vendor || 'Unknown';
      byVendor[vendor] = (byVendor[vendor] || 0) + 1;
    });

    // Get recent sessions (last 7 days)
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentCount = sessions.filter(s => s.createdAt > weekAgo).length;

    return {
      totalSessions,
      totalKeywords,
      totalToAdd,
      totalUrgent,
      vendors,
      byVendor,
      recentCount,
    };
  },
});

/**
 * Search sessions by course name
 */
export const searchSessions = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const searchQuery = args.query.toLowerCase();

    const sessions = await ctx.db
      .query("researchSessions")
      .withIndex("by_created")
      .order("desc")
      .collect();

    const matches = sessions
      .filter(s =>
        s.courseName.toLowerCase().includes(searchQuery) ||
        s.courseUrl?.toLowerCase().includes(searchQuery) ||
        s.vendor?.toLowerCase().includes(searchQuery)
      )
      .slice(0, limit)
      .map(s => ({
        _id: s._id,
        courseName: s.courseName,
        courseUrl: s.courseUrl,
        vendor: s.vendor,
        keywordsCount: s.keywordsCount,
        toAddCount: s.toAddCount,
        createdAt: s.createdAt,
      }));

    return matches;
  },
});

/**
 * Get unique vendors from all sessions
 */
export const getVendors = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("researchSessions").collect();
    const vendors = [...new Set(sessions.map(s => s.vendor).filter(Boolean))] as string[];
    return vendors.sort();
  },
});

/**
 * Find a matching session for smart cache check
 *
 * Checks if the same URL + seeds + geo + prompt versions have been processed before.
 * Returns the matching session with full data if found.
 */
export const findMatchingSession = query({
  args: {
    courseUrl: v.string(),
    seedKeywords: v.array(v.string()),
    geoTarget: v.string(),
    seedPromptVersion: v.number(),
    analysisPromptVersion: v.number(),
  },
  handler: async (ctx, args) => {
    // Normalize seed keywords for comparison (sorted, lowercase)
    const normalizedSeeds = args.seedKeywords
      .map(s => s.toLowerCase().trim())
      .sort()
      .join(",");

    // Query sessions by URL and geoTarget first (using index)
    const sessions = await ctx.db
      .query("researchSessions")
      .withIndex("by_url_geo", (q) =>
        q.eq("courseUrl", args.courseUrl).eq("geoTarget", args.geoTarget)
      )
      .collect();

    // Filter for matching prompt versions and seed keywords
    for (const session of sessions) {
      // Skip incomplete sessions
      if (session.status !== "completed") continue;

      // Check prompt versions match
      if (session.seedPromptVersion !== args.seedPromptVersion) continue;
      if (session.analysisPromptVersion !== args.analysisPromptVersion) continue;

      // Check seed keywords match (normalized comparison)
      const sessionSeeds = session.seedKeywords
        .map(s => s.toLowerCase().trim())
        .sort()
        .join(",");

      if (sessionSeeds === normalizedSeeds) {
        // Found a match! Return full session data
        return {
          _id: session._id,
          courseName: session.courseName,
          courseUrl: session.courseUrl,
          vendor: session.vendor,
          certificationCode: session.certificationCode,
          seedKeywords: session.seedKeywords,
          keywordsCount: session.keywordsCount,
          analyzedCount: session.analyzedCount,
          toAddCount: session.toAddCount,
          urgentCount: session.urgentCount,
          highPriorityCount: session.highPriorityCount,
          geoTarget: session.geoTarget,
          dataSource: session.dataSource,
          seedPromptVersion: session.seedPromptVersion,
          analysisPromptVersion: session.analysisPromptVersion,
          keywordIdeas: session.keywordIdeas,
          analyzedKeywords: session.analyzedKeywords,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        };
      }
    }

    // No match found
    return null;
  },
});
