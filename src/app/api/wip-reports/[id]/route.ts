import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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
        j.original_contract, j.approved_cos, j.original_gp_pct
      FROM wip_line_items wli
      JOIN jobs j ON j.id = wli.job_id
      WHERE wli.report_id = ${id}
      ORDER BY j.job_number ASC
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
    const body = await request.json();
    const { lineItems } = body;

    if (!Array.isArray(lineItems)) {
      return NextResponse.json({ error: "lineItems must be an array" }, { status: 400 });
    }

    for (const item of lineItems) {
      // Update all non-prior-year fields unconditionally
      await sql`
        UPDATE wip_line_items SET
          revised_contract = ${item.revised_contract},
          est_total_cost   = ${item.est_total_cost},
          costs_to_date    = ${item.costs_to_date},
          billings_to_date = ${item.billings_to_date},
          pm_pct_override  = ${item.pm_pct_override ?? null},
          notes            = ${item.notes ?? null},
          updated_at       = NOW()
        WHERE id = ${item.id} AND report_id = ${reportId}
      `;

      // Update prior year fields only when not locked — avoids CASE WHEN
      // parameter embedding which some Neon driver versions mishandle
      await sql`
        UPDATE wip_line_items SET
          prior_year_earned   = ${item.prior_year_earned},
          prior_year_billings = ${item.prior_year_billings},
          prior_year_costs    = ${item.prior_year_costs}
        WHERE id = ${item.id} AND report_id = ${reportId} AND is_prior_locked = false
      `;
    }

    revalidatePath("/jobs");
    revalidatePath("/wip");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PUT /api/wip-reports/[id] error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed to update report", detail: message }, { status: 500 });
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

    revalidatePath("/jobs");
    revalidatePath("/wip");
    return NextResponse.json({ deleted: true, id: report.id });
  } catch (error) {
    console.error("DELETE /api/wip-reports/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete report" }, { status: 500 });
  }
}
