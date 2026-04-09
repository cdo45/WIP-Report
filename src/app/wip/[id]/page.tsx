import sql from "@/db";
import WipEditor from "./WipEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface WipReport {
  id: number;
  period_date: string;
  status: string;
  finalized_at: string | null;
}

export interface LineItemWithJob {
  id: number;
  report_id: number;
  job_id: number;
  job_number: string;
  job_name: string;
  job_type: string;
  original_contract: number;
  approved_cos: number;
  original_gp_pct: number;
  // Editable per-line-item values (from wip_line_items)
  revised_contract: number;
  est_total_cost: number;
  costs_to_date: number;
  billings_to_date: number;
  pm_pct_override: number | null;
  prior_year_earned: number;
  prior_year_billings: number;
  prior_year_costs: number;
  is_prior_locked: boolean;
  notes: string | null;
}

export default async function WipReportPage({
  params,
}: {
  params: { id: string };
}) {
  const id = parseInt(params.id, 10);
  let report: WipReport | null = null;
  let lineItems: LineItemWithJob[] = [];

  try {
    const [row] = await sql`SELECT * FROM wip_reports WHERE id = ${id}`;
    report = (row as WipReport) ?? null;

    if (report) {
      lineItems = (await sql`
        SELECT
          wli.*,
          j.job_number, j.job_name, j.job_type,
          j.original_contract, j.approved_cos, j.original_gp_pct
        FROM wip_line_items wli
        JOIN jobs j ON j.id = wli.job_id
        WHERE wli.report_id = ${id}
        ORDER BY j.job_number
      `) as LineItemWithJob[];
    }
  } catch (err) {
    console.error("Failed to fetch WIP report:", err);
  }

  if (!report) {
    return (
      <div className="flex items-center justify-center py-40">
        <p className="text-gray-400 text-lg">Report not found.</p>
      </div>
    );
  }

  return <WipEditor report={report} initialLineItems={lineItems} />;
}
