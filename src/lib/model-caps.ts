/**
 * Model output-token caps, shared between route handlers and ai-client.
 * These reflect each model's published max_tokens (completion/output) limit.
 * Exceeding these values causes OpenRouter to return HTTP 400 or silently
 * clamp (provider-dependent) — we clamp proactively to keep behavior predictable.
 */

export const MODEL_OUTPUT_CAPS: Record<string, number> = {
  // Google — newest first
  'google/gemini-3.1-flash-lite-preview': 65536,   // default for analysis (Apr 2026)
  'google/gemini-3.1-pro-preview': 65536,
  'google/gemini-3-flash-preview': 65536,
  'google/gemini-2.5-flash': 65536,
  'google/gemini-2.5-flash-lite': 65535,
  'google/gemini-2.5-flash-lite-preview': 65535,
  'google/gemini-2.0-flash-001': 8192,             // legacy
  'google/gemini-flash-1.5-8b': 8192,
  'google/gemini-pro-1.5': 8192,
  // OpenAI (via OpenRouter and direct)
  'openai/gpt-4o-mini': 16384,
  'openai/gpt-4o': 16384,
  'gpt-4o-mini': 16384,
  'gpt-4o': 16384,
  // Anthropic (via OpenRouter)
  'anthropic/claude-3.5-sonnet': 8192,
  'anthropic/claude-3-haiku': 4096,
}

const DEFAULT_CAP = 8000

/**
 * Clamp a requested max_tokens value against the model's known output cap.
 * Unknown models get a conservative DEFAULT_CAP.
 */
export function clampMaxTokens(model: string, requested: number): number {
  const cap = MODEL_OUTPUT_CAPS[model] ?? DEFAULT_CAP
  return Math.min(Math.max(1, requested), cap)
}

/** Heuristic: ~220 output tokens per analyzed-keyword JSON object, plus overhead. */
export const TOKENS_PER_KEYWORD = 220
export const PER_REQUEST_OVERHEAD_TOKENS = 500
