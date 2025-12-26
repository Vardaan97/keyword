-- Google Ads Knowledge Base Schema
-- This schema stores Google Ads account structure for AI recommendations

-- ============================================================================
-- ACCOUNTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS gads_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id VARCHAR(20) NOT NULL UNIQUE,  -- e.g., "351-501-2934"
    name VARCHAR(255) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_sync_at TIMESTAMPTZ
);

-- ============================================================================
-- CAMPAIGNS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS gads_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES gads_accounts(id) ON DELETE CASCADE,
    google_campaign_id VARCHAR(50),  -- Google's internal ID if available
    name VARCHAR(500) NOT NULL,
    campaign_type VARCHAR(50),  -- Search, Display, Performance Max, Demand Gen
    status VARCHAR(20),  -- Enabled, Paused, Ended

    -- Budget & Bidding
    budget DECIMAL(12, 2),
    budget_type VARCHAR(50),
    bid_strategy_type VARCHAR(50),  -- Maximize conversions, Maximize clicks, Target CPA
    target_cpa DECIMAL(12, 2),
    target_roas DECIMAL(8, 4),

    -- Targeting
    networks VARCHAR(100),  -- Search Network, Display Network
    languages TEXT,  -- Comma-separated language codes

    -- Device Modifiers
    desktop_bid_modifier DECIMAL(5, 2),
    mobile_bid_modifier DECIMAL(5, 2),
    tablet_bid_modifier DECIMAL(5, 2),

    -- Settings
    ad_rotation VARCHAR(50),
    start_date DATE,
    end_date DATE,

    -- Metadata
    labels TEXT,  -- Comma-separated labels
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(account_id, name)
);

-- ============================================================================
-- CAMPAIGN GEO TARGETS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS gads_campaign_geo_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES gads_campaigns(id) ON DELETE CASCADE,
    location_name VARCHAR(255) NOT NULL,
    location_type VARCHAR(50),  -- Country, Region, City
    is_negative BOOLEAN DEFAULT false,
    bid_modifier DECIMAL(5, 2),
    reach VARCHAR(50),  -- Estimated reach if available
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(campaign_id, location_name, is_negative)
);

-- ============================================================================
-- AD GROUPS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS gads_ad_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES gads_campaigns(id) ON DELETE CASCADE,
    google_ad_group_id VARCHAR(50),
    name VARCHAR(500) NOT NULL,
    ad_group_type VARCHAR(50),  -- Standard, Dynamic
    status VARCHAR(20),  -- Enabled, Paused

    -- Bidding
    max_cpc DECIMAL(12, 2),
    target_cpa DECIMAL(12, 2),
    target_roas DECIMAL(8, 4),

    -- URLs
    final_url TEXT,
    final_mobile_url TEXT,
    tracking_template TEXT,
    final_url_suffix TEXT,
    custom_parameters JSONB,

    -- Targeting
    optimized_targeting BOOLEAN,
    audience_targeting TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(campaign_id, name)
);

-- ============================================================================
-- KEYWORDS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS gads_keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_group_id UUID REFERENCES gads_ad_groups(id) ON DELETE CASCADE,
    google_keyword_id VARCHAR(50),
    keyword_text VARCHAR(500) NOT NULL,
    match_type VARCHAR(20),  -- Exact, Phrase, Broad
    status VARCHAR(20),  -- Enabled, Paused

    -- Bidding
    max_cpc DECIMAL(12, 2),
    first_page_bid DECIMAL(12, 2),
    top_of_page_bid DECIMAL(12, 2),
    first_position_bid DECIMAL(12, 2),

    -- Quality Metrics
    quality_score SMALLINT,  -- 1-10
    landing_page_experience VARCHAR(50),  -- Above average, Average, Below average
    expected_ctr VARCHAR(50),
    ad_relevance VARCHAR(50),

    -- Metadata
    approval_status VARCHAR(50),
    is_negative BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(ad_group_id, keyword_text, match_type, is_negative)
);

