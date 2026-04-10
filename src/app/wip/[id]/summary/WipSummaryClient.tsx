"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { LineItemWithJob, WipReport } from "../page";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return Math.round(Math.abs(n)).toLocaleString("en-US");
}
function fmtPct(n: number, dec = 1) {
  return (n * 100).toFixed(dec) + "%";
}
function fmtAxis(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
function toDateStr(d: string | Date) {
  return new Date(d).toISOString().slice(0, 10);
}
function dollar(n: number) {
  return `$${fmt$(n)}`;
}

// ── Calc ─────────────────────────────────────────────────────────────────────

function calcItem(item: LineItemWithJob) {
  const revisedContract = Number(item.revised_contract);
  const estTotalCost    = Number(item.est_total_cost);

  // For prior-locked rows, derive ITD from baseline + current-period entry
  const costsToDate    = item.is_prior_locked
    ? Number(item.prior_itd_costs)    + Number(item.cp_costs)
    : Number(item.costs_to_date);
  const billingsToDate = item.is_prior_locked
    ? Number(item.prior_itd_billings) + Number(item.cp_billings)
    : Number(item.billings_to_date);

  const pmOverride   = item.pm_pct_override != null ? Number(item.pm_pct_override) : null;
  const pctComplete  = estTotalCost > 0 ? costsToDate / estTotalCost : 0;
  const effectivePct = pmOverride !== null ? pmOverride : pctComplete;
  const earnedRevenue =
    effectivePct >= 1
      ? Math.max(billingsToDate, revisedContract)
      : effectivePct * revisedContract;
  const overUnder = earnedRevenue - billingsToDate;

  const estGpPct =
    revisedContract > 0 ? (revisedContract - estTotalCost) / revisedContract : 0;

  // Original GP% from jobs table (same formula as /jobs page)
  const origRevenue = Number(item.original_contract) + Number(item.approved_cos);
  const origGpPct   =
    origRevenue > 0
      ? (origRevenue - Number(item.job_est_total_cost)) / origRevenue
      : 0;
  const gpFadePts = (estGpPct - origGpPct) * 100;

  const cyBillings = billingsToDate - Number(item.prior_year_billings);

  return {
    revisedContract,
    estTotalCost,
    costsToDate,
    billingsToDate,
    earnedRevenue,
    overUnder,
    pctComplete,
    estGpPct,
    origGpPct,
    gpFadePts,
    cyBillings,
    cpCosts:    Number(item.cp_costs),
    cpBillings: Number(item.cp_billings),
  };
}

// Distinct palette for pie slices
const PIE_COLORS = [
  "#1B2A4A", "#3B5189", "#6B87C9", "#C9A84C",
  "#16A34A", "#D97706", "#B22234", "#9CA3AF",
  "#374151", "#7C3AED", "#0891B2", "#BE185D",
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function WipSummaryClient({
  report,
  lineItems,
}: {
  report: WipReport;
  lineItems: LineItemWithJob[];
}) {
  const dateStr = toDateStr(report.period_date);

  // Stable numeric sort by job number
  const sortedItems = useMemo(
    () =>
      [...lineItems].sort((a, b) => {
        const ap = a.job_number.split("-").map(Number);
        const bp = b.job_number.split("-").map(Number);
        if (ap[0] !== bp[0]) return ap[0] - bp[0];
        return (ap[1] ?? 0) - (bp[1] ?? 0);
      }),
    [lineItems]
  );

  const computed = useMemo(
    () => sortedItems.map((item) => ({ item, ...calcItem(item) })),
    [sortedItems]
  );

  // ── Portfolio totals ──────────────────────────────────────────────────────
  const totalRevised       = computed.reduce((s, r) => s + r.revisedContract, 0);
  const totalEarned        = computed.reduce((s, r) => s + r.earnedRevenue, 0);
  const totalCosts         = computed.reduce((s, r) => s + r.costsToDate, 0);
  const totalGP            = totalEarned - totalCosts;
  const totalGpPct         = totalEarned > 0 ? totalGP / totalEarned : 0;
  const totalUnderbillings = computed.reduce((s, r) => s + Math.max(0, r.overUnder), 0);
  const totalOverbillings  = computed.reduce((s, r) => s + Math.max(0, -r.overUnder), 0);
  const netOverUnder       = totalUnderbillings - totalOverbillings;
  const wtdAvgGpPct        =
    totalRevised > 0
      ? computed.reduce((s, r) => s + r.estGpPct * r.revisedContract, 0) / totalRevised
      : 0;

  // ── YTD totals (current-year columns from latest report) ─────────────────
  const totalCyRevenue  = computed.reduce((s, r) => s + (r.earnedRevenue - Number(r.item.prior_year_earned)), 0);
  const totalCyCosts    = computed.reduce((s, r) => s + (r.costsToDate   - Number(r.item.prior_year_costs)), 0);
  const totalCyBillings = computed.reduce((s, r) => s + r.cyBillings, 0);
  const totalCyGp       = totalCyRevenue - totalCyCosts;
  const totalCyGpPct    = totalCyRevenue > 0 ? totalCyGp / totalCyRevenue : 0;

  // ── Notable jobs for per-job narrative ───────────────────────────────────
  const notableRows = useMemo(
    () =>
      computed.filter(
        (r) => Math.abs(r.overUnder) > 5_000 || r.cpCosts > 10_000
      ),
    [computed]
  );

  // ── Per-job narrative bullets ─────────────────────────────────────────────
  const jobBullets = useMemo(() => {
    const bullets: string[] = [];
    for (const {
      item,
      overUnder,
      pctComplete,
      earnedRevenue,
      cpCosts,
      cpBillings,
      estGpPct,
      origGpPct,
      gpFadePts,
    } of notableRows) {
      const label = `${item.job_number} — ${item.job_name}`;

      if (pctComplete >= 1 && Math.abs(overUnder) <= 100) {
        bullets.push(
          `${label}: Complete. Fully billed at ${dollar(earnedRevenue)}.`
        );
      } else if (overUnder > 5_000) {
        bullets.push(
          `${label}: Underbilled by ${dollar(overUnder)}. Work has been performed but not yet invoiced — follow up on billing.`
        );
      } else if (overUnder < -5_000) {
        bullets.push(
          `${label}: Overbilled by ${dollar(Math.abs(overUnder))}. Billings exceed earned revenue — ensure work catches up to billings.`
        );
      }

      if (gpFadePts < -5) {
        bullets.push(
          `${label}: Margin erosion of ${Math.abs(gpFadePts).toFixed(1)} points — original estimate ${(origGpPct * 100).toFixed(1)}%, current ${(estGpPct * 100).toFixed(1)}%. Review cost overruns.`
        );
      }

      if (cpCosts > 0 && cpBillings === 0) {
        bullets.push(
          `${label}: ${dollar(cpCosts)} in costs incurred this period with no billings — invoice pending.`
        );
      }
    }
    return bullets;
  }, [notableRows]);

  // ── Recommendations ───────────────────────────────────────────────────────
  const recommendations = useMemo(() => {
    const recs: Array<{ priority: "high" | "medium" | "low"; text: string }> = [];

    for (const {
      item,
      overUnder,
      pctComplete,
      cpCosts,
      cpBillings,
      gpFadePts,
      origGpPct,
      estGpPct,
      costsToDate,
      estTotalCost,
      billingsToDate,
      revisedContract,
    } of computed) {
      // Invoice immediately: large underbillings
      if (overUnder > 50_000) {
        recs.push({
          priority: "high",
          text: `Invoice immediately — ${item.job_number} ${item.job_name}: ${dollar(overUnder)} underbilled.`,
        });
      }
      // Review cost estimates: GP fade > 5 points
      if (gpFadePts < -5) {
        recs.push({
          priority: "medium",
          text: `Review cost estimates — ${item.job_number} ${item.job_name}: GP fade of ${Math.abs(gpFadePts).toFixed(1)} pts (${(origGpPct * 100).toFixed(1)}% → ${(estGpPct * 100).toFixed(1)}%).`,
        });
      }
      // Close out: 100% complete, no current-period activity
      if (pctComplete >= 1 && cpCosts === 0 && cpBillings === 0) {
        recs.push({
          priority: "low",
          text: `Close out — ${item.job_number} ${item.job_name}: 100% complete with no current-period activity.`,
        });
      }
      // Monitor closely: >90% costs consumed but <90% billed
      const costPct    = estTotalCost > 0 ? costsToDate / estTotalCost : 0;
      const billingPct = revisedContract > 0 ? billingsToDate / revisedContract : 0;
      if (costPct > 0.9 && billingPct < 0.9 && estTotalCost > 10_000) {
        recs.push({
          priority: "medium",
          text: `Monitor closely — ${item.job_number} ${item.job_name}: ${(costPct * 100).toFixed(0)}% of budget consumed, only ${(billingPct * 100).toFixed(0)}% billed.`,
        });
      }
    }

    const order = { high: 0, medium: 1, low: 2 } as const;
    return recs.sort((a, b) => order[a.priority] - order[b.priority]);
  }, [computed]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const billingsChartData = computed.map((r) => ({
    name: r.item.job_number,
    "Earned Rev": Math.round(r.earnedRevenue),
    "Billings ITD": Math.round(r.billingsToDate),
  }));

  const pieData = computed.map((r) => ({
    name: r.item.job_number,
    value: Math.max(0, Math.round(r.revisedContract)),
  }));

  const gpChartData = computed.map((r) => ({
    name: r.item.job_number,
    gp: parseFloat((r.estGpPct * 100).toFixed(1)),
  }));

  const costChartData = computed.map((r) => ({
    name: r.item.job_number,
    "Costs to Date": Math.round(r.costsToDate),
    Remaining: Math.round(Math.max(0, r.estTotalCost - r.costsToDate)),
    estTotalCost: Math.round(r.estTotalCost), // not rendered as bar — used by tooltip
  }));

  // Dynamic height so all jobs fit in horizontal bar charts
  const barChartHeight = Math.max(240, computed.length * 34);

  // ── Tooltip formatters ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dollarFmt = (v: any) => `$${fmt$(Number(v ?? 0))}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pctFmtTip = (v: any) => `${Number(v ?? 0).toFixed(1)}%`;

  // ── Custom tooltip: Budget Consumption ───────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BudgetTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0].payload;
    const costs = Number(data["Costs to Date"] ?? 0);
    const remaining = Number(data["Remaining"] ?? 0);
    const est = Number(data.estTotalCost ?? costs + remaining);
    const pctConsumed = est > 0 ? (costs / est) * 100 : 0;
    return (
      <div className="bg-white border border-[#E5E7EB] rounded shadow-sm px-3 py-2 text-xs space-y-0.5">
        <p className="font-semibold text-[#1B2A4A] mb-1">{label}</p>
        <p className="text-[#6B7280]">Est Total Cost: <span className="font-mono text-[#1A1A1A]">${fmt$(est)}</span></p>
        <p className="text-[#6B7280]">Costs to Date: <span className="font-mono text-[#1A1A1A]">${fmt$(costs)}</span></p>
        <p className="text-[#6B7280]">Remaining: <span className="font-mono text-[#1A1A1A]">${fmt$(remaining)}</span></p>
        <p className="text-[#6B7280] border-t border-[#E5E7EB] pt-0.5 mt-0.5">
          % Consumed: <span className={`font-mono font-semibold ${pctConsumed > 90 ? "text-[#B22234]" : "text-[#1A1A1A]"}`}>{pctConsumed.toFixed(1)}%</span>
        </p>
      </div>
    );
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const sectionCls =
    "bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-6 mb-6 print-section";
  const h2Cls =
    "text-base font-bold text-[#1B2A4A] uppercase tracking-wide mb-4 pb-2 border-b border-[#E5E7EB]";
  const chartLabelCls =
    "text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-3";

  const priorityBadge = (p: "high" | "medium" | "low") =>
    p === "high"
      ? "bg-red-100 text-red-700"
      : p === "medium"
      ? "bg-amber-100 text-amber-700"
      : "bg-gray-100 text-gray-600";

  return (
    <>
      <style>{`
        @media print {
          .print-hide { display: none !important; }
          .print-section { page-break-inside: avoid; }
          @page { margin: 0.45in; size: landscape; }
          body { background: #fff !important; }
        }
      `}</style>

      {/* ── Sticky screen header ──────────────────────────────────────────── */}
      <div className="print-hide sticky top-0 z-10 bg-white border-b border-[#E5E7EB] px-4 py-3 flex items-center justify-between shadow-sm">
        <Link
          href={`/wip/${report.id}`}
          className="text-sm text-[#6B7280] hover:text-[#1B2A4A] transition-colors"
        >
          ← Back to WIP Editor
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#6B7280]">
            Executive Summary — {dateStr}
            {report.status === "final" && (
              <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-semibold">
                Finalized
              </span>
            )}
          </span>
          <button
            onClick={() => window.print()}
            className="bg-[#1B2A4A] hover:bg-[#243d70] text-white text-sm font-semibold px-4 py-1.5 rounded transition-colors"
          >
            Print Summary
          </button>
        </div>
      </div>

      <div className="px-4 py-6 bg-[#F5F5F5] min-h-screen">
        <div className="max-w-screen-xl mx-auto">

          {/* Print-only masthead */}
          <div className="hidden print:block text-center mb-8 border-b-2 border-[#1B2A4A] pb-4">
            <h1 className="text-2xl font-bold text-[#1B2A4A] tracking-widest uppercase">
              Vance Corporation
            </h1>
            <p className="text-base text-[#374151] mt-1">
              Work-in-Progress Executive Summary
            </p>
            <p className="text-sm text-[#6B7280] mt-0.5">
              Period Ending: {dateStr}
            </p>
          </div>

          {/* Screen title */}
          <div className="print-hide mb-6">
            <h1 className="text-2xl font-bold text-[#1A1A1A]">
              Executive Summary{" "}
              <span className="text-[#1B2A4A]">{dateStr}</span>
            </h1>
            <p className="text-sm text-[#6B7280] mt-1">
              Auto-generated narrative from the{" "}
              {report.status === "final" ? "finalized" : "draft"} WIP report.
            </p>
          </div>

          {/* ── PART 1: Narrative Summary ───────────────────────────────── */}
          <div className={sectionCls}>
            <h2 className={h2Cls}>Part 1 — Narrative Summary</h2>

            {/* Opening paragraph */}
            <p className="text-sm text-[#374151] leading-relaxed mb-4">
              For the period ending <strong>{dateStr}</strong>, Vance Corporation has{" "}
              <strong>{computed.length}</strong> active contract
              {computed.length !== 1 ? "s" : ""} with a combined portfolio value of{" "}
              <strong>${fmt$(totalRevised)}</strong>. The company has earned{" "}
              <strong>${fmt$(totalEarned)}</strong> to date against{" "}
              <strong>${fmt$(totalCosts)}</strong> in costs, resulting in a gross profit of{" "}
              <strong
                className={totalGP >= 0 ? "text-[#16A34A]" : "text-[#B22234]"}
              >
                {dollar(totalGP)}
              </strong>{" "}
              ({fmtPct(Math.abs(totalGpPct))}).
            </p>

            {/* Billings position paragraph */}
            <p className="text-sm text-[#374151] leading-relaxed mb-5">
              The company is currently{" "}
              <strong
                className={
                  netOverUnder >= 0 ? "text-[#16A34A]" : "text-[#B22234]"
                }
              >
                net {netOverUnder >= 0 ? "underbilled" : "overbilled"} by{" "}
                {dollar(Math.abs(netOverUnder))}
              </strong>
              . Total underbillings (costs and estimated earnings in excess of
              billings) stand at{" "}
              <strong className="text-[#16A34A]">{dollar(totalUnderbillings)}</strong>,
              while overbillings (billings in excess of costs and estimated
              earnings) total{" "}
              <strong className="text-[#B22234]">{dollar(totalOverbillings)}</strong>.
            </p>

            {/* YTD paragraph */}
            <p className="text-sm text-[#374151] leading-relaxed mb-5">
              On a year-to-date basis, the company has recognized{" "}
              <strong>${fmt$(totalCyRevenue)}</strong> in revenue against{" "}
              <strong>${fmt$(totalCyCosts)}</strong> in costs, yielding a current-year gross
              profit of{" "}
              <strong className={totalCyGp >= 0 ? "text-[#16A34A]" : "text-[#B22234]"}>
                {dollar(totalCyGp)}
              </strong>{" "}
              ({(totalCyGpPct * 100).toFixed(1)}% GP margin). YTD billings total{" "}
              <strong>${fmt$(totalCyBillings)}</strong>
              {totalCyRevenue > 0 && (
                <>
                  {" "}
                  — the company is billing at{" "}
                  <strong>
                    {((totalCyBillings / totalCyRevenue) * 100).toFixed(0)}%
                  </strong>{" "}
                  of earned revenue year-to-date.
                </>
              )}
            </p>

            {/* Per-job bullets */}
            {jobBullets.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-2.5">
                  Notable Job Activity
                </p>
                <ul className="space-y-2">
                  {jobBullets.map((bullet, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-[#374151]"
                    >
                      <span className="text-[#1B2A4A] mt-0.5 shrink-0 font-bold">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-[#9CA3AF] italic">
                No notable job activity to report for this period.
              </p>
            )}
          </div>

          {/* ── PART 2: Charts ──────────────────────────────────────────── */}
          <div className={sectionCls}>
            <h2 className={h2Cls}>Part 2 — Portfolio Charts</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 print:grid-cols-2">

              {/* Chart 1: Earned Revenue vs Billings (horizontal bar) */}
              <div>
                <p className={chartLabelCls}>Earned Revenue vs Billings to Date</p>
                <ResponsiveContainer width="100%" height={barChartHeight}>
                  <BarChart
                    data={billingsChartData}
                    layout="vertical"
                    margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#F3F4F6"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tickFormatter={fmtAxis}
                      tick={{ fontSize: 9, fill: "#6B7280" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 9, fill: "#1A1A1A", fontFamily: "monospace" }}
                      width={68}
                    />
                    <Tooltip formatter={dollarFmt} />
                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                    <Bar
                      dataKey="Earned Rev"
                      fill="#1B2A4A"
                      radius={[0, 3, 3, 0]}
                      barSize={11}
                    />
                    <Bar
                      dataKey="Billings ITD"
                      fill="#9CA3AF"
                      radius={[0, 3, 3, 0]}
                      barSize={11}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Chart 2: Pie — portfolio share by revised contract */}
              <div>
                <p className={chartLabelCls}>Portfolio Share by Contract Value</p>
                <ResponsiveContainer width="100%" height={barChartHeight}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius="62%"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      label={(p: any) =>
                        `${p.name} ${(p.percent * 100).toFixed(0)}%`
                      }
                      labelLine
                    >
                      {pieData.map((_, index) => (
                        <Cell
                          key={`pie-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={dollarFmt} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Chart 3: GP% by job (colored bars) */}
              <div>
                <p className={chartLabelCls}>
                  Estimated GP% by Job
                  <span className="ml-2 font-normal normal-case text-[#9CA3AF]">
                    wtd avg {(wtdAvgGpPct * 100).toFixed(1)}%
                  </span>
                </p>
                <ResponsiveContainer width="100%" height={barChartHeight}>
                  <BarChart
                    data={gpChartData}
                    layout="vertical"
                    margin={{ top: 0, right: 40, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#F3F4F6"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 9, fill: "#6B7280" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 9, fill: "#1A1A1A", fontFamily: "monospace" }}
                      width={68}
                    />
                    <Tooltip formatter={pctFmtTip} />
                    <Bar dataKey="gp" name="Est GP%" radius={[0, 3, 3, 0]} barSize={11}>
                      {gpChartData.map((entry, index) => (
                        <Cell
                          key={`gp-${index}`}
                          fill={
                            entry.gp < 0
                              ? "#B22234"
                              : entry.gp < wtdAvgGpPct * 100
                              ? "#D97706"
                              : "#16A34A"
                          }
                        />
                      ))}
                    </Bar>
                    <ReferenceLine
                      x={parseFloat((wtdAvgGpPct * 100).toFixed(1))}
                      stroke="#9CA3AF"
                      strokeDasharray="4 4"
                      label={{
                        value: `Wtd Avg: ${(wtdAvgGpPct * 100).toFixed(1)}%`,
                        position: "insideTopRight",
                        fontSize: 9,
                        fill: "#6B7280",
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Chart 4: Stacked — costs consumed vs remaining budget */}
              <div>
                <p className={chartLabelCls}>Budget Consumption</p>
                <ResponsiveContainer width="100%" height={barChartHeight}>
                  <BarChart
                    data={costChartData}
                    layout="vertical"
                    margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#F3F4F6"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tickFormatter={fmtAxis}
                      tick={{ fontSize: 9, fill: "#6B7280" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 9, fill: "#1A1A1A", fontFamily: "monospace" }}
                      width={68}
                    />
                    <Tooltip content={BudgetTooltip} />
                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                    <Bar
                      dataKey="Costs to Date"
                      stackId="cost"
                      fill="#1B2A4A"
                      barSize={11}
                    />
                    <Bar
                      dataKey="Remaining"
                      stackId="cost"
                      fill="#E5E7EB"
                      radius={[0, 3, 3, 0]}
                      barSize={11}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

            </div>
          </div>

          {/* ── PART 3: Recommendations ─────────────────────────────────── */}
          <div className={sectionCls}>
            <h2 className={h2Cls}>Part 3 — Recommendations</h2>

            {recommendations.length === 0 ? (
              <p className="text-sm text-[#9CA3AF] italic">
                No action items identified for this period.
              </p>
            ) : (
              <ol className="space-y-3">
                {recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="text-xs font-mono text-[#9CA3AF] mt-0.5 w-5 shrink-0 text-right">
                      {i + 1}.
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold shrink-0 min-w-[52px] justify-center ${priorityBadge(rec.priority)}`}
                    >
                      {rec.priority.toUpperCase()}
                    </span>
                    <span className="text-sm text-[#374151]">{rec.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
