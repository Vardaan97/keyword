/**
 * Unified AI Client for OpenAI and OpenRouter
 * Supports seamless switching between providers with fallback
 */

import OpenAI from 'openai'

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
}

export interface ChatCompletionResult {
  content: string
  tokensUsed?: number
  provider: AIProvider
  model: string
}

// OpenRouter models - verified working models (Dec 2025)
const OPENROUTER_MODELS = {
  // Default: GPT-4o Mini - fast, cheap, reliable
  default: 'openai/gpt-4o-mini',
  // OpenAI models (best for JSON output)
  gpt4o: 'openai/gpt-4o', // 128K context
  gpt4o_mini: 'openai/gpt-4o-mini', // 128K context, cost-effective
  // Gemini models - FASTEST options with huge context (Dec 2025)
  gemini_3_flash: 'google/gemini-3-flash-preview', // NEW: Fastest, 1M context, outperforms 2.5 Pro
  gemini_25_flash: 'google/gemini-2.5-flash', // Fast, 1M context, advanced reasoning
  gemini_25_flash_lite: 'google/gemini-2.5-flash-lite', // Ultra-low latency, cheapest
  gemini_flash: 'google/gemini-2.0-flash-001', // Legacy, still fast
  gemini_pro: 'google/gemini-pro-1.5', // 2M context
  // Claude models
  claude_sonnet: 'anthropic/claude-3.5-sonnet', // 200K context
  claude_haiku: 'anthropic/claude-3-haiku', // Fast, cheap, 200K context
  // Auto router - let OpenRouter pick the best model
  auto: 'openrouter/auto',
} as const

// Fast models for analysis (ordered by reliability for JSON output)
// Using Gemini 2.0 Flash - stable, fast, good for structured output
export const FAST_ANALYSIS_MODELS = {
  openrouter: 'google/gemini-2.0-flash-001',  // Stable, fast, 1M context
  openai: 'gpt-4o-mini',  // Most reliable for JSON, 128K context
} as const

// Alternative fast models (for manual selection)
export const ALTERNATIVE_MODELS = {
  gemini_3_flash: 'google/gemini-3-flash-preview',  // Fastest, but newer/less stable
  gemini_25_flash: 'google/gemini-2.5-flash',  // Advanced reasoning
  gpt4o_mini: 'openai/gpt-4o-mini',  // Most reliable JSON
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

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1000,
        ...(options.jsonMode && supportsJsonMode && { response_format: { type: 'json_object' } }),
      })

      const content = completion.choices[0]?.message?.content || ''
      const tokensUsed = completion.usage?.total_tokens

      console.log(`[AI-CLIENT] Response received. Tokens: ${tokensUsed}`)

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
        provider,
        model,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[AI-CLIENT] ${provider} error:`, errorMessage)
      throw error
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
