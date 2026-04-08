import sql from "@/db";
import WipListClient from "./WipListClient";

export const dynamic = "force-dynamic";

export default async function WipPage() {
  let reports: object[] = [];
  let activeJobs: object[] = [];

  try {
    reports = await sql`SELECT * FROM wip_reports ORDER BY period_date DESC`;
    activeJobs = await sql`
      SELECT id, job_number, job_name
      FROM jobs
      WHERE status = 'Active'
      ORDER BY job_number
    `;
  } catch (err) {
    console.error("Failed to fetch WIP data:", err);
  }

  return <WipListClient reports={reports as never} activeJobs={activeJobs as never} />;
}
