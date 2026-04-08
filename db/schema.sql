CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  job_number TEXT UNIQUE NOT NULL,
  job_name TEXT NOT NULL,
  job_type TEXT DEFAULT 'Fixed Fee',
  status TEXT DEFAULT 'Active',
  period TEXT NOT NULL,
  revised_contract NUMERIC DEFAULT 0,
  est_total_cost NUMERIC DEFAULT 0,
  cy_billings NUMERIC DEFAULT 0,
  cy_costs NUMERIC DEFAULT 0,
  prior_earned NUMERIC DEFAULT 0,
  prior_billings NUMERIC DEFAULT 0,
  prior_costs NUMERIC DEFAULT 0,
  pm_pct_override NUMERIC,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
