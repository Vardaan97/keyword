# LinkedIn API Reference Guide

> **Last Updated:** January 16, 2026
> **API Version:** 202511
> **App:** Koenig Solutions (Client ID: 86kapwwuhm6jbe)

---

## Table of Contents

1. [Overview & Authentication](#1-overview--authentication)
2. [Your Current Access](#2-your-current-access)
3. [Share on LinkedIn API](#3-share-on-linkedin-api)
4. [Advertising API](#4-advertising-api)
5. [LinkedIn Ad Library API](#5-linkedin-ad-library-api)
6. [Verified on LinkedIn API](#6-verified-on-linkedin-api)
7. [Events Management API](#7-events-management-api)
8. [Lead Sync API](#8-lead-sync-api)
9. [OpenID Connect (Sign In)](#9-openid-connect-sign-in)
10. [Rate Limits](#10-rate-limits)
11. [API Tiers Explained](#11-api-tiers-explained)

---

## 1. Overview & Authentication

### Base URLs
```
REST API:    https://api.linkedin.com/rest/
Legacy API:  https://api.linkedin.com/v2/
```

### Required Headers (All Requests)
```http
Authorization: Bearer {ACCESS_TOKEN}
Linkedin-Version: 202511
X-Restli-Protocol-Version: 2.0.0
Content-Type: application/json
```

### OAuth 2.0 Authentication
- **3-legged OAuth**: Requires user consent (most APIs)
- **2-legged OAuth**: Application-only (limited APIs)
- **Token Lifetime**: 60 days (access), 1 year (refresh)

### Authorization URL
```
https://www.linkedin.com/oauth/v2/authorization
  ?response_type=code
  &client_id={CLIENT_ID}
  &redirect_uri={CALLBACK_URL}
  &scope={SCOPES}
  &state={CSRF_TOKEN}
```

---

## 2. Your Current Access

### Products Enabled (as of Jan 16, 2026)

| Product | Tier | Status | Scopes Granted |
|---------|------|--------|----------------|
| Sign In with LinkedIn using OpenID Connect | Standard | Active | `openid`, `profile`, `email` |
| Share on LinkedIn | Default | Active | `w_member_social` |
| Advertising API | Development | Active | `r_ads`, `rw_ads` |
| LinkedIn Ad Library | Default | Active | Search public ad data |
| Verified on LinkedIn | Development | Active | `r_verify` |
| Events Management API | Standard | Active | `r_events`, `rw_events` |

### Products Available to Request
- Conversions API (Standard Tier)
- Lead Sync API (requires review)

---

## 3. Share on LinkedIn API

**Scope Required:** `w_member_social`

### Endpoints

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Create Post | POST | `/rest/posts` |
| Get Post | GET | `/rest/posts/{postUrn}` |
| Delete Post | DELETE | `/rest/posts/{postUrn}` |
| Initialize Image Upload | POST | `/rest/images?action=initializeUpload` |
| Initialize Video Upload | POST | `/rest/videos?action=initializeUpload` |
| Initialize Document Upload | POST | `/rest/documents?action=initializeUpload` |

### Supported Content Types

| Type | Organic Posts | Max Size/Duration |
|------|---------------|-------------------|
| Text Only | Yes | 3000 characters |
| Images | Yes | 36M pixels, JPG/PNG/GIF |
| Videos | Yes | 3s-30min, 500MB, MP4 |
| Documents | Yes | 100MB, 300 pages, PDF/PPT/DOC |
| Articles (URLs) | Yes | External link with thumbnail |
| Multi-Image | Yes | Multiple images |
| Polls | Yes | Voting options |

### Rate Limits
- **Member**: 150 posts/day
- **Application**: 100,000 requests/day

### Example: Text Post
```bash
curl -X POST 'https://api.linkedin.com/rest/posts' \
  -H 'Authorization: Bearer {TOKEN}' \
  -H 'Linkedin-Version: 202511' \
  -H 'X-Restli-Protocol-Version: 2.0.0' \
  -H 'Content-Type: application/json' \
  -d '{
    "author": "urn:li:person:{USER_ID}",
    "commentary": "Hello from the API!",
    "visibility": "PUBLIC",
    "distribution": {
      "feedDistribution": "MAIN_FEED",
      "targetEntities": [],
      "thirdPartyDistributionChannels": []
    },
    "lifecycleState": "PUBLISHED",
    "isReshareDisabledByAuthor": false
  }'
```

### Example: Image Post
```bash
# Step 1: Initialize upload
curl -X POST 'https://api.linkedin.com/rest/images?action=initializeUpload' \
  -H 'Authorization: Bearer {TOKEN}' \
  -H 'Linkedin-Version: 202511' \
  -H 'X-Restli-Protocol-Version: 2.0.0' \
  -H 'Content-Type: application/json' \
  -d '{"initializeUploadRequest": {"owner": "urn:li:person:{USER_ID}"}}'

# Step 2: Upload to returned uploadUrl
curl --upload-file ./image.jpg "{uploadUrl}"

# Step 3: Create post with image URN
curl -X POST 'https://api.linkedin.com/rest/posts' \
  -H 'Authorization: Bearer {TOKEN}' \
  -H 'Linkedin-Version: 202511' \
  -H 'X-Restli-Protocol-Version: 2.0.0' \
  -H 'Content-Type: application/json' \
  -d '{
    "author": "urn:li:person:{USER_ID}",
    "commentary": "Check out this image!",
    "visibility": "PUBLIC",
    "distribution": {"feedDistribution": "MAIN_FEED"},
    "content": {
      "media": {
        "id": "urn:li:image:{IMAGE_ID}",
        "altText": "Image description"
      }
    },
    "lifecycleState": "PUBLISHED"
  }'
```

---

## 4. Advertising API

**Scopes Required:** `r_ads` (read), `rw_ads` (read/write)

### Development Tier Limitations
- **Read**: Unlimited ad accounts
- **Create**: 1 test ad account only
- **Edit**: Up to 5 ad accounts

### Endpoints

| Resource | Method | Endpoint |
|----------|--------|----------|
| **Ad Accounts** | | |
| List Accounts | GET | `/rest/adAccounts?q=search&search=(...)` |
| Get Account | GET | `/rest/adAccounts/{id}` |
| Create Account | POST | `/rest/adAccounts` |
| **Campaign Groups** | | |
| List Groups | GET | `/rest/adAccounts/{id}/adCampaignGroups?q=search` |
| Get Group | GET | `/rest/adAccounts/{id}/adCampaignGroups/{groupId}` |
| Create Group | POST | `/rest/adAccounts/{id}/adCampaignGroups` |
| **Campaigns** | | |
| List Campaigns | GET | `/rest/adAccounts/{id}/adCampaigns?q=search` |
| Get Campaign | GET | `/rest/adAccounts/{id}/adCampaigns/{campaignId}` |
| Create Campaign | POST | `/rest/adAccounts/{id}/adCampaigns` |
| **Creatives** | | |
| List Creatives | GET | `/rest/adAccounts/{id}/creatives?q=criteria` |
| Get Creative | GET | `/rest/adAccounts/{id}/creatives/{creativeId}` |
| Create Creative | POST | `/rest/adAccounts/{id}/creatives` |
| **Analytics** | | |
| Get Analytics | GET | `/rest/adAnalytics?q=analytics&pivot={PIVOT}&...` |
| Get Statistics | GET | `/rest/adAnalytics?q=statistics&pivots=List(...)` |

### Example: List Ad Accounts
```bash
curl -X GET 'https://api.linkedin.com/rest/adAccounts?q=search&search=(type:(values:List(BUSINESS)))&count=10' \
  -H 'Authorization: Bearer {TOKEN}' \
  -H 'Linkedin-Version: 202511' \
  -H 'X-Restli-Protocol-Version: 2.0.0'
```

### Example: Get Campaign Analytics
```bash
curl -X GET 'https://api.linkedin.com/rest/adAnalytics?q=analytics&pivot=CAMPAIGN&dateRange=(start:(year:2026,month:1,day:1))&timeGranularity=DAILY&accounts=List(urn%3Ali%3AsponsoredAccount%3A123456)&fields=impressions,clicks,costInUsd' \
  -H 'Authorization: Bearer {TOKEN}' \
  -H 'Linkedin-Version: 202511' \
  -H 'X-Restli-Protocol-Version: 2.0.0'
```

### Resource Limits

| Resource | Limit |
|----------|-------|
| Campaigns per Account | 5,000 |
| Active Campaigns | 1,000 concurrent |
| Creatives per Account | 15,000 |
| Creatives per Campaign | 100 |
| Minimum Audience Size | 300 members |

---

## 5. LinkedIn Ad Library API

**Note:** LinkedIn does NOT provide a direct API for the public Ad Library. The Ad Library website (linkedin.com/ad-library) is for manual browsing only.

### What's Available

1. **Advertising API** - Manage YOUR OWN campaigns (see Section 4)
2. **Ad Library Website** - Browse all public ads manually
3. **Third-party scrapers** - Services like SearchAPI.io, ScrapeCreators

### Ad Library Website Search
```
https://www.linkedin.com/ad-library/search
  ?q={keyword}
  &advertiserName={company}
  &sortBy=START_TIME
```

### Data Available in Ad Library
- Ad preview (text, images, videos)
- Advertiser name
- First/last impression dates
- Targeting parameters
- Total impression count
- Country breakdown

---

## 6. Verified on LinkedIn API

**Scope Required:** `r_verify`

### What It Does
Retrieve LinkedIn members' verification status (identity verification via government ID, workplace verification via company email).

### Endpoints

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Get User Info | GET | `/rest/identityMe` |
| Get Verification Status | GET | `/rest/verificationReport` |

### Development Tier Limitations
- Only app administrators can test
- Cannot access production member data
- Basic verification categories only (no detailed metadata)

### Example: Get Verification Report
```bash
curl -X GET 'https://api.linkedin.com/rest/verificationReport?verificationCriteria=IDENTITY&verificationCriteria=WORKPLACE' \
  -H 'Authorization: Bearer {TOKEN}' \
  -H 'Linkedin-Version: 202510' \
  -H 'X-Restli-Protocol-Version: 2.0.0'
```

### Response
```json
{
  "id": "abc123",
  "verifications": ["IDENTITY", "WORKPLACE"],
  "verificationUrl": "https://www.linkedin.com/..."
}
```

### Verification Categories

| Category | Description | Method |
|----------|-------------|--------|
| IDENTITY | Real identity confirmed | Government ID |
| WORKPLACE | Company association confirmed | Work email, Microsoft Entra |

---

## 7. Events Management API

**Scopes Required:** `r_events` (read), `rw_events` (read/write)

### Endpoints

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Create Event | POST | `/rest/events` |
| Get Event | GET | `/rest/events/{eventId}` |
| Update Event | PATCH | `/rest/events/{eventId}` |
| List Events by Org | GET | `/rest/events?q=eventsByOrganizer&organizer={URN}` |
| Delete Event | DELETE | `/rest/posts/{postUrn}` (via Posts API) |

### Event Types Supported
- **Live Video** - LinkedIn Live streaming
- **Live Audio** - LinkedIn Audio Events
- **External** - Third-party webinar with URL
- **In-Person** - Physical location events

### Example: Create External Event
```bash
curl -X POST 'https://api.linkedin.com/rest/events' \
  -H 'Authorization: Bearer {TOKEN}' \
  -H 'Linkedin-Version: 202511' \
  -H 'X-Restli-Protocol-Version: 2.0.0' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": {
      "localized": {
        "en_US": "Product Launch Webinar"
      }
    },
    "type": {
      "online": {
        "format": {
          "external": {
            "endsAt": 1735689600000,
            "url": "https://example.com/webinar"
          }
        }
      }
    },
    "organizer": "urn:li:organization:12345678",
    "startsAt": 1735603200000
  }'
```

### Example: List Organization Events
```bash
curl -X GET 'https://api.linkedin.com/rest/events?q=eventsByOrganizer&organizer=urn%3Ali%3Aorganization%3A12345678&excludeCancelled=true&count=10' \
  -H 'Authorization: Bearer {TOKEN}' \
  -H 'Linkedin-Version: 202511' \
  -H 'X-Restli-Protocol-Version: 2.0.0'
```

---

## 8. Lead Sync API

**Scope Required:** `r_marketing_leadgen_automation`

**Status:** Pending approval for your app

### Endpoints (once approved)

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List Lead Forms | GET | `/rest/leadForms?q=owner&owner={URN}` |
| Get Form | GET | `/rest/leadForms/{formId}` |
| Get Leads | GET | `/rest/leadFormResponses?q=owner&owner={URN}&leadType={TYPE}` |
| Create Webhook | POST | `/rest/leadNotifications` |

### Lead Types
- `SPONSORED` - Ad campaign leads
- `EVENT` - Event registration leads
- `COMPANY` - Company page leads
- `ORGANIZATION_PRODUCT` - Product page leads

### Example: Get Leads
```bash
curl -X GET 'https://api.linkedin.com/rest/leadFormResponses?q=owner&owner=urn%3Ali%3AsponsoredAccount%3A123456&leadType=SPONSORED&count=100' \
  -H 'Authorization: Bearer {TOKEN}' \
  -H 'Linkedin-Version: 202511' \
  -H 'X-Restli-Protocol-Version: 2.0.0'
```

---

## 9. OpenID Connect (Sign In)

**Scopes:** `openid`, `profile`, `email`

### Endpoint
```
GET https://api.linkedin.com/v2/userinfo
```

### Example
```bash
curl -X GET 'https://api.linkedin.com/v2/userinfo' \
  -H 'Authorization: Bearer {TOKEN}'
```

### Response
```json
{
  "sub": "tKTfAcKsEC",
  "name": "Vardaan Aggarwal",
  "given_name": "Vardaan",
  "family_name": "Aggarwal",
  "picture": "https://media.licdn.com/...",
  "email": "vardaan.aggarwal@koenig-solutions.com",
  "email_verified": true,
  "locale": "en-US"
}
```

---

## 10. Rate Limits

### General Structure
- Limits reset at **midnight UTC daily**
- Two types: **Application-level** and **Member-level**
- HTTP `429` returned when exceeded
- Email alerts at 75% quota

### Known Limits

| API | Member Limit | App Limit |
|-----|--------------|-----------|
| Share on LinkedIn | 150/day | 100,000/day |
| Verified on LinkedIn | 500/day | 5,000/day |
| Analytics API | - | 45M metric values/5min |

### Best Practices
1. Check limits via Developer Portal > Analytics tab
2. Implement exponential backoff for 429 responses
3. Cache responses where possible
4. Batch requests when available

---

## 11. API Tiers Explained

### Development Tier
- **Purpose**: Testing and prototyping
- **Access**: App administrators only
- **Limits**: Restricted (e.g., edit 5 ad accounts)
- **Cost**: Free

### Standard Tier
- **Purpose**: Production use
- **Access**: All LinkedIn members
- **Limits**: Higher/negotiated
- **Cost**: Free (after approval)

### Plus/Enterprise Tier
- **Purpose**: Large-scale integrations
- **Access**: All members + additional data
- **Limits**: Custom
- **Cost**: Contact sales

### Upgrading Tiers
1. Go to LinkedIn Developer Portal
2. Select your app > Products tab
3. Click "Request upgrade" on desired product
4. Submit support ticket with video demo (for some products)

---

## Quick Reference: All Scopes

| Scope | Description | Product |
|-------|-------------|---------|
| `openid` | OpenID Connect ID | Sign In with LinkedIn |
| `profile` | Basic profile info | Sign In with LinkedIn |
| `email` | Email address | Sign In with LinkedIn |
| `w_member_social` | Post on LinkedIn | Share on LinkedIn |
| `r_ads` | Read ad accounts | Advertising API |
| `rw_ads` | Read/write ads | Advertising API |
| `r_events` | Read events | Events Management API |
| `rw_events` | Read/write events | Events Management API |
| `r_verify` | Verification status | Verified on LinkedIn |
| `r_marketing_leadgen_automation` | Lead sync | Lead Sync API |

---

## Local API Endpoints (This App)

| Endpoint | Description |
|----------|-------------|
| `GET /api/auth/linkedin` | Start OAuth flow |
| `GET /api/auth/linkedin/callback` | OAuth callback |
| `GET /api/auth/linkedin/status` | Token status |
| `GET /api/linkedin/accounts` | Discover accounts |
| `GET /api/linkedin/test-scopes` | Test available scopes |
| `GET /api/linkedin/forms?accountUrn={URN}` | List lead forms |
| `GET /api/linkedin/leads?accountUrn={URN}&leadType={TYPE}` | Get leads |

---

## Resources

- [LinkedIn Marketing API Docs](https://learn.microsoft.com/en-us/linkedin/marketing/)
- [LinkedIn Consumer API Docs](https://learn.microsoft.com/en-us/linkedin/consumer/)
- [LinkedIn Developer Portal](https://developer.linkedin.com/)
- [API Rate Limits](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits)
- [OAuth 2.0 Guide](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
