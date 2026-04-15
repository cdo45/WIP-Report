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

  // Period O/U = change in over/under position this period only
  // = cy_earned - cy_billings = (earnedRev - pyEarned) - (billingsToDate - pyBillings)
  const periodOverUnder = cyEarned - cyBillings;

  return {
    revisedContract, estTotalCost, estGpPct,
    costsToDate, billingsToDate,
    pctComplete, effectivePct, earnedRevenue, overUnder,
    periodOverUnder,
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
      <td className="px-2 py-1.5 whitespace-nowrap text-xs text-right text-gray-400">—</td>
    );
  }
  const delta = current - priorVal;
  const color =
    delta === 0
      ? "text-gray-400"
      : (delta > 0) === positiveIsGood
      ? "text-[#16A34A]"
      : "text-[#B22234]";
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return (
    <td className={`px-2 py-1.5 whitespace-nowrap text-xs text-right font-mono ${color}`}>
      {sign}${fmt$(Math.abs(delta))}
    </td>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: number;
  job_number: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

interface SnapshotMeta {
  id: number;
  created_at: string;
  reason: string;
}

const FIELD_LABELS: Record<string, string> = {
  revised_contract:    "Revised Contract",
  est_total_cost:      "Est. Total Cost",
  cp_costs:            "CP Costs",
  cp_billings:         "CP Billings",
  costs_to_date:       "Costs ITD",
  billings_to_date:    "Billings ITD",
  pm_pct_override:     "PM% Override",
  notes:               "Notes",
  prior_year_earned:   "Prior Year Earned",
  prior_year_billings: "Prior Year Billings",
  prior_year_costs:    "Prior Year Costs",
  prior_balance_1290:  "GL Balance 1290",
  prior_balance_2030:  "GL Balance 2030",
  snapshot_restore:    "Snapshot Restore",
};

export default function WipEditor({
  report,
  initialLineItems,
  priorValues,
  autoEdit = false,
}: {
  report: WipReport;
  initialLineItems: LineItemWithJob[];
  priorValues: PriorValues;
  autoEdit?: boolean;
}) {
  const router = useRouter();
  const isFinalized = report.status === "final";

  // sortedItems is the authoritative list; updated when jobs are added dynamically.
  const [sortedItems, setSortedItems] = useState<LineItemWithJob[]>(initialLineItems);

  const [editState, setEditState] = useState<Map<number, Editable>>(() => {
    const m = new Map<number, Editable>();
    for (const item of initialLineItems) {
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

  const [editingFinalized, setEditingFinalized] = useState(false);
  const [enteringEdit, setEnteringEdit] = useState(false);
  const [reFinalizing, setReFinalizing] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false);
  const [snapshotsExpanded, setSnapshotsExpanded] = useState(false);
  const hasAutoEdited = useRef(false);

  // Add Job modal state
  interface AvailableJob { id: number; job_number: string; job_name: string; status: string; }
  const [addJobOpen, setAddJobOpen]         = useState(false);
  const [availableJobs, setAvailableJobs]   = useState<AvailableJob[]>([]);
  const [jobFilter, setJobFilter]           = useState("");
  const [addingJobId, setAddingJobId]       = useState<number | null>(null);
  const [addJobError, setAddJobError]       = useState<string | null>(null);

  const isEditable = !isFinalized || editingFinalized;

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

  async function doSave(state: Map<number, Editable>, isFinalizedEdit = false) {
    setSaving(true);
    try {
      const res = await fetch(`/api/wip-reports/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItems: buildPayload(state),
          prior_balance_1290: toNum(gl1290Ref.current),
          prior_balance_2030: toNum(gl2030Ref.current),
          is_finalized_edit: isFinalizedEdit,
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
      if (!editingFinalized) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => doSave(next), 1000);
      }
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
    if (!editingFinalized) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => doSave(editState), 1000);
    }
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

  async function handleEnterEdit() {
    setEnteringEdit(true);
    try {
      await fetch(`/api/wip-reports/${report.id}/snapshot`, { method: "POST" });
      setSnapshotsLoaded(false);
      setEditingFinalized(true);
      setSaveStatus("");
    } catch {
      alert("Failed to take snapshot before editing.");
    } finally {
      setEnteringEdit(false);
    }
  }

  function handleCancelEdit() {
    const m = new Map<number, Editable>();
    for (const item of sortedItems) {
      m.set(item.id, {
        revised_contract:    formatDollarInput(String(item.revised_contract ?? 0)),
        est_total_cost:      formatDollarInput(String(item.est_total_cost ?? 0)),
        costs_to_date:       formatDollarInput(String(item.costs_to_date ?? 0)),
        billings_to_date:    formatDollarInput(String(item.billings_to_date ?? 0)),
        cp_costs:            formatDollarInput(String(item.cp_costs ?? 0)),
        cp_billings:         formatDollarInput(String(item.cp_billings ?? 0)),
        pm_pct_override:     item.pm_pct_override != null ? String(item.pm_pct_override) : "",
        prior_year_earned:   formatDollarInput(String(item.prior_year_earned ?? 0)),
        prior_year_billings: formatDollarInput(String(item.prior_year_billings ?? 0)),
        prior_year_costs:    formatDollarInput(String(item.prior_year_costs ?? 0)),
        notes:               item.notes ?? "",
      });
    }
    setEditState(m);
    gl1290Ref.current = formatDollarInput(String(report.prior_balance_1290 ?? 0));
    gl2030Ref.current = formatDollarInput(String(report.prior_balance_2030 ?? 0));
    setGl1290Str(gl1290Ref.current);
    setGl2030Str(gl2030Ref.current);
    setEditingFinalized(false);
    setSaveStatus("");
  }

  async function handleReFinalize() {
    if (!confirm("Save all changes and keep this report finalized?\nAll changes will be logged to the audit trail.")) return;
    setReFinalizing(true);
    try {
      const res = await fetch(`/api/wip-reports/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItems: buildPayload(editState),
          prior_balance_1290: toNum(gl1290Ref.current),
          prior_balance_2030: toNum(gl2030Ref.current),
          is_finalized_edit: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const success = res.ok && data.ok !== false;
      if (success) {
        setEditingFinalized(false);
        setSaveStatus("saved");
        loadAuditLog(true);
      } else {
        alert("Save failed. Check console for details.");
        setSaveStatus("error");
      }
    } catch {
      alert("Save failed.");
      setSaveStatus("error");
    } finally {
      setReFinalizing(false);
    }
  }

  async function loadAuditLog(force = false) {
    if (auditLoaded && !force) return;
    try {
      const res = await fetch(`/api/wip-reports/${report.id}/audit`);
      const data = await res.json();
      setAuditEntries(Array.isArray(data) ? data : []);
      setAuditLoaded(true);
    } catch {
      console.error("Failed to load audit log");
    }
  }

  async function loadSnapshots() {
    if (snapshotsLoaded) return;
    try {
      const res = await fetch(`/api/wip-reports/${report.id}/snapshots`);
      const data = await res.json();
      setSnapshots(Array.isArray(data) ? data : []);
      setSnapshotsLoaded(true);
    } catch {
      console.error("Failed to load snapshots");
    }
  }

  async function handleRestore(snapshotId: number) {
    if (!confirm("Restore this snapshot? This will overwrite current values.")) return;
    try {
      const res = await fetch(
        `/api/wip-reports/${report.id}/snapshots/${snapshotId}/restore`,
        { method: "POST" }
      );
      if (res.ok) {
        router.refresh();
      } else {
        alert("Failed to restore snapshot.");
      }
    } catch {
      alert("Failed to restore snapshot.");
    }
  }

  async function handleOpenAddJob() {
    setAddJobError(null);
    setJobFilter("");
    setAddJobOpen(true);
    try {
      const res  = await fetch("/api/jobs");
      const data = await res.json();
      // Filter to active jobs not already in this report
      const existingIds = new Set(sortedItems.map((i) => i.job_id));
      const available   = (data as AvailableJob[]).filter(
        (j) => j.status === "Active" && !existingIds.has(j.id)
      );
      // Sort by job_number
      available.sort((a, b) =>
        a.job_number.localeCompare(b.job_number, undefined, { numeric: true })
      );
      setAvailableJobs(available);
    } catch {
      setAddJobError("Failed to load jobs.");
    }
  }

  async function handleAddJob(jobId: number) {
    setAddingJobId(jobId);
    setAddJobError(null);
    try {
      const res = await fetch(`/api/wip-reports/${report.id}/line-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAddJobError(d.error ?? "Failed to add job.");
        return;
      }
      const newItem = await res.json() as LineItemWithJob;

      // Append to items list and initialize editable state
      setSortedItems((prev) => [...prev, newItem]);
      setEditState((prev) => {
        const next = new Map(prev);
        next.set(newItem.id, {
          revised_contract:    formatDollarInput(String(newItem.revised_contract   ?? 0)),
          est_total_cost:      formatDollarInput(String(newItem.est_total_cost     ?? 0)),
          costs_to_date:       formatDollarInput(String(newItem.costs_to_date      ?? 0)),
          billings_to_date:    formatDollarInput(String(newItem.billings_to_date   ?? 0)),
          cp_costs:            formatDollarInput(String(newItem.cp_costs           ?? 0)),
          cp_billings:         formatDollarInput(String(newItem.cp_billings        ?? 0)),
          pm_pct_override:     newItem.pm_pct_override != null ? String(newItem.pm_pct_override) : "",
          prior_year_earned:   formatDollarInput(String(newItem.prior_year_earned  ?? 0)),
          prior_year_billings: formatDollarInput(String(newItem.prior_year_billings ?? 0)),
          prior_year_costs:    formatDollarInput(String(newItem.prior_year_costs   ?? 0)),
          notes:               newItem.notes ?? "",
        });
        return next;
      });

      // Remove from available list
      setAvailableJobs((prev) => prev.filter((j) => j.id !== jobId));
      setAddJobOpen(false);
    } catch {
      setAddJobError("Failed to add job.");
    } finally {
      setAddingJobId(null);
    }
  }

  // Auto-enter edit mode when navigated with ?edit=1
  useEffect(() => {
    if (autoEdit && isFinalized && !hasAutoEdited.current) {
      hasAutoEdited.current = true;
      handleEnterEdit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePrint() {
    const dateStr = toDateStr(report.period_date);
    const generatedAt = new Date().toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    // Recompute fresh sorted rows for the print snapshot
    const rows = [...computed].sort((a, b) => {
      const ap = a.item.job_number.split("-").map(Number);
      const bp = b.item.job_number.split("-").map(Number);
      if (ap[0] !== bp[0]) return ap[0] - bp[0];
      return (ap[1] ?? 0) - (bp[1] ?? 0);
    });

    const inProgress = rows.filter((r) => r.pctComplete < 1.0);
    const completed   = rows.filter((r) => r.pctComplete >= 1.0);

    // Aggregate totals helper
    function totals(set: typeof rows) {
      return set.reduce(
        (s, r) => ({
          rev:       s.rev       + r.revisedContract,
          cost:      s.cost      + r.estTotalCost,
          costItd:   s.costItd   + r.costsToDate,
          billItd:   s.billItd   + r.billingsToDate,
          earned:    s.earned    + r.earnedRevenue,
          periodOU:  s.periodOU  + r.periodOverUnder,
          ou:        s.ou        + r.overUnder,
          itdGp:     s.itdGp     + r.itdGp,
        }),
        { rev: 0, cost: 0, costItd: 0, billItd: 0, earned: 0, periodOU: 0, ou: 0, itdGp: 0 }
      );
    }

    const d = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pct = (n: number) => (n * 100).toFixed(1) + "%";

    function jobRows(set: typeof rows): string {
      return set.map((r) => {
        const pOuCls = r.periodOverUnder >= 0 ? "pos" : "neg";
        const ouCls  = r.overUnder >= 0 ? "pos" : "neg";
        return `<tr>
          <td>${r.item.job_number}</td>
          <td>${r.item.job_name}</td>
          <td class="num">$${d(r.revisedContract)}</td>
          <td class="num">$${d(r.estTotalCost)}</td>
          <td class="num">${pct(r.estGpPct)}</td>
          <td class="num">$${d(r.costsToDate)}</td>
          <td class="num">$${d(r.billingsToDate)}</td>
          <td class="num">${pct(r.pctComplete)}</td>
          <td class="num">$${d(r.earnedRevenue)}</td>
          <td class="num ${pOuCls}">${r.periodOverUnder >= 0 ? "+" : ""}$${d(r.periodOverUnder)}</td>
          <td class="num ${ouCls}">${r.overUnder >= 0 ? "+" : ""}$${d(r.overUnder)}</td>
          <td class="num">$${d(r.itdGp)}</td>
          <td class="num">${pct(r.itdGpPct)}</td>
        </tr>`;
      }).join("");
    }

    function totalRow(t: ReturnType<typeof totals>): string {
      const pOuCls   = t.periodOU >= 0 ? "pos" : "neg";
      const ouCls    = t.ou >= 0 ? "pos" : "neg";
      const itdGpPct = t.earned !== 0 ? t.itdGp / t.earned : 0;
      const estGpPct = t.rev > 0 ? (t.rev - t.cost) / t.rev : 0;
      return `<tr class="total-row">
        <td colspan="2">TOTAL</td>
        <td class="num">$${d(t.rev)}</td>
        <td class="num">$${d(t.cost)}</td>
        <td class="num">${pct(estGpPct)}</td>
        <td class="num">$${d(t.costItd)}</td>
        <td class="num">$${d(t.billItd)}</td>
        <td class="num">—</td>
        <td class="num">$${d(t.earned)}</td>
        <td class="num ${pOuCls}">${t.periodOU >= 0 ? "+" : ""}$${d(t.periodOU)}</td>
        <td class="num ${ouCls}">${t.ou >= 0 ? "+" : ""}$${d(t.ou)}</td>
        <td class="num">$${d(t.itdGp)}</td>
        <td class="num">${pct(itdGpPct)}</td>
      </tr>`;
    }

    const ipTot = totals(inProgress);
    const cmTot = totals(completed);
    const allTot = totals(rows);

    // Risk flags
    const riskFlags: string[] = [];
    for (const { item, pctComplete, costsToDate, billingsToDate, revisedContract, estTotalCost } of rows) {
      if (pctComplete > 1.0 && estTotalCost > 0)
        riskFlags.push(`<tr><td class="mono">${item.job_number}</td><td>${item.job_name}</td><td>Cost overrun — ${(pctComplete*100).toFixed(0)}% cost complete</td><td class="badge-red">High</td></tr>`);
      const bPct = revisedContract > 0 ? billingsToDate / revisedContract : 0;
      const cPct = estTotalCost > 0 ? costsToDate / estTotalCost : 0;
      if (Math.abs(bPct - cPct) > 0.1 && revisedContract > 5_000)
        riskFlags.push(`<tr><td class="mono">${item.job_number}</td><td>${item.job_name}</td><td>Billing/cost gap: ${(bPct*100).toFixed(0)}% billed vs ${(cPct*100).toFixed(0)}% cost complete</td><td class="badge-yellow">Medium</td></tr>`);
      if (costsToDate > 0 && billingsToDate === 0)
        riskFlags.push(`<tr><td class="mono">${item.job_number}</td><td>${item.job_name}</td><td>Costs incurred with no billings to date</td><td class="badge-yellow">Medium</td></tr>`);
      const hasPrior = Number(item.prior_itd_costs) > 0 || Number(item.prior_itd_billings) > 0;
      if (hasPrior && Number(item.cp_costs) === 0 && Number(item.cp_billings) === 0)
        riskFlags.push(`<tr><td class="mono">${item.job_number}</td><td>${item.job_name}</td><td>No current-period activity</td><td class="badge-yellow">Medium</td></tr>`);
    }

    // GP fade jobs
    const fadedJobs = rows
      .map((r) => {
        const origRevenue = Number(r.item.original_contract) + Number(r.item.approved_cos);
        const origGpPct = origRevenue > 0
          ? ((origRevenue - Number(r.item.job_est_total_cost)) / origRevenue) * 100
          : 0;
        const currGpPct = r.estGpPct * 100;
        return {
          num: r.item.job_number, name: r.item.job_name,
          orig: origGpPct,
          curr: currGpPct,
          delta: currGpPct - origGpPct,
        };
      })
      .filter((j) => j.delta < -5)
      .sort((a, b) => a.delta - b.delta);

    // JE HTML
    function jeLines(): string {
      let out = "";
      if (adj1290 > 0) out += `<div class="je-line"><span class="je-tag">DR</span><span>1290 Costs in Excess of Billings</span><span class="pos ml">$${d(adj1290)}</span></div><div class="je-line"><span class="je-tag">CR</span><span>401510 WIP Revenue Recognized</span><span class="pos ml">$${d(adj1290)}</span></div>`;
      if (adj1290 < 0) out += `<div class="je-line"><span class="je-tag">DR</span><span>401510 WIP Revenue Recognized</span><span class="neg ml">$${d(Math.abs(adj1290))}</span></div><div class="je-line"><span class="je-tag">CR</span><span>1290 Costs in Excess of Billings</span><span class="neg ml">$${d(Math.abs(adj1290))}</span></div>`;
      if (adj2030 > 0) out += `<div class="je-line"><span class="je-tag">DR</span><span>2030 Billings in Excess of Costs</span><span class="pos ml">$${d(adj2030)}</span></div><div class="je-line"><span class="je-tag">CR</span><span>401510 WIP Revenue Recognized</span><span class="pos ml">$${d(adj2030)}</span></div>`;
      if (adj2030 < 0) out += `<div class="je-line"><span class="je-tag">DR</span><span>401510 WIP Revenue Recognized</span><span class="neg ml">$${d(Math.abs(adj2030))}</span></div><div class="je-line"><span class="je-tag">CR</span><span>2030 Billings in Excess of Costs</span><span class="neg ml">$${d(Math.abs(adj2030))}</span></div>`;
      if (adj1290 === 0 && adj2030 === 0) out = `<div style="color:#9CA3AF;font-style:italic">No adjustments needed.</div>`;
      out += `<div class="je-sep"></div><div class="je-line"><span class="je-tag"></span><span>Net P&amp;L Impact</span><span class="${netAdj >= 0 ? "pos" : "neg"} ml">${netAdj >= 0 ? "+" : "-"}$${d(Math.abs(netAdj))}</span></div>`;
      return out;
    }

    const wtdAvgGp = allTot.rev > 0 ? (allTot.rev - allTot.cost) / allTot.rev : 0;

    const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<title>WIP Report — ${dateStr}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#1A1A1A;background:#fff;padding:20px}
.header{text-align:center;margin-bottom:18px;padding-bottom:10px;border-bottom:2px solid #1B2A4A}
.header h1{font-size:15pt;font-weight:bold;letter-spacing:3px;color:#1B2A4A}
.header h2{font-size:10.5pt;margin:3px 0;color:#374151}
.header p{font-size:7.5pt;color:#6B7280;margin:2px 0}
.section{margin-bottom:18px}
.sec-title{font-size:9pt;font-weight:bold;color:#1B2A4A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;padding-bottom:2px;border-bottom:1px solid #1B2A4A}
.sub-title{font-size:8.5pt;font-weight:bold;color:#374151;margin:8px 0 4px}
table{width:100%;border-collapse:collapse;font-size:7.5pt}
th{background:#1B2A4A;color:#fff;padding:3px 5px;text-align:left;white-space:nowrap}
th.num{text-align:right}
td{padding:2.5px 5px;border-bottom:1px solid #E5E7EB;color:#1A1A1A}
td.num{text-align:right;font-family:'Courier New',monospace;white-space:nowrap}
td.mono{font-family:'Courier New',monospace}
tr:nth-child(even) td{background:#F9FAFB}
tr.total-row td{font-weight:bold;border-top:2px solid #1B2A4A;border-bottom:none;background:#F3F4F6!important}
.pos{color:#16A34A}
.neg{color:#B22234}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
.sum-box{border:1px solid #E5E7EB;padding:9px;border-radius:3px}
.sum-box h3{font-size:8pt;font-weight:bold;color:#1B2A4A;margin-bottom:5px}
.sum-row{display:flex;justify-content:space-between;font-size:8pt;margin-bottom:2px}
.sum-row .lbl{color:#374151}
.sum-row .val{font-family:'Courier New',monospace;font-weight:bold}
.sum-row.tot{border-top:1px solid #E5E7EB;padding-top:3px;margin-top:3px}
.je-mono{font-family:'Courier New',monospace;font-size:8pt}
.je-line{display:flex;gap:12px;margin-bottom:2px;font-family:'Courier New',monospace;font-size:8pt}
.je-tag{color:#6B7280;width:18px;flex-shrink:0}
.ml{margin-left:auto}
.je-sep{border-top:1px solid #E5E7EB;margin:4px 0}
.metrics-row{display:flex;flex-wrap:wrap;gap:14px}
.metric{flex:1;min-width:160px;border:1px solid #E5E7EB;padding:7px 10px;border-radius:3px}
.metric .m-lbl{font-size:7.5pt;color:#6B7280;margin-bottom:2px}
.metric .m-val{font-size:10pt;font-weight:bold;font-family:'Courier New',monospace}
.badge-red{color:#B22234;font-weight:bold}
.badge-yellow{color:#D97706;font-weight:bold}
@media print{
  @page{margin:.45in;size:landscape}
  body{padding:0}
  .section{page-break-inside:avoid}
  thead{display:table-header-group}
}
</style></head>
<body>

<div class="header">
  <h1>VANCE CORPORATION</h1>
  <h2>Work-in-Progress Schedule</h2>
  <p>Period Ending: ${dateStr}</p>
  <p>Generated: ${generatedAt}</p>
</div>

<!-- SECTION 1 -->
<div class="section">
<div class="sec-title">Section 1 — Contract Schedule</div>
${inProgress.length > 0 ? `
<div class="sub-title">Contracts in Progress</div>
<table>
<thead><tr>
  <th>Job #</th><th>Job Name</th>
  <th class="num">Rev Contract</th><th class="num">Est Cost</th><th class="num">Est GP%</th>
  <th class="num">Costs ITD</th><th class="num">Billings ITD</th><th class="num">% Comp</th>
  <th class="num">Earned Rev</th><th class="num">Period O/U</th><th class="num">Total O/U</th>
  <th class="num">ITD GP$</th><th class="num">ITD GP%</th>
</tr></thead>
<tbody>${jobRows(inProgress)}</tbody>
<tfoot>${totalRow(ipTot)}</tfoot>
</table>` : ""}
${completed.length > 0 ? `
<div class="sub-title" style="margin-top:12px">Completed Contracts</div>
<table>
<thead><tr>
  <th>Job #</th><th>Job Name</th>
  <th class="num">Rev Contract</th><th class="num">Est Cost</th><th class="num">Est GP%</th>
  <th class="num">Costs ITD</th><th class="num">Billings ITD</th><th class="num">% Comp</th>
  <th class="num">Earned Rev</th><th class="num">Period O/U</th><th class="num">Total O/U</th>
  <th class="num">ITD GP$</th><th class="num">ITD GP%</th>
</tr></thead>
<tbody>${jobRows(completed)}</tbody>
<tfoot>${totalRow(cmTot)}</tfoot>
</table>` : ""}
${inProgress.length > 0 && completed.length > 0 ? `
<div class="sub-title" style="margin-top:12px">Combined Total</div>
<table><thead><tr>
  <th>Job #</th><th>Job Name</th>
  <th class="num">Rev Contract</th><th class="num">Est Cost</th><th class="num">Est GP%</th>
  <th class="num">Costs ITD</th><th class="num">Billings ITD</th><th class="num">% Comp</th>
  <th class="num">Earned Rev</th><th class="num">Period O/U</th><th class="num">Total O/U</th>
  <th class="num">ITD GP$</th><th class="num">ITD GP%</th>
</tr></thead>
<tfoot>${totalRow(allTot)}</tfoot>
</table>` : ""}
</div>

<!-- SECTION 2 & 3 -->
<div class="two-col">
<div class="sum-box">
<h3>Section 2 — Billings Position</h3>
<div class="sum-row"><span class="lbl">Period Net O/U</span><span class="val ${netPeriodOverUnder >= 0 ? "pos" : "neg"}">${netPeriodOverUnder >= 0 ? "+" : ""}$${d(Math.abs(netPeriodOverUnder))}</span></div>
<div class="sum-row"><span class="lbl">Underbillings (Asset 1290)</span><span class="val pos">$${d(totalUnderbillings)}</span></div>
<div class="sum-row"><span class="lbl">Overbillings (Liability 2030)</span><span class="val neg">$${d(totalOverbillings)}</span></div>
<div class="sum-row tot"><span class="lbl" style="font-weight:bold">Cumulative Net O/U (→JE)</span><span class="val ${netOverUnder >= 0 ? "pos" : "neg"}">${netOverUnder >= 0 ? "+" : ""}$${d(netOverUnder)}</span></div>
<div class="sum-row" style="margin-top:4px"><span class="lbl">Total Backlog</span><span class="val">$${d(totalBacklog)}</span></div>
</div>
<div class="sum-box">
<h3>Section 3 — Current Year Summary</h3>
<div class="sum-row"><span class="lbl">CY Revenue Recognized</span><span class="val">$${d(totalCyRevenue)}</span></div>
<div class="sum-row"><span class="lbl">CY Costs Incurred</span><span class="val">$${d(totalCyCosts)}</span></div>
<div class="sum-row"><span class="lbl">CY Billings</span><span class="val">$${d(totalCyBillings)}</span></div>
<div class="sum-row tot"><span class="lbl" style="font-weight:bold">CY Gross Profit</span><span class="val ${totalCyGp >= 0 ? "pos" : "neg"}">$${d(totalCyGp)}</span></div>
<div class="sum-row"><span class="lbl">CY GP%</span><span class="val ${totalCyGpPct >= 0 ? "pos" : "neg"}">${pct(totalCyGpPct)}</span></div>
</div>
</div>

<!-- SECTION 4 -->
<div class="section">
<div class="sec-title">Section 4 — GL Reconciliation &amp; Journal Entry</div>
<table style="margin-bottom:10px">
<thead><tr>
  <th>Account</th>
  <th class="num">Current Balance</th>
  <th class="num">Should Be</th>
  <th class="num">Adjustment</th>
</tr></thead>
<tbody>
<tr>
  <td>1290 Costs in Excess</td>
  <td class="num">$${d(gl1290Num)}</td>
  <td class="num pos">$${d(totalUnderbillings)}</td>
  <td class="num ${adj1290 >= 0 ? "pos" : "neg"}">${adj1290 >= 0 ? "+" : "-"}$${d(Math.abs(adj1290))}</td>
</tr>
<tr>
  <td>2030 Billings in Excess</td>
  <td class="num">${gl2030Num < 0 ? "-" : ""}$${d(Math.abs(gl2030Num))}</td>
  <td class="num neg">-$${d(totalOverbillings)}</td>
  <td class="num ${adj2030 >= 0 ? "pos" : "neg"}">${adj2030 >= 0 ? "+" : "-"}$${d(Math.abs(adj2030))}</td>
</tr>
<tr class="total-row">
  <td>401510 WIP Revenue (net)</td>
  <td class="num" style="color:#9CA3AF">—</td>
  <td class="num" style="color:#9CA3AF">—</td>
  <td class="num ${netAdj >= 0 ? "pos" : "neg"}">${netAdj >= 0 ? "+" : "-"}$${d(Math.abs(netAdj))}</td>
</tr>
</tbody>
</table>
<div>${jeLines()}</div>
</div>

<!-- SECTION 5 -->
<div class="section">
<div class="sec-title">Section 5 — Key Metrics</div>
<div class="metrics-row">
  <div class="metric"><div class="m-lbl">Weighted Avg GP%</div><div class="m-val">${pct(wtdAvgGp)}</div></div>
  <div class="metric"><div class="m-lbl">Total Backlog</div><div class="m-val">$${d(totalBacklog)}</div></div>
  <div class="metric"><div class="m-lbl">Risk Flags</div><div class="m-val ${riskFlags.length > 0 ? "badge-yellow" : ""}">${riskFlags.length} job${riskFlags.length !== 1 ? "s" : ""} flagged</div></div>
  <div class="metric"><div class="m-lbl">GP Fade (&gt;5pt drop)</div><div class="m-val ${fadedJobs.length > 0 ? "badge-red" : ""}">${fadedJobs.length} job${fadedJobs.length !== 1 ? "s" : ""}</div></div>
</div>
${riskFlags.length > 0 ? `
<div class="sub-title" style="margin-top:10px">Risk Flags Detail</div>
<table>
<thead><tr><th>Job #</th><th>Job Name</th><th>Issue</th><th>Severity</th></tr></thead>
<tbody>${riskFlags.join("")}</tbody>
</table>` : ""}
${fadedJobs.length > 0 ? `
<div class="sub-title" style="margin-top:10px">GP Fade Detail (jobs with &gt;5pt decline)</div>
<table>
<thead><tr><th>Job #</th><th>Job Name</th><th class="num">Original GP%</th><th class="num">Current GP%</th><th class="num">Δ GP%</th></tr></thead>
<tbody>${fadedJobs.map((j, i) => `<tr${i % 2 === 1 ? ' style="background:#F9FAFB"' : ""}><td class="mono">${j.num}</td><td>${j.name}</td><td class="num">${j.orig.toFixed(1)}%</td><td class="num">${j.curr.toFixed(1)}%</td><td class="num neg">${j.delta.toFixed(1)}%</td></tr>`).join("")}
</tbody>
</table>` : ""}
</div>

</body></html>`;

    const win = window.open("", "_blank", "width=1200,height=900");
    if (!win) { alert("Pop-up blocked. Please allow pop-ups for this site."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
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
  const totalUnderbillings      = computed.reduce((s, r) => s + Math.max(0, r.overUnder), 0);
  const totalOverbillings       = computed.reduce((s, r) => s + Math.max(0, -r.overUnder), 0);
  const netOverUnder            = totalUnderbillings - totalOverbillings;
  const totalPeriodUnderbillings = computed.reduce((s, r) => s + Math.max(0, r.periodOverUnder), 0);
  const totalPeriodOverbillings  = computed.reduce((s, r) => s + Math.max(0, -r.periodOverUnder), 0);
  const netPeriodOverUnder       = totalPeriodUnderbillings - totalPeriodOverbillings;
  const totalBacklog       = computed.reduce((s, r) => s + (r.revisedContract - r.earnedRevenue), 0);
  const totalCyRevenue     = computed.reduce((s, r) => s + r.cyEarned, 0);
  const totalCyCosts       = computed.reduce((s, r) => s + r.cyCosts, 0);
  const totalCyBillings    = computed.reduce((s, r) => s + r.cyBillings, 0);
  const totalCyGp          = totalCyRevenue - totalCyCosts;
  const totalCyGpPct       = totalCyRevenue > 0 ? totalCyGp / totalCyRevenue : 0;

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
  const th = "px-2 py-2.5 text-left text-xs font-semibold whitespace-nowrap text-white bg-[#1B2A4A]";
  const td = "px-2 py-1.5 whitespace-nowrap text-xs text-right text-[#1A1A1A]";
  const tdL = "px-2 py-1.5 whitespace-nowrap text-xs text-[#1A1A1A]";
  const inp = "w-full bg-white border border-[#E5E7EB] text-[#1A1A1A] text-right rounded px-2 py-0.5 text-xs focus:outline-none focus:border-[#1B2A4A]";
  const COLS = 25;

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
            <Link href="/wip" className="text-xs text-[#6B7280] hover:text-[#1B2A4A] mb-1 inline-block">
              ← WIP Reports
            </Link>
            <h1 className="text-2xl font-bold text-[#1A1A1A]">
              WIP Report{" "}
              <span className="text-[#1B2A4A]">{toDateStr(report.period_date)}</span>
            </h1>
          </div>
          <div className="flex items-center gap-4 pt-1">
            {saving && <span className="text-xs text-[#6B7280]">Saving…</span>}
            {!saving && saveStatus === "saved"  && <span className="text-xs text-[#16A34A]">Saved</span>}
            {!saving && saveStatus === "error"  && <span className="text-xs text-[#B22234]">Save failed</span>}
            <Link
              href={`/wip/${report.id}/summary`}
              className="border border-[#E5E7EB] text-[#6B7280] hover:border-[#1B2A4A] hover:text-[#1B2A4A] px-4 py-2 rounded text-sm font-medium transition-colors"
            >
              Summary
            </Link>
            <button
              onClick={handlePrint}
              className="border border-[#E5E7EB] text-[#6B7280] hover:border-[#1B2A4A] hover:text-[#1B2A4A] px-4 py-2 rounded text-sm font-medium transition-colors"
            >
              Print Report
            </button>
            {isFinalized && !editingFinalized && (
              <>
                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded text-sm font-semibold">
                  Finalized
                </span>
                <button
                  onClick={handleEnterEdit}
                  disabled={enteringEdit}
                  className="border border-[#D97706] text-[#D97706] hover:bg-[#D97706]/10 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium transition-colors"
                >
                  {enteringEdit ? "Opening…" : "Edit"}
                </button>
              </>
            )}
            {editingFinalized && (
              <>
                <button
                  onClick={handleCancelEdit}
                  className="border border-[#E5E7EB] text-[#6B7280] hover:border-[#1B2A4A] hover:text-[#1B2A4A] px-4 py-2 rounded text-sm font-medium transition-colors"
                >
                  Cancel Edit
                </button>
                <button
                  onClick={handleReFinalize}
                  disabled={reFinalizing}
                  className="bg-[#D97706] hover:bg-[#B45309] disabled:opacity-50 text-white font-bold px-5 py-2 rounded transition-colors"
                >
                  {reFinalizing ? "Saving…" : "Save & Re-finalize"}
                </button>
              </>
            )}
            {isEditable && (
              <button
                onClick={handleOpenAddJob}
                className="border border-[#1B2A4A] text-[#1B2A4A] hover:bg-[#1B2A4A]/10 px-4 py-2 rounded text-sm font-medium transition-colors"
              >
                + Add Job
              </button>
            )}
            {!isFinalized && (
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className="bg-[#D97706] hover:bg-[#B45309] disabled:opacity-50 text-white font-bold px-5 py-2 rounded transition-colors"
              >
                {finalizing ? "Finalizing…" : "Finalize Report"}
              </button>
            )}
          </div>
        </div>

        {/* ── Editing-finalized banner ────────────────────────────────────── */}
        {editingFinalized && (
          <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded-lg text-sm font-medium">
            <span>⚠</span>
            <span>EDITING FINALIZED REPORT — all changes will be logged to the audit trail when you Save &amp; Re-finalize.</span>
          </div>
        )}

        {/* ── Main table ─────────────────────────────────────────────────── */}
        <div className="overflow-x-auto rounded-lg border border-[#E5E7EB] mb-8">
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
                <th className={`${th} text-right min-w-[110px]`}>Period O/U</th>
                <th className={`${th} text-right min-w-[110px]`}>Total O/U</th>
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
                    cyEarned, cyBillings, cyCosts, cyGp, periodOverUnder,
                  },
                  i
                ) => {
                  const rowBg    = i % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]";
                  const stickyBg = i % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]";
                  const ouColor  = overUnder >= 0 ? "text-[#16A34A]" : "text-[#B22234]";
                  const priorOpen = expandedPrior.has(item.id);

                  return (
                    <Fragment key={item.id}>
                      <tr className={`${rowBg} hover:bg-[#F3F4F6] transition-colors`}>
                        {/* Sticky: Job # */}
                        <td className={`${tdL} sticky left-0 z-10 ${stickyBg} font-mono`}>
                          {item.job_number}
                        </td>
                        {/* Sticky: Job Name */}
                        <td className={`${tdL} sticky left-[72px] z-10 ${stickyBg} max-w-[150px]`}>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate">{item.job_name}</span>
                            {pctComplete >= 1 &&
                              toNum(editable.cp_costs) === 0 &&
                              toNum(editable.cp_billings) === 0 && (
                                <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-500 rounded whitespace-nowrap">
                                  Ready to Close
                                </span>
                              )}
                          </div>
                        </td>

                        {/* Editable: Rev Contract */}
                        <td className="px-1 py-0.5 whitespace-nowrap">
                          {!isEditable ? (
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
                          {!isEditable ? (
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
                            !isEditable ? (
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
                            <span className={`${td} text-gray-400`}>—</span>
                          )}
                        </td>

                        {/* CP Billings — editable for locked rows, dash for unlocked */}
                        <td className="px-1 py-0.5 whitespace-nowrap">
                          {item.is_prior_locked ? (
                            !isEditable ? (
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
                            <span className={`${td} text-gray-400`}>—</span>
                          )}
                        </td>

                        {/* Costs ITD — editable for unlocked, read-only calc for locked */}
                        <td className="px-1 py-0.5 whitespace-nowrap">
                          {item.is_prior_locked ? (
                            <span className={td}>${fmt$(costsToDate)}</span>
                          ) : !isEditable ? (
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
                          ) : !isEditable ? (
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
                          {!isEditable ? (
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
                        {/* Period O/U */}
                        <td className={`px-2 py-1.5 whitespace-nowrap text-xs text-right font-semibold ${periodOverUnder >= 0 ? "text-[#16A34A]" : "text-[#B22234]"}`}>
                          {periodOverUnder >= 0 ? "+" : ""}${fmt$(periodOverUnder)}
                        </td>
                        {/* Total O/U */}
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
                          {!isEditable ? (
                            <span className="text-xs text-[#6B7280] whitespace-nowrap">
                              {editable.notes || "—"}
                            </span>
                          ) : (
                            <input
                              type="text"
                              value={editable.notes}
                              onChange={(e) => handleChange(item.id, "notes", e.target.value)}
                              placeholder="—"
                              className="w-full bg-white border border-[#E5E7EB] text-[#1A1A1A] rounded px-2 py-0.5 text-xs focus:outline-none focus:border-[#1B2A4A]"
                            />
                          )}
                        </td>

                        {/* Prior toggle */}
                        <td className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => togglePrior(item.id)}
                            title="Toggle prior year"
                            className="text-xs text-[#1B2A4A] hover:text-[#243d70] font-bold px-1"
                          >
                            {priorOpen ? "▼" : "▶"}
                          </button>
                        </td>
                      </tr>

                      {/* Prior year expanded row */}
                      {priorOpen && (
                        <tr className="bg-[#F9FAFB] border-t border-b border-[#E5E7EB]">
                          <td colSpan={COLS} className="px-5 py-3">
                            <div className="flex flex-wrap items-end gap-6">
                              <span className="text-xs text-[#6B7280] font-semibold uppercase tracking-wider">
                                Prior Year
                                {item.is_prior_locked && (
                                  <span className="ml-2 text-amber-600 normal-case">● locked</span>
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
                                  <div className="text-xs text-[#6B7280] mb-1">{label}</div>
                                  {item.is_prior_locked || !isEditable ? (
                                    <span className="text-xs text-[#1A1A1A] font-mono">
                                      ${fmt$(toNum(editable[field]))}
                                    </span>
                                  ) : (
                                    <input
                                      type="text"
                                      value={editable[field]}
                                      onChange={(e) => handleChange(item.id, field, e.target.value)}
                                      className="w-36 bg-white border border-[#E5E7EB] text-[#1A1A1A] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#1B2A4A] text-right"
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
          <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-5">
            <h2 className="text-[#1B2A4A] font-semibold mb-4">Billings Position</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#374151]">
                  Period Net O/U{" "}
                  <span className="text-[#6B7280] text-xs">(this period only)</span>
                </dt>
                <dd className={`font-mono font-semibold ${netPeriodOverUnder >= 0 ? "text-[#16A34A]" : "text-[#B22234]"}`}>
                  {netPeriodOverUnder >= 0 ? "+" : ""}${fmt$(netPeriodOverUnder)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-[#E5E7EB] pt-2">
                <dt className="text-[#374151]">
                  Underbillings{" "}
                  <span className="text-[#6B7280] text-xs">(Asset — Acct 1290)</span>
                </dt>
                <dd className="font-mono text-[#16A34A] font-semibold">${fmt$(totalUnderbillings)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#374151]">
                  Overbillings{" "}
                  <span className="text-[#6B7280] text-xs">(Liability — Acct 2030)</span>
                </dt>
                <dd className="font-mono text-[#B22234] font-semibold">${fmt$(totalOverbillings)}</dd>
              </div>
              <div className="flex justify-between border-t border-[#E5E7EB] pt-2">
                <dt className="font-semibold text-[#1A1A1A]">
                  Cumulative Net O/U{" "}
                  <span className="text-[#6B7280] text-xs font-normal">(drives JE)</span>
                </dt>
                <dd className={`font-mono font-semibold ${netOverUnder >= 0 ? "text-[#16A34A]" : "text-[#B22234]"}`}>
                  {netOverUnder >= 0 ? "+" : ""}${fmt$(netOverUnder)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#374151]">Total Backlog</dt>
                <dd className="font-mono text-[#1A1A1A]">${fmt$(totalBacklog)}</dd>
              </div>
            </dl>
          </div>

          {/* Current year */}
          <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-5">
            <h2 className="text-[#1B2A4A] font-semibold mb-4">Current Year</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#374151]">CY Revenue</dt>
                <dd className="font-mono text-[#1A1A1A]">${fmt$(totalCyRevenue)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#374151]">CY Costs</dt>
                <dd className="font-mono text-[#1A1A1A]">${fmt$(totalCyCosts)}</dd>
              </div>
              <div className="flex justify-between border-t border-[#E5E7EB] pt-2">
                <dt className="font-semibold text-[#1A1A1A]">CY Gross Profit</dt>
                <dd className={`font-mono font-semibold ${totalCyGp >= 0 ? "text-[#16A34A]" : "text-[#B22234]"}`}>
                  ${fmt$(totalCyGp)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* ── Journal entry ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-5 mb-6">
          <h2 className="text-[#1B2A4A] font-semibold mb-4">Auto-Generated Journal Entry</h2>

          {/* Reconciliation table */}
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E5E7EB]">
                  <th className="text-left py-2 pr-6 text-[#6B7280] font-semibold">Account</th>
                  <th className="text-right py-2 px-4 text-[#6B7280] font-semibold">Current Balance</th>
                  <th className="text-right py-2 px-4 text-[#6B7280] font-semibold">Should Be</th>
                  <th className="text-right py-2 pl-4 text-[#6B7280] font-semibold">Adjustment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                <tr>
                  <td className="py-2 pr-6 text-[#374151]">1290 Costs in Excess</td>
                  <td className="py-2 px-4 text-right font-mono text-[#1A1A1A]">${fmt$(gl1290Num)}</td>
                  <td className="py-2 px-4 text-right font-mono text-[#16A34A]">${fmt$(totalUnderbillings)}</td>
                  <td className={`py-2 pl-4 text-right font-mono font-semibold ${adj1290 >= 0 ? "text-[#16A34A]" : "text-[#B22234]"}`}>
                    {adj1290 >= 0 ? "+" : "-"}${fmt$(Math.abs(adj1290))}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-6 text-[#374151]">2030 Billings in Excess</td>
                  <td className="py-2 px-4 text-right font-mono text-[#1A1A1A]">
                    {gl2030Num < 0 ? "-" : ""}${fmt$(Math.abs(gl2030Num))}
                  </td>
                  <td className="py-2 px-4 text-right font-mono text-[#B22234]">-${fmt$(totalOverbillings)}</td>
                  <td className={`py-2 pl-4 text-right font-mono font-semibold ${adj2030 >= 0 ? "text-[#16A34A]" : "text-[#B22234]"}`}>
                    {adj2030 >= 0 ? "+" : "-"}${fmt$(Math.abs(adj2030))}
                  </td>
                </tr>
                <tr className="border-t-2 border-[#E5E7EB]">
                  <td className="py-2 pr-6 text-[#374151]">401510 WIP Revenue</td>
                  <td className="py-2 px-4 text-right font-mono text-[#9CA3AF]">—</td>
                  <td className="py-2 px-4 text-right font-mono text-[#9CA3AF]">—</td>
                  <td className={`py-2 pl-4 text-right font-mono font-bold ${netAdj >= 0 ? "text-[#16A34A]" : "text-[#B22234]"}`}>
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
                  <span className="text-[#6B7280] w-6">DR</span>
                  <span className="flex-1 text-[#1A1A1A]">1290 Costs in Excess of Billings</span>
                  <span className="text-[#16A34A]">${fmt$(adj1290)}</span>
                </div>
                <div className="flex gap-6">
                  <span className="text-[#6B7280] w-6">CR</span>
                  <span className="flex-1 text-[#1A1A1A]">401510 WIP Revenue Recognized</span>
                  <span className="text-[#16A34A]">${fmt$(adj1290)}</span>
                </div>
              </>
            )}
            {adj1290 < 0 && (
              <>
                <div className="flex gap-6">
                  <span className="text-[#6B7280] w-6">DR</span>
                  <span className="flex-1 text-[#1A1A1A]">401510 WIP Revenue Recognized</span>
                  <span className="text-[#B22234]">${fmt$(Math.abs(adj1290))}</span>
                </div>
                <div className="flex gap-6">
                  <span className="text-[#6B7280] w-6">CR</span>
                  <span className="flex-1 text-[#1A1A1A]">1290 Costs in Excess of Billings</span>
                  <span className="text-[#B22234]">${fmt$(Math.abs(adj1290))}</span>
                </div>
              </>
            )}
            {adj2030 > 0 && (
              <>
                <div className={`flex gap-6${adj1290 !== 0 ? " mt-2" : ""}`}>
                  <span className="text-[#6B7280] w-6">DR</span>
                  <span className="flex-1 text-[#1A1A1A]">2030 Billings in Excess of Costs</span>
                  <span className="text-[#16A34A]">${fmt$(adj2030)}</span>
                </div>
                <div className="flex gap-6">
                  <span className="text-[#6B7280] w-6">CR</span>
                  <span className="flex-1 text-[#1A1A1A]">401510 WIP Revenue Recognized</span>
                  <span className="text-[#16A34A]">${fmt$(adj2030)}</span>
                </div>
              </>
            )}
            {adj2030 < 0 && (
              <>
                <div className={`flex gap-6${adj1290 !== 0 ? " mt-2" : ""}`}>
                  <span className="text-[#6B7280] w-6">DR</span>
                  <span className="flex-1 text-[#1A1A1A]">401510 WIP Revenue Recognized</span>
                  <span className="text-[#B22234]">${fmt$(Math.abs(adj2030))}</span>
                </div>
                <div className="flex gap-6">
                  <span className="text-[#6B7280] w-6">CR</span>
                  <span className="flex-1 text-[#1A1A1A]">2030 Billings in Excess of Costs</span>
                  <span className="text-[#B22234]">${fmt$(Math.abs(adj2030))}</span>
                </div>
              </>
            )}
            {adj1290 === 0 && adj2030 === 0 && (
              <span className="text-[#9CA3AF] italic">No adjustments needed.</span>
            )}
            <div className="flex gap-6 border-t border-[#E5E7EB] pt-2 mt-2">
              <span className="text-[#9CA3AF] w-6" />
              <span className="text-[#6B7280] flex-1">Net P&amp;L Impact</span>
              <span className={netAdj >= 0 ? "text-[#16A34A]" : "text-[#B22234]"}>
                {netAdj >= 0 ? "+" : "-"}${fmt$(Math.abs(netAdj))}
              </span>
            </div>
          </div>
        </div>

        {/* ── GL Reconciliation ──────────────────────────────────────────── */}
        <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-5 mb-8">
          <h2 className="text-[#1B2A4A] font-semibold mb-4">GL Reconciliation</h2>
          <div className="flex flex-wrap gap-8">
            <div>
              <div className="text-xs text-[#6B7280] mb-1.5">Current GL Balance — 1290 Costs in Excess</div>
              {!isEditable ? (
                <span className="text-sm font-mono text-[#1A1A1A]">${fmt$(gl1290Num)}</span>
              ) : (
                <input
                  type="text"
                  value={gl1290Str}
                  onChange={(e) => handleGlChange("1290", e.target.value)}
                  className="w-48 bg-white border border-[#E5E7EB] text-[#1A1A1A] rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#1B2A4A] text-right"
                />
              )}
            </div>
            <div>
              <div className="text-xs text-[#6B7280] mb-1.5">Current GL Balance — 2030 Billings in Excess</div>
              {!isEditable ? (
                <span className="text-sm font-mono text-[#1A1A1A]">
                  {gl2030Num < 0 ? "-" : ""}${fmt$(Math.abs(gl2030Num))}
                </span>
              ) : (
                <input
                  type="text"
                  value={gl2030Str}
                  onChange={(e) => handleGlChange("2030", e.target.value)}
                  className="w-48 bg-white border border-[#E5E7EB] text-[#1A1A1A] rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#1B2A4A] text-right"
                />
              )}
            </div>
          </div>
          {isEditable && (
            <p className="text-xs text-[#9CA3AF] mt-3">
              Enter the current GL balance for each account. For 2030 (credit/liability), enter a negative value (e.g., -12,500.00).
            </p>
          )}
        </div>

        {/* ── Bottom actions ─────────────────────────────────────────────── */}
        <div className="flex justify-end gap-3 mb-8">
          <Link
            href={`/wip/${report.id}/summary`}
            className="border border-[#E5E7EB] text-[#6B7280] hover:border-[#1B2A4A] hover:text-[#1B2A4A] px-5 py-2.5 rounded text-sm font-medium transition-colors"
          >
            Summary
          </Link>
          <button
            onClick={handlePrint}
            className="border border-[#E5E7EB] text-[#6B7280] hover:border-[#1B2A4A] hover:text-[#1B2A4A] px-5 py-2.5 rounded text-sm font-medium transition-colors"
          >
            Print Report
          </button>
          {editingFinalized && (
            <>
              <button
                onClick={handleCancelEdit}
                className="border border-[#E5E7EB] text-[#6B7280] hover:border-[#1B2A4A] hover:text-[#1B2A4A] px-5 py-2.5 rounded text-sm font-medium transition-colors"
              >
                Cancel Edit
              </button>
              <button
                onClick={handleReFinalize}
                disabled={reFinalizing}
                className="bg-[#D97706] hover:bg-[#B45309] disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded transition-colors"
              >
                {reFinalizing ? "Saving…" : "Save & Re-finalize"}
              </button>
            </>
          )}
          {!isFinalized && (
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              className="bg-[#D97706] hover:bg-[#B45309] disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded transition-colors"
            >
              {finalizing ? "Finalizing…" : "Finalize Report"}
            </button>
          )}
        </div>

        {/* ── Audit Log (finalized only) ──────────────────────────────────── */}
        {isFinalized && (
          <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm mb-4">
            <button
              onClick={() => {
                const next = !auditExpanded;
                setAuditExpanded(next);
                if (next) loadAuditLog();
              }}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <span className="font-semibold text-[#1B2A4A]">Audit Log</span>
              <span className="text-[#6B7280] text-sm">{auditExpanded ? "▲ Collapse" : "▶ Expand"}</span>
            </button>
            {auditExpanded && (
              <div className="border-t border-[#E5E7EB] px-5 py-4">
                {!auditLoaded ? (
                  <p className="text-sm text-[#6B7280]">Loading…</p>
                ) : auditEntries.length === 0 ? (
                  <p className="text-sm text-[#6B7280]">No audit entries yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#E5E7EB]">
                          <th className="text-left py-2 pr-4 text-[#6B7280] font-semibold">Date / Time</th>
                          <th className="text-left py-2 pr-4 text-[#6B7280] font-semibold">Job</th>
                          <th className="text-left py-2 pr-4 text-[#6B7280] font-semibold">Field</th>
                          <th className="text-right py-2 pr-4 text-[#6B7280] font-semibold">Old Value</th>
                          <th className="text-right py-2 text-[#6B7280] font-semibold">New Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E7EB]">
                        {auditEntries.map((entry) => (
                          <tr key={entry.id}>
                            <td className="py-1.5 pr-4 font-mono text-[#6B7280] whitespace-nowrap">
                              {new Date(entry.changed_at).toLocaleString("en-US", {
                                month: "short", day: "numeric", year: "numeric",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </td>
                            <td className="py-1.5 pr-4 font-mono text-[#1A1A1A]">{entry.job_number}</td>
                            <td className="py-1.5 pr-4 text-[#374151]">
                              {FIELD_LABELS[entry.field_name] ?? entry.field_name}
                            </td>
                            <td className="py-1.5 pr-4 text-right font-mono text-[#B22234]">
                              {entry.old_value ?? "—"}
                            </td>
                            <td className="py-1.5 text-right font-mono text-[#16A34A]">
                              {entry.new_value ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Snapshots (finalized only) ──────────────────────────────────── */}
        {isFinalized && (
          <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm mb-4">
            <button
              onClick={() => {
                const next = !snapshotsExpanded;
                setSnapshotsExpanded(next);
                if (next) loadSnapshots();
              }}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <span className="font-semibold text-[#1B2A4A]">Snapshots</span>
              <span className="text-[#6B7280] text-sm">{snapshotsExpanded ? "▲ Collapse" : "▶ Expand"}</span>
            </button>
            {snapshotsExpanded && (
              <div className="border-t border-[#E5E7EB] px-5 py-4">
                {!snapshotsLoaded ? (
                  <p className="text-sm text-[#6B7280]">Loading…</p>
                ) : snapshots.length === 0 ? (
                  <p className="text-sm text-[#6B7280]">No snapshots yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#E5E7EB]">
                          <th className="text-left py-2 pr-4 text-[#6B7280] font-semibold">Date / Time</th>
                          <th className="text-left py-2 pr-4 text-[#6B7280] font-semibold">Reason</th>
                          <th className="text-right py-2 text-[#6B7280] font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E7EB]">
                        {snapshots.map((snap) => (
                          <tr key={snap.id}>
                            <td className="py-1.5 pr-4 font-mono text-[#6B7280] whitespace-nowrap">
                              {new Date(snap.created_at).toLocaleString("en-US", {
                                month: "short", day: "numeric", year: "numeric",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </td>
                            <td className="py-1.5 pr-4 text-[#374151]">{snap.reason}</td>
                            <td className="py-1.5 text-right">
                              <button
                                onClick={() => handleRestore(snap.id)}
                                className="text-xs border border-[#1B2A4A] text-[#1B2A4A] hover:bg-[#1B2A4A]/10 px-3 py-1 rounded transition-colors"
                              >
                                Restore
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Add Job Modal ───────────────────────────────────────────────── */}
      {addJobOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white border border-[#E5E7EB] rounded-lg w-full max-w-md p-6 shadow-lg">
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-4">Add Job to Report</h2>

            {addJobError && (
              <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {addJobError}
              </div>
            )}

            <input
              type="text"
              placeholder="Search by job # or name…"
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
              className="w-full border border-[#E5E7EB] rounded px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#1B2A4A] mb-3"
              autoFocus
            />

            <div className="max-h-64 overflow-y-auto border border-[#E5E7EB] rounded mb-4">
              {availableJobs.length === 0 ? (
                <p className="text-[#6B7280] text-sm px-3 py-4 text-center">
                  {addJobError ? "" : "All active jobs are already in this report."}
                </p>
              ) : (() => {
                const filter = jobFilter.toLowerCase().trim();
                const filtered = availableJobs.filter(
                  (j) =>
                    !filter ||
                    j.job_number.toLowerCase().includes(filter) ||
                    j.job_name.toLowerCase().includes(filter)
                );
                if (filtered.length === 0) {
                  return (
                    <p className="text-[#6B7280] text-sm px-3 py-4 text-center">No matching jobs.</p>
                  );
                }
                return filtered.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between px-3 py-2.5 hover:bg-[#F9FAFB] border-b border-[#E5E7EB] last:border-b-0"
                  >
                    <div className="min-w-0 flex-1 mr-3">
                      <span className="font-mono text-xs text-[#6B7280] mr-2">{job.job_number}</span>
                      <span className="text-sm text-[#1A1A1A] truncate">{job.job_name}</span>
                    </div>
                    <button
                      onClick={() => handleAddJob(job.id)}
                      disabled={addingJobId === job.id}
                      className="shrink-0 bg-[#1B2A4A] hover:bg-[#243d70] disabled:opacity-50 text-white text-xs font-semibold px-3 py-1 rounded transition-colors"
                    >
                      {addingJobId === job.id ? "Adding…" : "Add"}
                    </button>
                  </div>
                ));
              })()}
            </div>

            <button
              onClick={() => setAddJobOpen(false)}
              className="border border-[#E5E7EB] text-[#6B7280] hover:border-[#1B2A4A] hover:text-[#1B2A4A] px-4 py-2 rounded text-sm transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
