/**
 * Google Ads Editor Export Generator
 *
 * Generates CSV files compatible with Google Ads Editor for bulk keyword import.
 * Supports both tab-separated format (native) and standard CSV.
 */

import { AnalyzedKeyword, Action } from '@/types'
import { AdGroupMatch } from './ad-group-matcher'

/**
 * Extended keyword type with ad group assignment
 */
export interface KeywordWithAdGroup extends AnalyzedKeyword {
  // Ad group assignment
  campaignName: string
  adGroupName: string
  adGroupMatch: AdGroupMatch | null
  // Selection state for export
  selected: boolean
  // Override fields (user can change these)
  overrideCampaign?: string
  overrideAdGroup?: string
}

/**
 * Export configuration options
 */
export interface ExportConfig {
  // Which actions to include
  includeActions: Action[]
  // Match types to export (can export multiple per keyword)
  matchTypes: ('Exact' | 'Phrase' | 'Broad')[]
  // Include Max CPC column
  includeMaxCpc: boolean
  // Default Max CPC value if not from API
  defaultMaxCpc?: number
  // Include tier as label
  includeTierLabel: boolean
  // Include priority as label
  includePriorityLabel: boolean
  // Format (tab or comma)
  format: 'tab' | 'csv'
  // Include header row
  includeHeader: boolean
}

const DEFAULT_CONFIG: ExportConfig = {
  includeActions: ['ADD', 'BOOST'],
  matchTypes: ['Exact', 'Phrase'],
  includeMaxCpc: false,
  defaultMaxCpc: undefined,
  includeTierLabel: true,
  includePriorityLabel: false,
  format: 'tab',
  includeHeader: true,
}

/**
 * Convert internal match type to Google Ads Editor format
 */
export function convertMatchType(matchType: string): 'Exact' | 'Phrase' | 'Broad' {
  const map: Record<string, 'Exact' | 'Phrase' | 'Broad'> = {
    '[EXACT]': 'Exact',
    'EXACT': 'Exact',
    'PHRASE': 'Phrase',
    'BROAD': 'Broad',
    'N/A': 'Broad',
  }
  return map[matchType.toUpperCase()] || 'Broad'
}

/**
 * Format keyword for exact match (no special formatting needed for export)
 */
export function formatKeyword(keyword: string): string {
  // Clean up the keyword
  return keyword.trim().toLowerCase()
}

/**
 * Convert micros to currency value
 */
export function microsToValue(micros: number | undefined, currency: string = 'INR'): string {
  if (!micros) return ''
  const value = micros / 1_000_000
  // Format based on currency
  if (currency === 'INR') {
    return value.toFixed(2)
  }
  return value.toFixed(2)
}

/**
 * Generate a single row for the export
 */
function generateRow(
  keyword: KeywordWithAdGroup,
  matchType: 'Exact' | 'Phrase' | 'Broad',
  config: ExportConfig
): string[] {
  const campaign = keyword.overrideCampaign || keyword.campaignName
  const adGroup = keyword.overrideAdGroup || keyword.adGroupName

  const row: string[] = [
    campaign,
    adGroup,
    formatKeyword(keyword.keyword),
    matchType,
  ]

  // Max CPC (optional)
  if (config.includeMaxCpc) {
    const maxCpc = keyword.highTopOfPageBidMicros
      ? microsToValue(keyword.highTopOfPageBidMicros, keyword.bidCurrency)
      : config.defaultMaxCpc?.toString() || ''
    row.push(maxCpc)
  }

  // Final URL (use course URL if we have it)
  // Note: In Google Ads Editor, Final URL is typically set at ad group level
  // We leave it empty here, but could include if needed
  row.push('')  // Final URL placeholder

  // Status (always Enabled for new keywords)
  row.push('Enabled')

  // Labels (optional)
  const labels: string[] = []
  if (config.includeTierLabel && keyword.tier) {
    labels.push(keyword.tier.toString())
  }
  if (config.includePriorityLabel && keyword.priority) {
    // Remove emoji from priority
    const priorityText = keyword.priority.replace(/[🔴🟠🟡⚪🔵]\s*/g, '')
    labels.push(priorityText)
  }
  row.push(labels.join('; '))

  return row
}

/**
 * Generate Google Ads Editor compatible export
 */
