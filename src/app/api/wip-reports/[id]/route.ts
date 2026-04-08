import { NextResponse } from "next/server";
import sql from "@/db";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);

    const [report] = await sql`SELECT * FROM wip_reports WHERE id = ${id}`;
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const lineItems = await sql`
      SELECT
        wli.*,
        j.job_number, j.job_name, j.job_type,
        j.original_contract, j.approved_cos, j.est_total_cost, j.original_gp_pct
      FROM wip_line_items wli
      JOIN jobs j ON j.id = wli.job_id
      WHERE wli.report_id = ${id}
      ORDER BY j.job_number
    `;

    return NextResponse.json({ report, lineItems });
  } catch (error) {
    console.error("GET /api/wip-reports/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch report" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const reportId = parseInt(params.id, 10);
    const { lineItems } = await request.json();

    for (const item of lineItems) {
      await sql`
        UPDATE wip_line_items SET
          costs_to_date       = ${item.costs_to_date},
          billings_to_date    = ${item.billings_to_date},
          pm_pct_override     = ${item.pm_pct_override ?? null},
          notes               = ${item.notes ?? null},
          prior_year_earned   = CASE WHEN is_prior_locked THEN prior_year_earned
                                     ELSE ${item.prior_year_earned} END,
          prior_year_billings = CASE WHEN is_prior_locked THEN prior_year_billings
                                     ELSE ${item.prior_year_billings} END,
          prior_year_costs    = CASE WHEN is_prior_locked THEN prior_year_costs
                                     ELSE ${item.prior_year_costs} END,
          updated_at          = NOW()
        WHERE id = ${item.id} AND report_id = ${reportId}
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PUT /api/wip-reports/[id] error:", error);
    return NextResponse.json({ error: "Failed to update report" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);

    const [report] = await sql`
      DELETE FROM wip_reports WHERE id = ${id} RETURNING id
    `;
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id: report.id });
  } catch (error) {
    console.error("DELETE /api/wip-reports/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete report" }, { status: 500 });
  }
}
