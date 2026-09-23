import Link from "next/link";
import { ResultsPanel } from "@/components/results-panel";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;

  return (
    <main className="page-shell flex flex-1 flex-col gap-4 py-6 sm:py-10">
      <Link className="ghost-button text-sm" href="/dashboard">
        ← Back to dashboard
      </Link>
      <section className="card px-5 py-6 sm:px-8">
        <div className="space-y-2">
          <span className="pill pill--warning">Step 7</span>
          <h1 className="text-3xl font-bold text-slate-950">Exam results</h1>
          <p className="text-sm leading-6 text-slate-600">
            Track confirmed scores, class average, and which questions cost students the most points.
          </p>
        </div>
        <div className="mt-6">
          <ResultsPanel examId={examId} />
        </div>
      </section>
    </main>
  );
}
