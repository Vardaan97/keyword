/**
 * Google Ads OAuth refresh-token storage (typed replacement for the
 * keyword_cache+magic-key hack in the old Supabase implementation).
 *
 * Read priority order in src/lib/token-storage.ts is:
 *   memory → Convex (this file) → Supabase fallback → file → env var
 *
 * Convex is the source of truth for cross-Vercel-instance persistence.
 * Single shared admin token — tokenId is always 'shared-admin'.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const SHARED_ADMIN_TOKEN_ID = "shared-admin";

export const setSharedToken = mutation({
  args: {
    refreshToken: v.string(),
    userEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("googleAdsOAuthToken")
      .withIndex("by_tokenId", (q) => q.eq("tokenId", SHARED_ADMIN_TOKEN_ID))
      .first();

    const oldRefreshToken = existing?.refreshToken;

    if (existing) {
      await ctx.db.patch(existing._id, {
        refreshToken: args.refreshToken,
        userEmail: args.userEmail,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("googleAdsOAuthToken", {
        tokenId: SHARED_ADMIN_TOKEN_ID,
        refreshToken: args.refreshToken,
        userEmail: args.userEmail,
        updatedAt: Date.now(),
      });
    }

    // Log rotation if the token actually changed (audit trail for Track 2 verification).
    if (oldRefreshToken && oldRefreshToken !== args.refreshToken) {
      const tail = (s: string) => s.slice(-8);
      await ctx.db.insert("googleAdsOAuthRotations", {
        tokenId: SHARED_ADMIN_TOKEN_ID,
        oldRefreshTokenSuffix: tail(oldRefreshToken),
        newRefreshTokenSuffix: tail(args.refreshToken),
        rotatedAt: Date.now(),
      });
    }

    return { ok: true, rotated: !!oldRefreshToken && oldRefreshToken !== args.refreshToken };
  },
});

export const getSharedToken = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("googleAdsOAuthToken")
      .withIndex("by_tokenId", (q) => q.eq("tokenId", SHARED_ADMIN_TOKEN_ID))
      .first();

    if (!row) return null;
    return {
      refreshToken: row.refreshToken,
      userEmail: row.userEmail,
      updatedAt: row.updatedAt,
    };
  },
});

export const clearSharedToken = mutation({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("googleAdsOAuthToken")
      .withIndex("by_tokenId", (q) => q.eq("tokenId", SHARED_ADMIN_TOKEN_ID))
      .first();
    if (row) {
      await ctx.db.delete(row._id);
    }
    return { ok: true };
  },
});

export const getRotationLog = query({
  args: {
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.days ?? 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const rows = await ctx.db
      .query("googleAdsOAuthRotations")
      .withIndex("by_rotatedAt", (q) => q.gte("rotatedAt", cutoff))
      .collect();

    return {
      days,
      totalRotations: rows.length,
      rotations: rows
        .map((r) => ({
          rotatedAt: r.rotatedAt,
          oldSuffix: r.oldRefreshTokenSuffix,
          newSuffix: r.newRefreshTokenSuffix,
        }))
        .sort((a, b) => b.rotatedAt - a.rotatedAt),
    };
  },
});
