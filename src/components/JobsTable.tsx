"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

function fmt(n: number): string {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function JobsTable({ jobs: initialJobs }: { jobs: Job[] }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [deleting, setDeleting] = useState<number | null>(null);

  async function handleDelete(id: number) {
    if (!confirm("Delete this job? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      if (res.ok) {
        setJobs((prev) => prev.filter((j) => j.id !== id));
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to delete job.");
      }
    } catch {
      alert("Failed to delete job.");
    } finally {
      setDeleting(null);
    }
  }

  if (jobs.length === 0) {
    return (
      <p className="text-[#6B7280] text-center py-20">
        No jobs yet.{" "}
        <Link href="/jobs/new" className="text-[#1B2A4A] underline">
          Add the first one.
        </Link>
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#1B2A4A] text-white text-left">
            <th className="px-3 py-3 font-semibold whitespace-nowrap">Job #</th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap">Job Name</th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap">Type</th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap">Status</th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
              Original Contract
            </th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
              Approved COs
            </th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
              Revised Contract
            </th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
              Est Total Cost
            </th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
              Est GP%
            </th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap">Notes</th>
            <th className="px-3 py-3 font-semibold whitespace-nowrap text-center">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job, i) => {
            const revisedContract =
              Number(job.original_contract) + Number(job.approved_cos);
            const estGpPct =
              revisedContract > 0
                ? ((revisedContract - Number(job.est_total_cost)) / revisedContract) * 100
                : 0;
            const rowBg = i % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]";
            const isDeleting = deleting === job.id;

            return (
              <tr
                key={job.id}
                className={`${rowBg} hover:bg-[#F3F4F6] transition-colors ${isDeleting ? "opacity-50" : ""}`}
              >
                <td className="px-3 py-2 whitespace-nowrap font-mono text-[#1A1A1A]">{job.job_number}</td>
                <td className="px-3 py-2 text-[#1A1A1A]">{job.job_name}</td>
                <td className="px-3 py-2 whitespace-nowrap text-[#6B7280]">{job.job_type}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      job.status === "Active"
                        ? "bg-green-100 text-green-700"
                        : job.status === "Complete"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {job.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap text-[#1A1A1A]">
                  ${fmt(Number(job.original_contract))}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap text-[#1A1A1A]">
                  ${fmt(Number(job.approved_cos))}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap font-semibold text-[#1A1A1A]">
                  ${fmt(revisedContract)}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap text-[#1A1A1A]">
                  ${fmt(Number(job.est_total_cost))}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap text-[#1A1A1A]">
                  {estGpPct.toFixed(2)}%
                </td>
                <td className="px-3 py-2 text-[#6B7280] max-w-[180px] truncate">
                  {job.notes ?? "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-center">
                  <div className="flex gap-2 justify-center">
                    <Link
                      href={`/jobs/${job.id}/edit`}
                      className="text-xs border border-[#1B2A4A] text-[#1B2A4A] hover:bg-[#1B2A4A]/10 px-2 py-1 rounded transition-colors"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(job.id)}
                      disabled={isDeleting}
                      className="text-xs border border-red-300 text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
                    >
                      {isDeleting ? "..." : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
