import Link from "next/link";

interface Job {
  id: number;
  job_number: string;
  job_name: string;
  job_type: string;
  status: string;
  period: string;
  revised_contract: number;
  est_total_cost: number;
  cy_billings: number;
  cy_costs: number;
  prior_earned: number;
  prior_billings: number;
  prior_costs: number;
  pm_pct_override: number | null;
}

interface Computed {
  itd_billings: number;
  itd_costs: number;
  pct_complete: number;
  earned_revenue: number;
  over_under: number;
}

function compute(j: Job): Computed {
  const itd_billings = j.cy_billings + j.prior_billings;
  const itd_costs = j.cy_costs + j.prior_costs;

  const pct_complete =
    j.pm_pct_override != null
      ? j.pm_pct_override
      : j.est_total_cost > 0
      ? itd_costs / j.est_total_cost
      : 0;

  const earned_revenue =
    pct_complete >= 1 ? itd_billings : pct_complete * j.revised_contract;

  const over_under = earned_revenue - itd_billings;

  return { itd_billings, itd_costs, pct_complete, earned_revenue, over_under };
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function fetchJobs(): Promise<Job[]> {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const res = await fetch(`${baseUrl}/api/jobs`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export default async function HomePage() {
  const jobs = await fetchJobs();

  return (
    <div className="min-h-screen bg-[#1F3864] text-white px-4 py-10">
      <div className="max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Vance Corp &mdash; WIP Report</h1>
          <Link
            href="/jobs/new"
            className="bg-[#C9A84C] hover:bg-[#b8953e] text-[#1F3864] font-bold px-5 py-2 rounded transition-colors"
          >
            + New Job
          </Link>
        </div>

        {jobs.length === 0 ? (
          <p className="text-gray-400 text-center py-20">
            No jobs yet.{" "}
            <Link href="/jobs/new" className="text-[#C9A84C] underline">
              Add the first one.
            </Link>
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[#2e4a7a]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#162a50] text-[#C9A84C] text-left">
                  <th className="px-3 py-3 font-semibold whitespace-nowrap">Job #</th>
                  <th className="px-3 py-3 font-semibold whitespace-nowrap">Job Name</th>
                  <th className="px-3 py-3 font-semibold whitespace-nowrap">Status</th>
                  <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
                    Revised Contract
                  </th>
                  <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
                    Est Total Cost
                  </th>
                  <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
                    % Complete
                  </th>
                  <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
                    Earned Revenue
                  </th>
                  <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
                    Billings to Date
                  </th>
                  <th className="px-3 py-3 font-semibold whitespace-nowrap text-right">
                    Over / Under
                  </th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job, i) => {
                  const { pct_complete, earned_revenue, itd_billings, over_under } =
                    compute(job);
                  const rowBg = i % 2 === 0 ? "bg-[#1a3260]" : "bg-[#1F3864]";
                  const overUnderColor =
                    over_under >= 0 ? "text-green-400" : "text-red-400";

                  return (
                    <tr key={job.id} className={`${rowBg} hover:bg-[#243d70] transition-colors`}>
                      <td className="px-3 py-2 whitespace-nowrap font-mono">
                        {job.job_number}
                      </td>
                      <td className="px-3 py-2">{job.job_name}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            job.status === "Active"
                              ? "bg-green-900 text-green-300"
                              : job.status === "Complete"
                              ? "bg-blue-900 text-blue-300"
                              : "bg-gray-700 text-gray-400"
                          }`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        ${fmt(Number(job.revised_contract))}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        ${fmt(Number(job.est_total_cost))}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {(pct_complete * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        ${fmt(earned_revenue)}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        ${fmt(itd_billings)}
                      </td>
                      <td className={`px-3 py-2 text-right whitespace-nowrap font-semibold ${overUnderColor}`}>
                        {over_under >= 0 ? "+" : ""}${fmt(over_under)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
