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

    const { lineItems, prior_balance_1290, prior_balance_2030 } = body as {
      lineItems?: unknown[];
      prior_balance_1290?: number;
      prior_balance_2030?: number;
    };

    if (!Array.isArray(lineItems)) {
      return NextResponse.json({ error: "lineItems must be an array" }, { status: 400 });
    }

    console.log(`PUT /api/wip-reports/${reportId} — saving ${lineItems.length} line items`);

    // Save GL balance fields on wip_reports
    try {
      await sql`
        UPDATE wip_reports SET
          prior_balance_1290 = ${(prior_balance_1290 ?? 0) as number},
          prior_balance_2030 = ${(prior_balance_2030 ?? 0) as number}
        WHERE id = ${reportId}
      `;
    } catch (e) {
      const msg = serializeError(e);
      console.error(`GL balance UPDATE failed for report ${reportId}:`, msg);
      errors.push(`report gl balances: ${msg}`);
    }

    for (const item of lineItems as Record<string, unknown>[]) {
      const params = {
        id: item.id,
        report_id: reportId,
        revised_contract: item.revised_contract,
        est_total_cost: item.est_total_cost,
        costs_to_date: item.costs_to_date,
        billings_to_date: item.billings_to_date,
        pm_pct_override: item.pm_pct_override ?? null,
        notes: item.notes ?? null,
        prior_year_earned: item.prior_year_earned,
        prior_year_billings: item.prior_year_billings,
        prior_year_costs: item.prior_year_costs,
      };
      console.log("UPDATE params:", JSON.stringify(params));

      // Main fields — try with revised_contract/est_total_cost first,
      // fall back without them if the columns haven't been migrated yet.
      let mainSaved = false;
      try {
        const updated = await sql`
          UPDATE wip_line_items SET
            revised_contract = ${item.revised_contract as number},
            est_total_cost   = ${item.est_total_cost as number},
            costs_to_date    = ${item.costs_to_date as number},
            billings_to_date = ${item.billings_to_date as number},
            pm_pct_override  = ${(item.pm_pct_override ?? null) as number | null},
            notes            = ${(item.notes ?? null) as string | null}
          WHERE id = ${item.id as number} AND report_id = ${reportId}
          RETURNING id, costs_to_date, billings_to_date
        `;
        if (updated.length === 0) {
          console.warn(`Main UPDATE matched 0 rows for item id=${item.id} report_id=${reportId}`);
          errors.push(`item ${item.id} main: 0 rows matched — id or report_id mismatch`);
        } else {
          console.log(`Main UPDATE ok — row after write:`, JSON.stringify(updated[0]));
          mainSaved = true;
        }
      } catch (e) {
        const msg = serializeError(e);
        console.error(`Main UPDATE failed for item ${item.id}:`, msg);
        errors.push(`item ${item.id} main: ${msg}`);
      }

      // Fallback: save core fields without the new columns
      if (!mainSaved) {
        try {
          const updated = await sql`
            UPDATE wip_line_items SET
              costs_to_date    = ${item.costs_to_date as number},
              billings_to_date = ${item.billings_to_date as number},
              pm_pct_override  = ${(item.pm_pct_override ?? null) as number | null},
              notes            = ${(item.notes ?? null) as string | null}
            WHERE id = ${item.id as number} AND report_id = ${reportId}
            RETURNING id, costs_to_date, billings_to_date
          `;
          if (updated.length === 0) {
            console.warn(`Fallback UPDATE matched 0 rows for item id=${item.id} report_id=${reportId}`);
            errors.push(`item ${item.id} fallback: 0 rows matched`);
          } else {
            console.log(`Fallback UPDATE ok — row after write:`, JSON.stringify(updated[0]));
          }
        } catch (e) {
          const msg = serializeError(e);
          console.error(`Fallback UPDATE failed for item ${item.id}:`, msg);
          errors.push(`item ${item.id} fallback: ${msg}`);
        }
      }

      // Prior year — separate query; rows with is_prior_locked=true simply don't match
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
      console.error(`PUT /api/wip-reports/${reportId} completed with errors:`, errors);
      return NextResponse.json({ ok: false, errors }, { status: 207 });
    }

    console.log(`PUT /api/wip-reports/${reportId} — all items saved successfully`);
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
