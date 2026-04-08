CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  job_number TEXT UNIQUE NOT NULL,
  job_name TEXT NOT NULL,
  job_type TEXT DEFAULT 'Fixed Fee',
  status TEXT DEFAULT 'Active',
  original_contract NUMERIC DEFAULT 0,
  approved_cos NUMERIC DEFAULT 0,
  est_total_cost NUMERIC DEFAULT 0,
  original_gp_pct NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wip_reports (
  id SERIAL PRIMARY KEY,
  period_date DATE NOT NULL,
  status TEXT DEFAULT 'draft',
  finalized_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wip_line_items (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES wip_reports(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  costs_to_date NUMERIC DEFAULT 0,
  billings_to_date NUMERIC DEFAULT 0,
  pm_pct_override NUMERIC,
  prior_year_earned NUMERIC DEFAULT 0,
  prior_year_billings NUMERIC DEFAULT 0,
  prior_year_costs NUMERIC DEFAULT 0,
  is_prior_locked BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
