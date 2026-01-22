/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiInsights from "../aiInsights.js";
import type * as autoPpcExecutions from "../autoPpcExecutions.js";
import type * as autoPpcRules from "../autoPpcRules.js";
import type * as cronActions from "../cronActions.js";
import type * as crons from "../crons.js";
import type * as gadsEditorImport from "../gadsEditorImport.js";
import type * as gadsReports from "../gadsReports.js";
import type * as googleAdsChanges from "../googleAdsChanges.js";
import type * as googleAdsExperiments from "../googleAdsExperiments.js";
import type * as imports from "../imports.js";
import type * as keywords from "../keywords.js";
import type * as linkedinTokens from "../linkedinTokens.js";
import type * as prompts from "../prompts.js";
import type * as queue from "../queue.js";
import type * as rateLimits from "../rateLimits.js";
import type * as sessions from "../sessions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiInsights: typeof aiInsights;
  autoPpcExecutions: typeof autoPpcExecutions;
  autoPpcRules: typeof autoPpcRules;
  cronActions: typeof cronActions;
  crons: typeof crons;
  gadsEditorImport: typeof gadsEditorImport;
  gadsReports: typeof gadsReports;
  googleAdsChanges: typeof googleAdsChanges;
  googleAdsExperiments: typeof googleAdsExperiments;
  imports: typeof imports;
  keywords: typeof keywords;
  linkedinTokens: typeof linkedinTokens;
  prompts: typeof prompts;
  queue: typeof queue;
  rateLimits: typeof rateLimits;
  sessions: typeof sessions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
