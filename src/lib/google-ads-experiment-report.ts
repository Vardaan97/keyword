/**
 * Google Ads Experiment Report Generation
 *
 * Generates comprehensive reports for completed A/B test experiments.
 * Includes metrics comparison, statistical significance, and recommendations.
 */

import {
  fetchExperimentWithMetrics,
  calculateStatisticalSignificance,
  determineWinner,
  calculateLift,
  ArmMetrics,
  Experiment,
  ExperimentArm,
} from './google-ads-experiments'

// ============================================================================
// TYPES
// ============================================================================

export interface ExperimentReport {
  experimentId: string
  experimentName: string
  hypothesis: string
  customerId: string

  // Timeline
  startDate: string
  endDate: string
  durationDays: number

  // Control vs Treatment comparison
  control: ArmMetrics & { name: string; campaignId: string }
  treatment: ArmMetrics & { name: string; campaignId: string }

  // Results
  winner: 'control' | 'treatment' | 'inconclusive'
  lift: {
    conversions: number
    conversionRate: number
    costPerConversion: number
    roas: number
  }
  statisticalSignificance: number

  // Summary
  summary: string
  recommendation: string
  learnings: string[]

  // Metadata
  generatedAt: number
  reportType: 'EXPERIMENT_RESULT'
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

/**
 * Generate a comprehensive experiment report
 */
export async function generateExperimentReport(
  customerId: string,
  experimentId: string
): Promise<ExperimentReport> {
  console.log(`[REPORT] Generating report for experiment ${experimentId}...`)

  // Fetch experiment with arms and metrics
  const experiment = await fetchExperimentWithMetrics(customerId, experimentId)

  if (!experiment) {
    throw new Error(`Experiment ${experimentId} not found`)
  }

  if (!experiment.arms || experiment.arms.length < 2) {
    throw new Error(`Experiment ${experimentId} doesn't have enough arms for comparison`)
  }

  // Identify control and treatment arms
  const controlArm = experiment.arms.find((a) => a.isControl)
  const treatmentArm = experiment.arms.find((a) => !a.isControl)

  if (!controlArm || !treatmentArm) {
    throw new Error(`Experiment ${experimentId} is missing control or treatment arm`)
  }

  // Ensure metrics exist
  const controlMetrics = controlArm.metrics || createEmptyMetrics()
  const treatmentMetrics = treatmentArm.metrics || createEmptyMetrics()

  // Calculate statistical significance
  const significance = calculateStatisticalSignificance(
    controlMetrics.conversions,
    controlMetrics.impressions,
    treatmentMetrics.conversions,
    treatmentMetrics.impressions
  )

  // Determine winner
  const winner = determineWinner(controlMetrics, treatmentMetrics, significance)

  // Calculate lift
  const lift = calculateLift(controlMetrics, treatmentMetrics)

  // Calculate duration
  const startDate = experiment.startDate || formatDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
  const endDate = experiment.endDate || formatDate(new Date())
  const durationDays = calculateDaysBetween(startDate, endDate)

  // Generate summary and recommendation
  const summary = generateReportSummary(winner, lift.conversionRate, significance, experiment.name)
  const recommendation = generateRecommendation(winner, experiment, lift)
  const learnings = generateLearnings(controlMetrics, treatmentMetrics, winner, lift)

  const report: ExperimentReport = {
    experimentId,
    experimentName: experiment.name,
    hypothesis: experiment.hypothesis || 'Not specified',
    customerId: customerId.replace(/-/g, ''),

    startDate,
    endDate,
    durationDays,

    control: {
      ...controlMetrics,
      name: controlArm.name,
      campaignId: controlArm.campaignId,
    },
    treatment: {
      ...treatmentMetrics,
      name: treatmentArm.name,
      campaignId: treatmentArm.campaignId,
    },

    winner,
    lift,
    statisticalSignificance: significance,

    summary,
    recommendation,
    learnings,

    generatedAt: Date.now(),
    reportType: 'EXPERIMENT_RESULT',
  }

  console.log(`[REPORT] Report generated for ${experiment.name}`)
  console.log(`[REPORT] Winner: ${winner}, Significance: ${significance}%`)

  return report
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create empty metrics object
 */
function createEmptyMetrics(): ArmMetrics {
  return {
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    conversionValue: 0,
    ctr: 0,
    cpc: 0,
    cpa: 0,
    roas: 0,
  }
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Calculate days between two date strings
 */
function calculateDaysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diffTime = Math.abs(end.getTime() - start.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * Generate human-readable report summary
 */
function generateReportSummary(
  winner: 'control' | 'treatment' | 'inconclusive',
  conversionRateLift: number,
  significance: number,
  experimentName: string
): string {
  if (winner === 'inconclusive') {
    if (significance < 50) {
      return `The experiment "${experimentName}" did not reach statistical significance (${significance}%). More data is needed to determine a clear winner. Consider extending the experiment or increasing traffic.`
    }
    return `The experiment "${experimentName}" showed some difference between variants but did not reach 95% statistical significance (current: ${significance}%). The results are trending but not conclusive.`
  }

  const liftDirection = conversionRateLift > 0 ? 'increase' : 'decrease'
  const absLift = Math.abs(conversionRateLift).toFixed(1)

  if (winner === 'treatment') {
    return `The treatment variant outperformed the control with a ${absLift}% ${liftDirection} in conversion rate. With ${significance}% statistical significance, we can confidently say this improvement is real and not due to random chance.`
  }

  return `The control variant outperformed the treatment. The treatment showed a ${absLift}% ${liftDirection} in conversion rate compared to control. With ${significance}% significance, we recommend keeping the original setup.`
}

/**
 * Generate actionable recommendation
 */
function generateRecommendation(
  winner: 'control' | 'treatment' | 'inconclusive',
  experiment: Experiment,
  lift: { conversions: number; conversionRate: number; costPerConversion: number; roas: number }
): string {
  if (winner === 'inconclusive') {
    return 'No action recommended at this time. Consider:\n' +
      '1. Extending the experiment duration to gather more data\n' +
      '2. Increasing traffic allocation to the experiment\n' +
      '3. Reviewing if the hypothesis is testable with current traffic levels'
  }

  if (winner === 'treatment') {
    const roasImprovement = lift.roas > 0 ? ` ROAS improved by ${lift.roas.toFixed(1)}%.` : ''
    const cpaImprovement = lift.costPerConversion < 0 ? ` Cost per conversion decreased by ${Math.abs(lift.costPerConversion).toFixed(1)}%.` : ''

    return `**Recommended Action: Graduate the treatment variant to 100% traffic.**\n\n` +
      `Rationale: The treatment showed statistically significant improvement.${roasImprovement}${cpaImprovement}\n\n` +
      'Implementation steps:\n' +
      '1. In Google Ads, go to the experiment and click "Graduate"\n' +
      '2. Select "Apply treatment settings to base campaign"\n' +
      '3. Monitor performance for the first week after graduation'
  }

  return `**Recommended Action: Keep the original (control) campaign settings.**\n\n` +
    'Rationale: The treatment did not outperform the control.\n\n' +
    'Next steps:\n' +
    '1. End the experiment in Google Ads\n' +
    '2. Document learnings for future experiments\n' +
    '3. Consider testing a different hypothesis'
}

/**
 * Generate key learnings from the experiment
 */
function generateLearnings(
  control: ArmMetrics,
  treatment: ArmMetrics,
  winner: 'control' | 'treatment' | 'inconclusive',
  lift: { conversions: number; conversionRate: number; costPerConversion: number; roas: number }
): string[] {
  const learnings: string[] = []

  // Traffic and scale
  const totalImpressions = control.impressions + treatment.impressions
  const totalConversions = control.conversions + treatment.conversions

  if (totalImpressions > 0) {
    learnings.push(
      `Total experiment reach: ${totalImpressions.toLocaleString()} impressions, ${totalConversions.toLocaleString()} conversions`
    )
  }

  // CTR comparison
  const ctrDiff = treatment.ctr - control.ctr
  if (Math.abs(ctrDiff) > 0.1) {
    const direction = ctrDiff > 0 ? 'higher' : 'lower'
    learnings.push(
      `Treatment had ${Math.abs(ctrDiff).toFixed(2)}% ${direction} click-through rate`
    )
  }

  // CPC comparison
  if (control.cpc > 0 && treatment.cpc > 0) {
    const cpcDiff = ((treatment.cpc - control.cpc) / control.cpc) * 100
    if (Math.abs(cpcDiff) > 5) {
      const direction = cpcDiff > 0 ? 'higher' : 'lower'
      learnings.push(
        `Cost per click was ${Math.abs(cpcDiff).toFixed(1)}% ${direction} in treatment`
      )
    }
  }

  // Conversion rate
  const controlConvRate = control.impressions > 0 ? (control.conversions / control.impressions) * 100 : 0
  const treatmentConvRate = treatment.impressions > 0 ? (treatment.conversions / treatment.impressions) * 100 : 0

  if (controlConvRate > 0 || treatmentConvRate > 0) {
    learnings.push(
      `Conversion rates: Control ${controlConvRate.toFixed(3)}% vs Treatment ${treatmentConvRate.toFixed(3)}%`
    )
  }

  // Winner-specific learnings
  if (winner === 'treatment' && lift.conversionRate > 0) {
    learnings.push(
      `The treatment's approach can be applied to similar campaigns for potential ${lift.conversionRate.toFixed(1)}% improvement`
    )
  } else if (winner === 'control') {
    learnings.push(
      'The original settings performed better - consider why the hypothesis didn\'t hold'
    )
  } else {
    learnings.push(
      'No clear winner suggests the tested change may not have meaningful impact on this metric'
    )
  }

  // Cost efficiency
  if (control.cost > 0 && treatment.cost > 0) {
    const totalCost = control.cost + treatment.cost
    learnings.push(
      `Total experiment investment: ₹${totalCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
    )
  }

  return learnings
}

/**
 * Format report as text for email/display
 */
export function formatReportAsText(report: ExperimentReport): string {
  const lines: string[] = []

  lines.push(`# Experiment Report: ${report.experimentName}`)
  lines.push('')
  lines.push(`**Hypothesis:** ${report.hypothesis}`)
  lines.push(`**Duration:** ${report.startDate} to ${report.endDate} (${report.durationDays} days)`)
  lines.push('')

  // Results
  lines.push('## Results')
  lines.push('')
  lines.push(`**Winner:** ${report.winner.toUpperCase()}`)
  lines.push(`**Statistical Significance:** ${report.statisticalSignificance}%`)
  lines.push('')

  // Metrics comparison
  lines.push('## Metrics Comparison')
  lines.push('')
  lines.push('| Metric | Control | Treatment | Lift |')
  lines.push('|--------|---------|-----------|------|')
  lines.push(
    `| Impressions | ${report.control.impressions.toLocaleString()} | ${report.treatment.impressions.toLocaleString()} | - |`
  )
  lines.push(
    `| Clicks | ${report.control.clicks.toLocaleString()} | ${report.treatment.clicks.toLocaleString()} | - |`
  )
  lines.push(`| CTR | ${report.control.ctr}% | ${report.treatment.ctr}% | - |`)
  lines.push(
    `| Conversions | ${report.control.conversions.toLocaleString()} | ${report.treatment.conversions.toLocaleString()} | ${report.lift.conversions > 0 ? '+' : ''}${report.lift.conversions.toFixed(1)}% |`
  )
  lines.push(
    `| Cost | ₹${report.control.cost.toLocaleString()} | ₹${report.treatment.cost.toLocaleString()} | - |`
  )
  lines.push(
    `| CPA | ₹${report.control.cpa.toFixed(2)} | ₹${report.treatment.cpa.toFixed(2)} | ${report.lift.costPerConversion > 0 ? '+' : ''}${report.lift.costPerConversion.toFixed(1)}% |`
  )
  lines.push(
    `| ROAS | ${report.control.roas.toFixed(2)}x | ${report.treatment.roas.toFixed(2)}x | ${report.lift.roas > 0 ? '+' : ''}${report.lift.roas.toFixed(1)}% |`
  )
  lines.push('')

  // Summary
  lines.push('## Summary')
  lines.push('')
  lines.push(report.summary)
  lines.push('')

  // Recommendation
  lines.push('## Recommendation')
  lines.push('')
  lines.push(report.recommendation)
  lines.push('')

  // Learnings
  lines.push('## Key Learnings')
  lines.push('')
  for (const learning of report.learnings) {
    lines.push(`- ${learning}`)
  }
  lines.push('')

  // Footer
  lines.push('---')
  lines.push(`Report generated: ${new Date(report.generatedAt).toISOString()}`)

  return lines.join('\n')
}

/**
 * Format report as HTML for email
 */
export function formatReportAsHTML(report: ExperimentReport): string {
  const winnerColor = report.winner === 'treatment' ? '#22c55e' : report.winner === 'control' ? '#f97316' : '#6b7280'

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
    h2 { color: #374151; margin-top: 30px; }
    .winner-badge { display: inline-block; background: ${winnerColor}; color: white; padding: 4px 12px; border-radius: 4px; font-weight: 600; }
    .significance { font-size: 24px; font-weight: 700; color: ${report.statisticalSignificance >= 95 ? '#22c55e' : '#f97316'}; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; }
    .lift-positive { color: #22c55e; }
    .lift-negative { color: #ef4444; }
    .summary { background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .recommendation { background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .learning { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .footer { color: #6b7280; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <h1>📊 Experiment Report: ${report.experimentName}</h1>

  <p><strong>Hypothesis:</strong> ${report.hypothesis}</p>
  <p><strong>Duration:</strong> ${report.startDate} to ${report.endDate} (${report.durationDays} days)</p>

  <h2>Results</h2>
  <p><span class="winner-badge">${report.winner.toUpperCase()}</span></p>
  <p>Statistical Significance: <span class="significance">${report.statisticalSignificance}%</span></p>

  <h2>Metrics Comparison</h2>
  <table>
    <tr>
      <th>Metric</th>
      <th>Control</th>
      <th>Treatment</th>
      <th>Lift</th>
    </tr>
    <tr>
      <td>Impressions</td>
      <td>${report.control.impressions.toLocaleString()}</td>
      <td>${report.treatment.impressions.toLocaleString()}</td>
      <td>-</td>
    </tr>
    <tr>
      <td>Clicks</td>
      <td>${report.control.clicks.toLocaleString()}</td>
      <td>${report.treatment.clicks.toLocaleString()}</td>
      <td>-</td>
    </tr>
    <tr>
      <td>CTR</td>
      <td>${report.control.ctr}%</td>
      <td>${report.treatment.ctr}%</td>
      <td>-</td>
    </tr>
    <tr>
      <td>Conversions</td>
      <td>${report.control.conversions.toLocaleString()}</td>
      <td>${report.treatment.conversions.toLocaleString()}</td>
      <td class="${report.lift.conversions >= 0 ? 'lift-positive' : 'lift-negative'}">${report.lift.conversions >= 0 ? '+' : ''}${report.lift.conversions.toFixed(1)}%</td>
    </tr>
    <tr>
      <td>Cost</td>
      <td>₹${report.control.cost.toLocaleString()}</td>
      <td>₹${report.treatment.cost.toLocaleString()}</td>
      <td>-</td>
    </tr>
    <tr>
      <td>CPA</td>
      <td>₹${report.control.cpa.toFixed(2)}</td>
      <td>₹${report.treatment.cpa.toFixed(2)}</td>
      <td class="${report.lift.costPerConversion <= 0 ? 'lift-positive' : 'lift-negative'}">${report.lift.costPerConversion >= 0 ? '+' : ''}${report.lift.costPerConversion.toFixed(1)}%</td>
    </tr>
    <tr>
      <td>ROAS</td>
      <td>${report.control.roas.toFixed(2)}x</td>
      <td>${report.treatment.roas.toFixed(2)}x</td>
      <td class="${report.lift.roas >= 0 ? 'lift-positive' : 'lift-negative'}">${report.lift.roas >= 0 ? '+' : ''}${report.lift.roas.toFixed(1)}%</td>
    </tr>
  </table>

  <div class="summary">
    <h2 style="margin-top: 0;">Summary</h2>
    <p>${report.summary}</p>
  </div>

  <div class="recommendation">
    <h2 style="margin-top: 0;">Recommendation</h2>
    <p style="white-space: pre-line;">${report.recommendation}</p>
  </div>

  <h2>Key Learnings</h2>
  ${report.learnings.map((l) => `<div class="learning">• ${l}</div>`).join('')}

  <div class="footer">
    Report generated: ${new Date(report.generatedAt).toLocaleString()}<br>
    Experiment ID: ${report.experimentId}<br>
    Account: ${report.customerId}
  </div>
</body>
</html>
  `.trim()
}
