import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import sql from "@/db";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const reportId = parseInt(params.id, 10);
    const { job_id } = await request.json();

    if (!job_id) {
      return NextResponse.json({ error: "job_id is required" }, { status: 400 });
    }

    // Verify report exists
    const [report] = await sql`
      SELECT id, period_date FROM wip_reports WHERE id = ${reportId}
    `;
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Prevent duplicates
    const [existing] = await sql`
      SELECT id FROM wip_line_items WHERE report_id = ${reportId} AND job_id = ${job_id}
    `;
    if (existing) {
      return NextResponse.json({ error: "Job is already in this report" }, { status: 409 });
    }

    // Get job defaults
    const [jobRow] = await sql`
      SELECT original_contract + approved_cos AS revised_contract, est_total_cost
      FROM jobs WHERE id = ${job_id}
    `;
    if (!jobRow) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    let revised_contract  = Number(jobRow.revised_contract ?? 0);
    let est_total_cost    = Number(jobRow.est_total_cost   ?? 0);
    let prior_year_earned   = 0;
    let prior_year_billings = 0;
    let prior_year_costs    = 0;
    let prior_itd_billings  = 0;
    let prior_itd_costs     = 0;
    let is_prior_locked     = false;

    // Find the most recent finalized report before this report's period_date
    const [priorReport] = await sql`
      SELECT id FROM wip_reports
      WHERE status = 'final' AND period_date < ${report.period_date}
      ORDER BY period_date DESC
      LIMIT 1
    `;

    if (priorReport) {
      const [priorItem] = await sql`
        SELECT costs_to_date, billings_to_date, pm_pct_override,
               revised_contract, est_total_cost
        FROM wip_line_items
        WHERE report_id = ${priorReport.id} AND job_id = ${job_id}
      `;

      if (priorItem) {
        revised_contract = Number(priorItem.revised_contract ?? revised_contract);
        est_total_cost   = Number(priorItem.est_total_cost   ?? est_total_cost);

        const costsToDate    = Number(priorItem.costs_to_date);
        const billingsToDate = Number(priorItem.billings_to_date);
        const pmOverride     = priorItem.pm_pct_override != null
          ? Number(priorItem.pm_pct_override)
          : null;

        const pctComplete   = est_total_cost > 0 ? costsToDate / est_total_cost : 0;
        const effectivePct  = pmOverride !== null ? pmOverride : pctComplete;
        const earnedRevenue = effectivePct >= 1
          ? Math.max(billingsToDate, revised_contract)
          : effectivePct * revised_contract;

        prior_year_earned   = earnedRevenue;
        prior_year_billings = billingsToDate;
        prior_year_costs    = costsToDate;
        prior_itd_billings  = billingsToDate;
        prior_itd_costs     = costsToDate;
        is_prior_locked     = true;
      }
    }

    // Insert new line item
    const [newItem] = await sql`
      INSERT INTO wip_line_items (
        report_id, job_id,
        revised_contract, est_total_cost,
        cp_costs, cp_billings,
        prior_itd_costs, prior_itd_billings,
        costs_to_date, billings_to_date,
        prior_year_earned, prior_year_billings, prior_year_costs,
        is_prior_locked
      ) VALUES (
        ${reportId}, ${job_id},
        ${revised_contract}, ${est_total_cost},
        0, 0,
        ${prior_itd_costs}, ${prior_itd_billings},
        ${prior_itd_costs}, ${prior_itd_billings},
        ${prior_year_earned}, ${prior_year_billings}, ${prior_year_costs},
        ${is_prior_locked}
      )
      RETURNING *
    `;

    // Return with job info so the client can add the row immediately
    const [fullRow] = await sql`
      SELECT
        wli.*,
        j.job_number, j.job_name, j.job_type,
        j.original_contract, j.approved_cos, j.original_gp_pct,
        j.est_total_cost AS job_est_total_cost
      FROM wip_line_items wli
      JOIN jobs j ON j.id = wli.job_id
      WHERE wli.id = ${newItem.id}
    `;

    console.log(`Added job_id=${job_id} to report ${reportId}: line_item id=${newItem.id} prior_locked=${is_prior_locked} prior_year_earned=${prior_year_earned}`);

    revalidatePath("/wip");
    return NextResponse.json(fullRow, { status: 201 });
  } catch (error) {
    console.error("POST /api/wip-reports/[id]/line-items error:", error);
    return NextResponse.json({ error: "Failed to add job to report" }, { status: 500 });
  }
}
