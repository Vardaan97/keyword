/**
 * usePrompts Hook
 *
 * Fetches prompts from Convex with fallback to defaults.
 * Provides methods to save new versions and rollback.
 */

import { useState, useEffect, useCallback } from 'react'
import { PromptConfig } from '@/types'
import { DEFAULT_SEED_PROMPT, DEFAULT_ANALYSIS_PROMPT } from '@/lib/prompts'

export interface ConvexPrompt {
  _id: string
  type: 'seed' | 'analysis'
  name: string
  description: string
  prompt: string
  variables: string[]
  version: number
  isActive: boolean
  createdAt: number
  createdBy?: string
}

export interface PromptVersion {
  _id: string
  version: number
  name: string
  createdAt: number
  createdBy?: string
  isActive: boolean
  promptPreview: string // First 100 chars
}

interface UsePromptsReturn {
  // Current active prompts
  seedPrompt: PromptConfig
  analysisPrompt: PromptConfig

  // Version info
  seedVersion: number
  analysisVersion: number

  // Loading states
  isLoading: boolean
  isSaving: boolean
  error: string | null

  // Convex connection status
  isConvexAvailable: boolean
  needsSeeding: boolean

  // Actions
  savePrompt: (type: 'seed' | 'analysis', prompt: PromptConfig) => Promise<{ success: boolean; version?: number; error?: string }>
  rollbackPrompt: (type: 'seed' | 'analysis', version: number) => Promise<{ success: boolean; error?: string }>
  fetchVersionHistory: (type: 'seed' | 'analysis', limit?: number) => Promise<PromptVersion[]>
  refreshPrompts: () => Promise<void>
  seedDefaults: () => Promise<void>
}

