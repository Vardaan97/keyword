-- Supabase Schema for Keyword Planner
-- Run this in Supabase SQL Editor to create tables

-- Research Sessions Table (stores all keyword research history)
CREATE TABLE IF NOT EXISTS research_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Course Info
  course_name TEXT NOT NULL,
  course_url TEXT,
  vendor TEXT,
  certification_code TEXT,

  -- Processing Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error TEXT,

  -- Keyword Data (stored as JSONB for flexibility)
  seed_keywords JSONB DEFAULT '[]'::jsonb,
  keyword_ideas JSONB DEFAULT '[]'::jsonb,
  analyzed_keywords JSONB DEFAULT '[]'::jsonb,

  -- Summary Stats
  summary JSONB,
  total_keywords INTEGER DEFAULT 0,
  keywords_to_add INTEGER DEFAULT 0,

  -- Settings used
  data_source TEXT DEFAULT 'auto',
  target_country TEXT DEFAULT 'global',
  ai_provider TEXT DEFAULT 'openrouter',

  -- Performance
  processing_time_ms INTEGER
);

-- Keyword Cache Table (caches API responses to reduce costs)
CREATE TABLE IF NOT EXISTS keyword_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  keywords JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Batch Processing Table (for tracking multi-course batches)
CREATE TABLE IF NOT EXISTS batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_courses INTEGER DEFAULT 0,
  completed_courses INTEGER DEFAULT 0,
  failed_courses INTEGER DEFAULT 0,
  session_ids UUID[] DEFAULT '{}',
  settings JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON research_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON research_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_course_name ON research_sessions(course_name);
CREATE INDEX IF NOT EXISTS idx_cache_key ON keyword_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON keyword_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_batch_status ON batch_jobs(status);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_research_sessions_updated_at ON research_sessions;
CREATE TRIGGER update_research_sessions_updated_at
  BEFORE UPDATE ON research_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_keyword_cache_updated_at ON keyword_cache;
CREATE TRIGGER update_keyword_cache_updated_at
  BEFORE UPDATE ON keyword_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_batch_jobs_updated_at ON batch_jobs;
CREATE TRIGGER update_batch_jobs_updated_at
  BEFORE UPDATE ON batch_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) - Enable if needed for multi-tenant
-- ALTER TABLE research_sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE keyword_cache ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE batch_jobs ENABLE ROW LEVEL SECURITY;

-- Clean up expired cache entries (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM keyword_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
