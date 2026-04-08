import { NextResponse } from "next/server";
import sql from "@/db";

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
      period,
      revised_contract,
      est_total_cost,
      cy_billings,
      cy_costs,
      prior_earned,
      prior_billings,
      prior_costs,
      pm_pct_override,
      notes,
    } = body;

    const [job] = await sql`
      UPDATE jobs SET
        job_number      = ${job_number},
        job_name        = ${job_name},
        job_type        = ${job_type},
        status          = ${status},
        period          = ${period},
        revised_contract = ${revised_contract},
        est_total_cost  = ${est_total_cost},
        cy_billings     = ${cy_billings},
        cy_costs        = ${cy_costs},
        prior_earned    = ${prior_earned},
        prior_billings  = ${prior_billings},
        prior_costs     = ${prior_costs},
        pm_pct_override = ${pm_pct_override ?? null},
        notes           = ${notes ?? null},
        updated_at      = NOW()
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
