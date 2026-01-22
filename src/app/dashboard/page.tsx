'use client'

import dynamic from 'next/dynamic'

// Loading component
function LoadingState() {
  return (
    <div className="p-8 space-y-8 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-64 bg-[var(--bg-tertiary)] rounded" />
          <div className="h-4 w-96 bg-[var(--bg-tertiary)] rounded mt-2" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-32 bg-[var(--bg-tertiary)] rounded-lg" />
          <div className="h-10 w-32 bg-[var(--bg-tertiary)] rounded-lg" />
        </div>
      </div>

      {/* Banner */}
      <div className="h-32 bg-[var(--bg-tertiary)] rounded-2xl" />

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-[var(--bg-tertiary)] rounded-xl" />
        ))}
      </div>

      {/* Platform cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-48 bg-[var(--bg-tertiary)] rounded-xl" />
        <div className="h-48 bg-[var(--bg-tertiary)] rounded-xl" />
      </div>
    </div>
  )
}

// Dynamically import the actual content component with SSR disabled
const DashboardContent = dynamic(
  () => import('./DashboardContent'),
  {
    ssr: false,
    loading: () => <LoadingState />
  }
)

export default function DashboardOverview() {
  return <DashboardContent />
}
