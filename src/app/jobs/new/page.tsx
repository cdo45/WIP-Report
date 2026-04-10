"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import JobForm from "@/components/JobForm";

export default function NewJobPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(payload: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save job.");
      setSubmitting(false);
      return;
    }

    router.push("/");
  }

  return (
    <div className="px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-[#1A1A1A]">New Job</h1>
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        <JobForm
          onSubmit={handleSubmit}
          submitting={submitting}
          onCancel={() => router.push("/")}
        />
      </div>
    </div>
  );
}
