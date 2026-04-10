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

    // Auto-populate GL balances from prior report's calculated should-be values
    let prior_balance_1290 = 0;
    let prior_balance_2030 = 0;
    if (priorReport) {
      const priorItems = await sql`
        SELECT revised_contract, est_total_cost, costs_to_date, billings_to_date, pm_pct_override
        FROM wip_line_items WHERE report_id = ${priorReport.id}
      `;
      let totalUnderbillings = 0;
      let totalOverbillings  = 0;
      for (const li of priorItems) {
        const revisedContract = Number(li.revised_contract);
        const estTotalCost    = Number(li.est_total_cost);
        const costsToDate     = Number(li.costs_to_date);
        const billingsToDate  = Number(li.billings_to_date);
        const pmOverride      = li.pm_pct_override != null ? Number(li.pm_pct_override) : null;
        const pctComplete     = estTotalCost > 0 ? costsToDate / estTotalCost : 0;
        const effectivePct    = pmOverride !== null ? pmOverride : pctComplete;
        const earnedRevenue   = effectivePct >= 1
          ? Math.max(billingsToDate, revisedContract)
          : effectivePct * revisedContract;
        const overUnder = earnedRevenue - billingsToDate;
        if (overUnder > 0) totalUnderbillings += overUnder;
        else               totalOverbillings  += -overUnder;
      }
      prior_balance_1290 = totalUnderbillings;
      prior_balance_2030 = -totalOverbillings;
    }

    // Create the report record
    const [report] = await sql`
      INSERT INTO wip_reports (period_date, status, prior_balance_1290, prior_balance_2030)
      VALUES (${period_date}, 'draft', ${prior_balance_1290}, ${prior_balance_2030})
      RETURNING *
    `;

    // Create a line item for each job
    for (const job_id of job_ids) {
      // Get job defaults for revised_contract and est_total_cost
      const [jobRow] = await sql`
        SELECT original_contract + approved_cos AS revised_contract, est_total_cost
        FROM jobs WHERE id = ${job_id}
      `;

      let revised_contract = Number(jobRow?.revised_contract ?? 0);
      let est_total_cost = Number(jobRow?.est_total_cost ?? 0);
      let prior_year_earned = 0;
      let prior_year_billings = 0;
      let prior_year_costs = 0;
      let is_prior_locked = false;

      if (priorReport) {
        const [priorItem] = await sql`
          SELECT
            costs_to_date, billings_to_date, pm_pct_override,
            revised_contract, est_total_cost
          FROM wip_line_items
          WHERE report_id = ${priorReport.id} AND job_id = ${job_id}
        `;

        if (priorItem) {
          // Use prior line item values, falling back to job defaults if null
          revised_contract = Number(priorItem.revised_contract ?? revised_contract);
          est_total_cost = Number(priorItem.est_total_cost ?? est_total_cost);

          const costsToDate = Number(priorItem.costs_to_date);
          const billingsToDate = Number(priorItem.billings_to_date);
          const pmOverride =
            priorItem.pm_pct_override != null
              ? Number(priorItem.pm_pct_override)
              : null;

          const pctComplete = est_total_cost > 0 ? costsToDate / est_total_cost : 0;
          const effectivePct = pmOverride !== null ? pmOverride : pctComplete;
          const earnedRevenue = effectivePct >= 1
            ? Math.max(billingsToDate, revised_contract)
            : effectivePct * revised_contract;

          prior_year_earned = earnedRevenue;
          prior_year_billings = billingsToDate;
          prior_year_costs = costsToDate;
          is_prior_locked = true;
        }
      }

      await sql`
        INSERT INTO wip_line_items (
          report_id, job_id,
          revised_contract, est_total_cost,
          prior_year_earned, prior_year_billings, prior_year_costs,
          is_prior_locked
        ) VALUES (
          ${report.id}, ${job_id},
          ${revised_contract}, ${est_total_cost},
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
