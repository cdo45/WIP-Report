DROP TABLE IF EXISTS jobs;
CREATE TABLE jobs (
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
