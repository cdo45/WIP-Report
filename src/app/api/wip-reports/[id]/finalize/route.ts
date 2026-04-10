import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import sql from "@/db";

function serializeError(e: unknown): string {
  return JSON.stringify(e, Object.getOwnPropertyNames(e as object));
}

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  console.log(`POST /api/wip-reports/${id}/finalize`);

  // Step 1: mark the report final
  let report: Record<string, unknown> | undefined;
  try {
    const rows = await sql`
      UPDATE wip_reports SET
        status       = 'final',
        finalized_at = NOW()
      WHERE id = ${id} AND status = 'draft'
      RETURNING *
    `;
    report = rows[0] as Record<string, unknown> | undefined;
  } catch (e) {
    console.error(`Finalize step 1 (UPDATE wip_reports) failed:`, serializeError(e));
    return NextResponse.json(
      { error: "Failed to finalize report", detail: serializeError(e) },
      { status: 500 }
    );
  }

  if (!report) {
    return NextResponse.json(
      { error: "Report not found or already finalized" },
      { status: 404 }
    );
  }

  // Step 2: lock prior year fields on all line items
  try {
    await sql`
      UPDATE wip_line_items SET is_prior_locked = true
      WHERE report_id = ${id}
    `;
  } catch (e) {
    // Report is already marked final — log the lock failure but don't roll back
    console.error(`Finalize step 2 (lock line items) failed:`, serializeError(e));
    return NextResponse.json(
      { error: "Report marked final but line item lock failed", detail: serializeError(e) },
      { status: 207 }
    );
  }

  revalidatePath("/jobs");
  revalidatePath("/wip");
  console.log(`Finalize complete for report ${id}`);
  return NextResponse.json(report);
}
