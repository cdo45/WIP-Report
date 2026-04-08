import { NextResponse } from "next/server";
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
      period,
      revised_contract = 0,
      est_total_cost = 0,
      cy_billings = 0,
      cy_costs = 0,
      prior_earned = 0,
      prior_billings = 0,
      prior_costs = 0,
      pm_pct_override = null,
      notes = null,
    } = body;

    const [job] = await sql`
      INSERT INTO jobs (
        job_number, job_name, job_type, status, period,
        revised_contract, est_total_cost,
        cy_billings, cy_costs,
        prior_earned, prior_billings, prior_costs,
        pm_pct_override, notes
      ) VALUES (
        ${job_number}, ${job_name}, ${job_type}, ${status}, ${period},
        ${revised_contract}, ${est_total_cost},
        ${cy_billings}, ${cy_costs},
        ${prior_earned}, ${prior_billings}, ${prior_costs},
        ${pm_pct_override}, ${notes}
      )
      RETURNING *
    `;

    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    console.error("POST /api/jobs error:", error);
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}
