import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get all active insights (not expired, not dismissed)
export const listActive = query({
  args: {
    platform: v.optional(v.string()),
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    const now = Date.now();

    let insights = await ctx.db
      .query("aiInsights")
      .withIndex("by_generatedAt")
      .order("desc")
      .collect();

    // Filter out expired and dismissed
    insights = insights.filter(i =>
      i.expiresAt > now &&
      i.status !== "dismissed"
    );

    // Apply additional filters
    if (args.platform) {
      insights = insights.filter(i => i.platform === args.platform);
    }
    if (args.type) {
      insights = insights.filter(i => i.type === args.type);
    }

    // Sort by priority (descending) then by generatedAt (descending)
    insights.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.generatedAt - a.generatedAt;
    });

    return insights.slice(0, limit);
  },
});

// Get insights by status
export const listByStatus = query({
  args: {
    status: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    return ctx.db
      .query("aiInsights")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .take(limit);
  },
});

// Get top insights for dashboard (high priority, new status)
export const getTopInsights = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 5;
    const now = Date.now();

    const insights = await ctx.db
      .query("aiInsights")
      .withIndex("by_priority")
      .order("desc")
      .collect();

    // Filter for new, not expired, high priority
    return insights
      .filter(i =>
        i.status === "new" &&
        i.expiresAt > now &&
        i.priority >= 3
      )
      .slice(0, limit);
  },
});

// Get insight counts by type (for dashboard stats)
export const countsByType = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const insights = await ctx.db
      .query("aiInsights")
      .filter((q) => q.gt(q.field("expiresAt"), now))
      .collect();

    const counts: Record<string, { total: number; new: number; actioned: number }> = {
      opportunity: { total: 0, new: 0, actioned: 0 },
      risk: { total: 0, new: 0, actioned: 0 },
      recommendation: { total: 0, new: 0, actioned: 0 },
      anomaly: { total: 0, new: 0, actioned: 0 },
    };

    for (const insight of insights) {
      if (!counts[insight.type]) {
        counts[insight.type] = { total: 0, new: 0, actioned: 0 };
      }
      counts[insight.type].total++;
      if (insight.status === "new") {
        counts[insight.type].new++;
      } else if (insight.status === "actioned") {
        counts[insight.type].actioned++;
      }
    }

    return counts;
  },
});

// Create a new insight
export const create = mutation({
  args: {
    type: v.string(),
    platform: v.string(),
    title: v.string(),
    description: v.string(),
    priority: v.number(),
    relatedEntities: v.array(v.object({
      type: v.string(),
      id: v.string(),
      name: v.string(),
    })),
    generatedBy: v.string(),
    prompt: v.optional(v.string()),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const expiresInDays = args.expiresInDays || 7;
    const now = Date.now();

    return ctx.db.insert("aiInsights", {
      type: args.type,
      platform: args.platform,
      title: args.title,
      description: args.description,
      priority: args.priority,
      relatedEntities: args.relatedEntities,
      generatedBy: args.generatedBy,
      prompt: args.prompt,
      status: "new",
      generatedAt: now,
      expiresAt: now + expiresInDays * 24 * 60 * 60 * 1000,
    });
  },
});

// Create multiple insights at once
export const createBatch = mutation({
  args: {
    insights: v.array(v.object({
      type: v.string(),
      platform: v.string(),
      title: v.string(),
      description: v.string(),
      priority: v.number(),
      relatedEntities: v.array(v.object({
        type: v.string(),
        id: v.string(),
        name: v.string(),
      })),
      generatedBy: v.string(),
    })),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const expiresInDays = args.expiresInDays || 7;
    const now = Date.now();
    const expiresAt = now + expiresInDays * 24 * 60 * 60 * 1000;

    const ids = [];
    for (const insight of args.insights) {
      const id = await ctx.db.insert("aiInsights", {
        ...insight,
        status: "new",
        generatedAt: now,
        expiresAt,
      });
      ids.push(id);
    }

    return { count: ids.length, ids };
  },
});

// Update insight status (review, action, dismiss)
export const updateStatus = mutation({
  args: {
    id: v.id("aiInsights"),
    status: v.string(),
    actionNotes: v.optional(v.string()),
    actionedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const update: any = { status: args.status };

    if (args.status === "actioned") {
      update.actionedAt = Date.now();
      if (args.actionNotes) update.actionNotes = args.actionNotes;
      if (args.actionedBy) update.actionedBy = args.actionedBy;
    }

    await ctx.db.patch(args.id, update);
    return { success: true };
  },
});

// Dismiss an insight
export const dismiss = mutation({
  args: { id: v.id("aiInsights") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "dismissed" });
    return { success: true };
  },
});

// Cleanup expired insights (can be called via cron)
export const cleanupExpired = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("aiInsights")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    let deleted = 0;
    for (const insight of expired) {
      // Keep actioned insights for historical reference
      if (insight.status !== "actioned") {
        await ctx.db.delete(insight._id);
        deleted++;
      }
    }

    return { deleted, total: expired.length };
  },
});
