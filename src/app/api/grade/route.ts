import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { gradeSubmission } from "@/lib/grading";
import type { OCRResult, QuestionRecord } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    await requireTeacher(request);
    const body = (await request.json()) as { questions?: QuestionRecord[]; ocrResult?: OCRResult };

    if (!body.questions || !body.ocrResult) {
      return NextResponse.json(
        { message: "questions and ocrResult are required." },
        { status: 400 },
      );
    }

    const suggestions = await gradeSubmission(body.questions, body.ocrResult);
    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Grading failed." },
      { status: 503 },
    );
  }
}
