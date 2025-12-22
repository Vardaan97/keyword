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
}

export interface ChatCompletionResult {
  content: string
  tokensUsed?: number
  provider: AIProvider
  model: string
}

// OpenRouter models (mini/efficient models for cost-effectiveness)
const OPENROUTER_MODELS = {
  // Fast & cheap mini models
  mini: 'google/gemini-2.0-flash-001',
  // Alternative mini models
  claude_haiku: 'anthropic/claude-3-haiku',
  gpt4o_mini: 'openai/gpt-4o-mini',
  gemini_flash: 'google/gemini-2.0-flash-001',
} as const

// OpenAI models
const OPENAI_MODELS = {
  default: 'gpt-4o',
  mini: 'gpt-4o-mini',
} as const

// Default model selection based on provider
const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: OPENAI_MODELS.default,
  openrouter: OPENROUTER_MODELS.mini, // Use Gemini Flash as default for OpenRouter
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
    const model = config?.model || DEFAULT_MODELS[provider]
    const client = this.getClient(provider)

    console.log(`[AI-CLIENT] Using ${provider} with model: ${model}`)

    const completion = await client.chat.completions.create({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1000,
      ...(options.jsonMode && { response_format: { type: 'json_object' } }),
    })

    const content = completion.choices[0]?.message?.content || ''
    const tokensUsed = completion.usage?.total_tokens

    console.log(`[AI-CLIENT] Response received. Tokens: ${tokensUsed}`)

    return {
      content,
      tokensUsed,
      provider,
      model,
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
    const primaryProvider = config?.provider || this.defaultProvider
    const providers = this.getAvailableProviders()

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
