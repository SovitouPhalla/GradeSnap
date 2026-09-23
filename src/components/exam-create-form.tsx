"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { SetupBanner } from "@/components/setup-banner";
import { hasSupabasePublicEnv } from "@/lib/env";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { QuestionDraft, QuestionType } from "@/lib/types";

const newQuestion = (orderIndex: number, type: QuestionType = "mcq"): QuestionDraft => ({
  orderIndex,
  prompt: "",
  type,
  correctOption: "A",
  rubric: "",
  maxPoints: 1,
});

export function ExamCreateForm() {
  const router = useRouter();
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([newQuestion(1)]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => setSession(data.session ?? null));
  }, [supabase]);

  const updateQuestion = (index: number, partial: Partial<QuestionDraft>) => {
    setQuestions((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...partial } : question,
      ),
    );
  };

  const addQuestion = (type: QuestionType) => {
    setQuestions((current) => [...current, newQuestion(current.length + 1, type)]);
  };

  const removeQuestion = (index: number) => {
    setQuestions((current) =>
      current
        .filter((_, questionIndex) => questionIndex !== index)
        .map((question, questionIndex) => ({ ...question, orderIndex: questionIndex + 1 })),
    );
  };

  const saveExam = async () => {
    if (!supabase) {
      return;
    }
    if (!session) {
      setError("Sign in before creating an exam.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const { data: exam, error: examError } = await supabase
      .from("exams")
      .insert({ teacher_id: session.user.id, title })
      .select("id")
      .single();

    if (examError || !exam) {
      setSaving(false);
      setError(examError?.message ?? "Failed to create exam.");
      return;
    }

    const rows = questions.map((question, index) => ({
      exam_id: exam.id,
      order_index: index + 1,
      prompt: question.prompt,
      type: question.type,
      correct_option: question.type === "mcq" ? question.correctOption : null,
      rubric: question.type === "short_answer" ? question.rubric : null,
      max_points: question.maxPoints,
    }));

    const { error: questionsError } = await supabase.from("questions").insert(rows);
    setSaving(false);

    if (questionsError) {
      setError(questionsError.message);
      return;
    }

    setMessage("Exam created. Redirecting to scan flow…");
    router.push(`/exams/${exam.id}/scan`);
  };

  if (!hasSupabasePublicEnv()) {
    return <SetupBanner />;
  }

  return (
    <div className="space-y-6">
      <label className="space-y-2 text-sm font-medium text-slate-700">
        <span>Exam title</span>
        <input
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Midterm 1"
          required
          value={title}
        />
      </label>

      <div className="space-y-4">
        {questions.map((question, index) => (
          <div key={`${question.orderIndex}-${index}`} className="rounded-3xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-950">Question {index + 1}</h2>
              {questions.length > 1 ? (
                <button className="ghost-button text-sm" onClick={() => removeQuestion(index)} type="button">
                  Remove
                </button>
              ) : null}
            </div>
            <div className="mt-4 space-y-4">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Prompt</span>
                <textarea
                  onChange={(event) => updateQuestion(index, { prompt: event.target.value })}
                  placeholder="What is the capital of France?"
                  rows={3}
                  value={question.prompt}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Type</span>
                <select
                  onChange={(event) =>
                    updateQuestion(index, {
                      type: event.target.value as QuestionType,
                      correctOption: event.target.value === "mcq" ? question.correctOption || "A" : "A",
                      rubric: event.target.value === "short_answer" ? question.rubric : "",
                    })
                  }
                  value={question.type}
                >
                  <option value="mcq">Multiple choice</option>
                  <option value="short_answer">Short answer</option>
                </select>
              </label>
              {question.type === "mcq" ? (
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Correct option</span>
                  <input
                    maxLength={1}
                    onChange={(event) =>
                      updateQuestion(index, { correctOption: event.target.value.toUpperCase() })
                    }
                    placeholder="A"
                    value={question.correctOption}
                  />
                </label>
              ) : (
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Rubric / model answer</span>
                  <textarea
                    onChange={(event) => updateQuestion(index, { rubric: event.target.value })}
                    placeholder="Mention that chlorophyll captures light energy for photosynthesis."
                    rows={4}
                    value={question.rubric}
                  />
                </label>
              )}
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Max points</span>
                <input
                  min={1}
                  onChange={(event) =>
                    updateQuestion(index, { maxPoints: Math.max(1, Number(event.target.value) || 1) })
                  }
                  step={1}
                  type="number"
                  value={question.maxPoints}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="secondary-button" onClick={() => addQuestion("mcq")} type="button">
          Add MCQ question
        </button>
        <button
          className="secondary-button"
          onClick={() => addQuestion("short_answer")}
          type="button"
        >
          Add short-answer question
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <button
        className="primary-button"
        disabled={
          saving ||
          !title.trim() ||
          questions.some(
            (question) =>
              !question.prompt.trim() ||
              (question.type === "mcq" ? !question.correctOption.trim() : !question.rubric.trim()),
          )
        }
        onClick={saveExam}
        type="button"
      >
        {saving ? "Saving exam…" : "Save exam"}
      </button>
    </div>
  );
}
