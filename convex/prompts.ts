/**
 * Convex Prompts Functions
 *
 * CRUD operations for AI prompts with version tracking.
 * Supports rollback to previous versions.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// Types
// ============================================

const promptTypeValidator = v.union(v.literal("seed"), v.literal("analysis"));

// ============================================
// Queries
// ============================================

/**
 * Get the currently active prompt for a given type
 */
export const getActivePrompt = query({
  args: {
    type: promptTypeValidator,
  },
  handler: async (ctx, args) => {
    // Find the active prompt for this type
    const prompts = await ctx.db
      .query("prompts")
      .withIndex("by_type_active", (q) =>
        q.eq("type", args.type).eq("isActive", true)
      )
      .collect();

    // Return the first active prompt (should only be one)
    return prompts[0] || null;
  },
});

/**
 * Get all active prompts (both seed and analysis)
 */
export const getAllActivePrompts = query({
  args: {},
  handler: async (ctx) => {
    const seedPrompt = await ctx.db
      .query("prompts")
      .withIndex("by_type_active", (q) =>
        q.eq("type", "seed").eq("isActive", true)
      )
      .first();

    const analysisPrompt = await ctx.db
      .query("prompts")
      .withIndex("by_type_active", (q) =>
        q.eq("type", "analysis").eq("isActive", true)
      )
      .first();

    return {
      seed: seedPrompt,
      analysis: analysisPrompt,
    };
  },
});

/**
 * Get version history for a prompt type
 */
export const getPromptVersions = query({
  args: {
    type: promptTypeValidator,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    const versions = await ctx.db
      .query("prompts")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .order("desc")
      .take(limit);

    // Sort by version descending
    return versions.sort((a, b) => b.version - a.version);
  },
});

/**
 * Get a specific version of a prompt
 */
export const getPromptByVersion = query({
  args: {
    type: promptTypeValidator,
    version: v.number(),
  },
  handler: async (ctx, args) => {
    const prompts = await ctx.db
      .query("prompts")
      .withIndex("by_type_version", (q) =>
        q.eq("type", args.type).eq("version", args.version)
      )
      .collect();

    return prompts[0] || null;
  },
});

/**
 * Get prompt statistics
 */
export const getPromptStats = query({
  args: {},
  handler: async (ctx) => {
    const allPrompts = await ctx.db.query("prompts").collect();

    const seedPrompts = allPrompts.filter((p) => p.type === "seed");
    const analysisPrompts = allPrompts.filter((p) => p.type === "analysis");

    const activeSeed = seedPrompts.find((p) => p.isActive);
    const activeAnalysis = analysisPrompts.find((p) => p.isActive);

    return {
      seed: {
        totalVersions: seedPrompts.length,
        activeVersion: activeSeed?.version || null,
        lastUpdated: activeSeed?.createdAt || null,
      },
      analysis: {
        totalVersions: analysisPrompts.length,
        activeVersion: activeAnalysis?.version || null,
        lastUpdated: activeAnalysis?.createdAt || null,
      },
    };
  },
});

// ============================================
// Mutations
// ============================================

/**
 * Save a new prompt version (auto-increments version, sets as active)
 */
export const savePrompt = mutation({
  args: {
    type: promptTypeValidator,
    name: v.string(),
    description: v.string(),
    prompt: v.string(),
    variables: v.array(v.string()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get current highest version for this type
    const existingPrompts = await ctx.db
      .query("prompts")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .collect();

    const maxVersion = existingPrompts.reduce(
      (max, p) => Math.max(max, p.version),
      0
    );
    const newVersion = maxVersion + 1;

    // Deactivate all existing prompts of this type
    for (const prompt of existingPrompts) {
      if (prompt.isActive) {
        await ctx.db.patch(prompt._id, { isActive: false });
      }
    }

    // Create new version as active
    const promptId = await ctx.db.insert("prompts", {
      type: args.type,
      name: args.name,
      description: args.description,
      prompt: args.prompt,
      variables: args.variables,
      version: newVersion,
      isActive: true,
      createdAt: Date.now(),
      createdBy: args.createdBy,
    });

    return {
      promptId,
      version: newVersion,
    };
  },
});

/**
 * Activate a specific version (rollback)
 */
export const activateVersion = mutation({
  args: {
    type: promptTypeValidator,
    version: v.number(),
  },
  handler: async (ctx, args) => {
    // Find the version to activate
    const prompts = await ctx.db
      .query("prompts")
      .withIndex("by_type_version", (q) =>
        q.eq("type", args.type).eq("version", args.version)
      )
      .collect();

    const targetPrompt = prompts[0];
    if (!targetPrompt) {
      throw new Error(`Version ${args.version} not found for type ${args.type}`);
    }

    // Deactivate all prompts of this type
    const allPrompts = await ctx.db
      .query("prompts")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .collect();

    for (const prompt of allPrompts) {
      if (prompt.isActive) {
        await ctx.db.patch(prompt._id, { isActive: false });
      }
    }

    // Activate the target version
    await ctx.db.patch(targetPrompt._id, { isActive: true });

    return {
      success: true,
      activatedVersion: args.version,
    };
  },
});

/**
 * Seed default prompts (call once on first setup)
 */
export const seedDefaultPrompts = mutation({
  args: {
    seedPrompt: v.object({
      name: v.string(),
      description: v.string(),
      prompt: v.string(),
      variables: v.array(v.string()),
    }),
    analysisPrompt: v.object({
      name: v.string(),
      description: v.string(),
      prompt: v.string(),
      variables: v.array(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    // Check if prompts already exist
    const existingSeed = await ctx.db
      .query("prompts")
      .withIndex("by_type", (q) => q.eq("type", "seed"))
      .first();

    const existingAnalysis = await ctx.db
      .query("prompts")
      .withIndex("by_type", (q) => q.eq("type", "analysis"))
      .first();

    const results = {
      seedSeeded: false,
      analysisSeeded: false,
    };

    // Seed seed prompt if not exists
    if (!existingSeed) {
      await ctx.db.insert("prompts", {
        type: "seed",
        name: args.seedPrompt.name,
        description: args.seedPrompt.description,
        prompt: args.seedPrompt.prompt,
        variables: args.seedPrompt.variables,
        version: 1,
        isActive: true,
        createdAt: Date.now(),
        createdBy: "system",
      });
      results.seedSeeded = true;
    }

    // Seed analysis prompt if not exists
    if (!existingAnalysis) {
      await ctx.db.insert("prompts", {
        type: "analysis",
        name: args.analysisPrompt.name,
        description: args.analysisPrompt.description,
        prompt: args.analysisPrompt.prompt,
        variables: args.analysisPrompt.variables,
        version: 1,
        isActive: true,
        createdAt: Date.now(),
        createdBy: "system",
      });
      results.analysisSeeded = true;
    }

    return results;
  },
});

/**
 * Delete a specific version (cannot delete active version)
 */
export const deleteVersion = mutation({
  args: {
    type: promptTypeValidator,
    version: v.number(),
  },
  handler: async (ctx, args) => {
    const prompts = await ctx.db
      .query("prompts")
      .withIndex("by_type_version", (q) =>
        q.eq("type", args.type).eq("version", args.version)
      )
      .collect();

    const targetPrompt = prompts[0];
    if (!targetPrompt) {
      throw new Error(`Version ${args.version} not found`);
    }

    if (targetPrompt.isActive) {
      throw new Error("Cannot delete the active version. Activate another version first.");
    }

    await ctx.db.delete(targetPrompt._id);

    return { success: true, deletedVersion: args.version };
  },
});
