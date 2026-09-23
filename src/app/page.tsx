import Link from "next/link";
import { AuthPanel } from "@/components/auth-panel";

const featureCards = [
  {
    title: "Create an exam",
    body: "Build MCQ and short-answer questions with answer keys, rubrics, and max points.",
  },
  {
    title: "Capture one paper at a time",
    body: "Use a phone camera or image picker, preview the page, then upload it for OCR.",
  },
  {
    title: "Review before saving",
    body: "High-confidence MCQs can prefill, but every AI suggestion stays editable until the teacher confirms the paper.",
  },
];

export default function Home() {
  return (
    <main className="page-shell flex flex-1 flex-col gap-6 py-6 sm:py-10">
      <section className="card grid gap-6 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <span className="pill pill--success">MVP • Human-reviewed AI grading</span>
          <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            GradeSnap helps teachers grade paper exams from a phone.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            Photograph a paper, extract answers with OCR, get deterministic MCQ scoring plus
            AI short-answer suggestions, and confirm the final scores before they are saved.
          </p>
          <div className="flex flex-wrap gap-3 text-sm text-slate-600">
            <span className="pill pill--warning">Google Vision OCR</span>
            <span className="pill pill--warning">Anthropic Haiku 4.5</span>
            <span className="pill pill--warning">Supabase Auth + Postgres + Storage</span>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link className="primary-button" href="/dashboard">
              Open dashboard
            </Link>
            <Link className="secondary-button" href="/exams/new">
              Create an exam
            </Link>
          </div>
        </div>
        <AuthPanel />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {featureCards.map((card) => (
          <article key={card.title} className="card px-5 py-5">
            <h2 className="text-lg font-semibold text-slate-950">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{card.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
