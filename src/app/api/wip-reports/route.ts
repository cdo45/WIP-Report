import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import sql from "@/db";

export async function GET() {
  try {
    const reports = await sql`
      SELECT * FROM wip_reports ORDER BY period_date DESC
    `;
    return NextResponse.json(reports);
  } catch (error) {
    console.error("GET /api/wip-reports error:", error);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { period_date, job_ids } = await request.json();

    // Find most recent finalized report before this period
    const [priorReport] = await sql`
      SELECT id FROM wip_reports
      WHERE status = 'final' AND period_date < ${period_date}
      ORDER BY period_date DESC
      LIMIT 1
    `;

    // Create the report record
    const [report] = await sql`
      INSERT INTO wip_reports (period_date, status)
      VALUES (${period_date}, 'draft')
      RETURNING *
    `;

    // Create a line item for each job, auto-populating prior data if available
    for (const job_id of job_ids) {
      let prior_year_earned = 0;
      let prior_year_billings = 0;
      let prior_year_costs = 0;
      let is_prior_locked = false;

      if (priorReport) {
        const [priorItem] = await sql`
          SELECT
            wli.costs_to_date,
            wli.billings_to_date,
            wli.pm_pct_override,
            (j.original_contract + j.approved_cos) AS revised_contract,
            j.est_total_cost
          FROM wip_line_items wli
          JOIN jobs j ON j.id = wli.job_id
          WHERE wli.report_id = ${priorReport.id}
            AND wli.job_id = ${job_id}
        `;

        if (priorItem) {
          const revisedContract = Number(priorItem.revised_contract);
          const estTotalCost = Number(priorItem.est_total_cost);
          const costsToDate = Number(priorItem.costs_to_date);
          const billingsToDate = Number(priorItem.billings_to_date);
          const pmOverride =
            priorItem.pm_pct_override != null
              ? Number(priorItem.pm_pct_override)
              : null;

          const pctComplete = estTotalCost > 0 ? costsToDate / estTotalCost : 0;
          const effectivePct = pmOverride !== null ? pmOverride : pctComplete;
          const earnedRevenue =
            effectivePct >= 1 ? billingsToDate : effectivePct * revisedContract;

          prior_year_earned = earnedRevenue;
          prior_year_billings = billingsToDate;
          prior_year_costs = costsToDate;
          is_prior_locked = true;
        }
      }

      await sql`
        INSERT INTO wip_line_items (
          report_id, job_id,
          prior_year_earned, prior_year_billings, prior_year_costs,
          is_prior_locked
        ) VALUES (
          ${report.id}, ${job_id},
          ${prior_year_earned}, ${prior_year_billings}, ${prior_year_costs},
          ${is_prior_locked}
        )
      `;
    }

    revalidatePath("/jobs");
    revalidatePath("/wip");
    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    console.error("POST /api/wip-reports error:", error);
    return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
  }
}
