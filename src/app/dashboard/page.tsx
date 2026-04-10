import sql from "@/db";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface DashLineItem {
  id: number;
  job_id: number;
  job_number: string;
  job_name: string;
  original_contract: number;
  approved_cos: number;
  job_est_total_cost: number;
  revised_contract: number;
  est_total_cost: number;
  costs_to_date: number;
  billings_to_date: number;
  pm_pct_override: number | null;
  prior_year_earned: number;
  prior_year_billings: number;
  prior_year_costs: number;
  cp_costs: number;
  cp_billings: number;
  prior_itd_costs: number;
  prior_itd_billings: number;
  is_prior_locked: boolean;
}

export interface TrendRow {
  report_id: number;
  period_date: string;
  revised_contract: number;
  est_total_cost: number;
  costs_to_date: number;
  billings_to_date: number;
  pm_pct_override: number | null;
  prior_year_earned: number;
  prior_year_costs: number;
}

export default async function DashboardPage() {
  let latestReport: { id: number; period_date: string } | null = null;
  let latestItems: DashLineItem[] = [];
  let trendRows: TrendRow[] = [];

  try {
    const [latest] = await sql`
      SELECT id, period_date FROM wip_reports
      WHERE status = 'final'
      ORDER BY period_date DESC LIMIT 1
    `;

    if (latest) {
      latestReport = { id: latest.id as number, period_date: String(latest.period_date) };

      latestItems = (await sql`
        SELECT
          wli.id, wli.job_id,
          j.job_number, j.job_name,
          j.original_contract, j.approved_cos, j.est_total_cost AS job_est_total_cost,
          wli.revised_contract, wli.est_total_cost,
          wli.costs_to_date, wli.billings_to_date,
          wli.pm_pct_override,
          wli.prior_year_earned, wli.prior_year_billings, wli.prior_year_costs,
          wli.cp_costs, wli.cp_billings,
          wli.prior_itd_costs, wli.prior_itd_billings,
          wli.is_prior_locked
        FROM wip_line_items wli
        JOIN jobs j ON j.id = wli.job_id
        WHERE wli.report_id = ${latest.id}
        ORDER BY j.job_number
      `) as DashLineItem[];

      // All finalized report line items for trend charts
      trendRows = (await sql`
        SELECT
          wli.report_id,
          wr.period_date,
          wli.revised_contract, wli.est_total_cost,
          wli.costs_to_date, wli.billings_to_date,
          wli.pm_pct_override,
          wli.prior_year_earned, wli.prior_year_costs
        FROM wip_line_items wli
        JOIN wip_reports wr ON wr.id = wli.report_id
        WHERE wr.status = 'final'
        ORDER BY wr.period_date, wr.id
      `) as TrendRow[];
    }
  } catch (err) {
    console.error("Dashboard fetch error:", err);
  }

  if (!latestReport) {
    return (
      <div className="px-4 py-10">
        <div className="max-w-screen-xl mx-auto">
          <h1 className="text-2xl font-bold mb-2 text-[#1A1A1A]">Dashboard</h1>
          <p className="text-[#6B7280] py-20 text-center">
            No finalized WIP reports yet. Finalize a report to see dashboard data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <DashboardClient
      latestReport={latestReport}
      latestItems={latestItems}
      trendRows={trendRows}
    />
  );
}
