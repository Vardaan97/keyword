import { NextRequest, NextResponse } from 'next/server'
import {
  fetchExperiments,
  fetchAllAccountsExperiments,
  fetchExperimentWithMetrics,
  getActiveExperiments,
  getEndedExperiments,
} from '@/lib/google-ads-experiments'
import { getDefaultCustomerId } from '@/lib/google-ads'

export const dynamic = 'force-dynamic'

/**
 * GET /api/gads/experiments
 *
 * Fetch experiments from Google Ads
 *
 * Query params:
 * - customerId: Google Ads customer ID (optional, defaults to env)
 * - allAccounts: If "true", fetch from all accounts
 * - status: Filter by status ('active', 'ended', 'all')
 * - withMetrics: If "true", include performance metrics (slower)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const customerId = searchParams.get('customerId') || getDefaultCustomerId()
    const allAccounts = searchParams.get('allAccounts') === 'true'
    const status = searchParams.get('status') || 'all'
    const withMetrics = searchParams.get('withMetrics') === 'true'

    console.log('[API/GADS/EXPERIMENTS] Fetching experiments...')
    console.log('[API/GADS/EXPERIMENTS] All accounts:', allAccounts)
    console.log('[API/GADS/EXPERIMENTS] Status filter:', status)
    console.log('[API/GADS/EXPERIMENTS] With metrics:', withMetrics)

    let allExperiments: Awaited<ReturnType<typeof fetchExperiments>>['experiments'] = []
    let accountResults: Array<{ accountName: string; customerId: string; total: number }> = []

    if (allAccounts) {
      // Fetch from all accounts
      const responses = await fetchAllAccountsExperiments()

      for (const response of responses) {
        allExperiments.push(...response.experiments)
        accountResults.push({
          accountName: response.accountName,
          customerId: response.customerId,
          total: response.total,
        })
      }
    } else {
      // Fetch from single account
      const response = await fetchExperiments(customerId)
      allExperiments = response.experiments
      accountResults.push({
        accountName: response.accountName,
        customerId: response.customerId,
        total: response.total,
      })
    }

    // Apply status filter
    let filteredExperiments = allExperiments
    if (status === 'active') {
      filteredExperiments = getActiveExperiments(allExperiments)
    } else if (status === 'ended') {
      filteredExperiments = getEndedExperiments(allExperiments)
    }

    // Fetch metrics if requested (note: this is slower due to additional API calls)
    if (withMetrics) {
      console.log('[API/GADS/EXPERIMENTS] Fetching metrics for experiments...')

      for (let i = 0; i < filteredExperiments.length; i++) {
        const exp = filteredExperiments[i]
        const fullExperiment = await fetchExperimentWithMetrics(
          exp.customerId,
          exp.googleExperimentId,
          exp.startDate,
          exp.endDate
        )

        if (fullExperiment) {
          filteredExperiments[i] = fullExperiment
        }

        // Add delay between experiments to respect rate limits
        if (i < filteredExperiments.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1100))
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        experiments: filteredExperiments,
        total: filteredExperiments.length,
        unfilteredTotal: allExperiments.length,
        accounts: accountResults,
        filters: {
          status,
          withMetrics,
        },
      },
    })
  } catch (error) {
    console.error('[API/GADS/EXPERIMENTS] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch experiments',
      },
      { status: 500 }
    )
  }
}
