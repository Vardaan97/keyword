/**
 * Unified AI Client for OpenAI and OpenRouter
 * Supports seamless switching between providers with fallback
 */

import OpenAI from 'openai'
import { clampMaxTokens } from './model-caps'
import { estimateCostUsd } from './model-pricing'

export type AIProvider = 'openai' | 'openrouter'

export interface AIClientConfig {
  provider?: AIProvider
  model?: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionOptions {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean
  model?: string  // Override the default model for this request
  signal?: AbortSignal  // Propagate client abort to the SDK so in-flight requests stop
}

export interface ChatCompletionResult {
  content: string
  tokensUsed?: number
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  provider: AIProvider
  model: string
}

// OpenRouter models - verified model IDs (Apr 2026)
const OPENROUTER_MODELS = {
  default: 'google/gemini-3.1-flash-lite-preview',
  // Gemini 3.x — 65K output, 1M context
  gemini_3_1_flash_lite: 'google/gemini-3.1-flash-lite-preview',
  gemini_3_flash: 'google/gemini-3-flash-preview',
  // Gemini 2.5 — 65K output
  gemini_2_5_flash: 'google/gemini-2.5-flash',
  // Legacy Gemini — 8K output
  gemini_2_flash: 'google/gemini-2.0-flash-001',
  gemini_pro: 'google/gemini-pro-1.5',
  // OpenAI via OpenRouter
  gpt4o: 'openai/gpt-4o',
  gpt4o_mini: 'openai/gpt-4o-mini',
  // Claude via OpenRouter
  claude_sonnet: 'anthropic/claude-3.5-sonnet',
  claude_haiku: 'anthropic/claude-3-haiku',
  // Auto router
  auto: 'openrouter/auto',
} as const

/**
 * Fast analysis model priority order.
 * Element 0 is the primary; subsequent elements are retry fallbacks.
 * All three Gemini entries have ~65K output tokens, required for 250-keyword batches.
 */
export const ANALYSIS_MODEL_CHAIN: Record<AIProvider, string[]> = {
  openrouter: [
    'google/gemini-3.1-flash-lite-preview',  // primary — cheapest, 65K output
    'google/gemini-3-flash-preview',         // fallback 1 — slightly more capable
    'google/gemini-2.5-flash',               // fallback 2 — stable, proven, 65K output
    'google/gemini-2.5-flash-lite',          // fallback 3 — cheapest backup, 65K output
  ],
  openai: [
    'gpt-4o-mini',  // only option for direct OpenAI; retries stay on same model
  ],
}

/** Backwards-compat shim: existing code imports FAST_ANALYSIS_MODELS[provider] as a string. */
export const FAST_ANALYSIS_MODELS = {
  openrouter: ANALYSIS_MODEL_CHAIN.openrouter[0],
  openai: ANALYSIS_MODEL_CHAIN.openai[0],
} as const

// Alternative fast models (for manual selection or fallback)
export const ALTERNATIVE_MODELS = {
  gemini_flash: 'google/gemini-2.0-flash-001',  // VERIFIED - stable, fast
  gemini_flash_8b: 'google/gemini-flash-1.5-8b',  // Smaller model, faster
  gpt4o_mini: 'openai/gpt-4o-mini',  // Most reliable for JSON
  gpt4o: 'openai/gpt-4o',  // Larger, more capable
} as const

// OpenAI direct models
const OPENAI_MODELS = {
  default: 'gpt-4o-mini', // Use mini as default for direct OpenAI
  full: 'gpt-4o',
  mini: 'gpt-4o-mini',
} as const

// Default model selection based on provider
const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: OPENAI_MODELS.default, // gpt-4o-mini
  openrouter: OPENROUTER_MODELS.default, // gpt-4o-mini via OpenRouter
}

class AIClient {
  private openaiClient: OpenAI | null = null
  private openrouterClient: OpenAI | null = null
  private defaultProvider: AIProvider = 'openai'

