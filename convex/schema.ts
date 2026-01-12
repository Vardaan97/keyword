import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Keyword cache with TTL
  keywordCache: defineTable({
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
    expiresAt: v.number(),
    createdAt: v.number(),
  }).index("by_cache_key", ["cacheKey"])
    .index("by_expires", ["expiresAt"]),

  // Research sessions for history
  researchSessions: defineTable({
    courseName: v.string(),
    courseUrl: v.optional(v.string()),
    vendor: v.optional(v.string()),
    seedKeywords: v.array(v.string()),
    keywordsCount: v.number(),
    analyzedCount: v.number(),
    toAddCount: v.number(),
    urgentCount: v.number(),
    geoTarget: v.string(),
    dataSource: v.string(),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  // API request queue for retry mechanism
  requestQueue: defineTable({
    type: v.string(),  // 'keyword_fetch' | 'account_keywords'
    payload: v.any(),
    status: v.string(),  // 'pending' | 'processing' | 'completed' | 'failed'
    retryCount: v.number(),
    maxRetries: v.number(),
    nextRetryAt: v.optional(v.number()),
    error: v.optional(v.string()),
    result: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"])
    .index("by_next_retry", ["status", "nextRetryAt"]),

  // Rate limit tracking per account
  rateLimits: defineTable({
    accountId: v.string(),
    requestCount: v.number(),
    windowStart: v.number(),  // Start of current rate limit window
    quotaExhausted: v.boolean(),
    quotaResetAt: v.optional(v.number()),
  }).index("by_account", ["accountId"]),

  // Account keywords cache (for "in account" checking)
  accountKeywords: defineTable({
    accountId: v.string(),
    accountName: v.string(),
    keywords: v.array(v.string()),  // Stored normalized/lowercase
    keywordCount: v.number(),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_account", ["accountId"]),
});
