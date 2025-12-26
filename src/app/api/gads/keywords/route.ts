import { NextRequest, NextResponse } from 'next/server'
import { getLowQualityKeywords, searchKeywords, isGadsDbConfigured } from '@/lib/gads-knowledge-base'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!isGadsDbConfigured()) {
    return NextResponse.json({
      success: false,
      error: 'Database not configured. Please set SUPABASE environment variables.'
    }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') || 'low_quality'
    const query = searchParams.get('q') || ''
    const accountId = searchParams.get('accountId') || undefined
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    if (mode === 'search' && query) {
      const keywords = await searchKeywords(query, { accountId, limit })
      return NextResponse.json({ success: true, data: keywords })
    }

    // Default: get low quality keywords
    const maxQualityScore = parseInt(searchParams.get('maxQs') || '5', 10)
    const keywords = await getLowQualityKeywords(accountId, maxQualityScore, limit)
    return NextResponse.json({ success: true, data: keywords })
  } catch (error) {
    console.error('[GADS-KEYWORDS] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
