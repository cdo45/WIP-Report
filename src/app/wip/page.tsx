import sql from "@/db";
import WipListClient from "./WipListClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface WipReport {
  id: number;
  period_date: string;
  status: string;
  finalized_at: string | null;
  created_at: string;
}

interface ActiveJob {
  id: number;
  job_number: string;
  job_name: string;
}

export default async function WipPage() {
  let reports: WipReport[] = [];
  let activeJobs: ActiveJob[] = [];

  try {
    reports = (await sql`
      SELECT id, period_date, status, finalized_at, created_at
      FROM wip_reports
      ORDER BY period_date DESC
    `) as WipReport[];

    activeJobs = (await sql`
      SELECT id, job_number, job_name
      FROM jobs
      WHERE status = 'Active'
      ORDER BY job_number
    `) as ActiveJob[];
  } catch (err) {
    console.error("Failed to fetch WIP data:", err);
  }

  return <WipListClient reports={reports} activeJobs={activeJobs} />;
}
