import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get all algorithms
export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("autoPpcRules")
      .withIndex("by_algorithmId")
      .collect();
  },
});

// Get algorithms by category
export const listByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("autoPpcRules")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .collect();
  },
});

// Get a single algorithm by ID
export const get = query({
  args: { algorithmId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("autoPpcRules")
      .withIndex("by_algorithmId", (q) => q.eq("algorithmId", args.algorithmId))
      .first();
  },
});

// Get only enabled algorithms
export const listEnabled = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("autoPpcRules")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
  },
});

// Create or update an algorithm
export const upsert = mutation({
  args: {
    algorithmId: v.string(),
    name: v.string(),
    description: v.string(),
    category: v.string(),
    rules: v.array(v.object({
      id: v.string(),
      condition: v.string(),
      action: v.string(),
      impact: v.string(),
      potentialIssues: v.array(v.string()),
      affectedEntities: v.string(),
    })),
    dataSource: v.string(),
    executionFrequency: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Check if algorithm already exists
    const existing = await ctx.db
      .query("autoPpcRules")
      .withIndex("by_algorithmId", (q) => q.eq("algorithmId", args.algorithmId))
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        ...args,
        lastUpdated: Date.now(),
      });
      return existing._id;
    } else {
      // Create new
      return ctx.db.insert("autoPpcRules", {
        ...args,
        lastUpdated: Date.now(),
      });
    }
  },
});

// Toggle algorithm enabled status
export const toggleEnabled = mutation({
  args: { algorithmId: v.string() },
  handler: async (ctx, args) => {
    const algorithm = await ctx.db
      .query("autoPpcRules")
      .withIndex("by_algorithmId", (q) => q.eq("algorithmId", args.algorithmId))
      .first();

    if (!algorithm) {
      throw new Error(`Algorithm ${args.algorithmId} not found`);
    }

    await ctx.db.patch(algorithm._id, {
      enabled: !algorithm.enabled,
      lastUpdated: Date.now(),
    });

    return { enabled: !algorithm.enabled };
  },
});

// Delete an algorithm
export const remove = mutation({
  args: { algorithmId: v.string() },
  handler: async (ctx, args) => {
    const algorithm = await ctx.db
      .query("autoPpcRules")
      .withIndex("by_algorithmId", (q) => q.eq("algorithmId", args.algorithmId))
      .first();

    if (algorithm) {
      await ctx.db.delete(algorithm._id);
    }
  },
});

