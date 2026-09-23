export type ConfirmSubmissionPayload = {
  studentName?: string;
  answers: Array<{
    id: string;
    studentResponse: string;
    finalScore: number;
    reviewed: boolean;
  }>;
};

export async function confirmSubmissionReview({
  supabase,
  teacherId,
  submissionId,
  payload,
}: {
  supabase: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: number | null; error: { message?: string } | null }> };
  teacherId: string;
  submissionId: string;
  payload: ConfirmSubmissionPayload;
}) {
  const { data, error } = await supabase.rpc("confirm_submission_review", {
    actor_teacher_id: teacherId,
    answer_updates: payload.answers,
    target_student_name: payload.studentName?.trim() || null,
    target_submission_id: submissionId,
  });

  if (error) {
    const message = error.message || "Failed to confirm paper.";
    const status =
      /not found/i.test(message)
        ? 404
        : /must be included|must be reviewed|out of date/i.test(message)
          ? 400
          : 500;

    return {
      ok: false as const,
      status,
      message,
    };
  }

  return {
    ok: true as const,
    totalFinalScore: data,
  };
}
