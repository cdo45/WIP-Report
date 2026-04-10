"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LineItemWithJob, PriorValues, WipReport } from "./page";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function toDateStr(d: string | Date): string {
  return new Date(d).toISOString().slice(0, 10);
}
function fmtPct(n: number) {
  return (n * 100).toFixed(2) + "%";
}
// Strip commas before parsing so comma-formatted strings round-trip correctly
function toNum(s: string) {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
// Format a raw string as a comma-separated dollar value as the user types
function formatDollarInput(raw: string): string {
  const stripped = raw.replace(/[^0-9.-]/g, "");
  if (stripped === "" || stripped === "-") return stripped;
  const [intPart, ...decParts] = stripped.split(".");
  const intNum = parseInt(intPart || "0", 10);
  if (isNaN(intNum)) return stripped;
  const formatted = intNum.toLocaleString("en-US");
  return decParts.length > 0 ? `${formatted}.${decParts[0]}` : formatted;
}

const DOLLAR_FIELDS = new Set([
  "revised_contract", "est_total_cost",
  "costs_to_date", "billings_to_date",
  "cp_costs", "cp_billings",
  "prior_year_earned", "prior_year_billings", "prior_year_costs",
]);

interface Editable {
  revised_contract: string;
  est_total_cost: string;
  costs_to_date: string;
  billings_to_date: string;
  cp_costs: string;
  cp_billings: string;
  pm_pct_override: string;
  prior_year_earned: string;
  prior_year_billings: string;
  prior_year_costs: string;
  notes: string;
}

// All calc logic uses editable values so Rev Contract / Est Cost edits flow live.
// For prior-locked rows the caller supplies effectiveITD instead of reading from
// e.costs_to_date / e.billings_to_date (which are not user-editable in that mode).
function calcRow(
  e: Editable,
  effectiveITD?: { costsToDate: number; billingsToDate: number }
) {
  const revisedContract = toNum(e.revised_contract);
  const estTotalCost = toNum(e.est_total_cost);
  const costsToDate    = effectiveITD?.costsToDate    ?? toNum(e.costs_to_date);
  const billingsToDate = effectiveITD?.billingsToDate ?? toNum(e.billings_to_date);
  const pmStr = e.pm_pct_override.trim();
  const pmOverride = pmStr !== "" ? toNum(pmStr) : null;

  const estGpPct = revisedContract > 0 ? (revisedContract - estTotalCost) / revisedContract : 0;
  const pctComplete = estTotalCost > 0 ? costsToDate / estTotalCost : 0;
  const effectivePct = pmOverride !== null ? pmOverride : pctComplete;
  const earnedRevenue = effectivePct >= 1
    ? Math.max(billingsToDate, revisedContract)
    : effectivePct * revisedContract;
  const overUnder = earnedRevenue - billingsToDate;
  const itdGp = earnedRevenue - costsToDate;
  const itdGpPct = earnedRevenue !== 0 ? itdGp / earnedRevenue : 0;

  const pyEarned = toNum(e.prior_year_earned);
  const pyBillings = toNum(e.prior_year_billings);
  const pyCosts = toNum(e.prior_year_costs);

  const cyEarned = earnedRevenue - pyEarned;
  const cyBillings = billingsToDate - pyBillings;
  const cyCosts = costsToDate - pyCosts;
  const cyGp = cyEarned - cyCosts;

  return {
    revisedContract, estTotalCost, estGpPct,
    costsToDate, billingsToDate,
    pctComplete, effectivePct, earnedRevenue, overUnder,
    itdGp, itdGpPct,
    cyEarned, cyBillings, cyCosts, cyGp,
  };
}

// Variance cell — shows signed delta vs prior period, or "—" if no prior
function DeltaCell({
  current,
  priorVal,
  positiveIsGood,
}: {
  current: number;
  priorVal: number | undefined;
  positiveIsGood: boolean;
}) {
  if (priorVal === undefined) {
    return (
      <td className="px-2 py-1.5 whitespace-nowrap text-xs text-right text-gray-500">—</td>
    );
  }
  const delta = current - priorVal;
  const color =
    delta === 0
      ? "text-gray-500"
      : (delta > 0) === positiveIsGood
      ? "text-green-400"
      : "text-red-400";
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return (
    <td className={`px-2 py-1.5 whitespace-nowrap text-xs text-right font-mono ${color}`}>
      {sign}${fmt$(Math.abs(delta))}
    </td>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WipEditor({
  report,
  initialLineItems,
  priorValues,
}: {
  report: WipReport;
  initialLineItems: LineItemWithJob[];
  priorValues: PriorValues;
}) {
  const router = useRouter();
  const isFinalized = report.status === "final";

  // Keep a stable copy of initialLineItems for Map keying and computed.
  // Render order is determined solely by sortedForRender below.
  const sortedItems = [...initialLineItems];

  const [editState, setEditState] = useState<Map<number, Editable>>(() => {
    const m = new Map<number, Editable>();
    for (const item of sortedItems) {
      m.set(item.id, {
        revised_contract:   formatDollarInput(String(item.revised_contract ?? 0)),
        est_total_cost:     formatDollarInput(String(item.est_total_cost ?? 0)),
        costs_to_date:      formatDollarInput(String(item.costs_to_date ?? 0)),
        billings_to_date:   formatDollarInput(String(item.billings_to_date ?? 0)),
        cp_costs:           formatDollarInput(String(item.cp_costs ?? 0)),
        cp_billings:        formatDollarInput(String(item.cp_billings ?? 0)),
        pm_pct_override:    item.pm_pct_override != null ? String(item.pm_pct_override) : "",
        prior_year_earned:  formatDollarInput(String(item.prior_year_earned ?? 0)),
        prior_year_billings:formatDollarInput(String(item.prior_year_billings ?? 0)),
        prior_year_costs:   formatDollarInput(String(item.prior_year_costs ?? 0)),
        notes:              item.notes ?? "",
      });
    }
    return m;
  });

  const gl1290Ref = useRef(formatDollarInput(String(report.prior_balance_1290 ?? 0)));
  const gl2030Ref = useRef(formatDollarInput(String(report.prior_balance_2030 ?? 0)));
  const [gl1290Str, setGl1290Str] = useState(gl1290Ref.current);
  const [gl2030Str, setGl2030Str] = useState(gl2030Ref.current);

  const [expandedPrior, setExpandedPrior] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"" | "saved" | "error">("");
  const [finalizing, setFinalizing] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  function buildPayload(state: Map<number, Editable>) {
    return Array.from(state.entries()).map(([id, f]) => {
      const item = sortedItems.find((i) => i.id === id);
      const cpCosts    = toNum(f.cp_costs);
      const cpBillings = toNum(f.cp_billings);
      // For locked rows derive ITD from prior baseline + CP entry;
      // for unlocked rows use the directly-editable ITD fields.
      const costsToDate    = item?.is_prior_locked
        ? Number(item.prior_itd_costs)    + cpCosts
        : toNum(f.costs_to_date);
      const billingsToDate = item?.is_prior_locked
        ? Number(item.prior_itd_billings) + cpBillings
        : toNum(f.billings_to_date);
      return {
        id,
        revised_contract:    toNum(f.revised_contract),
        est_total_cost:      toNum(f.est_total_cost),
        cp_costs:            cpCosts,
        cp_billings:         cpBillings,
        costs_to_date:       costsToDate,
        billings_to_date:    billingsToDate,
        pm_pct_override:     f.pm_pct_override.trim() !== "" ? toNum(f.pm_pct_override) : null,
        prior_year_earned:   toNum(f.prior_year_earned),
        prior_year_billings: toNum(f.prior_year_billings),
        prior_year_costs:    toNum(f.prior_year_costs),
        notes:               f.notes.trim() !== "" ? f.notes : null,
      };
    });
  }

  async function doSave(state: Map<number, Editable>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/wip-reports/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItems: buildPayload(state),
          prior_balance_1290: toNum(gl1290Ref.current),
          prior_balance_2030: toNum(gl2030Ref.current),
        }),
      });
      const data = await res.json().catch(() => ({}));
      // 207 = partial save (some rows had errors) — treat as failure
      const success = res.ok && data.ok !== false;
      if (!success) {
        console.error("Save failed:", data);
      }
      setSaveStatus(success ? "saved" : "error");
    } catch (err) {
      console.error("Save error:", err);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  function handleChange(itemId: number, field: keyof Editable, value: string) {
    setSaveStatus("");
    const formatted = DOLLAR_FIELDS.has(field) ? formatDollarInput(value) : value;
    setEditState((prev) => {
      const next = new Map(prev);
      next.set(itemId, { ...prev.get(itemId)!, [field]: formatted });
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => doSave(next), 1000);
      return next;
    });
  }

  function handleGlChange(field: "1290" | "2030", value: string) {
    setSaveStatus("");
    const formatted = formatDollarInput(value);
    if (field === "1290") {
      setGl1290Str(formatted);
      gl1290Ref.current = formatted;
    } else {
      setGl2030Str(formatted);
      gl2030Ref.current = formatted;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(editState), 1000);
  }

  function togglePrior(itemId: number) {
    setExpandedPrior((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) { next.delete(itemId); } else { next.add(itemId); }
      return next;
    });
  }

  async function handleFinalize() {
    if (
      !confirm(
        `Finalize WIP Report for ${toDateStr(report.period_date)}?\n\n` +
        `This cannot be undone — all fields will become read-only.`
      )
    ) return;

    setFinalizing(true);
    try {
      const res = await fetch(`/api/wip-reports/${report.id}/finalize`, { method: "POST" });
      if (res.ok) router.refresh();
      else alert("Failed to finalize report.");
    } catch {
      alert("Failed to finalize report.");
    } finally {
      setFinalizing(false);
    }
  }

  // Compute all rows — uses editState so calcs are live.
  // Locked rows: ITD = prior baseline + current-period entry.
  const computed = sortedItems.map((item) => {
    const editable = editState.get(item.id)!;
    const effectiveITD = item.is_prior_locked
      ? {
          costsToDate:    Number(item.prior_itd_costs)    + toNum(editable.cp_costs),
          billingsToDate: Number(item.prior_itd_billings) + toNum(editable.cp_billings),
        }
      : undefined;
    return { item, editable, ...calcRow(editable, effectiveITD) };
  });

  // Summary totals
  const totalUnderbillings = computed.reduce((s, r) => s + Math.max(0, r.overUnder), 0);
  const totalOverbillings  = computed.reduce((s, r) => s + Math.max(0, -r.overUnder), 0);
  const netOverUnder       = totalUnderbillings - totalOverbillings;
  const totalBacklog       = computed.reduce((s, r) => s + (r.revisedContract - r.earnedRevenue), 0);
  const totalCyRevenue     = computed.reduce((s, r) => s + r.cyEarned, 0);
  const totalCyCosts       = computed.reduce((s, r) => s + r.cyCosts, 0);
  const totalCyGp          = totalCyRevenue - totalCyCosts;

  // GL reconciliation values
  const gl1290Num = toNum(gl1290Str);
  const gl2030Num = toNum(gl2030Str);
  // adj = should_be - current_balance
  // 1290 should-be = totalUnderbillings (positive asset)
  // 2030 should-be = -totalOverbillings (negative liability)
  const adj1290 = totalUnderbillings - gl1290Num;
  const adj2030 = -totalOverbillings - gl2030Num;
  const netAdj  = adj1290 + adj2030;

  // ── Styles ────────────────────────────────────────────────────────────────
  const th = "px-2 py-2.5 text-left text-xs font-semibold whitespace-nowrap text-[#C9A84C] bg-[#0f1e38]";
  const td = "px-2 py-1.5 whitespace-nowrap text-xs text-right text-gray-200";
  const tdL = "px-2 py-1.5 whitespace-nowrap text-xs";
  const inp = "w-full bg-[#162a50] border border-[#2e4a7a] text-white text-right rounded px-2 py-0.5 text-xs focus:outline-none focus:border-[#C9A84C]";
  const COLS = 24;

  // Final render sort — numeric dash-split: 2024-07 < 2025-01 < 2025-05
  const sortedForRender = [...computed].sort((a, b) => {
    const aParts = a.item.job_number.split("-").map(Number);
    const bParts = b.item.job_number.split("-").map(Number);
    if (aParts[0] !== bParts[0]) return aParts[0] - bParts[0];
    return (aParts[1] ?? 0) - (bParts[1] ?? 0);
  });

  return (
    <div className="px-4 py-6">
      <div className="max-w-screen-2xl mx-auto">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <Link href="/wip" className="text-xs text-gray-400 hover:text-[#C9A84C] mb-1 inline-block">
              ← WIP Reports
            </Link>
            <h1 className="text-2xl font-bold">
              WIP Report{" "}
              <span className="text-[#C9A84C]">{toDateStr(report.period_date)}</span>
            </h1>
          </div>
          <div className="flex items-center gap-4 pt-1">
            {saving && <span className="text-xs text-gray-400">Saving…</span>}
            {!saving && saveStatus === "saved"  && <span className="text-xs text-green-400">Saved</span>}
            {!saving && saveStatus === "error"  && <span className="text-xs text-red-400">Save failed</span>}
            {isFinalized ? (
              <span className="bg-blue-900 text-blue-300 px-3 py-1 rounded text-sm font-semibold">
                Finalized
              </span>
            ) : (
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className="bg-[#C9A84C] hover:bg-[#b8953e] disabled:opacity-50 text-[#1F3864] font-bold px-5 py-2 rounded transition-colors"
              >
                {finalizing ? "Finalizing…" : "Finalize Report"}
              </button>
            )}
          </div>
        </div>

        {/* ── Main table ─────────────────────────────────────────────────── */}
        <div className="overflow-x-auto rounded-lg border border-[#2e4a7a] mb-8">
          <table className="text-sm border-collapse" style={{ minWidth: "max-content" }}>
            <thead>
              <tr>
                <th className={`${th} sticky left-0 z-20 w-[72px]`}>Job #</th>
                <th className={`${th} sticky left-[72px] z-20 min-w-[150px]`}>Job Name</th>
                <th className={`${th} text-right min-w-[130px]`}>Rev Contract</th>
                <th className={`${th} text-right min-w-[80px]`}>Δ Rev</th>
                <th className={`${th} text-right min-w-[120px]`}>Est Cost</th>
                <th className={`${th} text-right min-w-[90px]`}>Δ Est Cost</th>
                <th className={`${th} text-right min-w-[72px]`}>Est GP%</th>
                <th className={`${th} text-right min-w-[120px]`}>CP Costs</th>
                <th className={`${th} text-right min-w-[120px]`}>CP Billings</th>
                <th className={`${th} text-right min-w-[130px]`}>Costs ITD</th>
                <th className={`${th} text-right min-w-[130px]`}>Billings ITD</th>
                <th className={`${th} text-right min-w-[72px]`}>% Comp</th>
                <th className={`${th} text-right min-w-[100px]`}>PM% Ovrd</th>
                <th className={`${th} text-right min-w-[72px]`}>Eff %</th>
                <th className={`${th} text-right min-w-[120px]`}>Earned Rev</th>
                <th className={`${th} text-right min-w-[110px]`}>Over/Under</th>
                <th className={`${th} text-right min-w-[110px]`}>ITD GP $</th>
                <th className={`${th} text-right min-w-[72px]`}>ITD GP%</th>
                <th className={`${th} text-right min-w-[100px]`}>CY Earned</th>
                <th className={`${th} text-right min-w-[100px]`}>CY Billings</th>
                <th className={`${th} text-right min-w-[100px]`}>CY Costs</th>
                <th className={`${th} text-right min-w-[100px]`}>CY GP $</th>
                <th className={`${th} min-w-[140px]`}>Notes</th>
                <th className={`${th} text-center min-w-[54px]`}>Prior</th>
              </tr>
            </thead>
            <tbody>
              {sortedForRender.map(
                (
                  {
                    item, editable,
                    revisedContract, estTotalCost, estGpPct,
                    costsToDate, billingsToDate,
                    pctComplete, effectivePct, earnedRevenue, overUnder,
                    itdGp, itdGpPct,
                    cyEarned, cyBillings, cyCosts, cyGp,
                  },
                  i
                ) => {
                  const rowBg    = i % 2 === 0 ? "bg-[#1a3260]" : "bg-[#1F3864]";
                  const stickyBg = i % 2 === 0 ? "bg-[#1a3260]" : "bg-[#1F3864]";
                  const ouColor  = overUnder >= 0 ? "text-green-400" : "text-red-400";
                  const priorOpen = expandedPrior.has(item.id);

                  return (
                    <Fragment key={item.id}>
                      <tr className={`${rowBg} hover:bg-[#243d70] transition-colors`}>
                        {/* Sticky: Job # */}
                        <td className={`${tdL} sticky left-0 z-10 ${stickyBg} font-mono`}>
                          {item.job_number}
                        </td>
                        {/* Sticky: Job Name */}
                        <td className={`${tdL} sticky left-[72px] z-10 ${stickyBg} max-w-[150px] truncate`}>
                          {item.job_name}
                        </td>

                        {/* Editable: Rev Contract */}
                        <td className="px-1 py-0.5 whitespace-nowrap">
                          {isFinalized ? (
                            <span className={td}>${fmt$(revisedContract)}</span>
                          ) : (
                            <input
                              type="text"
                              value={editable.revised_contract}
                              onChange={(e) => handleChange(item.id, "revised_contract", e.target.value)}
                              className={inp}
                            />
                          )}
                        </td>

                        {/* Variance: Δ Rev Contract */}
                        <DeltaCell
                          current={revisedContract}
                          priorVal={priorValues[item.job_id]?.revised_contract}
                          positiveIsGood={true}
                        />

                        {/* Editable: Est Cost */}
                        <td className="px-1 py-0.5 whitespace-nowrap">
                          {isFinalized ? (
                            <span className={td}>${fmt$(estTotalCost)}</span>
                          ) : (
                            <input
                              type="text"
                              value={editable.est_total_cost}
                              onChange={(e) => handleChange(item.id, "est_total_cost", e.target.value)}
                              className={inp}
                            />
                          )}
                        </td>

                        {/* Variance: Δ Est Cost */}
                        <DeltaCell
                          current={estTotalCost}
                          priorVal={priorValues[item.job_id]?.est_total_cost}
                          positiveIsGood={false}
                        />

                        {/* Calc: Est GP% */}
                        <td className={td}>{fmtPct(estGpPct)}</td>

                        {/* CP Costs — editable for locked rows, dash for unlocked */}
                        <td className="px-1 py-0.5 whitespace-nowrap">
                          {item.is_prior_locked ? (
                            isFinalized ? (
                              <span className={td}>${fmt$(toNum(editable.cp_costs))}</span>
                            ) : (
                              <input
                                type="text"
                                value={editable.cp_costs}
                                onChange={(e) => handleChange(item.id, "cp_costs", e.target.value)}
                                className={inp}
                              />
                            )
                          ) : (
                            <span className={`${td} text-gray-600`}>—</span>
                          )}
                        </td>

                        {/* CP Billings — editable for locked rows, dash for unlocked */}
                        <td className="px-1 py-0.5 whitespace-nowrap">
                          {item.is_prior_locked ? (
                            isFinalized ? (
                              <span className={td}>${fmt$(toNum(editable.cp_billings))}</span>
                            ) : (
                              <input
                                type="text"
                                value={editable.cp_billings}
                                onChange={(e) => handleChange(item.id, "cp_billings", e.target.value)}
                                className={inp}
                              />
                            )
                          ) : (
                            <span className={`${td} text-gray-600`}>—</span>
                          )}
                        </td>

                        {/* Costs ITD — editable for unlocked, read-only calc for locked */}
                        <td className="px-1 py-0.5 whitespace-nowrap">
                          {item.is_prior_locked ? (
                            <span className={td}>${fmt$(costsToDate)}</span>
                          ) : isFinalized ? (
                            <span className={td}>${fmt$(toNum(editable.costs_to_date))}</span>
                          ) : (
                            <input
                              type="text"
                              value={editable.costs_to_date}
                              onChange={(e) => handleChange(item.id, "costs_to_date", e.target.value)}
                              className={inp}
                            />
                          )}
                        </td>

                        {/* Billings ITD — editable for unlocked, read-only calc for locked */}
                        <td className="px-1 py-0.5 whitespace-nowrap">
                          {item.is_prior_locked ? (
                            <span className={td}>${fmt$(billingsToDate)}</span>
                          ) : isFinalized ? (
                            <span className={td}>${fmt$(toNum(editable.billings_to_date))}</span>
                          ) : (
                            <input
                              type="text"
                              value={editable.billings_to_date}
                              onChange={(e) => handleChange(item.id, "billings_to_date", e.target.value)}
                              className={inp}
                            />
                          )}
                        </td>

                        {/* Calcs */}
                        <td className={td}>{fmtPct(pctComplete)}</td>

                        {/* Editable: PM Override */}
                        <td className="px-1 py-0.5 whitespace-nowrap">
                          {isFinalized ? (
                            <span className={td}>
                              {editable.pm_pct_override !== "" ? fmtPct(toNum(editable.pm_pct_override)) : "—"}
                            </span>
                          ) : (
                            <input
                              type="number" step="0.001" min="0" max="1"
                              value={editable.pm_pct_override}
                              onChange={(e) => handleChange(item.id, "pm_pct_override", e.target.value)}
                              placeholder="—"
                              className={inp}
                            />
                          )}
                        </td>

                        <td className={td}>{fmtPct(effectivePct)}</td>
                        <td className={td}>${fmt$(earnedRevenue)}</td>
                        <td className={`px-2 py-1.5 whitespace-nowrap text-xs text-right font-semibold ${ouColor}`}>
                          {overUnder >= 0 ? "+" : ""}${fmt$(overUnder)}
                        </td>
                        <td className={td}>${fmt$(itdGp)}</td>
                        <td className={td}>{fmtPct(itdGpPct)}</td>
                        <td className={td}>${fmt$(cyEarned)}</td>
                        <td className={td}>${fmt$(cyBillings)}</td>
                        <td className={td}>${fmt$(cyCosts)}</td>
                        <td className={td}>${fmt$(cyGp)}</td>

                        {/* Notes */}
                        <td className="px-1 py-0.5">
                          {isFinalized ? (
                            <span className="text-xs text-gray-300 whitespace-nowrap">
                              {editable.notes || "—"}
                            </span>
                          ) : (
                            <input
                              type="text"
                              value={editable.notes}
                              onChange={(e) => handleChange(item.id, "notes", e.target.value)}
                              placeholder="—"
                              className="w-full bg-[#162a50] border border-[#2e4a7a] text-white rounded px-2 py-0.5 text-xs focus:outline-none focus:border-[#C9A84C]"
                            />
                          )}
                        </td>

                        {/* Prior toggle */}
                        <td className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => togglePrior(item.id)}
                            title="Toggle prior year"
                            className="text-xs text-[#C9A84C] hover:text-[#b8953e] font-bold px-1"
                          >
                            {priorOpen ? "▼" : "▶"}
                          </button>
                        </td>
                      </tr>

                      {/* Prior year expanded row */}
                      {priorOpen && (
                        <tr className="bg-[#0f1e38] border-t border-b border-[#2e4a7a]">
                          <td colSpan={COLS} className="px-5 py-3">
                            <div className="flex flex-wrap items-end gap-6">
                              <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                                Prior Year
                                {item.is_prior_locked && (
                                  <span className="ml-2 text-yellow-500 normal-case">● locked</span>
                                )}
                              </span>

                              {(
                                [
                                  ["prior_year_earned",   "Earned"],
                                  ["prior_year_billings", "Billings"],
                                  ["prior_year_costs",    "Costs"],
                                ] as const
                              ).map(([field, label]) => (
                                <div key={field}>
                                  <div className="text-xs text-gray-400 mb-1">{label}</div>
                                  {item.is_prior_locked || isFinalized ? (
                                    <span className="text-xs text-gray-300 font-mono">
                                      ${fmt$(toNum(editable[field]))}
                                    </span>
                                  ) : (
                                    <input
                                      type="text"
                                      value={editable[field]}
                                      onChange={(e) => handleChange(item.id, field, e.target.value)}
                                      className="w-36 bg-[#162a50] border border-[#2e4a7a] text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C9A84C] text-right"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                }
              )}
            </tbody>
          </table>
        </div>

        {/* ── Summary panels ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Billings position */}
          <div className="bg-[#162a50] rounded-lg border border-[#2e4a7a] p-5">
            <h2 className="text-[#C9A84C] font-semibold mb-4">Billings Position</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-300">
                  Underbillings{" "}
                  <span className="text-gray-500 text-xs">(Asset — Acct 1290)</span>
                </dt>
                <dd className="font-mono text-green-400 font-semibold">${fmt$(totalUnderbillings)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-300">
                  Overbillings{" "}
                  <span className="text-gray-500 text-xs">(Liability — Acct 2030)</span>
                </dt>
                <dd className="font-mono text-red-400 font-semibold">${fmt$(totalOverbillings)}</dd>
              </div>
              <div className="flex justify-between border-t border-[#2e4a7a] pt-2">
                <dt className="font-semibold">Net Over/Under</dt>
                <dd className={`font-mono font-semibold ${netOverUnder >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {netOverUnder >= 0 ? "+" : ""}${fmt$(netOverUnder)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-300">Total Backlog</dt>
                <dd className="font-mono text-white">${fmt$(totalBacklog)}</dd>
              </div>
            </dl>
          </div>

          {/* Current year */}
          <div className="bg-[#162a50] rounded-lg border border-[#2e4a7a] p-5">
            <h2 className="text-[#C9A84C] font-semibold mb-4">Current Year</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-300">CY Revenue</dt>
                <dd className="font-mono text-white">${fmt$(totalCyRevenue)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-300">CY Costs</dt>
                <dd className="font-mono text-white">${fmt$(totalCyCosts)}</dd>
              </div>
              <div className="flex justify-between border-t border-[#2e4a7a] pt-2">
                <dt className="font-semibold">CY Gross Profit</dt>
                <dd className={`font-mono font-semibold ${totalCyGp >= 0 ? "text-green-400" : "text-red-400"}`}>
                  ${fmt$(totalCyGp)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* ── Journal entry ──────────────────────────────────────────────── */}
        <div className="bg-[#162a50] rounded-lg border border-[#2e4a7a] p-5 mb-6">
          <h2 className="text-[#C9A84C] font-semibold mb-4">Auto-Generated Journal Entry</h2>

          {/* Reconciliation table */}
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2e4a7a]">
                  <th className="text-left py-2 pr-6 text-gray-400 font-semibold">Account</th>
                  <th className="text-right py-2 px-4 text-gray-400 font-semibold">Current Balance</th>
                  <th className="text-right py-2 px-4 text-gray-400 font-semibold">Should Be</th>
                  <th className="text-right py-2 pl-4 text-gray-400 font-semibold">Adjustment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#243d70]">
                <tr>
                  <td className="py-2 pr-6 text-gray-300">1290 Costs in Excess</td>
                  <td className="py-2 px-4 text-right font-mono text-gray-200">${fmt$(gl1290Num)}</td>
                  <td className="py-2 px-4 text-right font-mono text-green-400">${fmt$(totalUnderbillings)}</td>
                  <td className={`py-2 pl-4 text-right font-mono font-semibold ${adj1290 >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {adj1290 >= 0 ? "+" : "-"}${fmt$(Math.abs(adj1290))}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-6 text-gray-300">2030 Billings in Excess</td>
                  <td className="py-2 px-4 text-right font-mono text-gray-200">
                    {gl2030Num < 0 ? "-" : ""}${fmt$(Math.abs(gl2030Num))}
                  </td>
                  <td className="py-2 px-4 text-right font-mono text-red-400">-${fmt$(totalOverbillings)}</td>
                  <td className={`py-2 pl-4 text-right font-mono font-semibold ${adj2030 >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {adj2030 >= 0 ? "+" : "-"}${fmt$(Math.abs(adj2030))}
                  </td>
                </tr>
                <tr className="border-t-2 border-[#2e4a7a]">
                  <td className="py-2 pr-6 text-gray-300">401510 WIP Revenue</td>
                  <td className="py-2 px-4 text-right font-mono text-gray-500">—</td>
                  <td className="py-2 px-4 text-right font-mono text-gray-500">—</td>
                  <td className={`py-2 pl-4 text-right font-mono font-bold ${netAdj >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {netAdj >= 0 ? "+" : "-"}${fmt$(Math.abs(netAdj))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* JE entries */}
          <div className="font-mono text-sm space-y-1">
            {adj1290 > 0 && (
              <>
                <div className="flex gap-6">
                  <span className="text-gray-400 w-6">DR</span>
                  <span className="flex-1">1290 Costs in Excess of Billings</span>
                  <span className="text-green-400">${fmt$(adj1290)}</span>
                </div>
                <div className="flex gap-6">
                  <span className="text-gray-400 w-6">CR</span>
                  <span className="flex-1">401510 WIP Revenue Recognized</span>
                  <span className="text-green-400">${fmt$(adj1290)}</span>
                </div>
              </>
            )}
            {adj1290 < 0 && (
              <>
                <div className="flex gap-6">
                  <span className="text-gray-400 w-6">DR</span>
                  <span className="flex-1">401510 WIP Revenue Recognized</span>
                  <span className="text-red-400">${fmt$(Math.abs(adj1290))}</span>
                </div>
                <div className="flex gap-6">
                  <span className="text-gray-400 w-6">CR</span>
                  <span className="flex-1">1290 Costs in Excess of Billings</span>
                  <span className="text-red-400">${fmt$(Math.abs(adj1290))}</span>
                </div>
              </>
            )}
            {adj2030 > 0 && (
              <>
                <div className={`flex gap-6${adj1290 !== 0 ? " mt-2" : ""}`}>
                  <span className="text-gray-400 w-6">DR</span>
                  <span className="flex-1">2030 Billings in Excess of Costs</span>
                  <span className="text-green-400">${fmt$(adj2030)}</span>
                </div>
                <div className="flex gap-6">
                  <span className="text-gray-400 w-6">CR</span>
                  <span className="flex-1">401510 WIP Revenue Recognized</span>
                  <span className="text-green-400">${fmt$(adj2030)}</span>
                </div>
              </>
            )}
            {adj2030 < 0 && (
              <>
                <div className={`flex gap-6${adj1290 !== 0 ? " mt-2" : ""}`}>
                  <span className="text-gray-400 w-6">DR</span>
                  <span className="flex-1">401510 WIP Revenue Recognized</span>
                  <span className="text-red-400">${fmt$(Math.abs(adj2030))}</span>
                </div>
                <div className="flex gap-6">
                  <span className="text-gray-400 w-6">CR</span>
                  <span className="flex-1">2030 Billings in Excess of Costs</span>
                  <span className="text-red-400">${fmt$(Math.abs(adj2030))}</span>
                </div>
              </>
            )}
            {adj1290 === 0 && adj2030 === 0 && (
              <span className="text-gray-500 italic">No adjustments needed.</span>
            )}
            <div className="flex gap-6 border-t border-[#2e4a7a] pt-2 mt-2">
              <span className="text-gray-500 w-6" />
              <span className="text-gray-400 flex-1">Net P&amp;L Impact</span>
              <span className={netAdj >= 0 ? "text-green-400" : "text-red-400"}>
                {netAdj >= 0 ? "+" : "-"}${fmt$(Math.abs(netAdj))}
              </span>
            </div>
          </div>
        </div>

        {/* ── GL Reconciliation ──────────────────────────────────────────── */}
        <div className="bg-[#162a50] rounded-lg border border-[#2e4a7a] p-5 mb-8">
          <h2 className="text-[#C9A84C] font-semibold mb-4">GL Reconciliation</h2>
          <div className="flex flex-wrap gap-8">
            <div>
              <div className="text-xs text-gray-400 mb-1.5">Current GL Balance — 1290 Costs in Excess</div>
              {isFinalized ? (
                <span className="text-sm font-mono text-gray-200">${fmt$(gl1290Num)}</span>
              ) : (
                <input
                  type="text"
                  value={gl1290Str}
                  onChange={(e) => handleGlChange("1290", e.target.value)}
                  className="w-48 bg-[#0f1e38] border border-[#2e4a7a] text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#C9A84C] text-right"
                />
              )}
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1.5">Current GL Balance — 2030 Billings in Excess</div>
              {isFinalized ? (
                <span className="text-sm font-mono text-gray-200">
                  {gl2030Num < 0 ? "-" : ""}${fmt$(Math.abs(gl2030Num))}
                </span>
              ) : (
                <input
                  type="text"
                  value={gl2030Str}
                  onChange={(e) => handleGlChange("2030", e.target.value)}
                  className="w-48 bg-[#0f1e38] border border-[#2e4a7a] text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#C9A84C] text-right"
                />
              )}
            </div>
          </div>
          {!isFinalized && (
            <p className="text-xs text-gray-500 mt-3">
              Enter the current GL balance for each account. For 2030 (credit/liability), enter a negative value (e.g., -12,500.00).
            </p>
          )}
        </div>

        {/* ── Bottom finalize ────────────────────────────────────────────── */}
        {!isFinalized && (
          <div className="flex justify-end">
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              className="bg-[#C9A84C] hover:bg-[#b8953e] disabled:opacity-50 text-[#1F3864] font-bold px-6 py-2.5 rounded transition-colors"
            >
              {finalizing ? "Finalizing…" : "Finalize Report"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
