import { NextResponse } from 'next/server'
import { getLinkedInTokenStatus } from '@/lib/linkedin-token-storage'

/**
 * LinkedIn Token Status Endpoint
 *
 * Returns the current status of LinkedIn OAuth tokens without making API calls.
 * Used by UI to display connection state.
 */

export async function GET() {
  try {
    const tokenStatus = await getLinkedInTokenStatus()

    const config = {
      hasClientId: !!process.env.LINKEDIN_CLIENT_ID,
      hasClientSecret: !!process.env.LINKEDIN_CLIENT_SECRET,
      hasAccountUrn: !!process.env.LINKEDIN_ACCOUNT_URN,
    }

    return NextResponse.json({
      success: true,
      data: {
        ...tokenStatus,
        config,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      success: false,
      error: message,
    }, { status: 500 })
  }
}
