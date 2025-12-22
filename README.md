# Koenig Keyword Planner

A powerful AI-driven keyword research tool for Koenig Solutions' Google Ads campaigns. Built with Next.js 15, this application combines OpenAI's GPT-4o with Google Ads Keyword Planner API to generate, analyze, and prioritize keywords for IT training courses.

## Features

- **Batch CSV Processing**: Upload a CSV of courses and process all at once
- **AI-Powered Seed Generation**: Uses GPT-4o to generate high-intent seed keywords
- **Google Ads Integration**: Fetches real keyword data from Google Keyword Planner API (READ-ONLY)
- **Smart Keyword Analysis**: AI analyzes and scores keywords based on relevance, search volume, and competition
- **Real-time Progress Tracking**: Watch each course progress through the workflow
- **Export to CSV**: Download all analyzed keywords for use in Google Ads
- **Customizable Prompts**: Edit the AI prompts to fine-tune keyword generation
- **Persistent History**: Session history saved to localStorage

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4 with custom dark industrial theme
- **State Management**: Zustand with persist middleware
- **AI**: OpenAI GPT-4o
- **APIs**: Google Ads Keyword Planner API v18
- **CSV Parsing**: PapaParse

## Project Structure

```
keyword-planner/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── keywords/
│   │   │       ├── generate-seeds/    # OpenAI seed generation
│   │   │       │   └── route.ts
│   │   │       ├── fetch-ideas/       # Google Ads Keyword Planner
│   │   │       │   └── route.ts
│   │   │       └── analyze/           # AI keyword analysis
│   │   │           └── route.ts
│   │   ├── globals.css                # Custom dark theme
│   │   ├── layout.tsx
│   │   └── page.tsx                   # Main application
│   ├── components/
│   │   └── ui/                        # Radix UI components
│   ├── lib/
│   │   ├── google-ads.ts              # Google Ads API client (READ-ONLY)
│   │   ├── prompts.ts                 # Default AI prompts
│   │   ├── store.ts                   # Zustand store
│   │   └── utils.ts                   # Utility functions
│   └── types/
│       └── index.ts                   # TypeScript interfaces
├── .env.local                         # API credentials (not committed)
├── courses.csv                        # Sample course data
└── package.json
```

## Setup

### 1. Install Dependencies

```bash
cd keyword-planner
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file with the following:

```bash
# OpenAI API Key
OPENAI_API_KEY=your-openai-api-key

