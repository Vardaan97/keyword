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

// Process ALL keywords in a single batch - using large context models via OpenRouter
// Claude Sonnet 4: 200K context, 64K output tokens
// Gemini Pro: 1M context, 65K output tokens
// Process all at once for faster turnaround
const MAX_KEYWORDS_PER_BATCH = 1000 // Effectively unlimited

/**
 * Extract complete JSON objects from a potentially truncated array
 * This is the most reliable way to handle AI responses that get cut off
 */
function extractCompleteObjects(jsonString: string): object[] {
  const objects: object[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString[i]

    // Handle string escaping
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && inString) {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    // Track object depth
    if (char === '{') {
      if (depth === 0) start = i
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        const objStr = jsonString.substring(start, i + 1)
        try {
          const obj = JSON.parse(objStr)
          // Validate it's a keyword object with required fields
          if (obj.keyword && typeof obj.keyword === 'string') {
            objects.push(obj)
          }
        } catch {
          // Skip malformed objects
        }
        start = -1
      }
    }
  }

  return objects
}

/**
 * Attempt to repair malformed JSON from AI responses
 * Handles common issues like truncated arrays, missing brackets, trailing commas
 */
function repairJson(jsonString: string): string {
  let repaired = jsonString.trim()

  // Remove any markdown code blocks
  repaired = repaired.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '')
  repaired = repaired.replace(/```\s*$/i, '')

  // First try: simple fixes
  // Fix trailing commas before closing brackets
  repaired = repaired.replace(/,(\s*[\]}])/g, '$1')

  // Try to parse as-is first
  try {
    JSON.parse(repaired)
    return repaired
  } catch {
    // Continue with repair
  }

  // Second try: Extract complete objects from the analyzedKeywords array
  const arrayMatch = repaired.match(/"analyzedKeywords"\s*:\s*\[/i)
  if (arrayMatch) {
    const arrayStartIndex = repaired.indexOf('[', arrayMatch.index)
    const arrayContent = repaired.substring(arrayStartIndex + 1)
    const completeObjects = extractCompleteObjects(arrayContent)

    if (completeObjects.length > 0) {
      console.log(`[JSON_REPAIR] Extracted ${completeObjects.length} complete keyword objects`)
      return JSON.stringify({ analyzedKeywords: completeObjects })
    }
  }

  // Third try: look for any array of objects
  const anyArrayMatch = repaired.match(/\[\s*\{/)
  if (anyArrayMatch) {
    const arrayContent = repaired.substring(anyArrayMatch.index! + 1)
    const completeObjects = extractCompleteObjects(arrayContent)

    if (completeObjects.length > 0) {
      console.log(`[JSON_REPAIR] Extracted ${completeObjects.length} objects from array`)
      return JSON.stringify({ analyzedKeywords: completeObjects })
    }
  }

  return repaired
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<AnalysisResponse>>> {
  const startTime = Date.now()

  try {
    const body: AnalyzeRequest = await request.json()
    const { prompt, courseName, certificationCode, vendor, relatedTerms, keywords, aiProvider } = body

    console.log('[ANALYZE] ========================================')
    console.log('[ANALYZE] Request received')
    console.log('[ANALYZE] Course:', courseName)
    console.log('[ANALYZE] Keywords count:', keywords?.length)
    console.log('[ANALYZE] AI Provider:', aiProvider || 'default')
    console.log('[ANALYZE] ========================================')

    if (!prompt || !courseName || !keywords || keywords.length === 0) {
      console.log('[ANALYZE] Error: Missing required fields')
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: prompt, courseName, keywords'
      }, { status: 400 })
    }

    // Process function for a batch of keywords
    const processBatch = async (batchKeywords: KeywordIdea[], batchIndex: number, totalBatches: number): Promise<AnalyzedKeyword[]> => {
      const MAX_RETRIES = 2

      // Format keywords data for the prompt
      const keywordsData = batchKeywords.map(kw =>
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

      const attemptAnalysis = async (retryCount = 0): Promise<AnalyzedKeyword[]> => {
        const batchLabel = totalBatches > 1 ? `[Batch ${batchIndex + 1}/${totalBatches}]` : ''
        console.log(`[ANALYZE] ${batchLabel} Sending ${batchKeywords.length} keywords to AI...`, retryCount > 0 ? `[Retry ${retryCount}]` : '')

        try {
          const result = await aiClient.chatCompletionWithFallback(
            {
              messages: [
                {
                  role: 'system',
                  content: `You are a keyword analysis expert. Follow the user's instructions exactly.

CRITICAL OUTPUT REQUIREMENTS:
1. Return ONLY valid JSON - no markdown, no code blocks, no explanations before or after
2. Analyze ALL ${batchKeywords.length} keywords provided - do not skip any
3. Ensure the JSON is complete and properly formatted`
                },
                {
                  role: 'user',
                  content: filledPrompt
                }
              ],
              temperature: 0.3,
              maxTokens: 32000, // GPT-5 Mini supports up to 128K output tokens
              jsonMode: true
            },
            { provider: aiProvider }
          )

          const responseText = result.content
          console.log(`[ANALYZE] ${batchLabel} Response from ${result.provider} (${result.model})`)
          console.log(`[ANALYZE] ${batchLabel} Response: ${responseText.length} chars, ${result.tokensUsed || 'N/A'} tokens`)

          // Parse JSON response with repair fallback
          let analysisResult
          try {
            analysisResult = JSON.parse(responseText)
          } catch (parseError) {
            console.log(`[ANALYZE] ${batchLabel} Initial JSON parse failed, attempting repair...`)

            // Try to repair the JSON
            const repairedJson = repairJson(responseText)
            try {
              analysisResult = JSON.parse(repairedJson)
              console.log(`[ANALYZE] ${batchLabel} JSON repair successful`)
            } catch (repairError) {
              // Last resort: try to extract JSON from response (sometimes models wrap in markdown)
              const jsonMatch = responseText.match(/\{[\s\S]*\}/)
              if (jsonMatch) {
                const extracted = repairJson(jsonMatch[0])
                try {
                  analysisResult = JSON.parse(extracted)
                  console.log(`[ANALYZE] ${batchLabel} Extracted and repaired JSON from response`)
                } catch (extractError) {
                  console.error(`[ANALYZE] ${batchLabel} All JSON parsing attempts failed`)
                  console.error(`[ANALYZE] ${batchLabel} Response preview: ${responseText.substring(0, 500)}...`)
                  throw new Error(`Failed to parse AI response as JSON after repair attempts`)
                }
              } else {
                throw new Error(`Failed to parse AI response as JSON: ${responseText.substring(0, 200)}...`)
              }
            }
          }

          const analyzedCount = analysisResult.analyzedKeywords?.length || 0
          console.log(`[ANALYZE] ${batchLabel} Parsed ${analyzedCount} keywords`)

          if (analysisResult.analyzedKeywords && Array.isArray(analysisResult.analyzedKeywords)) {
            return analysisResult.analyzedKeywords.map((analyzed: Partial<AnalyzedKeyword>) => {
              const original = batchKeywords.find(k =>
                k.keyword.toLowerCase() === analyzed.keyword?.toLowerCase()
              )
              return {
                keyword: analyzed.keyword || '',
                avgMonthlySearches: original?.avgMonthlySearches || analyzed.avgMonthlySearches || 0,
                competition: original?.competition || analyzed.competition || 'UNSPECIFIED',
                competitionIndex: original?.competitionIndex || analyzed.competitionIndex || 0,
                lowTopOfPageBidMicros: original?.lowTopOfPageBidMicros,
                highTopOfPageBidMicros: original?.highTopOfPageBidMicros,
                inAccount: original?.inAccount,
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

          console.warn(`[ANALYZE] ${batchLabel} No analyzedKeywords array in response`)
          return []
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          console.error(`[ANALYZE] ${batchLabel} Error:`, errorMessage)

          // Retry on failure
          if (retryCount < MAX_RETRIES) {
            const delay = (retryCount + 1) * 2000 // Exponential backoff: 2s, 4s
            console.log(`[ANALYZE] ${batchLabel} Retrying in ${delay / 1000}s...`)
            await new Promise(resolve => setTimeout(resolve, delay))
            return attemptAnalysis(retryCount + 1)
          }

          console.error(`[ANALYZE] ${batchLabel} Failed after ${MAX_RETRIES} retries`)
          throw new Error(`Analysis failed for batch ${batchIndex + 1}: ${errorMessage}`)
        }
      }

      return attemptAnalysis()
    }

    // Split keywords into batches if needed
    const batches: KeywordIdea[][] = []
    for (let i = 0; i < keywords.length; i += MAX_KEYWORDS_PER_BATCH) {
      batches.push(keywords.slice(i, i + MAX_KEYWORDS_PER_BATCH))
    }

    console.log(`[ANALYZE] Processing ${keywords.length} keywords in ${batches.length} batch(es)`)

    // Process batches (parallel for speed, but limit to 2 concurrent to avoid rate limits)
    const allAnalyzedKeywords: AnalyzedKeyword[] = []
    const CONCURRENT_BATCHES = 2

    for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
      const batchChunk = batches.slice(i, i + CONCURRENT_BATCHES)
      const results = await Promise.all(
        batchChunk.map((batch, idx) => processBatch(batch, i + idx, batches.length))
      )
      results.forEach(result => allAnalyzedKeywords.push(...result))
    }

    // If no keywords were analyzed, return error
    if (allAnalyzedKeywords.length === 0) {
      const processingTimeMs = Date.now() - startTime
      console.error(`[ANALYZE] No keywords analyzed after ${processingTimeMs}ms`)
      return NextResponse.json({
        success: false,
        error: 'AI analysis returned no results. Please try again or use a different AI provider.'
      }, { status: 500 })
    }

    // Calculate summary
    const summary = {
      totalAnalyzed: allAnalyzedKeywords.length,
      toAdd: allAnalyzedKeywords.filter(k => k.action === 'ADD').length,
      toReview: allAnalyzedKeywords.filter(k => k.action === 'REVIEW').length,
      excluded: allAnalyzedKeywords.filter(k => k.action === 'EXCLUDE' || k.action === 'EXCLUDE_RELEVANCE').length,
      urgentCount: allAnalyzedKeywords.filter(k => k.priority === '🔴 URGENT').length,
      highPriorityCount: allAnalyzedKeywords.filter(k => k.priority === '🟠 HIGH').length
    }

    const processingTimeMs = Date.now() - startTime
    console.log('[ANALYZE] ========================================')
    console.log(`[ANALYZE] COMPLETE: ${allAnalyzedKeywords.length} keywords in ${processingTimeMs}ms`)
    console.log(`[ANALYZE] Summary: ${summary.toAdd} ADD, ${summary.toReview} REVIEW, ${summary.excluded} EXCLUDE`)
    console.log('[ANALYZE] ========================================')

    return NextResponse.json({
      success: true,
      data: {
        analyzedKeywords: allAnalyzedKeywords,
        summary
      },
      meta: {
        processingTimeMs,
        batchCount: batches.length,
        keywordsPerBatch: MAX_KEYWORDS_PER_BATCH
      }
    })

  } catch (error) {
    const processingTimeMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('[ANALYZE] ========================================')
    console.error(`[ANALYZE] FATAL ERROR after ${processingTimeMs}ms:`, errorMessage)
    console.error('[ANALYZE] ========================================')

    return NextResponse.json({
      success: false,
      error: `Analysis failed: ${errorMessage}`,
      meta: { processingTimeMs }
    }, { status: 500 })
  }
}
