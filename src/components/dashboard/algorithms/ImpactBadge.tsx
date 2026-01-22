'use client'

import { cn } from '@/lib/utils'

interface ImpactBadgeProps {
  impact: 'high' | 'medium' | 'low' | string
  label?: string
  size?: 'sm' | 'md'
}

const impactStyles = {
  high: {
    bg: 'bg-[var(--accent-rose)]/15',
    text: 'text-[var(--accent-rose)]',
    icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    label: 'High Impact',
  },
  medium: {
    bg: 'bg-[var(--accent-amber)]/15',
    text: 'text-[var(--accent-amber)]',
    icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    label: 'Medium Impact',
  },
  low: {
    bg: 'bg-[var(--accent-lime)]/15',
    text: 'text-[var(--accent-lime)]',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    label: 'Low Impact',
  },
}

export function ImpactBadge({ impact, label, size = 'md' }: ImpactBadgeProps) {
  // Normalize impact level
  const normalizedImpact = impact.toLowerCase().includes('high')
    ? 'high'
    : impact.toLowerCase().includes('medium')
    ? 'medium'
    : 'low'

  const styles = impactStyles[normalizedImpact]
  const displayLabel = label || styles.label

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        styles.bg,
        styles.text,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      )}
    >
      <svg
        className={cn('flex-shrink-0', size === 'sm' ? 'w-3 h-3' : 'w-4 h-4')}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={styles.icon} />
      </svg>
      {displayLabel}
    </span>
  )
}

// Variant for inline text usage
export function ImpactIndicator({ impact }: { impact: 'high' | 'medium' | 'low' }) {
  const styles = impactStyles[impact]

  return (
    <span className={cn('inline-flex items-center gap-1', styles.text)}>
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={styles.icon} />
      </svg>
    </span>
  )
}
