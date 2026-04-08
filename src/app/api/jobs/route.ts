import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import sql from "@/db";

export async function GET() {
  try {
    const jobs = await sql`SELECT * FROM jobs ORDER BY created_at DESC`;
    return NextResponse.json(jobs);
  } catch (error) {
    console.error("GET /api/jobs error:", error);
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      job_number,
      job_name,
      job_type = "Fixed Fee",
      status = "Active",
      original_contract = 0,
      approved_cos = 0,
      est_total_cost = 0,
      original_gp_pct = 0,
      notes = null,
    } = body;

    const [job] = await sql`
      INSERT INTO jobs (
        job_number, job_name, job_type, status,
        original_contract, approved_cos, est_total_cost, original_gp_pct,
        notes
      ) VALUES (
        ${job_number}, ${job_name}, ${job_type}, ${status},
        ${original_contract}, ${approved_cos}, ${est_total_cost}, ${original_gp_pct},
        ${notes}
      )
      RETURNING *
    `;

    revalidatePath("/jobs");
    revalidatePath("/wip");
    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    console.error("POST /api/jobs error:", error);
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}
