import { NextResponse } from "next/server";
import sql from "@/db";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const reportId = parseInt(params.id, 10);
    const rows = await sql`
      SELECT id, report_id, created_at, reason
      FROM wip_snapshots
      WHERE report_id = ${reportId}
      ORDER BY created_at DESC
    `;
    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /snapshots error:", error);
    return NextResponse.json({ error: "Failed to fetch snapshots" }, { status: 500 });
  }
}
