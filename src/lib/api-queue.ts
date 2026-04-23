/**
 * API Queue Manager
 *
 * Ensures truly sequential processing of Google Ads API calls
 * to prevent quota exhaustion when processing large batches of courses.
 *
 * Features:
 * - Sequential execution with mutex (one API call at a time)
 * - Adaptive rate limiting (slows down on errors, speeds up on success)
 * - Pause/Resume capability for quota exhaustion
 * - Progress tracking with ETA calculation
 * - Event-based updates for UI
 */

// ============================================
// TYPES
// ============================================

export interface QueuedRequest {
  id: string
  courseId: string
  courseName: string
  type: 'fetch_keywords'
  priority: number
  addedAt: number
  startedAt?: number
  completedAt?: number
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  error?: string
  retryCount: number
}

export interface QueueState {
  isPaused: boolean
  pauseReason?: 'quota_exhausted' | 'user_paused' | 'error'
  pausedAt?: number
  resumeAt?: number
  totalRequests: number
  completedRequests: number
  failedRequests: number
  currentRequest?: QueuedRequest
  queue: QueuedRequest[]
  averageRequestTime: number
  estimatedTimeRemaining: number
  adaptiveDelayMs: number
  consecutiveSuccesses: number
  consecutiveFailures: number
}

export interface QueueProgress {
  phase: 'idle' | 'processing' | 'paused' | 'completed' | 'error'
  current?: {
    courseId: string
    courseName: string
    step: string
  }
  completed: number
  total: number
  failed: number
  estimatedTimeRemaining: number
  isPaused: boolean
  pauseReason?: string
  resumeAt?: number
}

export type QueueEventType =
  | 'progress'
  | 'request_start'
  | 'request_complete'
  | 'request_error'
  | 'paused'
  | 'resumed'
  | 'completed'
  | 'quota_exhausted'

export interface QueueEvent {
  type: QueueEventType
  data: QueueProgress | QueuedRequest | { reason: string; resumeAt?: number }
  timestamp: number
}

type QueueEventCallback = (event: QueueEvent) => void

// ============================================
// CONSTANTS
// ============================================

const ADAPTIVE_DELAY_MIN_MS = 1500   // Minimum delay between requests
const ADAPTIVE_DELAY_MAX_MS = 5000   // Maximum delay
const ADAPTIVE_DELAY_DEFAULT_MS = 1500
const DELAY_INCREASE_FACTOR = 1.5    // Increase delay by 50% on error
const DELAY_DECREASE_FACTOR = 0.95   // Decrease delay by 5% on success
const SUCCESS_STREAK_THRESHOLD = 5   // Reduce delay after 5 consecutive successes
const QUOTA_COOLDOWN_MS = 5 * 60 * 1000  // 5 minute cooldown on quota exhaustion
const MAX_RETRIES = 2                // Max retries per request

// ============================================
// API QUEUE MANAGER CLASS
// ============================================

class ApiQueueManager {
  private static instance: ApiQueueManager | null = null

  private queue: QueuedRequest[] = []
  private isProcessing = false
  private isPaused = false
  private pauseReason?: 'quota_exhausted' | 'user_paused' | 'error'
  private pausedAt?: number
  private resumeAt?: number
  private abortController: AbortController | null = null

  // Adaptive rate limiting state
  private adaptiveDelayMs = ADAPTIVE_DELAY_DEFAULT_MS
  private consecutiveSuccesses = 0
  private consecutiveFailures = 0

  // Stats
  private completedRequests = 0
  private failedRequests = 0
  private totalRequestTime = 0
  private requestTimes: number[] = []

  // Event subscribers
  private subscribers: Set<QueueEventCallback> = new Set()

  // Resume timer
  private resumeTimer: NodeJS.Timeout | null = null

  private constructor() {}

