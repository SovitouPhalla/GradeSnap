import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/lib/auth";
import { extractTextWithVision } from "@/lib/ocr";

export async function POST(request: NextRequest) {
  try {
    await requireTeacher(request);
    const body = (await request.json()) as { imageBase64?: string; questionCount?: number };

    if (!body.imageBase64 || !body.questionCount) {
      return NextResponse.json(
        { message: "imageBase64 and questionCount are required." },
        { status: 400 },
      );
    }

    const result = await extractTextWithVision(body.imageBase64, body.questionCount);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "OCR failed.",
      },
      { status: 503 },
    );
  }
}
