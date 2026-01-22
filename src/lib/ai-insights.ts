/**
 * AI Insights Generation Library
 * Uses OpenRouter/OpenAI to generate marketing insights from Google Ads + LinkedIn data
 */

import { aiClient, OPENROUTER_MODELS } from './ai-client'

// Types for insight generation
export interface MarketingDataContext {
  // Google Ads data
  googleAds?: {
    totalCampaigns: number
    totalAdGroups: number
    totalSpend: number
    impressions: number
    clicks: number
    conversions: number
    averageCpc: number
    averageCtr: number
    topCampaigns?: Array<{
      name: string
      spend: number
      conversions: number
      roas: number
    }>
    bottomCampaigns?: Array<{
      name: string
      spend: number
      conversions: number
      roas: number
    }>
  }

  // LinkedIn Ads data
  linkedIn?: {
    totalCampaigns: number
    totalSpend: number
    impressions: number
    clicks: number
    leads: number
    averageCpl: number
    averageCtr: number
    topCampaigns?: Array<{
      name: string
      spend: number
      leads: number
    }>
  }

  // Algorithm execution data
  algorithmExecutions?: Array<{
    algorithmId: string
    algorithmName: string
    executionCount: number
    lastExecuted: number
    commonActions: string[]
  }>

  // Business context
  businessContext?: {
    companyName: string
    industry: string
    courseCount: number
    targetCountries: string[]
  }
}

export interface GeneratedInsight {
  type: 'opportunity' | 'risk' | 'recommendation' | 'anomaly'
  platform: 'google_ads' | 'linkedin' | 'cross_platform' | 'algorithms'
  title: string
  description: string
  priority: number // 1-5, 5 being highest
  relatedEntities: Array<{
    type: string
    id: string
    name: string
  }>
  actionItems?: string[]
  metrics?: Record<string, number | string>
}

export interface InsightGenerationResult {
  insights: GeneratedInsight[]
  summary: string
  generatedAt: number
  model: string
  tokensUsed?: number
}

// System prompt for insight generation
const INSIGHT_SYSTEM_PROMPT = `You are an expert digital marketing analyst for Koenig Solutions, a leading IT training company and Microsoft Partner of the Year 2025. You analyze marketing data across Google Ads and LinkedIn Ads to generate actionable insights.

Koenig Solutions context:
- 729+ IT training courses (Microsoft, AWS, Cisco, Oracle, Google Cloud, etc.)
- Global presence: India, USA, UK, UAE, Singapore, Australia, Canada, Germany, Malaysia, Saudi Arabia
- Primary conversion metric: SC (Scheduled Confirmations)
- ROI-focused with strict automation rules for pause/resume based on performance

When generating insights:
1. Focus on ACTIONABLE recommendations, not just observations
2. Quantify impact whenever possible (e.g., "could save ₹50K/month")
3. Consider the IT training industry context (long sales cycles, high-value conversions)
4. Flag any anomalies or concerning patterns
5. Suggest cross-platform optimizations (Google Ads ↔ LinkedIn synergies)
6. Reference specific campaigns or ad groups when relevant

Output format: Return ONLY valid JSON matching this structure:
{
  "insights": [
    {
      "type": "opportunity|risk|recommendation|anomaly",
      "platform": "google_ads|linkedin|cross_platform|algorithms",
      "title": "Short, action-oriented title",
      "description": "2-3 sentence explanation with specific data",
      "priority": 1-5,
      "relatedEntities": [{"type": "campaign|ad_group|algorithm", "id": "...", "name": "..."}],
      "actionItems": ["Specific action 1", "Action 2"],
      "metrics": {"key": "value"}
    }
  ],
  "summary": "2-3 sentence executive summary of the most important findings"
}`

