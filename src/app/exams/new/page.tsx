import Link from "next/link";
import { ExamCreateForm } from "@/components/exam-create-form";

export default function NewExamPage() {
  return (
    <main className="page-shell flex flex-1 flex-col gap-4 py-6 sm:py-10">
      <Link className="ghost-button text-sm" href="/dashboard">
        ← Back to dashboard
      </Link>
      <section className="card px-5 py-6 sm:px-8">
        <div className="space-y-2">
          <span className="pill pill--warning">Step 1</span>
          <h1 className="text-3xl font-bold text-slate-950">Create an exam</h1>
          <p className="text-sm leading-6 text-slate-600">
            Add each question, choose MCQ or short answer, and store the answer key or rubric.
          </p>
        </div>
        <div className="mt-6">
          <ExamCreateForm />
        </div>
      </section>
    </main>
  );
}
