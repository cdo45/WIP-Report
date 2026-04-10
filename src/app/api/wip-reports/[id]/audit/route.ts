import { NextResponse } from "next/server";
import sql from "@/db";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const reportId = parseInt(params.id, 10);
    const rows = await sql`
      SELECT id, report_id, job_number, field_name, old_value, new_value, changed_at, changed_by
      FROM wip_audit_log
      WHERE report_id = ${reportId}
      ORDER BY changed_at DESC
    `;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /audit error:", error);
    return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });
  }
}
