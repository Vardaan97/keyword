import { MongoClient, Db, Collection, ObjectId } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME = 'keyword_planner'

// Connection cache
let cachedClient: MongoClient | null = null
let cachedDb: Db | null = null

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb }
  }

  const client = await MongoClient.connect(MONGODB_URI)
  const db = client.db(DB_NAME)

  cachedClient = client
  cachedDb = db

  console.log('[MONGODB] Connected to database:', DB_NAME)
  return { client, db }
}

// Types for stored data
export interface StoredKeywordCache {
  _id?: ObjectId
  cacheKey: string // Hash of seeds + geoTarget + source
  seedKeywords: string[]
  geoTarget: string
  source: string
  keywords: KeywordData[]
  createdAt: Date
  expiresAt: Date // 48 hours from creation
}

export interface KeywordData {
  keyword: string
  avgMonthlySearches: number
  competition: string
  competitionIndex: number
  lowTopOfPageBidMicros?: number
  highTopOfPageBidMicros?: number
}

export interface StoredAnalysis {
  _id?: ObjectId
  courseId: string
  courseName: string
  courseUrl: string
  vendor?: string
  seedKeywords: SeedKeywordData[]
  rawKeywords: KeywordData[]
  analyzedKeywords: AnalyzedKeywordData[]
  dataSource: string
  geoTarget: string
  processingTimeMs: number
  createdAt: Date
  updatedAt: Date
}

export interface SeedKeywordData {
  keyword: string
  source: string
}

export interface AnalyzedKeywordData {
  keyword: string
  avgMonthlySearches: number
  competition: string
  competitionIndex: number
  lowTopOfPageBidMicros?: number
  highTopOfPageBidMicros?: number
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
  selected?: boolean // User selection state
}

export interface StoredSession {
  _id?: ObjectId
  sessionId: string
  analyses: string[] // Array of analysis IDs
  createdAt: Date
  updatedAt: Date
}

// Helper functions
export function generateCacheKey(seeds: string[], geoTarget: string, source: string): string {
  const sortedSeeds = [...seeds].sort().join('|')
  return `${sortedSeeds}__${geoTarget}__${source}`
}

// Cache expiry: 48 hours
const CACHE_DURATION_MS = 48 * 60 * 60 * 1000

export async function getCachedKeywords(
  seeds: string[],
  geoTarget: string,
  source: string
): Promise<KeywordData[] | null> {
  try {
    const { db } = await connectToDatabase()
    const collection = db.collection<StoredKeywordCache>('keyword_cache')

    const cacheKey = generateCacheKey(seeds, geoTarget, source)
    const cached = await collection.findOne({
      cacheKey,
      expiresAt: { $gt: new Date() }
    })

    if (cached) {
      console.log('[CACHE] Hit for', seeds.length, 'seeds,', geoTarget, source)
      return cached.keywords
    }

    console.log('[CACHE] Miss for', seeds.length, 'seeds,', geoTarget, source)
    return null
  } catch (error) {
    console.error('[CACHE] Error getting cached keywords:', error)
    return null
  }
}

export async function setCachedKeywords(
  seeds: string[],
  geoTarget: string,
  source: string,
  keywords: KeywordData[]
): Promise<void> {
  try {
    const { db } = await connectToDatabase()
    const collection = db.collection<StoredKeywordCache>('keyword_cache')

    const cacheKey = generateCacheKey(seeds, geoTarget, source)
    const now = new Date()

    await collection.updateOne(
      { cacheKey },
      {
        $set: {
          seedKeywords: seeds,
          geoTarget,
          source,
          keywords,
          createdAt: now,
          expiresAt: new Date(now.getTime() + CACHE_DURATION_MS)
        }
      },
      { upsert: true }
    )

    console.log('[CACHE] Stored', keywords.length, 'keywords for', seeds.length, 'seeds')
  } catch (error) {
    console.error('[CACHE] Error caching keywords:', error)
  }
}

export async function saveAnalysis(analysis: Omit<StoredAnalysis, '_id'>): Promise<string | null> {
  try {
    const { db } = await connectToDatabase()
    const collection = db.collection<StoredAnalysis>('analyses')

    const result = await collection.insertOne(analysis as StoredAnalysis)
    console.log('[DB] Saved analysis for:', analysis.courseName)
    return result.insertedId.toString()
  } catch (error) {
    console.error('[DB] Error saving analysis:', error)
    return null
  }
}

export async function getAnalysis(courseId: string): Promise<StoredAnalysis | null> {
  try {
    const { db } = await connectToDatabase()
    const collection = db.collection<StoredAnalysis>('analyses')

    return await collection.findOne({ courseId })
  } catch (error) {
    console.error('[DB] Error getting analysis:', error)
    return null
  }
}

export async function getRecentAnalyses(limit: number = 50): Promise<StoredAnalysis[]> {
  try {
    const { db } = await connectToDatabase()
    const collection = db.collection<StoredAnalysis>('analyses')

    return await collection
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()
  } catch (error) {
    console.error('[DB] Error getting recent analyses:', error)
    return []
  }
}

export async function updateKeywordSelection(
  analysisId: string,
  keyword: string,
  selected: boolean
): Promise<boolean> {
  try {
    const { db } = await connectToDatabase()
    const collection = db.collection<StoredAnalysis>('analyses')

    await collection.updateOne(
      { _id: new ObjectId(analysisId), 'analyzedKeywords.keyword': keyword },
      { $set: { 'analyzedKeywords.$.selected': selected, updatedAt: new Date() } }
    )
    return true
  } catch (error) {
    console.error('[DB] Error updating selection:', error)
    return false
  }
}

// Clean up expired cache entries
export async function cleanExpiredCache(): Promise<number> {
  try {
    const { db } = await connectToDatabase()
    const collection = db.collection<StoredKeywordCache>('keyword_cache')

    const result = await collection.deleteMany({
      expiresAt: { $lt: new Date() }
    })

    if (result.deletedCount > 0) {
      console.log('[CACHE] Cleaned', result.deletedCount, 'expired entries')
    }
    return result.deletedCount
  } catch (error) {
    console.error('[CACHE] Error cleaning cache:', error)
    return 0
  }
}
