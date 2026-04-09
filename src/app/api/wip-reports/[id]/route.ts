import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import sql from "@/db";

function serializeError(e: unknown): string {
  return JSON.stringify(e, Object.getOwnPropertyNames(e as object));
}

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

    const rows = await sql`
      SELECT
        wli.*,
        j.job_number, j.job_name, j.job_type,
        j.original_contract, j.approved_cos, j.original_gp_pct
      FROM wip_line_items wli
      JOIN jobs j ON j.id = wli.job_id
      WHERE wli.report_id = ${id}
    `;

    // JS sort — does not rely on DB collation or SQL ORDER BY
    const lineItems = [...rows].sort((a, b) =>
      (a.job_number as string).localeCompare(b.job_number as string, undefined, { numeric: true })
    );

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
  const errors: string[] = [];

  try {
    const reportId = parseInt(params.id, 10);

    let body: unknown;
    try {
      body = await request.json();
    } catch (e) {
      console.error("PUT body parse error:", e);
      return NextResponse.json(
        { error: "Invalid JSON body", detail: serializeError(e) },
        { status: 400 }
      );
    }

    const { lineItems } = body as { lineItems?: unknown[] };

    if (!Array.isArray(lineItems)) {
      return NextResponse.json({ error: "lineItems must be an array" }, { status: 400 });
    }

    for (const item of lineItems as Record<string, unknown>[]) {
      // Main fields — try with new columns first, fall back without them
      // so save still works if revised_contract/est_total_cost haven't been
      // migrated to the live DB yet.
      let mainSaved = false;
      try {
        await sql`
          UPDATE wip_line_items SET
            revised_contract = ${item.revised_contract as number},
            est_total_cost   = ${item.est_total_cost as number},
            costs_to_date    = ${item.costs_to_date as number},
            billings_to_date = ${item.billings_to_date as number},
            pm_pct_override  = ${(item.pm_pct_override ?? null) as number | null},
            notes            = ${(item.notes ?? null) as string | null},
            updated_at       = NOW()
          WHERE id = ${item.id as number} AND report_id = ${reportId}
        `;
        mainSaved = true;
      } catch (e) {
        const msg = serializeError(e);
        console.error(`Main UPDATE failed for item ${item.id}:`, msg);
        errors.push(`item ${item.id} main: ${msg}`);
      }

      // Fallback: save core fields without new columns
      if (!mainSaved) {
        try {
          await sql`
            UPDATE wip_line_items SET
              costs_to_date    = ${item.costs_to_date as number},
              billings_to_date = ${item.billings_to_date as number},
              pm_pct_override  = ${(item.pm_pct_override ?? null) as number | null},
              notes            = ${(item.notes ?? null) as string | null},
              updated_at       = NOW()
            WHERE id = ${item.id as number} AND report_id = ${reportId}
          `;
        } catch (e) {
          const msg = serializeError(e);
          console.error(`Fallback UPDATE failed for item ${item.id}:`, msg);
          errors.push(`item ${item.id} fallback: ${msg}`);
        }
      }

      // Prior year fields — separate query so is_prior_locked rows are simply unmatched
      try {
        await sql`
          UPDATE wip_line_items SET
            prior_year_earned   = ${item.prior_year_earned as number},
            prior_year_billings = ${item.prior_year_billings as number},
            prior_year_costs    = ${item.prior_year_costs as number}
          WHERE id = ${item.id as number} AND report_id = ${reportId} AND is_prior_locked = false
        `;
      } catch (e) {
        const msg = serializeError(e);
        console.error(`Prior-year UPDATE failed for item ${item.id}:`, msg);
        errors.push(`item ${item.id} prior: ${msg}`);
      }
    }

    revalidatePath("/jobs");
    revalidatePath("/wip");

    if (errors.length > 0) {
      return NextResponse.json({ ok: false, errors }, { status: 207 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PUT /api/wip-reports/[id] unhandled error:", error);
    return NextResponse.json(
      { error: "Failed to update report", detail: serializeError(error) },
      { status: 500 }
    );
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
