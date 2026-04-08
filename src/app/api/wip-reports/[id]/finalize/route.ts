import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import sql from "@/db";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);

    const [report] = await sql`
      UPDATE wip_reports SET
        status       = 'final',
        finalized_at = NOW(),
        updated_at   = NOW()
      WHERE id = ${id} AND status = 'draft'
      RETURNING *
    `;

    if (!report) {
      return NextResponse.json(
        { error: "Report not found or already finalized" },
        { status: 404 }
      );
    }

    await sql`
      UPDATE wip_line_items SET is_prior_locked = true
      WHERE report_id = ${id}
    `;

    revalidatePath("/jobs");
    revalidatePath("/wip");
    return NextResponse.json(report);
  } catch (error) {
    console.error("POST /api/wip-reports/[id]/finalize error:", error);
    return NextResponse.json({ error: "Failed to finalize report" }, { status: 500 });
  }
}
