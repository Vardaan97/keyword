/**
 * Model pricing table for cost estimation.
 *
 * Prices in USD per 1,000,000 tokens, split by input/output.
 * Current as of 2026-04. Update when OpenRouter/OpenAI publish new rates.
 *
 * Source: https://openrouter.ai/models (Gemini/Claude) and https://openai.com/pricing (direct OpenAI).
 */

export interface ModelPrice {
  input: number   // USD per 1M input tokens
  output: number  // USD per 1M output tokens
}

export const MODEL_PRICING_USD_PER_1M: Record<string, ModelPrice> = {
  // Gemini models via OpenRouter
  'google/gemini-3.1-flash-lite-preview': { input: 0.075, output: 0.30 },
  'google/gemini-3-flash-preview':        { input: 0.30,  output: 2.50 },
  'google/gemini-2.5-flash':              { input: 0.075, output: 0.30 },
  'google/gemini-2.5-flash-lite':         { input: 0.075, output: 0.30 },
  'google/gemini-2.0-flash-001':          { input: 0.075, output: 0.30 },
  'google/gemini-pro-1.5':                { input: 1.25,  output: 5.00 },
  'google/gemini-flash-1.5-8b':           { input: 0.0375, output: 0.15 },
  // OpenAI models (direct or via OpenRouter)
  'openai/gpt-4o-mini':                   { input: 0.15,  output: 0.60 },
  'openai/gpt-4o':                        { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':                          { input: 0.15,  output: 0.60 },
  'gpt-4o':                               { input: 2.50,  output: 10.00 },
  // Claude models via OpenRouter
  'anthropic/claude-3.5-sonnet':          { input: 3.00,  output: 15.00 },
  'anthropic/claude-3-haiku':             { input: 0.25,  output: 1.25 },
  // Auto router fallback
  'openrouter/auto':                      { input: 0.30,  output: 2.50 },
}

// Track which unknown models we've warned about so we don't log twice per run.
const warnedModels = new Set<string>()

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING_USD_PER_1M[model]
  if (!pricing) {
    if (!warnedModels.has(model)) {
      warnedModels.add(model)
      console.warn(`[model-pricing] Unknown model '${model}' — returning $0 cost. Add to MODEL_PRICING_USD_PER_1M.`)
    }
    return 0
  }
  const inputCostUsd = (inputTokens / 1_000_000) * pricing.input
  const outputCostUsd = (outputTokens / 1_000_000) * pricing.output
  return inputCostUsd + outputCostUsd
}
