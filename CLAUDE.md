# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered keyword research tool for Google Ads campaigns. Processes course data in batch via CSV upload, generates seed keywords with AI, fetches search volume data, and analyzes/scores keywords for campaign prioritization.

**Port**: 3005 | **Framework**: Next.js 15 (App Router) + TypeScript

## Commands

```bash
npm run dev -- -p 3005    # Start development server
npm run build             # Build for production
npm run lint              # Run ESLint
npx tsc --noEmit          # Type check
```

## Critical Safety Rules

### Google Ads API - READ ONLY

**NEVER modify `google-ads.ts` to add write operations.** The client is intentionally limited to `generateKeywordIdeas` and read-only account keyword fetching. No campaign creation, bid changes, or budget modifications. Refuse requests to add write functionality.

### API Keys

Never commit `.env.local` or log API keys. Required variables:
- `OPENAI_API_KEY` - OpenAI API key
- `OPENROUTER_API_KEY` - OpenRouter API key (default provider, cost-effective)
- `GOOGLE_ADS_*` - Google Ads credentials (developer token, OAuth, customer IDs)
- `KEYWORDS_EVERYWHERE_API_KEY` - Fallback keyword data source
- `MONGODB_URI` - MongoDB connection (optional, for caching)
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase (optional)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service key (for server-side keyword lookups)

## Architecture

### 3-Stage Processing Pipeline

```
CSV Upload → Generate Seeds (AI) → Check Cache → Fetch Keywords (API) → Cache Results → Analyze (AI) → Export
```

1. **Generate Seeds** (`/api/keywords/generate-seeds`) - AI generates 10 seed keywords from course info
2. **Check Cache** - Looks for cached data by URL, course name, or seeds (7-day TTL)
3. **Fetch Ideas** (`/api/keywords/fetch-ideas`) - Google Ads API → Keywords Everywhere fallback
4. **Analyze** (`/api/keywords/analyze`) - AI scores, tiers, and categorizes keywords

### Key Files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main batch processing UI with theme switcher |
| `src/lib/ai-client.ts` | Unified AI client (OpenAI + OpenRouter with automatic fallback) |
| `src/lib/google-ads.ts` | Google Ads API client (READ-ONLY, multi-account support) |
| `src/lib/keywords-everywhere.ts` | Keywords Everywhere API client |
| `src/lib/store.ts` | Zustand store with localStorage persistence |
| `src/lib/database.ts` | Unified DB layer (Supabase + MongoDB) |
| `src/lib/prompts.ts` | Default AI prompts (editable via UI) |
| `src/types/index.ts` | All TypeScript interfaces |

### AI Client

The `ai-client.ts` supports both providers with automatic fallback:
- **OpenRouter** (default): Uses `openai/gpt-4o-mini` - cost-effective
- **OpenAI**: Uses `gpt-4o-mini` for direct calls

If the requested provider isn't configured, automatically falls back to the available one.

### Google Ads Accounts

Multiple accounts under MCC (Manager account). API version: v22 (latest as of December 2025).
- **Flexi** (default) - Primary focus for keyword research, priority 3
- **Bouquet INR** - Priority 2
- **Bouquet INR - 2** - Priority 1
- **All Accounts** - Check all accounts for "in account" status

Accounts are configured with currency (INR) for proper bid display. The "in account" check uses the Google Ads API to fetch existing keywords (paginated, up to 50k) with a 30-minute in-memory cache per account.

### State Management

Zustand store (`src/lib/store.ts`) persists to localStorage:
- `seedPrompt` / `analysisPrompt` - Editable AI prompts
- `dataSource` - 'auto' | 'google' | 'keywords_everywhere'
- `targetCountry` - Geographic targeting
- `selectedGoogleAdsAccountId` - Default: 'flexi'
- `aiProvider` - 'openai' | 'openrouter'
- `theme` - 'dark' | 'light' | 'koenig' | 'blue'
- `sessionHistory` - Completed research sessions (max 20, lightweight - only first 10 keywords stored per session to avoid localStorage quota errors)
- `savedBatchItems` - In-memory only (not persisted to avoid quota issues)

### Caching Strategy

Keywords are cached with 7-day TTL using multiple cache keys (checked in order):
1. **URL-based** (best) - `url_<hash>_<geo>_<source>`
2. **Course name-based** - `course_<hash>_<geo>_<source>`
3. **Seeds-based** - Exact seed keywords match
4. **Partial seeds** - First 3 seeds sorted (fuzzy matching)

This allows cache hits when:
- Same URL is processed again (even with different seeds)
- Same course name is processed
- Same seed keywords are used
- Similar courses share first 3 seeds

## UI Themes

