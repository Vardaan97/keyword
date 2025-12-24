"use client"

import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ERROR BOUNDARY] Uncaught error:', error, errorInfo)
    this.setState({ error, errorInfo })
  }

  private handleCopy = () => {
    const { error, errorInfo } = this.state
    const errorText = `
=== ERROR REPORT ===
Timestamp: ${new Date().toISOString()}
URL: ${typeof window !== 'undefined' ? window.location.href : 'N/A'}

Error Message:
${error?.message || 'Unknown error'}

Error Stack:
${error?.stack || 'No stack trace'}

Component Stack:
${errorInfo?.componentStack || 'No component stack'}
===================
`.trim()

    navigator.clipboard.writeText(errorText).then(() => {
      alert('Error details copied to clipboard!')
    }).catch(() => {
      // Fallback: show in prompt
      prompt('Copy the error details:', errorText)
    })
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  public render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state

      return (
        <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-[var(--accent-rose)]/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--accent-rose)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)]">Application Error</h1>
                <p className="text-sm text-[var(--text-muted)]">Something went wrong. You can copy the error details below.</p>
              </div>
            </div>

            {/* Error Message */}
            <div className="mb-4">
              <p className="text-sm font-medium text-[var(--text-secondary)] mb-2">Error Message:</p>
              <div className="p-3 bg-[var(--accent-rose)]/10 border border-[var(--accent-rose)]/30 rounded-lg">
                <code className="text-sm text-[var(--accent-rose)] break-all">
                  {error?.message || 'Unknown error'}
                </code>
              </div>
            </div>

            {/* Error Stack (collapsible) */}
            <details className="mb-4">
              <summary className="text-sm font-medium text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]">
                Stack Trace (click to expand)
              </summary>
              <div className="mt-2 p-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg overflow-x-auto">
                <pre className="text-xs text-[var(--text-muted)] whitespace-pre-wrap break-all">
                  {error?.stack || 'No stack trace available'}
                </pre>
              </div>
            </details>

            {/* Component Stack (collapsible) */}
            {errorInfo?.componentStack && (
              <details className="mb-6">
                <summary className="text-sm font-medium text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]">
                  Component Stack (click to expand)
                </summary>
                <div className="mt-2 p-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg overflow-x-auto">
                  <pre className="text-xs text-[var(--text-muted)] whitespace-pre-wrap break-all">
                    {errorInfo.componentStack}
                  </pre>
                </div>
              </details>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={this.handleCopy}
                className="flex-1 px-4 py-2 bg-[var(--accent-electric)] text-white rounded-lg hover:bg-[var(--accent-electric)]/90 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                Copy Error Details
              </button>
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--bg-tertiary)]/80 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-[var(--accent-lime)] text-black rounded-lg hover:bg-[var(--accent-lime)]/90 transition-colors"
              >
                Reload Page
              </button>
            </div>

            {/* Instructions */}
            <div className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
              <p className="text-xs text-[var(--text-muted)]">
                To report this error, click "Copy Error Details" and paste the content when sharing with support.
              </p>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
