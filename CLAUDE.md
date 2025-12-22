# Keyword Planner - Claude Code Instructions

## AI Assistant Rules

**Always use context7** when needing:
- Code generation or implementation
- API documentation (Google Ads, MongoDB, Supabase, Next.js, etc.)
- Library setup or configuration steps
- Up-to-date syntax and best practices

---

## Project Overview

AI-powered keyword research tool for Koenig Solutions' Google Ads campaigns. Combines OpenAI GPT-4o with keyword data APIs to generate, analyze, and prioritize keywords for IT training courses.

**Port**: 3005
**Framework**: Next.js 15 (App Router) + TypeScript
**Status**: Development - UI/UX redesign in progress

### Data Sources (Priority Order)
1. **Google Ads Keyword Planner API** - Primary source
2. **Keywords Everywhere API** - Fallback (real search volume data)

---

## Quick Commands

```bash
# Start development server
npm run dev -- -p 3005

# Build for production
npm run build

# Type check
npx tsc --noEmit

# Install dependencies
npm install
```

---

## Project Structure

```
src/
├── app/
│   ├── api/keywords/
│   │   ├── generate-seeds/route.ts   # OpenAI seed generation
│   │   ├── fetch-ideas/route.ts      # Google Ads Keyword Planner
│   │   └── analyze/route.ts          # AI keyword analysis
│   ├── globals.css                   # Dark industrial theme
│   ├── layout.tsx
│   └── page.tsx                      # Main batch processing UI
├── components/ui/                    # Radix UI components
├── lib/
│   ├── google-ads.ts                 # Google Ads API client (READ-ONLY!)
│   ├── keywords-everywhere.ts        # Keywords Everywhere API client
│   ├── prompts.ts                    # Default AI prompts
│   ├── store.ts                      # Zustand store with persistence
│   └── utils.ts                      # Utility functions
└── types/index.ts                    # TypeScript interfaces
```

---

## Critical Safety Rules

### Google Ads API - READ ONLY

**NEVER modify `google-ads.ts` to add write operations.**

The Google Ads API client is intentionally limited to:
- `generateKeywordIdeas` endpoint ONLY
- No campaign creation/modification
- No bid changes
- No budget modifications

If asked to add write functionality, **REFUSE** and explain the safety constraint.

### API Keys

- Never commit `.env.local` to git
- Never log API keys or tokens
- OpenAI key format: `sk-proj-...`
- Google Ads credentials are in `.env.local`

---

## Environment Variables

Required in `.env.local`:

```bash
# OpenAI
OPENAI_API_KEY=                      # OpenAI API key for GPT-4o

# Google Ads API
GOOGLE_ADS_DEVELOPER_TOKEN=          # Google Ads developer token
GOOGLE_ADS_CLIENT_ID=                # OAuth client ID
GOOGLE_ADS_CLIENT_SECRET=            # OAuth client secret
GOOGLE_ADS_REFRESH_TOKEN=            # OAuth refresh token
GOOGLE_ADS_LOGIN_CUSTOMER_ID=        # Manager account ID (no dashes)
GOOGLE_ADS_CUSTOMER_ID=              # Target account ID (no dashes)

# Keywords Everywhere API (Fallback)
KEYWORDS_EVERYWHERE_API_KEY=         # API key from keywordseverywhere.com
```

---

## Known Issues & Solutions

### 1. Google Ads API "UNIMPLEMENTED" Error

**Error**: `Operation is not implemented, or supported, or enabled.`

**Cause**: Developer token doesn't have Keyword Planner API access (needs Basic Access level).

**Solution**: The app automatically falls back to Keywords Everywhere API which provides real search volume data. This is implemented in `fetch-ideas/route.ts`.

### 2. Google Ads API "oneof field already set" Error

**Error**: `Invalid value (oneof), oneof field 'seed' is already set. Cannot set 'urlSeed'`