  constructor() {
    this.initClients()
  }

  private initClients() {
    // Initialize OpenAI client
    if (process.env.OPENAI_API_KEY) {
      this.openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })
    }

    // Initialize OpenRouter client (uses OpenAI-compatible API)
    if (process.env.OPENROUTER_API_KEY) {
      this.openrouterClient = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'Koenig Keyword Planner',
        },
      })
    }

    // Set default provider based on available keys
    if (process.env.OPENROUTER_API_KEY) {
      this.defaultProvider = 'openrouter'
    } else if (process.env.OPENAI_API_KEY) {
      this.defaultProvider = 'openai'
    }
  }

  private getClient(provider: AIProvider): OpenAI {
    if (provider === 'openrouter') {
      if (!this.openrouterClient) {
        throw new Error('OpenRouter API key not configured')
      }
      return this.openrouterClient
    }

    if (!this.openaiClient) {
      throw new Error('OpenAI API key not configured')
    }
    return this.openaiClient
  }

  /**
   * Get the default provider based on available API keys
   */
  getDefaultProvider(): AIProvider {
    return this.defaultProvider
  }

  /**
   * Check if a provider is available
   */
  isProviderAvailable(provider: AIProvider): boolean {
    if (provider === 'openrouter') {
      return !!this.openrouterClient
    }
    return !!this.openaiClient
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): AIProvider[] {
    const providers: AIProvider[] = []
    if (this.openaiClient) providers.push('openai')
    if (this.openrouterClient) providers.push('openrouter')
    return providers
  }

  /**
   * Create a chat completion using the specified provider
   */
  async chatCompletion(
    options: ChatCompletionOptions,
    config?: AIClientConfig
  ): Promise<ChatCompletionResult> {
    const provider = config?.provider || this.defaultProvider
    // Allow model override from options (for fast analysis) or config
    const model = options.model || config?.model || DEFAULT_MODELS[provider]
    const client = this.getClient(provider)

    console.log(`[AI-CLIENT] Using ${provider} with model: ${model}`)

    // JSON mode is only reliably supported by OpenAI
    // For OpenRouter/Gemini, we rely on prompt engineering instead
    const supportsJsonMode = provider === 'openai'

    // Clamp max_tokens against the model's published output cap. Sending a
    // value above the cap causes OpenRouter/OpenAI to 400 with HTML bodies
    // in some edge cases — clamping prevents that class of failure.
    const safeMaxTokens = clampMaxTokens(model, options.maxTokens ?? 1000)
    if (safeMaxTokens !== (options.maxTokens ?? 1000)) {
      console.log(`[AI-CLIENT] Clamped max_tokens ${options.maxTokens} -> ${safeMaxTokens} for ${model}`)
    }

    try {
      const completion = await client.chat.completions.create(
        {
          model,
          messages: options.messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: safeMaxTokens,
          ...(options.jsonMode && supportsJsonMode && { response_format: { type: 'json_object' } }),
        },
        options.signal ? { signal: options.signal } : undefined,
      )

      const content = completion.choices[0]?.message?.content || ''
      const inputTokens = completion.usage?.prompt_tokens
      const outputTokens = completion.usage?.completion_tokens
      const tokensUsed = completion.usage?.total_tokens
      const costUsd = inputTokens !== undefined && outputTokens !== undefined
        ? estimateCostUsd(model, inputTokens, outputTokens)
        : 0

      console.log(`[AI-CLIENT] Response received. Tokens: ${tokensUsed ?? 'N/A'} (in: ${inputTokens ?? 'N/A'}, out: ${outputTokens ?? 'N/A'}) · Cost: $${costUsd.toFixed(6)}`)

      // Validate JSON response if jsonMode was requested
      if (options.jsonMode && content) {
        try {
          JSON.parse(content)
        } catch {
          // Try to extract JSON from response (sometimes models wrap in markdown)
          const jsonMatch = content.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            console.log('[AI-CLIENT] Extracted JSON from response')
            return {
              content: jsonMatch[0],
              tokensUsed,
              inputTokens,
              outputTokens,
              costUsd,
              provider,
              model,
            }
          }
          console.error('[AI-CLIENT] Response is not valid JSON:', content.substring(0, 200))
          throw new Error('AI response is not valid JSON')
        }
      }

      return {
        content,
        tokensUsed,
        inputTokens,
        outputTokens,
        costUsd,
        provider,
        model,
      }
    } catch (error: unknown) {
      // Surface HTTP status from the SDK so callers can log 400 vs 429 vs 504 clearly.
      // Preserve `headers` on the rethrown error so downstream classifiers (api-queue,
      // google-ads.classifyError) can parse the Retry-After header for 429 responses.
      const e = error as {
        status?: number
        message?: string
        error?: { message?: string }
        headers?: Record<string, string> | Headers
      }
      const status = e?.status ? `HTTP ${e.status}` : ''
      const msg = e?.error?.message || e?.message || String(error)
      console.error(`[AI-CLIENT] ${provider} error ${status}:`, msg)

      // Emit a retry-after hint when we can see one, so callers don't have to introspect the original error shape.
      let retryAfterHint = ''
      if (e.headers) {
        let retryAfter: string | null = null
        if (typeof (e.headers as Headers).get === 'function') {
          retryAfter = (e.headers as Headers).get('retry-after')
        } else {
          const rec = e.headers as Record<string, string>
          retryAfter = rec['retry-after'] ?? rec['Retry-After'] ?? null
        }
        if (retryAfter) {
          retryAfterHint = ` (retry-after: ${retryAfter}s)`
          console.warn(`[AI-CLIENT] ${provider} ${status} Retry-After: ${retryAfter}s`)
        }
      }

      // Wrap in an Error that still carries `status` and `headers` so classifyError() can parse them downstream.
      const wrapped = new Error(`${provider}${status ? ' ' + status : ''}: ${msg}${retryAfterHint}`) as Error & {
        status?: number
        headers?: Record<string, string> | Headers
      }
      wrapped.status = e.status
      wrapped.headers = e.headers
      throw wrapped
    }
  }

  /**
   * Create a chat completion with automatic fallback
   * Tries primary provider first, falls back to secondary if available
   */
  async chatCompletionWithFallback(
    options: ChatCompletionOptions,
    config?: AIClientConfig
  ): Promise<ChatCompletionResult> {
    const requestedProvider = config?.provider || this.defaultProvider
    const providers = this.getAvailableProviders()

    // If no providers available, throw helpful error
    if (providers.length === 0) {
      throw new Error('No AI providers configured. Please set OPENROUTER_API_KEY or OPENAI_API_KEY in your environment.')
    }

    // If requested provider isn't available, use what's available
    const primaryProvider = providers.includes(requestedProvider)
      ? requestedProvider
      : providers[0]

    if (primaryProvider !== requestedProvider) {
      console.log(`[AI-CLIENT] Requested ${requestedProvider} not available, using ${primaryProvider}`)
    }

    // Try primary provider first
    try {
      return await this.chatCompletion(options, {
        ...config,
        provider: primaryProvider,
      })
    } catch (error) {
      console.error(`[AI-CLIENT] ${primaryProvider} failed:`, error)

      // Find fallback provider
      const fallbackProvider = providers.find(p => p !== primaryProvider)
      if (fallbackProvider) {
        console.log(`[AI-CLIENT] Falling back to ${fallbackProvider}`)
        return await this.chatCompletion(options, {
          provider: fallbackProvider,
        })
      }

      throw error
    }
  }
}

// Export singleton instance
export const aiClient = new AIClient()

// Export model constants for UI
export { OPENROUTER_MODELS, OPENAI_MODELS, DEFAULT_MODELS }
