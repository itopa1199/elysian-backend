-- ============================================
-- ELYSIAN Geo AI Platform — Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable PostGIS for geographic queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- ── Mineral Deposits (your master data table) ──
CREATE TABLE IF NOT EXISTS mineral_deposits (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT NOT NULL,
  mineral_type    TEXT NOT NULL,          -- 'Lithium', 'Gold', 'Iron Ore', etc.
  deposit_type    TEXT,                   -- 'Pegmatite', 'Placer', 'BIF', etc.
  longitude       DOUBLE PRECISION NOT NULL,
  latitude        DOUBLE PRECISION NOT NULL,
  location        GEOGRAPHY(POINT, 4326), -- PostGIS point (auto-populated by trigger)
  state           TEXT,                   -- Nigerian state
  lga             TEXT,
  ai_probability  INTEGER DEFAULT 70,     -- 0-100
  estimated_tonnage TEXT,
  deposit_grade   TEXT DEFAULT 'Medium',  -- 'High' | 'Medium' | 'Low'
  survey_confidence INTEGER DEFAULT 80,
  source          TEXT DEFAULT 'USGS_MRDS', -- 'USGS_MRDS' | 'NGSA' | 'AI_DETECTED'
  status          TEXT DEFAULT 'Unknown',
  last_surveyed   DATE,
  description     TEXT,
  recommended_action TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-populate PostGIS geography point from lon/lat
CREATE OR REPLACE FUNCTION set_location_point()
RETURNS TRIGGER AS $$
BEGIN
  NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_location
  BEFORE INSERT OR UPDATE ON mineral_deposits
  FOR EACH ROW EXECUTE FUNCTION set_location_point();

-- Index for fast geographic queries
CREATE INDEX IF NOT EXISTS idx_mineral_deposits_location
  ON mineral_deposits USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_mineral_deposits_type
  ON mineral_deposits(mineral_type);
CREATE INDEX IF NOT EXISTS idx_mineral_deposits_state
  ON mineral_deposits(state);

-- ── Projects ──
CREATE TABLE IF NOT EXISTS projects (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  status          TEXT DEFAULT 'active',   -- 'active' | 'pending' | 'completed'
  lead_analyst    TEXT,
  mineral_focus   TEXT[],
  region          TEXT,
  start_date      DATE DEFAULT CURRENT_DATE,
  deposit_count   INTEGER DEFAULT 0,
  ai_confidence   INTEGER DEFAULT 80,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── API Cache (avoids hammering USGS on every request) ──
CREATE TABLE IF NOT EXISTS mineral_cache (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key   TEXT UNIQUE NOT NULL,
  data        JSONB NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cache_key ON mineral_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON mineral_cache(expires_at);

-- ── Clean expired cache entries (run nightly) ──
CREATE OR REPLACE FUNCTION clean_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM mineral_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ── Seed seed data — Nigeria hotspot deposits ──
INSERT INTO mineral_deposits (name, mineral_type, deposit_type, longitude, latitude, state, ai_probability, deposit_grade, survey_confidence, source, status, description, recommended_action)
VALUES
  ('Nasarawa Lithium Zone A',  'Lithium',   'Pegmatite',   8.5199, 8.5568, 'Nasarawa',   94, 'High',   97, 'NGSA',      'Active',       'Spodumene-bearing pegmatite with high Li₂O content. Part of the North-Central Nigerian pegmatite belt.', 'Proceed with detailed ground survey and drill sampling'),
  ('Nasarawa Lithium Zone B',  'Lithium',   'Pegmatite',   8.6200, 8.6100, 'Nasarawa',   89, 'High',   92, 'NGSA',      'Prospective',  'Secondary pegmatite zone with confirmed lithium signatures from airborne geophysics.', 'Deploy ground magnetometry survey'),
  ('Jos Plateau Iron BIF',     'Iron Ore',  'BIF',         8.8921, 9.8965, 'Plateau',    91, 'High',   94, 'USGS_MRDS', 'Past Producer','Precambrian banded iron formation. Estimated reserve 450Mt at 45% Fe grade.', 'Re-evaluate with modern geophysical methods'),
  ('Kaduna Greenstone Gold',   'Gold',      'Vein',        7.4383, 10.5222,'Kaduna',     71, 'Medium', 88, 'USGS_MRDS', 'Prospective',  'Greenstone belt gold occurrence. Similar geology to Osun State producers.', 'Conduct soil geochemistry sampling'),
  ('Zamfara Gold Field North', 'Gold',      'Placer/Vein', 6.2373, 12.1679,'Zamfara',    78, 'High',   85, 'NGSA',      'Active',       'Active artisanal gold mining zone. Airborne EM data indicates primary source nearby.', 'Map primary source with IP survey'),
  ('Kogi Carbonatite REE',     'Rare Earth','Carbonatite', 6.7382, 7.7337, 'Kogi',       88, 'High',   91, 'NGSA',      'Prospective',  'Carbonatite-hosted rare earth deposit. Nd, Pr, Dy, Tb present. Estimated 1.1Mt total REE.', 'Conduct detailed petrographic study'),
  ('Niger State Columbite',    'Columbite-Tantalite','Pegmatite',5.5800, 9.9800,'Niger',  82, 'Medium', 86, 'USGS_MRDS', 'Past Producer','Jos Plateau fringe columbite-tantalite pegmatites. Historical production area.', 'Resurvey for residual reserves'),
  ('Plateau Tin Belt',         'Tin',       'Pegmatite',   8.9000, 9.7000, 'Plateau',    85, 'Medium', 89, 'USGS_MRDS', 'Past Producer','Classic Jos Plateau cassiterite (tin) deposit. Part of the Younger Granite ring complex.', 'Economic feasibility study needed');

-- ── Seed projects ──
INSERT INTO projects (name, description, status, lead_analyst, mineral_focus, region, deposit_count, ai_confidence)
VALUES
  ('Nasarawa Lithium Survey',  'Primary lithium pegmatite survey targeting the North-Central Nigerian pegmatite belt', 'active',  'Dr. Adaeze N.', ARRAY['Lithium'],          'North-Central', 18, 96),
  ('Zamfara Gold Mapping',     'Comprehensive gold deposit mapping using SAR and EM geophysical methods',             'active',  'Dr. Adaeze N.', ARRAY['Gold'],             'North-West',    34, 88),
  ('Jos Plateau Iron Survey',  'Re-evaluation of BIF iron ore reserves using modern geophysical techniques',          'pending', 'Dr. Adaeze N.', ARRAY['Iron Ore'],         'North-Central', 12, 91),
  ('Kogi REE Assessment',      'Rare earth element assessment of Kogi State carbonatite intrusions',                  'pending', 'Dr. Adaeze N.', ARRAY['Rare Earth'],       'North-Central',  7, 88);

-- ── RLS: Allow API reads ──
ALTER TABLE mineral_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE mineral_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read mineral_deposits" ON mineral_deposits FOR SELECT USING (true);
CREATE POLICY "Public read projects" ON projects FOR SELECT USING (true);
CREATE POLICY "Service role all mineral_cache" ON mineral_cache USING (true);
CREATE POLICY "Service role all deposits" ON mineral_deposits USING (true) WITH CHECK (true);
