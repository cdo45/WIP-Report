import sql from "@/db";
import WipListClient from "./WipListClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface WipReport {
  id: number;
  period_date: string;
  status: string;
  finalized_at: string | null;
  created_at: string;
}

interface ActiveJob {
  id: number;
  job_number: string;
  job_name: string;
}

export default async function WipPage() {
  let reports: WipReport[] = [];
  let activeJobs: ActiveJob[] = [];
  let readyToCloseJobIds: number[] = [];

  try {
    reports = (await sql`
      SELECT id, period_date, status, finalized_at, created_at
      FROM wip_reports
      ORDER BY period_date DESC
    `) as WipReport[];

    activeJobs = (await sql`
      SELECT id, job_number, job_name
      FROM jobs
      WHERE status = 'Active'
      ORDER BY job_number
    `) as ActiveJob[];

    // Find jobs that are 100% complete with no current-period activity in the
    // most recent finalized report — these will be unchecked by default when
    // creating a new report.
    const priorRows = await sql`
      SELECT DISTINCT wli.job_id
      FROM wip_line_items wli
      JOIN wip_reports wr ON wr.id = wli.report_id
      WHERE wr.status = 'final'
        AND wr.id = (
          SELECT id FROM wip_reports WHERE status = 'final'
          ORDER BY period_date DESC LIMIT 1
        )
        AND wli.cp_costs = 0
        AND wli.cp_billings = 0
        AND wli.est_total_cost > 0
        AND (
          (wli.pm_pct_override IS NOT NULL AND wli.pm_pct_override >= 1)
          OR (NOT wli.is_prior_locked AND wli.costs_to_date >= wli.est_total_cost)
          OR (wli.is_prior_locked AND (wli.prior_itd_costs + wli.cp_costs) >= wli.est_total_cost)
        )
    `;
    readyToCloseJobIds = priorRows.map((r) => r.job_id as number);
  } catch (err) {
    console.error("Failed to fetch WIP data:", err);
  }

  return <WipListClient reports={reports} activeJobs={activeJobs} readyToCloseJobIds={readyToCloseJobIds} />;
}
