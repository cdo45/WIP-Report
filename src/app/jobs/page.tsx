import Link from "next/link";
import JobsTable from "@/components/JobsTable";
import sql from "@/db";

interface Job {
  id: number;
  job_number: string;
  job_name: string;
  job_type: string;
  status: string;
  original_contract: number;
  approved_cos: number;
  est_total_cost: number;
  original_gp_pct: number;
  notes: string | null;
}

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  let jobs: Job[] = [];
  try {
    const rows = (await sql`SELECT * FROM jobs`) as Job[];
    // Numeric dash-split sort: 2024-07 < 2025-01 < 2025-05
    jobs = [...rows].sort((a, b) => {
      const aParts = a.job_number.split("-").map(Number);
      const bParts = b.job_number.split("-").map(Number);
      if (aParts[0] !== bParts[0]) return aParts[0] - bParts[0];
      return (aParts[1] ?? 0) - (bParts[1] ?? 0);
    });
  } catch (err) {
    console.error("Failed to fetch jobs:", err);
  }

  return (
    <div className="px-4 py-10">
      <div className="max-w-screen-xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Jobs</h1>
          <Link
            href="/jobs/new"
            className="bg-[#1B2A4A] hover:bg-[#243d70] text-white font-bold px-5 py-2 rounded transition-colors"
          >
            + New Job
          </Link>
        </div>
        <JobsTable jobs={jobs} />
      </div>
    </div>
  );
}
