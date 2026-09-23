import Link from "next/link";
import { ReviewForm } from "@/components/review-form";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;

  return (
    <main className="page-shell flex flex-1 flex-col gap-4 py-6 sm:py-10">
      <Link className="ghost-button text-sm" href="/dashboard">
        ← Back to dashboard
      </Link>
      <section className="card px-5 py-6 sm:px-8">
        <div className="space-y-2">
          <span className="pill pill--warning">Step 6</span>
          <h1 className="text-3xl font-bold text-slate-950">Review and confirm scores</h1>
          <p className="text-sm leading-6 text-slate-600">
            Every AI suggestion stays editable until you confirm the paper. Short answers and low-confidence results require review.
          </p>
        </div>
        <div className="mt-6">
          <ReviewForm submissionId={submissionId} />
        </div>
      </section>
    </main>
  );
}
