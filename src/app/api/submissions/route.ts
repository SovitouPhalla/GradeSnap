import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireTeacher } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { processSubmissionForReview } from "@/lib/submission";
import type { QuestionRecord } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const teacher = await requireTeacher(request);
    const formData = await request.formData();
    const examId = formData.get("examId");
    const file = formData.get("file");

    if (typeof examId !== "string" || !(file instanceof File)) {
      return NextResponse.json(
        { message: "examId and file are required." },
        { status: 400 },
      );
    }

    const supabase = getServiceSupabase();
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("id,title,teacher_id")
      .eq("id", examId)
      .single();

    if (examError || !exam || exam.teacher_id !== teacher.id) {
      return NextResponse.json({ message: "Exam not found." }, { status: 404 });
    }

    const { data: questions, error: questionsError } = await supabase
      .from("questions")
      .select("id,order_index,prompt,type,correct_option,rubric,max_points")
      .eq("exam_id", examId)
      .order("order_index", { ascending: true });

    if (questionsError || !questions || questions.length === 0) {
      return NextResponse.json(
        { message: questionsError?.message ?? "Exam questions are missing." },
        { status: 400 },
      );
    }

    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const storagePath = `${teacher.id}/${examId}/${fileName}`;
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const imageBase64 = fileBuffer.toString("base64");
    const { error: uploadError } = await supabase.storage
      .from("submission-images")
      .upload(storagePath, fileBuffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ message: uploadError.message }, { status: 500 });
    }

    const { ocrResult, suggestions } = await processSubmissionForReview({
      imageBase64,
      questions: questions as QuestionRecord[],
    });

    const answerRows = suggestions.map((suggestion) => ({
      question_id: suggestion.questionId,
      question_number: suggestion.questionNumber,
      student_response: suggestion.studentResponse,
      ai_score: suggestion.score,
      final_score: suggestion.score,
      confidence: suggestion.confidence,
      note: suggestion.note,
      needs_review: suggestion.needsReview,
      teacher_confirmed: false,
    }));

    const { data: submissionId, error: submissionError } = await supabase.rpc(
      "create_submission_with_answers",
      {
        actor_teacher_id: teacher.id,
        answer_rows: answerRows,
        target_exam_id: examId,
        target_image_path: storagePath,
        target_raw_ocr_text: ocrResult.rawText,
        target_student_name: ocrResult.studentName,
        target_total_ai_score: suggestions.reduce((sum, suggestion) => sum + suggestion.score, 0),
      },
    );

    if (submissionError || !submissionId) {
      await supabase.storage.from("submission-images").remove([storagePath]);
      return NextResponse.json(
        { message: submissionError?.message ?? "Failed to create submission." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      submissionId,
      message:
        ocrResult.rawText && suggestions.some((suggestion) => suggestion.questionType === "short_answer")
          ? "Submission created."
          : "Submission created with manual review fallbacks where needed.",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to process paper." },
      { status: 500 },
    );
  }
}
