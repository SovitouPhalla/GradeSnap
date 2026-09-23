"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { SetupBanner } from "@/components/setup-banner";
import { hasSupabasePublicEnv } from "@/lib/env";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type ExamCard = {
  id: string;
  title: string;
  created_at: string;
  questions?: Array<{ id: string }>;
  submissions?: Array<{ id: string; review_status: string | null; total_final_score: number | null }>;
};

export function DashboardShell() {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const [exams, setExams] = useState<ExamCard[]>([]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;

    const load = async () => {
      const [{ data: sessionData }, examsResponse] = await Promise.all([
        supabase.auth.getSession(),
        supabase
          .from("exams")
          .select("id,title,created_at,questions(id),submissions(id,review_status,total_final_score)")
          .order("created_at", { ascending: false }),
      ]);

      if (!mounted) {
        return;
      }

      setSession(sessionData.session ?? null);
      if (examsResponse.error) {
        setError(examsResponse.error.message);
      } else {
        setExams((examsResponse.data as ExamCard[]) ?? []);
      }
      setLoading(false);
    };

    load().catch((loadError) => {
      if (mounted) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard.");
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  if (!hasSupabasePublicEnv()) {
    return <SetupBanner />;
  }

  if (loading) {
    return <div className="card px-5 py-6 text-sm text-slate-600">Loading dashboard…</div>;
  }

  if (!session) {
    return (
      <section className="card px-5 py-6">
        <h1 className="text-2xl font-bold text-slate-950">Sign in to continue</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Use the sign-in form on the home page before creating exams or reviewing papers.
        </p>
        <Link className="primary-button mt-4 inline-flex" href="/">
          Go to home
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="card flex flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">Teacher dashboard</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">Welcome back</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Build exams, scan papers, and confirm AI suggestions before any grade is finalized.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link className="primary-button" href="/exams/new">
            Create exam
          </Link>
        </div>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="grid gap-4">
        {exams.length === 0 ? (
          <div className="card px-5 py-6 text-sm leading-6 text-slate-600">
            No exams yet. Create your first exam to unlock the scan, review, and results workflow.
          </div>
        ) : null}

        {exams.map((exam) => {
          const confirmedSubmissions = (exam.submissions ?? []).filter(
            (submission) => submission.review_status === "confirmed",
          );
          const confirmedScores = confirmedSubmissions
            .map((submission) => submission.total_final_score)
            .filter((score): score is number => typeof score === "number");
          const average =
            confirmedScores.length > 0
              ? confirmedScores.reduce((sum, score) => sum + score, 0) / confirmedScores.length
              : null;

          return (
            <article key={exam.id} className="card px-5 py-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">{exam.title}</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {(exam.questions ?? []).length} questions • {confirmedSubmissions.length} reviewed papers
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {average === null ? "No confirmed scores yet" : `Class average: ${average.toFixed(1)}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link className="secondary-button" href={`/exams/${exam.id}/scan`}>
                    Scan paper
                  </Link>
                  <Link className="secondary-button" href={`/exams/${exam.id}/results`}>
                    View results
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
