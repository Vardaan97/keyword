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

// OpenRouter models - organized by context window size
const OPENROUTER_MODELS = {
  // Large context models (for keyword analysis - need high output tokens)
  default: 'anthropic/claude-sonnet-4', // 200K context, excellent JSON output
  claude_sonnet: 'anthropic/claude-sonnet-4',
  gemini_pro: 'google/gemini-2.5-pro-preview-06-05', // 1M context
  gpt4o: 'openai/gpt-4o', // 128K context
  // Fast & cheap mini models (for smaller tasks)
  mini: 'google/gemini-2.0-flash-001',
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
  openrouter: OPENROUTER_MODELS.default, // Use Claude Sonnet 4 for high quality output
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
