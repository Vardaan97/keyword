import { NextRequest, NextResponse } from 'next/server'
import { aiClient, AIProvider } from '@/lib/ai-client'
import { fillPromptVariables } from '@/lib/prompts'
import { SeedKeyword, ApiResponse } from '@/types'

interface GenerateSeedsRequest {
  prompt: string
  courseName: string
  courseUrl: string
  vendor?: string
  aiProvider?: AIProvider
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<SeedKeyword[]>>> {
  try {
    const body: GenerateSeedsRequest = await request.json()
    const { prompt, courseName, courseUrl, vendor, aiProvider } = body

    console.log('[GENERATE-SEEDS] Request received')
    console.log('[GENERATE-SEEDS] Course:', courseName)
    console.log('[GENERATE-SEEDS] URL:', courseUrl)
    console.log('[GENERATE-SEEDS] Vendor:', vendor)
    console.log('[GENERATE-SEEDS] AI Provider:', aiProvider || 'default')

    if (!prompt || !courseName || !courseUrl) {
      console.log('[GENERATE-SEEDS] Error: Missing required fields')
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: prompt, courseName, courseUrl'
      }, { status: 400 })
    }

    // Fill in the prompt variables
    const filledPrompt = fillPromptVariables(prompt, {
      COURSE_NAME: courseName,
      COURSE_URL: courseUrl,
      VENDOR: vendor || 'Not specified'
    })

    console.log('[GENERATE-SEEDS] Calling AI...')

    // Call AI using unified client
    const result = await aiClient.chatCompletionWithFallback(
      {
        messages: [
          {
            role: 'system',
            content: 'You are a Google Ads keyword strategist. Generate exactly 10 high-intent seed keywords. Output only a numbered list (1-10), one keyword phrase per line, no extra text or explanations.'
          },
          {
            role: 'user',
            content: filledPrompt
          }
        ],
        temperature: 0.7,
        maxTokens: 500
      },
      { provider: aiProvider }
    )

    const responseText = result.content
    console.log('[GENERATE-SEEDS] Response from', result.provider, '(', result.model, ')')
    console.log('[GENERATE-SEEDS] Response preview:', responseText.substring(0, 200))
    console.log('[GENERATE-SEEDS] Tokens used:', result.tokensUsed)

    // Parse the numbered list
    const seedKeywords: SeedKeyword[] = responseText
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^\d+[\.\)]\s*/.test(line))
      .map(line => ({
        keyword: line.replace(/^\d+[\.\)]\s*/, '').trim(),
        source: 'ai_generated' as const
      }))
      .filter(kw => kw.keyword.length > 0)

    console.log('[GENERATE-SEEDS] Parsed', seedKeywords.length, 'seed keywords')

    if (seedKeywords.length === 0) {
      console.log('[GENERATE-SEEDS] Trying alternative parsing...')
      // Try parsing without number prefix
      const keywords = responseText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'))
        .slice(0, 10)
        .map(keyword => ({
          keyword,
          source: 'ai_generated' as const
        }))

      if (keywords.length > 0) {
        console.log('[GENERATE-SEEDS] Alternative parsing found', keywords.length, 'keywords')
        return NextResponse.json({
          success: true,
          data: keywords
        })
      }

      console.log('[GENERATE-SEEDS] Error: Could not parse keywords from response')
      return NextResponse.json({
        success: false,
        error: 'Failed to parse seed keywords from AI response'
      }, { status: 500 })
    }

    console.log('[GENERATE-SEEDS] Success:', seedKeywords.map(k => k.keyword).join(', '))
    return NextResponse.json({
      success: true,
      data: seedKeywords
    })

  } catch (error) {
    console.error('[GENERATE-SEEDS] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate seed keywords'
    }, { status: 500 })
  }
}
