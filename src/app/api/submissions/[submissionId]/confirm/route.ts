import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/lib/auth";
import { confirmSubmissionReview } from "@/lib/confirm-submission";
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

    const result = await confirmSubmissionReview({
      supabase: getServiceSupabase(),
      teacherId: teacher.id,
      submissionId,
      payload: {
        studentName: body.studentName,
        answers: body.answers,
      },
    });

    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    return NextResponse.json({ message: "Paper confirmed.", totalFinalScore: result.totalFinalScore });
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