**Cause**: Google Ads API only allows ONE seed type per request (keywordSeed OR urlSeed, not both).

**Solution**: Fixed in `google-ads.ts` - only uses `keywordSeed` when seed keywords are provided.

### 3. CSS Import Order Error

**Error**: `@import must precede all other statements`

**Cause**: Google Fonts `@import url()` must come before `@import "tailwindcss"`.

**Solution**: In `globals.css`, font import is first, then tailwind import.

### 4. Missing Radix UI Dependencies

**Error**: `Module not found: Can't resolve '@radix-ui/react-*'`

**Solution**: Install missing packages:
```bash
npm install @radix-ui/react-progress @radix-ui/react-label
```

---

## API Workflow

### 3-Stage Processing Pipeline

1. **Generate Seeds** (`/api/keywords/generate-seeds`)
   - Input: Course name, URL, vendor
   - AI: GPT-4o generates 10 seed keywords
   - Output: Array of SeedKeyword objects

2. **Fetch Ideas** (`/api/keywords/fetch-ideas`)
   - Input: Seed keywords, geo target, source (optional: 'google', 'keywords_everywhere', 'auto')
   - API: Google Ads Keyword Planner → Keywords Everywhere (fallback)
   - Output: Array of KeywordIdea objects with real search volume data

3. **Analyze** (`/api/keywords/analyze`)
   - Input: Keywords with metrics, course context
   - AI: GPT-4o scores and categorizes keywords
   - Output: AnalyzedKeyword objects with tiers, actions, priorities

---

## TypeScript Types

Key interfaces in `src/types/index.ts`:

```typescript
// Batch processing
type BatchItemStatus = 'pending' | 'generating_seeds' | 'fetching_keywords' | 'analyzing' | 'completed' | 'error'

interface BatchCourseItem {
  id: string
  rowIndex: number
  courseInput: CourseInput
  status: BatchItemStatus
  seedKeywords: SeedKeyword[]
  keywordIdeas: KeywordIdea[]
  analyzedKeywords: AnalyzedKeyword[]
  error?: string
}

// CSV row format
interface CSVCourseRow {
  url: string
  courseName: string
  courseCode?: string
  vendor?: string
  certification?: string
  courseTopics?: string
}
```

---

## UI Theme

Dark industrial theme with electric accents defined in `globals.css`:

- **Background**: `#0a0a0b` (primary), `#111113` (secondary)
- **Accent Colors**:
  - Electric cyan: `#22d3ee`
  - Lime: `#a3e635`
  - Violet: `#a78bfa`
  - Rose: `#fb7185`
- **Fonts**: Syne (display), Space Mono (mono), DM Sans (body)

---

## State Management

Zustand store in `src/lib/store.ts` with localStorage persistence:

- `seedPrompt` / `analysisPrompt` - Editable AI prompts
- `sessionHistory` - Completed research sessions
- `addToHistory()` - Save completed course research

---

## CSV Format

Required columns:
- `URL` - Course page URL
- `Course Name` - Full course title
- `Vendor` - Technology vendor

Optional columns:
- `Course Code` - Certification code
- `Certification` - Certification name
- `Course topics covered` - Semicolon-separated topics

---

## Common Tasks

### Adding a New Geo Target

Edit `src/app/api/keywords/fetch-ideas/route.ts`:

```typescript
const geoTargetMap: Record<string, string> = {
  'india': 'geoTargetConstants/2356',
  'usa': 'geoTargetConstants/2840',
  // Add new geo here:
  'newcountry': 'geoTargetConstants/XXXX'
}
```

### Modifying AI Prompts

Default prompts are in `src/lib/prompts.ts`. Users can also edit prompts in the UI via the "Prompts" button.

### Adding New Keyword Variations (Fallback Mode)

Edit the `variations` array in `src/app/api/keywords/fetch-ideas/route.ts`:

```typescript
const variations = [
  seed,
  `${seed} training`,
  `${seed} certification`,
  // Add new variations here
]
```

