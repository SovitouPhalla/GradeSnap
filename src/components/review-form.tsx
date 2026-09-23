"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { SetupBanner } from "@/components/setup-banner";
import { hasSupabasePublicEnv } from "@/lib/env";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { clampScore } from "@/lib/mcq";

type SubmissionRow = {
  id: string;
  exam_id: string;
  student_name: string | null;
  raw_ocr_text: string;
  review_status: string;
};

type QuestionRow = {
  id: string;
  order_index: number;
  prompt: string;
  type: "mcq" | "short_answer";
  max_points: number;
};

type AnswerRow = {
  id: string;
  question_id: string;
  question_number: number;
  student_response: string;
  ai_score: number;
  final_score: number;
  confidence: "high" | "low";
  note: string;
  needs_review: boolean;
  teacher_confirmed: boolean;
};

function buildQuickPickScores(maxPoints: number) {
  const scores = new Set<number>();

  for (let score = 0; score <= maxPoints + 0.001; score += 0.5) {
    scores.add(Number(score.toFixed(2)));
  }

  scores.add(Number(maxPoints.toFixed(2)));

  return Array.from(scores).sort((left, right) => left - right);
}

type ReviewState = AnswerRow & {
  prompt: string;
  questionType: "mcq" | "short_answer";
  maxPoints: number;
  reviewed: boolean;
};

