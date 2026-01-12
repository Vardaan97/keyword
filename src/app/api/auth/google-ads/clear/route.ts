import { NextResponse } from 'next/server'
import { clearTokens } from '@/lib/token-storage'

export const dynamic = 'force-dynamic'

/**
 * Clear stored Google Ads tokens
 *
 * Removes the runtime token storage file (.google-ads-tokens.json)
 * Does not affect environment variable tokens.
 */
export async function POST() {
  try {
    await clearTokens()
    console.log('[AUTH-CLEAR] Tokens cleared successfully')

    return NextResponse.json({
      success: true,
      message: 'Tokens cleared successfully'
    })
  } catch (error) {
    console.error('[AUTH-CLEAR] Error clearing tokens:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear tokens'
    }, { status: 500 })
  }
}