  static getInstance(): ApiQueueManager {
    if (!ApiQueueManager.instance) {
      ApiQueueManager.instance = new ApiQueueManager()
    }
    return ApiQueueManager.instance
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Add a request to the queue
   */
  enqueue(request: Omit<QueuedRequest, 'id' | 'addedAt' | 'status' | 'retryCount'>): string {
    const id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const queuedRequest: QueuedRequest = {
      ...request,
      id,
      addedAt: Date.now(),
      status: 'pending',
      retryCount: 0
    }

    this.queue.push(queuedRequest)
    this.queue.sort((a, b) => b.priority - a.priority) // Higher priority first

    console.log(`[QUEUE] Enqueued request ${id} for ${request.courseName}`)

    return id
  }

  /**
   * Add multiple requests at once
   */
  enqueueAll(requests: Array<Omit<QueuedRequest, 'id' | 'addedAt' | 'status' | 'retryCount'>>): string[] {
    return requests.map(req => this.enqueue(req))
  }

  /**
   * Start processing the queue
   */
  async start(
    processFunction: (request: QueuedRequest, signal: AbortSignal) => Promise<void>
  ): Promise<void> {
    if (this.isProcessing) {
      console.log('[QUEUE] Already processing')
      return
    }

    this.isProcessing = true
    this.abortController = new AbortController()

    console.log(`[QUEUE] Starting processing of ${this.queue.length} requests`)
    this.emitProgress()

    while (this.queue.length > 0 && !this.abortController.signal.aborted) {
      // Check if paused
      if (this.isPaused) {
        console.log('[QUEUE] Paused, waiting for resume...')
        await this.waitForResume()
        if (this.abortController.signal.aborted) break
      }

      // Get next pending request
      const request = this.queue.find(r => r.status === 'pending')
      if (!request) break

      // Process the request
      await this.processRequest(request, processFunction)

      // Adaptive delay before next request
      if (this.queue.some(r => r.status === 'pending')) {
        await this.adaptiveDelay()
      }
    }

    this.isProcessing = false
    this.emitEvent('completed', this.getProgress())
    console.log(`[QUEUE] Processing completed. Success: ${this.completedRequests}, Failed: ${this.failedRequests}`)
  }

  /**
   * Pause processing
   */
  pause(reason: 'quota_exhausted' | 'user_paused' | 'error' = 'user_paused', resumeAfterMs?: number): void {
    if (!this.isProcessing || this.isPaused) return

    this.isPaused = true
    this.pauseReason = reason
    this.pausedAt = Date.now()

    if (resumeAfterMs) {
      this.resumeAt = Date.now() + resumeAfterMs
      this.scheduleAutoResume(resumeAfterMs)
    }

    console.log(`[QUEUE] Paused: ${reason}${resumeAfterMs ? `, will resume in ${resumeAfterMs / 1000}s` : ''}`)
    this.emitEvent('paused', { reason, resumeAt: this.resumeAt })
  }

  /**
   * Resume processing
   */
  resume(): void {
    if (!this.isPaused) return

    this.isPaused = false
    this.pauseReason = undefined
    this.pausedAt = undefined
    this.resumeAt = undefined

    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer)
      this.resumeTimer = null
    }