export function ReviewForm({ submissionId }: { submissionId: string }) {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [examTitle, setExamTitle] = useState("");
  const [studentName, setStudentName] = useState("");
  const [rawText, setRawText] = useState("");
  const [submission, setSubmission] = useState<SubmissionRow | null>(null);
  const [answers, setAnswers] = useState<ReviewState[]>([]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;

    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const activeSession = sessionData.session ?? null;

      if (!mounted) {
        return;
      }

      setSession(activeSession);

      if (!activeSession) {
        setLoading(false);
        return;
      }

      const { data: submissionRow, error: submissionError } = await supabase
        .from("submissions")
        .select("id,exam_id,student_name,raw_ocr_text,review_status")
        .eq("id", submissionId)
        .single();

      if (submissionError || !submissionRow) {
        setError(submissionError?.message ?? "Submission not found.");
        setLoading(false);
        return;
      }

      const [examResponse, questionResponse, answerResponse] = await Promise.all([
        supabase.from("exams").select("title").eq("id", submissionRow.exam_id).single(),
        supabase
          .from("questions")
          .select("id,order_index,prompt,type,max_points")
          .eq("exam_id", submissionRow.exam_id)
          .order("order_index", { ascending: true }),
        supabase
          .from("submission_answers")
          .select(
            "id,question_id,question_number,student_response,ai_score,final_score,confidence,note,needs_review,teacher_confirmed",
          )
          .eq("submission_id", submissionId)
          .order("question_number", { ascending: true }),
      ]);

      if (!mounted) {
        return;
      }

      if (examResponse.error || questionResponse.error || answerResponse.error) {
        setError(
          examResponse.error?.message ??
            questionResponse.error?.message ??
            answerResponse.error?.message ??
            "Failed to load review data.",
        );
        setLoading(false);
        return;
      }

      const questions = (questionResponse.data as QuestionRow[]) ?? [];
      const nextAnswers = ((answerResponse.data as AnswerRow[]) ?? []).map((answer) => {
        const question = questions.find((item) => item.id === answer.question_id);
        return {
          ...answer,
          prompt: question?.prompt ?? `Question ${answer.question_number}`,
          questionType: question?.type ?? "short_answer",
          maxPoints: Number(question?.max_points ?? answer.final_score ?? 1),
          reviewed: answer.needs_review ? answer.teacher_confirmed : true,
        } satisfies ReviewState;
      });

      setSubmission(submissionRow as SubmissionRow);
      setExamTitle(examResponse.data?.title ?? "Exam");
      setStudentName(submissionRow.student_name ?? "");
      setRawText(submissionRow.raw_ocr_text ?? "");
      setAnswers(nextAnswers);
      setLoading(false);
    };

    load().catch((loadError) => {
      if (mounted) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load review.");
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [submissionId, supabase]);

  const updateAnswer = (answerId: string, partial: Partial<ReviewState>) => {
    setAnswers((current) =>
      current.map((answer) => (answer.id === answerId ? { ...answer, ...partial } : answer)),
    );
  };

  const unresolvedFlags = answers.filter((answer) => answer.needs_review && !answer.reviewed).length;
  const totalScore = answers.reduce((sum, answer) => sum + Number(answer.final_score || 0), 0);

  const confirmPaper = async () => {
    if (!session || !submission) {
      setError("Sign in before confirming a paper.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const response = await fetch(`/api/submissions/${submission.id}/confirm`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + session.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        studentName,
        answers: answers.map((answer) => ({
          id: answer.id,
          studentResponse: answer.student_response,
          finalScore: answer.final_score,
          reviewed: answer.reviewed,
        })),
      }),
    });

    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    setSaving(false);

    if (!response.ok) {
      setError(payload?.message ?? "Failed to confirm this paper.");
      return;
    }

    setSuccess("Paper confirmed. Final scores are now saved.");
    setSubmission((current) => (current ? { ...current, review_status: "confirmed" } : current));
    setAnswers((current) => current.map((answer) => ({ ...answer, reviewed: true, teacher_confirmed: true })));
  };

  if (!hasSupabasePublicEnv()) {
    return <SetupBanner />;
  }

  if (loading) {
    return <div className="text-sm text-slate-600">Loading review…</div>;
  }

  if (!session) {
    return (
      <div className="space-y-3 text-sm text-slate-600">
        <p>Sign in on the home page before reviewing this submission.</p>
        <Link className="primary-button inline-flex" href="/">
          Go to home
        </Link>
      </div>
    );
  }

  if (error && !submission) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-3xl border border-slate-200 p-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-slate-500">Exam</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{examTitle}</p>
        </div>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>Student name</span>
          <input onChange={(event) => setStudentName(event.target.value)} value={studentName} />
        </label>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        <p className="font-semibold text-slate-800">Review rules</p>
        <ul className="mt-2 list-disc pl-5">
          <li>High-confidence MCQs can stay as-is, but you can still edit them.</li>
          <li>Every short answer and every low-confidence suggestion must be marked reviewed.</li>
          <li>Final grades are saved only after you press “Confirm paper”.</li>
        </ul>
      </div>

      {answers.map((answer, index) => (
        <article key={answer.id} className="rounded-3xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-950">Question {index + 1}</h2>
            <span className={`pill ${answer.needs_review ? "pill--warning" : "pill--success"}`}>
              {answer.needs_review ? "Needs review" : "Auto-ready"}
            </span>
            <span className={`pill ${answer.confidence === "high" ? "pill--success" : "pill--danger"}`}>
              {answer.confidence} confidence
            </span>
          </div>
          <p className="mt-3 text-sm font-medium text-slate-700">{answer.prompt}</p>
          <label className="mt-4 block space-y-2 text-sm font-medium text-slate-700">
            <span>Student response</span>
            <textarea
              onChange={(event) =>
                updateAnswer(answer.id, { student_response: event.target.value, reviewed: answer.needs_review ? false : true })
              }
              rows={4}
              value={answer.student_response}
            />
          </label>
          <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
            <p>
              <span className="font-semibold text-slate-800">AI suggestion:</span> {answer.ai_score} / {answer.maxPoints}
            </p>
            <p className="mt-1">{answer.note}</p>
          </div>
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium text-slate-700">Final score</p>
            <label className="block space-y-2 text-sm font-medium text-slate-700">
              <span>Precise score override</span>
              <input
                max={answer.maxPoints}
                min={0}
                onChange={(event) =>
                  updateAnswer(answer.id, {
                    final_score: clampScore(Number(event.target.value), answer.maxPoints),
                    reviewed: answer.needs_review ? false : true,
                  })
                }
                step={0.5}
                type="number"
                value={answer.final_score}
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="secondary-button"
                onClick={() =>
                  updateAnswer(answer.id, {
                    final_score: clampScore(answer.final_score - 1, answer.maxPoints),
                    reviewed: answer.needs_review ? false : true,
                  })
                }
                type="button"
              >
                −
              </button>
              <div className="flex flex-wrap gap-2">
                {buildQuickPickScores(answer.maxPoints).map((scoreValue) => (
                    <button
                      className={`secondary-button ${
                        Number(answer.final_score) === scoreValue ? "border-blue-500 text-blue-700" : ""
                      }`}
                      key={scoreValue}
                      onClick={() =>
                        updateAnswer(answer.id, {
                          final_score: scoreValue,
                          reviewed: answer.needs_review ? false : true,
                        })
                      }
                      type="button"
                    >
                      {scoreValue}
                    </button>
                  ))}
              </div>
              <button
                className="secondary-button"
                onClick={() =>
                  updateAnswer(answer.id, {
                    final_score: clampScore(answer.final_score + 1, answer.maxPoints),
                    reviewed: answer.needs_review ? false : true,
                  })
                }
                type="button"
              >
                +
              </button>
            </div>
          </div>
          {answer.needs_review ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
              <p>{answer.reviewed ? "Reviewed and ready to confirm." : "Tap once after checking or overriding this answer."}</p>
              <button
                className="primary-button"
                onClick={() => updateAnswer(answer.id, { reviewed: !answer.reviewed })}
                type="button"
              >
                {answer.reviewed ? "Undo review" : "Mark reviewed"}
              </button>
            </div>
          ) : null}
        </article>
      ))}

      <details className="rounded-3xl border border-slate-200 px-4 py-4 text-sm text-slate-700">
        <summary className="cursor-pointer font-semibold text-slate-900">Raw OCR text</summary>
        <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-slate-600">{rawText || "No OCR text captured."}</pre>
      </details>

      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-500">Paper total</p>
        <p className="mt-1 text-3xl font-bold text-slate-950">{totalScore.toFixed(1)}</p>
        <p className="mt-1 text-sm text-slate-600">
          {unresolvedFlags === 0
            ? "All required reviews are complete."
            : `${unresolvedFlags} flagged item${unresolvedFlags === 1 ? "" : "s"} still need review.`}
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <button
        className="primary-button"
        disabled={saving || unresolvedFlags > 0}
        onClick={confirmPaper}
        type="button"
      >
        {saving ? "Saving final scores…" : "Confirm paper"}
      </button>
    </div>
  );
}
