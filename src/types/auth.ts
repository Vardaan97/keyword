/**
 * Google Ads Authentication Types
 */

export interface TokenStatus {
  hasToken: boolean
  source: 'runtime' | 'env' | 'none'
  tokenValid?: boolean
  updatedAt?: string
  updatedBy?: string
  expiresIn?: number
  lastVerified?: string
  config: {
    hasClientId: boolean
    hasClientSecret: boolean
    hasDeveloperToken: boolean
    hasLoginCustomerId: boolean
    hasCustomerId: boolean
  }
}

export interface ConnectionTestResult {
  success: boolean
  message: string
  accountName?: string
  customerId?: string
  error?: string
  errorCode?: string
  suggestion?: string
  timestamp: string
}

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
  action?: { label: string; href: string }
  duration?: number
}

export interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}
