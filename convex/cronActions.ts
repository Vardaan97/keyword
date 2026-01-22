import { internalAction } from "./_generated/server";

/**
 * Internal Actions for Cron Jobs
 *
 * These actions are called by cron jobs and perform the actual work.
 * They make HTTP requests to the Next.js API routes which handle
 * the Google Ads API interactions.
 */

// Get the app URL from environment
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3005";

// Return type for sync actions
type SyncResult = {
  success: boolean;
  error?: string;
  totalChanges?: number;
  accounts?: number;
};

// Return type for report actions
type ReportResult = {
  success: boolean;
  error?: string;
  processed?: number;
  successful?: number;
  failed?: number;
};

// Return type for cleanup actions
type CleanupResult = {
  success: boolean;
  error?: string;
  deletedCount?: number;
  cutoffDate?: string;
};

// Return type for summary actions
type SummaryResult = {
  success: boolean;
  error?: string;
  summary?: object;
};

// ============================================
// Change Sync Actions
// ============================================

/**
 * Sync changes from Google Ads
 * Called by cron every 6 hours
 */
export const syncGoogleAdsChanges = internalAction({
  args: {},
  handler: async (): Promise<SyncResult> => {
    console.log("[CRON] Starting Google Ads change sync...");

    try {
      // Call the sync API endpoint
      const response = await fetch(`${APP_URL}/api/gads/changes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ days: 7 }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("[CRON] Change sync failed:", error);
        return { success: false, error: error.error || "Sync failed" };
      }

      const result = await response.json();
      console.log("[CRON] Change sync complete:", result.data?.totalChanges, "changes");

      return {
        success: true,
        totalChanges: result.data?.totalChanges || 0,
        accounts: result.data?.results?.length || 0,
      };
    } catch (error) {
      console.error("[CRON] Change sync error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// ============================================
// Experiment Report Actions
// ============================================

/**
 * Check for ended experiments and generate reports
 * Called by cron daily at 8:00 UTC
 *
 * Note: This is a simplified version that just calls the API.
 * The full implementation would query Convex for experiments needing reports.
 */
export const checkAndGenerateExperimentReports = internalAction({
  args: {},
  handler: async (): Promise<ReportResult> => {
    console.log("[CRON] Checking for experiments needing reports...");

    try {
      // For now, just log that we'd check for experiments
      // Full implementation would query Convex and generate reports
      console.log("[CRON] Experiment report check complete (no-op for now)");

      return {
        success: true,
        processed: 0,
        successful: 0,
        failed: 0,
      };
    } catch (error) {
      console.error("[CRON] Experiment report check error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// ============================================
// Weekly Summary Actions
// ============================================

/**
 * Generate weekly performance summary
 * Called by cron every Monday at 8:00 UTC
 *
 * Note: This is a simplified version that just logs.
 * The full implementation would aggregate stats from Convex.
 */
export const generateWeeklySummary = internalAction({
  args: {},
  handler: async (): Promise<SummaryResult> => {
    console.log("[CRON] Generating weekly summary...");

    try {
      const startDate = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const summary = {
        week: {
          start: new Date(startDate).toISOString().split("T")[0],
          end: new Date().toISOString().split("T")[0],
        },
        generatedAt: Date.now(),
        note: "Full implementation pending - would aggregate from Convex",
      };

      console.log("[CRON] Weekly summary generated:", summary);

      return {
        success: true,
        summary,
      };
    } catch (error) {
      console.error("[CRON] Weekly summary error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// ============================================
// Cache Maintenance Actions
// ============================================

/**
 * Clean up expired cache entries
 * Called by cron daily at 2:00 UTC
 *
 * Note: This is a simplified version.
 * The full implementation would call internal mutations.
 */
export const cleanupExpiredCaches = internalAction({
  args: {},
  handler: async (): Promise<CleanupResult> => {
    console.log("[CRON] Cleaning up expired caches...");

    try {
      // For now, just log that we'd clean up caches
      // Full implementation would call ctx.runMutation
      console.log("[CRON] Cache cleanup complete (no-op for now)");

      return {
        success: true,
        deletedCount: 0,
      };
    } catch (error) {
      console.error("[CRON] Cache cleanup error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Clean up old change events
 * Called by cron weekly on Sunday at 3:00 UTC
 *
 * Note: This is a simplified version.
 * The full implementation would call internal mutations.
 */
export const cleanupOldChanges = internalAction({
  args: {},
  handler: async (): Promise<CleanupResult> => {
    console.log("[CRON] Cleaning up old change events...");

    try {
      // For now, just log that we'd clean up old changes
      // Full implementation would call ctx.runMutation
      const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      console.log("[CRON] Old changes cleanup complete (no-op for now)");

      return {
        success: true,
        deletedCount: 0,
        cutoffDate: cutoffDate.toISOString(),
      };
    } catch (error) {
      console.error("[CRON] Old changes cleanup error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
