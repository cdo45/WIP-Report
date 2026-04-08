"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const JOB_TYPES = ["Fixed Fee", "T&M", "Unit Price"] as const;
const STATUSES = ["Active", "Complete", "Closed"] as const;

interface FormState {
  job_number: string;
  job_name: string;
  job_type: string;
  status: string;
  period: string;
  revised_contract: string;
  est_total_cost: string;
  cy_billings: string;
  cy_costs: string;
  prior_earned: string;
  prior_billings: string;
  prior_costs: string;
  pm_pct_override: string;
  notes: string;
}

const empty: FormState = {
  job_number: "",
  job_name: "",
  job_type: "Fixed Fee",
  status: "Active",
  period: "",
  revised_contract: "",
  est_total_cost: "",
  cy_billings: "",
  cy_costs: "",
  prior_earned: "",
  prior_billings: "",
  prior_costs: "",
  pm_pct_override: "",
  notes: "",
};

export default function NewJobPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      ...form,
      revised_contract: form.revised_contract === "" ? 0 : Number(form.revised_contract),
      est_total_cost: form.est_total_cost === "" ? 0 : Number(form.est_total_cost),
      cy_billings: form.cy_billings === "" ? 0 : Number(form.cy_billings),
      cy_costs: form.cy_costs === "" ? 0 : Number(form.cy_costs),
      prior_earned: form.prior_earned === "" ? 0 : Number(form.prior_earned),
      prior_billings: form.prior_billings === "" ? 0 : Number(form.prior_billings),
      prior_costs: form.prior_costs === "" ? 0 : Number(form.prior_costs),
      pm_pct_override: form.pm_pct_override === "" ? null : Number(form.pm_pct_override),
      notes: form.notes === "" ? null : form.notes,
    };

    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save job.");
      setSubmitting(false);
      return;
    }

    router.push("/");
  }

  const inputClass =
    "w-full bg-[#162a50] border border-[#2e4a7a] text-white rounded px-3 py-2 focus:outline-none focus:border-[#C9A84C] placeholder-gray-500";
  const labelClass = "block text-sm text-gray-300 mb-1";

  return (
    <div className="min-h-screen bg-[#1F3864] text-white px-4 py-10">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-[#C9A84C]">New Job</h1>

        {error && (
          <div className="mb-6 bg-red-900/50 border border-red-600 text-red-200 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Job Number *</label>
              <input
                name="job_number"
                required
                value={form.job_number}
                onChange={handleChange}
                placeholder="e.g. 2501"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Job Name *</label>
              <input
                name="job_name"
                required
                value={form.job_name}
                onChange={handleChange}
                placeholder="e.g. Main Street Bridge"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Job Type</label>
              <select
                name="job_type"
                value={form.job_type}
                onChange={handleChange}
                className={inputClass}
              >
                {JOB_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className={inputClass}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Period *</label>
              <input
                name="period"
                required
                value={form.period}
                onChange={handleChange}
                placeholder="e.g. 2026-02"
                className={inputClass}
              />
            </div>
          </div>

          {/* Contract & Cost */}
          <div>
            <h2 className="text-lg font-semibold text-[#C9A84C] mb-3">Contract & Cost</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Revised Contract ($)</label>
                <input
                  type="number"
                  name="revised_contract"
                  value={form.revised_contract}
                  onChange={handleChange}
                  step="0.01"
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Est. Total Cost ($)</label>
                <input
                  type="number"
                  name="est_total_cost"
                  value={form.est_total_cost}
                  onChange={handleChange}
                  step="0.01"
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Current Year */}
          <div>
            <h2 className="text-lg font-semibold text-[#C9A84C] mb-3">Current Year</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>CY Billings ($)</label>
                <input
                  type="number"
                  name="cy_billings"
                  value={form.cy_billings}
                  onChange={handleChange}
                  step="0.01"
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>CY Costs ($)</label>
                <input
                  type="number"
                  name="cy_costs"
                  value={form.cy_costs}
                  onChange={handleChange}
                  step="0.01"
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Prior */}
          <div>
            <h2 className="text-lg font-semibold text-[#C9A84C] mb-3">Prior Period</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Prior Earned ($)</label>
                <input
                  type="number"
                  name="prior_earned"
                  value={form.prior_earned}
                  onChange={handleChange}
                  step="0.01"
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Prior Billings ($)</label>
                <input
                  type="number"
                  name="prior_billings"
                  value={form.prior_billings}
                  onChange={handleChange}
                  step="0.01"
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Prior Costs ($)</label>
                <input
                  type="number"
                  name="prior_costs"
                  value={form.prior_costs}
                  onChange={handleChange}
                  step="0.01"
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Overrides & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>PM % Override (optional, 0–1)</label>
              <input
                type="number"
                name="pm_pct_override"
                value={form.pm_pct_override}
                onChange={handleChange}
                step="0.0001"
                min="0"
                max="1"
                placeholder="e.g. 0.75"
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-1">
              <label className={labelClass}>Notes (optional)</label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={3}
                placeholder="Any notes..."
                className={inputClass}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-[#C9A84C] hover:bg-[#b8953e] disabled:opacity-50 text-[#1F3864] font-bold px-6 py-2 rounded transition-colors"
            >
              {submitting ? "Saving..." : "Save Job"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="border border-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C]/10 px-6 py-2 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
