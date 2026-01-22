/**
 * Convex Sessions Functions
 *
 * CRUD operations for research session management.
 * Keywords are stored in chunks to avoid Convex's 1MB document limit.
 *
 * Storage Strategy:
 * - Session metadata stored in researchSessions table (lightweight)
 * - Keywords stored in sessionKeywords table in ~300KB chunks
 * - First chunk loads immediately, rest load in background
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

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
  bidCurrency: v.optional(v.string()),
  inAccount: v.optional(v.boolean()),
  inAccountNames: v.optional(v.array(v.string())),
});

// Use v.any() for tier to accept both string and number, then transform in handler
const analyzedKeywordValidator = v.object({
  keyword: v.string(),
  avgMonthlySearches: v.number(),
  competition: v.string(),
  competitionIndex: v.number(),
  lowTopOfPageBidMicros: v.optional(v.number()),
  highTopOfPageBidMicros: v.optional(v.number()),
  bidCurrency: v.optional(v.string()),
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
  tier: v.any(), // Accept both string and number, transform in handler
  matchType: v.string(),
  action: v.string(),
  exclusionReason: v.optional(v.string()),
  priority: v.optional(v.string()),
});

// Keyword idea type
type KeywordIdea = {
  keyword: string;
  avgMonthlySearches: number;
  competition: string;
  competitionIndex: number;
  lowTopOfPageBidMicros?: number;
  highTopOfPageBidMicros?: number;
  bidCurrency?: string;
  inAccount?: boolean;
  inAccountNames?: string[];
};

// Analyzed keyword type
type AnalyzedKeywordInput = {
  keyword: string;
  avgMonthlySearches: number;
  competition: string;
  competitionIndex: number;
  lowTopOfPageBidMicros?: number;
  highTopOfPageBidMicros?: number;
  bidCurrency?: string;
  inAccount?: boolean;
  inAccountNames?: string[];
  courseRelevance: number;
  relevanceStatus: string;
  conversionPotential: number;
  searchIntent: number;
  vendorSpecificity: number;
  keywordSpecificity: number;
  actionWordStrength: number;
  commercialSignals: number;
  negativeSignals: number;
  koenigFit: number;
  baseScore: number;
  competitionBonus: number;
  finalScore: number;
  tier: string | number;
  matchType: string;
  action: string;
  exclusionReason?: string;
  priority?: string;
};

// ============================================
// Constants
// ============================================

// Chunk size limits - aim for ~300KB per chunk (well under 1MB limit)
const KEYWORDS_PER_CHUNK_IDEAS = 400;     // ~200 bytes per keyword idea
const KEYWORDS_PER_CHUNK_ANALYZED = 200;  // ~600 bytes per analyzed keyword

// For backwards compatibility - small sessions still fit in main document
const MAX_INLINE_KEYWORDS_IDEAS = 100;
const MAX_INLINE_KEYWORDS_ANALYZED = 50;

// ============================================
// Helper Functions
// ============================================

// Normalize tier values (number -> string)
function normalizeTier(tier: string | number | undefined): string {
  if (typeof tier === 'number') {
    return `Tier ${Math.round(tier)}`;
  }
  if (typeof tier === 'string') {
    return tier;
  }
  return 'Review';
}

// Normalize analyzed keywords (fix tier values)
function normalizeAnalyzedKeywords(keywords: AnalyzedKeywordInput[]): AnalyzedKeywordInput[] {
  return keywords.map(kw => ({
    ...kw,
    tier: normalizeTier(kw.tier),
  }));
}

// Split array into chunks of specified size
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Sort analyzed keywords by importance (for initial display)
function sortByImportance(keywords: AnalyzedKeywordInput[]): AnalyzedKeywordInput[] {
  return [...keywords].sort((a, b) => {
    // First prioritize by action (To Add > Review > Exclude)
    const actionPriority: Record<string, number> = { 'To Add': 3, 'Review': 2, 'Exclude': 1 };
    const aPriority = actionPriority[a.action] || 1;
    const bPriority = actionPriority[b.action] || 1;
    if (aPriority !== bPriority) return bPriority - aPriority;
    // Then by finalScore
    return (b.finalScore || 0) - (a.finalScore || 0);
  });
}

// Sort keyword ideas by search volume (for initial display)
function sortByVolume(keywords: KeywordIdea[]): KeywordIdea[] {
  return [...keywords].sort((a, b) =>
    (b.avgMonthlySearches || 0) - (a.avgMonthlySearches || 0)
  );
}

// ============================================
// Mutations
// ============================================

/**
 * Save a new research session with chunked keyword storage
 *
 * Keywords are stored in separate chunks to avoid 1MB limit:
 * - Small sessions (<100 ideas, <50 analyzed): stored inline for backwards compatibility
 * - Large sessions: stored in sessionKeywords table in ~300KB chunks
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
    seedPromptVersion: v.optional(v.number()),
    analysisPromptVersion: v.optional(v.number()),
    keywordIdeas: v.optional(v.array(keywordIdeaValidator)),
    analyzedKeywords: v.optional(v.array(analyzedKeywordValidator)),
    status: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const keywordIdeas = args.keywordIdeas as KeywordIdea[] | undefined;
    const analyzedKeywords = args.analyzedKeywords as AnalyzedKeywordInput[] | undefined;

    // Normalize analyzed keywords
    const normalizedAnalyzed = analyzedKeywords
      ? normalizeAnalyzedKeywords(analyzedKeywords)
      : undefined;

    // Decide storage strategy based on size
    const ideasCount = keywordIdeas?.length || 0;
    const analyzedCount = normalizedAnalyzed?.length || 0;
    const needsChunking = ideasCount > MAX_INLINE_KEYWORDS_IDEAS ||
                          analyzedCount > MAX_INLINE_KEYWORDS_ANALYZED;

    if (!needsChunking) {
      // Small session - store inline (backwards compatible)
      const sessionId = await ctx.db.insert("researchSessions", {
        courseName: args.courseName,
        courseUrl: args.courseUrl,
        vendor: args.vendor,
        certificationCode: args.certificationCode,
        seedKeywords: args.seedKeywords,
        keywordsCount: args.keywordsCount,
        analyzedCount: args.analyzedCount,
        toAddCount: args.toAddCount,
        urgentCount: args.urgentCount,
        highPriorityCount: args.highPriorityCount,
        geoTarget: args.geoTarget,
        dataSource: args.dataSource,
        seedPromptVersion: args.seedPromptVersion,
        analysisPromptVersion: args.analysisPromptVersion,
        keywordIdeas: keywordIdeas,
        analyzedKeywords: normalizedAnalyzed,
        status: args.status,
        error: args.error,
        keywordsStoredExternally: false,
        createdAt: now,
        updatedAt: now,
      });
      return sessionId;
    }

    // Large session - store keywords in chunks
    // First create session without keywords
    const sessionId = await ctx.db.insert("researchSessions", {
      courseName: args.courseName,
      courseUrl: args.courseUrl,
      vendor: args.vendor,
      certificationCode: args.certificationCode,
      seedKeywords: args.seedKeywords,
      keywordsCount: args.keywordsCount,
      analyzedCount: args.analyzedCount,
      toAddCount: args.toAddCount,
      urgentCount: args.urgentCount,
      highPriorityCount: args.highPriorityCount,
      geoTarget: args.geoTarget,
      dataSource: args.dataSource,
      seedPromptVersion: args.seedPromptVersion,
      analysisPromptVersion: args.analysisPromptVersion,
      keywordIdeas: undefined, // Stored externally
      analyzedKeywords: undefined, // Stored externally
      status: args.status,
      error: args.error,
      keywordsStoredExternally: true,
      createdAt: now,
      updatedAt: now,
    });

    let totalChunks = 0;

    // Store keyword ideas in chunks (sorted by volume for progressive loading)
    if (keywordIdeas && keywordIdeas.length > 0) {
      const sortedIdeas = sortByVolume(keywordIdeas);
      const ideaChunks = chunkArray(sortedIdeas, KEYWORDS_PER_CHUNK_IDEAS);

      for (let i = 0; i < ideaChunks.length; i++) {
        await ctx.db.insert("sessionKeywords", {
          sessionId,
          chunkIndex: i,
          chunkType: "ideas",
          totalChunks: ideaChunks.length,
          keywords: ideaChunks[i],
          createdAt: now,
        });
      }
      totalChunks += ideaChunks.length;
    }

    // Store analyzed keywords in chunks (sorted by importance for progressive loading)
    if (normalizedAnalyzed && normalizedAnalyzed.length > 0) {
      const sortedAnalyzed = sortByImportance(normalizedAnalyzed);
      const analyzedChunks = chunkArray(sortedAnalyzed, KEYWORDS_PER_CHUNK_ANALYZED);

      for (let i = 0; i < analyzedChunks.length; i++) {
        await ctx.db.insert("sessionKeywords", {
          sessionId,
          chunkIndex: i,
          chunkType: "analyzed",
          totalChunks: analyzedChunks.length,
          keywords: analyzedChunks[i],
          createdAt: now,
        });
      }
      totalChunks += analyzedChunks.length;
    }

    // Update session with chunk count
    await ctx.db.patch(sessionId, { totalKeywordChunks: totalChunks });

    console.log(`[sessions:saveSession] Saved "${args.courseName}" with ${totalChunks} chunks:`,
      `${ideasCount} ideas, ${analyzedCount} analyzed keywords`);

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
    const { sessionId, analyzedKeywords, ...updates } = args;
    const now = Date.now();

    // If updating analyzed keywords, handle chunking
    if (analyzedKeywords !== undefined) {
      const normalized = normalizeAnalyzedKeywords(analyzedKeywords as AnalyzedKeywordInput[]);

      // Delete old analyzed keyword chunks
      const oldChunks = await ctx.db
        .query("sessionKeywords")
        .withIndex("by_session_type", q => q.eq("sessionId", sessionId).eq("chunkType", "analyzed"))
        .collect();

      for (const chunk of oldChunks) {
        await ctx.db.delete(chunk._id);
      }

      // If small enough, store inline
      if (normalized.length <= MAX_INLINE_KEYWORDS_ANALYZED) {
        await ctx.db.patch(sessionId, {
          ...updates,
          analyzedKeywords: normalized,
          keywordsStoredExternally: false,
          updatedAt: now,
        });
      } else {
        // Store in chunks
        const sortedAnalyzed = sortByImportance(normalized);
        const chunks = chunkArray(sortedAnalyzed, KEYWORDS_PER_CHUNK_ANALYZED);

        for (let i = 0; i < chunks.length; i++) {
          await ctx.db.insert("sessionKeywords", {
            sessionId,
            chunkIndex: i,
            chunkType: "analyzed",
            totalChunks: chunks.length,
            keywords: chunks[i],
            createdAt: now,
          });
        }

        await ctx.db.patch(sessionId, {
          ...updates,
          analyzedKeywords: undefined,
          keywordsStoredExternally: true,
          updatedAt: now,
        });
      }
    } else {
      await ctx.db.patch(sessionId, {
        ...updates,
        updatedAt: now,
      });
    }

    return sessionId;
  },
});

/**
 * Delete a single session and its keyword chunks
 */