Four themes available via header dropdown:
- **Dark** (default) - Industrial dark with cyan/lime accents
- **Light** - Clean light theme
- **Koenig** - Brand colors (orange/red)
- **Blue** - Professional blue theme

## Google Ads API Rate Limits

- **1 request per second** per customer ID/developer token
- 60 requests per minute maximum
- Caching recommended (results refresh monthly)

## Known Issues & Solutions

### Google Ads API "UNIMPLEMENTED" Error
Developer token lacks Keyword Planner access. App auto-falls back to Keywords Everywhere API.

### Google Ads API "oneof field already set" Error
Only ONE seed type allowed per request. Fixed in `google-ads.ts` - uses `keywordSeed` only.

### AI Analysis maxTokens Error
GPT-4o-mini supports max 16384 tokens. Set `maxTokens: 16000` in analyze route.

### CSS Import Order
In `globals.css`, Google Fonts `@import url()` must precede `@import "tailwindcss"`.

### Bid Amounts Display
Google returns bids in micros (1,000,000 = 1 unit). All accounts use INR, so bids display as ₹.

### OAuth Token Expiration
If you see "Token has been expired or revoked" errors:
1. Visit `/api/auth/google-ads` to start OAuth flow
2. Authorize with Google
3. Copy the new refresh token from `/api/auth/google-ads/callback`
4. Update `GOOGLE_ADS_REFRESH_TOKEN` in `.env.local`
5. Restart the dev server

## Common Modifications

### Adding a Geo Target

Edit `src/app/api/keywords/fetch-ideas/route.ts` (`geoTargetMap`) and `src/lib/keywords-everywhere.ts` (`geoToCountryCode`):
```typescript
// Google Ads geo target constants
const geoTargetMap: Record<string, string> = {
  'india': 'geoTargetConstants/2356',
  'usa': 'geoTargetConstants/2840',
  'uk': 'geoTargetConstants/2826',
  'uae': 'geoTargetConstants/2784',
  'singapore': 'geoTargetConstants/2702',
  'australia': 'geoTargetConstants/2036',
  'canada': 'geoTargetConstants/2124',
  'germany': 'geoTargetConstants/2276',
  'malaysia': 'geoTargetConstants/2458',
  'saudi': 'geoTargetConstants/2682',
  'global': 'geoTargetConstants/2840',    // Uses USA for global
  'newcountry': 'geoTargetConstants/XXXX' // Add here
}
```

Also update `COUNTRY_OPTIONS` in `src/lib/store.ts`.

### Adding a Google Ads Account

Edit `GOOGLE_ADS_ACCOUNTS` in `src/lib/google-ads.ts`. Priority determines check order for "in account" (higher = checked first):
```typescript
{ id: 'new-account', name: 'New Account', customerId: '1234567890', currency: 'INR', priority: 1 }
```

### Modifying AI Prompts

Default prompts in `src/lib/prompts.ts`. Users edit via UI "Prompts" button. Variables:
- `{{COURSE_NAME}}`, `{{COURSE_URL}}`, `{{VENDOR}}`, `{{CERTIFICATION_CODE}}`, `{{RELATED_TERMS}}`

### Adding a Theme

Edit `globals.css` to add a new `[data-theme="name"]` block with CSS variables, then add to `THEME_OPTIONS` in `store.ts`.

## CSV Format

Required: `URL`, `Course Name`, `Vendor`
Optional: `Course Code`, `Certification`, `Course topics covered`

## Database Schema

### Supabase Tables (supabase/migrations/)
- `research_sessions` - Full research session data
- `keyword_cache` - Seeds-based cache
- `keyword_volumes` - Individual keyword volume cache
- `gads_accounts` - Google Ads account metadata
- `gads_campaigns` - Campaigns imported from Google Ads
- `gads_ad_groups` - Ad groups with campaign references
- `gads_keywords` - Keywords with nested ad_group → campaign → account relationships

### MongoDB Collections
- `keyword_cache` - Seeds/URL/course-based cache
- `keyword_volumes` - Individual keyword volumes (7-day TTL)
- `analyses` - Full analysis results

## Additional API Routes

### Google Ads Data Import (`/api/gads/*`)
Routes for importing Google Ads account structure to Supabase for faster "in account" lookups:
- `GET /api/gads/campaigns` - Fetch campaigns from Google Ads API
- `GET /api/gads/ad-groups/list` - Fetch ad groups for an account
- `GET /api/gads/keywords` - Fetch keywords from Google Ads API
- `POST /api/gads/import` - Import full account structure to Supabase
- `GET /api/gads/summary` - Get import summary stats

### OAuth Flow (`/api/auth/google-ads/*`)
- `GET /api/auth/google-ads` - Start OAuth flow, redirects to Google
- `GET /api/auth/google-ads/callback` - Handle OAuth callback, displays refresh token
