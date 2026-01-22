import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================
  // PROMPTS WITH VERSION TRACKING
  // ============================================

  // Prompts table - stores all versions of prompts
  prompts: defineTable({
    type: v.union(v.literal("seed"), v.literal("analysis")),
    name: v.string(),
    description: v.string(),
    prompt: v.string(),
    variables: v.array(v.string()),
    version: v.number(),           // Auto-incremented per type
    isActive: v.boolean(),         // Only one active per type
    createdAt: v.number(),
    createdBy: v.optional(v.string()),
  })
    .index("by_type", ["type"])
    .index("by_type_active", ["type", "isActive"])
    .index("by_type_version", ["type", "version"]),

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

  // Research sessions for history (with full keyword data)
  researchSessions: defineTable({
    courseName: v.string(),
    courseUrl: v.optional(v.string()),
    vendor: v.optional(v.string()),
    certificationCode: v.optional(v.string()),
    seedKeywords: v.array(v.string()),
    // Summary counts
    keywordsCount: v.number(),
    analyzedCount: v.number(),
    toAddCount: v.number(),
    urgentCount: v.number(),
    highPriorityCount: v.optional(v.number()),
    // Settings used
    geoTarget: v.string(),
    dataSource: v.string(),
    // Prompt versions used for this session (for smart cache matching)
    seedPromptVersion: v.optional(v.number()),
    analysisPromptVersion: v.optional(v.number()),
    // Full keyword data for reload
    keywordIdeas: v.optional(v.array(v.object({
      keyword: v.string(),
      avgMonthlySearches: v.number(),
      competition: v.string(),
      competitionIndex: v.number(),
      lowTopOfPageBidMicros: v.optional(v.number()),
      highTopOfPageBidMicros: v.optional(v.number()),
      inAccount: v.optional(v.boolean()),
      inAccountNames: v.optional(v.array(v.string())),
    }))),
    analyzedKeywords: v.optional(v.array(v.object({
      keyword: v.string(),
      avgMonthlySearches: v.number(),
      competition: v.string(),
      competitionIndex: v.number(),
      lowTopOfPageBidMicros: v.optional(v.number()),
      highTopOfPageBidMicros: v.optional(v.number()),
      inAccount: v.optional(v.boolean()),
      inAccountNames: v.optional(v.array(v.string())),
      // Analysis fields
      courseRelevance: v.number(),
      relevanceStatus: v.string(),
      conversionPotential: v.number(),
      searchIntent: v.number(),
      vendorSpecificity: v.number(),
      keywordSpecificity: v.number(),
      actionWordStrength: v.number(),
      commercialSignals: v.number(),
      negativeSignals: v.number(),
      koenigFit: v.number(),
      baseScore: v.number(),
      competitionBonus: v.number(),
      finalScore: v.number(),
      tier: v.string(),
      matchType: v.string(),
      action: v.string(),
      exclusionReason: v.optional(v.string()),
      priority: v.optional(v.string()),
    }))),
    // Metadata
    status: v.optional(v.string()),  // 'completed' | 'error'
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  }).index("by_created", ["createdAt"])
    .index("by_vendor", ["vendor"])
    .index("by_course_name", ["courseName"])
    .index("by_url_geo", ["courseUrl", "geoTarget"]),

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

  // Campaign performance cache (1-hour TTL)
  campaignPerformanceCache: defineTable({
    accountId: v.string(),
    dateRange: v.string(),
    campaigns: v.array(v.object({
      campaignId: v.string(),
      campaignName: v.string(),
      status: v.string(),
      channelType: v.string(),
      biddingStrategy: v.string(),
      impressions: v.number(),
      clicks: v.number(),
      ctr: v.number(),
      averageCpc: v.number(),
      costMicros: v.number(),
      conversions: v.number(),
      conversionsValue: v.number(),
      costPerConversion: v.number(),
    })),
    totals: v.object({
      impressions: v.number(),
      clicks: v.number(),
      costMicros: v.number(),
      conversions: v.number(),
      conversionsValue: v.number(),
      ctr: v.number(),
      averageCpc: v.number(),
      costPerConversion: v.number(),
    }),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_account_date", ["accountId", "dateRange"])
    .index("by_expires", ["expiresAt"]),

  // Recommendations cache (4-hour TTL)
  recommendationsCache: defineTable({
    accountId: v.string(),
    recommendations: v.array(v.object({
      resourceName: v.string(),
      type: v.string(),
      category: v.string(),
      impact: v.object({
        baseImpressions: v.number(),
        potentialImpressions: v.number(),
        baseClicks: v.number(),
        potentialClicks: v.number(),
        baseConversions: v.number(),
        potentialConversions: v.number(),
      }),
      campaignBudget: v.optional(v.object({
        currentBudgetMicros: v.number(),
        recommendedBudgetMicros: v.number(),
      })),
      keyword: v.optional(v.object({
        keyword: v.string(),
        matchType: v.string(),
      })),
      description: v.optional(v.string()),
    })),
    summary: v.object({
      total: v.number(),
      byCategory: v.any(),
      potentialClicks: v.number(),
      potentialConversions: v.number(),
    }),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_account", ["accountId"])
    .index("by_expires", ["expiresAt"]),

  // Optimization score cache (24-hour TTL)
  optimizationScoreCache: defineTable({
    accountId: v.string(),
    score: v.number(),
    upliftPotential: v.number(),
    recommendationCount: v.number(),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_account", ["accountId"])
    .index("by_expires", ["expiresAt"]),

  // Account summary cache (1-hour TTL)
  accountSummaryCache: defineTable({
    accountId: v.string(),
    dateRange: v.string(),
    accountName: v.string(),
    currencyCode: v.string(),
    totalCampaigns: v.number(),
    enabledCampaigns: v.number(),
    metrics: v.object({
      impressions: v.number(),
      clicks: v.number(),
      costMicros: v.number(),
      conversions: v.number(),
      conversionsValue: v.number(),
      ctr: v.number(),
      averageCpc: v.number(),
    }),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_account_date", ["accountId", "dateRange"])
    .index("by_expires", ["expiresAt"]),

  // ============================================
  // IMPORTED DATA (from CSV exports, no TTL)
  // ============================================

  // Imported campaign performance (from Google Ads Reports CSV export)
  importedCampaignPerformance: defineTable({
    accountId: v.string(),
    accountName: v.string(),
    dateRange: v.string(),  // e.g., "Dec 14, 2025 - Jan 12, 2026"
    importedAt: v.number(),
    source: v.string(),  // 'csv_import'
    campaigns: v.array(v.object({
      campaignName: v.string(),
      status: v.string(),  // Enabled, Paused, Removed
      campaignType: v.string(),  // Search, Performance Max, etc.
      clicks: v.number(),
      impressions: v.number(),
      ctr: v.number(),
      currencyCode: v.string(),
      averageCpc: v.number(),
      cost: v.number(),
      impressionsAbsTop: v.number(),
      impressionsTop: v.number(),
      conversions: v.number(),
      viewThroughConversions: v.number(),
      costPerConversion: v.number(),
      conversionRate: v.number(),
    })),
    totals: v.object({
      clicks: v.number(),
      impressions: v.number(),
      cost: v.number(),
      conversions: v.number(),
      ctr: v.number(),
      averageCpc: v.number(),
      costPerConversion: v.number(),
    }),
  }).index("by_account", ["accountId"])
    .index("by_imported", ["importedAt"]),

  // Account structure summary (from Google Ads Editor export)
  accountStructure: defineTable({
    accountId: v.string(),
    accountName: v.string(),
    importedAt: v.number(),
    source: v.string(),  // 'editor_export'
    summary: v.object({
      totalCampaigns: v.number(),
      enabledCampaigns: v.number(),
      pausedCampaigns: v.number(),
      totalAdGroups: v.number(),
      enabledAdGroups: v.number(),
      totalKeywords: v.number(),
      enabledKeywords: v.number(),
    }),
    campaignTypes: v.array(v.object({
      type: v.string(),
      count: v.number(),
    })),
    qualityScoreDistribution: v.optional(v.object({
      score1to3: v.number(),
      score4to6: v.number(),
      score7to10: v.number(),
      noScore: v.number(),
    })),
    topCampaigns: v.array(v.object({
      name: v.string(),
      status: v.string(),
      type: v.string(),
      adGroupCount: v.number(),
    })),
  }).index("by_account", ["accountId"])
    .index("by_imported", ["importedAt"]),

  // ============================================
  // CHANGE TRACKING (Google Ads Change Event API)
  // ============================================

  // Google Ads Change Events - tracks all modifications to campaigns, ad groups, keywords, etc.
  // Data from Google Ads Change Event API (30-day lookback max)
  googleAdsChanges: defineTable({
    customerId: v.string(),
    resourceType: v.string(), // CAMPAIGN, AD_GROUP, AD, KEYWORD, AD_GROUP_BID_MODIFIER, etc.
    resourceId: v.string(),
    resourceName: v.string(), // Full resource name from Google
    changeType: v.string(), // CREATE, UPDATE, REMOVE
    changedAt: v.number(), // Google's timestamp (when change was made)
    detectedAt: v.number(), // Our sync timestamp (when we detected it)

    // Who made the change
    userEmail: v.optional(v.string()),
    clientType: v.optional(v.string()), // GOOGLE_ADS_WEB_CLIENT, GOOGLE_ADS_API, GOOGLE_ADS_EDITOR, etc.

    // What changed - array of field-level changes
    changedFields: v.array(v.object({
      field: v.string(),
      category: v.string(), // budget, bidding, targeting, status, schedule, creative, other
      oldValue: v.optional(v.string()),
      newValue: v.optional(v.string()),
    })),

    // Human-readable summary for UI display
    summary: v.string(), // e.g., "Budget changed: ₹5,000 → ₹8,000"
  })
    .index("by_customerId", ["customerId"])
    .index("by_resourceType", ["resourceType"])
    .index("by_changedAt", ["changedAt"])
    .index("by_customerId_changedAt", ["customerId", "changedAt"])
    .index("by_resourceId", ["resourceId"]),

  // Campaign Snapshots - full state at each sync for our own change detection
  // Used as fallback when Change Event API data is incomplete
  googleAdsCampaignSnapshots: defineTable({
    googleCampaignId: v.string(),
    customerId: v.string(),
    snapshotAt: v.number(),

    // Full campaign state
    name: v.string(),
    status: v.string(), // ENABLED, PAUSED, REMOVED
    advertisingChannelType: v.string(), // SEARCH, DISPLAY, SHOPPING, VIDEO, PERFORMANCE_MAX
    biddingStrategyType: v.optional(v.string()),
    budgetAmountMicros: v.optional(v.string()),
    targetCpaMicros: v.optional(v.string()),
    targetRoas: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),

    // Hash for quick comparison (hash of all fields above)
    stateHash: v.string(),
  })
    .index("by_campaignId", ["googleCampaignId"])
    .index("by_customerId_date", ["customerId", "snapshotAt"]),

  // ============================================
  // EXPERIMENT TRACKING (Google Ads Experiments API)
  // ============================================

  // Google Ads Experiments - A/B tests on campaigns
  googleAdsExperiments: defineTable({
    googleExperimentId: v.string(),
    customerId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.string(), // SETUP, INITIATED, ENABLED, GRADUATED, REMOVED
    type: v.string(), // SEARCH_CUSTOM, DISPLAY_CUSTOM, PERFORMANCE_MAX_CUSTOM, etc.

    // Schedule
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),

    // Base campaign (the original campaign being tested)
    baseCampaignId: v.optional(v.string()),
    baseCampaignName: v.optional(v.string()),

    // Traffic split percentage for treatment
    trafficSplitPercent: v.optional(v.number()),

    // Goals - what metrics we're testing for
    goals: v.optional(v.array(v.object({
      metric: v.string(), // CLICKS, CONVERSIONS, COST_PER_CONVERSION, CTR, etc.
      direction: v.string(), // INCREASE, DECREASE
    }))),

    // Our custom tracking fields (user can add hypothesis, learnings, etc.)
    hypothesis: v.optional(v.string()), // "Testing if Target CPA bidding increases conversions"
    expectedOutcome: v.optional(v.string()),
    actualOutcome: v.optional(v.string()),
    learnings: v.optional(v.string()),

    // Report status
    reportGeneratedAt: v.optional(v.number()),
    reportSentAt: v.optional(v.number()),

    createdAt: v.number(),
    lastSyncedAt: v.number(),
  })
    .index("by_experimentId", ["googleExperimentId"])
    .index("by_customerId", ["customerId"])
    .index("by_status", ["status"])
    .index("by_baseCampaign", ["baseCampaignId"])
    .index("by_customerId_status", ["customerId", "status"]),

  // Experiment Arms - Control and Treatment variations
  googleAdsExperimentArms: defineTable({
    googleArmId: v.string(),
    experimentId: v.string(), // Links to googleAdsExperiments.googleExperimentId
    customerId: v.string(),
    name: v.string(),
    isControl: v.boolean(),
    campaignId: v.string(), // Each arm has its own campaign
    trafficSplitPercent: v.number(),

    // Performance metrics (updated regularly during experiment)
    metrics: v.optional(v.object({
      impressions: v.number(),
      clicks: v.number(),
      cost: v.number(), // In account currency (not micros)
      conversions: v.number(),
      conversionValue: v.number(),
      ctr: v.number(),
      cpc: v.number(),
      cpa: v.number(),
      roas: v.number(),
    })),

    lastMetricsAt: v.optional(v.number()),
  })
    .index("by_armId", ["googleArmId"])
    .index("by_experimentId", ["experimentId"])
    .index("by_customerId", ["customerId"]),

  // ============================================
  // GOOGLE ADS EDITOR CSV IMPORTS
  // ============================================

  // Import metadata - tracks each CSV upload
  gadsEditorImport: defineTable({
    accountId: v.string(),
    accountName: v.string(),
    fileName: v.string(),
    fileHash: v.string(), // For deduplication
    importedAt: v.number(),
    status: v.string(), // 'processing' | 'completed' | 'failed'
    error: v.optional(v.string()),

    // Stats from the import
    stats: v.object({
      totalRows: v.number(),
      campaigns: v.number(),
      adGroups: v.number(),
      keywords: v.number(),
      ads: v.number(),
      processedRows: v.number(),
    }),

    // Processing progress (for UI)
    progress: v.optional(v.number()), // 0-100
  })
    .index("by_account", ["accountId"])
    .index("by_imported", ["importedAt"])
    .index("by_status", ["status"])
    .index("by_hash", ["fileHash"]),

  // Imported campaigns from Google Ads Editor export
  gadsEditorCampaigns: defineTable({
    importId: v.id("gadsEditorImport"),
    accountId: v.string(),

    // Campaign identifiers
    campaignName: v.string(),
    labels: v.array(v.string()),

    // Campaign settings
    campaignType: v.string(), // Search, Display, Performance Max, etc.
    networks: v.optional(v.string()),
    budget: v.optional(v.number()),
    budgetType: v.optional(v.string()),

    // Bidding
    bidStrategyType: v.optional(v.string()),
    bidStrategyName: v.optional(v.string()),
    targetCpa: v.optional(v.number()),
    targetRoas: v.optional(v.number()),
    maxCpcBidLimit: v.optional(v.number()),

    // Schedule
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    adSchedule: v.optional(v.string()),

    // Status
    status: v.string(), // Enabled, Paused, Removed
  })
    .index("by_import", ["importId"])
    .index("by_account", ["accountId"])
    .index("by_campaign_name", ["campaignName"])
    .index("by_status", ["status"]),

  // Imported ad groups from Google Ads Editor export
  gadsEditorAdGroups: defineTable({
    importId: v.id("gadsEditorImport"),
    accountId: v.string(),
    campaignName: v.string(),

    // Ad group identifiers
    adGroupName: v.string(),
    adGroupType: v.optional(v.string()), // Standard, etc.

    // Bidding
    maxCpc: v.optional(v.number()),
    maxCpm: v.optional(v.number()),
    targetCpc: v.optional(v.number()),
    targetRoas: v.optional(v.number()),

    // Device bid modifiers
    desktopBidModifier: v.optional(v.number()),
    mobileBidModifier: v.optional(v.number()),
    tabletBidModifier: v.optional(v.number()),

    // Settings
    optimizedTargeting: v.optional(v.string()),

    // Status
    status: v.string(), // Enabled, Paused
  })
    .index("by_import", ["importId"])
    .index("by_account", ["accountId"])
    .index("by_campaign", ["campaignName"])
    .index("by_ad_group", ["adGroupName"])
    .index("by_status", ["status"]),

  // Imported keywords from Google Ads Editor export - includes quality scores!
  gadsEditorKeywords: defineTable({
    importId: v.id("gadsEditorImport"),
    accountId: v.string(),
    campaignName: v.string(),
    adGroupName: v.string(),

    // Keyword details
    keyword: v.string(),
    matchType: v.string(), // Exact, Phrase, Broad

    // Bid estimates
    firstPageBid: v.optional(v.number()),
    topOfPageBid: v.optional(v.number()),
    firstPositionBid: v.optional(v.number()),

    // Quality metrics (from Google Ads Editor export)
    qualityScore: v.optional(v.number()), // 1-10
    landingPageExperience: v.optional(v.string()), // Above average, Average, Below average
    expectedCtr: v.optional(v.string()), // Above average, Average, Below average
    adRelevance: v.optional(v.string()), // Above average, Average, Below average

    // Status
    status: v.string(), // Enabled, Paused
  })
    .index("by_import", ["importId"])
    .index("by_account", ["accountId"])
    .index("by_campaign", ["campaignName"])
    .index("by_ad_group", ["adGroupName"])
    .index("by_keyword", ["keyword"])
    .index("by_quality_score", ["qualityScore"])
    .index("by_status", ["status"]),

  // Imported ads from Google Ads Editor export
  gadsEditorAds: defineTable({
    importId: v.id("gadsEditorImport"),
    accountId: v.string(),
    campaignName: v.string(),
    adGroupName: v.string(),

    // Ad details
    adType: v.string(), // Responsive search ad, Expanded text ad
    finalUrl: v.optional(v.string()),

    // Headlines (for RSA - up to 15)
    headlines: v.array(v.string()),

    // Descriptions (for RSA - up to 4)
    descriptions: v.array(v.string()),

    // Paths
    path1: v.optional(v.string()),
    path2: v.optional(v.string()),

    // Status and approval
    status: v.string(), // Enabled, Paused
    approvalStatus: v.optional(v.string()), // Approved, Disapproved, Under review
    adStrength: v.optional(v.string()), // Excellent, Good, Average, Poor
  })
    .index("by_import", ["importId"])
    .index("by_account", ["accountId"])
    .index("by_campaign", ["campaignName"])
    .index("by_ad_group", ["adGroupName"])
    .index("by_status", ["status"])
    .index("by_ad_strength", ["adStrength"]),

  // ============================================
  // AUTO PPC ALGORITHM DOCUMENTATION
  // ============================================

  // Algorithm configuration - stores all 5 PPC automation algorithms with rules
  autoPpcRules: defineTable({
    algorithmId: v.string(), // "tcpa_bidding", "pause_resume", "ecl_signals", "oem_tech", "other_automations"
    name: v.string(),
    description: v.string(),
    category: v.string(), // "bidding", "status", "signals", "targeting", "other"

    // Rules as structured data - each algorithm has multiple rules
    rules: v.array(v.object({
      id: v.string(), // "1.1", "2.3", etc.
      condition: v.string(), // Human-readable condition
      action: v.string(), // What happens when condition is met
      impact: v.string(), // Business impact description
      potentialIssues: v.array(v.string()), // Known problems/risks
      affectedEntities: v.string(), // "All tCPA campaigns", "Course-level ad groups", etc.
    })),

    // Metadata
    dataSource: v.string(), // "RMS System", "Google Ads API", "Lead qualification system"
    executionFrequency: v.string(), // "Daily", "Weekly", "Monthly", "Real-time"
    enabled: v.boolean(),
    lastUpdated: v.number(),
  })
    .index("by_algorithmId", ["algorithmId"])
    .index("by_category", ["category"])
    .index("by_enabled", ["enabled"]),

  // Algorithm execution history - tracks when algorithms ran and what they changed
  autoPpcExecutions: defineTable({
    algorithmId: v.string(),
    ruleId: v.string(),
    accountId: v.string(),
    entityType: v.string(), // "campaign", "ad_group", "keyword"
    entityId: v.string(),
    entityName: v.string(),

    // What triggered and what happened
    triggerCondition: v.string(), // The condition that was met
    triggerValue: v.string(), // The actual value that triggered
    actionTaken: v.string(), // What the algo did
    oldValue: v.optional(v.string()),
    newValue: v.optional(v.string()),

    executedAt: v.number(),
    success: v.boolean(),
    notes: v.optional(v.string()),
  })
    .index("by_algorithm", ["algorithmId"])
    .index("by_account", ["accountId"])
    .index("by_executedAt", ["executedAt"])
    .index("by_entityId", ["entityId"])
    .index("by_algorithm_account", ["algorithmId", "accountId"]),

  // ============================================
  // AI-GENERATED INSIGHTS
  // ============================================

  // AI insights - generated recommendations from OpenRouter
  aiInsights: defineTable({
    type: v.string(), // "opportunity", "risk", "recommendation", "anomaly"
    platform: v.string(), // "google_ads", "linkedin", "cross_platform"
    title: v.string(),
    description: v.string(),
    priority: v.number(), // 1-5 (5 = highest)

    // Context - related entities this insight pertains to
    relatedEntities: v.array(v.object({
      type: v.string(), // "campaign", "ad_group", "keyword", "algorithm"
      id: v.string(),
      name: v.string(),
    })),

    // AI model info
    generatedBy: v.string(), // "openrouter/claude-3.5-sonnet", "openai/gpt-4o-mini"
    prompt: v.optional(v.string()), // The prompt used (for debugging)

    // Status tracking
    status: v.string(), // "new", "reviewed", "actioned", "dismissed"
    actionedAt: v.optional(v.number()),
    actionedBy: v.optional(v.string()),
    actionNotes: v.optional(v.string()),

    generatedAt: v.number(),
    expiresAt: v.number(), // Insights have a shelf life (e.g., 7 days)
  })
    .index("by_type", ["type"])
    .index("by_platform", ["platform"])
    .index("by_status", ["status"])
    .index("by_priority", ["priority"])
    .index("by_generatedAt", ["generatedAt"])
    .index("by_expiresAt", ["expiresAt"]),

  // ============================================
  // UNIFIED MARKETING METRICS (Cross-Platform)
  // ============================================

  // Unified metrics - combines Google Ads + LinkedIn for cross-platform view
  unifiedMarketingMetrics: defineTable({
    platform: v.string(), // "google_ads", "linkedin"
    accountId: v.string(),
    accountName: v.string(),
    date: v.string(), // YYYY-MM-DD format

    // Core metrics
    spend: v.number(), // In account currency
    impressions: v.number(),
    clicks: v.number(),
    conversions: v.number(),
    leads: v.number(),

    // Calculated metrics
    ctr: v.number(),
    cpc: v.number(),
    cpa: v.number(),
    conversionRate: v.number(),

    // Platform-specific fields (optional)
    googleSpecific: v.optional(v.object({
      searchImpressionShare: v.optional(v.number()),
      qualityScore: v.optional(v.number()),
    })),
    linkedInSpecific: v.optional(v.object({
      engagement: v.optional(v.number()),
      socialActions: v.optional(v.number()),
    })),

    fetchedAt: v.number(),
  })
    .index("by_platform", ["platform"])
    .index("by_accountId", ["accountId"])
    .index("by_date", ["date"])
    .index("by_platform_date", ["platform", "date"])
    .index("by_platform_account_date", ["platform", "accountId", "date"]),

  // ============================================
  // AUTOMATED REPORTS
  // ============================================

  // ============================================
  // LINKEDIN TOKEN STORAGE (Shared between localhost and Vercel)
  // ============================================

  // LinkedIn OAuth tokens - stored in Convex so both localhost and Vercel can share
  linkedinTokens: defineTable({
    // Token identifier (e.g., "primary" for the main token)
    tokenId: v.string(),

    // OAuth tokens
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),

    // Expiration tracking
    expiresAt: v.number(), // Timestamp when access token expires
    refreshTokenExpiresAt: v.optional(v.number()),

    // Granted scopes
    scopes: v.optional(v.array(v.string())),

    // User info (who authorized)
    userEmail: v.optional(v.string()),
    userName: v.optional(v.string()),

    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tokenId", ["tokenId"])
    .index("by_expiresAt", ["expiresAt"]),

  // Generated reports (experiment results, weekly summaries, change digests)
  googleAdsReports: defineTable({
    customerId: v.string(),
    reportType: v.string(), // EXPERIMENT_RESULT, WEEKLY_SUMMARY, CHANGE_DIGEST

    // Report content
    title: v.string(),
    summary: v.string(),
    details: v.string(), // JSON string with full report data

    // Related resources
    experimentId: v.optional(v.string()),
    campaignIds: v.optional(v.array(v.string())),

    // Scheduling
    scheduledFor: v.optional(v.number()),
    generatedAt: v.number(),
    sentAt: v.optional(v.number()),
    sentTo: v.optional(v.array(v.string())), // Email addresses

    // Status
    status: v.string(), // PENDING, GENERATED, SENT, FAILED
  })
    .index("by_customerId", ["customerId"])
    .index("by_reportType", ["reportType"])
    .index("by_status", ["status"])
    .index("by_generatedAt", ["generatedAt"])
    .index("by_experimentId", ["experimentId"]),
});
