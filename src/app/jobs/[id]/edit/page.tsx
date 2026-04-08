import EditJobClient from "./EditJobClient";

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

async function fetchJob(id: string): Promise<Job | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const res = await fetch(`${baseUrl}/api/jobs/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function EditJobPage({
  params,
}: {
  params: { id: string };
}) {
  const job = await fetchJob(params.id);

  if (!job) {
    return (
      <div className="min-h-screen bg-[#1F3864] text-white flex items-center justify-center">
        <p className="text-gray-400 text-lg">Job not found.</p>
      </div>
    );
  }

  return <EditJobClient job={job} />;
}
