/**
 * Runtime Token Storage for Google Ads OAuth
 *
 * This module provides a way to store and retrieve OAuth tokens at runtime
 * without requiring a server restart.
 *
 * Priority order for refresh token:
 * 1. In-memory cache (fastest, same serverless instance)
 * 2. Supabase (persistent across Vercel serverless instances)
 * 3. Runtime file (local dev only — ephemeral on Vercel)
 * 4. Environment variable (fallback)
 */

import { promises as fs } from 'fs'
import path from 'path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Re-export TokenExpiredError from the standalone errors module
// (kept separate so it can be imported in client bundles without pulling in 'fs')
export { TokenExpiredError } from './errors'

// Token storage file path - stored in project root
const TOKEN_FILE_PATH = path.join(process.cwd(), '.google-ads-tokens.json')

// Supabase key for storing the OAuth token (uses keyword_cache table)
const SUPABASE_TOKEN_KEY = '__system__oauth_refresh_token'

/**
 * Get a Supabase client with service role key (bypasses RLS)
 * Returns null if Supabase is not configured
 */
function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

/**
 * Save refresh token to Supabase for persistence across serverless instances
 */
async function saveTokenToSupabase(refreshToken: string, userEmail?: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return

  try {
    const { error } = await supabase
      .from('keyword_cache')
      .upsert({
        cache_key: SUPABASE_TOKEN_KEY,
        keywords: [{ refreshToken, updatedBy: userEmail || 'unknown', updatedAt: new Date().toISOString() }],
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'cache_key' })

    if (error) {
      console.error('[TOKEN-STORAGE] Supabase save error:', error.message)
    } else {
      console.log('[TOKEN-STORAGE] Refresh token saved to Supabase')
    }
  } catch (err) {
    console.error('[TOKEN-STORAGE] Supabase save failed:', err)
  }
}

/**
 * Retrieve refresh token from Supabase
 */
async function getTokenFromSupabase(): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return null

  try {
    const { data, error } = await supabase
      .from('keyword_cache')
      .select('keywords')
      .eq('cache_key', SUPABASE_TOKEN_KEY)
      .single()

    if (error || !data?.keywords?.[0]?.refreshToken) return null

    console.log('[TOKEN-STORAGE] Using refresh token from Supabase')
    return data.keywords[0].refreshToken
  } catch {
    return null
  }
}

/**
 * Clear refresh token from Supabase
 */
async function clearTokenFromSupabase(): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return

  try {
    await supabase
      .from('keyword_cache')
      .delete()
      .eq('cache_key', SUPABASE_TOKEN_KEY)
    console.log('[TOKEN-STORAGE] Cleared token from Supabase')
  } catch {
    // Ignore
  }
}

interface StoredTokens {
  refreshToken: string
  accessToken?: string
  accessTokenExpiresAt?: number
  updatedAt: string
  updatedBy?: string  // Email of user who authorized
  lastVerified?: string  // Last successful API call timestamp
}

// In-memory cache for tokens
let tokenCache: StoredTokens | null = null

/**
 * Get the current refresh token
 * Priority: in-memory → file → Supabase → env var
 */
export async function getRefreshToken(): Promise<string> {
  // 1. Try runtime file storage (fast, works locally)
  const storedTokens = await getStoredTokens()
  if (storedTokens?.refreshToken) {
    console.log('[TOKEN-STORAGE] Using refresh token from runtime storage')
    return storedTokens.refreshToken
  }

  // 2. Try Supabase (persistent across Vercel serverless instances)
  const supabaseToken = await getTokenFromSupabase()
  if (supabaseToken) {
    // Also cache in memory for subsequent calls in this instance
    tokenCache = { refreshToken: supabaseToken, updatedAt: new Date().toISOString() }
    return supabaseToken
  }

  // 3. Fall back to environment variable
  const envToken = process.env.GOOGLE_ADS_REFRESH_TOKEN
  if (envToken) {
    console.log('[TOKEN-STORAGE] Using refresh token from environment variable')
    return envToken
  }

  throw new Error('No refresh token available. Please authorize at /settings/google-ads')
}

/**
 * Get cached access token if still valid
 */
export async function getCachedAccessToken(): Promise<string | null> {
  const storedTokens = await getStoredTokens()
  if (
    storedTokens?.accessToken &&
    storedTokens.accessTokenExpiresAt &&
    storedTokens.accessTokenExpiresAt > Date.now() + 5 * 60 * 1000 // 5 min buffer
  ) {
    return storedTokens.accessToken
  }
  return null
}

/**
 * Save tokens to runtime storage + Supabase (for Vercel persistence)
 */
export async function saveTokens(tokens: {
  refreshToken: string
  accessToken?: string
  expiresIn?: number
  userEmail?: string
}): Promise<void> {
  const storedTokens: StoredTokens = {
    refreshToken: tokens.refreshToken,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.expiresIn
      ? Date.now() + tokens.expiresIn * 1000
      : undefined,
    updatedAt: new Date().toISOString(),
    updatedBy: tokens.userEmail
  }

  // Always update in-memory cache
  tokenCache = storedTokens

  // Also update process.env so other functions in this instance see it immediately
  process.env.GOOGLE_ADS_REFRESH_TOKEN = tokens.refreshToken

  // Save to file (works locally, may fail on Vercel — that's OK)
  try {
    await fs.writeFile(TOKEN_FILE_PATH, JSON.stringify(storedTokens, null, 2), 'utf-8')
    console.log('[TOKEN-STORAGE] Tokens saved to file')
  } catch (error) {
    console.log('[TOKEN-STORAGE] File save skipped (read-only filesystem, expected on Vercel)')
  }

  // Save to Supabase (persists across Vercel serverless instances)
  await saveTokenToSupabase(tokens.refreshToken, tokens.userEmail)

  console.log('[TOKEN-STORAGE] Tokens saved successfully')
}

