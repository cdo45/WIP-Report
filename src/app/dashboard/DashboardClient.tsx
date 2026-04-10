"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  ComposedChart,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { DashLineItem, TrendRow } from "./page";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(n: number) {
  return Math.round(n).toLocaleString("en-US");
}
function fmtPct(n: number) {
  return (n * 100).toFixed(1) + "%";
}
function toDateStr(d: string) {
  return new Date(d).toISOString().slice(0, 10);
}
function fmtAxis(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function calcItem(item: DashLineItem) {
  const revisedContract = Number(item.revised_contract);
  const estTotalCost = Number(item.est_total_cost);
  const costsToDate = Number(item.costs_to_date);
  const billingsToDate = Number(item.billings_to_date);
  const pmOverride = item.pm_pct_override != null ? Number(item.pm_pct_override) : null;
  const pctComplete = estTotalCost > 0 ? costsToDate / estTotalCost : 0;
  const effectivePct = pmOverride !== null ? pmOverride : pctComplete;
  const earnedRevenue =
    effectivePct >= 1
      ? Math.max(billingsToDate, revisedContract)
      : effectivePct * revisedContract;
  const overUnder = earnedRevenue - billingsToDate;
  const backlog = revisedContract - earnedRevenue;
  const itdGp = earnedRevenue - costsToDate;
  const itdGpPct = earnedRevenue !== 0 ? itdGp / earnedRevenue : 0;
  const estGpPct =
    revisedContract > 0 ? (revisedContract - estTotalCost) / revisedContract : 0;
  const pyEarned = Number(item.prior_year_earned);
  const pyBillings = Number(item.prior_year_billings);
  const pyCosts = Number(item.prior_year_costs);
  const cyEarned = earnedRevenue - pyEarned;
  const cyBillings = billingsToDate - pyBillings;
  const cyCosts = costsToDate - pyCosts;
  const cyGp = cyEarned - cyCosts;
  return {
    revisedContract,
    estTotalCost,
    costsToDate,
    billingsToDate,
    pctComplete,
    earnedRevenue,
    overUnder,
    backlog,
    itdGp,
    itdGpPct,
    estGpPct,
    cyEarned,
    cyBillings,
    cyCosts,
    cyGp,
  };
}

interface RiskFlag {
  jobNumber: string;
  jobName: string;
  issue: string;
  severity: "red" | "yellow";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardClient({
  latestReport,
  latestItems,
  trendRows,
}: {
  latestReport: { id: number; period_date: string };
  latestItems: DashLineItem[];
  trendRows: TrendRow[];
}) {
  const computed = useMemo(
    () => latestItems.map((item) => ({ item, ...calcItem(item) })),
    [latestItems]
  );

  // ── Summary totals ────────────────────────────────────────────────────────
  const totalRevised = computed.reduce((s, r) => s + r.revisedContract, 0);
  const totalEstCost = computed.reduce((s, r) => s + r.estTotalCost, 0);
  const totalUnderbillings = computed.reduce((s, r) => s + Math.max(0, r.overUnder), 0);
  const totalOverbillings = computed.reduce((s, r) => s + Math.max(0, -r.overUnder), 0);
  const netOverUnder = totalUnderbillings - totalOverbillings;
  const totalBacklog = computed.reduce((s, r) => s + r.backlog, 0);
  const totalCyRevenue = computed.reduce((s, r) => s + r.cyEarned, 0);
  const totalCyCosts = computed.reduce((s, r) => s + r.cyCosts, 0);
  const totalCyBillings = computed.reduce((s, r) => s + r.cyBillings, 0);
  const totalCyGp = totalCyRevenue - totalCyCosts;
  const ytdGpPct = totalCyRevenue > 0 ? totalCyGp / totalCyRevenue : 0;
  const wtdAvgGp = totalRevised > 0 ? (totalRevised - totalEstCost) / totalRevised : 0;

  // Prior year totals (baseline from current report's line items)
  const priorYearRevenue  = computed.reduce((s, r) => s + Number(r.item.prior_year_earned), 0);
  const priorYearCosts    = computed.reduce((s, r) => s + Number(r.item.prior_year_costs), 0);
  const priorYearBillings = computed.reduce((s, r) => s + Number(r.item.prior_year_billings), 0);
  const priorYearGp       = priorYearRevenue - priorYearCosts;
  const priorYearGpPct    = priorYearRevenue > 0 ? priorYearGp / priorYearRevenue : 0;

  // ── Chart data ────────────────────────────────────────────────────────────
  const billingsChartData = [
    { name: "Underbillings", value: totalUnderbillings },
    { name: "Overbillings", value: totalOverbillings },
  ];

  // ── Top/bottom tables ─────────────────────────────────────────────────────
  const top5Backlog = [...computed]
    .filter((r) => r.backlog > 0)
    .sort((a, b) => b.backlog - a.backlog)
    .slice(0, 5);

  const bottom5Gp = [...computed]
    .sort((a, b) => a.itdGpPct - b.itdGpPct)
    .slice(0, 5);

  // ── Risk flags ────────────────────────────────────────────────────────────
  const riskFlags = useMemo<RiskFlag[]>(() => {
    const flags: RiskFlag[] = [];
    for (const {
      item,
      pctComplete,
      costsToDate,
      billingsToDate,
      revisedContract,
      estTotalCost,
    } of computed) {
      if (pctComplete > 1.0 && estTotalCost > 0) {
        flags.push({
          jobNumber: item.job_number,
          jobName: item.job_name,
          issue: `Cost overrun — ${(pctComplete * 100).toFixed(0)}% cost complete`,
          severity: "red",
        });
      }
      const billingPct = revisedContract > 0 ? billingsToDate / revisedContract : 0;
      const costPct = estTotalCost > 0 ? costsToDate / estTotalCost : 0;
      if (Math.abs(billingPct - costPct) > 0.1 && revisedContract > 5_000) {
        flags.push({
          jobNumber: item.job_number,
          jobName: item.job_name,
          issue: `Billing/cost gap: ${(billingPct * 100).toFixed(0)}% billed vs ${(costPct * 100).toFixed(0)}% cost complete`,
          severity: "yellow",
        });
      }
      if (costsToDate > 0 && billingsToDate === 0) {
        flags.push({
          jobNumber: item.job_number,
          jobName: item.job_name,
          issue: "Costs incurred with no billings to date",
          severity: "yellow",
        });
      }
      const hasPrior =
        Number(item.prior_itd_costs) > 0 || Number(item.prior_itd_billings) > 0;
      if (hasPrior && Number(item.cp_costs) === 0 && Number(item.cp_billings) === 0) {
        flags.push({
          jobNumber: item.job_number,
          jobName: item.job_name,
          issue: "No current-period activity (CP costs & billings both $0)",
          severity: "yellow",
        });
      }
    }
    return flags;
  }, [computed]);

  // ── Period trend ──────────────────────────────────────────────────────────
  const trendPoints = useMemo(() => {
    const map = new Map<
      string,
      { underbillings: number; overbillings: number; cyRevenue: number; cyCosts: number; cyBillings: number }
    >();
    for (const row of trendRows) {
      const key = new Date(row.period_date).toISOString().slice(0, 7); // "YYYY-MM"
      if (!map.has(key)) map.set(key, { underbillings: 0, overbillings: 0, cyRevenue: 0, cyCosts: 0, cyBillings: 0 });
      const agg = map.get(key)!;
      const costsToDate = Number(row.costs_to_date);
      const billingsToDate = Number(row.billings_to_date);
      const revisedContract = Number(row.revised_contract);
      const estTotalCost = Number(row.est_total_cost);
      const pmOverride = row.pm_pct_override != null ? Number(row.pm_pct_override) : null;
      const pctComplete = estTotalCost > 0 ? costsToDate / estTotalCost : 0;
      const effectivePct = pmOverride !== null ? pmOverride : pctComplete;
      const earnedRevenue =
        effectivePct >= 1
          ? Math.max(billingsToDate, revisedContract)
          : effectivePct * revisedContract;
      const overUnder = earnedRevenue - billingsToDate;
      if (overUnder > 0) agg.underbillings += overUnder;
      else agg.overbillings += -overUnder;
      agg.cyRevenue   += earnedRevenue   - Number(row.prior_year_earned);
      agg.cyCosts     += costsToDate     - Number(row.prior_year_costs);
      agg.cyBillings  += billingsToDate  - Number(row.prior_year_billings);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, agg]) => ({
        period,
        underbillings: Math.round(agg.underbillings),
        overbillings:  Math.round(agg.overbillings),
        netOverUnder:  Math.round(agg.underbillings - agg.overbillings),
        cyRevenue:     Math.round(agg.cyRevenue),
        cyCosts:       Math.round(agg.cyCosts),
        cyBillings:    Math.round(agg.cyBillings),
        cyGp:          Math.round(agg.cyRevenue - agg.cyCosts),
      }));
  }, [trendRows]);

  // ── YTD new contracts (jobs first appearing in current fiscal year) ────────
  const ytdNewContracts = useMemo(() => {
    const fy = new Date(latestReport.period_date).getFullYear();
    const fyStart = `${fy}-01`; // "YYYY-MM" prefix comparison
    const priorJobIds = new Set<number>();
    for (const row of trendRows) {
      const period = new Date(row.period_date).toISOString().slice(0, 7);
      if (period < fyStart) priorJobIds.add(row.job_id);
    }
    return latestItems
      .filter((item) => !priorJobIds.has(item.job_id))
      .reduce((s, item) => s + Number(item.original_contract) + Number(item.approved_cos), 0);
  }, [trendRows, latestItems, latestReport.period_date]);

  // ── Fiscal-year incremental trend points ─────────────────────────────────
  const fyPoints = useMemo(() => {
    const fy = new Date(latestReport.period_date).getFullYear();
    const fyStart = `${fy}-01`;
    const filtered = trendPoints.filter((p) => p.period >= fyStart);
    return filtered.map((point, i) => {
      const prev = i > 0 ? filtered[i - 1] : null;
      return {
        period:      point.period,
        incrRevenue: Math.round(prev ? point.cyRevenue  - prev.cyRevenue  : point.cyRevenue),
        incrCosts:   Math.round(prev ? point.cyCosts    - prev.cyCosts    : point.cyCosts),
        incrGp:      Math.round(prev ? point.cyGp       - prev.cyGp       : point.cyGp),
        cumGp:       point.cyGp,    // cumulative YTD GP as of this period
      };
    });
  }, [trendPoints, latestReport.period_date]);

  // ── GP fade ───────────────────────────────────────────────────────────────
  const gpFade = useMemo(
    () =>
      computed
        .map(({ item, estGpPct }) => {
          const origRevenue = Number(item.original_contract) + Number(item.approved_cos);
          const originalGp =
            origRevenue > 0
              ? ((origRevenue - Number(item.job_est_total_cost)) / origRevenue) * 100
              : 0;
          const currentGp = estGpPct * 100;
          return {
            jobNumber: item.job_number,
            jobName: item.job_name,
            originalGp,
            currentGp,
            delta: currentGp - originalGp,
          };
        })
        .sort((a, b) => a.delta - b.delta),
    [computed]
  );

  // ─────────────────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFmt = (value: any) => `$${fmt$(Number(value ?? 0))}`;

  return (
    <div className="px-4 py-8">
      <div className="max-w-screen-xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <p className="text-xs text-[#6B7280] mb-1">
            Based on finalized report — period ending {toDateStr(latestReport.period_date)}
          </p>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Dashboard</h1>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <SummaryCard label="Active Jobs" value={String(computed.length)} />
          <SummaryCard label="Portfolio Value" value={`$${fmtInt(totalRevised)}`} />
          <SummaryCard label="Total Backlog" value={`$${fmtInt(totalBacklog)}`} />
          <SummaryCard label="Wtd Avg GP%" value={fmtPct(wtdAvgGp)} />
          <SummaryCard
            label="Net Over/Under"
            value={`${netOverUnder >= 0 ? "+" : ""}$${fmtInt(netOverUnder)}`}
            valueColor={netOverUnder >= 0 ? "text-[#16A34A]" : "text-[#B22234]"}
          />
          <SummaryCard
            label="CY Gross Profit"
            value={`$${fmtInt(totalCyGp)}`}
            valueColor={totalCyGp >= 0 ? "text-[#16A34A]" : "text-[#B22234]"}
          />
        </div>

        {/* Billings chart + top tables */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Billings position bar chart */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm p-5">
            <h2 className="text-sm font-semibold text-[#1B2A4A] mb-4">Billings Position</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={billingsChartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#6B7280" }} />
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 9, fill: "#6B7280" }} width={56} />
                <Tooltip formatter={tooltipFmt} />
                <Bar dataKey="value" fill="#1B2A4A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 pt-3 border-t border-[#E5E7EB] space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-[#6B7280]">Underbillings</span>
                <span className="font-mono text-[#16A34A] font-semibold">${fmt$(totalUnderbillings)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B7280]">Overbillings</span>
                <span className="font-mono text-[#B22234] font-semibold">${fmt$(totalOverbillings)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-[#E5E7EB]">
                <span className="font-semibold text-[#1A1A1A]">Net</span>
                <span className={`font-mono font-semibold ${netOverUnder >= 0 ? "text-[#16A34A]" : "text-[#B22234]"}`}>
                  {netOverUnder >= 0 ? "+" : ""}${fmt$(netOverUnder)}
                </span>
              </div>
            </div>
          </div>

          {/* Top 5 backlog */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm p-5">
            <h2 className="text-sm font-semibold text-[#1B2A4A] mb-3">Top 5 by Backlog</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E5E7EB]">
                  <th className="text-left py-1.5 text-[#6B7280] font-semibold">Job</th>
                  <th className="text-right py-1.5 text-[#6B7280] font-semibold">Backlog</th>
                </tr>
              </thead>
              <tbody>
                {top5Backlog.map(({ item, backlog }) => (
                  <tr key={item.id} className="border-b border-[#F3F4F6]">
                    <td className="py-1.5">
                      <div className="font-mono text-[#1A1A1A] font-semibold">{item.job_number}</div>
                      <div className="text-[#6B7280] truncate max-w-[140px]">{item.job_name}</div>
                    </td>
                    <td className="text-right font-mono text-[#1A1A1A] font-semibold py-1.5">
                      ${fmtInt(backlog)}
                    </td>
                  </tr>
                ))}
                {top5Backlog.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-6 text-center text-[#9CA3AF]">
                      No backlog
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Bottom 5 GP% */}
          <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm p-5">
            <h2 className="text-sm font-semibold text-[#1B2A4A] mb-3">Bottom 5 by GP%</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E5E7EB]">
                  <th className="text-left py-1.5 text-[#6B7280] font-semibold">Job</th>
                  <th className="text-right py-1.5 text-[#6B7280] font-semibold">ITD GP%</th>
                </tr>
              </thead>
              <tbody>
                {bottom5Gp.map(({ item, itdGpPct }) => (
                  <tr key={item.id} className="border-b border-[#F3F4F6]">
                    <td className="py-1.5">
                      <div className="font-mono text-[#1A1A1A] font-semibold">{item.job_number}</div>
                      <div className="text-[#6B7280] truncate max-w-[140px]">{item.job_name}</div>
                    </td>
                    <td
                      className={`text-right font-mono font-semibold py-1.5 ${
                        itdGpPct < 0
                          ? "text-[#B22234]"
                          : itdGpPct < 0.05
                          ? "text-[#D97706]"
                          : "text-[#1A1A1A]"
                      }`}
                    >
                      {fmtPct(itdGpPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Risk flags */}
        <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm p-5">
          <h2 className="text-sm font-semibold text-[#1B2A4A] mb-3">
            Risk Flags{" "}
            <span className="text-[#6B7280] font-normal">({riskFlags.length})</span>
          </h2>
          {riskFlags.length === 0 ? (
            <p className="text-xs text-[#9CA3AF]">No risk flags detected.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#1B2A4A] text-white text-left">
                    <th className="px-3 py-2 font-semibold whitespace-nowrap">Job #</th>
                    <th className="px-3 py-2 font-semibold">Job Name</th>
                    <th className="px-3 py-2 font-semibold">Issue</th>
                    <th className="px-3 py-2 font-semibold text-center whitespace-nowrap">Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {riskFlags.map((flag, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]"}>
                      <td className="px-3 py-2 font-mono">{flag.jobNumber}</td>
                      <td className="px-3 py-2 text-[#374151]">{flag.jobName}</td>
                      <td className="px-3 py-2 text-[#374151]">{flag.issue}</td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            flag.severity === "red"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {flag.severity === "red" ? "High" : "Medium"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Period trend charts — only show if 2+ periods */}
        {trendPoints.length >= 2 && (
          <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm p-5">
            <h2 className="text-sm font-semibold text-[#1B2A4A] mb-6">Period Trends</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

              <div>
                <p className="text-xs font-medium text-[#6B7280] mb-3">Net Over/Under</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trendPoints} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="period" tick={{ fontSize: 9, fill: "#6B7280" }} />
                    <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 9, fill: "#6B7280" }} width={56} />
                    <Tooltip formatter={tooltipFmt} />
                    <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="3 3" />
                    <Line
                      type="monotone"
                      dataKey="netOverUnder"
                      stroke="#1B2A4A"
                      strokeWidth={2}
                      dot
                      name="Net Over/Under"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div>
                <p className="text-xs font-medium text-[#6B7280] mb-3">CY Revenue vs Costs</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trendPoints} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="period" tick={{ fontSize: 9, fill: "#6B7280" }} />
                    <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 9, fill: "#6B7280" }} width={56} />
                    <Tooltip formatter={tooltipFmt} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <Bar dataKey="cyRevenue" name="CY Revenue" fill="#1B2A4A" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="cyCosts" name="CY Costs" fill="#9CA3AF" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <p className="text-xs font-medium text-[#6B7280] mb-3">CY Gross Profit</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trendPoints} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="period" tick={{ fontSize: 9, fill: "#6B7280" }} />
                    <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 9, fill: "#6B7280" }} width={56} />
                    <Tooltip formatter={tooltipFmt} />
                    <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="3 3" />
                    <Line
                      type="monotone"
                      dataKey="cyGp"
                      stroke="#16A34A"
                      strokeWidth={2}
                      dot
                      name="CY GP"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ── YTD Statistics ─────────────────────────────────────────────── */}
        <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm p-5">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-[#1B2A4A]">Year-to-Date Statistics</h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Fiscal year {new Date(latestReport.period_date).getFullYear()} · through {toDateStr(latestReport.period_date)}
            </p>
          </div>

          {/* 6 YTD summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <SummaryCard label="YTD Revenue" value={`$${fmtInt(totalCyRevenue)}`} />
            <SummaryCard label="YTD Costs" value={`$${fmtInt(totalCyCosts)}`} />
            <SummaryCard
              label="YTD Gross Profit"
              value={`$${fmtInt(totalCyGp)}`}
              valueColor={totalCyGp >= 0 ? "text-[#16A34A]" : "text-[#B22234]"}
            />
            <SummaryCard
              label="YTD GP%"
              value={(ytdGpPct * 100).toFixed(1) + "%"}
              valueColor={ytdGpPct >= 0.1 ? "text-[#16A34A]" : ytdGpPct > 0 ? "text-[#D97706]" : "text-[#B22234]"}
            />
            <SummaryCard label="YTD Billings" value={`$${fmtInt(totalCyBillings)}`} />
            <SummaryCard label="YTD New Contracts" value={`$${fmtInt(ytdNewContracts)}`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* YTD trend chart — incremental bars + cumulative GP line */}
            {fyPoints.length >= 1 && (
              <div>
                <p className="text-xs font-medium text-[#6B7280] mb-3">
                  YTD Revenue, Costs &amp; Cumulative GP
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={fyPoints} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="period" tick={{ fontSize: 9, fill: "#6B7280" }} />
                    <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 9, fill: "#6B7280" }} width={56} />
                    <Tooltip formatter={tooltipFmt} />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <Bar dataKey="incrRevenue" name="Revenue" fill="#1B2A4A" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="incrCosts"   name="Costs"   fill="#9CA3AF" radius={[2, 2, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="cumGp"
                      name="Cumul. GP"
                      stroke="#16A34A"
                      strokeWidth={2}
                      dot
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* YTD vs Prior Year comparison table */}
            <div>
              <p className="text-xs font-medium text-[#6B7280] mb-3">YTD vs Prior Year</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#1B2A4A] text-white text-left">
                    <th className="px-3 py-2 font-semibold">Metric</th>
                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                      YTD {new Date(latestReport.period_date).getFullYear()}
                    </th>
                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                      Prior Year
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: "Revenue",
                      ytd: totalCyRevenue,
                      py: priorYearRevenue,
                      fmt: (v: number) => `$${fmtInt(v)}`,
                    },
                    {
                      label: "Costs",
                      ytd: totalCyCosts,
                      py: priorYearCosts,
                      fmt: (v: number) => `$${fmtInt(v)}`,
                    },
                    {
                      label: "Gross Profit",
                      ytd: totalCyGp,
                      py: priorYearGp,
                      fmt: (v: number) => `$${fmtInt(v)}`,
                    },
                    {
                      label: "GP%",
                      ytd: ytdGpPct * 100,
                      py: priorYearGpPct * 100,
                      fmt: (v: number) => v.toFixed(1) + "%",
                    },
                    {
                      label: "Billings",
                      ytd: totalCyBillings,
                      py: priorYearBillings,
                      fmt: (v: number) => `$${fmtInt(v)}`,
                    },
                  ].map(({ label, ytd, py, fmt }, i) => {
                    const delta = ytd - py;
                    const deltaColor =
                      delta > 0 ? "text-[#16A34A]" : delta < 0 ? "text-[#B22234]" : "text-[#6B7280]";
                    return (
                      <tr key={label} className={i % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]"}>
                        <td className="px-3 py-2 text-[#374151]">{label}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(ytd)}</td>
                        <td className="px-3 py-2 text-right font-mono text-[#6B7280]">{fmt(py)}</td>
                        <td className={`px-3 py-2 text-right font-mono font-semibold ${deltaColor}`}>
                          {delta >= 0 ? "+" : ""}
                          {fmt(delta)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* GP fade table */}
        <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm p-5">
          <h2 className="text-sm font-semibold text-[#1B2A4A] mb-1">GP Fade Analysis</h2>
          <p className="text-xs text-[#6B7280] mb-4">
            Budgeted GP% (from jobs table) vs current estimated GP% per job
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#1B2A4A] text-white text-left">
                  <th className="px-3 py-2 font-semibold whitespace-nowrap">Job #</th>
                  <th className="px-3 py-2 font-semibold">Job Name</th>
                  <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Original GP%</th>
                  <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Current Est GP%</th>
                  <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Δ GP%</th>
                </tr>
              </thead>
              <tbody>
                {gpFade.map(({ jobNumber, jobName, originalGp, currentGp, delta }, i) => (
                  <tr
                    key={jobNumber}
                    className={`${i % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]"} ${
                      delta < -5 ? "border-l-2 border-l-[#B22234]" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-mono">{jobNumber}</td>
                    <td className="px-3 py-2 text-[#374151]">{jobName}</td>
                    <td className="px-3 py-2 text-right font-mono">{originalGp.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right font-mono">{currentGp.toFixed(1)}%</td>
                    <td
                      className={`px-3 py-2 text-right font-mono font-semibold ${
                        delta < -5
                          ? "text-[#B22234]"
                          : delta < 0
                          ? "text-[#D97706]"
                          : delta > 0
                          ? "text-[#16A34A]"
                          : "text-[#6B7280]"
                      }`}
                    >
                      {delta >= 0 ? "+" : ""}
                      {delta.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  valueColor = "text-[#1A1A1A]",
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm p-4">
      <p className="text-xs text-[#6B7280] mb-1">{label}</p>
      <p className={`text-base font-bold font-mono leading-tight ${valueColor}`}>{value}</p>
    </div>
  );
}
