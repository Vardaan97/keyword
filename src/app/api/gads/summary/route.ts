import { NextResponse } from 'next/server'
import { getGadsDataSummary, isGadsDbConfigured } from '@/lib/gads-knowledge-base'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!isGadsDbConfigured()) {
    return NextResponse.json({
      success: false,
      error: 'Database not configured. Please set SUPABASE environment variables.'
    }, { status: 500 })
  }

  try {
    const summary = await getGadsDataSummary()
    return NextResponse.json({ success: true, data: summary })
  } catch (error) {
    console.error('[GADS-SUMMARY] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