/**
 * Update just the access token (called during token refresh)
 */
export async function updateAccessToken(accessToken: string, expiresIn: number): Promise<void> {
  const existing = await getStoredTokens()
  if (!existing) {
    // No stored tokens, just cache in memory
    tokenCache = {
      refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN || '',
      accessToken,
      accessTokenExpiresAt: Date.now() + expiresIn * 1000,
      updatedAt: new Date().toISOString()
    }
    return
  }

  existing.accessToken = accessToken
  existing.accessTokenExpiresAt = Date.now() + expiresIn * 1000

  try {
    await fs.writeFile(TOKEN_FILE_PATH, JSON.stringify(existing, null, 2), 'utf-8')
    tokenCache = existing
  } catch (error) {
    console.error('[TOKEN-STORAGE] Failed to update access token:', error)
    // Don't throw - access token is cached in memory anyway
  }
}

/**
 * Clear stored tokens (for logout/revoke)
 */
export async function clearTokens(): Promise<void> {
  tokenCache = null

  // Clear file
  try {
    await fs.unlink(TOKEN_FILE_PATH)
  } catch {
    // File might not exist, that's OK
  }

  // Clear from Supabase
  await clearTokenFromSupabase()

  console.log('[TOKEN-STORAGE] Tokens cleared')
}

/**
 * Check if we have a valid refresh token
 */
export async function hasValidRefreshToken(): Promise<boolean> {
  try {
    await getRefreshToken()
    return true
  } catch {
    return false
  }
}

/**
 * Mark the token as verified (called after successful API call)
 */
export async function markTokenVerified(): Promise<void> {
  const existing = await getStoredTokens()
  if (existing) {
    existing.lastVerified = new Date().toISOString()
    try {
      await fs.writeFile(TOKEN_FILE_PATH, JSON.stringify(existing, null, 2), 'utf-8')
      tokenCache = existing
    } catch (error) {
      console.error('[TOKEN-STORAGE] Failed to update lastVerified:', error)
    }
  }
}

/**
 * Get the last verification timestamp
 */
export async function getLastVerified(): Promise<string | null> {
  const storedTokens = await getStoredTokens()
  return storedTokens?.lastVerified || null
}

/**
 * Get token status for UI display
 */
export async function getTokenStatus(): Promise<{
  hasToken: boolean
  source: 'runtime' | 'env' | 'none'
  updatedAt?: string
  updatedBy?: string
}> {
  const storedTokens = await getStoredTokens()

  if (storedTokens?.refreshToken) {
    return {
      hasToken: true,
      source: 'runtime',
      updatedAt: storedTokens.updatedAt,
      updatedBy: storedTokens.updatedBy
    }
  }

  // Check Supabase
  const supabaseToken = await getTokenFromSupabase()
  if (supabaseToken) {
    return {
      hasToken: true,
      source: 'runtime'
    }
  }

  if (process.env.GOOGLE_ADS_REFRESH_TOKEN) {
    return {
      hasToken: true,
      source: 'env'
    }
  }

  return {
    hasToken: false,
    source: 'none'
  }
}

/**
 * Read stored tokens from file
 */
async function getStoredTokens(): Promise<StoredTokens | null> {
  // Return cached if available
  if (tokenCache) {
    return tokenCache
  }

  try {
    const content = await fs.readFile(TOKEN_FILE_PATH, 'utf-8')
    tokenCache = JSON.parse(content)
    return tokenCache
  } catch (error) {
    // File doesn't exist or is invalid
    return null
  }
}

/**
 * Update the GOOGLE_ADS_REFRESH_TOKEN in .env.local so it persists across restarts.
 * Creates the file if it doesn't exist, updates the line if it does.
 */
export async function updateEnvFile(refreshToken: string): Promise<void> {
  const envPath = path.join(process.cwd(), '.env.local')
  const key = 'GOOGLE_ADS_REFRESH_TOKEN'

  try {
    let content = ''
    try {
      content = await fs.readFile(envPath, 'utf-8')
    } catch {
      // File doesn't exist yet, start fresh
    }

    const regex = new RegExp(`^${key}=.*$`, 'm')
    const newLine = `${key}=${refreshToken}`

    if (regex.test(content)) {
      content = content.replace(regex, newLine)
    } else {
      content = content.trimEnd() + (content ? '\n' : '') + newLine + '\n'
    }

    await fs.writeFile(envPath, content, 'utf-8')
    console.log('[TOKEN-STORAGE] Updated .env.local with new refresh token')
  } catch (error) {
    console.error('[TOKEN-STORAGE] Failed to update .env.local:', error)
    // Non-fatal - runtime storage still works
  }
}
