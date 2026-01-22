/**
 * LinkedIn Token Storage - Convex-backed
 *
 * This module stores LinkedIn OAuth tokens in Convex database,
 * allowing both localhost and Vercel deployments to share the same tokens.
 *
 * Priority order for access token:
 * 1. Convex database (shared between localhost and production)
 * 2. Local file fallback (for offline development)
 * 3. Environment variable (.env.local)
 */

import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import { promises as fs } from 'fs'
import * as path from 'path'

// Token storage file path - used as fallback when Convex is unavailable
const TOKEN_FILE_PATH = path.join(process.cwd(), '.linkedin-tokens.json')

// Default token ID for the primary LinkedIn account
const DEFAULT_TOKEN_ID = 'primary'

// Convex client (lazy initialized)
let convexClient: ConvexHttpClient | null = null

function getConvexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) {
    return null
  }
  if (!convexClient) {
    convexClient = new ConvexHttpClient(url)
  }
  return convexClient
}

interface StoredLinkedInTokens {
  accessToken: string
  refreshToken?: string
  accessTokenExpiresAt?: number  // Epoch timestamp
  refreshTokenExpiresAt?: number // Epoch timestamp
  updatedAt: string
  updatedBy?: string  // Email/name of user who authorized
  lastVerified?: string  // Last successful API call timestamp
  scopes?: string[]  // Granted scopes
}

// In-memory cache for tokens (refreshed from Convex)
let tokenCache: StoredLinkedInTokens | null = null
let tokenCacheTime: number | null = null
const CACHE_TTL_MS = 30000 // 30 seconds cache

/**
 * Get the current access token
 * Prioritizes Convex storage, then local file, then environment variable
 */
export async function getLinkedInAccessToken(): Promise<string> {
  // Try Convex first (shared storage)
  const convexToken = await getConvexToken()
  if (convexToken) {
    // Check if token is expired
    if (convexToken.accessTokenExpiresAt && convexToken.accessTokenExpiresAt < Date.now()) {
      console.log('[LINKEDIN-TOKEN] Access token expired, attempting refresh...')
      if (convexToken.refreshToken) {
        try {
          const newTokens = await refreshAccessToken(convexToken.refreshToken)
          return newTokens.accessToken
        } catch (error) {
          console.error('[LINKEDIN-TOKEN] Failed to refresh token:', error)
          throw new Error('LinkedIn access token expired. Please re-authorize at /api/auth/linkedin')
        }
      }
      throw new Error('LinkedIn access token expired. Please re-authorize at /api/auth/linkedin')
    }
    console.log('[LINKEDIN-TOKEN] Using access token from Convex')
    return convexToken.accessToken
  }

  // Try local file fallback
  const localToken = await getLocalToken()
  if (localToken?.accessToken) {
    if (localToken.accessTokenExpiresAt && localToken.accessTokenExpiresAt < Date.now()) {
      console.log('[LINKEDIN-TOKEN] Local access token expired')
      if (localToken.refreshToken) {
        try {
          const newTokens = await refreshAccessToken(localToken.refreshToken)
          return newTokens.accessToken
        } catch (error) {
          console.error('[LINKEDIN-TOKEN] Failed to refresh local token:', error)
        }
      }
    } else {
      console.log('[LINKEDIN-TOKEN] Using access token from local file')
      return localToken.accessToken
    }
  }

  // Fall back to environment variable
  const envToken = process.env.LINKEDIN_ACCESS_TOKEN
  if (envToken) {
    console.log('[LINKEDIN-TOKEN] Using access token from environment variable')
    return envToken
  }

  throw new Error('No LinkedIn access token available. Please authorize at /api/auth/linkedin')
}

/**
 * Get token from Convex with caching
 */
