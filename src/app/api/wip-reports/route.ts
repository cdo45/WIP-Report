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
    console.log(`POST /api/wip-reports — period_date=${period_date} job_ids=${JSON.stringify(job_ids)}`);

    // Find most recent finalized report before this period
    const [priorReport] = await sql`
      SELECT id, period_date FROM wip_reports
      WHERE status = 'final' AND period_date < ${period_date}
      ORDER BY period_date DESC
      LIMIT 1
    `;

    console.log(`Prior finalized report: ${priorReport ? `id=${priorReport.id} period_date=${priorReport.period_date}` : "NONE — prior_year fields will be 0"}`);

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
      console.log(`GL balances from prior report: 1290=${prior_balance_1290.toFixed(2)} 2030=${prior_balance_2030.toFixed(2)}`);
    }

    // Create the report record
    const [report] = await sql`
      INSERT INTO wip_reports (period_date, status, prior_balance_1290, prior_balance_2030)
      VALUES (${period_date}, 'draft', ${prior_balance_1290}, ${prior_balance_2030})
      RETURNING *
    `;
    console.log(`Created wip_report id=${report.id}`);

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
      let prior_itd_billings = 0;
      let prior_itd_costs = 0;
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
          // Carry forward revised contract and est cost from prior period
          revised_contract = Number(priorItem.revised_contract ?? revised_contract);
          est_total_cost   = Number(priorItem.est_total_cost   ?? est_total_cost);

          const costsToDate    = Number(priorItem.costs_to_date);
          const billingsToDate = Number(priorItem.billings_to_date);
          const pmOverride     =
            priorItem.pm_pct_override != null
              ? Number(priorItem.pm_pct_override)
              : null;

          // Compute earned revenue at the end of the prior period.
          // This becomes prior_year_earned so that:
          //   cy_earned = earned_revenue(new) − prior_year_earned = INCREMENTAL this period
          // Use calculated values, NOT the prior item's stored prior_year fields.
          const pctComplete  = est_total_cost > 0 ? costsToDate / est_total_cost : 0;
          const effectivePct = pmOverride !== null ? pmOverride : pctComplete;
          const earnedRevenue =
            effectivePct >= 1
              ? Math.max(billingsToDate, revised_contract)
              : effectivePct * revised_contract;

          // prior_year_* = ITD state at end of the prior period (baseline for CY delta)
          prior_year_earned   = earnedRevenue;
          prior_year_billings = billingsToDate;
          prior_year_costs    = costsToDate;

          // prior_itd_* = locked-row CP baseline:
          //   costs_to_date    = prior_itd_costs    + cp_costs
          //   billings_to_date = prior_itd_billings + cp_billings
          prior_itd_billings = billingsToDate;
          prior_itd_costs    = costsToDate;
          is_prior_locked    = true;
        } else {
          console.log(`  job_id=${job_id}: NOT found in prior report ${priorReport.id} — prior_year fields will be 0`);
        }
      }

      console.log(`  INSERT wip_line_item: job_id=${job_id} revised_contract=${revised_contract.toFixed(2)} est_total_cost=${est_total_cost.toFixed(2)} prior_itd_costs=${prior_itd_costs.toFixed(2)} prior_itd_billings=${prior_itd_billings.toFixed(2)} prior_year_earned=${prior_year_earned.toFixed(2)} prior_year_billings=${prior_year_billings.toFixed(2)} prior_year_costs=${prior_year_costs.toFixed(2)} is_prior_locked=${is_prior_locked}`);

      await sql`
        INSERT INTO wip_line_items (
          report_id, job_id,
          revised_contract, est_total_cost,
          cp_costs, cp_billings,
          prior_itd_costs, prior_itd_billings,
          costs_to_date, billings_to_date,
          prior_year_earned, prior_year_billings, prior_year_costs,
          is_prior_locked
        ) VALUES (
          ${report.id}, ${job_id},
          ${revised_contract}, ${est_total_cost},
          0, 0,
          ${prior_itd_costs}, ${prior_itd_billings},
          ${prior_itd_costs}, ${prior_itd_billings},
          ${prior_year_earned}, ${prior_year_billings}, ${prior_year_costs},
          ${is_prior_locked}
        )
      `;
    }

    console.log(`POST /api/wip-reports complete — report id=${report.id} with ${job_ids.length} line items`);
    revalidatePath("/jobs");
    revalidatePath("/wip");
    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    console.error("POST /api/wip-reports error:", error);
    return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
  }
}
