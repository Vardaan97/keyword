"use client"

import { Progress } from "@/components/ui/progress"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, Circle, Loader2 } from "lucide-react"

interface ResearchProgressProps {
  status: 'pending' | 'generating_seeds' | 'fetching_keywords' | 'analyzing' | 'completed' | 'error'
  seedCount?: number
  keywordCount?: number
  error?: string
}

const steps = [
  { key: 'generating_seeds', label: 'Generating Seed Keywords', description: 'AI generates high-intent seed keywords' },
  { key: 'fetching_keywords', label: 'Fetching Keyword Ideas', description: 'Google Keyword Planner API lookup' },
  { key: 'analyzing', label: 'Analyzing Keywords', description: 'AI scores and categorizes keywords' },
  { key: 'completed', label: 'Analysis Complete', description: 'Results ready for export' }
]

export function ResearchProgress({ status, seedCount, keywordCount, error }: ResearchProgressProps) {
  const getStepStatus = (stepKey: string) => {
    const stepOrder = ['pending', 'generating_seeds', 'fetching_keywords', 'analyzing', 'completed']
    const currentIndex = stepOrder.indexOf(status)
    const stepIndex = stepOrder.indexOf(stepKey)

    if (status === 'error') return 'error'
    if (stepIndex < currentIndex) return 'completed'
    if (stepIndex === currentIndex) return 'active'
    return 'pending'
  }

  const getProgressValue = () => {
    switch (status) {
      case 'pending': return 0
      case 'generating_seeds': return 25
      case 'fetching_keywords': return 50
      case 'analyzing': return 75
      case 'completed': return 100
      case 'error': return 0
      default: return 0
    }
  }

  if (status === 'pending') return null

  return (
    <Card className="border-blue-100 bg-gradient-to-r from-blue-50/50 to-indigo-50/50">
      <CardContent className="pt-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Research Progress</span>
            <span className="text-sm text-gray-500">{getProgressValue()}%</span>
          </div>
          <Progress value={getProgressValue()} className="h-2" />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="space-y-3">
          {steps.map((step) => {
            const stepStatus = getStepStatus(step.key)
            return (
              <div
                key={step.key}
                className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                  stepStatus === 'active' ? 'bg-white shadow-sm' : ''
                }`}
              >
                <div className="mt-0.5">
                  {stepStatus === 'completed' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : stepStatus === 'active' ? (
                    <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-300" />
                  )}
                </div>
                <div className="flex-1">
                  <div className={`font-medium ${
                    stepStatus === 'completed' ? 'text-emerald-700' :
                    stepStatus === 'active' ? 'text-blue-700' : 'text-gray-400'
                  }`}>
                    {step.label}
                    {step.key === 'generating_seeds' && seedCount !== undefined && (
                      <span className="ml-2 text-sm font-normal">({seedCount} keywords)</span>
                    )}
                    {step.key === 'fetching_keywords' && keywordCount !== undefined && (
                      <span className="ml-2 text-sm font-normal">({keywordCount} ideas found)</span>
                    )}
                  </div>
                  <div className={`text-sm ${
                    stepStatus === 'active' ? 'text-gray-600' : 'text-gray-400'
                  }`}>
                    {step.description}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
