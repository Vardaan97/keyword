/**
 * MongoDB Client for Keyword Planner
 * Used as an alternative/backup to Supabase
 */

import { MongoClient, Db, Collection, ObjectId } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI || ''
const DB_NAME = 'keyword_planner'

let client: MongoClient | null = null
let db: Db | null = null

// Check if MongoDB is configured
export function isMongoConfigured(): boolean {
  return !!MONGODB_URI
}

async function getDb(): Promise<Db | null> {
  if (!MONGODB_URI) {
    return null
  }

  if (db) return db

  try {
    client = new MongoClient(MONGODB_URI)
    await client.connect()
    db = client.db(DB_NAME)
    console.log('[MONGODB] Connected successfully')
    return db
  } catch (error) {
    console.error('[MONGODB] Connection failed:', error)
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

// Type for cache entries
interface CacheEntry {
  _id?: ObjectId
  cacheKey: string
  keywords: KeywordData[]
  geoTarget: string
  source: string
  createdAt: Date
  expiresAt: Date
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