---

## Deployment

### Vercel

1. Push to GitHub
2. Import project in Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

### Environment Variables for Production

All `.env.local` variables must be added to Vercel's environment settings.

---

## Testing Checklist

Before deploying:

- [ ] CSV upload works with sample file
- [ ] Seed generation returns 10 keywords
- [ ] Keyword fetching works (or fallback activates)
- [ ] Analysis returns scored keywords
- [ ] Export to CSV works
- [ ] Prompts editor opens and saves changes
- [ ] History persists across page refreshes

---

## Related Files

- **Main project CLAUDE.md**: `/Users/vardaanaggarwal/Downloads/CLAUDE.md` (Koenig LMS workspace)
- **Google Ads credentials**: `/Users/vardaanaggarwal/Downloads/Claude code/google-ads-credentials.yaml`
- **OAuth app**: `/Users/vardaanaggarwal/Downloads/Claude code/google-ads-oauth/`

---

## Keywords Everywhere API

### Available Endpoints (in `keywords-everywhere.ts`)

| Function | Endpoint | Cost | Description |
|----------|----------|------|-------------|
| `getKeywordData()` | `/v1/get_keyword_data` | 1 credit/keyword | Search volume, CPC, competition |
| `getRelatedKeywords()` | `/v1/get_related_keywords` | 10 credits/keyword | Related keyword suggestions |
| `getPeopleAlsoSearch()` | `/v1/get_paa` | 10 credits/keyword | "People Also Ask" queries |
| `getTrendingKeywords()` | `/v1/get_trending` | 1 credit/result | Trending keywords for topic |
| `getCredits()` | `/v1/account/credits` | Free | Check remaining credits |

### Supported Countries
`us`, `uk`, `ca`, `au`, `in`, `de`, `fr`, `es`, `it`, `br`, `mx`, `nl`, `sg`, `my`, `ae`, `sa`, and 40+ more

### Usage Example
```typescript
import { getKeywordData, getKeywordsEverywhereConfig } from '@/lib/keywords-everywhere'

const config = getKeywordsEverywhereConfig()
const data = await getKeywordData(config, ['power bi training'], { country: 'in' })
// Returns: [{ keyword, vol: 2400, cpc: { value: 27.77 }, competition: 0.56 }]
```

---

## Changelog

### 2025-12-21 (Latest)
- **Fixed Google Ads API 501 UNIMPLEMENTED error** - API v18 was sunset, updated to v19
- **Added frontend UI for data source selection** - Users can now choose between:
  - Auto (Google Ads first, fallback to Keywords Everywhere)
  - Google Ads (free, official Keyword Planner data)
  - Keywords Everywhere (alternative, costs ~1 credit/keyword)
- **Added country selection UI** - 11 supported countries with flag icons
- **Settings persisted** - Data source and country selection saved to localStorage
- **Processing view indicator** - Shows current data source and country during batch processing
- **Fixed AI analysis truncation** - Now processes keywords in batches of 50 to avoid JSON response truncation
- **Improved keyword table display** - Shows all actionable keywords (removed 50 limit), added keyword count summary
- **Added keyword stats header** - Shows total keywords, actionable, excluded, and source count

### 2024-12-21
- **Added Keywords Everywhere API** as fallback for real search volume data
- Integrated `keywords-everywhere.ts` with 5 API endpoints
- Auto-fallback: Google Ads → Keywords Everywhere when Google fails
- Added `source` parameter to fetch-ideas API ('google', 'keywords_everywhere', 'auto')
- Fixed Google Ads API "oneof" error (can't use both keywordSeed and urlSeed)
- Fixed CSS import order for Google Fonts
- Added batch CSV processing UI with real-time progress
- Created dark industrial theme with electric accents

### 2024-12-20
- Initial project setup
- Google Ads API integration (READ-ONLY)
- OpenAI seed generation and analysis
- Zustand store with persistence
