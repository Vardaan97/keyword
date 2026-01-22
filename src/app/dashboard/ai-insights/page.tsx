'use client'

import dynamic from 'next/dynamic'

// Loading component
function LoadingState() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-48 bg-[var(--bg-tertiary)] rounded" />
          <div className="h-4 w-96 bg-[var(--bg-tertiary)] rounded mt-2" />
        </div>
        <div className="h-10 w-40 bg-[var(--bg-tertiary)] rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-[var(--bg-tertiary)] rounded-xl" />
        ))}
      </div>
      <div className="h-16 bg-[var(--bg-tertiary)] rounded-xl" />
      <div className="h-64 bg-[var(--bg-tertiary)] rounded-xl" />
    </div>
  )
}

// Dynamically import the actual content component with SSR disabled
const AIInsightsContent = dynamic(
  () => import('./AIInsightsContent'),
  {
    ssr: false,
    loading: () => <LoadingState />
  }
)

export default function AIInsightsPage() {
  return <AIInsightsContent />
}
