"use client"

import { Card, CardContent } from "@/components/ui/card"
import { AnalyzedKeyword } from "@/types"
import {
  TrendingUp,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye
} from "lucide-react"

interface StatsSummaryProps {
  keywords: AnalyzedKeyword[]
}

export function StatsSummary({ keywords }: StatsSummaryProps) {
  const stats = {
    total: keywords.length,
    toAdd: keywords.filter(k => k.action === 'ADD').length,
    toBoost: keywords.filter(k => k.action === 'BOOST').length,
    toMonitor: keywords.filter(k => k.action === 'MONITOR').length,
    toReview: keywords.filter(k => k.action === 'REVIEW').length,
    excluded: keywords.filter(k => k.action === 'EXCLUDE' || k.action === 'EXCLUDE_RELEVANCE').length,
    urgent: keywords.filter(k => k.priority?.includes('URGENT')).length,
    highPriority: keywords.filter(k => k.priority?.includes('HIGH')).length,
    tier1: keywords.filter(k => k.tier === 'Tier 1').length,
    tier2: keywords.filter(k => k.tier === 'Tier 2').length,
    avgScore: keywords.length > 0
      ? Math.round(keywords.reduce((sum, k) => sum + k.finalScore, 0) / keywords.length)
      : 0
  }

  const statCards = [
    {
      label: 'Keywords to Add',
      value: stats.toAdd,
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      description: 'New keywords ready to add'
    },
    {
      label: 'Urgent Priority',
      value: stats.urgent,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      description: 'Add immediately'
    },
    {
      label: 'High Priority',
      value: stats.highPriority,
      icon: TrendingUp,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      description: 'Add this week'
    },
    {
      label: 'Tier 1 Keywords',
      value: stats.tier1,
      icon: Target,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      description: 'Exact match candidates'
    },
    {
      label: 'For Review',
      value: stats.toReview,
      icon: Eye,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      description: 'Manual review needed'
    },
    {
      label: 'Excluded',
      value: stats.excluded,
      icon: XCircle,
      color: 'text-gray-500',
      bgColor: 'bg-gray-50',
      description: 'Not relevant/negative'
    }
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {statCards.map((stat) => (
        <Card key={stat.label} className="relative overflow-hidden">
          <CardContent className="p-4">
            <div className={`absolute top-0 right-0 w-16 h-16 -mr-4 -mt-4 rounded-full ${stat.bgColor} opacity-50`} />
            <div className="relative">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {stat.label}
                </span>
              </div>
              <div className={`text-3xl font-bold ${stat.color}`}>
                {stat.value}
              </div>
              <p className="text-xs text-gray-400 mt-1">{stat.description}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
