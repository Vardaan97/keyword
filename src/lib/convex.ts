/**
 * Convex Client Wrapper
 *
 * Provides access to Convex backend from Next.js API routes.
 * Requires NEXT_PUBLIC_CONVEX_URL environment variable.
 *
 * Setup:
 * 1. Create a Convex account at https://convex.dev
 * 2. Run `npx convex dev` to deploy the backend
 * 3. Add NEXT_PUBLIC_CONVEX_URL to .env.local
 */

import { ConvexHttpClient } from "convex/browser";

// Dynamic import of Convex API types (generated after `npx convex dev`)
// These will be available after Convex is initialized
type ConvexAPI = {
  queue: {
    enqueue: unknown;
    getStatus: unknown;
    complete: unknown;
    fail: unknown;
  };
  keywords: {
    getCached: unknown;
    setCached: unknown;
    getStats: unknown;
  };
  rateLimits: {
    trackRequest: unknown;
    markQuotaExhausted: unknown;
    getStatus: unknown;
    getAllStatuses: unknown;
  };
};

let convexClient: ConvexHttpClient | null = null;

/**
 * Get the Convex HTTP client
 * Returns null if Convex is not configured
 */
export function getConvexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    return null;
  }

  if (!convexClient) {
    convexClient = new ConvexHttpClient(url);
  }

  return convexClient;
}

/**
 * Check if Convex is configured
 */
export function isConvexConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_CONVEX_URL;
}

/**
 * Queue a request for retry later
 * Used when Google Ads API quota is exhausted
 */
export async function queueRequest(
  type: 'keyword_fetch' | 'account_keywords',
  payload: Record<string, unknown>,
  maxRetries: number = 3
): Promise<string | null> {
  const client = getConvexClient();
  if (!client) {
    console.log('[CONVEX] Not configured - skipping queue');
    return null;
  }

  try {
    // Note: This requires the Convex API to be generated
    // For now, return null until Convex is fully set up
    console.log('[CONVEX] Would queue request:', { type, payload, maxRetries });
    return null;
  } catch (error) {
    console.error('[CONVEX] Error queueing request:', error);
    return null;
  }
}

/**
 * Get queue status
 */
export async function getQueueStatus(): Promise<{
  pending: number;
  processing: number;
  failed: number;
} | null> {
  const client = getConvexClient();
  if (!client) {
    return null;
  }

  try {
    console.log('[CONVEX] Would get queue status');
    return { pending: 0, processing: 0, failed: 0 };
  } catch (error) {
    console.error('[CONVEX] Error getting queue status:', error);
    return null;
  }
}

/**
 * Track API request for rate limiting
 */
export async function trackRateLimit(accountId: string): Promise<{
  allowed: boolean;
  reason?: string;
} | null> {
  const client = getConvexClient();
  if (!client) {
    // If Convex not configured, allow all requests (use in-memory rate limiting)
    return { allowed: true };
  }

  try {
    console.log('[CONVEX] Would track rate limit for:', accountId);
    return { allowed: true };
  } catch (error) {
    console.error('[CONVEX] Error tracking rate limit:', error);
    return { allowed: true };  // Allow on error to not block requests
  }
}

/**
 * Mark quota as exhausted for an account
 */
export async function markQuotaExhausted(
  accountId: string,
  resetInMinutes: number = 5
): Promise<void> {
  const client = getConvexClient();
  if (!client) {
    return;
  }

  try {
    console.log('[CONVEX] Would mark quota exhausted for:', accountId, 'reset in:', resetInMinutes, 'minutes');
  } catch (error) {
    console.error('[CONVEX] Error marking quota exhausted:', error);
  }
}

/**
 * Get cached keywords from Convex
 */
export async function getCachedKeywordsConvex(cacheKey: string): Promise<unknown[] | null> {
  const client = getConvexClient();
  if (!client) {
    return null;
  }

  try {
    console.log('[CONVEX] Would get cached keywords for:', cacheKey);
    return null;
  } catch (error) {
    console.error('[CONVEX] Error getting cached keywords:', error);
    return null;
  }
}

/**
 * Set cached keywords in Convex
 */
