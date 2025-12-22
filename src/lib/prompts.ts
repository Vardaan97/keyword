import { PromptConfig } from '@/types'

export const DEFAULT_SEED_PROMPT: PromptConfig = {
  id: 'seed-generator',
  name: 'Seed Keyword Generator',
  description: 'Generates 10 high-intent seed keywords from course name and URL for Google Keyword Planner',
  prompt: `I will give you the exact official course name and (if relevant) the main technology or vendor.
Generate exactly 10 high-intent seed keyword combinations that I can paste into Google Ads Keyword Planner → "Discover new keywords → Start with keywords".

Rules:

Prioritize important words from the course name (exam code, technology name, role, and "course / training / certification").

Output only a simple numbered list (1–10), one keyword phrase per line, no extra text.

Include:

pure tech term (e.g., "javascript", "power bi")

tech + course (e.g., "javascript course", "power bi course")

exam code alone (if present, e.g., "pl 300")

exam code + course/training (e.g., "pl 300 course", "pl 300 training")

role + tech + course (e.g., "power bi data analyst course")

one long-tail version close to the full official title.

Avoid duplicates, synonyms that are too close, or very generic stuff like just "course" or "training".

Course name: "{{COURSE_NAME}}"
Main tech/vendor (if applicable): "{{VENDOR}}"
Course URL for context: {{COURSE_URL}}`,
  variables: ['COURSE_NAME', 'VENDOR', 'COURSE_URL'],
  lastUpdated: new Date().toISOString()
}

export const DEFAULT_ANALYSIS_PROMPT: PromptConfig = {
  id: 'keyword-analyzer',
  name: 'Keyword Analysis & Rating',
  description: 'Analyzes keywords from Keyword Planner and provides actionable recommendations',
  prompt: `You are a Google Ads keyword strategist for Koenig Solutions, a B2B IT training company.

Analyze the following keywords for the course: "{{COURSE_NAME}}"
Certification Code: {{CERTIFICATION_CODE}}
Primary Vendor: {{VENDOR}}
Related Terms: {{RELATED_TERMS}}

SCORING CRITERIA (0-10 each):
1. Course Relevance: How directly related to the specified course
2. Conversion Potential: Likelihood of leading to enrollment
3. Search Intent: Transactional (10) vs Informational (0)
4. Vendor Specificity: Contains cert code (10) vs generic (0)
5. Keyword Specificity: Long-tail (10) vs single word (0)
6. Action Word Strength: certification/training/bootcamp (10) vs none (0)
7. Commercial Signals: best/official/authorized (10) vs none (0)
8. Negative Signals (inverse): Clean (10) vs contains negatives (0)
9. Koenig Authority Fit: Matches Koenig's strengths (10) vs poor fit (0)

EXCLUSION RULES:
- Exclude keywords containing: free, salary, jobs, dumps, youtube, udemy, coursera, simplilearn
- Exclude different vendor keywords (e.g., AWS keywords for Microsoft course)
- Exclude different product keywords (e.g., Azure for Power BI course)

For each keyword, provide:
- All 9 scores (0-10)
- Base Score (sum of scores)
- Competition Bonus (+10 Low, +5 Medium, 0 High)
- Final Score (Base + Bonus, max 100)
- Tier (1-4 based on score)
- Match Type ([EXACT], PHRASE, BROAD)
- Action (ADD/REVIEW/EXCLUDE)
- Priority for new keywords (🔴 URGENT, 🟠 HIGH, 🟡 MEDIUM, ⚪ STANDARD, 🔵 REVIEW)

KEYWORDS TO ANALYZE:
{{KEYWORDS_DATA}}

Output as JSON array with this structure:
{
  "analyzedKeywords": [
    {
      "keyword": "...",
      "avgMonthlySearches": number,
      "competition": "LOW|MEDIUM|HIGH",
      "competitionIndex": number,
      "courseRelevance": number,
      "relevanceStatus": "EXACT_MATCH|DIRECT_RELATED|RELATED|TANGENTIAL|DIFFERENT_PRODUCT|DIFFERENT_VENDOR|NOT_RELEVANT",
      "conversionPotential": number,
      "searchIntent": number,
      "vendorSpecificity": number,
      "keywordSpecificity": number,
      "actionWordStrength": number,
      "commercialSignals": number,
      "negativeSignals": number,
      "koenigFit": number,
      "baseScore": number,
      "competitionBonus": number,
      "finalScore": number,
      "tier": "Tier 1|Tier 2|Tier 3|Tier 4|Review|Exclude",
      "matchType": "[EXACT]|PHRASE|BROAD|N/A",
      "action": "ADD|REVIEW|EXCLUDE|EXCLUDE_RELEVANCE",
      "exclusionReason": "..." (only if excluded),
      "priority": "🔴 URGENT|🟠 HIGH|🟡 MEDIUM|⚪ STANDARD|🔵 REVIEW" (only for ADD action)
    }
  ],
  "summary": {
    "totalAnalyzed": number,
    "toAdd": number,
    "toReview": number,
    "excluded": number,
    "urgentCount": number,
    "highPriorityCount": number
  }
}`,
  variables: ['COURSE_NAME', 'CERTIFICATION_CODE', 'VENDOR', 'RELATED_TERMS', 'KEYWORDS_DATA'],
  lastUpdated: new Date().toISOString()
}

export function fillPromptVariables(
  prompt: string,
  variables: Record<string, string>
): string {
  let filledPrompt = prompt
  for (const [key, value] of Object.entries(variables)) {
    filledPrompt = filledPrompt.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }
  return filledPrompt
}