-- ============================================================================
-- RESPONSIVE SEARCH ADS TABLE (for future RSA analysis)
-- ============================================================================
CREATE TABLE IF NOT EXISTS gads_responsive_search_ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_group_id UUID REFERENCES gads_ad_groups(id) ON DELETE CASCADE,
    google_ad_id VARCHAR(50),
    status VARCHAR(20),
    approval_status VARCHAR(50),
    ad_strength VARCHAR(50),  -- Excellent, Good, Average, Poor

    -- Headlines (up to 15)
    headlines JSONB,  -- Array of {text, position, pinned}

    -- Descriptions (up to 4)
    descriptions JSONB,  -- Array of {text, position, pinned}

    -- URLs
    final_url TEXT,
    final_mobile_url TEXT,
    path1 VARCHAR(50),
    path2 VARCHAR(50),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SYNC LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS gads_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES gads_accounts(id) ON DELETE CASCADE,
    sync_type VARCHAR(20) NOT NULL,  -- FULL, INCREMENTAL
    entity_type VARCHAR(50),  -- campaigns, ad_groups, keywords, all
    source VARCHAR(50),  -- csv_import, api_sync

    -- Statistics
    records_processed INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,

    -- Status
    status VARCHAR(20) DEFAULT 'pending',  -- pending, running, completed, failed
    error_message TEXT,

    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ============================================================================
