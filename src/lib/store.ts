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
import { GOOGLE_ADS_ACCOUNTS, GoogleAdsAccount } from './google-ads'

// Data source types
export type DataSourceType = 'auto' | 'google' | 'keywords_everywhere'
export type CountryCode = 'india' | 'usa' | 'uk' | 'uae' | 'singapore' | 'australia' | 'canada' | 'germany' | 'malaysia' | 'saudi' | 'global'

// Theme types
export type ThemeType = 'dark' | 'light' | 'koenig' | 'blue'

export const THEME_OPTIONS: { value: ThemeType; label: string; description: string }[] = [
  { value: 'dark', label: 'Dark', description: 'Default dark theme' },
  { value: 'light', label: 'Light', description: 'Clean light theme' },
  { value: 'koenig', label: 'Koenig', description: 'Koenig Solutions brand colors' },
  { value: 'blue', label: 'Blue', description: 'Professional blue theme' }
]

// Re-export Google Ads accounts for easy access
export { GOOGLE_ADS_ACCOUNTS }
export type { GoogleAdsAccount }

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
  { value: 'openrouter', label: 'OpenRouter', description: 'GPT-4o Mini via OpenRouter - Cost-effective', model: 'openai/gpt-4o-mini' },
  { value: 'openai', label: 'OpenAI Direct', description: 'GPT-4o Mini - Fast & reliable', model: 'gpt-4o-mini' }
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

  // Google Ads Account Selection (for "in account" check)
  selectedGoogleAdsAccountId: string
  setSelectedGoogleAdsAccountId: (accountId: string) => void
  getSelectedGoogleAdsAccount: () => GoogleAdsAccount | undefined

  // AI Provider Settings
  aiProvider: AIProvider
  setAiProvider: (provider: AIProvider) => void

  // Theme Settings
  theme: ThemeType
  setTheme: (theme: ThemeType) => void

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

      // Google Ads Account Selection (default to Bouquet INR - has most keywords)
      selectedGoogleAdsAccountId: 'bouquet-inr',
      setSelectedGoogleAdsAccountId: (accountId) => set({ selectedGoogleAdsAccountId: accountId }),
      getSelectedGoogleAdsAccount: () => {
        const accountId = get().selectedGoogleAdsAccountId
        return GOOGLE_ADS_ACCOUNTS.find(acc => acc.id === accountId)
      },

      // AI Provider Settings (default to openrouter for cost-effectiveness)
      aiProvider: 'openrouter',
      setAiProvider: (provider) => set({ aiProvider: provider }),

      // Theme Settings (default to dark)
      theme: 'dark',
      setTheme: (theme) => set({ theme }),

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
      // NOTE: To avoid localStorage quota errors, we only store session METADATA
      // Full keyword data should be retrieved from the database if needed
      sessionHistory: [],

      addToHistory: (session) => {
        const history = get().sessionHistory

        // Create a lightweight version WITHOUT large keyword arrays
        // This prevents localStorage quota exceeded errors
        const lightweightSession: ResearchSession = {
          ...session,
          // Keep only a small sample of keywords for preview (max 10)
          keywordIdeas: session.keywordIdeas.slice(0, 10),
          analyzedKeywords: session.analyzedKeywords.slice(0, 10),
        }

        // Check if session already exists
        const existingIndex = history.findIndex(s => s.id === session.id)
        if (existingIndex >= 0) {
          // Update existing
          const newHistory = [...history]
          newHistory[existingIndex] = lightweightSession
          set({ sessionHistory: newHistory })
        } else {
          // Add new (max 20 sessions to keep storage small)
          set({ sessionHistory: [lightweightSession, ...history].slice(0, 20) })
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
      // NOTE: We only save lightweight metadata to avoid localStorage quota errors
      savedBatchItems: [],
      setSavedBatchItems: (items) => {
        // Create lightweight versions to save storage space
        const lightweightItems = items.map(item => ({
          ...item,
          // Don't persist large keyword arrays - just keep counts
          keywordIdeas: item.keywordIdeas?.slice(0, 5) || [],
          analyzedKeywords: item.analyzedKeywords?.slice(0, 5) || [],
        }))
        set({ savedBatchItems: lightweightItems.slice(0, 20) }) // Max 20 items
      },
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
        selectedGoogleAdsAccountId: state.selectedGoogleAdsAccountId,
        aiProvider: state.aiProvider,
        theme: state.theme,
        // Don't persist savedBatchItems to localStorage - they're in-memory only
        // This prevents quota issues when processing large batches
        // savedBatchItems: state.savedBatchItems  // DISABLED
      }),
      // Handle storage errors gracefully (including SSR where localStorage doesn't exist)
      storage: {
        getItem: (name) => {
          if (typeof window === 'undefined') return null
          try {
            const str = localStorage.getItem(name)
            return str ? JSON.parse(str) : null
          } catch (error) {
            console.error('[STORE] Failed to read from localStorage:', error)
            return null
          }
        },
        setItem: (name, value) => {
          if (typeof window === 'undefined') return
          try {
            localStorage.setItem(name, JSON.stringify(value))
          } catch (error) {
            console.error('[STORE] Failed to write to localStorage (quota exceeded?):', error)
            // Try to clear old data and retry
            try {
              // Clear session history to make space
              const current = JSON.parse(localStorage.getItem(name) || '{}')
              if (current.state) {
                current.state.sessionHistory = []
              }
              localStorage.setItem(name, JSON.stringify(current))
              console.log('[STORE] Cleared session history to make space')
            } catch {
              // Last resort: clear everything
              localStorage.removeItem(name)
              console.log('[STORE] Cleared all storage due to quota error')
            }
          }
        },
        removeItem: (name) => {
          if (typeof window === 'undefined') return
          try {
            localStorage.removeItem(name)
          } catch (error) {
            console.error('[STORE] Failed to remove from localStorage:', error)
          }
        },
      }
    }
  )
)
