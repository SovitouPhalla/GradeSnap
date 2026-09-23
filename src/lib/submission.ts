import { gradeSubmission } from "@/lib/grading";
import { extractTextWithVision } from "@/lib/ocr";
import type { GradeSuggestion, OCRResult, QuestionRecord } from "@/lib/types";

export function createBlankOcrResult(questionCount: number): OCRResult {
  return {
    studentName: null,
    rawText: "",
    answers: Array.from({ length: questionCount }, (_, index) => ({
      questionNumber: index + 1,
      response: "",
    })),
  };
}

export async function runOcrWithFallback({
  imageBase64,
  questionCount,
  extractText = extractTextWithVision,
}: {
  imageBase64: string;
  questionCount: number;
  extractText?: (imageBase64: string, questionCount: number) => Promise<OCRResult>;
}): Promise<OCRResult> {
  try {
    return await extractText(imageBase64, questionCount);
  } catch {
    try {
      return await extractText(imageBase64, questionCount);
    } catch {
      return createBlankOcrResult(questionCount);
    }
  }
}

export async function processSubmissionForReview({
  imageBase64,
  questions,
  extractText = extractTextWithVision,
  grade = gradeSubmission,
}: {
  imageBase64: string;
  questions: QuestionRecord[];
  extractText?: (imageBase64: string, questionCount: number) => Promise<OCRResult>;
  grade?: (questions: QuestionRecord[], ocrResult: OCRResult) => Promise<GradeSuggestion[]>;
}) {
  const ocrResult = await runOcrWithFallback({
    imageBase64,
    questionCount: questions.length,
    extractText,
  });
  const suggestions = await grade(questions, ocrResult);

  return {
    ocrResult,
    suggestions,
  };
}
