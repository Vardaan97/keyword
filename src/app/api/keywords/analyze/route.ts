import { NextRequest, NextResponse } from 'next/server'
import { aiClient, AIProvider, ANALYSIS_MODEL_CHAIN } from '@/lib/ai-client'
import { MODEL_OUTPUT_CAPS, TOKENS_PER_KEYWORD, PER_REQUEST_OVERHEAD_TOKENS } from '@/lib/model-caps'
import { fillPromptVariables } from '@/lib/prompts'
import { logCostBestEffort } from '@/lib/cost-logger'
import { KeywordIdea, AnalyzedKeyword, ApiResponse } from '@/types'

// Route config: allow long-running analysis and keep the handler out of static caches.
export const maxDuration = 300
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface AnalyzeRequest {
  prompt: string
  courseName: string
  certificationCode?: string
  vendor?: string
  relatedTerms?: string
  keywords: KeywordIdea[]
  aiProvider?: AIProvider
  runId?: string
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

// Smaller batches × high concurrency is faster than fewer large batches for
// Gemini 3.1 Flash Lite Preview (65K output, 1M context). Trade-off math:
//   - 150 kw × 220 tokens ≈ 33K output — completes in ~40–60s
//   - 16 batches serial at 250/batch ≈ 4–6 min; 27 batches at 150/batch × 6 concurrent ≈ ~2 min
// Per-model output caps are enforced in ai-client; this is an ergonomics tuning knob.
const MAX_KEYWORDS_PER_BATCH = 150

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

/**
 * Build a neutral-scored AnalyzedKeyword for cases where the AI skipped, timed out,
 * or the whole batch failed. Keeps keyword present in the output so the UI never
 * loses rows and downstream CSV export stays complete.
 */
function buildReviewFallback(original: KeywordIdea): AnalyzedKeyword {
  const competitionBonus = original.competition === 'LOW' ? 10 : original.competition === 'MEDIUM' ? 5 : 0
  const baseScore = 45
  return {
    keyword: original.keyword,
    avgMonthlySearches: original.avgMonthlySearches,
    competition: original.competition,
    competitionIndex: original.competitionIndex,
    lowTopOfPageBidMicros: original.lowTopOfPageBidMicros,
    highTopOfPageBidMicros: original.highTopOfPageBidMicros,
    inAccount: original.inAccount,
    courseRelevance: 5,
    relevanceStatus: 'RELATED',
    conversionPotential: 5,
    searchIntent: 5,
    vendorSpecificity: 5,
    keywordSpecificity: 5,
    actionWordStrength: 5,
    commercialSignals: 5,
    negativeSignals: 8,
    koenigFit: 5,
    baseScore,
    competitionBonus,
    finalScore: baseScore + competitionBonus,
    tier: 'Review',
    matchType: 'PHRASE',
    action: 'REVIEW',
    exclusionReason: undefined,
    priority: '🔵 REVIEW',
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<AnalysisResponse>>> {
  const startTime = Date.now()

  try {
    const body: AnalyzeRequest = await request.json()
    const { prompt, courseName, certificationCode, vendor, relatedTerms, keywords, aiProvider, runId } = body

    console.log('[ANALYZE] ========================================')
    console.log('[ANALYZE] Request received')
    console.log('[ANALYZE] Course:', courseName)
    console.log('[ANALYZE] Keywords count:', keywords?.length)
    console.log('[ANALYZE] AI Provider:', aiProvider || 'default')
    console.log('[ANALYZE] ========================================')

    // Accumulated cost totals across all batches in this run.
    // Populated inside processBatch; logged once after all waves complete.
    let runTotalInputTokens = 0
    let runTotalOutputTokens = 0
    let runTotalCostUsd = 0
    const costByModel: Record<string, { provider: string; inputTokens: number; outputTokens: number; costUsd: number }> = {}

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

      // Format keywords data for the prompt (includes in-account status for action accuracy)
      const keywordsData = batchKeywords.map(kw =>
        `${kw.keyword},${kw.avgMonthlySearches},${kw.competition},${kw.competitionIndex},${kw.inAccount ? 'YES' : 'NO'},${kw.inAccountNames?.join('; ') || '-'}`
      ).join('\n')

      const keywordsHeader = 'Keyword,Avg Monthly Searches,Competition,Competition Index,In Account,Account Names'
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
          const preferredProvider: AIProvider = aiProvider || 'openrouter'

          // Model chain: primary → fallback 1 → fallback 2 (see ANALYSIS_MODEL_CHAIN in ai-client).
          // For openrouter: gemini-3.1-flash-lite-preview → gemini-3-flash-preview → gemini-2.5-flash.
          const chain = ANALYSIS_MODEL_CHAIN[preferredProvider]
          const fastModel = chain[Math.min(retryCount, chain.length - 1)]

          console.log(`[ANALYZE] ${batchLabel} Using model: ${fastModel}${retryCount > 0 ? ` (fallback ${retryCount})` : ''}`)

          // Right-size max_tokens against the chosen model's published output cap.
          // Keeps us well inside the model's limit so responses never truncate.
          const modelCap = MODEL_OUTPUT_CAPS[fastModel] ?? 8000
          const estimatedNeed = batchKeywords.length * TOKENS_PER_KEYWORD + PER_REQUEST_OVERHEAD_TOKENS
          const batchMaxTokens = Math.min(modelCap, estimatedNeed)

          // Hard timeout per attempt — prevents hangs from escaping to the
          // upstream layer (which would emit a non-JSON error page). Sized for
          // ~250-keyword batches on Gemini 3.1 Flash Lite (~45K output tokens),
          // which can legitimately take 2–4 minutes of streaming. Keep under
          // the route-level maxDuration (300s) to guarantee we emit JSON first.
          const ANALYZE_TIMEOUT_MS = 240_000
          let timeoutHandle: ReturnType<typeof setTimeout> | undefined
          const result = await Promise.race([
            aiClient.chatCompletionWithFallback(
              {
                messages: [
                  {
                    role: 'system',
                    content: `You are a keyword analysis expert for IT training courses. Analyze keywords for relevance and commercial potential.

CRITICAL OUTPUT REQUIREMENTS:
1. Return ONLY valid JSON - no markdown, no code blocks, no extra text
2. Start directly with { and end with }
3. IMPORTANT: You MUST analyze ALL ${batchKeywords.length} keywords - return EXACTLY ${batchKeywords.length} items in the analyzedKeywords array
4. Do NOT skip any keywords - every single input keyword must appear in your output
5. Ensure the JSON is complete with proper closing brackets
6. If a keyword seems irrelevant, still include it with action: "EXCLUDE" and provide exclusionReason`
                  },
                  {
                    role: 'user',
                    content: filledPrompt
                  }
                ],
                temperature: 0.2,
                maxTokens: batchMaxTokens,
                jsonMode: true,
                model: fastModel,
                signal: request.signal,
              },
              { provider: preferredProvider }
            ),
            new Promise<never>((_, reject) => {
              timeoutHandle = setTimeout(
                () => reject(new Error(`AI call timed out after ${ANALYZE_TIMEOUT_MS / 1000}s`)),
                ANALYZE_TIMEOUT_MS
              )
            })
          ]).finally(() => {
            if (timeoutHandle) clearTimeout(timeoutHandle)
          })

          const responseText = result.content
          console.log(`[ANALYZE] ${batchLabel} Response from ${result.provider} (${result.model})`)
          console.log(`[ANALYZE] ${batchLabel} Response: ${responseText.length} chars, ${result.tokensUsed || 'N/A'} tokens (in: ${result.inputTokens ?? 'N/A'}, out: ${result.outputTokens ?? 'N/A'}) · Cost: $${(result.costUsd ?? 0).toFixed(6)}`)

          // Accumulate cost totals for this run (closure over outer-scoped trackers).
          if (result.inputTokens !== undefined || result.outputTokens !== undefined) {
            runTotalInputTokens += result.inputTokens ?? 0
            runTotalOutputTokens += result.outputTokens ?? 0
            runTotalCostUsd += result.costUsd ?? 0
            const key = result.model
            if (!costByModel[key]) {
              costByModel[key] = { provider: result.provider, inputTokens: 0, outputTokens: 0, costUsd: 0 }
            }
            costByModel[key].inputTokens += result.inputTokens ?? 0
            costByModel[key].outputTokens += result.outputTokens ?? 0
            costByModel[key].costUsd += result.costUsd ?? 0
          }

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
          console.log(`[ANALYZE] ${batchLabel} Parsed ${analyzedCount} keywords from AI (sent ${batchKeywords.length})`)

          if (analysisResult.analyzedKeywords && Array.isArray(analysisResult.analyzedKeywords)) {
            // Create a map of AI-analyzed keywords (case-insensitive)
            const analyzedMap = new Map<string, Partial<AnalyzedKeyword>>()
            for (const analyzed of analysisResult.analyzedKeywords) {
              if (analyzed.keyword) {
                analyzedMap.set(analyzed.keyword.toLowerCase(), analyzed)
              }
            }

            // Process ALL batch keywords - use AI analysis if available, otherwise mark for review
            const allKeywords: AnalyzedKeyword[] = batchKeywords.map(original => {
              const analyzed = analyzedMap.get(original.keyword.toLowerCase())

              if (analyzed) {
                // AI analyzed this keyword - use its scores
                // Handle tier - AI may return number (1, 2, 3) or string ('Tier 1', 'Review', etc.)
                let tierValue = analyzed.tier || 'Review'
                if (typeof tierValue === 'number') {
                  tierValue = `Tier ${Math.round(tierValue)}`
                } else if (typeof tierValue !== 'string') {
                  tierValue = String(tierValue)
                }

                return {
                  keyword: original.keyword,
                  avgMonthlySearches: original.avgMonthlySearches,
                  competition: original.competition,
                  competitionIndex: original.competitionIndex,
                  lowTopOfPageBidMicros: original.lowTopOfPageBidMicros,
                  highTopOfPageBidMicros: original.highTopOfPageBidMicros,
                  inAccount: original.inAccount,
                  courseRelevance: analyzed.courseRelevance || 5,
                  relevanceStatus: analyzed.relevanceStatus || 'RELATED',
                  conversionPotential: analyzed.conversionPotential || 5,
                  searchIntent: analyzed.searchIntent || 5,
                  vendorSpecificity: analyzed.vendorSpecificity || 5,
                  keywordSpecificity: analyzed.keywordSpecificity || 5,
                  actionWordStrength: analyzed.actionWordStrength || 5,
                  commercialSignals: analyzed.commercialSignals || 5,
                  negativeSignals: analyzed.negativeSignals || 8,
                  koenigFit: analyzed.koenigFit || 5,
                  baseScore: analyzed.baseScore || 50,
                  competitionBonus: analyzed.competitionBonus || 0,
                  finalScore: analyzed.finalScore || 50,
                  tier: tierValue,
                  matchType: analyzed.matchType || 'PHRASE',
                  action: analyzed.action || 'REVIEW',
                  exclusionReason: analyzed.exclusionReason,
                  priority: analyzed.priority
                } as AnalyzedKeyword
              } else {
                return buildReviewFallback(original)
              }
            })

            const skippedCount = batchKeywords.length - analyzedMap.size
            if (skippedCount > 0) {
              console.log(`[ANALYZE] ${batchLabel} AI skipped ${skippedCount} keywords - marked for REVIEW`)
            }

            return allKeywords
          }

          // If no AI response, mark ALL keywords for review
          console.warn(`[ANALYZE] ${batchLabel} No analyzedKeywords array - marking all ${batchKeywords.length} for REVIEW`)
          return batchKeywords.map(buildReviewFallback)
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

    // Process batches in waves of CONCURRENT_BATCHES. Per-batch failures become
    // REVIEW-scored fallbacks so the course always returns a complete keyword set.
    // 6 concurrent × 150-kw batches × ~45 s per AI call ≈ ~60 s wall for 4K keywords.
    // OpenRouter Gemini 3.1 Flash Lite Preview handles 6 concurrent comfortably on paid tier.
    const CONCURRENT_BATCHES = 6
    const allAnalyzedKeywords: AnalyzedKeyword[] = new Array(keywords.length)
    const warnings: string[] = []

    const processBatchOrFallback = async (batch: KeywordIdea[], idx: number): Promise<{ idx: number; result: AnalyzedKeyword[] }> => {
      try {
        const r = await processBatch(batch, idx, batches.length)
        return { idx, result: r }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const warning = `Batch ${idx + 1}/${batches.length} failed: ${msg}`
        console.error(`[ANALYZE] ${warning}`)
        warnings.push(warning)
        return { idx, result: batch.map(buildReviewFallback) }
      }
    }

    for (let waveStart = 0; waveStart < batches.length; waveStart += CONCURRENT_BATCHES) {
      if (request.signal.aborted) {
        console.log(`[ANALYZE] Aborted by client at batch ${waveStart + 1}/${batches.length}`)
        return NextResponse.json({
          success: false,
          error: 'Aborted by client',
          meta: { processingTimeMs: Date.now() - startTime }
        }, { status: 499 })
      }
      const wave = batches.slice(waveStart, waveStart + CONCURRENT_BATCHES)
      const waveResults = await Promise.all(
        wave.map((batch, offset) => processBatchOrFallback(batch, waveStart + offset))
      )
      // Preserve keyword order by splicing each batch result back into its slot.
      for (const { idx, result } of waveResults) {
        const writeAt = idx * MAX_KEYWORDS_PER_BATCH
        for (let j = 0; j < result.length; j++) {
          allAnalyzedKeywords[writeAt + j] = result[j]
        }
      }
    }

    // Compact any gaps (last batch may be shorter than MAX_KEYWORDS_PER_BATCH, leaving sparse slots)
    const compactedAnalyzed = allAnalyzedKeywords.filter(Boolean)
    allAnalyzedKeywords.length = 0
    allAnalyzedKeywords.push(...compactedAnalyzed)

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
    const runTotalTokens = runTotalInputTokens + runTotalOutputTokens
    console.log('[ANALYZE] ========================================')
    console.log(`[ANALYZE] COMPLETE: ${allAnalyzedKeywords.length} keywords in ${processingTimeMs}ms`)
    console.log(`[ANALYZE] Summary: ${summary.toAdd} ADD, ${summary.toReview} REVIEW, ${summary.excluded} EXCLUDE`)
    console.log(`[COST] Analysis run${runId ? ` ${runId}` : ''} for "${courseName}": $${runTotalCostUsd.toFixed(6)} (${runTotalTokens.toLocaleString()} tokens / ${runTotalInputTokens.toLocaleString()} in, ${runTotalOutputTokens.toLocaleString()} out)`)
    console.log('[ANALYZE] ========================================')

    // Best-effort cost log to Convex (one row per model used — typically one, more if chain fallback kicked in).
    for (const [model, agg] of Object.entries(costByModel)) {
      logCostBestEffort({
        runId,
        courseId: courseName,
        phase: 'analyze',
        provider: agg.provider,
        model,
        inputTokens: agg.inputTokens,
        outputTokens: agg.outputTokens,
        costUsd: agg.costUsd,
      }).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      data: {
        analyzedKeywords: allAnalyzedKeywords,
        summary
      },
      meta: {
        processingTimeMs,
        batchCount: batches.length,
        keywordsPerBatch: MAX_KEYWORDS_PER_BATCH,
        tokensUsed: runTotalTokens || undefined,
        inputTokens: runTotalInputTokens || undefined,
        outputTokens: runTotalOutputTokens || undefined,
        costUsd: runTotalCostUsd || undefined,
        ...(warnings.length > 0 ? { warnings } : {}),
      }
    })

  } catch (error) {
    const processingTimeMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('[ANALYZE] ========================================')
    console.error(`[ANALYZE] FATAL ERROR after ${processingTimeMs}ms:`, errorMessage)
    console.error('[ANALYZE] ========================================')

    // Double-wrapped: even if NextResponse.json itself throws (circular data, etc.),
    // we still emit a valid application/json body so the client never sees HTML.
    try {
      return NextResponse.json({
        success: false,
        error: `Analysis failed: ${errorMessage}`,
        meta: { processingTimeMs }
      }, { status: 500 })
    } catch {
      return new NextResponse(
        JSON.stringify({ success: false, error: 'Analysis crashed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }
}