export function generateGadsEditorExport(
  keywords: KeywordWithAdGroup[],
  config: Partial<ExportConfig> = {}
): string {
  const mergedConfig: ExportConfig = { ...DEFAULT_CONFIG, ...config }
  const separator = mergedConfig.format === 'tab' ? '\t' : ','

  // Filter keywords by selected state and action
  const filteredKeywords = keywords.filter(
    kw => kw.selected && mergedConfig.includeActions.includes(kw.action)
  )

  // Generate header
  const headers = [
    'Campaign',
    'Ad group',
    'Keyword',
    'Match type',
  ]

  if (mergedConfig.includeMaxCpc) {
    headers.push('Max CPC')
  }
  headers.push('Final URL')
  headers.push('Status')
  headers.push('Labels')

  const rows: string[][] = []

  // Add header if configured
  if (mergedConfig.includeHeader) {
    rows.push(headers)
  }

  // Generate rows for each keyword and match type combination
  for (const keyword of filteredKeywords) {
    // Skip if no campaign/ad group assigned
    if (!keyword.campaignName || !keyword.adGroupName) {
      console.warn(`[EXPORT] Skipping keyword "${keyword.keyword}" - no ad group assigned`)
      continue
    }

    for (const matchType of mergedConfig.matchTypes) {
      rows.push(generateRow(keyword, matchType, mergedConfig))
    }
  }

  // Join rows
  return rows.map(row => {
    // Escape values if using CSV format
    if (mergedConfig.format === 'csv') {
      return row.map(val => {
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`
        }
        return val
      }).join(separator)
    }
    return row.join(separator)
  }).join('\n')
}

/**
 * Generate extended export with all metadata
 * Useful for review before importing to Google Ads
 */
export function generateExtendedExport(
  keywords: KeywordWithAdGroup[],
  config: Partial<ExportConfig> = {}
): string {
  const mergedConfig: ExportConfig = { ...DEFAULT_CONFIG, ...config }
  const separator = mergedConfig.format === 'tab' ? '\t' : ','

  // Filter keywords
  const filteredKeywords = keywords.filter(
    kw => kw.selected && mergedConfig.includeActions.includes(kw.action)
  )

  // Extended headers
  const headers = [
    'Campaign',
    'Ad group',
    'Keyword',
    'Match type',
    'Search Volume',
    'Competition',
    'Competition Index',
    'Final Score',
    'Tier',
    'Action',
    'Priority',
    'In Account',
    'Max CPC',
    'Status',
    'Match Confidence',
    'Course Relevance',
    'Labels',
  ]

  const rows: string[][] = []

  if (mergedConfig.includeHeader) {
    rows.push(headers)
  }

  for (const keyword of filteredKeywords) {
    if (!keyword.campaignName || !keyword.adGroupName) continue

    for (const matchType of mergedConfig.matchTypes) {
      const campaign = keyword.overrideCampaign || keyword.campaignName
      const adGroup = keyword.overrideAdGroup || keyword.adGroupName

      const row: string[] = [
        campaign,
        adGroup,
        formatKeyword(keyword.keyword),
        matchType,
        keyword.avgMonthlySearches.toString(),
        keyword.competition,
        keyword.competitionIndex.toString(),
        keyword.finalScore.toString(),
        keyword.tier.toString(),
        keyword.action,
        keyword.priority || '',
        keyword.inAccount ? 'Yes' : 'No',
        keyword.highTopOfPageBidMicros
          ? microsToValue(keyword.highTopOfPageBidMicros, keyword.bidCurrency)
          : '',
        'Enabled',
        keyword.adGroupMatch?.confidence || 'none',
        keyword.courseRelevance.toString(),
        keyword.tier.toString(), // Labels
      ]

      rows.push(row)
    }
  }

  // Join rows
  return rows.map(row => {
    if (mergedConfig.format === 'csv') {
      return row.map(val => {
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`
        }
        return val
      }).join(separator)
    }
    return row.join(separator)
  }).join('\n')
}

/**
 * Download export as file
 */
export function downloadExport(
  content: string,
  filename: string,
  format: 'tab' | 'csv' = 'tab'
): void {
  const mimeType = format === 'tab' ? 'text/tab-separated-values' : 'text/csv'
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Copy export to clipboard
 */
export async function copyToClipboard(content: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(content)
    return true
  } catch (error) {
    console.error('[EXPORT] Clipboard error:', error)
    // Fallback for older browsers
    const textarea = document.createElement('textarea')
    textarea.value = content
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
      document.body.removeChild(textarea)
      return true
    } catch (e) {
      document.body.removeChild(textarea)
      return false
    }
  }
}

/**
 * Get summary stats for export preview
 */
export function getExportStats(
  keywords: KeywordWithAdGroup[],
  includeActions: Action[] = ['ADD', 'BOOST']
): {
  total: number
  selected: number
  byAction: Record<string, number>
  byCampaign: Record<string, number>
  withAdGroup: number
  withoutAdGroup: number
} {
  const filtered = keywords.filter(
    kw => kw.selected && includeActions.includes(kw.action)
  )

  const byAction: Record<string, number> = {}
  const byCampaign: Record<string, number> = {}
  let withAdGroup = 0
  let withoutAdGroup = 0

  for (const kw of filtered) {
    // Count by action
    byAction[kw.action] = (byAction[kw.action] || 0) + 1

    // Count by campaign
    if (kw.campaignName) {
      byCampaign[kw.campaignName] = (byCampaign[kw.campaignName] || 0) + 1
      withAdGroup++
    } else {
      withoutAdGroup++
    }
  }

  return {
    total: keywords.length,
    selected: filtered.length,
    byAction,
    byCampaign,
    withAdGroup,
    withoutAdGroup,
  }
}
