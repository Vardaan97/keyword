import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Rate limit window: 1 minute
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
// Max requests per window per account
const MAX_REQUESTS_PER_WINDOW = 60;

/**
 * Track an API request for rate limiting
 * Returns whether the request is allowed or should be rate limited
 */
export const trackRequest = mutation({
  args: {
    accountId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get existing rate limit record
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_account", q => q.eq("accountId", args.accountId))
      .first();

    if (!existing) {
      // First request for this account
      await ctx.db.insert("rateLimits", {
        accountId: args.accountId,
        requestCount: 1,
        windowStart: now,
        quotaExhausted: false,
      });
      return { allowed: true, requestCount: 1 };
    }

    // Check if quota is exhausted
    if (existing.quotaExhausted) {
      if (existing.quotaResetAt && existing.quotaResetAt <= now) {
        // Reset quota
        await ctx.db.patch(existing._id, {
          quotaExhausted: false,
          quotaResetAt: undefined,
          requestCount: 1,
          windowStart: now,
        });
        return { allowed: true, requestCount: 1 };
      }
      return {
        allowed: false,
        reason: "quota_exhausted",
        resetAt: existing.quotaResetAt,
      };
    }

    // Check if we're in a new window
    if (now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
      // New window - reset count
      await ctx.db.patch(existing._id, {
        requestCount: 1,
        windowStart: now,
      });
      return { allowed: true, requestCount: 1 };
    }

    // Same window - check if under limit
    const newCount = existing.requestCount + 1;
    if (newCount > MAX_REQUESTS_PER_WINDOW) {
      return {
        allowed: false,
        reason: "rate_limited",
        requestCount: existing.requestCount,
        windowRemainingMs: RATE_LIMIT_WINDOW_MS - (now - existing.windowStart),
      };
    }

    // Under limit - increment
    await ctx.db.patch(existing._id, {
      requestCount: newCount,
    });
    return { allowed: true, requestCount: newCount };
  },
});

/**
 * Mark quota as exhausted for an account
 * This is called when Google Ads API returns RESOURCE_EXHAUSTED
 */
export const markQuotaExhausted = mutation({
  args: {
    accountId: v.string(),
    resetInMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_account", q => q.eq("accountId", args.accountId))
      .first();

    const resetInMs = (args.resetInMinutes ?? 5) * 60 * 1000;
    const resetAt = Date.now() + resetInMs;

    if (existing) {
      await ctx.db.patch(existing._id, {
        quotaExhausted: true,
        quotaResetAt: resetAt,
      });
    } else {
      await ctx.db.insert("rateLimits", {
        accountId: args.accountId,
        requestCount: 0,
        windowStart: Date.now(),
        quotaExhausted: true,
        quotaResetAt: resetAt,
      });
    }

    return { resetAt };
  },
});

/**
 * Get rate limit status for an account
 */
export const getStatus = query({
  args: {
    accountId: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("rateLimits")
      .withIndex("by_account", q => q.eq("accountId", args.accountId))
      .first();

    if (!record) {
      return {
        accountId: args.accountId,
        requestCount: 0,
        quotaExhausted: false,
        windowRemainingMs: RATE_LIMIT_WINDOW_MS,
      };
    }

    const now = Date.now();
    const windowAge = now - record.windowStart;
    const windowRemainingMs = Math.max(0, RATE_LIMIT_WINDOW_MS - windowAge);

    return {
      accountId: args.accountId,
      requestCount: record.requestCount,
      quotaExhausted: record.quotaExhausted,
      quotaResetAt: record.quotaResetAt,
      windowRemainingMs,
    };
  },
});

/**
 * Get all rate limit statuses
 */
export const getAllStatuses = query({
  handler: async (ctx) => {
    const all = await ctx.db.query("rateLimits").collect();
    const now = Date.now();

    return all.map(record => ({
      accountId: record.accountId,
      requestCount: record.requestCount,
      quotaExhausted: record.quotaExhausted,
      quotaResetAt: record.quotaResetAt,
      windowRemainingMs: Math.max(0, RATE_LIMIT_WINDOW_MS - (now - record.windowStart)),
    }));
  },
});

/**
 * Reset rate limits for all accounts
 */
export const resetAll = mutation({
  handler: async (ctx) => {
    const all = await ctx.db.query("rateLimits").collect();

    for (const record of all) {
      await ctx.db.delete(record._id);
    }

    return { deleted: all.length };
  },
});
