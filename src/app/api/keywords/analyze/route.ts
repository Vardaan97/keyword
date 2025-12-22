import { NextRequest, NextResponse } from 'next/server'
import { aiClient, AIProvider } from '@/lib/ai-client'
import { fillPromptVariables } from '@/lib/prompts'
import { KeywordIdea, AnalyzedKeyword, ApiResponse } from '@/types'

interface AnalyzeRequest {
  prompt: string
  courseName: string
  certificationCode?: string
  vendor?: string
  relatedTerms?: string
  keywords: KeywordIdea[]
  aiProvider?: AIProvider
}

interface AnalysisResponse {
  analyzedKeywords: AnalyzedKeyword[]
  summary: {
    totalAnalyzed: number
    toAdd: number
    toReview: number
    excluded: number
    urgentCount: number
    highPriorityCount: number
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<AnalysisResponse>>> {
  try {
    const body: AnalyzeRequest = await request.json()
    const { prompt, courseName, certificationCode, vendor, relatedTerms, keywords, aiProvider } = body

    console.log('[ANALYZE] Request received')
    console.log('[ANALYZE] Course:', courseName)
    console.log('[ANALYZE] Keywords count:', keywords?.length)
    console.log('[ANALYZE] AI Provider:', aiProvider || 'default')

    if (!prompt || !courseName || !keywords || keywords.length === 0) {
      console.log('[ANALYZE] Error: Missing required fields')
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: prompt, courseName, keywords'
      }, { status: 400 })
    }

    // Format keywords data for the prompt
    const keywordsData = keywords.map(kw =>
      `${kw.keyword},${kw.avgMonthlySearches},${kw.competition},${kw.competitionIndex}`
    ).join('\n')

    const keywordsHeader = 'Keyword,Avg Monthly Searches,Competition,Competition Index'
    const formattedKeywords = `${keywordsHeader}\n${keywordsData}`

    // Fill in the prompt variables
    const filledPrompt = fillPromptVariables(prompt, {
      COURSE_NAME: courseName,
      CERTIFICATION_CODE: certificationCode || 'N/A',
      VENDOR: vendor || 'Not specified',
      RELATED_TERMS: relatedTerms || courseName,
      KEYWORDS_DATA: formattedKeywords
    })

    // Process keywords in batches to avoid response truncation
    // Gemini Flash and GPT-4o can handle larger batches (100 keywords)
    // This reduces 996 keywords from 20 batches to 10 batches
    const BATCH_SIZE = 100
    const keywordBatches: KeywordIdea[][] = []
    for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
      keywordBatches.push(keywords.slice(i, i + BATCH_SIZE))
    }

    console.log('[ANALYZE] Processing', keywords.length, 'keywords in', keywordBatches.length, 'batches')

    const allAnalyzedKeywords: AnalyzedKeyword[] = []

    // Process batches in parallel (3 at a time for speed while avoiding rate limits)
    const PARALLEL_BATCHES = 3

