import { NextResponse } from "next/server";
import sql from "@/db";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const reportId = parseInt(params.id, 10);

    const [report] = await sql`SELECT * FROM wip_reports WHERE id = ${reportId}`;
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const lineItems = await sql`SELECT * FROM wip_line_items WHERE report_id = ${reportId}`;

    const snapshotData = {
      report: {
        id: report.id,
        period_date: report.period_date,
        status: report.status,
        prior_balance_1290: report.prior_balance_1290,
        prior_balance_2030: report.prior_balance_2030,
      },
      lineItems: lineItems.map((li) => ({
        id: li.id,
        job_id: li.job_id,
        revised_contract: li.revised_contract,
        est_total_cost: li.est_total_cost,
        costs_to_date: li.costs_to_date,
        billings_to_date: li.billings_to_date,
        pm_pct_override: li.pm_pct_override,
        notes: li.notes,
        prior_year_earned: li.prior_year_earned,
        prior_year_billings: li.prior_year_billings,
        prior_year_costs: li.prior_year_costs,
        cp_costs: li.cp_costs,
        cp_billings: li.cp_billings,
        prior_itd_costs: li.prior_itd_costs,
        prior_itd_billings: li.prior_itd_billings,
        is_prior_locked: li.is_prior_locked,
      })),
    };

    const [snapshot] = await sql`
      INSERT INTO wip_snapshots (report_id, snapshot_data, reason)
      VALUES (${reportId}, ${JSON.stringify(snapshotData)}, ${"Pre-edit snapshot"})
      RETURNING id, created_at, reason
    `;

    return NextResponse.json(snapshot, { status: 201 });
  } catch (error) {
    console.error("POST /snapshot error:", error);
    return NextResponse.json({ error: "Failed to create snapshot" }, { status: 500 });
  }
}
