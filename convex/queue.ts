import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * Add a request to the queue
 * Used when Google Ads API quota is exhausted to retry later
 */
export const enqueue = mutation({
  args: {
    type: v.string(),
    payload: v.any(),
    maxRetries: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("requestQueue", {
      type: args.type,
      payload: args.payload,
      status: "pending",
      retryCount: 0,
      maxRetries: args.maxRetries ?? 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Schedule immediate processing
    await ctx.scheduler.runAfter(0, internal.queue.processNext, {});

    return id;
  },
});

/**
 * Process the next pending item in the queue
 * Called by scheduler
 */
export const processNext = internalMutation({
  handler: async (ctx) => {
    // Find next pending item ready to process
    const now = Date.now();
    const pendingItems = await ctx.db
      .query("requestQueue")
      .withIndex("by_status", q => q.eq("status", "pending"))
      .filter(q =>
        q.or(
          q.eq(q.field("nextRetryAt"), undefined),
          q.lte(q.field("nextRetryAt"), now)
        )
      )
      .first();

    if (!pendingItems) {
      return null;
    }

    // Mark as processing
    await ctx.db.patch(pendingItems._id, {
      status: "processing",
      updatedAt: Date.now(),
    });

    return pendingItems;
  },
});

/**
 * Mark a request as completed
 */
export const complete = mutation({
  args: {
    id: v.id("requestQueue"),
    result: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "completed",
      result: args.result,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Mark a request as failed and schedule retry with exponential backoff
 */
export const fail = mutation({
  args: {
    id: v.id("requestQueue"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id);
    if (!item) return;

    const newRetryCount = item.retryCount + 1;

    if (newRetryCount >= item.maxRetries) {
      // Max retries exceeded - mark as permanently failed
      await ctx.db.patch(args.id, {
        status: "failed",
        error: args.error,
        updatedAt: Date.now(),
      });
      return;
    }

    // Exponential backoff: 2^retryCount * 2 seconds
    // Retry 1: 2s, Retry 2: 4s, Retry 3: 8s, etc.
    const delayMs = Math.pow(2, newRetryCount) * 2000;
    const nextRetryAt = Date.now() + delayMs;

    await ctx.db.patch(args.id, {
      status: "pending",
      retryCount: newRetryCount,
      nextRetryAt,
      error: args.error,
      updatedAt: Date.now(),
    });

    // Schedule retry using Convex scheduler
    await ctx.scheduler.runAt(nextRetryAt, internal.queue.processNext, {});
  },
});

/**
 * Get queue status for debugging
 */
export const getStatus = query({
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("requestQueue")
      .withIndex("by_status", q => q.eq("status", "pending"))
      .collect();

    const processing = await ctx.db
      .query("requestQueue")
      .withIndex("by_status", q => q.eq("status", "processing"))
      .collect();

    const failed = await ctx.db
      .query("requestQueue")
      .withIndex("by_status", q => q.eq("status", "failed"))
      .take(10);

    const completed = await ctx.db
      .query("requestQueue")
      .withIndex("by_status", q => q.eq("status", "completed"))
      .take(10);

    return {
      counts: {
        pending: pending.length,
        processing: processing.length,
        failed: failed.length,
        completed: completed.length,
      },
      pendingItems: pending.map(p => ({
        id: p._id,
        type: p.type,
        retryCount: p.retryCount,
        nextRetryAt: p.nextRetryAt,
        error: p.error,
      })),
      recentFailed: failed.map(f => ({
        id: f._id,
        type: f.type,
        error: f.error,
        retryCount: f.retryCount,
      })),
    };
  },
});

/**
 * Clear completed items older than specified days
 */
export const clearOld = mutation({
  args: {
    olderThanDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - (args.olderThanDays ?? 7) * 24 * 60 * 60 * 1000;

    const oldCompleted = await ctx.db
      .query("requestQueue")
      .withIndex("by_status", q => q.eq("status", "completed"))
      .filter(q => q.lt(q.field("createdAt"), cutoff))
      .collect();

    let deleted = 0;
    for (const item of oldCompleted) {
      await ctx.db.delete(item._id);
      deleted++;
    }

    return { deleted };
  },
});
