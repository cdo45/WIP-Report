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
    // JS sort — does not rely on DB collation or SQL ORDER BY
    jobs = [...rows].sort((a, b) =>
      a.job_number.localeCompare(b.job_number, undefined, { numeric: true })
    );
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
            className="bg-[#C9A84C] hover:bg-[#b8953e] text-[#1F3864] font-bold px-5 py-2 rounded transition-colors"
          >
            + New Job
          </Link>
        </div>
        <JobsTable jobs={jobs} />
      </div>
    </div>
  );
}
