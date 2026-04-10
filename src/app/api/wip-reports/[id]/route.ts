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
        j.original_contract, j.approved_cos, j.original_gp_pct,
        j.est_total_cost AS job_est_total_cost
      FROM wip_line_items wli
      JOIN jobs j ON j.id = wli.job_id
      WHERE wli.report_id = ${id}
    `;

    // JS sort — does not rely on DB collation or SQL ORDER BY
    const lineItems = [...rows].sort((a, b) =>
      (a.job_number as string).localeCompare(b.job_number as string, undefined, { numeric: true })
    );

    // Fetch prior period baseline for variance columns
    const [priorReport] = await sql`
      SELECT id FROM wip_reports
      WHERE status = 'final' AND period_date < ${report.period_date}
      ORDER BY period_date DESC
      LIMIT 1
    `;
    const priorValues: Record<number, { revised_contract: number; est_total_cost: number }> = {};
    if (priorReport) {
      const priorItems = await sql`
        SELECT job_id, revised_contract, est_total_cost
        FROM wip_line_items WHERE report_id = ${priorReport.id}
      `;
      for (const r of priorItems) {
        priorValues[r.job_id as number] = {
          revised_contract: Number(r.revised_contract),
          est_total_cost:   Number(r.est_total_cost),
        };
      }
    }

    return NextResponse.json({ report, lineItems, priorValues });
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

    const { lineItems, prior_balance_1290, prior_balance_2030, is_finalized_edit } = body as {
      lineItems?: unknown[];
      prior_balance_1290?: number;
      prior_balance_2030?: number;
      is_finalized_edit?: boolean;
    };

    if (!Array.isArray(lineItems)) {
      return NextResponse.json({ error: "lineItems must be an array" }, { status: 400 });
    }

    console.log(`PUT /api/wip-reports/${reportId} — saving ${lineItems.length} line items${is_finalized_edit ? " (finalized edit)" : ""}`);

    // ── Audit pre-read: snapshot current DB values before overwriting ────────
    type ItemSnap = Record<string, unknown>;
    const currentItemsMap = new Map<number, ItemSnap>();
    let currentReportGl: { prior_balance_1290: unknown; prior_balance_2030: unknown } | null = null;

    if (is_finalized_edit) {
      try {
        const snap = await sql`
          SELECT wli.id, wli.revised_contract, wli.est_total_cost, wli.cp_costs, wli.cp_billings,
                 wli.costs_to_date, wli.billings_to_date, wli.pm_pct_override, wli.notes,
                 wli.prior_year_earned, wli.prior_year_billings, wli.prior_year_costs,
                 j.job_number
          FROM wip_line_items wli
          JOIN jobs j ON j.id = wli.job_id
          WHERE wli.report_id = ${reportId}
        `;
        for (const r of snap) currentItemsMap.set(r.id as number, r as ItemSnap);
        const [cr] = await sql`SELECT prior_balance_1290, prior_balance_2030 FROM wip_reports WHERE id = ${reportId}`;
        if (cr) currentReportGl = cr as { prior_balance_1290: unknown; prior_balance_2030: unknown };
      } catch (e) {
        console.error("Audit pre-read failed:", e);
      }
    }

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
      // Log all values being written so failures are visible in Vercel logs
      console.log(`UPDATE wip_line_items id=${item.id} report_id=${reportId}:`, JSON.stringify({
        revised_contract:    item.revised_contract,
        est_total_cost:      item.est_total_cost,
        cp_costs:            item.cp_costs ?? 0,
        cp_billings:         item.cp_billings ?? 0,
        costs_to_date:       item.costs_to_date,
        billings_to_date:    item.billings_to_date,
        pm_pct_override:     item.pm_pct_override ?? null,
        notes:               item.notes ?? null,
        prior_year_earned:   item.prior_year_earned,
        prior_year_billings: item.prior_year_billings,
        prior_year_costs:    item.prior_year_costs,
      }));

      // Main fields — try with revised_contract/est_total_cost first,
      // fall back without them if the columns haven't been migrated yet.
      let mainSaved = false;
      try {
        const updated = await sql`
          UPDATE wip_line_items SET
            revised_contract = ${item.revised_contract as number},
            est_total_cost   = ${item.est_total_cost as number},
            cp_costs         = ${(item.cp_costs ?? 0) as number},
            cp_billings      = ${(item.cp_billings ?? 0) as number},
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

    // ── Audit log: diff old vs new values and insert change rows ────────────
    if (is_finalized_edit && currentItemsMap.size > 0) {
      const NUMERIC_FIELDS = [
        "revised_contract", "est_total_cost", "cp_costs", "cp_billings",
        "costs_to_date", "billings_to_date",
        "prior_year_earned", "prior_year_billings", "prior_year_costs",
      ];

      for (const item of lineItems as Record<string, unknown>[]) {
        const old = currentItemsMap.get(item.id as number);
        if (!old) continue;
        const jobNumber = old.job_number as string;

        for (const field of NUMERIC_FIELDS) {
          const oldCents = Math.round(Number(old[field]) * 100);
          const newCents = Math.round(Number(item[field]) * 100);
          if (oldCents !== newCents) {
            try {
              const oldStr = Number(old[field]).toFixed(2);
              const newStr = Number(item[field]).toFixed(2);
              await sql`
                INSERT INTO wip_audit_log (report_id, job_number, field_name, old_value, new_value)
                VALUES (${reportId}, ${jobNumber}, ${field}, ${oldStr}, ${newStr})
              `;
            } catch (e) { console.error("Audit insert failed:", e); }
          }
        }

        // pm_pct_override — nullable
        const oldPmRnd = old.pm_pct_override != null ? Math.round(Number(old.pm_pct_override) * 10000) : null;
        const newPmRnd = (item.pm_pct_override ?? null) != null ? Math.round(Number(item.pm_pct_override) * 10000) : null;
        if (oldPmRnd !== newPmRnd) {
          try {
            const oldStr = old.pm_pct_override != null ? String(old.pm_pct_override) : null;
            const newStr = item.pm_pct_override != null ? String(item.pm_pct_override) : null;
            await sql`
              INSERT INTO wip_audit_log (report_id, job_number, field_name, old_value, new_value)
              VALUES (${reportId}, ${jobNumber}, ${"pm_pct_override"}, ${oldStr}, ${newStr})
            `;
          } catch (e) { console.error("Audit insert failed:", e); }
        }

        // notes — nullable string
        const oldNotes = (old.notes ?? null) as string | null;
        const newNotes = (item.notes ?? null) as string | null;
        if (oldNotes !== newNotes) {
          try {
            await sql`
              INSERT INTO wip_audit_log (report_id, job_number, field_name, old_value, new_value)
              VALUES (${reportId}, ${jobNumber}, ${"notes"}, ${oldNotes}, ${newNotes})
            `;
          } catch (e) { console.error("Audit insert failed:", e); }
        }
      }

      // Report-level GL balances
      if (currentReportGl) {
        const old1290 = Math.round(Number(currentReportGl.prior_balance_1290) * 100);
        const new1290 = Math.round((prior_balance_1290 ?? 0) * 100);
        if (old1290 !== new1290) {
          try {
            await sql`
              INSERT INTO wip_audit_log (report_id, job_number, field_name, old_value, new_value)
              VALUES (${reportId}, ${"REPORT"}, ${"prior_balance_1290"}, ${Number(currentReportGl.prior_balance_1290).toFixed(2)}, ${(prior_balance_1290 ?? 0).toFixed(2)})
            `;
          } catch (e) { console.error("Audit insert failed:", e); }
        }
        const old2030 = Math.round(Number(currentReportGl.prior_balance_2030) * 100);
        const new2030 = Math.round((prior_balance_2030 ?? 0) * 100);
        if (old2030 !== new2030) {
          try {
            await sql`
              INSERT INTO wip_audit_log (report_id, job_number, field_name, old_value, new_value)
              VALUES (${reportId}, ${"REPORT"}, ${"prior_balance_2030"}, ${Number(currentReportGl.prior_balance_2030).toFixed(2)}, ${(prior_balance_2030 ?? 0).toFixed(2)})
            `;
          } catch (e) { console.error("Audit insert failed:", e); }
        }
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
