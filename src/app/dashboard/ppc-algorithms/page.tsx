'use client'

import dynamic from 'next/dynamic'

// Loading component
function LoadingState() {
  return (
    <div className="p-8 space-y-8 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-56 bg-[var(--bg-tertiary)] rounded" />
          <div className="h-4 w-80 bg-[var(--bg-tertiary)] rounded mt-2" />
        </div>
        <div className="h-10 w-40 bg-[var(--bg-tertiary)] rounded-lg" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-[var(--bg-tertiary)] rounded-xl" />
        ))}
      </div>

      {/* Filters */}
      <div className="h-10 w-64 bg-[var(--bg-tertiary)] rounded-lg" />

      {/* Algorithm cards */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-32 bg-[var(--bg-tertiary)] rounded-xl" />
      ))}
    </div>
  )
}

// Dynamically import the actual content component with SSR disabled
const PPCAlgorithmsContent = dynamic(
  () => import('./PPCAlgorithmsContent'),
  {
    ssr: false,
    loading: () => <LoadingState />
  }
)

export default function PPCAlgorithmsPage() {
  return <PPCAlgorithmsContent />
}