# Google Ads API Credentials
GOOGLE_ADS_DEVELOPER_TOKEN=your-developer-token
GOOGLE_ADS_CLIENT_ID=your-client-id
GOOGLE_ADS_CLIENT_SECRET=your-client-secret
GOOGLE_ADS_REFRESH_TOKEN=your-refresh-token
GOOGLE_ADS_LOGIN_CUSTOMER_ID=your-login-customer-id
GOOGLE_ADS_CUSTOMER_ID=your-customer-id
```

### 3. Run Development Server

```bash
npm run dev -- -p 3005
```

Open [http://localhost:3005](http://localhost:3005) in your browser.

## CSV Format

Upload a CSV file with the following columns:

| Column | Required | Description |
|--------|----------|-------------|
| URL | Yes | Course page URL |
| Course Name | Yes | Full course title |
| Vendor | Yes | Technology vendor (Microsoft, AWS, etc.) |
| Course Code | No | Certification code (AZ-104, PL-300, etc.) |
| Certification | No | Certification name |
| Course topics covered | No | Semicolon-separated topics |

### Example CSV

```csv
URL,Course Name,Course Code,Vendor,Certification,Course topics covered
https://example.com/power-bi,PL-300T00: Power BI Data Analyst,PL-300,Microsoft,PL-300,DAX;Data modeling;Reports
https://example.com/azure-admin,AZ-104: Azure Administrator,AZ-104,Microsoft,Azure Administrator Associate,VMs;Networking;Storage
```

## Workflow

The application processes each course through 3 stages:

### 1. Generate Seeds (OpenAI GPT-4o)
- Takes course name, URL, and vendor
- Generates 10 high-intent seed keywords
- Uses customizable prompt template

### 2. Fetch Keyword Ideas (Google Ads API)
- Sends seed keywords to Keyword Planner API
- Retrieves search volume, competition, and bid estimates
- Targets India geo (configurable)

### 3. Analyze Keywords (OpenAI GPT-4o)
- Scores each keyword (0-100) based on:
  - Search volume weight
  - Competition advantage
  - Relevance to course
- Assigns tier (1-4) and priority
- Recommends action (ADD, REVIEW, EXCLUDE)

## API Endpoints

### POST `/api/keywords/generate-seeds`

Generate seed keywords using AI.

**Request:**
```json
{
  "prompt": "Generate keywords for...",
  "courseName": "AZ-104: Azure Administrator",
  "courseUrl": "https://example.com/az-104",
  "vendor": "Microsoft"
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    { "keyword": "azure administrator certification", "source": "ai_generated" },
    { "keyword": "az-104 training", "source": "ai_generated" }
  ]
}
```

### POST `/api/keywords/fetch-ideas`

Fetch keyword ideas from Google Ads Keyword Planner.

**Request:**
```json
{
  "seedKeywords": ["azure certification", "az-104 training"],
  "geoTarget": "india"
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "keyword": "azure certification cost",
      "avgMonthlySearches": 2400,
      "competition": "MEDIUM",
      "competitionIndex": 45,
      "lowTopOfPageBidMicros": 1500000,
      "highTopOfPageBidMicros": 4500000
    }
  ]
}
```

### POST `/api/keywords/analyze`

Analyze and score keywords using AI.

**Request:**
```json
{
  "prompt": "Analyze these keywords...",
  "courseName": "AZ-104: Azure Administrator",
  "vendor": "Microsoft",
  "keywords": [...]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "analyzedKeywords": [
      {
        "keyword": "azure certification",
        "avgMonthlySearches": 5400,
        "competition": "HIGH",
        "finalScore": 85,
        "tier": "Tier 1",
        "matchType": "Exact",
        "action": "ADD",
        "priority": "URGENT - HIGH VOLUME",
        "relevanceStatus": "HIGHLY_RELEVANT"
      }
    ]
  }
}
```

## Google Ads API Safety

**IMPORTANT**: This application is configured for READ-ONLY access to Google Ads.

- Only uses `generateKeywordIdeas` endpoint
- Cannot create, modify, or delete campaigns
- Cannot spend budget or modify bids
- Cannot access billing information

The `google-ads.ts` client is explicitly limited to keyword research operations.

## Customizing AI Prompts

Click the "Prompts" button in the header to edit:

1. **Seed Keyword Generator**: Controls how initial keywords are generated
2. **Keyword Analyzer**: Controls scoring and prioritization logic

Prompts support variables:
- `{{COURSE_NAME}}` - Course title
- `{{COURSE_URL}}` - Course page URL
- `{{VENDOR}}` - Technology vendor
- `{{CERTIFICATION_CODE}}` - Cert code
- `{{RELATED_TERMS}}` - Topic keywords

## Scoring System

Keywords are scored 0-100 based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| Search Volume | 40% | Higher volume = higher score |
| Competition | 30% | Lower competition = higher score |
| Relevance | 30% | AI-assessed relevance to course |

### Tiers

| Tier | Score Range | Action |
|------|-------------|--------|
| Tier 1 | 80-100 | Add immediately |
| Tier 2 | 60-79 | Add with review |
| Tier 3 | 40-59 | Consider adding |
| Tier 4 | 0-39 | Skip or exclude |

## Fallback Mode

If Google Ads API returns errors (e.g., `UNIMPLEMENTED`), the system automatically generates synthetic keyword variations from seeds. This allows the workflow to complete even without full API access.

## Deployment

### Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Set environment variables in Vercel dashboard.

### Environment Variables for Production

All `.env.local` variables must be configured in your hosting platform's environment settings.

## Troubleshooting

### "Operation is not implemented, or supported, or enabled"

This error from Google Ads API indicates the developer token doesn't have Keyword Planner access. The app will fall back to synthetic keyword generation.

To fix: Apply for Basic Access level for your Google Ads developer token.

### "Failed to parse seed keywords"

OpenAI response format issue. Check:
- API key is valid
- Account has GPT-4o access
- Prompt format is correct

### CSV Upload Not Working

Ensure:
- File has `.csv` extension
- Required columns exist (URL, Course Name, Vendor)
- No encoding issues (save as UTF-8)

## Screenshots

### Upload View
Dark industrial theme with CSV drag-and-drop upload zone.

### Processing View
Split panel layout showing course list with real-time status indicators and detailed keyword results.

### Results Table
Analyzed keywords with scores, tiers, competition levels, and recommended actions.

## License

Proprietary - Koenig Solutions

## Contact

- **Developer**: Vardaan
- **Company**: Koenig Solutions
- **Project**: Google Ads Keyword Research Tool
