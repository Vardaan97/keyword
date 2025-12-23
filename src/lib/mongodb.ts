/**
 * MongoDB Client for Keyword Planner
 * Used as an alternative/backup to Supabase
 */

import { MongoClient, Db, Collection, ObjectId } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI || ''
const DB_NAME = 'keyword_planner'

// Use global to persist connection across serverless function invocations
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

let client: MongoClient | null = null
let db: Db | null = null
let clientPromise: Promise<MongoClient> | null = null

// Check if MongoDB is configured
export function isMongoConfigured(): boolean {
  return !!MONGODB_URI
}

// Detect if using mongodb+srv:// (Atlas) vs mongodb://
const isAtlasConnection = MONGODB_URI.startsWith('mongodb+srv://')

// MongoDB connection options optimized for serverless (Vercel)
// Note: For mongodb+srv:// (Atlas), TLS is handled automatically by the driver
const mongoOptions = {
  // Connection pool settings for serverless
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 10000,
  // Timeout settings
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 15000,
  socketTimeoutMS: 60000,
  // Retry settings
  retryWrites: true,
  retryReads: true,
  // Only add explicit TLS for non-Atlas connections
  ...(isAtlasConnection ? {} : { tls: true }),
}

// Initialize MongoDB client with connection caching for serverless
function getMongoClientPromise(): Promise<MongoClient> | null {
  if (!MONGODB_URI) return null

  // In development, use a global variable to preserve the connection across HMR
  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      client = new MongoClient(MONGODB_URI, mongoOptions)
      global._mongoClientPromise = client.connect()
    }
    return global._mongoClientPromise
  }

  // In production, create a new promise if we don't have one
  if (!clientPromise) {
    client = new MongoClient(MONGODB_URI, mongoOptions)
    clientPromise = client.connect()
  }
  return clientPromise
}

async function getDb(): Promise<Db | null> {
  if (!MONGODB_URI) {
    return null
  }

  if (db) return db

  try {
    const promise = getMongoClientPromise()
    if (!promise) return null

    const mongoClient = await promise
    db = mongoClient.db(DB_NAME)
    console.log('[MONGODB] Connected successfully')
    return db
  } catch (error) {
    console.error('[MONGODB] Connection failed:', error)
    // Reset connection state on failure to allow retry
    client = null
    db = null
    clientPromise = null
    if (process.env.NODE_ENV === 'development') {
      global._mongoClientPromise = undefined
    }
    return null
  }
}

// Type for stored keyword data
export interface KeywordData {
  keyword: string
  avgMonthlySearches: number
  competition: string
  competitionIndex: number
  lowTopOfPageBidMicros?: number
  highTopOfPageBidMicros?: number
}

// Type for cache entries (legacy - seeds-based cache)
interface CacheEntry {
  _id?: ObjectId
  cacheKey: string
  keywords: KeywordData[]
  geoTarget: string
  source: string
  createdAt: Date
  expiresAt: Date
}

// Type for individual keyword volume cache (keyword-level caching)
export interface KeywordVolumeCache {
  _id?: ObjectId
  keyword: string  // Normalized lowercase keyword
  keywordOriginal: string  // Original casing
  avgMonthlySearches: number
  competition: string
  competitionIndex: number
  lowTopOfPageBidMicros?: number
  highTopOfPageBidMicros?: number
  source: 'google_ads' | 'keywords_everywhere'
  country: string  // geo target/country code
  fetchedAt: Date  // When the data was fetched
  expiresAt: Date  // When the data expires (default 7 days for volume data)
}

// Type for stored analysis
export interface StoredAnalysis {
  _id?: ObjectId
  courseId: string
  courseName: string
  courseUrl: string
  vendor?: string
  seedKeywords: { keyword: string; source: string }[]
  rawKeywords: KeywordData[]
  analyzedKeywords: {
    keyword: string
    avgMonthlySearches: number
    competition: string
    competitionIndex: number
    courseRelevance: number
    relevanceStatus: string
    conversionPotential: number
    searchIntent: number
    vendorSpecificity: number
    keywordSpecificity: number
    actionWordStrength: number
    commercialSignals: number
    negativeSignals: number
    koenigFit: number
    baseScore: number
    competitionBonus: number
    finalScore: number
    tier: string
    matchType: string
    action: string
    exclusionReason?: string
    priority?: string
  }[]
  dataSource: string
  geoTarget: string
  processingTimeMs: number
  createdAt: Date
  updatedAt: Date
}

