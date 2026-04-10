import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import sql from "@/db";

export async function POST(
  _request: Request,
  { params }: { params: { id: string; snapshotId: string } }
) {
  try {
    const reportId = parseInt(params.id, 10);
    const snapshotId = parseInt(params.snapshotId, 10);

    const [snapshot] = await sql`
      SELECT * FROM wip_snapshots WHERE id = ${snapshotId} AND report_id = ${reportId}
    `;
    if (!snapshot) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }

    const data = snapshot.snapshot_data as {
      report: {
        prior_balance_1290: number;
        prior_balance_2030: number;
      };
      lineItems: {
        id: number;
        revised_contract: number;
        est_total_cost: number;
        costs_to_date: number;
        billings_to_date: number;
        pm_pct_override: number | null;
        notes: string | null;
        prior_year_earned: number;
        prior_year_billings: number;
        prior_year_costs: number;
        cp_costs: number;
        cp_billings: number;
        prior_itd_costs: number;
        prior_itd_billings: number;
        is_prior_locked: boolean;
      }[];
    };

    // Restore report-level GL balances
    await sql`
      UPDATE wip_reports SET
        prior_balance_1290 = ${Number(data.report.prior_balance_1290)},
        prior_balance_2030 = ${Number(data.report.prior_balance_2030)}
      WHERE id = ${reportId}
    `;

    // Restore each line item
    const errors: string[] = [];
    for (const li of data.lineItems) {
      try {
        await sql`
          UPDATE wip_line_items SET
            revised_contract   = ${Number(li.revised_contract)},
            est_total_cost     = ${Number(li.est_total_cost)},
            costs_to_date      = ${Number(li.costs_to_date)},
            billings_to_date   = ${Number(li.billings_to_date)},
            pm_pct_override    = ${li.pm_pct_override ?? null},
            notes              = ${li.notes ?? null},
            prior_year_earned  = ${Number(li.prior_year_earned)},
            prior_year_billings= ${Number(li.prior_year_billings)},
            prior_year_costs   = ${Number(li.prior_year_costs)},
            cp_costs           = ${Number(li.cp_costs ?? 0)},
            cp_billings        = ${Number(li.cp_billings ?? 0)},
            prior_itd_costs    = ${Number(li.prior_itd_costs ?? 0)},
            prior_itd_billings = ${Number(li.prior_itd_billings ?? 0)},
            is_prior_locked    = ${Boolean(li.is_prior_locked)}
          WHERE id = ${li.id} AND report_id = ${reportId}
        `;
      } catch (e) {
        errors.push(`item ${li.id}: ${String(e)}`);
      }
    }

    // Log the restore to audit trail
    try {
      await sql`
        INSERT INTO wip_audit_log (report_id, job_number, field_name, old_value, new_value)
        VALUES (${reportId}, ${"REPORT"}, ${"snapshot_restore"}, ${null}, ${`Restored from snapshot #${snapshotId} (${String(snapshot.created_at).slice(0, 19)})`})
      `;
    } catch { /* non-critical */ }

    revalidatePath("/wip");
    revalidatePath(`/wip/${reportId}`);

    if (errors.length > 0) {
      return NextResponse.json({ ok: false, errors }, { status: 207 });
    }
    return NextResponse.json({ ok: true, snapshotId });
  } catch (error) {
    console.error("POST /restore error:", error);
    return NextResponse.json({ error: "Failed to restore snapshot" }, { status: 500 });
  }
}