-- CHANGE TRACKING TABLE (for RMS verification)
-- ============================================================================
CREATE TABLE IF NOT EXISTS gads_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES gads_accounts(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,  -- campaign, ad_group, keyword, ad
    entity_id UUID,  -- Reference to the entity that changed
    entity_name VARCHAR(500),  -- Human-readable name

    change_type VARCHAR(20) NOT NULL,  -- CREATE, UPDATE, DELETE
    field_name VARCHAR(100),  -- Which field changed
    old_value TEXT,
    new_value TEXT,

    -- Attribution
    changed_by VARCHAR(50),  -- RMS, MANUAL, API, CLAUDE
    change_source VARCHAR(100),  -- Details about the source

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_gads_campaigns_account ON gads_campaigns(account_id);
CREATE INDEX IF NOT EXISTS idx_gads_campaigns_status ON gads_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_gads_campaigns_type ON gads_campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS idx_gads_campaigns_name ON gads_campaigns(name);

CREATE INDEX IF NOT EXISTS idx_gads_ad_groups_campaign ON gads_ad_groups(campaign_id);
CREATE INDEX IF NOT EXISTS idx_gads_ad_groups_status ON gads_ad_groups(status);
CREATE INDEX IF NOT EXISTS idx_gads_ad_groups_name ON gads_ad_groups(name);
CREATE INDEX IF NOT EXISTS idx_gads_ad_groups_url ON gads_ad_groups(final_url);

CREATE INDEX IF NOT EXISTS idx_gads_keywords_ad_group ON gads_keywords(ad_group_id);
CREATE INDEX IF NOT EXISTS idx_gads_keywords_text ON gads_keywords(keyword_text);
CREATE INDEX IF NOT EXISTS idx_gads_keywords_status ON gads_keywords(status);
CREATE INDEX IF NOT EXISTS idx_gads_keywords_quality ON gads_keywords(quality_score);
CREATE INDEX IF NOT EXISTS idx_gads_keywords_match ON gads_keywords(match_type);

CREATE INDEX IF NOT EXISTS idx_gads_geo_targets_campaign ON gads_campaign_geo_targets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_gads_geo_targets_location ON gads_campaign_geo_targets(location_name);

CREATE INDEX IF NOT EXISTS idx_gads_changes_account ON gads_changes(account_id);
CREATE INDEX IF NOT EXISTS idx_gads_changes_entity ON gads_changes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_gads_changes_created ON gads_changes(created_at);

-- ============================================================================
-- VIEWS FOR EASY QUERYING
-- ============================================================================

-- View: Campaign summary with stats
CREATE OR REPLACE VIEW gads_campaign_summary AS
SELECT
    c.id,
    c.name AS campaign_name,
    c.campaign_type,
    c.status AS campaign_status,
    c.bid_strategy_type,
    c.target_cpa,
    a.name AS account_name,
    a.customer_id,
    COUNT(DISTINCT ag.id) AS ad_group_count,
    COUNT(DISTINCT k.id) AS keyword_count,
    COUNT(DISTINCT CASE WHEN k.quality_score < 5 THEN k.id END) AS low_quality_keywords
FROM gads_campaigns c
JOIN gads_accounts a ON c.account_id = a.id
LEFT JOIN gads_ad_groups ag ON ag.campaign_id = c.id
LEFT JOIN gads_keywords k ON k.ad_group_id = ag.id
GROUP BY c.id, c.name, c.campaign_type, c.status, c.bid_strategy_type, c.target_cpa, a.name, a.customer_id;

-- View: Keywords with low quality score (for optimization)
CREATE OR REPLACE VIEW gads_low_quality_keywords AS
SELECT
    k.id,
    k.keyword_text,
    k.match_type,
    k.quality_score,
    k.landing_page_experience,
    k.expected_ctr,
    k.ad_relevance,
    k.status AS keyword_status,
    ag.name AS ad_group_name,
    ag.final_url,
    c.name AS campaign_name,
    c.campaign_type,
    a.name AS account_name
FROM gads_keywords k
JOIN gads_ad_groups ag ON k.ad_group_id = ag.id
JOIN gads_campaigns c ON ag.campaign_id = c.id
JOIN gads_accounts a ON c.account_id = a.id
WHERE k.quality_score IS NOT NULL AND k.quality_score < 5
ORDER BY k.quality_score ASC, k.keyword_text;

-- View: Ad groups by URL (for keyword planner recommendations)
CREATE OR REPLACE VIEW gads_ad_groups_by_url AS
SELECT
    ag.id AS ad_group_id,
    ag.name AS ad_group_name,
    ag.final_url,
    ag.status AS ad_group_status,
    c.name AS campaign_name,
    c.campaign_type,
    c.status AS campaign_status,
    a.name AS account_name,
    a.customer_id,
    COUNT(k.id) AS keyword_count
FROM gads_ad_groups ag
JOIN gads_campaigns c ON ag.campaign_id = c.id
JOIN gads_accounts a ON c.account_id = a.id
LEFT JOIN gads_keywords k ON k.ad_group_id = ag.id
WHERE ag.final_url IS NOT NULL
GROUP BY ag.id, ag.name, ag.final_url, ag.status, c.name, c.campaign_type, c.status, a.name, a.customer_id
ORDER BY ag.final_url;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to find ad groups for a given URL pattern
CREATE OR REPLACE FUNCTION find_ad_groups_for_url(url_pattern TEXT)
RETURNS TABLE (
    ad_group_id UUID,
    ad_group_name VARCHAR,
    final_url TEXT,
    campaign_name VARCHAR,
    campaign_type VARCHAR,
    keyword_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ag.id,
        ag.name,
        ag.final_url,
        c.name,
        c.campaign_type,
        COUNT(k.id)
    FROM gads_ad_groups ag
    JOIN gads_campaigns c ON ag.campaign_id = c.id
    LEFT JOIN gads_keywords k ON k.ad_group_id = ag.id
    WHERE ag.final_url ILIKE '%' || url_pattern || '%'
    GROUP BY ag.id, ag.name, ag.final_url, c.name, c.campaign_type;
END;
$$ LANGUAGE plpgsql;

-- Function to get campaign geo targeting summary
CREATE OR REPLACE FUNCTION get_campaign_geo_summary(p_campaign_id UUID)
RETURNS TABLE (
    location_name VARCHAR,
    is_negative BOOLEAN,
    bid_modifier DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT gt.location_name, gt.is_negative, gt.bid_modifier
    FROM gads_campaign_geo_targets gt
    WHERE gt.campaign_id = p_campaign_id
    ORDER BY gt.is_negative, gt.location_name;
END;
$$ LANGUAGE plpgsql;