    console.log('[QUEUE] Resumed')
    this.emitEvent('resumed', { reason: 'user_resumed' })
  }

  /**
   * Cancel all pending requests
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort()
    }

    // Mark all pending as cancelled
    this.queue.forEach(req => {
      if (req.status === 'pending' || req.status === 'processing') {
        req.status = 'cancelled'
      }
    })

    this.isPaused = false
    this.isProcessing = false

    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer)
      this.resumeTimer = null
    }

    console.log('[QUEUE] Cancelled')
    this.emitProgress()
  }

  /**
   * Clear the queue and reset state
   */
  clear(): void {
    this.cancel()
    this.queue = []
    this.completedRequests = 0
    this.failedRequests = 0
    this.totalRequestTime = 0
    this.requestTimes = []
    this.adaptiveDelayMs = ADAPTIVE_DELAY_DEFAULT_MS
    this.consecutiveSuccesses = 0
    this.consecutiveFailures = 0

    console.log('[QUEUE] Cleared')
  }

  /**
   * Get current queue state
   */
  getState(): QueueState {
    return {
      isPaused: this.isPaused,
      pauseReason: this.pauseReason,
      pausedAt: this.pausedAt,
      resumeAt: this.resumeAt,
      totalRequests: this.queue.length,
      completedRequests: this.completedRequests,
      failedRequests: this.failedRequests,
      currentRequest: this.queue.find(r => r.status === 'processing'),
      queue: [...this.queue],
      averageRequestTime: this.getAverageRequestTime(),
      estimatedTimeRemaining: this.getEstimatedTimeRemaining(),
      adaptiveDelayMs: this.adaptiveDelayMs,
      consecutiveSuccesses: this.consecutiveSuccesses,
      consecutiveFailures: this.consecutiveFailures
    }
  }

  /**
   * Get simplified progress for UI
   */
  getProgress(): QueueProgress {
    const current = this.queue.find(r => r.status === 'processing')
    const pending = this.queue.filter(r => r.status === 'pending').length

    let phase: QueueProgress['phase'] = 'idle'
    if (this.isProcessing) {
      phase = this.isPaused ? 'paused' : 'processing'
    } else if (this.completedRequests > 0 || this.failedRequests > 0) {
      phase = this.failedRequests > 0 && this.completedRequests === 0 ? 'error' : 'completed'
    }

    return {
      phase,
      current: current ? {
        courseId: current.courseId,
        courseName: current.courseName,
        step: 'Fetching keywords...'
      } : undefined,
      completed: this.completedRequests,
      total: this.queue.length,
      failed: this.failedRequests,
      estimatedTimeRemaining: this.getEstimatedTimeRemaining(),
      isPaused: this.isPaused,
      pauseReason: this.pauseReason,
      resumeAt: this.resumeAt
    }
  }

  /**
   * Subscribe to queue events
   */
  subscribe(callback: QueueEventCallback): () => void {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  /**
   * Handle quota exhaustion
   */
  handleQuotaExhausted(): void {
    console.log('[QUEUE] Quota exhausted, pausing for cooldown')
    this.pause('quota_exhausted', QUOTA_COOLDOWN_MS)
    this.emitEvent('quota_exhausted', {
      reason: 'quota_exhausted',
      resumeAt: this.resumeAt
    })
  }

  /**
   * Report successful request (for adaptive delay)
   */
  reportSuccess(durationMs: number): void {
    this.consecutiveSuccesses++
    this.consecutiveFailures = 0
    this.requestTimes.push(durationMs)

    // Keep only last 20 request times
    if (this.requestTimes.length > 20) {
      this.requestTimes.shift()
    }

    // Decrease delay after streak of successes
    if (this.consecutiveSuccesses >= SUCCESS_STREAK_THRESHOLD) {
      this.adaptiveDelayMs = Math.max(
        this.adaptiveDelayMs * DELAY_DECREASE_FACTOR,
        ADAPTIVE_DELAY_MIN_MS
      )
      console.log(`[QUEUE] Decreased delay to ${this.adaptiveDelayMs.toFixed(0)}ms after ${this.consecutiveSuccesses} successes`)
    }
  }

  /**
   * Report failed request (for adaptive delay).
   *
   * Accepts either the legacy `isQuotaError: boolean` form (kept for backward compatibility
   * with existing callers) OR a structured ApiErrorResponse. When a structured error is
   * passed, the behavior branches by `type`:
   *   - RATE_LIMITED: honor retryAfterMs if present; bump adaptive delay
   *   - QUOTA_EXHAUSTED: trigger 5-min cooldown
   *   - OVERLOAD: retry without future slowdown (don't bump adaptiveDelayMs)
   *   - NETWORK: retry once with existing delay
   *   - AUTH: surface, don't retry
   */
  reportFailure(errorOrIsQuota: boolean | {
    type: 'QUOTA_EXHAUSTED' | 'RATE_LIMITED' | 'OVERLOAD' | 'AUTH' | 'NETWORK' | 'VALIDATION' | 'UNKNOWN'
    retryAfterMs?: number
  }): void {
    this.consecutiveFailures++
    this.consecutiveSuccesses = 0

    // Legacy boolean signature
    if (typeof errorOrIsQuota === 'boolean') {
      this.adaptiveDelayMs = Math.min(
        this.adaptiveDelayMs * DELAY_INCREASE_FACTOR,
        ADAPTIVE_DELAY_MAX_MS
      )
      console.log(`[QUEUE] Increased delay to ${this.adaptiveDelayMs.toFixed(0)}ms after failure`)
      if (errorOrIsQuota) {
        this.handleQuotaExhausted()
      }
      return
    }

    // Structured error
    const { type, retryAfterMs } = errorOrIsQuota

    switch (type) {
      case 'QUOTA_EXHAUSTED':
        this.handleQuotaExhausted()
        return

      case 'RATE_LIMITED':
        if (retryAfterMs && retryAfterMs >= 5_000) {
          // Honor explicit Retry-After — pause for that duration instead of just nudging the delay.
          console.log(`[QUEUE] Rate-limited. Honoring Retry-After: ${(retryAfterMs / 1000).toFixed(1)}s`)
          this.pause('quota_exhausted', Math.min(retryAfterMs, QUOTA_COOLDOWN_MS))
          this.emitEvent('quota_exhausted', { reason: 'rate_limited', resumeAt: this.resumeAt })
          return
        }
        this.adaptiveDelayMs = Math.min(
          this.adaptiveDelayMs * DELAY_INCREASE_FACTOR,
          ADAPTIVE_DELAY_MAX_MS
        )
        console.log(`[QUEUE] Rate-limited (no Retry-After). Bumped delay to ${this.adaptiveDelayMs.toFixed(0)}ms`)
        return

      case 'OVERLOAD':
        // Transient provider issue — don't bump adaptive delay for future requests.
        console.log(`[QUEUE] Transient overload (503/504). Retry without future slowdown.`)
        return

      case 'NETWORK':
        // Connectivity blip — retry once with existing delay, no future slowdown.
        console.log(`[QUEUE] Network error. Retry once with existing delay.`)
        return

      case 'AUTH':
        console.error(`[QUEUE] Auth error — not retrying.`)
        return

      default:
        // VALIDATION / UNKNOWN — bump delay defensively.
        this.adaptiveDelayMs = Math.min(
          this.adaptiveDelayMs * DELAY_INCREASE_FACTOR,
          ADAPTIVE_DELAY_MAX_MS
        )
        console.log(`[QUEUE] ${type} error. Bumped delay to ${this.adaptiveDelayMs.toFixed(0)}ms`)
    }
  }

  // ============================================
  // PER-CUSTOMER-ID MUTEX
  // ============================================
  // Google Ads rate-limit is 1 req/sec PER customer ID, not global. The old global
  // mutex serialized all requests which was over-restrictive. This per-customer
  // mutex lets multiple customers run in parallel while each customer stays serial.
  //
  // Usage: const release = await queue.acquireMutex(customerId); try { ... } finally { release() }
  // When customerId is undefined/empty, acquireMutex is a no-op (for non-Google-Ads calls).

  private customerMutexes: Map<string, Promise<void>> = new Map()

  async acquireMutex(customerId?: string): Promise<() => void> {
    if (!customerId) {
      return () => {}
    }
    const prior = this.customerMutexes.get(customerId) ?? Promise.resolve()
    let releaseFn: () => void = () => {}
    const current = new Promise<void>((resolve) => {
      releaseFn = resolve
    })
    this.customerMutexes.set(customerId, prior.then(() => current))

    await prior
    return () => {
      releaseFn()
      // If no newer acquire has happened, clean up the map entry.
      if (this.customerMutexes.get(customerId) === prior.then(() => current)) {
        this.customerMutexes.delete(customerId)
      }
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private async processRequest(
    request: QueuedRequest,
    processFunction: (request: QueuedRequest, signal: AbortSignal) => Promise<void>
  ): Promise<void> {
    request.status = 'processing'
    request.startedAt = Date.now()

    this.emitEvent('request_start', request)
    this.emitProgress()

    try {
      await processFunction(request, this.abortController!.signal)

      request.status = 'completed'
      request.completedAt = Date.now()
      this.completedRequests++

      const duration = request.completedAt - request.startedAt
      this.totalRequestTime += duration
      this.reportSuccess(duration)

      this.emitEvent('request_complete', request)
      console.log(`[QUEUE] Completed ${request.courseName} in ${duration}ms`)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      // Classify the error so we can branch behavior (quota vs rate-limit vs overload vs network).
      // classifyError lives in google-ads.ts; import lazily via require to avoid circular deps.
      // We fall back to the legacy string-match if the import ever fails.
      let classified: {
        type: 'QUOTA_EXHAUSTED' | 'RATE_LIMITED' | 'OVERLOAD' | 'AUTH' | 'NETWORK' | 'VALIDATION' | 'UNKNOWN'
        retryAfterMs?: number
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { classifyError } = require('./google-ads') as typeof import('./google-ads')
        classified = classifyError(error)
      } catch {
        // Fallback: legacy string match
        const lower = errorMessage.toLowerCase()
        const isQuota = lower.includes('quota') || lower.includes('exhausted') || errorMessage.includes('RESOURCE_EXHAUSTED')
        classified = { type: isQuota ? 'QUOTA_EXHAUSTED' : 'UNKNOWN' }
      }
      const isQuotaError = classified.type === 'QUOTA_EXHAUSTED'
      // RATE_LIMITED + OVERLOAD + NETWORK are retryable; AUTH is not; UNKNOWN/VALIDATION fall through to legacy path.
      const isRetryable = classified.type === 'RATE_LIMITED' || classified.type === 'OVERLOAD' || classified.type === 'NETWORK'

      request.retryCount++

      if (request.retryCount < MAX_RETRIES && !isQuotaError && (isRetryable || classified.type === 'UNKNOWN')) {
        // Retry the request
        console.log(`[QUEUE] Retrying ${request.courseName} (attempt ${request.retryCount + 1}, type=${classified.type})`)
        request.status = 'pending'
        this.reportFailure(classified)
      } else {
        // Mark as failed
        request.status = 'failed'
        request.error = errorMessage
        request.completedAt = Date.now()
        this.failedRequests++

        this.reportFailure(classified)
        this.emitEvent('request_error', request)
        console.error(`[QUEUE] Failed ${request.courseName} (type=${classified.type}): ${errorMessage}`)
      }
    }

    this.emitProgress()
  }

  private async adaptiveDelay(): Promise<void> {
    const base = this.adaptiveDelayMs
    // ±20% jitter avoids thundering-herd when multiple workers (concurrent courses)
    // hit rate limits simultaneously and all back off to the same delay.
    const jitter = base * (Math.random() - 0.5) * 0.4
    const delay = Math.max(0, base + jitter)
    console.log(`[QUEUE] Waiting ${delay.toFixed(0)}ms (base ${base.toFixed(0)}ms, jitter ${jitter >= 0 ? '+' : ''}${jitter.toFixed(0)}ms)`)
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  private async waitForResume(): Promise<void> {
    return new Promise<void>((resolve) => {
      const checkResume = () => {
        if (!this.isPaused || this.abortController?.signal.aborted) {
          resolve()
        } else {
          setTimeout(checkResume, 500)
        }
      }
      checkResume()
    })
  }

  private scheduleAutoResume(delayMs: number): void {
    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer)
    }

    this.resumeTimer = setTimeout(() => {
      console.log('[QUEUE] Auto-resuming after cooldown')
      this.resume()
    }, delayMs)
  }

  private getAverageRequestTime(): number {
    if (this.requestTimes.length === 0) return 3000 // Default estimate
    return this.requestTimes.reduce((a, b) => a + b, 0) / this.requestTimes.length
  }

  private getEstimatedTimeRemaining(): number {
    const pending = this.queue.filter(r => r.status === 'pending').length
    if (pending === 0) return 0

    const avgTime = this.getAverageRequestTime()
    const totalDelay = pending * this.adaptiveDelayMs

    return (pending * avgTime) + totalDelay
  }

  private emitEvent(type: QueueEventType, data: unknown): void {
    const event: QueueEvent = {
      type,
      data: data as QueueEvent['data'],
      timestamp: Date.now()
    }

    this.subscribers.forEach(callback => {
      try {
        callback(event)
      } catch (error) {
        console.error('[QUEUE] Error in subscriber callback:', error)
      }
    })
  }

  private emitProgress(): void {
    this.emitEvent('progress', this.getProgress())
  }
}

// ============================================
// EXPORTS
// ============================================

// Singleton instance
export const apiQueue = ApiQueueManager.getInstance()

// Helper function to format time remaining
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '0s'

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

// Helper to check if an error is a quota error
export function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.toLowerCase().includes('quota') ||
         message.toLowerCase().includes('exhausted') ||
         message.includes('RESOURCE_EXHAUSTED') ||
         message.includes('429')
}