export async function setCachedKeywordsConvex(
  cacheKey: string,
  geoTarget: string,
  source: string,
  keywords: unknown[],
  ttlHours: number = 168
): Promise<void> {
  const client = getConvexClient();
  if (!client) {
    return;
  }

  try {
    console.log('[CONVEX] Would cache keywords:', { cacheKey, geoTarget, source, count: keywords.length, ttlHours });
  } catch (error) {
    console.error('[CONVEX] Error caching keywords:', error);
  }
}

// ============================================
// Google Ads Reports Caching Functions
// ============================================

import { api } from "../../convex/_generated/api";

/**
 * Get cached campaign performance from Convex
 */
export async function getCachedCampaignPerformance(
  accountId: string,
  dateRange: string
): Promise<{
  campaigns: Array<{
    campaignId: string;
    campaignName: string;
    status: string;
    channelType: string;
    biddingStrategy: string;
    impressions: number;
    clicks: number;
    ctr: number;
    averageCpc: number;
    costMicros: number;
    conversions: number;
    conversionsValue: number;
    costPerConversion: number;
  }>;
  totals: {
    impressions: number;
    clicks: number;
    costMicros: number;
    conversions: number;
    conversionsValue: number;
    ctr: number;
    averageCpc: number;
    costPerConversion: number;
  };
  fetchedAt: number;
} | null> {
  const client = getConvexClient();
  if (!client) {
    return null;
  }

  try {
    const result = await client.query(api.gadsReports.getCampaignPerformance, {
      accountId,
      dateRange,
    });
    return result;
  } catch (error) {
    console.error('[CONVEX] Error getting cached campaign performance:', error);
    return null;
  }
}

/**
 * Set cached campaign performance in Convex
 */
export async function setCachedCampaignPerformance(
  accountId: string,
  dateRange: string,
  campaigns: Array<{
    campaignId: string;
    campaignName: string;
    status: string;
    channelType: string;
    biddingStrategy: string;
    impressions: number;
    clicks: number;
    ctr: number;
    averageCpc: number;
    costMicros: number;
    conversions: number;
    conversionsValue: number;
    costPerConversion: number;
  }>,
  totals: {
    impressions: number;
    clicks: number;
    costMicros: number;
    conversions: number;
    conversionsValue: number;
    ctr: number;
    averageCpc: number;
    costPerConversion: number;
  }
): Promise<void> {
  const client = getConvexClient();
  if (!client) {
    return;
  }

  try {
    await client.mutation(api.gadsReports.setCampaignPerformance, {
      accountId,
      dateRange,
      campaigns,
      totals,
    });
    console.log('[CONVEX] Cached campaign performance for:', accountId, dateRange);
  } catch (error) {
    console.error('[CONVEX] Error caching campaign performance:', error);
  }
}

/**
 * Get cached recommendations from Convex
 */
export async function getCachedRecommendations(
  accountId: string
): Promise<{
  recommendations: Array<{
    resourceName: string;
    type: string;
    category: string;
    impact: {
      baseImpressions: number;
      potentialImpressions: number;
      baseClicks: number;
      potentialClicks: number;
      baseConversions: number;
      potentialConversions: number;
    };
    campaignBudget?: {
      currentBudgetMicros: number;
      recommendedBudgetMicros: number;
    };
    keyword?: {
      keyword: string;
      matchType: string;
    };
    description?: string;
  }>;
  summary: {
    total: number;
    byCategory: Record<string, number>;
    potentialClicks: number;
    potentialConversions: number;
  };
  fetchedAt: number;
} | null> {
  const client = getConvexClient();
  if (!client) {
    return null;
  }

  try {
    const result = await client.query(api.gadsReports.getRecommendations, {
      accountId,
    });
    return result;
  } catch (error) {
    console.error('[CONVEX] Error getting cached recommendations:', error);
    return null;
  }
}

/**
 * Set cached recommendations in Convex
 */
export async function setCachedRecommendations(
  accountId: string,
  recommendations: Array<{
    resourceName: string;
    type: string;
    category: string;
    impact: {
      baseImpressions: number;
      potentialImpressions: number;
      baseClicks: number;
      potentialClicks: number;
      baseConversions: number;
      potentialConversions: number;
    };
    campaignBudget?: {
      currentBudgetMicros: number;
      recommendedBudgetMicros: number;
    };
    keyword?: {
      keyword: string;
      matchType: string;
    };
    description?: string;
  }>,
  summary: {
    total: number;
    byCategory: Record<string, number>;
    potentialClicks: number;
    potentialConversions: number;
  }
): Promise<void> {
  const client = getConvexClient();
  if (!client) {
    return;
  }

  try {
    await client.mutation(api.gadsReports.setRecommendations, {
      accountId,
      recommendations,
      summary,
    });
    console.log('[CONVEX] Cached recommendations for:', accountId);
  } catch (error) {
    console.error('[CONVEX] Error caching recommendations:', error);
  }
}

