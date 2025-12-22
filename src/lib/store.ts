import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  PromptConfig,
  ResearchSession,
  CourseInput,
  SeedKeyword,
  KeywordIdea,
  AnalyzedKeyword,
  RateLimitStatus,
  BatchCourseItem
} from '@/types'
import { DEFAULT_SEED_PROMPT, DEFAULT_ANALYSIS_PROMPT } from './prompts'
import { generateId } from './utils'
import { AIProvider } from './ai-client'

// Data source types
export type DataSourceType = 'auto' | 'google' | 'keywords_everywhere'
export type CountryCode = 'india' | 'usa' | 'uk' | 'uae' | 'singapore' | 'australia' | 'canada' | 'germany' | 'malaysia' | 'saudi' | 'global'

export const COUNTRY_OPTIONS: { value: CountryCode; label: string; flag: string }[] = [
  { value: 'india', label: 'India', flag: '🇮🇳' },
  { value: 'usa', label: 'United States', flag: '🇺🇸' },
  { value: 'uk', label: 'United Kingdom', flag: '🇬🇧' },
  { value: 'uae', label: 'UAE', flag: '🇦🇪' },
  { value: 'singapore', label: 'Singapore', flag: '🇸🇬' },
  { value: 'australia', label: 'Australia', flag: '🇦🇺' },
  { value: 'canada', label: 'Canada', flag: '🇨🇦' },
  { value: 'germany', label: 'Germany', flag: '🇩🇪' },
  { value: 'malaysia', label: 'Malaysia', flag: '🇲🇾' },
  { value: 'saudi', label: 'Saudi Arabia', flag: '🇸🇦' },
  { value: 'global', label: 'Global', flag: '🌍' }
]

export const DATA_SOURCE_OPTIONS: { value: DataSourceType; label: string; description: string; creditCost?: string }[] = [
  { value: 'auto', label: 'Auto', description: 'Google Ads first, fallback to Keywords Everywhere' },
  { value: 'google', label: 'Google Ads', description: 'Official Google Keyword Planner data (free)' },
  { value: 'keywords_everywhere', label: 'Keywords Everywhere', description: 'Alternative data source', creditCost: '~1 credit/keyword' }
]

// AI Provider options
export const AI_PROVIDER_OPTIONS: { value: AIProvider; label: string; description: string; model: string }[] = [
  { value: 'openrouter', label: 'OpenRouter', description: 'Gemini 2.0 Flash - Fast & cost-effective', model: 'google/gemini-2.0-flash-001' },
  { value: 'openai', label: 'OpenAI', description: 'GPT-4o - High quality', model: 'gpt-4o' }
]

interface AppState {
  // Prompts
  seedPrompt: PromptConfig
  analysisPrompt: PromptConfig
  setSeedPrompt: (prompt: PromptConfig) => void
  setAnalysisPrompt: (prompt: PromptConfig) => void
  resetPrompts: () => void

  // Data Source Settings
  dataSource: DataSourceType
  targetCountry: CountryCode
  setDataSource: (source: DataSourceType) => void
  setTargetCountry: (country: CountryCode) => void

  // AI Provider Settings
  aiProvider: AIProvider
  setAiProvider: (provider: AIProvider) => void

  // Current Session
  currentSession: ResearchSession | null
  setCurrentSession: (session: ResearchSession | null) => void
  updateSessionStatus: (status: ResearchSession['status'], error?: string) => void
  setSeedKeywords: (keywords: SeedKeyword[]) => void
  setKeywordIdeas: (ideas: KeywordIdea[]) => void
  setAnalyzedKeywords: (keywords: AnalyzedKeyword[]) => void

  // Session History
  sessionHistory: ResearchSession[]
  addToHistory: (session: ResearchSession) => void
  removeFromHistory: (sessionId: string) => void
  clearHistory: () => void
  loadSession: (sessionId: string) => void

  // Create new session
  createSession: (courseInput: CourseInput) => ResearchSession

  // Rate Limiting
  rateLimitStatus: RateLimitStatus
  updateRateLimitStatus: (status: Partial<RateLimitStatus>) => void

  // UI State
  activeTab: string
  setActiveTab: (tab: string) => void
  isProcessing: boolean
  setIsProcessing: (processing: boolean) => void