// Seed all 5 algorithms with full data
export const seedAlgorithms = mutation({
  args: {},
  handler: async (ctx) => {
    const algorithms = [
      // Algorithm 1: tCPA Bidding Rules
      {
        algorithmId: "tcpa_bidding",
        name: "tCPA Bidding Rules",
        description: "Dynamically adjust Target CPA based on course performance metrics from RMS. High-performing courses get full visibility, while underperformers are scaled back to reduce waste.",
        category: "bidding",
        rules: [
          {
            id: "1.1",
            condition: "≥5 assignments in 6 months",
            action: "100% tCPA (full bid)",
            impact: "High-performing courses get maximum visibility and conversion opportunity",
            potentialIssues: [
              "May overspend on already-converting courses",
              "Could crowd out testing budget for new courses",
            ],
            affectedEntities: "All tCPA campaigns (Bouquet INR account)",
          },
          {
            id: "1.2",
            condition: "Zero SC, spend < ₹20K",
            action: "40% tCPA",
            impact: "Testing phase - new courses get limited exposure to prove viability",
            potentialIssues: [
              "Low visibility may never gather enough data to assess potential",
              "May take too long to reach statistical significance",
            ],
            affectedEntities: "New course ad groups with limited history",
          },
          {
            id: "1.3",
            condition: "Zero assignments, course > 3 months old",
            action: "25% tCPA",
            impact: "Reduces waste on courses that haven't converted despite having time",
            potentialIssues: [
              "May kill courses that need seasonal boost",
              "Doesn't account for market timing or competitive pressure",
            ],
            affectedEntities: "Mature non-converting course ad groups",
          },
          {
            id: "1.4",
            condition: "Page conversion rate > 10%",
            action: "+10% tCPA boost",
            impact: "Rewards landing pages that convert well with more budget",
            potentialIssues: [
              "Landing page issues may artificially inflate conversion rates",
              "May not account for lead quality differences",
            ],
            affectedEntities: "High-converting landing pages",
          },
          {
            id: "1.5",
            condition: "OEM conversion rate > 10%",
            action: "+10% tCPA boost",
            impact: "Prioritizes OEM partnership courses with proven conversion",
            potentialIssues: [
              "Competitor bidding on OEM terms may inflate costs",
              "OEM partnerships may change, making historical data irrelevant",
            ],
            affectedEntities: "OEM-partnered course campaigns",
          },
        ],
        dataSource: "RMS System → SC count, assignments count, conversion rates",
        executionFrequency: "Daily recalculation",
        enabled: true,
      },
      // Algorithm 2: Auto Pause/Resume Rules
      {
        algorithmId: "pause_resume",
        name: "Auto Pause/Resume Rules",
        description: "Prevents wasteful spending by automatically pausing underperforming courses and resurrecting those that show recovery. Uses ROI and SC thresholds.",
        category: "status",
        rules: [
          {
            id: "2.1",
            condition: "ROI < -₹40K (3 or 6 months)",
            action: "PAUSE campaign/ad group",
            impact: "Stops bleeding money on courses with negative ROI",
            potentialIssues: [
              "May miss seasonal recovery windows",
              "Doesn't consider pipeline value (leads in progress)",
            ],
            affectedEntities: "Campaigns with severe negative ROI",
          },
          {
            id: "2.2",
            condition: "Spend > ₹20K + 0 SC in 6 months",
            action: "PAUSE (resume after 1 SC)",
            impact: "Prevents endless testing spend on non-converting courses",
            potentialIssues: [
              "New courses need time to mature",
              "May not account for long sales cycles",
            ],
            affectedEntities: "Ad groups with high spend but no conversions",
          },
          {
            id: "2.3",
            condition: "Spend > ₹40K + only 1 SC in 6 months",
            action: "PAUSE (resume after 2 SC)",
            impact: "Stricter threshold for high-spend low-conversion courses",
            potentialIssues: [
              "Could kill courses near break-even",
              "May not consider lifetime customer value",
            ],
            affectedEntities: "High-spend low-conversion ad groups",
          },
          {
            id: "2.4",
            condition: "Country ROI Ratio < 0",
            action: "PAUSE for that geo",
            impact: "Geo-specific control prevents bleeding in unprofitable regions",
            potentialIssues: [
              "Some countries have longer sales cycles",
              "Currency fluctuations may temporarily impact ROI",
            ],
            affectedEntities: "Country-level campaign segments",
          },
        ],
        dataSource: "RMS System → ROI data, SC releases, spend data",
        executionFrequency: "Weekly evaluation",
        enabled: true,
      },
      // Algorithm 3: Signal/ECL Rules
      {
        algorithmId: "ecl_signals",
        name: "Signal/ECL (Enhanced Conversions for Leads)",
        description: "Sends lead quality signals back to Google Ads for smart bidding optimization. Filters out spam, free, and duplicate leads to improve algorithm learning.",
        category: "signals",
        rules: [
          {
            id: "3.1",
            condition: "HPL/MPL signals for Africa (except Rwanda)",
            action: "Send signals every 30 minutes",
            impact: "Faster optimization cycle for African markets",
            potentialIssues: [
              "High API costs with frequent updates",
              "Latency issues may cause signal delays",
            ],
            affectedEntities: "African market campaigns (excluding Rwanda)",
          },
          {
            id: "3.2",
            condition: "All Signals for Tanzania, Nigeria, Mozambique, Ghana, Uganda",
            action: "Send signals 24h weekdays, 76h weekends",
            impact: "Balanced load with comprehensive signal coverage",
            potentialIssues: [
              "Weekend lag may miss optimization opportunities",
              "Different time zones may affect signal relevance",
            ],
            affectedEntities: "Specific African country campaigns",
          },
          {
            id: "3.3",
            condition: "ECL Level 2 events (SC, positive response, tech call)",
            action: "Upload conversion on event trigger",
            impact: "Premium signal quality for smart bidding",
            potentialIssues: [
              "Requires CRM integration maintenance",
              "API errors could cause signal gaps",
            ],
            affectedEntities: "All campaigns with ECL enabled",
          },
        ],
        dataSource: "Lead qualification system, CRM data, call tracking",
        executionFrequency: "Real-time (varies by region)",
        enabled: true,
      },
      // Algorithm 4: OEM/Tech Page Rules
      {
        algorithmId: "oem_tech",
        name: "OEM/Tech Page Rules",
        description: "Different ROI thresholds for OEM partnerships vs general technology pages. OEM pages get higher tolerance due to partnership value.",
        category: "targeting",
        rules: [
          {
            id: "4.1",
            condition: "OEM Pages with ROI > -₹50K OR ROI Ratio > 5",
            action: "Keep Active",
            impact: "Higher tolerance for OEM partnerships due to strategic value",
            potentialIssues: [
              "OEM deals may have hidden costs not reflected in ROI",
              "Partnership terms may change without notice",
            ],
            affectedEntities: "OEM partnership landing pages",
          },
          {
            id: "4.2",
            condition: "Tech Pages with ROI > -₹30K AND 2+ SC in 6 months",
            action: "Keep Active",
            impact: "Stricter control on general tech pages",
            potentialIssues: [
              "Tech trends change rapidly, historical data may mislead",
              "Competitive landscape shifts may not be captured",
            ],
            affectedEntities: "Technology-focused landing pages",
          },
        ],
        dataSource: "Page classification, ROI per landing page, SC attribution",
        executionFrequency: "Monthly review",
        enabled: true,
      },
      // Algorithm 5: Other Automations
      {
        algorithmId: "other_automations",
        name: "Other Automations",
        description: "Miscellaneous automation rules including auto keywords, DSA, DKI, geo authorization, and Performance Max regional campaigns.",
        category: "other",
        rules: [
          {
            id: "5.1",
            condition: "Course topics updated in RMS",
            action: "Auto-extract keywords from topics",
            impact: "Better keyword coverage aligned with course content",
            potentialIssues: [
              "May add irrelevant terms from poorly written topics",
              "No quality check on extracted keywords",
            ],
            affectedEntities: "Keyword lists for course campaigns",
          },
          {
            id: "5.2",
            condition: "Course paused due to performance",
            action: "Create DSA with negative keywords",
            impact: "Catch-all traffic for paused courses via DSA",
            potentialIssues: [
              "DSA quality varies significantly",
              "May cannibalize other campaigns",
            ],
            affectedEntities: "DSA campaigns for paused courses",
          },
          {
            id: "5.3",
            condition: "Ad serves for keyword match",
            action: "Dynamic Keyword Insertion (DKI)",
            impact: "Improved ad relevance and CTR",
            potentialIssues: [
              "May create awkward or grammatically incorrect copy",
              "Limited control over final ad appearance",
            ],
            affectedEntities: "All search ads with DKI enabled",
          },
          {
            id: "5.4",
            condition: "Campaign created for specific geo",
            action: "Geo Authorization check",
            impact: "Clean geo-targeting prevents budget waste",
            potentialIssues: [
              "Complex to maintain across 10+ countries",
              "May miss emerging markets",
            ],
            affectedEntities: "Country-specific campaign targeting",
          },
          {
            id: "5.5",
            condition: "Regional Performance Max campaign",
            action: "AI-driven optimization",
            impact: "Leverages Google's AI for regional targeting",
            potentialIssues: [
              "Less control than manual campaigns",
              "Black box nature makes debugging difficult",
            ],
            affectedEntities: "Performance Max campaigns by region",
          },
        ],
        dataSource: "RMS, Google Ads API, Campaign settings",
        executionFrequency: "Various (daily to real-time)",
        enabled: true,
      },
    ];

    // Insert all algorithms
    const results = [];
    for (const algo of algorithms) {
      const existing = await ctx.db
        .query("autoPpcRules")
        .withIndex("by_algorithmId", (q) => q.eq("algorithmId", algo.algorithmId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...algo,
          lastUpdated: Date.now(),
        });
        results.push({ algorithmId: algo.algorithmId, action: "updated" });
      } else {
        await ctx.db.insert("autoPpcRules", {
          ...algo,
          lastUpdated: Date.now(),
        });
        results.push({ algorithmId: algo.algorithmId, action: "created" });
      }
    }

    return { success: true, results };
  },
});
