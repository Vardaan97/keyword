"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useAppStore, COUNTRY_OPTIONS, DATA_SOURCE_OPTIONS, DataSourceType, CountryCode, GOOGLE_ADS_ACCOUNTS, THEME_OPTIONS, ThemeType } from "@/lib/store"
import { DEFAULT_SEED_PROMPT, DEFAULT_ANALYSIS_PROMPT } from "@/lib/prompts"
import {
  CourseInput,
  SeedKeyword,
  KeywordIdea,
  AnalyzedKeyword,
  BatchCourseItem,
  BatchItemStatus,
  CSVCourseRow,
  DetailViewMode,
  KeywordFilters,
  ProcessingStep,
  ProcessingProgress
} from "@/types"
import { generateId, formatNumber, downloadCSV } from "@/lib/utils"
import Papa from "papaparse"

// Format elapsed time as mm:ss
function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Create initial processing steps
function createProcessingSteps(): ProcessingStep[] {
  return [
    { id: 'generate_seeds', label: 'Generating seed keywords with AI', status: 'pending' },
    { id: 'check_cache', label: 'Checking cache for existing data', status: 'pending' },
    { id: 'fetch_keywords', label: 'Fetching keyword data from API', status: 'pending' },
    { id: 'save_cache', label: 'Saving keywords to cache', status: 'pending' },
    { id: 'analyze', label: 'Analyzing keywords with AI', status: 'pending' },
    { id: 'complete', label: 'Processing complete', status: 'pending' }
  ]
}

// Update a specific step in the progress
function updateStep(
  progress: ProcessingProgress,
  stepId: string,
  updates: Partial<ProcessingStep>
): ProcessingProgress {
  return {
    ...progress,
    steps: progress.steps.map(step =>
      step.id === stepId ? { ...step, ...updates } : step
    )
  }
}

// Pre-filter keywords before AI analysis (rule-based, instant filtering)
// This reduces the number of keywords sent to AI, significantly speeding up analysis
const EXCLUSION_TERMS = [
  'free', 'salary', 'jobs', 'job', 'careers', 'career',
  'dumps', 'torrent', 'pirate', 'crack', 'download',
  'youtube', 'udemy', 'coursera', 'simplilearn', 'edureka', 'pluralsight',
  'reddit', 'quora', 'stackoverflow',
  'vs ', ' vs',
  'alternative', 'alternatives',
  'review', 'reviews', 'reddit review',
  'worth it', 'scam', 'legit',
  'glassdoor', 'indeed', 'linkedin'
]

const MIN_VOLUME_FOR_AI = 10 // Skip very low volume keywords from AI analysis

interface PreFilterResult {
  forAI: KeywordIdea[]
  excluded: AnalyzedKeyword[]
}

function preFilterKeywords(keywords: KeywordIdea[], courseName: string): PreFilterResult {
  const forAI: KeywordIdea[] = []
  const excluded: AnalyzedKeyword[] = []

  for (const kw of keywords) {
    const lowerKeyword = kw.keyword.toLowerCase()

    // Check for exclusion terms
    const excludedTerm = EXCLUSION_TERMS.find(term => lowerKeyword.includes(term))
    if (excludedTerm) {
      excluded.push({
        ...kw,
        courseRelevance: 0,
        relevanceStatus: 'NOT_RELEVANT',
        conversionPotential: 0,
        searchIntent: 0,
        vendorSpecificity: 0,
        keywordSpecificity: 0,
        actionWordStrength: 0,
        commercialSignals: 0,
        negativeSignals: 0,
        koenigFit: 0,
        baseScore: 0,
        competitionBonus: 0,
        finalScore: 0,
        tier: 'Exclude',
        matchType: 'N/A',
        action: 'EXCLUDE',
        exclusionReason: `Contains excluded term: "${excludedTerm}"`
      })
      continue
    }

    // Check minimum volume (skip extremely low volume for AI)
    if (kw.avgMonthlySearches < MIN_VOLUME_FOR_AI) {
      excluded.push({
        ...kw,
        courseRelevance: 0,
        relevanceStatus: 'NOT_RELEVANT',
        conversionPotential: 0,
        searchIntent: 0,
        vendorSpecificity: 0,
        keywordSpecificity: 0,
        actionWordStrength: 0,
        commercialSignals: 0,
        negativeSignals: 0,
        koenigFit: 0,
        baseScore: 0,
        competitionBonus: 0,
        finalScore: 0,
        tier: 'Exclude',
        matchType: 'N/A',
        action: 'EXCLUDE',
        exclusionReason: `Very low search volume (${kw.avgMonthlySearches})`
      })
      continue
    }

    // Keyword passes pre-filter, send to AI
    forAI.push(kw)
  }

  console.log(`[PRE-FILTER] ${keywords.length} total -> ${forAI.length} for AI, ${excluded.length} excluded by rules`)
  return { forAI, excluded }
}