async function getConvexToken(): Promise<StoredLinkedInTokens | null> {
  const client = getConvexClient()
  if (!client) {
    return null
  }

  // Check cache
  if (tokenCache && tokenCacheTime && Date.now() - tokenCacheTime < CACHE_TTL_MS) {
    return tokenCache
  }

  try {
    const result = await client.query(api.linkedinTokens.getToken, { tokenId: DEFAULT_TOKEN_ID })
    if (result) {
      tokenCache = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        accessTokenExpiresAt: result.expiresAt,
        refreshTokenExpiresAt: result.refreshTokenExpiresAt,
        updatedAt: new Date(result.updatedAt).toISOString(),
        updatedBy: result.userEmail || result.userName,
        scopes: result.scopes,
      }
      tokenCacheTime = Date.now()
      return tokenCache
    }
    return null
  } catch (error) {
    console.error('[LINKEDIN-TOKEN] Error fetching from Convex:', error)
    return null
  }
}

/**
 * Get token from local file (fallback)
 */
async function getLocalToken(): Promise<StoredLinkedInTokens | null> {
  try {
    const content = await fs.readFile(TOKEN_FILE_PATH, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

/**
 * Refresh the access token using refresh token
 */
async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('LinkedIn client credentials not configured')
  }

  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Failed to refresh token: ${error.error_description || error.error}`)
  }

  const data = await response.json()

  // Update stored tokens in both Convex and local
  await updateAccessToken(data.access_token, data.expires_in)

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  }
}

/**
 * Save tokens to storage (Convex primary, local fallback)
 */
export async function saveLinkedInTokens(tokens: {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  refreshTokenExpiresIn?: number
  userEmail?: string
  scopes?: string[]
}): Promise<void> {
  const client = getConvexClient()

  // Try to save to Convex first
  if (client) {
    try {
      await client.mutation(api.linkedinTokens.saveToken, {
        tokenId: DEFAULT_TOKEN_ID,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn || 5184000, // 60 days default
        refreshTokenExpiresIn: tokens.refreshTokenExpiresIn,
        scopes: tokens.scopes,
        userEmail: tokens.userEmail,
      })
      console.log('[LINKEDIN-TOKEN] Tokens saved to Convex successfully')

      // Clear cache to force refresh on next read
      tokenCache = null
      tokenCacheTime = null
    } catch (error) {
      console.error('[LINKEDIN-TOKEN] Failed to save to Convex:', error)
    }
  }

  // Also save to local file as fallback
  const storedTokens: StoredLinkedInTokens = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessTokenExpiresAt: tokens.expiresIn
      ? Date.now() + tokens.expiresIn * 1000
      : undefined,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresIn
      ? Date.now() + tokens.refreshTokenExpiresIn * 1000
      : undefined,
    updatedAt: new Date().toISOString(),
    updatedBy: tokens.userEmail,
    scopes: tokens.scopes,
  }

  try {
    await fs.writeFile(TOKEN_FILE_PATH, JSON.stringify(storedTokens, null, 2), 'utf-8')
    console.log('[LINKEDIN-TOKEN] Tokens saved to local file')
  } catch (error) {
    console.error('[LINKEDIN-TOKEN] Failed to save to local file:', error)
  }
}

/**
 * Update just the access token (called during token refresh)
 */
export async function updateAccessToken(accessToken: string, expiresIn: number): Promise<void> {
  const client = getConvexClient()

  // Update Convex
  if (client) {
    try {
      await client.mutation(api.linkedinTokens.updateTokenAfterRefresh, {
        tokenId: DEFAULT_TOKEN_ID,
        accessToken,
        expiresIn,
      })
      console.log('[LINKEDIN-TOKEN] Access token updated in Convex')

      // Clear cache
      tokenCache = null
      tokenCacheTime = null
    } catch (error) {
      console.error('[LINKEDIN-TOKEN] Failed to update Convex:', error)
    }
  }

  // Update local file
  const existing = await getLocalToken()
  const updated: StoredLinkedInTokens = existing ? {
    ...existing,
    accessToken,
    accessTokenExpiresAt: Date.now() + expiresIn * 1000,
    updatedAt: new Date().toISOString(),
  } : {
    accessToken,
    accessTokenExpiresAt: Date.now() + expiresIn * 1000,
    updatedAt: new Date().toISOString(),
  }

  try {
    await fs.writeFile(TOKEN_FILE_PATH, JSON.stringify(updated, null, 2), 'utf-8')
  } catch (error) {
    console.error('[LINKEDIN-TOKEN] Failed to update local file:', error)
  }
}

/**
 * Clear stored tokens (for logout/revoke)
 */
export async function clearLinkedInTokens(): Promise<void> {
  const client = getConvexClient()

  // Clear from Convex
  if (client) {
    try {
      await client.mutation(api.linkedinTokens.deleteToken, { tokenId: DEFAULT_TOKEN_ID })
      console.log('[LINKEDIN-TOKEN] Tokens cleared from Convex')
    } catch (error) {
      console.error('[LINKEDIN-TOKEN] Failed to clear Convex:', error)
    }
  }

  // Clear local file
  try {
    await fs.unlink(TOKEN_FILE_PATH)
    console.log('[LINKEDIN-TOKEN] Local token file deleted')
  } catch {
    // File might not exist
  }

  // Clear cache
  tokenCache = null
  tokenCacheTime = null
}

/**
 * Check if we have a valid access token
 */
export async function hasValidLinkedInToken(): Promise<boolean> {
  try {
    await getLinkedInAccessToken()
    return true
  } catch {
    return false
  }
}

/**
 * Mark the token as verified (called after successful API call)
 * Note: This now only updates local file as Convex doesn't track lastVerified
 */
export async function markLinkedInTokenVerified(): Promise<void> {
  const existing = await getLocalToken()
  if (existing) {
    existing.lastVerified = new Date().toISOString()
    try {
      await fs.writeFile(TOKEN_FILE_PATH, JSON.stringify(existing, null, 2), 'utf-8')
    } catch (error) {
      console.error('[LINKEDIN-TOKEN] Failed to update lastVerified:', error)
    }
  }
}

/**
 * Get token status for UI display
 */
export async function getLinkedInTokenStatus(): Promise<{
  hasToken: boolean
  source: 'convex' | 'local' | 'env' | 'none'
  updatedAt?: string
  updatedBy?: string
  expiresAt?: string
  scopes?: string[]
  lastVerified?: string
  isExpired?: boolean
}> {
  // Check Convex first
  const convexToken = await getConvexToken()
  if (convexToken?.accessToken) {
    const isExpired = convexToken.accessTokenExpiresAt
      ? convexToken.accessTokenExpiresAt < Date.now()
      : false

    return {
      hasToken: true,
      source: 'convex',
      updatedAt: convexToken.updatedAt,
      updatedBy: convexToken.updatedBy,
      expiresAt: convexToken.accessTokenExpiresAt
        ? new Date(convexToken.accessTokenExpiresAt).toISOString()
        : undefined,
      scopes: convexToken.scopes,
      isExpired,
    }
  }

  // Check local file
  const localToken = await getLocalToken()
  if (localToken?.accessToken) {
    const isExpired = localToken.accessTokenExpiresAt
      ? localToken.accessTokenExpiresAt < Date.now()
      : false

    return {
      hasToken: true,
      source: 'local',
      updatedAt: localToken.updatedAt,
      updatedBy: localToken.updatedBy,
      expiresAt: localToken.accessTokenExpiresAt
        ? new Date(localToken.accessTokenExpiresAt).toISOString()
        : undefined,
      scopes: localToken.scopes,
      lastVerified: localToken.lastVerified,
      isExpired,
    }
  }

  // Check env
  if (process.env.LINKEDIN_ACCESS_TOKEN) {
    return {
      hasToken: true,
      source: 'env',
    }
  }

  return {
    hasToken: false,
    source: 'none',
  }
}

/**
 * Clear the in-memory token cache (useful after re-authorization)
 */
export function clearTokenCache(): void {
  tokenCache = null
  tokenCacheTime = null
  console.log('[LINKEDIN-TOKEN] In-memory cache cleared')
}
