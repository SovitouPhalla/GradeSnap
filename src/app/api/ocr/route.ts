import { NextRequest, NextResponse } from "next/server";
import { extractTextWithVision } from "@/lib/ocr";

export async function POST(request: NextRequest) {
  try {
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
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "OCR failed.",
      },
      { status: 503 },
    );
  }
}
