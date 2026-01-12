'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import type { Toast, ToastContextType, ToastType } from '@/types/auth'

// Create context
const ToastContext = createContext<ToastContextType | null>(null)

// Hook to use toast
export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

// Generate unique ID
function generateId() {
  return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Toast item component
function ToastItem({
  toast,
  onRemove
}: {
  toast: Toast
  onRemove: () => void
}) {
  const bgColors: Record<ToastType, string> = {
    success: 'rgba(16, 185, 129, 0.95)',
    error: 'rgba(239, 68, 68, 0.95)',
    warning: 'rgba(245, 158, 11, 0.95)',
    info: 'rgba(59, 130, 246, 0.95)'
  }

  const icons: Record<ToastType, string> = {
    success: '✓',
    error: '✗',
    warning: '⚠',
    info: 'ℹ'
  }

  return (
    <div
      className="flex items-start gap-3 p-4 rounded-lg shadow-lg text-white animate-slide-in"
      style={{
        background: bgColors[toast.type],
        backdropFilter: 'blur(8px)',
        minWidth: '300px',
        maxWidth: '400px'
      }}
    >
      <span className="text-lg flex-shrink-0">{icons[toast.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{toast.message}</p>
        {toast.action && (
          <a
            href={toast.action.href}
            className="text-xs underline mt-1 inline-block opacity-90 hover:opacity-100"
          >
            {toast.action.label}
          </a>
        )}
      </div>
      <button
        onClick={onRemove}
        className="text-white opacity-70 hover:opacity-100 flex-shrink-0"
      >
        ✕
      </button>
    </div>
  )
}

// Provider component
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = generateId()
    const newToast: Toast = { ...toast, id }

    setToasts(prev => [...prev, newToast])

    // Auto-remove after duration (default 5 seconds)
    const duration = toast.duration ?? 5000
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}

      {/* Toast container */}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
        style={{ pointerEvents: 'none' }}
      >
        {toasts.map(toast => (
          <div key={toast.id} style={{ pointerEvents: 'auto' }}>
            <ToastItem
              toast={toast}
              onRemove={() => removeToast(toast.id)}
            />
          </div>
        ))}
      </div>

      {/* Animation styles */}
      <style jsx global>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </ToastContext.Provider>
  )
}

// Utility function to show toasts from anywhere
let globalAddToast: ((toast: Omit<Toast, 'id'>) => void) | null = null

export function setGlobalToast(addToast: (toast: Omit<Toast, 'id'>) => void) {
  globalAddToast = addToast
}

export function showToast(toast: Omit<Toast, 'id'>) {
  if (globalAddToast) {
    globalAddToast(toast)
  } else {
    console.warn('Toast provider not initialized')
  }
}
