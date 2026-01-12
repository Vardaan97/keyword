/**
 * Runtime Token Storage for Google Ads OAuth
 *
 * This module provides a way to store and retrieve OAuth tokens at runtime
 * without requiring a server restart. Tokens are stored in a JSON file.
 *
 * Priority order for refresh token:
 * 1. Runtime token file (can be updated without restart)
 * 2. Environment variable (.env.local)
 */

import { promises as fs } from 'fs'
import path from 'path'

// Token storage file path - stored in project root
const TOKEN_FILE_PATH = path.join(process.cwd(), '.google-ads-tokens.json')

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
 * Prioritizes runtime storage over environment variable
 */
export async function getRefreshToken(): Promise<string> {
  // Try runtime storage first
  const storedTokens = await getStoredTokens()
  if (storedTokens?.refreshToken) {
    console.log('[TOKEN-STORAGE] Using refresh token from runtime storage')
    return storedTokens.refreshToken
  }

  // Fall back to environment variable
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
 * Save tokens to runtime storage
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

  try {
    await fs.writeFile(TOKEN_FILE_PATH, JSON.stringify(storedTokens, null, 2), 'utf-8')
    tokenCache = storedTokens
    console.log('[TOKEN-STORAGE] Tokens saved successfully')
  } catch (error) {
    console.error('[TOKEN-STORAGE] Failed to save tokens:', error)
    throw new Error('Failed to save OAuth tokens')
  }
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
  try {
    await fs.unlink(TOKEN_FILE_PATH)
    tokenCache = null
    console.log('[TOKEN-STORAGE] Tokens cleared')
  } catch (error) {
    // File might not exist, that's OK
    tokenCache = null
  }
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