// Generate insights from marketing data
export async function generateMarketingInsights(
  data: MarketingDataContext
): Promise<InsightGenerationResult> {
  const userPrompt = buildInsightPrompt(data)

  try {
    const result = await aiClient.chatCompletionWithFallback({
      messages: [
        { role: 'system', content: INSIGHT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      maxTokens: 4000,
      jsonMode: true,
      model: OPENROUTER_MODELS.gpt4o_mini // Most reliable for JSON
    })

    // Parse the response
    const parsed = JSON.parse(result.content)

    // Validate and normalize insights
    const insights = (parsed.insights || []).map(normalizeInsight)

    return {
      insights,
      summary: parsed.summary || 'Analysis complete.',
      generatedAt: Date.now(),
      model: result.model,
      tokensUsed: result.tokensUsed
    }
  } catch (error) {
    console.error('[AI-INSIGHTS] Generation failed:', error)

    // Return fallback insights based on data
    return generateFallbackInsights(data)
  }
}

// Build the prompt with marketing data context
function buildInsightPrompt(data: MarketingDataContext): string {
  const sections: string[] = []

  // Business context
  if (data.businessContext) {
    sections.push(`
## Business Context
- Company: ${data.businessContext.companyName}
- Industry: ${data.businessContext.industry}
- Total Courses: ${data.businessContext.courseCount}
- Target Countries: ${data.businessContext.targetCountries.join(', ')}
`)
  }

  // Google Ads data
  if (data.googleAds) {
    const gads = data.googleAds
    sections.push(`
## Google Ads Performance
- Total Campaigns: ${gads.totalCampaigns.toLocaleString()}
- Total Ad Groups: ${gads.totalAdGroups.toLocaleString()}
- Total Spend: ₹${gads.totalSpend.toLocaleString()}
- Impressions: ${gads.impressions.toLocaleString()}
- Clicks: ${gads.clicks.toLocaleString()}
- Conversions: ${gads.conversions.toLocaleString()}
- Average CPC: ₹${gads.averageCpc.toFixed(2)}
- Average CTR: ${(gads.averageCtr * 100).toFixed(2)}%

${gads.topCampaigns?.length ? `### Top Performing Campaigns
${gads.topCampaigns.map(c => `- ${c.name}: ₹${c.spend.toLocaleString()} spend, ${c.conversions} conversions, ${c.roas.toFixed(2)}x ROAS`).join('\n')}` : ''}

${gads.bottomCampaigns?.length ? `### Underperforming Campaigns
${gads.bottomCampaigns.map(c => `- ${c.name}: ₹${c.spend.toLocaleString()} spend, ${c.conversions} conversions, ${c.roas.toFixed(2)}x ROAS`).join('\n')}` : ''}
`)
  }

  // LinkedIn Ads data
  if (data.linkedIn) {
    const li = data.linkedIn
    sections.push(`
## LinkedIn Ads Performance
- Total Campaigns: ${li.totalCampaigns}
- Total Spend: ₹${li.totalSpend.toLocaleString()}
- Impressions: ${li.impressions.toLocaleString()}
- Clicks: ${li.clicks.toLocaleString()}
- Leads: ${li.leads}
- Average CPL: ₹${li.averageCpl.toFixed(2)}
- Average CTR: ${(li.averageCtr * 100).toFixed(2)}%

${li.topCampaigns?.length ? `### Top Campaigns
${li.topCampaigns.map(c => `- ${c.name}: ₹${c.spend.toLocaleString()} spend, ${c.leads} leads`).join('\n')}` : ''}
`)
  }

  // Algorithm execution data
  if (data.algorithmExecutions?.length) {
    sections.push(`
## PPC Algorithm Executions (Last 7 Days)
${data.algorithmExecutions.map(a => `
### ${a.algorithmName}
- Executions: ${a.executionCount}
- Last Run: ${new Date(a.lastExecuted).toLocaleDateString()}
- Common Actions: ${a.commonActions.join(', ')}
`).join('\n')}
`)
  }

  return `Analyze the following marketing data and generate 5-8 actionable insights:

${sections.join('\n')}

Focus on:
1. Budget optimization opportunities (where to reduce/increase spend)
2. Performance anomalies or concerning trends
3. Cross-platform optimization (Google Ads ↔ LinkedIn synergies)
4. Algorithm adjustment recommendations
5. Course/campaign pausing or scaling recommendations

Generate insights as JSON.`
}

// Normalize insight to ensure consistent structure
function normalizeInsight(raw: Partial<GeneratedInsight>): GeneratedInsight {
  return {
    type: raw.type || 'recommendation',
    platform: raw.platform || 'cross_platform',
    title: raw.title || 'Untitled Insight',
    description: raw.description || '',
    priority: Math.min(5, Math.max(1, raw.priority || 3)),
    relatedEntities: raw.relatedEntities || [],
    actionItems: raw.actionItems,
    metrics: raw.metrics
  }
}

// Generate fallback insights when AI fails
function generateFallbackInsights(data: MarketingDataContext): InsightGenerationResult {
  const insights: GeneratedInsight[] = []

  // Generate basic insights from available data
  if (data.googleAds) {
    const gads = data.googleAds

    // CTR insight
    if (gads.averageCtr < 0.02) {
      insights.push({
        type: 'risk',
        platform: 'google_ads',
        title: 'Low Click-Through Rate Detected',
        description: `Your average CTR of ${(gads.averageCtr * 100).toFixed(2)}% is below industry benchmark. Consider reviewing ad copy and targeting.`,
        priority: 4,
        relatedEntities: [],
        actionItems: ['Review ad copy relevance', 'Refine audience targeting', 'Test new ad variations']
      })
    }

    // Conversion insight
    if (gads.conversions > 0 && gads.totalSpend > 0) {
      const cpa = gads.totalSpend / gads.conversions
      if (cpa > 5000) {
        insights.push({
          type: 'opportunity',
          platform: 'google_ads',
          title: 'High CPA - Optimization Opportunity',
          description: `Current CPA of ₹${cpa.toFixed(0)} may be optimized. Review top spending campaigns for efficiency.`,
          priority: 4,
          relatedEntities: [],
          actionItems: ['Review pause/resume algorithm thresholds', 'Analyze conversion paths'],
          metrics: { currentCPA: `₹${cpa.toFixed(0)}` }
        })
      }
    }
  }

  if (data.linkedIn && data.linkedIn.leads > 0) {
    insights.push({
      type: 'opportunity',
      platform: 'cross_platform',
      title: 'Cross-Platform Lead Nurturing',
      description: `LinkedIn generated ${data.linkedIn.leads} leads. Consider remarketing these leads via Google Ads for higher conversion.`,
      priority: 3,
      relatedEntities: [],
      actionItems: ['Export LinkedIn leads', 'Create Google Ads remarketing audience']
    })
  }

  // Default recommendation
  if (insights.length === 0) {
    insights.push({
      type: 'recommendation',
      platform: 'cross_platform',
      title: 'Data Review Recommended',
      description: 'Connect more data sources to generate actionable insights. Ensure Google Ads and LinkedIn APIs are configured.',
      priority: 2,
      relatedEntities: [],
      actionItems: ['Verify API connections', 'Import campaign data']
    })
  }

  return {
    insights,
    summary: 'Basic insights generated from available data. Connect additional data sources for deeper analysis.',
    generatedAt: Date.now(),
    model: 'fallback'
  }
}

// Generate daily digest summary
export async function generateDailyDigest(
  data: MarketingDataContext,
  previousDigest?: string
): Promise<string> {
  const prompt = `Generate a brief daily digest (3-5 bullet points) summarizing the key marketing metrics and changes.

${previousDigest ? `Previous digest for context:\n${previousDigest}\n` : ''}

Current data:
${JSON.stringify(data, null, 2)}

Format: Return plain text with bullet points. Focus on:
- Significant changes from previous period
- Top performers and underperformers
- Any anomalies or alerts
- Recommended actions for today`

  try {
    const result = await aiClient.chatCompletionWithFallback({
      messages: [
        { role: 'system', content: 'You are a concise marketing analyst providing daily summaries.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5,
      maxTokens: 500,
      model: OPENROUTER_MODELS.gpt4o_mini
    })

    return result.content
  } catch (error) {
    console.error('[AI-INSIGHTS] Daily digest failed:', error)
    return 'Daily digest generation failed. Please check API configuration.'
  }
}

// Analyze specific campaign for recommendations
export async function analyzeCampaignPerformance(
  campaignData: {
    name: string
    platform: 'google_ads' | 'linkedin'
    spend: number
    impressions: number
    clicks: number
    conversions: number
    ctr: number
    cpc: number
    cpa: number
  }
): Promise<GeneratedInsight[]> {
  const prompt = `Analyze this campaign and provide 2-3 specific recommendations:

Campaign: ${campaignData.name}
Platform: ${campaignData.platform}
Spend: ₹${campaignData.spend.toLocaleString()}
Impressions: ${campaignData.impressions.toLocaleString()}
Clicks: ${campaignData.clicks.toLocaleString()}
Conversions: ${campaignData.conversions}
CTR: ${(campaignData.ctr * 100).toFixed(2)}%
CPC: ₹${campaignData.cpc.toFixed(2)}
CPA: ₹${campaignData.cpa.toFixed(2)}

Return JSON array of insights.`

  try {
    const result = await aiClient.chatCompletionWithFallback({
      messages: [
        { role: 'system', content: INSIGHT_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      maxTokens: 1500,
      jsonMode: true,
      model: OPENROUTER_MODELS.gpt4o_mini
    })

    const parsed = JSON.parse(result.content)
    return (parsed.insights || parsed || []).map(normalizeInsight)
  } catch (error) {
    console.error('[AI-INSIGHTS] Campaign analysis failed:', error)
    return []
  }
}

// Export utility for creating insight-ready data from raw API responses
export function prepareMarketingData(
  googleAdsData?: {
    campaigns: unknown[]
    adGroups: unknown[]
    performance: {
      spend?: number
      impressions?: number
      clicks?: number
      conversions?: number
    }
  },
  linkedInData?: {
    campaigns: unknown[]
    analytics: {
      spend?: number
      impressions?: number
      clicks?: number
      leads?: number
    }
  }
): MarketingDataContext {
  const context: MarketingDataContext = {
    businessContext: {
      companyName: 'Koenig Solutions',
      industry: 'IT Training & Certification',
      courseCount: 729,
      targetCountries: ['India', 'USA', 'UK', 'UAE', 'Singapore', 'Australia', 'Canada', 'Germany', 'Malaysia', 'Saudi Arabia']
    }
  }

  if (googleAdsData) {
    const perf = googleAdsData.performance
    const clicks = perf.clicks || 0
    const impressions = perf.impressions || 0

    context.googleAds = {
      totalCampaigns: googleAdsData.campaigns.length,
      totalAdGroups: googleAdsData.adGroups.length,
      totalSpend: perf.spend || 0,
      impressions: impressions,
      clicks: clicks,
      conversions: perf.conversions || 0,
      averageCpc: clicks > 0 ? (perf.spend || 0) / clicks : 0,
      averageCtr: impressions > 0 ? clicks / impressions : 0
    }
  }

  if (linkedInData) {
    const analytics = linkedInData.analytics
    const clicks = analytics.clicks || 0
    const impressions = analytics.impressions || 0
    const leads = analytics.leads || 0
    const spend = analytics.spend || 0

    context.linkedIn = {
      totalCampaigns: linkedInData.campaigns.length,
      totalSpend: spend,
      impressions: impressions,
      clicks: clicks,
      leads: leads,
      averageCpl: leads > 0 ? spend / leads : 0,
      averageCtr: impressions > 0 ? clicks / impressions : 0
    }
  }

  return context
}
