import { cronJobs } from "convex/server";

/**
 * Convex Cron Jobs for Google Ads Dashboard
 *
 * NOTE: Cron jobs are temporarily disabled while the API integration
 * is being set up. The cronActions module contains the implementation
 * that can be called manually or re-enabled once the production URL
 * is configured.
 *
 * To re-enable:
 * 1. Set NEXT_PUBLIC_APP_URL environment variable in Convex
 * 2. Uncomment the cron job registrations below
 * 3. Import: import { internal } from "./_generated/api";
 */

const crons = cronJobs();

// Cron jobs disabled - see note above
// To enable, uncomment and configure NEXT_PUBLIC_APP_URL

// crons.interval(
//   "sync-google-ads-changes",
//   { hours: 6 },
//   internal.cronActions.syncGoogleAdsChanges
// );

// crons.daily(
//   "check-experiment-reports",
//   { hourUTC: 8, minuteUTC: 0 },
//   internal.cronActions.checkAndGenerateExperimentReports
// );

// crons.weekly(
//   "weekly-performance-summary",
//   { dayOfWeek: "monday", hourUTC: 8, minuteUTC: 0 },
//   internal.cronActions.generateWeeklySummary
// );

// crons.daily(
//   "cleanup-expired-caches",
//   { hourUTC: 2, minuteUTC: 0 },
//   internal.cronActions.cleanupExpiredCaches
// );

// crons.weekly(
//   "cleanup-old-changes",
//   { dayOfWeek: "sunday", hourUTC: 3, minuteUTC: 0 },
//   internal.cronActions.cleanupOldChanges
// );

export default crons;
