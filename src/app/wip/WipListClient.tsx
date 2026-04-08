"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface WipReport {
  id: number;
  period_date: string | Date;
  status: string;
  finalized_at: string | Date | null;
  created_at: string | Date;
}

// Always format as YYYY-MM-DD in UTC — avoids server/client hydration mismatch
// from toLocaleDateString() which uses the system timezone (UTC on Vercel,
// browser timezone on the client, producing different strings).
function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}

interface ActiveJob {
  id: number;
  job_number: string;
  job_name: string;
}

export default function WipListClient({
  reports,
  activeJobs,
}: {
  reports: WipReport[];
  activeJobs: ActiveJob[];
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [periodDate, setPeriodDate] = useState("");
  const [selectedJobIds, setSelectedJobIds] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleJob(id: number) {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function openModal() {
    setModalOpen(true);
    setError(null);
    setPeriodDate("");
    setSelectedJobIds(new Set(activeJobs.map((j) => j.id)));
  }

  async function handleCreate() {
    if (!periodDate) { setError("Please select a period end date."); return; }
    if (selectedJobIds.size === 0) { setError("Please select at least one job."); return; }

    setCreating(true);
    setError(null);

    const res = await fetch("/api/wip-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period_date: periodDate, job_ids: Array.from(selectedJobIds) }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create report.");
      setCreating(false);
      return;
    }

    const report = await res.json();
    router.push(`/wip/${report.id}`);
  }

  const statusBadge = (status: string) =>
    status === "final"
      ? "bg-blue-900 text-blue-300"
      : "bg-yellow-900 text-yellow-300";

  return (
    <div className="px-4 py-10">
      <div className="max-w-screen-xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">WIP Reports</h1>
          <button
            onClick={openModal}
            className="bg-[#C9A84C] hover:bg-[#b8953e] text-[#1F3864] font-bold px-5 py-2 rounded transition-colors"
          >
            + New WIP Report
          </button>
        </div>

        {reports.length === 0 ? (
          <p className="text-gray-400 py-20 text-center">No reports yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[#2e4a7a]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#162a50] text-[#C9A84C] text-left">
                  <th className="px-4 py-3 font-semibold">Period Date</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Finalized</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r, i) => (
                  <tr
                    key={r.id}
                    className={`${i % 2 === 0 ? "bg-[#1a3260]" : "bg-[#1F3864]"} hover:bg-[#243d70] transition-colors`}
                  >
                    <td className="px-4 py-2 font-mono">
                      {formatDate(r.period_date)}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusBadge(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-400">
                      {formatDate(r.finalized_at)}
                    </td>
                    <td className="px-4 py-2 text-gray-400">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <Link
                        href={`/wip/${r.id}`}
                        className="text-xs border border-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C]/10 px-3 py-1 rounded transition-colors"
                      >
                        {r.status === "draft" ? "Edit" : "View"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Report Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#162a50] border border-[#2e4a7a] rounded-lg w-full max-w-lg p-6">
            <h2 className="text-xl font-bold text-[#C9A84C] mb-5">New WIP Report</h2>

            {error && (
              <div className="mb-4 bg-red-900/50 border border-red-600 text-red-200 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm text-gray-300 mb-1">Period End Date *</label>
              <input
                type="date"
                value={periodDate}
                onChange={(e) => setPeriodDate(e.target.value)}
                className="w-full bg-[#1F3864] border border-[#2e4a7a] text-white rounded px-3 py-2 focus:outline-none focus:border-[#C9A84C]"
              />
            </div>

            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-300">Include Jobs *</label>
                <div className="flex gap-3 text-xs">
                  <button
                    onClick={() => setSelectedJobIds(new Set(activeJobs.map((j) => j.id)))}
                    className="text-[#C9A84C] hover:underline"
                  >
                    All
                  </button>
                  <button
                    onClick={() => setSelectedJobIds(new Set())}
                    className="text-gray-400 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto border border-[#2e4a7a] rounded">
                {activeJobs.length === 0 ? (
                  <p className="text-gray-400 text-sm px-3 py-4 text-center">
                    No active jobs found.
                  </p>
                ) : (
                  activeJobs.map((job) => (
                    <label
                      key={job.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-[#1F3864] cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedJobIds.has(job.id)}
                        onChange={() => toggleJob(job.id)}
                        className="accent-[#C9A84C]"
                      />
                      <span className="font-mono text-gray-300 w-12 shrink-0">
                        {job.job_number}
                      </span>
                      <span>{job.job_name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="bg-[#C9A84C] hover:bg-[#b8953e] disabled:opacity-50 text-[#1F3864] font-bold px-5 py-2 rounded transition-colors"
              >
                {creating ? "Creating..." : "Create Report"}
              </button>
              <button
                onClick={() => setModalOpen(false)}
                className="border border-[#2e4a7a] text-gray-300 hover:border-[#C9A84C] hover:text-[#C9A84C] px-5 py-2 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
