"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import JobForm from "@/components/JobForm";

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

export default function EditJobClient({ job }: { job: Job }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(payload: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to update job.");
      setSubmitting(false);
      return;
    }

    router.push("/");
  }

  const initialValues = {
    job_number: job.job_number,
    job_name: job.job_name,
    job_type: job.job_type,
    status: job.status,
    original_contract: String(job.original_contract),
    approved_cos: String(job.approved_cos),
    est_total_cost: String(job.est_total_cost),
    original_gp_pct: String(job.original_gp_pct),
    notes: job.notes ?? "",
  };

  return (
    <div className="px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2 text-[#1A1A1A]">Edit Job</h1>
        <p className="text-[#6B7280] mb-8">
          {job.job_number} &mdash; {job.job_name}
        </p>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <JobForm
          initialValues={initialValues}
          onSubmit={handleSubmit}
          submitting={submitting}
          onCancel={() => router.push("/")}
          submitLabel="Update Job"
        />
      </div>
    </div>
  );
}
