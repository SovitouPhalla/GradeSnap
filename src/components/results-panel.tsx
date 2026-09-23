"use client";

import { useEffect, useMemo, useState } from "react";
import { SetupBanner } from "@/components/setup-banner";
import { hasSupabasePublicEnv } from "@/lib/env";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type QuestionRow = {
  id: string;
  order_index: number;
  prompt: string;
  max_points: number;
};

type SubmissionRow = {
  id: string;
  student_name: string | null;
  total_final_score: number | null;
  review_status: string;
};

type AnswerRow = {
  question_id: string;
  final_score: number;
};

export function ResultsPanel({ examId }: { examId: string }) {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("Exam results");
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerRow[]>>({});

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;

    const load = async () => {
      const [examResponse, questionResponse, submissionResponse] = await Promise.all([
        supabase.from("exams").select("title").eq("id", examId).single(),
        supabase
          .from("questions")
          .select("id,order_index,prompt,max_points")
          .eq("exam_id", examId)
          .order("order_index", { ascending: true }),
        supabase
          .from("submissions")
          .select("id,student_name,total_final_score,review_status")
          .eq("exam_id", examId)
          .eq("review_status", "confirmed")
          .order("created_at", { ascending: true }),
      ]);

      if (!mounted) {
        return;
      }

      if (examResponse.error || questionResponse.error || submissionResponse.error) {
        setError(
          examResponse.error?.message ??
            questionResponse.error?.message ??
            submissionResponse.error?.message ??
            "Failed to load results.",
        );
        setLoading(false);
        return;
      }

      const confirmedSubmissions = (submissionResponse.data as SubmissionRow[]) ?? [];
      const answerResponse = confirmedSubmissions.length
        ? await supabase
            .from("submission_answers")
            .select("submission_id,question_id,final_score")
            .in(
              "submission_id",
              confirmedSubmissions.map((submission) => submission.id),
            )
        : { data: [], error: null };

      if (answerResponse.error) {
        setError(answerResponse.error.message);
        setLoading(false);
        return;
      }

      const groupedAnswers = ((answerResponse.data as Array<
        AnswerRow & { submission_id: string }
      >) ?? []).reduce<Record<string, AnswerRow[]>>((accumulator, answer) => {
        accumulator[answer.submission_id] ??= [];
        accumulator[answer.submission_id].push({
          question_id: answer.question_id,
          final_score: Number(answer.final_score ?? 0),
        });
        return accumulator;
      }, {});

      setTitle(examResponse.data?.title ?? "Exam results");
      setQuestions((questionResponse.data as QuestionRow[]) ?? []);
      setSubmissions(confirmedSubmissions);
      setAnswers(groupedAnswers);
      setLoading(false);
    };

    load().catch((loadError) => {
      if (mounted) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load results.");
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [examId, supabase]);

  if (!hasSupabasePublicEnv()) {
    return <SetupBanner />;
  }

  if (loading) {
    return <div className="text-sm text-slate-600">Loading results…</div>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  const totals = submissions
    .map((submission) => submission.total_final_score)
    .filter((score): score is number => typeof score === "number");
  const classAverage = totals.length
    ? totals.reduce((sum, score) => sum + score, 0) / totals.length
    : null;

  const pointLoss = questions
    .map((question) => {
      const loss = submissions.reduce((sum, submission) => {
        const score = answers[submission.id]?.find((answer) => answer.question_id === question.id)?.final_score ?? 0;
        return sum + Math.max(0, Number(question.max_points) - Number(score));
      }, 0);

      return {
        question,
        loss,
      };
    })
    .sort((left, right) => right.loss - left.loss);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-500">Exam</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{title}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-500">Class average</p>
          <p className="mt-1 text-3xl font-bold text-slate-950">
            {classAverage === null ? "—" : classAverage.toFixed(1)}
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">Students</h2>
        {submissions.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 p-4 text-sm text-slate-600">
            No confirmed papers yet.
          </div>
        ) : (
          submissions.map((submission) => (
            <div key={submission.id} className="rounded-3xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-900">{submission.student_name || "Unnamed student"}</p>
                <p className="text-sm text-slate-600">{Number(submission.total_final_score ?? 0).toFixed(1)}</p>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">Most point loss</h2>
        {pointLoss.map(({ question, loss }) => (
          <div key={question.id} className="rounded-3xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">Question {question.order_index}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{question.prompt}</p>
              </div>
              <p className="text-sm font-semibold text-slate-700">{loss.toFixed(1)} lost</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
