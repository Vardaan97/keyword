import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// URL → AD GROUP MAPPINGS
// Used for generating Google Ads Editor compatible exports
// ============================================

/**
 * Bulk import URL→Ad Group mappings from parsed CSV data
 * This is called after parsing the Ad Report CSV on the client
 */
export const bulkImport = mutation({
  args: {
    accountId: v.string(),
    mappings: v.array(v.object({
      url: v.string(),
      campaignName: v.string(),
      adGroupName: v.string(),
      country: v.optional(v.string()),
      vendor: v.optional(v.string()),
    })),
    clearExisting: v.optional(v.boolean()), // If true, delete existing mappings for this account first
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Optionally clear existing mappings for this account
    if (args.clearExisting) {
      const existing = await ctx.db
        .query("urlAdGroupMappings")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
        .collect();

      for (const mapping of existing) {
        await ctx.db.delete(mapping._id);
      }
    }

    // Track unique URL+Campaign+AdGroup combinations to avoid duplicates
    const seen = new Set<string>();
    let inserted = 0;
    let skipped = 0;

    for (const mapping of args.mappings) {
      const key = `${mapping.url}|${mapping.campaignName}|${mapping.adGroupName}`;

      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);

      // Check if this exact mapping already exists
      const existing = await ctx.db
        .query("urlAdGroupMappings")
        .withIndex("by_url_account", (q) =>
          q.eq("url", mapping.url).eq("accountId", args.accountId)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("campaignName"), mapping.campaignName),
            q.eq(q.field("adGroupName"), mapping.adGroupName)
          )
        )
        .first();

      if (existing) {
        // Update timestamp
        await ctx.db.patch(existing._id, { importedAt: now });
        skipped++;
      } else {
        // Insert new mapping
        await ctx.db.insert("urlAdGroupMappings", {
          url: mapping.url,
          campaignName: mapping.campaignName,
          adGroupName: mapping.adGroupName,
          country: mapping.country,
          vendor: mapping.vendor,
          accountId: args.accountId,
          importedAt: now,
        });
        inserted++;
      }
    }

    return {
      success: true,
      inserted,
      skipped,
      total: args.mappings.length,
    };
  },
});

/**
 * Get all ad group mappings for a specific URL
 * Optionally filter by account and/or country
 */
export const getByUrl = query({
  args: {
    url: v.string(),
    accountId: v.optional(v.string()),
    country: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Normalize URL for lookup
    const normalizedUrl = args.url.toLowerCase().replace(/\/$/, "");
    const { accountId, country } = args;

    if (accountId && country) {
      // Filter by URL, account, and country
      return await ctx.db
        .query("urlAdGroupMappings")
        .withIndex("by_url_account_country", (q) =>
          q.eq("url", normalizedUrl)
            .eq("accountId", accountId)
            .eq("country", country)
        )
        .collect();
    } else if (accountId) {
      // Filter by URL and account
      return await ctx.db
        .query("urlAdGroupMappings")
        .withIndex("by_url_account", (q) =>
          q.eq("url", normalizedUrl).eq("accountId", accountId)
        )
        .collect();
    } else {
      // Filter by URL only
      return await ctx.db
        .query("urlAdGroupMappings")
        .withIndex("by_url", (q) => q.eq("url", normalizedUrl))
        .collect();
    }
  },
});

/**
 * Get all mappings for an account
 */
export const getByAccount = query({
  args: {
    accountId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("urlAdGroupMappings")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
  },
});

/**
 * Get all unique URLs for an account
 */
export const getUniqueUrls = query({
  args: {
    accountId: v.string(),
  },
  handler: async (ctx, args) => {
    const mappings = await ctx.db
      .query("urlAdGroupMappings")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    const urls = [...new Set(mappings.map(m => m.url))];
    return urls.sort();
  },
});

/**
 * Get all unique campaigns for an account
 */
export const getUniqueCampaigns = query({
  args: {
    accountId: v.string(),
  },
  handler: async (ctx, args) => {
    const mappings = await ctx.db
      .query("urlAdGroupMappings")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    const campaigns = [...new Set(mappings.map(m => m.campaignName))];
    return campaigns.sort();
  },
});

/**
 * Get all unique countries for an account
 */
export const getUniqueCountries = query({
  args: {
    accountId: v.string(),
  },
  handler: async (ctx, args) => {
    const mappings = await ctx.db
      .query("urlAdGroupMappings")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    const countries = [...new Set(mappings.map(m => m.country).filter(Boolean))] as string[];
    return countries.sort();
  },
});

/**
 * Get summary stats for imported mappings
 */
export const getSummary = query({
  args: {},
  handler: async (ctx) => {
    const allMappings = await ctx.db
      .query("urlAdGroupMappings")
      .collect();

    // Group by account
    const byAccount = new Map<string, typeof allMappings>();
    for (const mapping of allMappings) {
      const existing = byAccount.get(mapping.accountId) || [];
      existing.push(mapping);
      byAccount.set(mapping.accountId, existing);
    }

    const accounts = [];
    for (const [accountId, mappings] of byAccount.entries()) {
      const uniqueUrls = new Set(mappings.map(m => m.url));
      const uniqueCampaigns = new Set(mappings.map(m => m.campaignName));
      const uniqueAdGroups = new Set(mappings.map(m => `${m.campaignName}|${m.adGroupName}`));
      const uniqueCountries = new Set(mappings.map(m => m.country).filter(Boolean));

      // Get most recent import time
      const latestImport = Math.max(...mappings.map(m => m.importedAt));

      accounts.push({
        accountId,
        totalMappings: mappings.length,
        uniqueUrls: uniqueUrls.size,
        uniqueCampaigns: uniqueCampaigns.size,
        uniqueAdGroups: uniqueAdGroups.size,
        countries: [...uniqueCountries].sort(),
        lastImportedAt: latestImport,
      });
    }

    return {
      totalMappings: allMappings.length,
      accounts,
    };
  },
});

/**
 * Delete all mappings for an account
 */
export const clearAccount = mutation({
  args: {
    accountId: v.string(),
  },
  handler: async (ctx, args) => {
    const mappings = await ctx.db
      .query("urlAdGroupMappings")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    for (const mapping of mappings) {
      await ctx.db.delete(mapping._id);
    }

    return {
      success: true,
      deleted: mappings.length,
    };
  },
});

/**
 * Delete a specific mapping
 */
export const deleteMapping = mutation({
  args: {
    id: v.id("urlAdGroupMappings"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return { success: true };
  },
});