// Cache functions
export async function getCachedKeywordsMongo(
  seedKeywords: string[],
  geoTarget: string,
  source: string
): Promise<KeywordData[] | null> {
  const database = await getDb()
  if (!database) return null

  try {
    const collection: Collection<CacheEntry> = database.collection('keyword_cache')
    const cacheKey = `${seedKeywords.sort().join(',')}_${geoTarget}_${source}`

    const cached = await collection.findOne({
      cacheKey,
      expiresAt: { $gt: new Date() }
    })

    if (cached) {
      console.log('[MONGODB] Cache hit for:', cacheKey.substring(0, 50) + '...')
      return cached.keywords
    }
    return null
  } catch (error) {
    console.error('[MONGODB] Cache fetch error:', error)
    return null
  }
}

export async function setCachedKeywordsMongo(
  seedKeywords: string[],
  geoTarget: string,
  source: string,
  keywords: KeywordData[],
  ttlHours = 48
): Promise<void> {
  const database = await getDb()
  if (!database) return

  try {
    const collection: Collection<CacheEntry> = database.collection('keyword_cache')
    const cacheKey = `${seedKeywords.sort().join(',')}_${geoTarget}_${source}`

    await collection.updateOne(
      { cacheKey },
      {
        $set: {
          cacheKey,
          keywords,
          geoTarget,
          source,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000)
        }
      },
      { upsert: true }
    )
    console.log('[MONGODB] Cached keywords for:', cacheKey.substring(0, 50) + '...')
  } catch (error) {
    console.error('[MONGODB] Cache set error:', error)
  }
}

// Analysis storage functions
export async function saveAnalysisMongo(analysis: Omit<StoredAnalysis, '_id'>): Promise<string | null> {
  const database = await getDb()
  if (!database) return null

  try {
    const collection: Collection<StoredAnalysis> = database.collection('analyses')

    // Check if analysis exists for this course
    const existing = await collection.findOne({ courseId: analysis.courseId })

    if (existing) {
      await collection.updateOne(
        { courseId: analysis.courseId },
        { $set: { ...analysis, updatedAt: new Date() } }
      )
      console.log('[MONGODB] Updated analysis for:', analysis.courseName)
      return existing._id?.toString() || null
    } else {
      const result = await collection.insertOne(analysis as StoredAnalysis)
      console.log('[MONGODB] Saved new analysis for:', analysis.courseName)
      return result.insertedId.toString()
    }
  } catch (error) {
    console.error('[MONGODB] Save analysis error:', error)
    return null
  }
}

export async function getRecentAnalysesMongo(limit = 50): Promise<StoredAnalysis[]> {
  const database = await getDb()
  if (!database) return []

  try {
    const collection: Collection<StoredAnalysis> = database.collection('analyses')
    const analyses = await collection
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()
    return analyses
  } catch (error) {
    console.error('[MONGODB] Get analyses error:', error)
    return []
  }
}

export async function getAnalysisMongo(courseId: string): Promise<StoredAnalysis | null> {
  const database = await getDb()
  if (!database) return null

  try {
    const collection: Collection<StoredAnalysis> = database.collection('analyses')
    return await collection.findOne({ courseId })
  } catch (error) {
    console.error('[MONGODB] Get analysis error:', error)
    return null
  }
}

// Cleanup old cache entries
export async function cleanupExpiredCacheMongo(): Promise<number> {
  const database = await getDb()
  if (!database) return 0

  try {
    const collection: Collection<CacheEntry> = database.collection('keyword_cache')
    const result = await collection.deleteMany({
      expiresAt: { $lt: new Date() }
    })
    console.log('[MONGODB] Cleaned up', result.deletedCount, 'expired cache entries')
    return result.deletedCount
  } catch (error) {
    console.error('[MONGODB] Cleanup error:', error)
    return 0
  }
}

// ============================================================================
// Individual Keyword Volume Cache Functions
// ============================================================================

/**
 * Get cached keyword volumes for multiple keywords
 * Returns keywords that exist in cache with valid expiry
 */
export async function getKeywordVolumesCached(
  keywords: string[],
  country: string,
  source: 'google_ads' | 'keywords_everywhere'
): Promise<{ cached: KeywordData[]; missing: string[] }> {
  const database = await getDb()
  if (!database) return { cached: [], missing: keywords }

  try {
    const collection: Collection<KeywordVolumeCache> = database.collection('keyword_volumes')
    const normalizedKeywords = keywords.map(k => k.toLowerCase().trim())

    // Find all cached keywords that haven't expired
    const cachedEntries = await collection.find({
      keyword: { $in: normalizedKeywords },
      country,
      source,
      expiresAt: { $gt: new Date() }
    }).toArray()

    // Map cached entries by normalized keyword
    const cachedMap = new Map<string, KeywordVolumeCache>()
    for (const entry of cachedEntries) {
      cachedMap.set(entry.keyword, entry)
    }

    // Separate cached and missing keywords
    const cached: KeywordData[] = []
    const missing: string[] = []

    for (let i = 0; i < keywords.length; i++) {
      const original = keywords[i]
      const normalized = normalizedKeywords[i]
      const cachedEntry = cachedMap.get(normalized)

      if (cachedEntry) {
        cached.push({
          keyword: cachedEntry.keywordOriginal,
          avgMonthlySearches: cachedEntry.avgMonthlySearches,
          competition: cachedEntry.competition,
          competitionIndex: cachedEntry.competitionIndex,
          lowTopOfPageBidMicros: cachedEntry.lowTopOfPageBidMicros,
          highTopOfPageBidMicros: cachedEntry.highTopOfPageBidMicros
        })
      } else {
        missing.push(original)
      }
    }

    if (cached.length > 0) {
      console.log(`[MONGODB] Volume cache hit: ${cached.length}/${keywords.length} keywords for ${country}/${source}`)
    }

    return { cached, missing }
  } catch (error) {
    console.error('[MONGODB] Volume cache fetch error:', error)
    return { cached: [], missing: keywords }
  }
}

