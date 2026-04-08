import Link from "next/link";
import JobsTable from "@/components/JobsTable";

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

async function fetchJobs(): Promise<Job[]> {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const res = await fetch(`${baseUrl}/api/jobs`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export default async function HomePage() {
  const jobs = await fetchJobs();

  return (
    <div className="min-h-screen bg-[#1F3864] text-white px-4 py-10">
      <div className="max-w-screen-xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Vance Corp &mdash; WIP Report</h1>
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