export default function Home() {
  const {
    seedPrompt,
    analysisPrompt,
    setSeedPrompt,
    setAnalysisPrompt,
    resetPrompts,
    sessionHistory,
    addToHistory,
    dataSource,
    targetCountry,
    setDataSource,
    setTargetCountry,
    selectedGoogleAdsAccountId,
    setSelectedGoogleAdsAccountId,
    savedBatchItems,
    setSavedBatchItems,
    clearSavedBatchItems,
    theme,
    setTheme
  } = useAppStore()

  // Batch processing state
  const [batchItems, setBatchItems] = useState<BatchCourseItem[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeView, setActiveView] = useState<'upload' | 'processing' | 'results'>('upload')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<'seed' | 'analysis' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Timer state
  const [elapsedTime, setElapsedTime] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Detail view state
  const [detailViewMode, setDetailViewMode] = useState<DetailViewMode>('analyzed')

  // Raw keywords modal state (for viewing during processing)
  const [showRawKeywordsModal, setShowRawKeywordsModal] = useState(false)

  // Filter state
  const [filters, setFilters] = useState<KeywordFilters>({
    search: '',
    competition: [],
    minVolume: 0,
    maxVolume: Infinity,
    tiers: [],
    actions: [],
    showSelected: null
  })

  // Selection state for keywords
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set())

  // Start timer
  const startTimer = () => {
    setElapsedTime(0)
    timerRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 1000)
    }, 1000)
  }

  // Stop timer
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Load saved batch items on mount (session recovery)
  useEffect(() => {
    if (savedBatchItems && savedBatchItems.length > 0) {
      console.log('[SESSION] Found saved batch items:', savedBatchItems.length)
      // Don't auto-restore, just keep them available for "Load Last Session" button
    }
  }, [])

  // Save batch items when they change (but only if there's meaningful data)
  useEffect(() => {
    if (batchItems.length > 0) {
      // Only save items that have at least started processing or have data
      const itemsToSave = batchItems.map(item => ({
        ...item,
        // Remove progress to reduce storage size (can be regenerated)
        progress: undefined
      }))
      setSavedBatchItems(itemsToSave)
      console.log('[SESSION] Saved batch items:', itemsToSave.length)
    }
  }, [batchItems, setSavedBatchItems])

  // Load last session handler
  const loadLastSession = () => {
    if (savedBatchItems && savedBatchItems.length > 0) {
      console.log('[SESSION] Loading last session with', savedBatchItems.length, 'items')
      setBatchItems(savedBatchItems)
      setActiveView('processing')
      // Select first item if any
      if (savedBatchItems.length > 0) {
        setSelectedItemId(savedBatchItems[0].id)
      }
    }
  }

  // Parse CSV file
  const parseCSV = (file: File): Promise<CSVCourseRow[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows: CSVCourseRow[] = (results.data as Record<string, string>[]).map((row) => ({
            url: row['URL'] || row['url'] || '',
            courseName: row['Course Name'] || row['course_name'] || row['courseName'] || '',
            courseCode: row['Course Code'] || row['course_code'] || row['courseCode'] || '',
            vendor: row['Vendor'] || row['vendor'] || '',
            certification: row['Certification'] || row['certification'] || '',
            courseTopics: row['Course topics covered'] || row['topics'] || ''
          })).filter(r => r.url && r.courseName)
          resolve(rows)
        },
        error: (error) => reject(error)
      })
    })
  }

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    try {
      const rows = await parseCSV(file)
      const items: BatchCourseItem[] = rows.map((row, index) => ({
        id: generateId(),
        rowIndex: index + 1,
        courseInput: {
          courseName: row.courseName,
          courseUrl: row.url,
          certificationCode: row.courseCode,
          primaryVendor: row.vendor,
          relatedTerms: row.courseTopics?.split(';').map(t => t.trim()).filter(Boolean) || [],
          targetGeography: 'india'
        },
        status: 'pending' as BatchItemStatus,
        seedKeywords: [],
        keywordIdeas: [],
        analyzedKeywords: []
      }))
      setBatchItems(items)
      setActiveView('processing')
    } catch (error) {
      console.error('CSV parse error:', error)
    }
  }

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.csv')) {
      handleFileUpload(file)
    }
  }, [])

  // Process single item with detailed progress tracking
  const processItem = async (item: BatchCourseItem, signal: AbortSignal): Promise<BatchCourseItem> => {
    const startTime = Date.now()

    // Initialize progress tracking
    let progress: ProcessingProgress = {
      currentStep: 0,
      totalSteps: 6,
      steps: createProcessingSteps()
    }

    let updatedItem: BatchCourseItem = {
      ...item,
      status: 'generating_seeds' as BatchItemStatus,
      startTime,
      progress
    }

    // Helper to update item with new progress
    const updateProgress = (stepId: string, stepStatus: 'in_progress' | 'completed' | 'error', details?: string, currentStep?: number) => {
      progress = updateStep(progress, stepId, {
        status: stepStatus,
        details,
        ...(stepStatus === 'in_progress' ? { startTime: Date.now() } : {}),
        ...(stepStatus === 'completed' || stepStatus === 'error' ? { endTime: Date.now() } : {})
      })
      if (currentStep !== undefined) {
        progress = { ...progress, currentStep }
      }
      updatedItem = { ...updatedItem, progress }
      setBatchItems(prev => prev.map(i => i.id === item.id ? updatedItem : i))
    }

    console.log(`[PROCESS] Starting item: ${item.courseInput.courseName}`)

    try {
      // Check abort before each step
      if (signal.aborted) throw new Error('Processing stopped by user')

      // ========== STEP 1: Generate Seeds ==========
      updateProgress('generate_seeds', 'in_progress', 'Calling OpenAI GPT-4o...', 1)
      console.log(`[STEP 1] Generating seeds for: ${item.courseInput.courseName}`)

      const seedResponse = await fetch('/api/keywords/generate-seeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: seedPrompt.prompt,
          courseName: item.courseInput.courseName,
          courseUrl: item.courseInput.courseUrl,
          vendor: item.courseInput.primaryVendor
        }),
        signal
      })
      const seedResult = await seedResponse.json()

      if (!seedResult.success) {
        updateProgress('generate_seeds', 'error', seedResult.error)
        throw new Error(seedResult.error)
      }

      updateProgress('generate_seeds', 'completed', `Generated ${seedResult.data?.length || 0} seed keywords`)
      console.log(`[STEP 1] Seed result: ${seedResult.data?.length} seeds generated`)

      updatedItem = { ...updatedItem, seedKeywords: seedResult.data, status: 'fetching_keywords' }
      setBatchItems(prev => prev.map(i => i.id === item.id ? updatedItem : i))

      // Check abort before step 2
      if (signal.aborted) throw new Error('Processing stopped by user')

      // ========== STEP 2: Check Cache ==========
      updateProgress('check_cache', 'in_progress', 'Looking for cached keyword data...', 2)
      console.log(`[STEP 2a] Checking cache for: ${item.courseInput.courseName}`)

      // ========== STEP 3: Fetch Keywords ==========
      updateProgress('fetch_keywords', 'in_progress', `Calling ${dataSource === 'auto' ? 'Google Ads API' : dataSource}...`, 3)
      console.log(`[STEP 2] Fetching keywords for: ${item.courseInput.courseName} (source: ${dataSource}, country: ${targetCountry})`)

      const keywordsResponse = await fetch('/api/keywords/fetch-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedKeywords: seedResult.data.map((s: SeedKeyword) => s.keyword),
          pageUrl: item.courseInput.courseUrl,
          courseName: item.courseInput.courseName,  // For URL-based cache lookup
          geoTarget: targetCountry,
          source: dataSource,
          accountId: selectedGoogleAdsAccountId
        }),
        signal
      })
      const keywordsResult = await keywordsResponse.json()

      if (!keywordsResult.success) {
        updateProgress('fetch_keywords', 'error', keywordsResult.error)
        throw new Error(keywordsResult.error)
      }

      const dataSourceUsed = keywordsResult.meta?.source || 'unknown'
      const cacheHit = keywordsResult.meta?.cached || false

      // Update cache check step based on result
      if (cacheHit) {
        updateProgress('check_cache', 'completed', 'Cache hit! Using cached data')
        updateProgress('fetch_keywords', 'completed', `Retrieved ${keywordsResult.data?.length || 0} keywords from cache`)
        updateProgress('save_cache', 'completed', 'Skipped (using cached data)')
      } else {
        updateProgress('check_cache', 'completed', 'No cache found, fetching fresh data')
        updateProgress('fetch_keywords', 'completed', `Fetched ${keywordsResult.data?.length || 0} keywords from ${dataSourceUsed}`)

        // Step 4: Save to cache (happens in API, but we show it)
        updateProgress('save_cache', 'in_progress', 'Storing keywords in MongoDB cache...', 4)
        // Small delay to show the step
        await new Promise(resolve => setTimeout(resolve, 100))
        updateProgress('save_cache', 'completed', 'Cached for 48 hours')
      }

      console.log(`[STEP 2] Keywords result: ${keywordsResult.data?.length} keywords fetched from ${dataSourceUsed}`)

      updatedItem = {
        ...updatedItem,
        keywordIdeas: keywordsResult.data,
        status: 'analyzing',
        dataSource: dataSourceUsed as 'google_ads' | 'keywords_everywhere' | 'cache',
        cacheHit
      }
      setBatchItems(prev => prev.map(i => i.id === item.id ? updatedItem : i))

      // Check abort before step 3
      if (signal.aborted) throw new Error('Processing stopped by user')

      // ========== STEP 5: Analyze Keywords ==========
      const totalKeywords = keywordsResult.data.length

      updateProgress('analyze', 'in_progress', `Analyzing ${totalKeywords} keywords with AI...`, 5)

      console.log(`[STEP 3] Analyzing ${totalKeywords} keywords for: ${item.courseInput.courseName}`)

      const analyzeResponse = await fetch('/api/keywords/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: analysisPrompt.prompt,
          courseName: item.courseInput.courseName,
          certificationCode: item.courseInput.certificationCode,
          vendor: item.courseInput.primaryVendor,
          relatedTerms: item.courseInput.relatedTerms?.join(', '),
          keywords: keywordsResult.data
        }),
        signal
      })
      const analyzeResult = await analyzeResponse.json()

      if (!analyzeResult.success) {
        updateProgress('analyze', 'error', analyzeResult.error)
        throw new Error(analyzeResult.error)
      }

      const analyzedCount = analyzeResult.data?.analyzedKeywords?.length || 0
      updateProgress('analyze', 'completed', `Analyzed ${analyzedCount} keywords`)
      console.log(`[STEP 3] Analysis result: ${analyzedCount} keywords analyzed`)

      // ========== STEP 6: Complete ==========
      const endTime = Date.now()
      const processingTime = endTime - startTime

      updateProgress('complete', 'completed', `Total time: ${formatTime(processingTime)}`, 6)

      updatedItem = {
        ...updatedItem,
        analyzedKeywords: analyzeResult.data.analyzedKeywords,
        status: 'completed',
        endTime,
        processingTimeMs: processingTime
      }
      console.log(`[COMPLETE] Finished: ${item.courseInput.courseName} - ${analyzedCount} keywords in ${formatTime(processingTime)}`)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[ERROR] ${item.courseInput.courseName}: ${errorMessage}`)

      // Mark current step as error
      const currentStepIndex = progress.currentStep - 1
      if (currentStepIndex >= 0 && currentStepIndex < progress.steps.length) {
        const currentStepId = progress.steps[currentStepIndex].id
        updateProgress(currentStepId, 'error', errorMessage)
      }

      updatedItem = {
        ...updatedItem,
        status: 'error',
        error: errorMessage,
        endTime: Date.now(),
        processingTimeMs: Date.now() - startTime
      }
    }

    return updatedItem
  }

  // Rate limiting delay for Google Ads API
  // Reduced from 5s to 1.5s since google-ads.ts already has 1.1s rate limiting
  // This is only applied when we need to call the Google API (not on cache hits)
  const GOOGLE_API_DELAY_MS = 1500

  // Helper to delay execution
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  // Save completed item to databases
  const saveCompletedItem = async (processedItem: BatchCourseItem) => {
    addToHistory({
      id: processedItem.id,
      createdAt: new Date().toISOString(),
      courseInput: processedItem.courseInput,
      seedKeywords: processedItem.seedKeywords,
      keywordIdeas: processedItem.keywordIdeas,
      analyzedKeywords: processedItem.analyzedKeywords,
      status: 'completed'
    })

    // Save to MongoDB and Supabase
    try {
      const saveResponse = await fetch('/api/research/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: processedItem.id,
          courseName: processedItem.courseInput.courseName,
          courseUrl: processedItem.courseInput.courseUrl,
          vendor: processedItem.courseInput.primaryVendor,
          certificationCode: processedItem.courseInput.certificationCode,
          seedKeywords: processedItem.seedKeywords,
          rawKeywords: processedItem.keywordIdeas,
          analyzedKeywords: processedItem.analyzedKeywords,
          dataSource: processedItem.dataSource || dataSource,
          geoTarget: targetCountry,
          processingTimeMs: processedItem.processingTimeMs || 0
        })
      })
      const saveResult = await saveResponse.json()
      if (saveResult.success) {
        console.log('[SAVE] Research saved to databases:', saveResult.data)
      }
    } catch (err) {
      console.log('[SAVE] Failed to save to databases:', err)
    }
  }

  // Start batch processing with concurrent execution
  const startProcessing = async () => {
    setIsProcessing(true)
    abortRef.current = false
    const controller = new AbortController()
    abortControllerRef.current = controller
    startTimer()

    const pendingItems = batchItems.filter(item => item.status === 'pending')
    console.log(`[BATCH] Starting CONCURRENT batch processing for ${pendingItems.length} courses...`)
    console.log(`[BATCH] Rate limit: ${GOOGLE_API_DELAY_MS}ms between Google API calls`)

    // Process each item with staggered Google API calls
    // All other operations (seeds, cache check, analysis) run as fast as possible
    const processPromises = pendingItems.map(async (item, index) => {
      if (abortRef.current || controller.signal.aborted) {
        console.log(`[BATCH] Skipping ${item.courseInput.courseName} - processing stopped`)
        return null
      }

      // Add delay for Google API rate limiting (stagger by index)
      // Items 0, 1, 2... will have delays 0s, 5s, 10s... for their API calls
      const apiDelay = index * GOOGLE_API_DELAY_MS
      console.log(`[BATCH] Course ${index + 1}/${pendingItems.length}: ${item.courseInput.courseName} (API delay: ${apiDelay}ms)`)

      try {
        const processedItem = await processItemWithDelay(item, controller.signal, apiDelay)
        setBatchItems(prev => prev.map(it => it.id === item.id ? processedItem : it))

        if (processedItem.status === 'completed') {
          // Save in background - don't wait for it
          saveCompletedItem(processedItem)
        }
        return processedItem
      } catch (err) {
        console.error(`[BATCH] Error processing ${item.courseInput.courseName}:`, err)
        return null
      }
    })

    // Wait for all courses to complete (they run concurrently with staggered API calls)
    await Promise.all(processPromises)

    console.log('[BATCH] Batch processing finished')
    stopTimer()
    abortControllerRef.current = null
    setIsProcessing(false)
    setActiveView('results')
  }

  // Process item with delay before API call (for rate limiting)
  const processItemWithDelay = async (
    item: BatchCourseItem,
    signal: AbortSignal,
    apiDelayMs: number
  ): Promise<BatchCourseItem> => {
    const startTime = Date.now()

    // Initialize progress tracking
    let progress: ProcessingProgress = {
      currentStep: 0,
      totalSteps: 6,
      steps: createProcessingSteps()
    }

    let updatedItem: BatchCourseItem = {
      ...item,
      status: 'generating_seeds' as BatchItemStatus,
      startTime,
      progress
    }

    // Helper to update item with new progress
    const updateProgress = (stepId: string, stepStatus: 'in_progress' | 'completed' | 'error', details?: string, currentStep?: number) => {
      progress = updateStep(progress, stepId, {
        status: stepStatus,
        details,
        ...(stepStatus === 'in_progress' ? { startTime: Date.now() } : {}),
        ...(stepStatus === 'completed' || stepStatus === 'error' ? { endTime: Date.now() } : {})
      })
      if (currentStep !== undefined) {
        progress = { ...progress, currentStep }
      }
      updatedItem = { ...updatedItem, progress }
      setBatchItems(prev => prev.map(i => i.id === item.id ? updatedItem : i))
    }

    console.log(`[PROCESS] Starting item: ${item.courseInput.courseName}`)

    try {
      if (signal.aborted) throw new Error('Processing stopped by user')

      // ========== STEP 1: Generate Seeds (runs immediately) ==========
      updateProgress('generate_seeds', 'in_progress', 'Calling AI for seeds...', 1)
      console.log(`[STEP 1] Generating seeds for: ${item.courseInput.courseName}`)

      const seedResponse = await fetch('/api/keywords/generate-seeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: seedPrompt.prompt,
          courseName: item.courseInput.courseName,
          courseUrl: item.courseInput.courseUrl,
          vendor: item.courseInput.primaryVendor
        }),
        signal
      })
      const seedResult = await seedResponse.json()

      if (!seedResult.success) {
        updateProgress('generate_seeds', 'error', seedResult.error)
        throw new Error(seedResult.error)
      }

      updateProgress('generate_seeds', 'completed', `Generated ${seedResult.data?.length || 0} seed keywords`)
      updatedItem = { ...updatedItem, seedKeywords: seedResult.data, status: 'fetching_keywords' }
      setBatchItems(prev => prev.map(i => i.id === item.id ? updatedItem : i))

      if (signal.aborted) throw new Error('Processing stopped by user')

      // ========== STEP 2: Check Cache ==========
      updateProgress('check_cache', 'in_progress', 'Looking for cached data...', 2)

      // ========== STEP 3: Fetch Keywords (with rate limiting delay) ==========
      // Wait for the staggered delay before making Google API call
      if (apiDelayMs > 0) {
        updateProgress('fetch_keywords', 'in_progress', `Waiting ${apiDelayMs / 1000}s for rate limit...`, 3)
        await delay(apiDelayMs)
      }

      updateProgress('fetch_keywords', 'in_progress', `Fetching from ${dataSource === 'auto' ? 'Google Ads API' : dataSource}...`, 3)
      console.log(`[STEP 2] Fetching keywords for: ${item.courseInput.courseName}`)

      const keywordsResponse = await fetch('/api/keywords/fetch-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedKeywords: seedResult.data.map((s: SeedKeyword) => s.keyword),
          pageUrl: item.courseInput.courseUrl,
          courseName: item.courseInput.courseName,
          geoTarget: targetCountry,
          source: dataSource,
          accountId: selectedGoogleAdsAccountId
        }),
        signal
      })
      const keywordsResult = await keywordsResponse.json()

      if (!keywordsResult.success) {
        updateProgress('fetch_keywords', 'error', keywordsResult.error)
        throw new Error(keywordsResult.error)
      }

      const dataSourceUsed = keywordsResult.meta?.source || 'unknown'
      const cacheHit = keywordsResult.meta?.cached || false

      if (cacheHit) {
        updateProgress('check_cache', 'completed', 'Cache hit! Using cached data (7-day cache)')
        updateProgress('fetch_keywords', 'completed', `Retrieved ${keywordsResult.data?.length || 0} keywords from cache`)
        updateProgress('save_cache', 'completed', 'Skipped (using cached data)')
      } else {
        updateProgress('check_cache', 'completed', 'No cache found, fetched fresh data')
        updateProgress('fetch_keywords', 'completed', `Fetched ${keywordsResult.data?.length || 0} keywords from ${dataSourceUsed}`)
        updateProgress('save_cache', 'in_progress', 'Saving to MongoDB & Supabase...', 4)
        await delay(100)
        updateProgress('save_cache', 'completed', 'Cached for 7 days')
      }

      updatedItem = {
        ...updatedItem,
        keywordIdeas: keywordsResult.data,
        status: 'analyzing',
        dataSource: dataSourceUsed as 'google_ads' | 'keywords_everywhere' | 'cache',
        cacheHit
      }
      setBatchItems(prev => prev.map(i => i.id === item.id ? updatedItem : i))

      if (signal.aborted) throw new Error('Processing stopped by user')

      // ========== STEP 5: Analyze Keywords (with pre-filtering for speed) ==========
      const totalKeywords = keywordsResult.data.length

      // Pre-filter keywords using rule-based exclusions (instant, reduces AI load)
      const { forAI, excluded: preExcluded } = preFilterKeywords(keywordsResult.data, item.courseInput.courseName)

      updateProgress('analyze', 'in_progress', `Pre-filtered: ${forAI.length}/${totalKeywords} for AI analysis...`, 5)

      console.log(`[STEP 3] Pre-filter: ${totalKeywords} total -> ${forAI.length} for AI, ${preExcluded.length} excluded by rules`)

      let analyzedFromAI: AnalyzedKeyword[] = []

      // Only call AI if we have keywords to analyze
      if (forAI.length > 0) {
        console.log(`[STEP 3] Sending ${forAI.length} keywords to AI for analysis...`)

        const analyzeResponse = await fetch('/api/keywords/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: analysisPrompt.prompt,
            courseName: item.courseInput.courseName,
            certificationCode: item.courseInput.certificationCode,
            vendor: item.courseInput.primaryVendor,
            relatedTerms: item.courseInput.relatedTerms?.join(', '),
            keywords: forAI
          }),
          signal
        })
        const analyzeResult = await analyzeResponse.json()

        if (!analyzeResult.success) {
          updateProgress('analyze', 'error', analyzeResult.error)
          throw new Error(analyzeResult.error)
        }

        analyzedFromAI = analyzeResult.data?.analyzedKeywords || []
      }

      // Combine AI results with pre-excluded keywords
      const allAnalyzed = [...analyzedFromAI, ...preExcluded]
      const analyzedCount = allAnalyzed.length
      updateProgress('analyze', 'completed', `Analyzed ${analyzedFromAI.length} keywords (${preExcluded.length} auto-excluded)`)

      // ========== STEP 6: Complete ==========
      const endTime = Date.now()
      const processingTime = endTime - startTime

      updateProgress('complete', 'completed', `Total time: ${formatTime(processingTime)}`, 6)

      updatedItem = {
        ...updatedItem,
        analyzedKeywords: allAnalyzed, // Use combined results (AI + pre-excluded)
        status: 'completed',
        endTime,
        processingTimeMs: processingTime
      }
      console.log(`[COMPLETE] Finished: ${item.courseInput.courseName} - ${allAnalyzed.length} keywords total (${analyzedFromAI.length} AI + ${preExcluded.length} auto-excluded) in ${formatTime(processingTime)}`)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[ERROR] ${item.courseInput.courseName}: ${errorMessage}`)

      const currentStepIndex = progress.currentStep - 1
      if (currentStepIndex >= 0 && currentStepIndex < progress.steps.length) {
        const currentStepId = progress.steps[currentStepIndex].id
        updateProgress(currentStepId, 'error', errorMessage)
      }

      updatedItem = {
        ...updatedItem,
        status: 'error',
        error: errorMessage,
        endTime: Date.now(),
        processingTimeMs: Date.now() - startTime
      }
    }

    return updatedItem
  }

  // Stop processing
  const stopProcessing = () => {
    console.log('[STOP] User clicked stop button')
    abortRef.current = true
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      console.log('[STOP] AbortController signaled')
    }
    stopTimer()
    setIsProcessing(false)
  }

  // Toggle keyword selection
  const toggleKeywordSelection = (keyword: string) => {
    setSelectedKeywords(prev => {
      const newSet = new Set(prev)
      if (newSet.has(keyword)) {
        newSet.delete(keyword)
      } else {
        newSet.add(keyword)
      }
      return newSet
    })
  }

  // Select all visible keywords
  const selectAllVisible = (keywords: (KeywordIdea | AnalyzedKeyword)[]) => {
    const filtered = filterKeywords(keywords)
    setSelectedKeywords(new Set(filtered.map(k => k.keyword)))
  }

  // Clear selection
  const clearSelection = () => {
    setSelectedKeywords(new Set())
  }

  // Filter keywords based on current filters
  const filterKeywords = <T extends KeywordIdea>(keywords: T[]): T[] => {
    return keywords.filter(kw => {
      // Search filter
      if (filters.search && !kw.keyword.toLowerCase().includes(filters.search.toLowerCase())) {
        return false
      }

      // Competition filter
      if (filters.competition.length > 0 && !filters.competition.includes(kw.competition)) {
        return false
      }

      // Volume filter
      if (kw.avgMonthlySearches < filters.minVolume) return false
      if (filters.maxVolume !== Infinity && kw.avgMonthlySearches > filters.maxVolume) return false

      // For analyzed keywords only
      if ('tier' in kw && 'action' in kw) {
        const analyzed = kw as unknown as AnalyzedKeyword
        if (filters.tiers.length > 0 && !filters.tiers.includes(analyzed.tier)) return false
        if (filters.actions.length > 0 && !filters.actions.includes(analyzed.action)) return false
      }

      // Selection filter
      if (filters.showSelected === true && !selectedKeywords.has(kw.keyword)) return false
      if (filters.showSelected === false && selectedKeywords.has(kw.keyword)) return false

      return true
    })
  }

  // Export selected keywords
  const exportSelected = () => {
    const selectedItem = batchItems.find(i => i.id === selectedItemId)
    if (!selectedItem) return

    const keywords = detailViewMode === 'raw'
      ? selectedItem.keywordIdeas.filter(k => selectedKeywords.has(k.keyword))
      : selectedItem.analyzedKeywords.filter(k => selectedKeywords.has(k.keyword))

    if (keywords.length === 0) return

    const headers = detailViewMode === 'raw'
      ? ['Keyword', 'Search Volume', 'Competition', 'Competition Index']
      : ['Keyword', 'Search Volume', 'Competition', 'Final Score', 'Tier', 'Match Type', 'Action', 'Priority', 'Relevance']

    const rows = keywords.map(kw => {
      if (detailViewMode === 'raw') {
        return [kw.keyword, kw.avgMonthlySearches, kw.competition, kw.competitionIndex]
      }
      const analyzed = kw as AnalyzedKeyword
      return [
        analyzed.keyword,
        analyzed.avgMonthlySearches,
        analyzed.competition,
        analyzed.finalScore,
        analyzed.tier,
        analyzed.matchType,
        analyzed.action,
        analyzed.priority || '',
        analyzed.relevanceStatus
      ]
    })

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell =>
        typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
      ).join(','))
    ].join('\n')

    downloadCSV(csvContent, `selected-keywords-${selectedItem.courseInput.courseName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`)
  }

  // Export all results
  const exportAllResults = () => {
    const completedItems = batchItems.filter(i => i.status === 'completed')
    if (completedItems.length === 0) return

    const allKeywords = completedItems.flatMap(item =>
      item.analyzedKeywords.map(kw => ({
        course: item.courseInput.courseName,
        ...kw
      }))
    )

    const headers = [
      'Course', 'Keyword', 'Search Volume', 'Competition', 'Final Score',
      'Tier', 'Match Type', 'Action', 'Priority', 'Relevance Status'
    ]

    const rows = allKeywords.map(kw => [
      kw.course,
      kw.keyword,
      kw.avgMonthlySearches,
      kw.competition,
      kw.finalScore,
      kw.tier,
      kw.matchType,
      kw.action,
      kw.priority || '',
      kw.relevanceStatus
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell =>
        typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
      ).join(','))
    ].join('\n')

    downloadCSV(csvContent, `keyword-research-batch-${new Date().toISOString().split('T')[0]}.csv`)
  }

  // Get stats
  const getStats = () => {
    const completed = batchItems.filter(i => i.status === 'completed').length
    const errors = batchItems.filter(i => i.status === 'error').length
    const pending = batchItems.filter(i => i.status === 'pending').length
    const processing = batchItems.filter(i => !['pending', 'completed', 'error', 'cached'].includes(i.status)).length
    const totalKeywords = batchItems.reduce((sum, i) => sum + i.analyzedKeywords.length, 0)
    const urgentKeywords = batchItems.reduce((sum, i) =>
      sum + i.analyzedKeywords.filter(k => k.priority?.includes('URGENT')).length, 0)

    return { completed, errors, pending, processing, totalKeywords, urgentKeywords }
  }

  const stats = getStats()
  const selectedItem = batchItems.find(i => i.id === selectedItemId)

  // Get current keywords based on view mode
  const getCurrentKeywords = () => {
    if (!selectedItem) return []
    return detailViewMode === 'raw' ? selectedItem.keywordIdeas : selectedItem.analyzedKeywords
  }

  const currentKeywords = getCurrentKeywords()
  const filteredKeywords = filterKeywords(currentKeywords)

  return (
    <div className="min-h-screen grid-pattern">
      <div className="noise-overlay" />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/80 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="font-display font-bold text-lg tracking-tight">KEYWORD PLANNER</h1>
              <p className="text-[var(--text-muted)] text-xs font-mono">KOENIG SOLUTIONS</p>
            </div>
          </div>

          {/* Timer Display */}
          {isProcessing && (
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--accent-electric)]/30">
              <div className="w-2 h-2 rounded-full bg-[var(--accent-electric)] animate-pulse" />
              <span className="font-mono text-lg text-[var(--accent-electric)]">{formatTime(elapsedTime)}</span>
              <span className="text-xs text-[var(--text-muted)]">Processing...</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            {/* Theme Switcher */}
            <div className="relative group">
              <button
                className="px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-2 rounded-lg hover:bg-[var(--bg-hover)]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
                <span className="hidden sm:inline">{THEME_OPTIONS.find(t => t.value === theme)?.label || 'Theme'}</span>
              </button>
              <div className="absolute right-0 top-full mt-1 w-40 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                {THEME_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTheme(t.value)}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-[var(--bg-hover)] first:rounded-t-lg last:rounded-b-lg transition-colors ${
                      theme === t.value ? 'text-[var(--accent-electric)] font-medium' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowPromptEditor(!showPromptEditor)}
              className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Prompts
            </button>
            {batchItems.length > 0 && (
              <button
                onClick={() => { setBatchItems([]); clearSavedBatchItems(); setActiveView('upload'); setSelectedItemId(null); setSelectedKeywords(new Set()) }}
                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--accent-rose)] transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Prompt Editor Slide-out */}
      {showPromptEditor && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPromptEditor(false)} />
          <div className="relative w-full max-w-2xl bg-[var(--bg-secondary)] border-l border-[var(--border-default)] overflow-y-auto">
            <div className="p-6 border-b border-[var(--border-subtle)]">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-xl">AI Prompts</h2>
                <button onClick={() => setShowPromptEditor(false)} className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Seed Prompt */}
              <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[var(--accent-lime)]" />
                    <span className="font-medium text-sm">Seed Keyword Generator</span>
                  </div>
                  <button
                    onClick={() => setEditingPrompt(editingPrompt === 'seed' ? null : 'seed')}
                    className="text-xs text-[var(--accent-electric)] hover:underline"
                  >
                    {editingPrompt === 'seed' ? 'Close' : 'Edit'}
                  </button>
                </div>
                {editingPrompt === 'seed' ? (
                  <textarea
                    value={seedPrompt.prompt}
                    onChange={(e) => setSeedPrompt({ ...seedPrompt, prompt: e.target.value })}
                    className="w-full h-64 p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-sm font-mono resize-none focus:outline-none focus:border-[var(--accent-electric)]"
                  />
                ) : (
                  <p className="text-xs text-[var(--text-muted)] line-clamp-3">{seedPrompt.prompt.substring(0, 200)}...</p>
                )}
              </div>

              {/* Analysis Prompt */}
              <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[var(--accent-violet)]" />
                    <span className="font-medium text-sm">Keyword Analyzer</span>
                  </div>
                  <button
                    onClick={() => setEditingPrompt(editingPrompt === 'analysis' ? null : 'analysis')}
                    className="text-xs text-[var(--accent-electric)] hover:underline"
                  >
                    {editingPrompt === 'analysis' ? 'Close' : 'Edit'}
                  </button>
                </div>
                {editingPrompt === 'analysis' ? (
                  <textarea
                    value={analysisPrompt.prompt}
                    onChange={(e) => setAnalysisPrompt({ ...analysisPrompt, prompt: e.target.value })}
                    className="w-full h-64 p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-sm font-mono resize-none focus:outline-none focus:border-[var(--accent-electric)]"
                  />
                ) : (
                  <p className="text-xs text-[var(--text-muted)] line-clamp-3">{analysisPrompt.prompt.substring(0, 200)}...</p>
                )}
              </div>

              <button
                onClick={resetPrompts}
                className="w-full py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raw Keywords Modal - Google Ads Format */}
      {showRawKeywordsModal && selectedItem && selectedItem.keywordIdeas.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowRawKeywordsModal(false)} />
          <div className="relative w-full max-w-6xl max-h-[90vh] bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-xl">Raw Keywords from {selectedItem.cacheHit ? 'Cache' : 'Google Ads API'}</h2>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {selectedItem.keywordIdeas.length} keywords fetched for "{selectedItem.courseInput.courseName}"
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Account Name Badge */}
                {GOOGLE_ADS_ACCOUNTS.find(a => a.id === selectedGoogleAdsAccountId)?.name && (
                  <span className="px-3 py-1 rounded-lg bg-[var(--accent-violet)]/20 text-[var(--accent-violet)] text-xs font-medium">
                    {GOOGLE_ADS_ACCOUNTS.find(a => a.id === selectedGoogleAdsAccountId)?.name}
                  </span>
                )}
                {/* Source Badge */}
                <span className={`px-3 py-1 rounded-lg text-xs font-medium ${
                  selectedItem.cacheHit
                    ? 'bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]'
                    : 'bg-[var(--accent-electric)]/20 text-[var(--accent-electric)]'
                }`}>
                  {selectedItem.cacheHit ? '📦 Cached Data' : `🔗 ${selectedItem.dataSource || 'google_ads'}`}
                </span>
                <button
                  onClick={() => setShowRawKeywordsModal(false)}
                  className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body - Keywords Table */}
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full data-table">
                <thead className="sticky top-0 bg-[var(--bg-secondary)]">
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">#</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Keyword</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Avg. Monthly Searches</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Competition</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Competition Index</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Low Top of Page Bid</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">High Top of Page Bid</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">In Account</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItem.keywordIdeas
                    .sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches)
                    .map((kw, index) => (
                    <tr key={index} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                      <td className="py-3 px-4 text-sm text-[var(--text-muted)] font-mono">{index + 1}</td>
                      <td className="py-3 px-4 text-sm text-[var(--text-primary)] font-medium">{kw.keyword}</td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono text-sm text-[var(--accent-lime)]">
                          {formatNumber(kw.avgMonthlySearches)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          kw.competition === 'LOW' ? 'bg-green-500/20 text-green-400' :
                          kw.competition === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' :
                          kw.competition === 'HIGH' ? 'bg-red-500/20 text-red-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {kw.competition}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono text-sm text-[var(--text-secondary)]">
                          {kw.competitionIndex}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono text-sm text-[var(--text-secondary)]">
                          {kw.lowTopOfPageBidMicros
                            ? `${kw.bidCurrency === 'INR' ? '₹' : '$'}${(kw.lowTopOfPageBidMicros / 1000000).toFixed(2)}`
                            : '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono text-sm text-[var(--text-secondary)]">
                          {kw.highTopOfPageBidMicros
                            ? `${kw.bidCurrency === 'INR' ? '₹' : '$'}${(kw.highTopOfPageBidMicros / 1000000).toFixed(2)}`
                            : '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {kw.inAccount ? (
                          <span
                            className="inline-flex items-center justify-center min-w-[24px] px-2 py-1 rounded-full bg-[var(--accent-lime)]/20 text-[var(--accent-lime)] text-xs font-bold cursor-help"
                            title={kw.inAccountNames?.join(', ') || 'In account'}
                          >
                            {kw.inAccountNames && kw.inAccountNames.length > 1
                              ? `${kw.inAccountNames.length}`
                              : kw.inAccountNames?.[0]?.split(' ')[0] || 'Y'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)] text-xs">
                            -
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-tertiary)] flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                <span>Total: <strong className="text-[var(--text-primary)]">{selectedItem.keywordIdeas.length}</strong> keywords</span>
                <span>Low Competition: <strong className="text-green-400">{selectedItem.keywordIdeas.filter(k => k.competition === 'LOW').length}</strong></span>
                <span>Medium: <strong className="text-yellow-400">{selectedItem.keywordIdeas.filter(k => k.competition === 'MEDIUM').length}</strong></span>
                <span>High: <strong className="text-red-400">{selectedItem.keywordIdeas.filter(k => k.competition === 'HIGH').length}</strong></span>
              </div>
              <button
                onClick={() => {
                  // Export raw keywords as CSV - detect currency from first keyword
                  const currency = selectedItem.keywordIdeas[0]?.bidCurrency || 'INR'
                  const currencySymbol = currency === 'INR' ? '₹' : '$'
                  const headers = ['Keyword', 'Avg Monthly Searches', 'Competition', 'Competition Index', `Low Top of Page Bid (${currencySymbol})`, `High Top of Page Bid (${currencySymbol})`, 'In Account', 'Account Names']
                  const rows = selectedItem.keywordIdeas.map(kw => [
                    kw.keyword,
                    kw.avgMonthlySearches,
                    kw.competition,
                    kw.competitionIndex,
                    kw.lowTopOfPageBidMicros ? (kw.lowTopOfPageBidMicros / 1000000).toFixed(2) : '',
                    kw.highTopOfPageBidMicros ? (kw.highTopOfPageBidMicros / 1000000).toFixed(2) : '',
                    kw.inAccount ? 'Yes' : 'No',
                    kw.inAccountNames?.join('; ') || ''
                  ])
                  const csvContent = [
                    headers.join(','),
                    ...rows.map(row => row.map(cell =>
                      typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
                    ).join(','))
                  ].join('\n')
                  downloadCSV(csvContent, `raw-keywords-${selectedItem.courseInput.courseName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`)
                }}
                className="px-4 py-2 rounded-lg bg-[var(--accent-electric)] text-white text-sm font-medium hover:bg-[var(--accent-electric)]/80 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export Raw CSV
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-[1600px] mx-auto p-6">
        {/* Upload View */}
        {activeView === 'upload' && (
          <div className="flex flex-col items-center justify-center min-h-[70vh]">
            <div className="w-full max-w-2xl">
              <div className="text-center mb-8">
                <h2 className="font-display font-bold text-4xl mb-4 bg-gradient-to-r from-cyan-400 via-violet-400 to-rose-400 bg-clip-text text-transparent">
                  Batch Keyword Research
                </h2>
                <p className="text-[var(--text-secondary)] text-lg">
                  Upload your course CSV to generate AI-powered keyword insights
                </p>
              </div>

              {/* Data Source, Account & Country Settings */}
              <div className="mb-8 p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-5 h-5 text-[var(--accent-electric)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  <h3 className="font-medium text-sm">Data Source, Account & Region</h3>
                </div>

                <div className={`grid gap-4 ${dataSource === 'keywords_everywhere' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {/* Data Source Selection */}
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">
                      Keyword Data Source
                    </label>
                    <div className="space-y-2">
                      {DATA_SOURCE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setDataSource(option.value)}
                          className={`w-full p-3 rounded-xl text-left transition-all ${
                            dataSource === option.value
                              ? 'bg-[var(--accent-electric)]/10 border-2 border-[var(--accent-electric)]'
                              : 'bg-[var(--bg-tertiary)] border-2 border-transparent hover:border-[var(--border-default)]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-medium ${
                              dataSource === option.value ? 'text-[var(--accent-electric)]' : 'text-[var(--text-primary)]'
                            }`}>
                              {option.label}
                            </span>
                            {option.creditCost && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]">
                                {option.creditCost}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-muted)] mt-1">{option.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Google Ads Account Selection - Only show for Google Ads data source */}
                  {dataSource !== 'keywords_everywhere' && (
                    <div>
                      <label className="block text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">
                        Google Ads Account
                      </label>
                      <p className="text-[10px] text-[var(--text-muted)] mb-2">For "In Account" check</p>
                      <div className="space-y-2">
                        {GOOGLE_ADS_ACCOUNTS.map((account) => (
                          <button
                            key={account.id}
                            onClick={() => setSelectedGoogleAdsAccountId(account.id)}
                            className={`w-full p-3 rounded-xl text-left transition-all ${
                              selectedGoogleAdsAccountId === account.id
                                ? 'bg-[var(--accent-violet)]/10 border-2 border-[var(--accent-violet)]'
                                : 'bg-[var(--bg-tertiary)] border-2 border-transparent hover:border-[var(--border-default)]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className={`text-sm font-medium ${
                                selectedGoogleAdsAccountId === account.id ? 'text-[var(--accent-violet)]' : 'text-[var(--text-primary)]'
                              }`}>
                                {account.name}
                              </span>
                              {account.customerId === 'ALL' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-electric)]/20 text-[var(--accent-electric)]">
                                  All
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[var(--text-muted)] mt-1 font-mono">
                              {account.customerId === 'ALL' ? 'Check all accounts' : account.customerId}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Country Selection */}
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">
                      Target Country
                    </label>
                    <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-2">
                      {COUNTRY_OPTIONS.map((country) => (
                        <button
                          key={country.value}
                          onClick={() => setTargetCountry(country.value)}
                          className={`p-2 rounded-lg text-left transition-all flex items-center gap-2 ${
                            targetCountry === country.value
                              ? 'bg-[var(--accent-lime)]/10 border-2 border-[var(--accent-lime)]'
                              : 'bg-[var(--bg-tertiary)] border-2 border-transparent hover:border-[var(--border-default)]'
                          }`}
                        >
                          <span className="text-base">{country.flag}</span>
                          <span className={`text-xs font-medium ${
                            targetCountry === country.value ? 'text-[var(--accent-lime)]' : 'text-[var(--text-primary)]'
                          }`}>
                            {country.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Current Selection Summary */}
                <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)]">Source:</span>
                      <span className="text-xs font-medium text-[var(--accent-electric)]">
                        {DATA_SOURCE_OPTIONS.find(o => o.value === dataSource)?.label}
                      </span>
                    </div>
                    {dataSource !== 'keywords_everywhere' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-muted)]">Account:</span>
                        <span className="text-xs font-medium text-[var(--accent-violet)]">
                          {GOOGLE_ADS_ACCOUNTS.find(a => a.id === selectedGoogleAdsAccountId)?.name}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)]">Region:</span>
                      <span className="text-xs font-medium text-[var(--accent-lime)]">
                        {COUNTRY_OPTIONS.find(c => c.value === targetCountry)?.flag} {COUNTRY_OPTIONS.find(c => c.value === targetCountry)?.label}
                      </span>
                    </div>
                  </div>
                  {dataSource === 'keywords_everywhere' && (
                    <span className="text-[10px] text-[var(--accent-amber)]">
                      Credits will be used
                    </span>
                  )}
                </div>
              </div>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`drop-zone rounded-2xl p-12 cursor-pointer transition-all ${isDragging ? 'drag-over glow-electric' : 'hover:border-[var(--border-strong)]'}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  className="hidden"
                />
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center">
                    <svg className="w-8 h-8 text-[var(--accent-electric)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-[var(--text-primary)] font-medium mb-1">
                      Drop your CSV file here or click to browse
                    </p>
                    <p className="text-[var(--text-muted)] text-sm">
                      Required columns: URL, Course Name, Vendor
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                <h3 className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">CSV Format</h3>
                <code className="text-xs text-[var(--accent-lime)] font-mono">
                  URL, Course Name, Course Code, Vendor, Certification, Course topics covered
                </code>
              </div>

              {/* Load Last Session Button */}
              {savedBatchItems && savedBatchItems.length > 0 && (
                <div className="mt-6 p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--accent-electric)]/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">Previous Session Available</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {savedBatchItems.length} course(s) • {savedBatchItems.filter(i => i.status === 'completed').length} completed
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { clearSavedBatchItems(); }}
                        className="px-3 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--accent-rose)] transition-colors"
                      >
                        Clear
                      </button>
                      <button
                        onClick={loadLastSession}
                        className="px-4 py-2 rounded-lg bg-[var(--accent-electric)] text-white text-sm font-medium hover:bg-[var(--accent-electric)]/80 transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Load Last Session
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Processing View */}
        {(activeView === 'processing' || activeView === 'results') && batchItems.length > 0 && (
          <div className="grid grid-cols-12 gap-6">
            {/* Left Panel - Course List */}
            <div className="col-span-4 space-y-4">
              {/* Current Settings Indicator */}
              <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[var(--accent-electric)]" />
                    <span className="text-xs font-medium text-[var(--text-secondary)]">
                      {DATA_SOURCE_OPTIONS.find(o => o.value === dataSource)?.label}
                    </span>
                  </div>
                  <div className="w-px h-4 bg-[var(--border-subtle)]" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{COUNTRY_OPTIONS.find(c => c.value === targetCountry)?.flag}</span>
                    <span className="text-xs font-medium text-[var(--text-secondary)]">
                      {COUNTRY_OPTIONS.find(c => c.value === targetCountry)?.label}
                    </span>
                  </div>
                </div>
                {dataSource === 'keywords_everywhere' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]">
                    Using credits
                  </span>
                )}
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                  <div className="text-2xl font-bold font-mono text-[var(--accent-lime)]">{stats.completed}</div>
                  <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Completed</div>
                </div>
                <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                  <div className="text-2xl font-bold font-mono text-[var(--accent-electric)]">{stats.processing}</div>
                  <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Processing</div>
                </div>
                <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                  <div className="text-2xl font-bold font-mono text-[var(--text-muted)]">{stats.pending}</div>
                  <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Pending</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                {!isProcessing && stats.pending > 0 && (
                  <button
                    onClick={startProcessing}
                    className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 text-white font-medium text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Start Processing
                  </button>
                )}
                {isProcessing && (
                  <button
                    onClick={stopProcessing}
                    className="flex-1 py-3 px-4 rounded-xl bg-[var(--accent-rose)] text-white font-medium text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    Stop
                  </button>
                )}
                {stats.completed > 0 && (
                  <button
                    onClick={exportAllResults}
                    className="py-3 px-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-default)] text-[var(--text-primary)] font-medium text-sm hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export All
                  </button>
                )}
              </div>

              {/* Course List */}
              <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] overflow-hidden">
                <div className="p-3 border-b border-[var(--border-subtle)]">
                  <span className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider">
                    {batchItems.length} Courses
                  </span>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {batchItems.map((item, index) => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      className={`p-4 border-b border-[var(--border-subtle)] cursor-pointer transition-all ${selectedItemId === item.id ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-hover)]'}`}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="flex items-start gap-3">
                        {/* Status Indicator */}
                        <div className="mt-1">
                          {item.status === 'pending' && (
                            <div className="w-2 h-2 rounded-full bg-[var(--text-muted)]" />
                          )}
                          {item.status === 'generating_seeds' && (
                            <div className="w-2 h-2 rounded-full bg-[var(--accent-amber)] animate-pulse" />
                          )}
                          {item.status === 'fetching_keywords' && (
                            <div className="w-2 h-2 rounded-full bg-[var(--accent-electric)] animate-pulse" />
                          )}
                          {item.status === 'saving_cache' && (
                            <div className="w-2 h-2 rounded-full bg-[var(--accent-lime)] animate-pulse" />
                          )}
                          {item.status === 'analyzing' && (
                            <div className="w-2 h-2 rounded-full bg-[var(--accent-violet)] animate-pulse" />
                          )}
                          {item.status === 'completed' && (
                            <div className="w-2 h-2 rounded-full bg-[var(--accent-lime)]" />
                          )}
                          {item.status === 'error' && (
                            <div className="w-2 h-2 rounded-full bg-[var(--accent-rose)]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-[var(--text-muted)]">#{item.rowIndex}</span>
                            {item.courseInput.primaryVendor && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                                {item.courseInput.primaryVendor}
                              </span>
                            )}
                            {item.cacheHit && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--accent-lime)]/20 text-[var(--accent-lime)]">
                                CACHED
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {item.courseInput.courseName}
                          </p>
                          <div className="flex items-center gap-3 mt-2">
                            {item.status === 'completed' && (
                              <>
                                <span className="text-xs text-[var(--text-muted)]">
                                  {item.keywordIdeas.length} raw / {item.analyzedKeywords.length} analyzed
                                </span>
                                {item.processingTimeMs && (
                                  <span className="text-xs text-[var(--accent-electric)]">
                                    {formatTime(item.processingTimeMs)}
                                  </span>
                                )}
                              </>
                            )}
                            {item.status === 'generating_seeds' && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-[var(--accent-amber)]">
                                  {item.progress?.steps.find(s => s.status === 'in_progress')?.details || 'Generating seeds...'}
                                </span>
                              </div>
                            )}
                            {item.status === 'fetching_keywords' && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-[var(--accent-electric)]">
                                  {item.progress?.steps.find(s => s.status === 'in_progress')?.details || 'Fetching ideas...'}
                                </span>
                              </div>
                            )}
                            {item.status === 'saving_cache' && (
                              <span className="text-xs text-[var(--accent-lime)]">Saving to cache...</span>
                            )}
                            {item.status === 'analyzing' && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-[var(--accent-violet)]">
                                  {item.progress?.analysisProgress
                                    ? `Analyzing... (${item.progress.analysisProgress.totalKeywords} keywords)`
                                    : 'Analyzing...'}
                                </span>
                              </div>
                            )}
                            {item.status === 'error' && (
                              <span className="text-xs text-[var(--accent-rose)] truncate">{item.error}</span>
                            )}
                          </div>
                          {/* Mini progress indicator for processing items */}
                          {item.progress && !['pending', 'completed', 'error'].includes(item.status) && (
                            <div className="mt-2 flex items-center gap-1">
                              {item.progress.steps.map((step, idx) => (
                                <div
                                  key={step.id}
                                  className={`h-1 flex-1 rounded-full transition-all ${
                                    step.status === 'completed' ? 'bg-[var(--accent-lime)]' :
                                    step.status === 'in_progress' ? 'bg-[var(--accent-electric)] animate-pulse' :
                                    step.status === 'error' ? 'bg-[var(--accent-rose)]' :
                                    'bg-[var(--border-subtle)]'
                                  }`}
                                  title={step.label}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Panel - Details */}
            <div className="col-span-8">
              {selectedItem ? (
                <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] overflow-hidden">
                  {/* Header */}
                  <div className="p-6 border-b border-[var(--border-subtle)]">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-display font-bold text-xl mb-1">{selectedItem.courseInput.courseName}</h3>
                        <p className="text-sm text-[var(--text-muted)]">{selectedItem.courseInput.courseUrl}</p>
                      </div>
                      {selectedItem.status === 'completed' && (
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-2xl font-bold font-mono text-[var(--accent-lime)]">
                              {selectedItem.analyzedKeywords.filter(k => k.action === 'ADD').length}
                            </div>
                            <div className="text-xs text-[var(--text-muted)]">to add</div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold font-mono text-[var(--accent-rose)]">
                              {selectedItem.analyzedKeywords.filter(k => k.priority?.includes('URGENT')).length}
                            </div>
                            <div className="text-xs text-[var(--text-muted)]">urgent</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* View Mode Toggle */}
                    {selectedItem.status === 'completed' && (
                      <div className="mt-4 flex items-center gap-4">
                        <div className="flex rounded-lg bg-[var(--bg-tertiary)] p-1">
                          <button
                            onClick={() => setDetailViewMode('raw')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                              detailViewMode === 'raw'
                                ? 'bg-[var(--accent-electric)] text-white'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            Raw Keywords ({selectedItem.keywordIdeas.length})
                          </button>
                          <button
                            onClick={() => setDetailViewMode('analyzed')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                              detailViewMode === 'analyzed'
                                ? 'bg-[var(--accent-violet)] text-white'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            Analyzed ({selectedItem.analyzedKeywords.length})
                          </button>
                        </div>

                        {/* Selection info */}
                        {selectedKeywords.size > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-[var(--accent-lime)]">{selectedKeywords.size} selected</span>
                            <button
                              onClick={exportSelected}
                              className="px-3 py-1 text-xs bg-[var(--accent-lime)]/20 text-[var(--accent-lime)] rounded-lg hover:bg-[var(--accent-lime)]/30"
                            >
                              Export Selected
                            </button>
                            <button
                              onClick={clearSelection}
                              className="px-3 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Seed Keywords */}
                    {selectedItem.seedKeywords.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedItem.seedKeywords.map((seed, i) => (
                          <span key={i} className="px-2 py-1 rounded-lg text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--accent-amber)]">
                            {seed.keyword}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Filters */}
                  {selectedItem.status === 'completed' && currentKeywords.length > 0 && (
                    <div className="px-4 py-3 bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)]">
                      <div className="flex items-center gap-4 flex-wrap">
                        {/* Search */}
                        <div className="flex-1 min-w-[200px]">
                          <input
                            type="text"
                            placeholder="Search keywords..."
                            value={filters.search}
                            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                            className="w-full px-3 py-1.5 text-sm bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-lg focus:outline-none focus:border-[var(--accent-electric)]"
                          />
                        </div>

                        {/* Competition filter */}
                        <div className="flex items-center gap-1">
                          {(['LOW', 'MEDIUM', 'HIGH'] as const).map(comp => (
                            <button
                              key={comp}
                              onClick={() => {
                                const newComps = filters.competition.includes(comp)
                                  ? filters.competition.filter(c => c !== comp)
                                  : [...filters.competition, comp]
                                setFilters({ ...filters, competition: newComps })
                              }}
                              className={`px-2 py-1 text-xs rounded ${
                                filters.competition.includes(comp)
                                  ? comp === 'LOW' ? 'bg-green-500/20 text-green-400'
                                    : comp === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400'
                                    : 'bg-red-500/20 text-red-400'
                                  : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                              }`}
                            >
                              {comp}
                            </button>
                          ))}
                        </div>

                        {/* Action filters for analyzed view */}
                        {detailViewMode === 'analyzed' && (
                          <div className="flex items-center gap-1">
                            {(['ADD', 'REVIEW', 'EXCLUDE'] as const).map(action => (
                              <button
                                key={action}
                                onClick={() => {
                                  const newActions = filters.actions.includes(action)
                                    ? filters.actions.filter(a => a !== action)
                                    : [...filters.actions, action]
                                  setFilters({ ...filters, actions: newActions })
                                }}
                                className={`px-2 py-1 text-xs rounded ${
                                  filters.actions.includes(action)
                                    ? action === 'ADD' ? 'bg-[var(--accent-lime)]/20 text-[var(--accent-lime)]'
                                      : action === 'REVIEW' ? 'bg-[var(--accent-amber)]/20 text-[var(--accent-amber)]'
                                      : 'bg-[var(--accent-rose)]/20 text-[var(--accent-rose)]'
                                    : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                                }`}
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Select all */}
                        <button
                          onClick={() => selectAllVisible(currentKeywords)}
                          className="px-3 py-1 text-xs bg-[var(--bg-secondary)] text-[var(--text-secondary)] rounded-lg hover:text-[var(--text-primary)]"
                        >
                          Select All ({filteredKeywords.length})
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Keywords Table */}
                  {selectedItem.status === 'completed' && filteredKeywords.length > 0 && (
                    <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                      <table className="w-full data-table">
                        <thead className="sticky top-0 bg-[var(--bg-secondary)]">
                          <tr>
                            <th className="w-10 py-3 px-2">
                              <input
                                type="checkbox"
                                checked={filteredKeywords.every(k => selectedKeywords.has(k.keyword))}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    selectAllVisible(currentKeywords)
                                  } else {
                                    clearSelection()
                                  }
                                }}
                                className="rounded"
                              />
                            </th>
                            <th className="text-left py-3 px-4">Keyword</th>
                            <th className="text-center py-3 px-2 w-16">In Acct</th>
                            <th className="text-right py-3 px-4">Volume</th>
                            <th className="text-center py-3 px-4">Comp</th>
                            {detailViewMode === 'analyzed' && (
                              <>
                                <th className="text-center py-3 px-4">Score</th>
                                <th className="text-center py-3 px-4">Tier</th>
                                <th className="text-center py-3 px-4">Action</th>
                                <th className="text-left py-3 px-4">Priority</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredKeywords
                            .sort((a, b) => {
                              if (detailViewMode === 'analyzed') {
                                return (b as AnalyzedKeyword).finalScore - (a as AnalyzedKeyword).finalScore
                              }
                              return b.avgMonthlySearches - a.avgMonthlySearches
                            })
                            .map((kw, i) => {
                              const isSelected = selectedKeywords.has(kw.keyword)
                              const analyzed = kw as AnalyzedKeyword

                              return (
                                <tr
                                  key={i}
                                  className={`${isSelected ? 'bg-[var(--accent-electric)]/5' : ''} hover:bg-[var(--bg-hover)]`}
                                >
                                  <td className="py-3 px-2">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleKeywordSelection(kw.keyword)}
                                      className="rounded"
                                    />
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className="text-sm text-[var(--text-primary)]">{kw.keyword}</span>
                                  </td>
                                  <td className="py-3 px-2 text-center">
                                    {kw.inAccount ? (
                                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--accent-lime)]/20 text-[var(--accent-lime)] text-xs font-bold" title="Already in account">
                                        Y
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)] text-xs" title="Not in account">
                                        -
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <span className="font-mono text-sm text-[var(--text-secondary)]">
                                      {formatNumber(kw.avgMonthlySearches)}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <span className={`text-sm font-medium ${
                                      kw.competition === 'LOW' ? 'comp-low' :
                                      kw.competition === 'MEDIUM' ? 'comp-medium' : 'comp-high'
                                    }`}>
                                      {kw.competition}
                                    </span>
                                  </td>
                                  {detailViewMode === 'analyzed' && (
                                    <>
                                      <td className="py-3 px-4 text-center">
                                        <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
                                          {analyzed.finalScore}
                                        </span>
                                      </td>
                                      <td className="py-3 px-4 text-center">
                                        <span className={`text-xs font-medium ${
                                          analyzed.tier === 'Tier 1' ? 'tier-1' :
                                          analyzed.tier === 'Tier 2' ? 'tier-2' :
                                          analyzed.tier === 'Tier 3' ? 'tier-3' : 'tier-4'
                                        }`}>
                                          {analyzed.tier}
                                        </span>
                                      </td>
                                      <td className="py-3 px-4 text-center">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                          analyzed.action === 'ADD' ? 'badge-success' : 'badge-review'
                                        }`}>
                                          {analyzed.action}
                                        </span>
                                      </td>
                                      <td className="py-3 px-4">
                                        {analyzed.priority && (
                                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            analyzed.priority.includes('URGENT') ? 'badge-urgent' :
                                            analyzed.priority.includes('HIGH') ? 'badge-high' :
                                            analyzed.priority.includes('MEDIUM') ? 'badge-medium' : 'badge-standard'
                                          }`}>
                                            {analyzed.priority}
                                          </span>
                                        )}
                                      </td>
                                    </>
                                  )}
                                </tr>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Processing State with Step Progress */}
                  {!['pending', 'completed', 'error'].includes(selectedItem.status) && (
                    <div className="p-8">
                      {/* Progress Header */}
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full border-2 border-[var(--accent-electric)] border-t-transparent animate-spin" />
                          <div>
                            <p className="text-[var(--text-primary)] font-medium">Processing...</p>
                            <p className="text-xs text-[var(--text-muted)]">
                              Step {selectedItem.progress?.currentStep || 0} of {selectedItem.progress?.totalSteps || 6}
                            </p>
                          </div>
                        </div>
                        {selectedItem.startTime && (
                          <div className="text-right">
                            <p className="font-mono text-lg text-[var(--accent-electric)]">
                              {formatTime(Date.now() - selectedItem.startTime)}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">elapsed</p>
                          </div>
                        )}
                      </div>

                      {/* Step Progress List */}
                      <div className="space-y-3">
                        {selectedItem.progress?.steps.map((step, index) => {
                          // Check if this step has viewable data (fetch_keywords step with results)
                          const isKeywordsFetchStep = step.id === 'fetch_keywords'
                          const hasKeywordsData = selectedItem.keywordIdeas && selectedItem.keywordIdeas.length > 0
                          const isClickable = isKeywordsFetchStep && hasKeywordsData && step.status === 'completed'

                          return (
                          <div
                            key={step.id}
                            onClick={() => {
                              if (isClickable) {
                                setShowRawKeywordsModal(true)
                              }
                            }}
                            className={`p-4 rounded-xl border transition-all ${
                              isClickable ? 'cursor-pointer hover:ring-2 hover:ring-[var(--accent-electric)]/50' : ''
                            } ${
                              step.status === 'in_progress'
                                ? 'bg-[var(--accent-electric)]/10 border-[var(--accent-electric)]'
                                : step.status === 'completed'
                                ? 'bg-[var(--accent-lime)]/5 border-[var(--accent-lime)]/30'
                                : step.status === 'error'
                                ? 'bg-[var(--accent-rose)]/10 border-[var(--accent-rose)]'
                                : 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)]'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Step Status Icon */}
                              <div className="flex-shrink-0">
                                {step.status === 'pending' && (
                                  <div className="w-6 h-6 rounded-full border-2 border-[var(--border-default)] flex items-center justify-center">
                                    <span className="text-xs text-[var(--text-muted)]">{index + 1}</span>
                                  </div>
                                )}
                                {step.status === 'in_progress' && (
                                  <div className="w-6 h-6 rounded-full border-2 border-[var(--accent-electric)] border-t-transparent animate-spin" />
                                )}
                                {step.status === 'completed' && (
                                  <div className="w-6 h-6 rounded-full bg-[var(--accent-lime)] flex items-center justify-center">
                                    <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                                {step.status === 'error' && (
                                  <div className="w-6 h-6 rounded-full bg-[var(--accent-rose)] flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </div>
                                )}
                              </div>

                              {/* Step Info */}
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${
                                  step.status === 'in_progress' ? 'text-[var(--accent-electric)]' :
                                  step.status === 'completed' ? 'text-[var(--accent-lime)]' :
                                  step.status === 'error' ? 'text-[var(--accent-rose)]' :
                                  'text-[var(--text-muted)]'
                                }`}>
                                  {step.label}
                                </p>
                                {step.details && (
                                  <p className={`text-xs mt-0.5 ${
                                    step.status === 'error' ? 'text-[var(--accent-rose)]' : 'text-[var(--text-muted)]'
                                  }`}>
                                    {step.details}
                                  </p>
                                )}
                              </div>

                              {/* Step Timing */}
                              {step.endTime && step.startTime && (
                                <span className="text-xs font-mono text-[var(--text-muted)]">
                                  {formatTime(step.endTime - step.startTime)}
                                </span>
                              )}

                              {/* View Keywords Button for fetch_keywords step */}
                              {isClickable && (
                                <button
                                  className="ml-2 px-3 py-1 text-xs bg-[var(--accent-electric)]/20 text-[var(--accent-electric)] rounded-lg hover:bg-[var(--accent-electric)]/30 transition-colors flex items-center gap-1"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                  View
                                </button>
                              )}
                            </div>

                            {/* Analysis Progress Indicator (for analyze step) */}
                            {step.id === 'analyze' && step.status === 'in_progress' && (
                              <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                                <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                                  <div className="h-full w-full bg-gradient-to-r from-[var(--accent-electric)] to-[var(--accent-violet)] rounded-full animate-pulse" />
                                </div>
                              </div>
                            )}
                          </div>
                        )})}
                      </div>
                    </div>
                  )}

                  {/* Error State - Show partial data if available */}
                  {selectedItem.status === 'error' && (
                    <div className="p-6">
                      {/* Error Banner */}
                      <div className="mb-6 p-4 rounded-xl bg-[var(--accent-rose)]/10 border border-[var(--accent-rose)]/30">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-full bg-[var(--accent-rose)]/20 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-[var(--accent-rose)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[var(--accent-rose)] font-medium text-sm">Processing Error</p>
                            <p className="text-[var(--text-muted)] text-xs mt-1 break-words">{selectedItem.error}</p>
                          </div>
                        </div>
                      </div>

                      {/* Step Progress (shows which steps completed/failed) */}
                      {selectedItem.progress && (
                        <div className="mb-6">
                          <p className="text-sm font-medium text-[var(--text-secondary)] mb-3">Processing Steps</p>
                          <div className="space-y-2">
                            {selectedItem.progress.steps.map((step, index) => (
                              <div key={step.id} className={`p-3 rounded-lg border ${
                                step.status === 'completed' ? 'bg-[var(--accent-lime)]/5 border-[var(--accent-lime)]/30' :
                                step.status === 'error' ? 'bg-[var(--accent-rose)]/10 border-[var(--accent-rose)]/30' :
                                'bg-[var(--bg-tertiary)] border-[var(--border-subtle)]'
                              }`}>
                                <div className="flex items-center gap-2">
                                  {step.status === 'completed' && (
                                    <svg className="w-4 h-4 text-[var(--accent-lime)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                  {step.status === 'error' && (
                                    <svg className="w-4 h-4 text-[var(--accent-rose)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  )}
                                  {step.status === 'pending' && (
                                    <div className="w-4 h-4 rounded-full border border-[var(--border-default)] flex items-center justify-center">
                                      <span className="text-[8px] text-[var(--text-muted)]">{index + 1}</span>
                                    </div>
                                  )}
                                  <span className={`text-sm ${
                                    step.status === 'completed' ? 'text-[var(--accent-lime)]' :
                                    step.status === 'error' ? 'text-[var(--accent-rose)]' :
                                    'text-[var(--text-muted)]'
                                  }`}>{step.label}</span>
                                </div>
                                {step.details && (
                                  <p className={`text-xs mt-1 ml-6 ${
                                    step.status === 'error' ? 'text-[var(--accent-rose)]' : 'text-[var(--text-muted)]'
                                  }`}>{step.details}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Show Raw Keywords if available (even on error) */}
                      {selectedItem.keywordIdeas && selectedItem.keywordIdeas.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-medium text-[var(--text-secondary)]">
                              Raw Keywords from Google Ads ({selectedItem.keywordIdeas.length})
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setShowRawKeywordsModal(true)}
                                className="px-3 py-1.5 text-xs bg-[var(--accent-electric)]/20 text-[var(--accent-electric)] rounded-lg hover:bg-[var(--accent-electric)]/30 transition-colors flex items-center gap-1"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                View All
                              </button>
                              <button
                                onClick={() => {
                                  const csvContent = [
                                    'Keyword,Search Volume,Competition,Competition Index,Low Bid,High Bid',
                                    ...selectedItem.keywordIdeas.map(kw =>
                                      `"${kw.keyword}",${kw.avgMonthlySearches},${kw.competition},${kw.competitionIndex},${kw.lowTopOfPageBidMicros || ''},${kw.highTopOfPageBidMicros || ''}`
                                    )
                                  ].join('\n')
                                  downloadCSV(csvContent, `raw-keywords-${selectedItem.courseInput.courseName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`)
                                }}
                                className="px-3 py-1.5 text-xs bg-[var(--accent-lime)]/20 text-[var(--accent-lime)] rounded-lg hover:bg-[var(--accent-lime)]/30 transition-colors flex items-center gap-1"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Export CSV
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-[var(--text-muted)]">
                            Keywords were fetched from Google Ads before the error occurred. You can still view and export them.
                          </p>
                        </div>
                      )}

                      {/* Show Seeds if available */}
                      {selectedItem.seedKeywords && selectedItem.seedKeywords.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
                          <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Generated Seeds ({selectedItem.seedKeywords.length})</p>
                          <div className="flex flex-wrap gap-1">
                            {selectedItem.seedKeywords.map((seed, i) => (
                              <span key={i} className="px-2 py-0.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-xs rounded">
                                {seed.keyword}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pending State */}
                  {selectedItem.status === 'pending' && (
                    <div className="p-12 flex flex-col items-center justify-center text-center">
                      <div className="w-12 h-12 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-4">
                        <svg className="w-6 h-6 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-[var(--text-secondary)]">Waiting to process</p>
                      <p className="text-[var(--text-muted)] text-sm mt-1">Click "Start Processing" to begin</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-12 flex flex-col items-center justify-center text-center min-h-[50vh]">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                    </svg>
                  </div>
                  <p className="text-[var(--text-secondary)] font-medium mb-1">Select a course</p>
                  <p className="text-[var(--text-muted)] text-sm">Click on a course from the list to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