  // Batch Items (persisted for session recovery)
  savedBatchItems: BatchCourseItem[]
  setSavedBatchItems: (items: BatchCourseItem[]) => void
  clearSavedBatchItems: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Prompts
      seedPrompt: DEFAULT_SEED_PROMPT,
      analysisPrompt: DEFAULT_ANALYSIS_PROMPT,

      setSeedPrompt: (prompt) => set({ seedPrompt: { ...prompt, lastUpdated: new Date().toISOString() } }),
      setAnalysisPrompt: (prompt) => set({ analysisPrompt: { ...prompt, lastUpdated: new Date().toISOString() } }),
      resetPrompts: () => set({
        seedPrompt: DEFAULT_SEED_PROMPT,
        analysisPrompt: DEFAULT_ANALYSIS_PROMPT
      }),

      // Data Source Settings
      dataSource: 'auto',
      targetCountry: 'india',
      setDataSource: (source) => set({ dataSource: source }),
      setTargetCountry: (country) => set({ targetCountry: country }),

      // AI Provider Settings (default to openrouter for cost-effectiveness)
      aiProvider: 'openrouter',
      setAiProvider: (provider) => set({ aiProvider: provider }),

      // Current Session
      currentSession: null,

      setCurrentSession: (session) => set({ currentSession: session }),

      updateSessionStatus: (status, error) => {
        const current = get().currentSession
        if (current) {
          set({
            currentSession: {
              ...current,
              status,
              error: error || current.error
            }
          })
        }
      },

      setSeedKeywords: (keywords) => {
        const current = get().currentSession
        if (current) {
          set({ currentSession: { ...current, seedKeywords: keywords } })
        }
      },

      setKeywordIdeas: (ideas) => {
        const current = get().currentSession
        if (current) {
          set({ currentSession: { ...current, keywordIdeas: ideas } })
        }
      },

      setAnalyzedKeywords: (keywords) => {
        const current = get().currentSession
        if (current) {
          const updatedSession = { ...current, analyzedKeywords: keywords, status: 'completed' as const }
          set({ currentSession: updatedSession })
          // Auto-save to history when completed
          get().addToHistory(updatedSession)
        }
      },

      // Session History
      sessionHistory: [],

      addToHistory: (session) => {
        const history = get().sessionHistory
        // Check if session already exists
        const existingIndex = history.findIndex(s => s.id === session.id)
        if (existingIndex >= 0) {
          // Update existing
          const newHistory = [...history]
          newHistory[existingIndex] = session
          set({ sessionHistory: newHistory })
        } else {
          // Add new (max 50 sessions)
          set({ sessionHistory: [session, ...history].slice(0, 50) })
        }
      },

      removeFromHistory: (sessionId) => {
        set({ sessionHistory: get().sessionHistory.filter(s => s.id !== sessionId) })
      },

      clearHistory: () => set({ sessionHistory: [] }),

      loadSession: (sessionId) => {
        const session = get().sessionHistory.find(s => s.id === sessionId)
        if (session) {
          set({ currentSession: session })
        }
      },

      // Create new session
      createSession: (courseInput) => {
        const session: ResearchSession = {
          id: generateId(),
          createdAt: new Date().toISOString(),
          courseInput,
          seedKeywords: [],
          keywordIdeas: [],
          analyzedKeywords: [],
          status: 'pending'
        }
        set({ currentSession: session })
        return session
      },

      // Rate Limiting
      rateLimitStatus: {
        requestsRemaining: 100,
        resetTime: Date.now() + 60000,
        isLimited: false
      },

      updateRateLimitStatus: (status) => {
        set({ rateLimitStatus: { ...get().rateLimitStatus, ...status } })
      },

      // UI State
      activeTab: 'research',
      setActiveTab: (tab) => set({ activeTab: tab }),
      isProcessing: false,
      setIsProcessing: (processing) => set({ isProcessing: processing }),

      // Batch Items (persisted for session recovery)
      savedBatchItems: [],
      setSavedBatchItems: (items) => set({ savedBatchItems: items }),
      clearSavedBatchItems: () => set({ savedBatchItems: [] })
    }),
    {
      name: 'keyword-planner-storage',
      partialize: (state) => ({
        seedPrompt: state.seedPrompt,
        analysisPrompt: state.analysisPrompt,
        sessionHistory: state.sessionHistory,
        dataSource: state.dataSource,
        targetCountry: state.targetCountry,
        aiProvider: state.aiProvider,
        savedBatchItems: state.savedBatchItems
      })
    }
  )
)