/**
 * Save keyword volumes to cache
 * Stores individual keyword data with metadata for efficient lookups
 */
export async function setKeywordVolumesCached(
  keywords: KeywordData[],
  country: string,
  source: 'google_ads' | 'keywords_everywhere',
  ttlDays = 7
): Promise<number> {
  const database = await getDb()
  if (!database) return 0

  try {
    const collection: Collection<KeywordVolumeCache> = database.collection('keyword_volumes')
    const now = new Date()
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000)

    // Prepare bulk operations for upsert
    const operations = keywords.map(kw => ({
      updateOne: {
        filter: {
          keyword: kw.keyword.toLowerCase().trim(),
          country,
          source
        },
        update: {
          $set: {
            keyword: kw.keyword.toLowerCase().trim(),
            keywordOriginal: kw.keyword,
            avgMonthlySearches: kw.avgMonthlySearches,
            competition: kw.competition,
            competitionIndex: kw.competitionIndex,
            lowTopOfPageBidMicros: kw.lowTopOfPageBidMicros,
            highTopOfPageBidMicros: kw.highTopOfPageBidMicros,
            source,
            country,
            fetchedAt: now,
            expiresAt
          }
        },
        upsert: true
      }
    }))

    if (operations.length > 0) {
      const result = await collection.bulkWrite(operations)
      const savedCount = result.upsertedCount + result.modifiedCount
      console.log(`[MONGODB] Volume cache saved: ${savedCount} keywords for ${country}/${source} (TTL: ${ttlDays} days)`)
      return savedCount
    }

    return 0
  } catch (error) {
    console.error('[MONGODB] Volume cache save error:', error)
    return 0
  }
}

/**
 * Get keyword volume cache stats
 */
export async function getKeywordVolumeCacheStats(): Promise<{
  totalKeywords: number
  bySource: Record<string, number>
  byCountry: Record<string, number>
  expiredCount: number
}> {
  const database = await getDb()
  if (!database) return { totalKeywords: 0, bySource: {}, byCountry: {}, expiredCount: 0 }

  try {
    const collection: Collection<KeywordVolumeCache> = database.collection('keyword_volumes')
    const now = new Date()

    // Aggregate stats
    const [totalResult, sourceStats, countryStats, expiredResult] = await Promise.all([
      collection.countDocuments({}),
      collection.aggregate([
        { $group: { _id: '$source', count: { $sum: 1 } } }
      ]).toArray(),
      collection.aggregate([
        { $group: { _id: '$country', count: { $sum: 1 } } }
      ]).toArray(),
      collection.countDocuments({ expiresAt: { $lt: now } })
    ])

    const bySource: Record<string, number> = {}
    for (const s of sourceStats) {
      bySource[s._id as string] = s.count
    }

    const byCountry: Record<string, number> = {}
    for (const c of countryStats) {
      byCountry[c._id as string] = c.count
    }

    return {
      totalKeywords: totalResult,
      bySource,
      byCountry,
      expiredCount: expiredResult
    }
  } catch (error) {
    console.error('[MONGODB] Volume cache stats error:', error)
    return { totalKeywords: 0, bySource: {}, byCountry: {}, expiredCount: 0 }
  }
}

/**
 * Cleanup expired keyword volume cache entries
 */
export async function cleanupExpiredKeywordVolumes(): Promise<number> {
  const database = await getDb()
  if (!database) return 0

  try {
    const collection: Collection<KeywordVolumeCache> = database.collection('keyword_volumes')
    const result = await collection.deleteMany({
      expiresAt: { $lt: new Date() }
    })
    console.log('[MONGODB] Cleaned up', result.deletedCount, 'expired keyword volume entries')
    return result.deletedCount
  } catch (error) {
    console.error('[MONGODB] Volume cleanup error:', error)
    return 0
  }
}