export const deleteSession = mutation({
  args: {
    sessionId: v.id("researchSessions"),
  },
  handler: async (ctx, args) => {
    // Delete all keyword chunks first
    const chunks = await ctx.db
      .query("sessionKeywords")
      .withIndex("by_session", q => q.eq("sessionId", args.sessionId))
      .collect();

    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }

    // Delete the session
    await ctx.db.delete(args.sessionId);
    return { success: true, chunksDeleted: chunks.length };
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
    let chunksDeleted = 0;

    for (const sessionId of args.sessionIds) {
      // Delete keyword chunks
      const chunks = await ctx.db
        .query("sessionKeywords")
        .withIndex("by_session", q => q.eq("sessionId", sessionId))
        .collect();

      for (const chunk of chunks) {
        await ctx.db.delete(chunk._id);
        chunksDeleted++;
      }

      // Delete session
      await ctx.db.delete(sessionId);
      deletedCount++;
    }

    return { deletedCount, chunksDeleted };
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

    // Delete all keyword chunks first
    const allChunks = await ctx.db.query("sessionKeywords").collect();
    for (const chunk of allChunks) {
      await ctx.db.delete(chunk._id);
    }

    // Delete all sessions
    const sessions = await ctx.db.query("researchSessions").collect();
    let deletedCount = 0;
    for (const session of sessions) {
      await ctx.db.delete(session._id);
      deletedCount++;
    }

    return { deletedCount, chunksDeleted: allChunks.length };
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

    if (args.vendor) {
      sessionsQuery = ctx.db
        .query("researchSessions")
        .withIndex("by_vendor", (q) => q.eq("vendor", args.vendor))
        .order("desc");
    }

    const allSessions = await sessionsQuery.collect();

    let filteredSessions = allSessions;
    if (args.searchQuery) {
      const query = args.searchQuery.toLowerCase();
      filteredSessions = allSessions.filter(s =>
        s.courseName.toLowerCase().includes(query) ||
        s.courseUrl?.toLowerCase().includes(query) ||
        s.vendor?.toLowerCase().includes(query)
      );
    }

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

    // Return lightweight session data (no keywords)
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
      keywordsStoredExternally: s.keywordsStoredExternally,
      totalKeywordChunks: s.totalKeywordChunks,
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
 * Get a single session metadata (without keywords)
 * Use getSessionKeywords to load keywords progressively
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
 * Get keyword chunks for a session progressively
 *
 * For chunked sessions: returns one chunk at a time
 * For inline sessions: returns all keywords in chunk 0
 */
export const getSessionKeywords = query({
  args: {
    sessionId: v.id("researchSessions"),
    chunkType: v.string(), // 'ideas' or 'analyzed'
    chunkIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      return { keywords: [], totalChunks: 0, hasMore: false };
    }

    // If keywords are stored inline (small session)
    if (!session.keywordsStoredExternally) {
      if (args.chunkIndex > 0) {
        return { keywords: [], totalChunks: 1, hasMore: false };
      }

      const keywords = args.chunkType === 'ideas'
        ? session.keywordIdeas || []
        : session.analyzedKeywords || [];

      return {
        keywords,
        totalChunks: 1,
        hasMore: false,
      };
    }

    // Keywords stored in chunks - fetch the requested chunk
    const chunk = await ctx.db
      .query("sessionKeywords")
      .withIndex("by_session_type_index", q =>
        q.eq("sessionId", args.sessionId)
         .eq("chunkType", args.chunkType)
         .eq("chunkIndex", args.chunkIndex)
      )
      .first();

    if (!chunk) {
      return { keywords: [], totalChunks: 0, hasMore: false };
    }

    return {
      keywords: chunk.keywords,
      totalChunks: chunk.totalChunks,
      hasMore: args.chunkIndex < chunk.totalChunks - 1,
    };
  },
});

/**
 * Get all keywords for a session (use carefully - can be large)
 * Combines all chunks into single arrays
 */
export const getSessionAllKeywords = query({
  args: {
    sessionId: v.id("researchSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      return { keywordIdeas: [], analyzedKeywords: [] };
    }

    // If stored inline
    if (!session.keywordsStoredExternally) {
      return {
        keywordIdeas: session.keywordIdeas || [],
        analyzedKeywords: session.analyzedKeywords || [],
      };
    }

    // Fetch all chunks
    const allChunks = await ctx.db
      .query("sessionKeywords")
      .withIndex("by_session", q => q.eq("sessionId", args.sessionId))
      .collect();

    // Separate and sort by chunk index
    const ideaChunks = allChunks
      .filter(c => c.chunkType === 'ideas')
      .sort((a, b) => a.chunkIndex - b.chunkIndex);

    const analyzedChunks = allChunks
      .filter(c => c.chunkType === 'analyzed')
      .sort((a, b) => a.chunkIndex - b.chunkIndex);

    // Combine keywords
    const keywordIdeas = ideaChunks.flatMap(c => c.keywords);
    const analyzedKeywords = analyzedChunks.flatMap(c => c.keywords);

    return { keywordIdeas, analyzedKeywords };
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

    const vendors = [...new Set(sessions.map(s => s.vendor).filter(Boolean))];

    const byVendor: Record<string, number> = {};
    sessions.forEach(s => {
      const vendor = s.vendor || 'Unknown';
      byVendor[vendor] = (byVendor[vendor] || 0) + 1;
    });

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
    const normalizedSeeds = args.seedKeywords
      .map(s => s.toLowerCase().trim())
      .sort()
      .join(",");

    const sessions = await ctx.db
      .query("researchSessions")
      .withIndex("by_url_geo", (q) =>
        q.eq("courseUrl", args.courseUrl).eq("geoTarget", args.geoTarget)
      )
      .collect();

    for (const session of sessions) {
      if (session.status !== "completed") continue;
      if (session.seedPromptVersion !== args.seedPromptVersion) continue;
      if (session.analysisPromptVersion !== args.analysisPromptVersion) continue;

      const sessionSeeds = session.seedKeywords
        .map(s => s.toLowerCase().trim())
        .sort()
        .join(",");

      if (sessionSeeds === normalizedSeeds) {
        // Return session metadata - caller should use getSessionAllKeywords for full data
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
          keywordsStoredExternally: session.keywordsStoredExternally,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        };
      }
    }

    return null;
  },
});