export function usePrompts(): UsePromptsReturn {
  const [seedPrompt, setSeedPrompt] = useState<PromptConfig>(DEFAULT_SEED_PROMPT)
  const [analysisPrompt, setAnalysisPrompt] = useState<PromptConfig>(DEFAULT_ANALYSIS_PROMPT)
  const [seedVersion, setSeedVersion] = useState(0)
  const [analysisVersion, setAnalysisVersion] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConvexAvailable, setIsConvexAvailable] = useState(false)
  const [needsSeeding, setNeedsSeeding] = useState(false)

  // Fetch prompts from API
  const fetchPrompts = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/prompts')
      if (!response.ok) {
        throw new Error('Failed to fetch prompts')
      }

      const data = await response.json()

      // Check if Convex is available
      setIsConvexAvailable(!data.needsSeeding || data.seed !== null || data.analysis !== null)
      setNeedsSeeding(data.needsSeeding || false)

      // Set seed prompt
      if (data.seed) {
        setSeedPrompt({
          id: data.seed._id || 'seed-generator',
          name: data.seed.name,
          description: data.seed.description,
          prompt: data.seed.prompt,
          variables: data.seed.variables,
          lastUpdated: new Date(data.seed.createdAt).toISOString()
        })
        setSeedVersion(data.seed.version || 0)
      } else if (data.defaults?.seed) {
        setSeedPrompt({
          id: 'seed-generator',
          name: data.defaults.seed.name,
          description: data.defaults.seed.description,
          prompt: data.defaults.seed.prompt,
          variables: data.defaults.seed.variables,
          lastUpdated: new Date().toISOString()
        })
        setSeedVersion(0)
      }

      // Set analysis prompt
      if (data.analysis) {
        setAnalysisPrompt({
          id: data.analysis._id || 'keyword-analyzer',
          name: data.analysis.name,
          description: data.analysis.description,
          prompt: data.analysis.prompt,
          variables: data.analysis.variables,
          lastUpdated: new Date(data.analysis.createdAt).toISOString()
        })
        setAnalysisVersion(data.analysis.version || 0)
      } else if (data.defaults?.analysis) {
        setAnalysisPrompt({
          id: 'keyword-analyzer',
          name: data.defaults.analysis.name,
          description: data.defaults.analysis.description,
          prompt: data.defaults.analysis.prompt,
          variables: data.defaults.analysis.variables,
          lastUpdated: new Date().toISOString()
        })
        setAnalysisVersion(0)
      }

    } catch (err) {
      console.error('[usePrompts] Error fetching prompts:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch prompts')
      // Keep defaults on error
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch prompts on mount
  useEffect(() => {
    fetchPrompts()
  }, [fetchPrompts])

  // Save a new version of a prompt
  const savePrompt = useCallback(async (
    type: 'seed' | 'analysis',
    prompt: PromptConfig
  ): Promise<{ success: boolean; version?: number; error?: string }> => {
    try {
      setIsSaving(true)
      setError(null)

      const response = await fetch(`/api/prompts/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: prompt.name,
          description: prompt.description,
          prompt: prompt.prompt,
          variables: prompt.variables
        })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save prompt')
      }

      // Update local state
      if (type === 'seed') {
        setSeedPrompt({ ...prompt, lastUpdated: new Date().toISOString() })
        setSeedVersion(result.version)
      } else {
        setAnalysisPrompt({ ...prompt, lastUpdated: new Date().toISOString() })
        setAnalysisVersion(result.version)
      }

      return { success: true, version: result.version }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save prompt'
      setError(errorMsg)
      return { success: false, error: errorMsg }
    } finally {
      setIsSaving(false)
    }
  }, [])

  // Rollback to a specific version
  const rollbackPrompt = useCallback(async (
    type: 'seed' | 'analysis',
    version: number
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsSaving(true)
      setError(null)

      const response = await fetch(`/api/prompts/${type}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to rollback prompt')
      }

      // Refresh prompts to get the rolled-back version
      await fetchPrompts()

      return { success: true }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to rollback prompt'
      setError(errorMsg)
      return { success: false, error: errorMsg }
    } finally {
      setIsSaving(false)
    }
  }, [fetchPrompts])

  // Fetch version history for a prompt type
  const fetchVersionHistory = useCallback(async (
    type: 'seed' | 'analysis',
    limit: number = 20
  ): Promise<PromptVersion[]> => {
    try {
      const response = await fetch(`/api/prompts/${type}/versions?limit=${limit}`)

      if (!response.ok) {
        throw new Error('Failed to fetch version history')
      }

      const result = await response.json()

      return (result.versions || []).map((v: ConvexPrompt) => ({
        _id: v._id,
        version: v.version,
        name: v.name,
        createdAt: v.createdAt,
        createdBy: v.createdBy,
        isActive: v.isActive,
        promptPreview: v.prompt.substring(0, 100) + (v.prompt.length > 100 ? '...' : '')
      }))
    } catch (err) {
      console.error('[usePrompts] Error fetching version history:', err)
      return []
    }
  }, [])

  // Seed default prompts into Convex
  const seedDefaults = useCallback(async () => {
    try {
      setIsSaving(true)
      setError(null)

      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedPrompt: DEFAULT_SEED_PROMPT,
          analysisPrompt: DEFAULT_ANALYSIS_PROMPT
        })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to seed defaults')
      }

      // Refresh prompts
      await fetchPrompts()
      setNeedsSeeding(false)
    } catch (err) {
      console.error('[usePrompts] Error seeding defaults:', err)
      setError(err instanceof Error ? err.message : 'Failed to seed defaults')
    } finally {
      setIsSaving(false)
    }
  }, [fetchPrompts])

  return {
    seedPrompt,
    analysisPrompt,
    seedVersion,
    analysisVersion,
    isLoading,
    isSaving,
    error,
    isConvexAvailable,
    needsSeeding,
    savePrompt,
    rollbackPrompt,
    fetchVersionHistory,
    refreshPrompts: fetchPrompts,
    seedDefaults
  }
}
