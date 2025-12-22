// Keyword Research Types

export interface CourseInput {
  courseName: string
  courseUrl: string
  certificationCode?: string
  primaryVendor?: string
  relatedTerms?: string[]
  targetGeography?: string
}

export interface SeedKeyword {
  keyword: string
  source: 'ai_generated'
}

export interface KeywordIdea {
  keyword: string
  avgMonthlySearches: number
  competition: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED'
  competitionIndex: number
  lowTopOfPageBidMicros?: number
  highTopOfPageBidMicros?: number
}

export interface AnalyzedKeyword extends KeywordIdea {
  courseRelevance: number
  relevanceStatus: RelevanceStatus
  conversionPotential: number
  searchIntent: number
  vendorSpecificity: number
  keywordSpecificity: number
  actionWordStrength: number
  commercialSignals: number
  negativeSignals: number
  koenigFit: number
  baseScore: number
  competitionBonus: number
  finalScore: number
  tier: 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Tier 4' | 'Review' | 'Exclude'
  matchType: '[EXACT]' | 'PHRASE' | 'BROAD' | 'N/A'
  action: Action
  exclusionReason?: string
  priority?: Priority
}

export type RelevanceStatus =
  | 'EXACT_MATCH'
  | 'DIRECT_RELATED'
  | 'STRONGLY_RELATED'
  | 'RELATED'
  | 'LOOSELY_RELATED'
  | 'TANGENTIAL'
  | 'WEAK_CONNECTION'
  | 'DIFFERENT_PRODUCT'
  | 'DIFFERENT_VENDOR'
  | 'NOT_RELEVANT'

export type Action =
  | 'ADD'
  | 'BOOST'
  | 'MONITOR'
  | 'OPTIMIZE'
  | 'REVIEW'
  | 'EXCLUDE'
  | 'EXCLUDE_RELEVANCE'

export type Priority =
  | '🔴 URGENT'
  | '🟠 HIGH'
  | '🟡 MEDIUM'
  | '⚪ STANDARD'
  | '🔵 REVIEW'

// Prompt Configuration Types
export interface PromptConfig {
  id: string
  name: string
  description: string
  prompt: string
  variables: string[]
  lastUpdated: string
}

// Research Session Types
export interface ResearchSession {
  id: string
  createdAt: string
  courseInput: CourseInput
  seedKeywords: SeedKeyword[]
  keywordIdeas: KeywordIdea[]
  analyzedKeywords: AnalyzedKeyword[]
  status: 'pending' | 'generating_seeds' | 'fetching_keywords' | 'analyzing' | 'completed' | 'error'
  error?: string
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    source?: string
    fallback?: boolean
    googleError?: string
    cached?: boolean
    cacheAge?: number
    processingTimeMs?: number
  }
}

// Statistics Types
export interface KeywordStats {
  total: number
  byAction: Record<Action, number>
  byTier: Record<string, number>
  byCompetition: Record<string, number>
  byRelevance: Record<RelevanceStatus, number>
  avgScore: number
  urgentCount: number
  highPriorityCount: number
}

// Rate Limit Types
export interface RateLimitStatus {
  requestsRemaining: number
  resetTime: number
  isLimited: boolean
}

// Batch Processing Types
export type BatchItemStatus = 'pending' | 'generating_seeds' | 'fetching_keywords' | 'saving_cache' | 'analyzing' | 'completed' | 'error' | 'cached'

// Processing step information for detailed progress display
export interface ProcessingStep {
  id: string
  label: string
  status: 'pending' | 'in_progress' | 'completed' | 'error'
  startTime?: number
  endTime?: number
  details?: string
}

export interface ProcessingProgress {
  currentStep: number
  totalSteps: number
  steps: ProcessingStep[]
  analysisProgress?: {
    currentBatch: number
    totalBatches: number
    analyzedCount: number
    totalKeywords: number
  }
}

export interface BatchCourseItem {
  id: string
  rowIndex: number
  courseInput: CourseInput
  status: BatchItemStatus
  seedKeywords: SeedKeyword[]
  keywordIdeas: KeywordIdea[] // Raw keywords from API
  analyzedKeywords: AnalyzedKeyword[] // After AI analysis
  error?: string
  startTime?: number
  endTime?: number
  processingTimeMs?: number
  dataSource?: 'google_ads' | 'keywords_everywhere' | 'cache'
  cacheHit?: boolean
  progress?: ProcessingProgress // Detailed step-by-step progress
  analysisProgress?: {
    currentBatch: number
    totalBatches: number
    analyzedCount: number
  }
}

export interface BatchProcessingState {
  items: BatchCourseItem[]
  isProcessing: boolean
  currentIndex: number
  totalItems: number
  completedItems: number
  errorItems: number
}

// CSV Row Type (parsed from upload)
export interface CSVCourseRow {
  url: string
  courseName: string
  courseCode?: string
  vendor?: string
  certification?: string
  courseTopics?: string
}

// Filter options for UI
export interface KeywordFilters {
  search: string
  competition: ('LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED')[]
  minVolume: number
  maxVolume: number
  tiers: string[]
  actions: string[]
  showSelected: boolean | null // null = all, true = selected only, false = unselected only
}

// View mode for the details panel
export type DetailViewMode = 'raw' | 'analyzed'

// Extended AnalyzedKeyword with selection state
export interface SelectableKeyword extends AnalyzedKeyword {
  selected: boolean
}
