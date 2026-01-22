import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get recent executions (paginated)
export const list = query({
  args: {
    limit: v.optional(v.number()),
    algorithmId: v.optional(v.string()),
    accountId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    let query = ctx.db.query("autoPpcExecutions").withIndex("by_executedAt").order("desc");

    // Apply filters manually since Convex doesn't support multiple index conditions well
    const all = await query.take(limit * 3); // Fetch more to account for filtering

    let filtered = all;
    if (args.algorithmId) {
      filtered = filtered.filter(e => e.algorithmId === args.algorithmId);
    }
    if (args.accountId) {
      filtered = filtered.filter(e => e.accountId === args.accountId);
    }

    return filtered.slice(0, limit);
  },
});

// Get executions by algorithm
export const listByAlgorithm = query({
  args: {
    algorithmId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    return ctx.db
      .query("autoPpcExecutions")
      .withIndex("by_algorithm", (q) => q.eq("algorithmId", args.algorithmId))
      .order("desc")
      .take(limit);
  },
});

// Get executions by entity
export const listByEntity = query({
  args: {
    entityId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    return ctx.db
      .query("autoPpcExecutions")
      .withIndex("by_entityId", (q) => q.eq("entityId", args.entityId))
      .order("desc")
      .take(limit);
  },
});

// Get execution counts by algorithm (for dashboard stats)
export const countsByAlgorithm = query({
  args: {
    sinceDate: v.optional(v.number()), // timestamp
  },
  handler: async (ctx, args) => {
    const since = args.sinceDate || Date.now() - 30 * 24 * 60 * 60 * 1000; // Default 30 days

    const executions = await ctx.db
      .query("autoPpcExecutions")
      .withIndex("by_executedAt")
      .filter((q) => q.gte(q.field("executedAt"), since))
      .collect();

    // Group by algorithm
    const counts: Record<string, { total: number; success: number; failed: number }> = {};

    for (const exec of executions) {
      if (!counts[exec.algorithmId]) {
        counts[exec.algorithmId] = { total: 0, success: 0, failed: 0 };
      }
      counts[exec.algorithmId].total++;
      if (exec.success) {
        counts[exec.algorithmId].success++;
      } else {
        counts[exec.algorithmId].failed++;
      }
    }

    return counts;
  },
});

// Record a new execution
export const record = mutation({
  args: {
    algorithmId: v.string(),
    ruleId: v.string(),
    accountId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    entityName: v.string(),
    triggerCondition: v.string(),
    triggerValue: v.string(),
    actionTaken: v.string(),
    oldValue: v.optional(v.string()),
    newValue: v.optional(v.string()),
    success: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("autoPpcExecutions", {
      ...args,
      executedAt: Date.now(),
    });
  },
});

// Record multiple executions at once (batch)
export const recordBatch = mutation({
  args: {
    executions: v.array(v.object({
      algorithmId: v.string(),
      ruleId: v.string(),
      accountId: v.string(),
      entityType: v.string(),
      entityId: v.string(),
      entityName: v.string(),
      triggerCondition: v.string(),
      triggerValue: v.string(),
      actionTaken: v.string(),
      oldValue: v.optional(v.string()),
      newValue: v.optional(v.string()),
      success: v.boolean(),
      notes: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids = [];

    for (const exec of args.executions) {
      const id = await ctx.db.insert("autoPpcExecutions", {
        ...exec,
        executedAt: now,
      });
      ids.push(id);
    }

    return { count: ids.length, ids };
  },
});

// Get timeline data (grouped by date for charts)
export const getTimeline = query({
  args: {
    days: v.optional(v.number()),
    algorithmId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const days = args.days || 30;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    let query = ctx.db
      .query("autoPpcExecutions")
      .withIndex("by_executedAt")
      .filter((q) => q.gte(q.field("executedAt"), since));

    const executions = await query.collect();

    // Filter by algorithm if specified
    let filtered = executions;
    if (args.algorithmId) {
      filtered = filtered.filter(e => e.algorithmId === args.algorithmId);
    }

    // Group by date (YYYY-MM-DD)
    const byDate: Record<string, { date: string; total: number; success: number; failed: number }> = {};

    for (const exec of filtered) {
      const date = new Date(exec.executedAt).toISOString().split('T')[0];
      if (!byDate[date]) {
        byDate[date] = { date, total: 0, success: 0, failed: 0 };
      }
      byDate[date].total++;
      if (exec.success) {
        byDate[date].success++;
      } else {
        byDate[date].failed++;
      }
    }

    // Sort by date and return as array
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  },
});