/**
 * Get cached optimization score from Convex
 */
export async function getCachedOptimizationScore(
  accountId: string
): Promise<{
  score: number;
  upliftPotential: number;
  recommendationCount: number;
  fetchedAt: number;
} | null> {
  const client = getConvexClient();
  if (!client) {
    return null;
  }

  try {
    const result = await client.query(api.gadsReports.getOptimizationScore, {
      accountId,
    });
    return result;
  } catch (error) {
    console.error('[CONVEX] Error getting cached optimization score:', error);
    return null;
  }
}

/**
 * Set cached optimization score in Convex
 */
export async function setCachedOptimizationScore(
  accountId: string,
  score: number,
  upliftPotential: number,
  recommendationCount: number
): Promise<void> {
  const client = getConvexClient();
  if (!client) {
    return;
  }

  try {
    await client.mutation(api.gadsReports.setOptimizationScore, {
      accountId,
      score,
      upliftPotential,
      recommendationCount,
    });
    console.log('[CONVEX] Cached optimization score for:', accountId);
  } catch (error) {
    console.error('[CONVEX] Error caching optimization score:', error);
  }
}

/**
 * Get cached account summary from Convex
 */
export async function getCachedAccountSummary(
  accountId: string,
  dateRange: string
): Promise<{
  accountName: string;
  currencyCode: string;
  totalCampaigns: number;
  enabledCampaigns: number;
  metrics: {
    impressions: number;
    clicks: number;
    costMicros: number;
    conversions: number;
    conversionsValue: number;
    ctr: number;
    averageCpc: number;
  };
  fetchedAt: number;
} | null> {
  const client = getConvexClient();
  if (!client) {
    return null;
  }

  try {
    const result = await client.query(api.gadsReports.getAccountSummary, {
      accountId,
      dateRange,
    });
    return result;
  } catch (error) {
    console.error('[CONVEX] Error getting cached account summary:', error);
    return null;
  }
}

/**
 * Set cached account summary in Convex
 */
export async function setCachedAccountSummary(
  accountId: string,
  dateRange: string,
  accountName: string,
  currencyCode: string,
  totalCampaigns: number,
  enabledCampaigns: number,
  metrics: {
    impressions: number;
    clicks: number;
    costMicros: number;
    conversions: number;
    conversionsValue: number;
    ctr: number;
    averageCpc: number;
  }
): Promise<void> {
  const client = getConvexClient();
  if (!client) {
    return;
  }

  try {
    await client.mutation(api.gadsReports.setAccountSummary, {
      accountId,
      dateRange,
      accountName,
      currencyCode,
      totalCampaigns,
      enabledCampaigns,
      metrics,
    });
    console.log('[CONVEX] Cached account summary for:', accountId, dateRange);
  } catch (error) {
    console.error('[CONVEX] Error caching account summary:', error);
  }
}

/**
 * Get cache statistics
 */
export async function getGadsCacheStats(): Promise<{
  campaignPerformance: { total: number; active: number; expired: number };
  recommendations: { total: number; active: number; expired: number };
  optimizationScore: { total: number; active: number; expired: number };
  accountSummary: { total: number; active: number; expired: number };
} | null> {
  const client = getConvexClient();
  if (!client) {
    return null;
  }

  try {
    const result = await client.query(api.gadsReports.getCacheStats, {});
    return result;
  } catch (error) {
    console.error('[CONVEX] Error getting cache stats:', error);
    return null;
  }
}

/**
 * Clear expired cache entries
 */
export async function clearExpiredGadsCaches(): Promise<{ deletedCount: number } | null> {
  const client = getConvexClient();
  if (!client) {
    return null;
  }

  try {
    const result = await client.mutation(api.gadsReports.clearExpiredCaches, {});
    console.log('[CONVEX] Cleared expired caches:', result.deletedCount);
    return result;
  } catch (error) {
    console.error('[CONVEX] Error clearing expired caches:', error);
    return null;
  }
}
