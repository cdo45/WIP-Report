import { NextResponse } from "next/server";
import sql from "@/db";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    const [job] = await sql`SELECT * FROM jobs WHERE id = ${id}`;
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (error) {
    console.error("GET /api/jobs/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch job" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();
    const {
      job_number,
      job_name,
      job_type,
      status,
      original_contract,
      approved_cos,
      est_total_cost,
      original_gp_pct,
      notes,
    } = body;

    const [job] = await sql`
      UPDATE jobs SET
        job_number        = ${job_number},
        job_name          = ${job_name},
        job_type          = ${job_type},
        status            = ${status},
        original_contract = ${original_contract},
        approved_cos      = ${approved_cos},
        est_total_cost    = ${est_total_cost},
        original_gp_pct   = ${original_gp_pct},
        notes             = ${notes ?? null},
        updated_at        = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error("PUT /api/jobs/[id] error:", error);
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);

    const [job] = await sql`
      DELETE FROM jobs WHERE id = ${id} RETURNING id
    `;

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id: job.id });
  } catch (error) {
    console.error("DELETE /api/jobs/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete job" }, { status: 500 });
  }
}
