import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/lib/auth";
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
    const { data, error } = await supabase.rpc("confirm_submission_review", {
      actor_teacher_id: teacher.id,
      answer_updates: body.answers,
      target_student_name: body.studentName?.trim() || null,
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
      return NextResponse.json({ message }, { status });
    }

    return NextResponse.json({ message: "Paper confirmed.", totalFinalScore: data });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to confirm paper." },
      { status: 500 },
    );
  }
}
