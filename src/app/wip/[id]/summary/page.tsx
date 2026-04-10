import sql from "@/db";
import { notFound } from "next/navigation";
import WipSummaryClient from "./WipSummaryClient";
import type { LineItemWithJob, WipReport } from "../page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WipSummaryPage({
  params,
}: {
  params: { id: string };
}) {
  const id = parseInt(params.id, 10);

  let report: WipReport | null = null;
  let lineItems: LineItemWithJob[] = [];

  try {
    const [row] = await sql`SELECT * FROM wip_reports WHERE id = ${id}`;
    if (!row) notFound();
    report = row as WipReport;

    lineItems = (await sql`
      SELECT
        wli.*,
        j.job_number, j.job_name, j.job_type,
        j.original_contract, j.approved_cos, j.original_gp_pct,
        j.est_total_cost AS job_est_total_cost
      FROM wip_line_items wli
      JOIN jobs j ON j.id = wli.job_id
      WHERE wli.report_id = ${id}
      ORDER BY j.job_number
    `) as LineItemWithJob[];
  } catch (err) {
    console.error("WipSummaryPage fetch error:", err);
    notFound();
  }

  if (!report) notFound();

  return <WipSummaryClient report={report} lineItems={lineItems} />;
}
