'use client'

import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  value: string | number
  change?: {
    value: number
    type: 'increase' | 'decrease' | 'neutral'
  }
  icon?: React.ReactNode
  variant?: 'default' | 'electric' | 'lime' | 'amber' | 'rose'
  loading?: boolean
  className?: string
}

const variantStyles = {
  default: {
    bg: 'bg-[var(--bg-elevated)]',
    iconBg: 'bg-[var(--bg-hover)]',
    iconColor: 'text-[var(--text-secondary)]',
  },
  electric: {
    bg: 'bg-[var(--accent-electric)]/5 border-[var(--accent-electric)]/20',
    iconBg: 'bg-[var(--accent-electric)]/10',
    iconColor: 'text-[var(--accent-electric)]',
  },
  lime: {
    bg: 'bg-[var(--accent-lime)]/5 border-[var(--accent-lime)]/20',
    iconBg: 'bg-[var(--accent-lime)]/10',
    iconColor: 'text-[var(--accent-lime)]',
  },
  amber: {
    bg: 'bg-[var(--accent-amber)]/5 border-[var(--accent-amber)]/20',
    iconBg: 'bg-[var(--accent-amber)]/10',
    iconColor: 'text-[var(--accent-amber)]',
  },
  rose: {
    bg: 'bg-[var(--accent-rose)]/5 border-[var(--accent-rose)]/20',
    iconBg: 'bg-[var(--accent-rose)]/10',
    iconColor: 'text-[var(--accent-rose)]',
  },
}

export function MetricCard({
  title,
  value,
  change,
  icon,
  variant = 'default',
  loading = false,
  className,
}: MetricCardProps) {
  const styles = variantStyles[variant]

  return (
    <div
      className={cn(
        'relative rounded-xl border border-[var(--border-subtle)] p-5 transition-all duration-200 hover:border-[var(--border-default)]',
        styles.bg,
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-[var(--text-muted)] mb-1">{title}</p>
          {loading ? (
            <div className="h-8 w-24 bg-[var(--bg-hover)] rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-display font-bold text-[var(--text-primary)]">{value}</p>
          )}
          {change && !loading && (
            <div className="flex items-center gap-1 mt-2">
              <span
                className={cn(
                  'text-xs font-medium',
                  change.type === 'increase' && 'text-[var(--accent-lime)]',
                  change.type === 'decrease' && 'text-[var(--accent-rose)]',
                  change.type === 'neutral' && 'text-[var(--text-muted)]'
                )}
              >
                {change.type === 'increase' && (
                  <svg className="w-3 h-3 inline mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                )}
                {change.type === 'decrease' && (
                  <svg className="w-3 h-3 inline mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                )}
                {change.value > 0 ? '+' : ''}{change.value}%
              </span>
              <span className="text-xs text-[var(--text-muted)]">vs last period</span>
            </div>
          )}
        </div>
        {icon && (
          <div className={cn('p-2.5 rounded-lg', styles.iconBg)}>
            <span className={styles.iconColor}>{icon}</span>
          </div>
        )}
      </div>
    </div>
  )
}
