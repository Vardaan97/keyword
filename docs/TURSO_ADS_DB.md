# Turso Google Ads Databases

Comprehensive reference for the Turso-hosted Google Ads account data used by the keyword planner and other downstream systems. All data originates from Google Ads Editor CSV exports (March 2026), parsed into SQLite, then synced to Turso for remote access.

---

## Table of Contents

1. [Database Architecture](#database-architecture)
2. [Account Summary](#account-summary)
3. [Table Schema](#table-schema)
4. [Connection Examples](#connection-examples)
5. [API Endpoints](#api-endpoints)
6. [Common Queries](#common-queries)
7. [Sync Process](#sync-process)
8. [External Access](#external-access)
9. [Environment Variables](#environment-variables)
10. [Troubleshooting](#troubleshooting)

---

## Database Architecture

Two separate Turso databases hold all Google Ads account data. Bouquet INR is in its own database because of its size (3.5M keywords, 395K ads).

### Main Database (google-ads)

| Property | Value |
|----------|-------|
| **Name** | `google-ads` |
| **URL** | `https://google-ads-koenig-solutions.aws-ap-south-1.turso.io` |
| **libsql URL** | `libsql://google-ads-koenig-solutions.aws-ap-south-1.turso.io` |
| **Region** | AWS ap-south-1 (Mumbai) |
| **Accounts** | Flexi (351-501-2934), Bouquet INR 2 (660-108-0005) |
| **Env vars** | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` |

### Bouquet INR Database

| Property | Value |
|----------|-------|
| **Name** | `bouquet-inr` |
| **URL** | `https://bouquet-inr-koenig-solutions.aws-ap-south-1.turso.io` |
| **libsql URL** | `libsql://bouquet-inr-koenig-solutions.aws-ap-south-1.turso.io` |
| **Region** | AWS ap-south-1 (Mumbai) |
| **Accounts** | Bouquet INR (615-303-8296) |
| **Env vars** | `TURSO_BOUQUET_INR_URL`, `TURSO_BOUQUET_INR_TOKEN` |

### Why Two Databases?

Bouquet INR is the largest account (3.5M keywords, 4.7 GB as SQLite). Keeping it separate prevents the main database from growing too large and keeps query performance reasonable. The keyword planner client (`turso-client.ts`) queries both databases in parallel and merges results transparently.

### Multi-Account Design

All tables include an `account_name` column (TEXT NOT NULL) to distinguish data from different Google Ads accounts within the same database. The main database contains rows where `account_name` is either `'Flexi'` or `'Bouquet INR 2'`. The Bouquet INR database contains rows where `account_name` is `'Bouquet INR'`.

---

## Account Summary

Data sourced from Google Ads Editor exports dated 2026-03-25.

### Flexi (351-501-2934) -- Main DB

| Metric | Count |
|--------|-------|
| Campaigns | 83 (25 enabled) |
| Ad Groups | 7,214 |
| Keywords | ~249,000 (194K positive, ~55K negative) |
| Ads | 12,000 |
| Campaign Types | Search, Performance Max |
| Budget Range | 10,000 - 120,000 INR/day |

**Top Enabled Campaigns (by budget):**

| Campaign | Ad Groups | Keywords | Budget (INR/day) |
|----------|-----------|----------|------------------|
| Saudi Arabia Popular Courses | 89 | 2,177 | 120,000 |
| United States - Popular Courses | 89 | 2,318 | 40,000 |
| Australia Popular Courses | 88 | 2,337 | 40,000 |
| Singapore Popular Courses | 89 | 2,198 | 25,000 |
| United Arab Emirates - Popular Courses | 89 | 2,173 | 30,000 |
| India Tier 1 Popular Courses | 89 | 2,197 | 15,000 |

### Bouquet INR 2 (660-108-0005) -- Main DB

| Metric | Count |
|--------|-------|
| Campaigns | 8 (all enabled) |
| Ad Groups | 82,110 |
| Keywords | 1,980,000 |
| Ads | 109,000 |
| Campaign Types | Search |
| Budget Range | 12,500 - 100,000 INR/day |

**All Campaigns (all enabled):**

| Campaign | Ad Groups | Keywords | Ads | Budget (INR/day) |
|----------|-----------|----------|-----|------------------|
| India | 10,972 | 279,126 | 15,314 | 100,000 |
| Tier 1 Cities - India | 11,005 | 278,702 | 15,112 | 50,000 |
| Tier 2 Cities - India | 11,007 | 287,424 | 15,034 | 50,000 |
| North Europe (NE) - Advanced | 9,613 | 221,248 | 12,380 | 50,000 |
| North Europe 2 - Advanced | 9,390 | 223,441 | 11,488 | 50,000 |
| South Africa | 10,544 | 225,865 | 6,691 | 30,000 |
| Rest of Middle East - Gulf | 10,060 | 238,822 | 12,687 | 30,000 |
| South & Central America - Advanced | 9,519 | 226,833 | 20,170 | 12,500 |

### Bouquet INR (615-303-8296) -- Bouquet INR DB

| Metric | Count |
|--------|-------|
| Campaigns | 67 (11 enabled) |
| Ad Groups | 152,000 |
| Keywords | 3,500,000 |
| Ads | 395,000 |
| Campaign Types | Search |
| Budget Range | 20,000 - 200,000 INR/day |

**Top Enabled Campaigns (by budget):**

| Campaign | Ad Groups | Keywords | Ads | Budget (INR/day) |
|----------|-----------|----------|-----|------------------|
| United States - Advanced (4EYES) | 11,035 | 266,796 | 36,592 | 200,000 |
| Saudi Arabia - Gulf | 11,080 | 261,718 | 31,006 | 120,000 |
| Australia - Microsoft Campaign | 11,798 | 297,180 | 33,268 | 100,000 |
| Canada - Advanced (4EYES) | 10,849 | 269,717 | 32,112 | 100,000 |
| Africa | 10,883 | 266,952 | 26,020 | 100,000 |
| United Kingdom - Advanced (4EYES) | 11,097 | 258,688 | 32,207 | 100,000 |
| Singapore - Asia | 11,275 | 285,783 | 27,786 | 50,000 |
| Germany - Advanced (4EYES) | 10,785 | 269,555 | 24,989 | 50,000 |
| United States-New York | 8,295 | 266,382 | 12,372 | 50,000 |
| Advance Asia | 11,369 | 259,752 | 24,885 | 30,000 |
| Cisco-PPC | 267 | 12,078 | 357 | 20,000 |

### Combined Totals

| Metric | Main DB | Bouquet INR DB | Total |
|--------|---------|----------------|-------|
| Campaigns | 91 | 67 | **158** |
| Ad Groups | 89,324 | 152,000 | **~241,000** |
| Keywords | 2,229,000 | 3,500,000 | **~5,730,000** |
| Ads | 121,000 | 395,000 | **~516,000** |

---

## Table Schema

All tables share the same schema across both databases. Every table includes `account_name TEXT NOT NULL` as the first data column (after the auto-increment `id`).

### campaigns

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Auto-increment primary key |
| account_name | TEXT NOT NULL | Account identifier: `'Flexi'`, `'Bouquet INR 2'`, or `'Bouquet INR'` |
| customer_id | TEXT | Google Ads customer ID (e.g., `'351-501-2934'`) |
| name | TEXT NOT NULL | Campaign name (e.g., `'Saudi Arabia Popular Courses'`) |
| type | TEXT | `Search`, `Performance Max`, `Display`, `Demand Gen` |
| status | TEXT | `Enabled`, `Paused`, `Ended` |
| budget | REAL | Daily budget amount (INR) |
| budget_type | TEXT | `Daily`, `Total` |
| bid_strategy_type | TEXT | `Maximize conversions`, `Target CPA`, `Manual CPC`, etc. |
| bid_strategy_name | TEXT | Named bid strategy (if using portfolio) |
| target_cpa | REAL | Target CPA if set |
| enhanced_cpc | TEXT | Whether enhanced CPC is enabled |
| maximum_cpc_bid_limit | REAL | Max CPC bid limit |
| networks | TEXT | Semicolon-separated: `'Google search;Search Partners'` |
| languages | TEXT | Semicolon-separated: `'en;de'` |
| start_date | TEXT | Campaign start date |
| end_date | TEXT | Campaign end date |
| labels | TEXT | Campaign labels |

**Unique constraint:** `(account_name, name)`

### ad_groups

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Auto-increment primary key |
| account_name | TEXT NOT NULL | Account identifier |
| campaign_name | TEXT NOT NULL | Parent campaign name |
| name | TEXT NOT NULL | Ad group name (e.g., `'CompTIA Server+'`) |
| type | TEXT | `Standard`, `Default` |
| status | TEXT | `Enabled`, `Paused` |
| max_cpc | REAL | Max CPC bid for this ad group |

**Unique constraint:** `(account_name, campaign_name, name)`

### keywords

The largest table across all databases (~5.7M rows total).

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Auto-increment primary key |
| account_name | TEXT NOT NULL | Account identifier |
| campaign_name | TEXT NOT NULL | Parent campaign name |
| ad_group_name | TEXT | Parent ad group name (empty for campaign/account negatives) |
| keyword | TEXT NOT NULL | Keyword text (e.g., `'azure certification training'`) |
| match_type | TEXT | `Broad`, `Phrase`, `Exact` |
| is_negative | INTEGER | `0` = positive keyword, `1` = negative keyword |
| level | TEXT | `ad_group`, `campaign`, `account` |
| status | TEXT | `Enabled`, `Paused` |
| quality_score | INTEGER | 1-10 quality score (NULL if no data) |
| landing_page_experience | TEXT | `Above average`, `Average`, `Below average` |
| expected_ctr | TEXT | `Above average`, `Average`, `Below average` |
| ad_relevance | TEXT | `Above average`, `Average`, `Below average` |
| first_page_bid | REAL | Estimated first page bid |
| top_of_page_bid | REAL | Estimated top of page bid |
| final_url | TEXT | Keyword-level final URL override |

**No unique constraint** (same keyword can appear in multiple ad groups/campaigns).

### ads

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Auto-increment primary key |
| account_name | TEXT NOT NULL | Account identifier |
| campaign_name | TEXT NOT NULL | Parent campaign name |
| ad_group_name | TEXT NOT NULL | Parent ad group name |
| ad_type | TEXT | `Responsive search ad`, `Responsive display ad`, etc. |
| status | TEXT | `Enabled`, `Paused` |
| approval_status | TEXT | `Approved`, `Under review`, `Disapproved` |
| ad_strength | TEXT | `Excellent`, `Good`, `Average`, `Poor`, `Pending` |
| final_url | TEXT | Landing page URL |
| path1 | TEXT | Display URL path 1 |
| path2 | TEXT | Display URL path 2 |
| headlines_json | TEXT | JSON array: `[{"text": "...", "position": 1}]` |
| descriptions_json | TEXT | JSON array: `[{"text": "...", "position": null}]` |

### locations

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Auto-increment primary key |
| account_name | TEXT NOT NULL | Account identifier |
| campaign_name | TEXT NOT NULL | Parent campaign name |
| location | TEXT | Location name (e.g., `'United States'`, `'Mumbai'`) |
| reach | TEXT | Estimated reach |
| bid_modifier | REAL | Location bid adjustment multiplier |

**Unique constraint:** `(account_name, campaign_name, location)`

### extensions

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Auto-increment primary key |
| account_name | TEXT NOT NULL | Account identifier |
| campaign_name | TEXT | Parent campaign (empty for account-level) |
| type | TEXT | `sitelink`, `callout`, `structured_snippet`, `phone_extension` |
| link_text | TEXT | Sitelink anchor text |
| callout_text | TEXT | Callout text |
| final_url | TEXT | Sitelink destination URL |
| status | TEXT | `Enabled`, `Paused` |

### sync_metadata

Tracks when each account was last synced from SQLite to Turso.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Auto-increment primary key |
| account_name | TEXT NOT NULL | Account identifier (unique) |
| synced_at | TEXT NOT NULL | ISO 8601 timestamp of last sync |
| campaigns_count | INTEGER | Number of campaigns synced |
| ad_groups_count | INTEGER | Number of ad groups synced |
| keywords_count | INTEGER | Number of keywords synced |
| ads_count | INTEGER | Number of ads synced |
| locations_count | INTEGER | Number of location targets synced |

**Unique constraint:** `(account_name)`

### Indexes

Both databases have the following indexes for query performance:

```
idx_campaigns_account        → campaigns(account_name)
idx_campaigns_status         → campaigns(account_name, status)
idx_ad_groups_account        → ad_groups(account_name)
idx_ad_groups_campaign       → ad_groups(account_name, campaign_name)
idx_ad_groups_name           → ad_groups(name)
idx_keywords_account         → keywords(account_name)
idx_keywords_keyword         → keywords(keyword)
idx_keywords_campaign        → keywords(account_name, campaign_name)
idx_keywords_ad_group        → keywords(account_name, campaign_name, ad_group_name)
idx_ads_account              → ads(account_name)
idx_ads_url                  → ads(final_url)
idx_ads_campaign             → ads(account_name, campaign_name)
idx_ads_ad_group             → ads(account_name, campaign_name, ad_group_name)
idx_locations_account        → locations(account_name)
idx_locations_campaign       → locations(account_name, campaign_name)
```

---

## Connection Examples

### 1. TypeScript / Node.js (@libsql/client)

This is how the keyword planner connects. See `src/lib/turso-client.ts`.

```typescript
import { createClient } from '@libsql/client'

// Main DB (Flexi + Bouquet INR 2)
const mainClient = createClient({
  url: 'https://google-ads-koenig-solutions.aws-ap-south-1.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN
})

// Bouquet INR DB
const bouquetClient = createClient({
  url: 'https://bouquet-inr-koenig-solutions.aws-ap-south-1.turso.io',
  authToken: process.env.TURSO_BOUQUET_INR_TOKEN
})

// Query example: find all enabled campaigns
const result = await mainClient.execute(
  "SELECT name, budget, status FROM campaigns WHERE status = 'Enabled' ORDER BY budget DESC"
)
console.log(result.rows)

// Parameterized query
const keywords = await mainClient.execute({
  sql: "SELECT keyword, match_type, quality_score FROM keywords WHERE campaign_name = ? AND is_negative = 0",
  args: ['Saudi Arabia Popular Courses']
})

// Batch queries (transactional)
await mainClient.batch([
  { sql: "SELECT COUNT(*) FROM campaigns WHERE account_name = ?", args: ['Flexi'] },
  { sql: "SELECT COUNT(*) FROM keywords WHERE account_name = ?", args: ['Flexi'] }
], 'read')
```

**Install:** `npm install @libsql/client`

### 2. Python (libsql-experimental)

```python
import libsql_experimental as libsql

# Connect to main DB
conn = libsql.connect(
    "google-ads-koenig-solutions.aws-ap-south-1.turso.io",
    auth_token="your-auth-token"
)

# Query enabled campaigns
cursor = conn.execute(
    "SELECT name, budget, bid_strategy_type FROM campaigns WHERE status = 'Enabled' AND account_name = ?",
    ["Flexi"]
)
for row in cursor.fetchall():
    print(f"{row[0]}: budget={row[1]}, strategy={row[2]}")

# Search keywords
cursor = conn.execute(
    "SELECT campaign_name, ad_group_name, keyword, quality_score FROM keywords WHERE keyword LIKE ? AND is_negative = 0",
    ["%azure%"]
)
print(f"Found {len(cursor.fetchall())} azure keywords")

conn.close()
```

**Install:** `pip install libsql-experimental`

### 3. HTTP API (curl)

Turso supports a JSON-over-HTTP protocol at the same URL.

```bash
# Get enabled campaigns from main DB
curl -s "https://google-ads-koenig-solutions.aws-ap-south-1.turso.io" \
  -H "Authorization: Bearer $TURSO_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      {
        "type": "execute",
        "stmt": {
          "sql": "SELECT name, budget, status FROM campaigns WHERE status = '\''Enabled'\'' AND account_name = '\''Flexi'\'' ORDER BY budget DESC"
        }
      },
      { "type": "close" }
    ]
  }' | jq '.results[0].response.result.rows'

# Parameterized query
curl -s "https://google-ads-koenig-solutions.aws-ap-south-1.turso.io" \
  -H "Authorization: Bearer $TURSO_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      {
        "type": "execute",
        "stmt": {
          "sql": "SELECT keyword, match_type FROM keywords WHERE LOWER(keyword) = ? AND is_negative = 0",
          "args": [{"type": "text", "value": "azure training"}]
        }
      },
      { "type": "close" }
    ]
  }' | jq '.results[0].response.result'
```

### 4. Turso CLI

```bash
# Install the CLI
brew install tursodatabase/tap/turso

# Connect interactively (uses your Turso login)
turso db shell google-ads

# Run a query directly
turso db shell google-ads "SELECT account_name, COUNT(*) FROM campaigns GROUP BY account_name"

# Connect to Bouquet INR DB
turso db shell bouquet-inr "SELECT COUNT(*) FROM keywords WHERE account_name = 'Bouquet INR'"

# Export to local SQLite
turso db shell google-ads .dump > google-ads-dump.sql
```

---

## API Endpoints

The keyword planner exposes a Turso lookup API at `/api/gads/turso-lookup`. All endpoints are GET requests.

### Account Summary

```
GET /api/gads/turso-lookup?summary=true
```

Returns sync status and row counts for all accounts across both databases.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "accountName": "Flexi",
      "customerId": "351-501-2934",
      "campaignsCount": 83,
      "enabledCampaigns": 25,
      "adGroupsCount": 7214,
      "keywordsCount": 249000,
      "adsCount": 12000,
      "syncedAt": "2026-03-25T14:30:00.000Z"
    },
    {
      "accountName": "Bouquet INR 2",
      "customerId": "660-108-0005",
      "campaignsCount": 8,
      "enabledCampaigns": 8,
      "adGroupsCount": 82110,
      "keywordsCount": 1980000,
      "adsCount": 109000,
      "syncedAt": "2026-03-25T15:00:00.000Z"
    },
    {
      "accountName": "Bouquet INR",
      "customerId": "615-303-8296",
      "campaignsCount": 67,
      "enabledCampaigns": 11,
      "adGroupsCount": 152000,
      "keywordsCount": 3500000,
      "adsCount": 395000,
      "syncedAt": "2026-03-25T16:00:00.000Z"
    }
  ]
}
```

### URL Lookup

```
GET /api/gads/turso-lookup?url=<course_url>
GET /api/gads/turso-lookup?url=<course_url>&account=<account_name>
```

Finds all campaigns and ad groups that advertise a given URL. Searches the `ads` table, then enriches results with campaign status, ad group status, and geo targets from the `locations` table.

**Example:**
```
GET /api/gads/turso-lookup?url=https://www.koenig-solutions.com/comptia-training-certification-courses
```

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://www.koenig-solutions.com/comptia-training-certification-courses",
    "totalMatches": 12,
    "accounts": {
      "Flexi": {
        "campaigns": [
          {
            "name": "Saudi Arabia Popular Courses",
            "status": "Enabled",
            "locations": ["Saudi Arabia"],
            "adGroups": [
              { "name": "CompTIA Certification", "status": "Enabled", "adStrength": "Good" }
            ]
          }
        ]
      },
      "Bouquet INR 2": {
        "campaigns": [
          {
            "name": "India",
            "status": "Enabled",
            "locations": ["India"],
            "adGroups": [
              { "name": "CompTIA Certification", "status": "Enabled", "adStrength": "Average" }
            ]
          }
        ]
      }
    }
  }
}
```

URL matching is case-insensitive. The URL is normalized (protocol, `www.`, trailing slash, and query parameters stripped) before searching with `LIKE`.

### Keyword Lookup

```
GET /api/gads/turso-lookup?keyword=<keyword>
GET /api/gads/turso-lookup?keyword=<keyword>&account=<account_name>
```

Searches for an exact keyword match (case-insensitive) across all accounts. Only returns positive keywords (`is_negative = 0`).

**Example:**
```
GET /api/gads/turso-lookup?keyword=azure%20certification%20training
```

**Response:**
```json
{
  "success": true,
  "data": {
    "keyword": "azure certification training",
    "totalMatches": 6,
    "accounts": {
      "Flexi": {
        "matches": [
          {
            "campaign": "Saudi Arabia Popular Courses",
            "adGroup": "Microsoft Azure",
            "matchType": "Broad",
            "status": "Enabled",
            "qualityScore": 7
          }
        ]
      },
      "Bouquet INR": {
        "matches": [
          {
            "campaign": "United States - Advanced (4EYES)",
            "adGroup": "Microsoft Azure",
            "matchType": "Phrase",
            "status": "Enabled",
            "qualityScore": null
          }
        ]
      }
    }
  }
}
```

### Filtering by Account

Add `&account=<name>` to any URL or keyword lookup to restrict results to a single account:

```
GET /api/gads/turso-lookup?url=koenig-solutions.com/azure&account=Flexi
GET /api/gads/turso-lookup?keyword=aws training&account=Bouquet INR 2
```

Valid account names: `Flexi`, `Bouquet INR 2`, `Bouquet INR`

---

## Common Queries

All queries below work on both Turso databases. Remember to include `account_name` filters for targeted results.

### Campaign Queries

```sql
-- All enabled campaigns with budgets (all accounts)
SELECT account_name, name, type, budget, bid_strategy_type
FROM campaigns
WHERE status = 'Enabled'
ORDER BY budget DESC;

-- Campaigns for a specific account
SELECT name, budget, bid_strategy_type, networks
FROM campaigns
WHERE account_name = 'Flexi' AND status = 'Enabled'
ORDER BY budget DESC;

-- Campaign budget summary by account
SELECT account_name, status,
       COUNT(*) as campaigns,
       SUM(budget) as total_budget,
       AVG(budget) as avg_budget
FROM campaigns
GROUP BY account_name, status
ORDER BY total_budget DESC;

-- Campaign stats with entity counts
SELECT
    c.name,
    c.type,
    c.status,
    c.budget,
    (SELECT COUNT(*) FROM ad_groups ag WHERE ag.account_name = c.account_name AND ag.campaign_name = c.name) as ad_groups,
    (SELECT COUNT(*) FROM keywords k WHERE k.account_name = c.account_name AND k.campaign_name = c.name AND k.is_negative = 0) as keywords,
    (SELECT COUNT(*) FROM ads a WHERE a.account_name = c.account_name AND a.campaign_name = c.name) as ads
FROM campaigns c
WHERE c.account_name = 'Flexi' AND c.status = 'Enabled'
ORDER BY c.budget DESC;
```

### Keyword Queries

```sql
-- Keywords for a specific ad group
SELECT keyword, match_type, quality_score, status
FROM keywords
WHERE account_name = 'Flexi'
  AND campaign_name = 'Saudi Arabia Popular Courses'
  AND ad_group_name = 'CompTIA Certification'
  AND is_negative = 0
ORDER BY keyword;

-- Search keywords by text (across all accounts in a database)
SELECT account_name, campaign_name, ad_group_name, keyword, match_type, quality_score
FROM keywords
WHERE keyword LIKE '%azure%' AND is_negative = 0
ORDER BY quality_score DESC
LIMIT 100;

-- Keyword search across all accounts (exact match, case-insensitive)
SELECT account_name, campaign_name, ad_group_name, keyword, match_type, status, quality_score
FROM keywords
WHERE LOWER(keyword) = 'azure certification training' AND is_negative = 0
ORDER BY account_name, campaign_name;

-- Quality score distribution for an account
SELECT quality_score, COUNT(*) as count
FROM keywords
WHERE account_name = 'Flexi'
  AND quality_score IS NOT NULL
  AND is_negative = 0
GROUP BY quality_score
ORDER BY quality_score;

-- Keywords with quality score below threshold
SELECT campaign_name, ad_group_name, keyword, match_type, quality_score,
       landing_page_experience, expected_ctr, ad_relevance
FROM keywords
WHERE account_name = 'Flexi'
  AND quality_score IS NOT NULL
  AND quality_score <= 3
  AND is_negative = 0
ORDER BY quality_score ASC
LIMIT 50;

-- Match type distribution
SELECT account_name, match_type, COUNT(*) as count
FROM keywords
WHERE is_negative = 0
GROUP BY account_name, match_type
ORDER BY account_name, count DESC;

-- Negative keywords by level
SELECT account_name, level, COUNT(*) as count
FROM keywords
WHERE is_negative = 1
GROUP BY account_name, level;
```

### URL Queries

```sql
-- URL reverse lookup: find all campaigns/ad groups for a URL
SELECT a.account_name, a.campaign_name, a.ad_group_name, a.final_url, a.ad_strength,
       c.status as campaign_status
FROM ads a
LEFT JOIN campaigns c ON c.account_name = a.account_name AND c.name = a.campaign_name
WHERE LOWER(a.final_url) LIKE '%koenig-solutions.com/comptia%'
ORDER BY a.account_name, a.campaign_name;

-- URL reverse lookup including sitelinks
SELECT 'ad' as source, account_name, campaign_name, ad_group_name, final_url
FROM ads WHERE LOWER(final_url) LIKE '%comptia%'
UNION ALL
SELECT 'sitelink', account_name, campaign_name, '', final_url
FROM extensions WHERE type = 'sitelink' AND LOWER(final_url) LIKE '%comptia%';

-- Unique URLs in use (with count of ads using each)
SELECT DISTINCT final_url, COUNT(*) as ad_count
FROM ads
WHERE account_name = 'Flexi' AND final_url != '' AND status = 'Enabled'
GROUP BY final_url
ORDER BY ad_count DESC;
```

### Ad Queries

```sql
-- Ad strength distribution for an account
SELECT ad_strength, COUNT(*) as count
FROM ads
WHERE account_name = 'Flexi' AND ad_strength IS NOT NULL
GROUP BY ad_strength
ORDER BY
  CASE ad_strength
    WHEN 'Excellent' THEN 1
    WHEN 'Good' THEN 2
    WHEN 'Average' THEN 3
    WHEN 'Poor' THEN 4
    WHEN 'Pending' THEN 5
  END;

-- Ads with headlines for a specific ad group
SELECT campaign_name, ad_group_name, final_url, ad_strength, headlines_json, descriptions_json
FROM ads
WHERE account_name = 'Flexi'
  AND campaign_name = 'Saudi Arabia Popular Courses'
  AND ad_group_name = 'CompTIA Certification'
  AND status = 'Enabled';

-- Ad strength distribution across all accounts
SELECT account_name, ad_strength, COUNT(*) as count
FROM ads
WHERE ad_strength IS NOT NULL
GROUP BY account_name, ad_strength
ORDER BY account_name,
  CASE ad_strength
    WHEN 'Excellent' THEN 1
    WHEN 'Good' THEN 2
    WHEN 'Average' THEN 3
    WHEN 'Poor' THEN 4
    WHEN 'Pending' THEN 5
  END;
```

### Ad Group Queries

```sql
-- Find an ad group by name across all campaigns
SELECT account_name, campaign_name, name, status, max_cpc
FROM ad_groups
WHERE name LIKE '%CompTIA%'
ORDER BY account_name, campaign_name;

-- Ad groups for a campaign
SELECT name, status, max_cpc
FROM ad_groups
WHERE account_name = 'Flexi' AND campaign_name = 'Saudi Arabia Popular Courses'
ORDER BY name;
```

### Location / Geo Target Queries

```sql
-- Campaign geo targets
SELECT campaign_name, location, bid_modifier
FROM locations
WHERE account_name = 'Flexi'
ORDER BY campaign_name, location;

-- Which campaigns target a specific location
SELECT l.campaign_name, l.location, l.bid_modifier, c.status, c.budget
FROM locations l
JOIN campaigns c ON c.account_name = l.account_name AND c.name = l.campaign_name
WHERE l.account_name = 'Flexi' AND l.location LIKE '%United States%'
ORDER BY c.budget DESC;

-- All unique locations targeted
SELECT DISTINCT location, COUNT(*) as campaign_count
FROM locations
WHERE account_name = 'Flexi'
GROUP BY location
ORDER BY campaign_count DESC;
```

### Cross-Account Queries

These queries work within a single database. To query across both databases, run the query on each client and merge results (as `turso-client.ts` does).

```sql
-- Account overview (run on each database)
SELECT
  account_name,
  (SELECT COUNT(*) FROM campaigns WHERE account_name = sm.account_name) as campaigns,
  (SELECT COUNT(*) FROM campaigns WHERE account_name = sm.account_name AND status = 'Enabled') as enabled,
  (SELECT COUNT(*) FROM ad_groups WHERE account_name = sm.account_name) as ad_groups,
  (SELECT COUNT(*) FROM keywords WHERE account_name = sm.account_name AND is_negative = 0) as keywords,
  (SELECT COUNT(*) FROM ads WHERE account_name = sm.account_name) as ads,
  sm.synced_at
FROM sync_metadata sm;

-- Find keyword across all accounts in this database
SELECT account_name, campaign_name, ad_group_name, keyword, match_type, quality_score
FROM keywords
WHERE LOWER(keyword) = 'aws training' AND is_negative = 0;

-- URL lookup across all accounts in this database
SELECT DISTINCT account_name, campaign_name, ad_group_name, final_url
FROM ads
WHERE LOWER(final_url) LIKE '%koenig-solutions.com/aws%';
```

---

## Sync Process

Data flows from Google Ads Editor exports through a pipeline:

```
Google Ads Editor → CSV/TSV Export → parser.py (Python) → SQLite → sync-to-turso.ts → Turso
```

### Step 1: Export from Google Ads Editor

Export all account data from Google Ads Editor as CSV (or UTF-16 TSV). Files are typically 184 MB (Flexi) to 4.5 GB (Bouquet INR).

### Step 2: Parse to SQLite

```bash
cd /Users/vardaanaggarwal/Desktop/Claude/Koenig\ Marketing\ skills/ads_editor_export
python parser.py /path/to/export.csv
```

This produces SQLite databases at:
- `output/flexi/flexi.db` (237 MB)
- `output/bouquet-inr-2/bouquet-inr-2.db` (2.5 GB)
- `output/bouquet-inr/bouquet-inr.db` (4.7 GB)

### Step 3: Sync to Turso

The sync script reads from local SQLite databases and pushes all rows to Turso in batches of 2,000.

```bash
cd /Users/vardaanaggarwal/Downloads/Claude\ code/keyword-planner

# Sync all 3 accounts
npx tsx scripts/sync-to-turso.ts

# Sync a single account
npx tsx scripts/sync-to-turso.ts --account flexi
npx tsx scripts/sync-to-turso.ts --account "bouquet inr 2"
npx tsx scripts/sync-to-turso.ts --account "bouquet inr"

# Create tables only (no data sync)
npx tsx scripts/sync-to-turso.ts --create-tables
```

**Source file:** `scripts/sync-to-turso.ts`

### Sync Behavior

1. **Creates tables and indexes** if they do not exist (on both databases)
2. **Deletes all existing rows** for the account being synced (`DELETE FROM <table> WHERE account_name = ?`)
3. **Inserts all rows** from the SQLite source in batches of 2,000
4. **Keywords use streaming** (`LIMIT/OFFSET`) to avoid loading millions of rows into memory at once
5. **Records sync metadata** (timestamp and row counts) in `sync_metadata`
6. **Prints verification** showing row counts per account per table

### Account-to-Database Mapping

| Account | SQLite Source | Turso Database |
|---------|-------------|----------------|
| Flexi | `output/flexi/flexi.db` | main (`google-ads`) |
| Bouquet INR 2 | `output/bouquet-inr-2/bouquet-inr-2.db` | main (`google-ads`) |
| Bouquet INR | `output/bouquet-inr/bouquet-inr.db` | bouquet-inr |

### Sync Duration

Approximate sync times depend on network and Turso load:
- Flexi: ~2-5 minutes (249K total rows)
- Bouquet INR 2: ~15-30 minutes (2.2M total rows)
- Bouquet INR: ~30-60 minutes (4.1M total rows)

---

## External Access

### Creating Read-Only Tokens

Use the Turso CLI to generate tokens with restricted permissions:

```bash
# Login to Turso
turso auth login

# Create a read-only token for the main DB (expires in 7 days)
turso db tokens create google-ads --expiration 7d --read-only

# Create a read-only token for the Bouquet INR DB
turso db tokens create bouquet-inr --expiration 7d --read-only

# Create a non-expiring read-only token
turso db tokens create google-ads --read-only
```

### Connecting from External Services

Any service that supports `@libsql/client` (Node.js), `libsql-experimental` (Python), or HTTP can connect using the database URL and an auth token.

**Vercel / Serverless:**
```
TURSO_DATABASE_URL=https://google-ads-koenig-solutions.aws-ap-south-1.turso.io
TURSO_AUTH_TOKEN=<your-token>
TURSO_BOUQUET_INR_URL=https://bouquet-inr-koenig-solutions.aws-ap-south-1.turso.io
TURSO_BOUQUET_INR_TOKEN=<your-token>
```

**Cloudflare Workers:**
```typescript
import { createClient } from '@libsql/client/web'

const client = createClient({
  url: 'https://google-ads-koenig-solutions.aws-ap-south-1.turso.io',
  authToken: env.TURSO_AUTH_TOKEN
})
```

**Note:** Use `@libsql/client/web` for edge runtimes (Cloudflare Workers, Vercel Edge Functions). Use `@libsql/client` for Node.js runtimes.

### Embedded Replicas (Local Cache)

For latency-sensitive applications, Turso supports embedded replicas that sync automatically:

```typescript
import { createClient } from '@libsql/client'

const client = createClient({
  url: 'file:local-replica.db',
  syncUrl: 'https://google-ads-koenig-solutions.aws-ap-south-1.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN,
  syncInterval: 60 // sync every 60 seconds
})
```

This creates a local SQLite file that mirrors the remote Turso database, giving sub-millisecond read latency.

---

## Environment Variables

Add these to `.env.local` in the keyword planner project:

```bash
# Main Turso DB (Flexi + Bouquet INR 2)
TURSO_DATABASE_URL=libsql://google-ads-koenig-solutions.aws-ap-south-1.turso.io
TURSO_AUTH_TOKEN=<your-auth-token>

# Bouquet INR Turso DB
TURSO_BOUQUET_INR_URL=libsql://bouquet-inr-koenig-solutions.aws-ap-south-1.turso.io
TURSO_BOUQUET_INR_TOKEN=<your-auth-token>
```

The `turso-client.ts` module gracefully handles missing configuration -- if either database is not configured, it is simply skipped and queries return results from whichever databases are available.

---

## Troubleshooting

### "Turso not configured" error

The API returns this when `TURSO_DATABASE_URL` or `TURSO_AUTH_TOKEN` is not set. Check your `.env.local` file.

### Connection timeout

Turso databases in `aws-ap-south-1` have optimal latency from India. From other regions, consider using embedded replicas or expect 100-300ms round-trip times.

### Query too slow

The `keywords` table has ~5.7M rows total. Always include filters:
- Use `account_name = ?` to restrict to one account
- Use `campaign_name = ?` for campaign-scoped queries
- Use `LIMIT` for exploratory queries
- Prefer exact match (`LOWER(keyword) = ?`) over `LIKE '%...%'` for keyword lookups

### Token expired

Turso tokens can be set to expire. Generate a new one:
```bash
turso db tokens create google-ads
```

### Data out of date

Check `sync_metadata` for the last sync time:
```sql
SELECT account_name, synced_at FROM sync_metadata;
```

Re-sync by running the sync script:
```bash
npx tsx scripts/sync-to-turso.ts --account flexi
```

### Row count mismatch

The sync process uses `INSERT OR IGNORE` for keywords and ads (no unique constraint), so some rows may be deduplicated. Compare with the source SQLite counts:
```bash
sqlite3 /path/to/flexi.db "SELECT COUNT(*) FROM keywords"
```

---

## Key Files

| File | Path | Purpose |
|------|------|---------|
| Turso Client | `src/lib/turso-client.ts` | Connection management, URL/keyword lookup, account summaries |
| API Route | `src/app/api/gads/turso-lookup/route.ts` | HTTP API for URL/keyword/summary lookups |
| Sync Script | `scripts/sync-to-turso.ts` | Syncs SQLite databases to Turso |
| SQLite Parser | `ads_editor_export/parser.py` | Parses Google Ads Editor CSV exports to SQLite |
| Query Helpers | `ads_editor_export/query_helpers.py` | Python API for querying local SQLite databases |

All file paths are relative to the keyword planner project root (`/Users/vardaanaggarwal/Downloads/Claude code/keyword-planner/`) except for the parser and query helpers which live in the ads_editor_export project (`/Users/vardaanaggarwal/Desktop/Claude/Koenig Marketing skills/ads_editor_export/`).
