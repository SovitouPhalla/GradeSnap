"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { SetupBanner } from "@/components/setup-banner";
import { hasSupabasePublicEnv } from "@/lib/env";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type ExamQuestion = {
  id: string;
  order_index: number;
  prompt: string;
  type: "mcq" | "short_answer";
  max_points: number;
};

type ExamDetail = {
  id: string;
  title: string;
  questions: ExamQuestion[];
};

export function ScanForm({ examId }: { examId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;

    const load = async () => {
      const [{ data: sessionData }, examResponse] = await Promise.all([
        supabase.auth.getSession(),
        supabase
          .from("exams")
          .select("id,title,questions(id,order_index,prompt,type,max_points)")
          .eq("id", examId)
          .single(),
      ]);

      if (!mounted) {
        return;
      }

      setSession(sessionData.session ?? null);
      if (examResponse.error) {
        setError(examResponse.error.message);
      } else {
        setExam(examResponse.data as ExamDetail);
      }
      setLoading(false);
    };

    load().catch((loadError) => {
      if (mounted) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load exam.");
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [examId, supabase]);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const clearFile = () => {
    setFile(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const submitPaper = async () => {
    if (!session) {
      setError("Sign in before uploading a paper.");
      return;
    }
    if (!file) {
      setError("Choose or capture an image first.");
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("examId", examId);
    formData.append("file", file);

    const response = await fetch("/api/submissions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + session.access_token,
      },
      body: formData,
    });

    const payload = (await response.json().catch(() => null)) as
      | { submissionId?: string; message?: string }
      | null;

    setUploading(false);

    if (!response.ok || !payload?.submissionId) {
      setError(payload?.message ?? "Failed to process this paper.");
      return;
    }

    router.push(`/review/${payload.submissionId}`);
  };

  if (!hasSupabasePublicEnv()) {
    return <SetupBanner />;
  }

  if (loading) {
    return <div className="text-sm text-slate-600">Loading exam…</div>;
  }

  if (error && !exam) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-500">Exam</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-950">{exam?.title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {exam?.questions.length ?? 0} questions • upload one student paper at a time.
        </p>
      </div>

      <label className="space-y-2 text-sm font-medium text-slate-700">
        <span>Capture or upload a paper image</span>
        <input
          accept="image/*"
          capture="environment"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          ref={inputRef}
          type="file"
        />
      </label>

      {file ? (
        <button className="secondary-button" onClick={clearFile} type="button">
          Remove selected image
        </button>
      ) : null}

      {previewUrl ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">Confirm preview</p>
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-100">
            <Image
              alt="Captured exam paper preview"
              className="h-auto w-full object-cover"
              height={1200}
              src={previewUrl}
              unoptimized
              width={900}
            />
          </div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        OCR or LLM issues retry once on the server. If either step still fails, GradeSnap keeps the
        paper moving and lets you enter answers or scores manually on the review screen.
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button className="primary-button" disabled={uploading || !file} onClick={submitPaper} type="button">
        {uploading ? "Processing paper…" : "Upload and grade"}
      </button>
    </div>
  );
}