    const processBatch = async (batch: KeywordIdea[], batchIndex: number): Promise<AnalyzedKeyword[]> => {
      console.log('[ANALYZE] Processing batch', batchIndex + 1, 'of', keywordBatches.length, '(', batch.length, 'keywords)')

      const batchKeywordsData = batch.map(kw =>
        `${kw.keyword},${kw.avgMonthlySearches},${kw.competition},${kw.competitionIndex}`
      ).join('\n')
      const batchKeywordsHeader = 'Keyword,Avg Monthly Searches,Competition,Competition Index'
      const batchFormattedKeywords = `${batchKeywordsHeader}\n${batchKeywordsData}`

      const batchFilledPrompt = fillPromptVariables(prompt, {
        COURSE_NAME: courseName,
        CERTIFICATION_CODE: certificationCode || 'N/A',
        VENDOR: vendor || 'Not specified',
        RELATED_TERMS: relatedTerms || courseName,
        KEYWORDS_DATA: batchFormattedKeywords
      })

      try {
        const result = await aiClient.chatCompletionWithFallback(
          {
            messages: [
              {
                role: 'system',
                content: `You are a Google Ads keyword strategist for Koenig Solutions, analyzing keywords for IT training courses.

Output your analysis as a valid JSON object with this exact structure:
{
  "analyzedKeywords": [...]
}

Each keyword in analyzedKeywords should have these fields:
- keyword (string)
- avgMonthlySearches (number)
- competition ("LOW" | "MEDIUM" | "HIGH" | "UNSPECIFIED")
- competitionIndex (number 0-100)
- courseRelevance (number 0-10)
- relevanceStatus (string: EXACT_MATCH, DIRECT_RELATED, STRONGLY_RELATED, RELATED, LOOSELY_RELATED, TANGENTIAL, WEAK_CONNECTION, DIFFERENT_PRODUCT, DIFFERENT_VENDOR, NOT_RELEVANT)
- conversionPotential (number 0-10)
- searchIntent (number 0-10)
- vendorSpecificity (number 0-10)
- keywordSpecificity (number 0-10)
- actionWordStrength (number 0-10)
- commercialSignals (number 0-10)
- negativeSignals (number 0-10)
- koenigFit (number 0-10)
- baseScore (number 0-100)
- competitionBonus (number: 10 for Low, 5 for Medium, 0 for High)
- finalScore (number 0-100)
- tier ("Tier 1" | "Tier 2" | "Tier 3" | "Tier 4" | "Review" | "Exclude")
- matchType ("[EXACT]" | "PHRASE" | "BROAD" | "N/A")
- action ("ADD" | "BOOST" | "MONITOR" | "OPTIMIZE" | "REVIEW" | "EXCLUDE" | "EXCLUDE_RELEVANCE")
- exclusionReason (string, only if excluded)
- priority (string with emoji: "🔴 URGENT" | "🟠 HIGH" | "🟡 MEDIUM" | "⚪ STANDARD" | "🔵 REVIEW", only for ADD action)

IMPORTANT: Return ONLY the JSON object, no markdown formatting or code blocks. Analyze ALL ${batch.length} keywords provided.`
              },
              {
                role: 'user',
                content: batchFilledPrompt
              }
            ],
            temperature: 0.3,
            maxTokens: 16000,
            jsonMode: true
          },
          { provider: aiProvider }
        )

        const responseText = result.content
        console.log('[ANALYZE] Batch', batchIndex + 1, 'response from', result.provider, '(', result.model, ')')
        console.log('[ANALYZE] Batch', batchIndex + 1, 'response length:', responseText.length, 'chars')
        console.log('[ANALYZE] Batch', batchIndex + 1, 'tokens used:', result.tokensUsed)

        const batchResult = JSON.parse(responseText)
        console.log('[ANALYZE] Batch', batchIndex + 1, 'parsed successfully,', batchResult.analyzedKeywords?.length || 0, 'keywords')

        if (batchResult.analyzedKeywords && Array.isArray(batchResult.analyzedKeywords)) {
          return batchResult.analyzedKeywords.map((analyzed: Partial<AnalyzedKeyword>) => {
            const original = batch.find(k =>
              k.keyword.toLowerCase() === analyzed.keyword?.toLowerCase()
            )
            return {
              keyword: analyzed.keyword || '',
              avgMonthlySearches: original?.avgMonthlySearches || analyzed.avgMonthlySearches || 0,
              competition: original?.competition || analyzed.competition || 'UNSPECIFIED',
              competitionIndex: original?.competitionIndex || analyzed.competitionIndex || 0,
              lowTopOfPageBidMicros: original?.lowTopOfPageBidMicros,
              highTopOfPageBidMicros: original?.highTopOfPageBidMicros,
              courseRelevance: analyzed.courseRelevance || 0,
              relevanceStatus: analyzed.relevanceStatus || 'NOT_RELEVANT',
              conversionPotential: analyzed.conversionPotential || 0,
              searchIntent: analyzed.searchIntent || 0,
              vendorSpecificity: analyzed.vendorSpecificity || 0,
              keywordSpecificity: analyzed.keywordSpecificity || 0,
              actionWordStrength: analyzed.actionWordStrength || 0,
              commercialSignals: analyzed.commercialSignals || 0,
              negativeSignals: analyzed.negativeSignals || 10,
              koenigFit: analyzed.koenigFit || 0,
              baseScore: analyzed.baseScore || 0,
              competitionBonus: analyzed.competitionBonus || 0,
              finalScore: analyzed.finalScore || 0,
              tier: analyzed.tier || 'Exclude',
              matchType: analyzed.matchType || 'N/A',
              action: analyzed.action || 'EXCLUDE',
              exclusionReason: analyzed.exclusionReason,
              priority: analyzed.priority
            } as AnalyzedKeyword
          })
        }
        return []
      } catch (parseError) {
        console.error('[ANALYZE] Batch', batchIndex + 1, 'error:', parseError)
        return []
      }
    }

    // Process batches in parallel chunks
    for (let i = 0; i < keywordBatches.length; i += PARALLEL_BATCHES) {
      const batchChunk = keywordBatches.slice(i, i + PARALLEL_BATCHES)
      const results = await Promise.all(
        batchChunk.map((batch, idx) => processBatch(batch, i + idx))
      )
      results.forEach(result => allAnalyzedKeywords.push(...result))
      console.log('[ANALYZE] Completed parallel chunk', Math.floor(i / PARALLEL_BATCHES) + 1)
    }

    // If no keywords were analyzed, return error
    if (allAnalyzedKeywords.length === 0) {
      console.error('[ANALYZE] No keywords were analyzed successfully')
      return NextResponse.json({
        success: false,
        error: 'Failed to analyze any keywords'
      }, { status: 500 })
    }

    console.log('[ANALYZE] Total analyzed:', allAnalyzedKeywords.length, 'keywords')

    // Calculate summary from all analyzed keywords
    const summary = {
      totalAnalyzed: allAnalyzedKeywords.length,
      toAdd: allAnalyzedKeywords.filter(k => k.action === 'ADD').length,
      toReview: allAnalyzedKeywords.filter(k => k.action === 'REVIEW').length,
      excluded: allAnalyzedKeywords.filter(k => k.action === 'EXCLUDE' || k.action === 'EXCLUDE_RELEVANCE').length,
      urgentCount: allAnalyzedKeywords.filter(k => k.priority === '🔴 URGENT').length,
      highPriorityCount: allAnalyzedKeywords.filter(k => k.priority === '🟠 HIGH').length
    }

    console.log(`Analyzed ${allAnalyzedKeywords.length} keywords in ${keywordBatches.length} batch(es)`)

    return NextResponse.json({
      success: true,
      data: {
        analyzedKeywords: allAnalyzedKeywords,
        summary
      }
    })

  } catch (error) {
    console.error('Error analyzing keywords:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze keywords'
    }, { status: 500 })
  }
}
