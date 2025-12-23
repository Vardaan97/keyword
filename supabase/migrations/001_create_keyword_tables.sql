-- Keyword Planner Database Schema
-- Run this SQL in your Supabase SQL Editor

-- ============================================
-- 1. Research Sessions Table
-- Stores completed keyword research sessions
-- ============================================
CREATE TABLE IF NOT EXISTS research_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Course Information
  course_name TEXT NOT NULL,
  course_url TEXT,
  vendor TEXT,
  certification_code TEXT,

  -- Processing Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error TEXT,

  -- Keywords Data (stored as JSONB for flexibility)
  seed_keywords JSONB DEFAULT '[]'::jsonb,
  keyword_ideas JSONB DEFAULT '[]'::jsonb,
  analyzed_keywords JSONB DEFAULT '[]'::jsonb,

  -- Summary Stats
  summary JSONB,

  -- Metadata
  data_source TEXT DEFAULT 'google_ads',
  target_country TEXT DEFAULT 'india',
  ai_provider TEXT DEFAULT 'openai',
  total_keywords INTEGER DEFAULT 0,
  keywords_to_add INTEGER DEFAULT 0,
  processing_time_ms INTEGER
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_research_sessions_created_at ON research_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_sessions_course_name ON research_sessions(course_name);
CREATE INDEX IF NOT EXISTS idx_research_sessions_status ON research_sessions(status);
CREATE INDEX IF NOT EXISTS idx_research_sessions_vendor ON research_sessions(vendor);

-- ============================================
-- 2. Keyword Cache Table
-- Caches keyword data to avoid re-fetching
-- ============================================
CREATE TABLE IF NOT EXISTS keyword_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  geo_target TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Index for cache lookups
CREATE INDEX IF NOT EXISTS idx_keyword_cache_key ON keyword_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_keyword_cache_expires ON keyword_cache(expires_at);

-- ============================================
-- 3. Individual Keyword Volumes Cache
-- Per-keyword caching for efficient lookups
-- ============================================
CREATE TABLE IF NOT EXISTS keyword_volumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  keyword_normalized TEXT NOT NULL,
  avg_monthly_searches INTEGER DEFAULT 0,
  competition TEXT,
  competition_index INTEGER DEFAULT 0,
  low_bid_micros BIGINT,
  high_bid_micros BIGINT,
  source TEXT NOT NULL,
  country TEXT NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Unique constraint per keyword/country/source combination
  UNIQUE(keyword_normalized, country, source)
);

-- Indexes for volume lookups
CREATE INDEX IF NOT EXISTS idx_keyword_volumes_lookup ON keyword_volumes(keyword_normalized, country, source);
CREATE INDEX IF NOT EXISTS idx_keyword_volumes_expires ON keyword_volumes(expires_at);

-- ============================================
-- 4. Auto-update timestamp trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to research_sessions
DROP TRIGGER IF EXISTS update_research_sessions_updated_at ON research_sessions;
CREATE TRIGGER update_research_sessions_updated_at
  BEFORE UPDATE ON research_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to keyword_cache
DROP TRIGGER IF EXISTS update_keyword_cache_updated_at ON keyword_cache;
CREATE TRIGGER update_keyword_cache_updated_at
  BEFORE UPDATE ON keyword_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. Enable Row Level Security (optional)
-- ============================================
-- ALTER TABLE research_sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE keyword_cache ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE keyword_volumes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. Cleanup function for expired cache
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM keyword_cache WHERE expires_at < NOW();
  DELETE FROM keyword_volumes WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Success message
-- ============================================
SELECT 'Keyword Planner tables created successfully!' as message;
