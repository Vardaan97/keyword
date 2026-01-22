import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * LinkedIn Token Storage - Convex Functions
 *
 * These functions manage LinkedIn OAuth tokens in Convex,
 * allowing both localhost and Vercel deployments to share the same tokens.
 */

// Default token ID for the primary LinkedIn account
const DEFAULT_TOKEN_ID = "primary";

// Get the current LinkedIn token
export const getToken = query({
  args: {
    tokenId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokenId = args.tokenId || DEFAULT_TOKEN_ID;

    const token = await ctx.db
      .query("linkedinTokens")
      .withIndex("by_tokenId", (q) => q.eq("tokenId", tokenId))
      .first();

    return token;
  },
});

// Save or update a LinkedIn token
export const saveToken = mutation({
  args: {
    tokenId: v.optional(v.string()),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresIn: v.number(), // Seconds until expiration
    refreshTokenExpiresIn: v.optional(v.number()),
    scopes: v.optional(v.array(v.string())),
    userEmail: v.optional(v.string()),
    userName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokenId = args.tokenId || DEFAULT_TOKEN_ID;
    const now = Date.now();

    // Calculate expiration timestamps
    const expiresAt = now + args.expiresIn * 1000;
    const refreshTokenExpiresAt = args.refreshTokenExpiresIn
      ? now + args.refreshTokenExpiresIn * 1000
      : undefined;

    // Check if token already exists
    const existing = await ctx.db
      .query("linkedinTokens")
      .withIndex("by_tokenId", (q) => q.eq("tokenId", tokenId))
      .first();

    if (existing) {
      // Update existing token
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt,
        refreshTokenExpiresAt,
        scopes: args.scopes,
        userEmail: args.userEmail,
        userName: args.userName,
        updatedAt: now,
      });
      return { success: true, action: "updated", tokenId };
    } else {
      // Create new token
      await ctx.db.insert("linkedinTokens", {
        tokenId,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt,
        refreshTokenExpiresAt,
        scopes: args.scopes,
        userEmail: args.userEmail,
        userName: args.userName,
        createdAt: now,
        updatedAt: now,
      });
      return { success: true, action: "created", tokenId };
    }
  },
});

// Update token after refresh
export const updateTokenAfterRefresh = mutation({
  args: {
    tokenId: v.optional(v.string()),
    accessToken: v.string(),
    expiresIn: v.number(),
    refreshToken: v.optional(v.string()),
    refreshTokenExpiresIn: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tokenId = args.tokenId || DEFAULT_TOKEN_ID;
    const now = Date.now();

    const existing = await ctx.db
      .query("linkedinTokens")
      .withIndex("by_tokenId", (q) => q.eq("tokenId", tokenId))
      .first();

    if (!existing) {
      throw new Error(`Token not found: ${tokenId}`);
    }

    const updates: Record<string, unknown> = {
      accessToken: args.accessToken,
      expiresAt: now + args.expiresIn * 1000,
      updatedAt: now,
    };

    // Update refresh token if provided
    if (args.refreshToken) {
      updates.refreshToken = args.refreshToken;
    }
    if (args.refreshTokenExpiresIn) {
      updates.refreshTokenExpiresAt = now + args.refreshTokenExpiresIn * 1000;
    }

    await ctx.db.patch(existing._id, updates);
    return { success: true, tokenId };
  },
});

// Delete a LinkedIn token
export const deleteToken = mutation({
  args: {
    tokenId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokenId = args.tokenId || DEFAULT_TOKEN_ID;

    const existing = await ctx.db
      .query("linkedinTokens")
      .withIndex("by_tokenId", (q) => q.eq("tokenId", tokenId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { success: true, deleted: true };
    }

    return { success: true, deleted: false };
  },
});

// Check if token is valid (exists and not expired)
export const isTokenValid = query({
  args: {
    tokenId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokenId = args.tokenId || DEFAULT_TOKEN_ID;
    const now = Date.now();

    const token = await ctx.db
      .query("linkedinTokens")
      .withIndex("by_tokenId", (q) => q.eq("tokenId", tokenId))
      .first();

    if (!token) {
      return { valid: false, reason: "no_token" };
    }

    // Check if access token is expired (with 5 minute buffer)
    if (token.expiresAt < now + 5 * 60 * 1000) {
      // Check if we can refresh
      if (token.refreshToken && token.refreshTokenExpiresAt && token.refreshTokenExpiresAt > now) {
        return { valid: false, reason: "needs_refresh", canRefresh: true };
      }
      return { valid: false, reason: "expired", canRefresh: false };
    }

    return { valid: true };
  },
});
