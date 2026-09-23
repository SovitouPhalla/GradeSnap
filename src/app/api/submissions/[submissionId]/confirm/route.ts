import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { clampScore } from "@/lib/mcq";
import { getServiceSupabase } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  try {
    const teacher = await requireTeacher(request);
    const { submissionId } = await params;
    const body = (await request.json()) as {
      studentName?: string;
      answers?: Array<{
        id: string;
        studentResponse: string;
        finalScore: number;
        reviewed: boolean;
      }>;
    };

    if (!Array.isArray(body.answers)) {
      return NextResponse.json({ message: "answers are required." }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select("id,exam_id,teacher_id")
      .eq("id", submissionId)
      .single();

    if (submissionError || !submission || submission.teacher_id !== teacher.id) {
      return NextResponse.json({ message: "Submission not found." }, { status: 404 });
    }

    const [existingAnswersResponse, questionsResponse] = await Promise.all([
      supabase
        .from("submission_answers")
        .select("id,question_id,needs_review")
        .eq("submission_id", submissionId),
      supabase
        .from("questions")
        .select("id,max_points")
        .eq("exam_id", submission.exam_id),
    ]);

    if (existingAnswersResponse.error || questionsResponse.error) {
      return NextResponse.json(
        {
          message:
            existingAnswersResponse.error?.message ??
            questionsResponse.error?.message ??
            "Failed to load review rows.",
        },
        { status: 500 },
      );
    }

    const questionLookup = new Map(
      (questionsResponse.data ?? []).map((question) => [question.id, Number(question.max_points)]),
    );
    const answerLookup = new Map(
      (existingAnswersResponse.data ?? []).map((answer) => [answer.id, answer]),
    );

    for (const answer of body.answers) {
      const existing = answerLookup.get(answer.id);
      if (!existing) {
        return NextResponse.json({ message: "Review payload is out of date." }, { status: 409 });
      }
      if (existing.needs_review && !answer.reviewed) {
        return NextResponse.json(
          { message: "Every flagged answer must be reviewed before confirmation." },
          { status: 400 },
        );
      }
    }

    const updates = body.answers.map((answer) => {
      const existing = answerLookup.get(answer.id)!;
      const maxPoints = questionLookup.get(existing.question_id) ?? 0;
      return supabase
        .from("submission_answers")
        .update({
          student_response: answer.studentResponse,
          final_score: clampScore(Number(answer.finalScore), maxPoints),
          teacher_confirmed: true,
        })
        .eq("id", answer.id)
        .eq("submission_id", submissionId);
    });

    const updateResults = await Promise.all(updates);
    const failedUpdate = updateResults.find((result) => result.error);
    if (failedUpdate?.error) {
      return NextResponse.json({ message: failedUpdate.error.message }, { status: 500 });
    }

    const { data: refreshedAnswers, error: refreshedAnswersError } = await supabase
      .from("submission_answers")
      .select("final_score")
      .eq("submission_id", submissionId);

    if (refreshedAnswersError) {
      return NextResponse.json({ message: refreshedAnswersError.message }, { status: 500 });
    }

    const totalFinalScore = (refreshedAnswers ?? []).reduce(
      (sum, answer) => sum + Number(answer.final_score ?? 0),
      0,
    );

    const { error: finalError } = await supabase
      .from("submissions")
      .update({
        student_name: body.studentName?.trim() || null,
        review_status: "confirmed",
        reviewed_at: new Date().toISOString(),
        total_final_score: totalFinalScore,
      })
      .eq("id", submissionId)
      .eq("teacher_id", teacher.id);

    if (finalError) {
      return NextResponse.json({ message: finalError.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Paper confirmed.", totalFinalScore });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to confirm paper." },
      { status: 500 },
    );
  }
}
