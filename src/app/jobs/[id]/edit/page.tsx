import EditJobClient from "./EditJobClient";
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

export default async function EditJobPage({
  params,
}: {
  params: { id: string };
}) {
  const id = parseInt(params.id, 10);
  let job: Job | null = null;
  try {
    const [row] = await sql`SELECT * FROM jobs WHERE id = ${id}`;
    job = (row as Job) ?? null;
  } catch (err) {
    console.error("Failed to fetch job:", err);
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-[#1F3864] text-white flex items-center justify-center">
        <p className="text-gray-400 text-lg">Job not found.</p>
      </div>
    );
  }

  return <EditJobClient job={job} />;
}
