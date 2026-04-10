"use client";

import { useState } from "react";

const JOB_TYPES = ["Fixed Fee", "T&M", "Unit Price"] as const;
const STATUSES = ["Active", "Complete", "Closed"] as const;

interface JobFormFields {
  job_number: string;
  job_name: string;
  job_type: string;
  status: string;
  original_contract: string;
  approved_cos: string;
  est_total_cost: string;
  original_gp_pct: string;
  notes: string;
}

interface JobFormProps {
  initialValues?: Partial<JobFormFields>;
  onSubmit: (payload: Record<string, unknown>) => void;
  submitting: boolean;
  onCancel: () => void;
  submitLabel?: string;
}

const defaults: JobFormFields = {
  job_number: "",
  job_name: "",
  job_type: "Fixed Fee",
  status: "Active",
  original_contract: "",
  approved_cos: "",
  est_total_cost: "",
  original_gp_pct: "",
  notes: "",
};

function toNum(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function JobForm({
  initialValues,
  onSubmit,
  submitting,
  onCancel,
  submitLabel = "Save Job",
}: JobFormProps) {
  const [form, setForm] = useState<JobFormFields>({ ...defaults, ...initialValues });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // Live-calculated fields
  const originalContract = toNum(form.original_contract);
  const approvedCOs = toNum(form.approved_cos);
  const estTotalCost = toNum(form.est_total_cost);
  const revisedContract = originalContract + approvedCOs;
  const estGpPct =
    revisedContract > 0
      ? ((revisedContract - estTotalCost) / revisedContract) * 100
      : 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      job_number: form.job_number,
      job_name: form.job_name,
      job_type: form.job_type,
      status: form.status,
      original_contract: toNum(form.original_contract),
      approved_cos: toNum(form.approved_cos),
      est_total_cost: toNum(form.est_total_cost),
      original_gp_pct: toNum(form.original_gp_pct),
      notes: form.notes === "" ? null : form.notes,
    });
  }

  const inputClass =
    "w-full bg-white border border-[#E5E7EB] text-[#1A1A1A] rounded px-3 py-2 focus:outline-none focus:border-[#1B2A4A] placeholder-gray-400";
  const readonlyClass =
    "w-full bg-[#F9FAFB] border border-[#E5E7EB] text-[#1A1A1A] rounded px-3 py-2 font-semibold";
  const labelClass = "block text-sm text-[#374151] mb-1";

  return (
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
      </div>

      {/* Contract */}
      <div>
        <h2 className="text-lg font-semibold text-[#1B2A4A] mb-3">Contract</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Original Contract ($)</label>
            <input
              type="number"
              name="original_contract"
              value={form.original_contract}
              onChange={handleChange}
              step="0.01"
              placeholder="0.00"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Approved COs ($)</label>
            <input
              type="number"
              name="approved_cos"
              value={form.approved_cos}
              onChange={handleChange}
              step="0.01"
              placeholder="0.00"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Revised Contract (calculated)</label>
            <div className={readonlyClass}>${fmt(revisedContract)}</div>
          </div>
        </div>
      </div>

      {/* Cost & GP */}
      <div>
        <h2 className="text-lg font-semibold text-[#1B2A4A] mb-3">Cost & Gross Profit</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div>
            <label className={labelClass}>Original GP% (budgeted)</label>
            <input
              type="number"
              name="original_gp_pct"
              value={form.original_gp_pct}
              onChange={handleChange}
              step="0.01"
              min="0"
              max="100"
              placeholder="0.00"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Est GP% (calculated)</label>
            <div className={readonlyClass}>{estGpPct.toFixed(2)}%</div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
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

      {/* Actions */}
      <div className="flex gap-4 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="bg-[#1B2A4A] hover:bg-[#243d70] disabled:opacity-50 text-white font-bold px-6 py-2 rounded transition-colors"
        >
          {submitting ? "Saving..." : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-[#E5E7EB] text-[#6B7280] hover:border-[#1B2A4A] hover:text-[#1B2A4A] px-6 py-2 rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
