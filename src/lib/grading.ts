import { env, hasAnthropicEnv } from "@/lib/env";
import { clampScore, gradeMcqAnswer } from "@/lib/mcq";
import type { GradeSuggestion, OCRResult, QuestionRecord } from "@/lib/types";

async function retryOnce<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (firstError) {
    return operation().catch(() => {
      throw firstError;
    });
  }
}

function extractJsonObject(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("No JSON object found in Anthropic response.");
  }
  return JSON.parse(match[0]) as { score?: number; confidence?: "high" | "low"; note?: string };
}

export async function gradeShortAnswer({
  prompt,
  rubric,
  maxPoints,
  response,
}: {
  prompt: string;
  rubric: string;
  maxPoints: number;
  response: string;
}) {
  if (!response.trim()) {
    return {
      score: 0,
      confidence: "low" as const,
      note: "No short-answer response was detected, so teacher review is required.",
    };
  }

  if (!hasAnthropicEnv()) {
    throw new Error("Anthropic API key is missing.");
  }

  const apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      temperature: 0,
      system:
        "You grade short student responses. Return JSON only with keys score, confidence, and note. Confidence must be high or low. Note must be one sentence.",
      messages: [
        {
          role: "user",
          content: `Question: ${prompt}
Rubric/model answer: ${rubric}
Max points: ${maxPoints}
Student OCR response: ${response}
Return JSON only.`,
        },
      ],
    }),
  });

  if (!apiResponse.ok) {
    throw new Error(`Anthropic grading failed with status ${apiResponse.status}.`);
  }

  const payload = (await apiResponse.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = payload.content?.find((item) => item.type === "text")?.text ?? "{}";
  const parsed = extractJsonObject(text);

  const confidence: "high" | "low" = parsed.confidence === "high" ? "high" : "low";

  return {
    score: clampScore(Number(parsed.score ?? 0), maxPoints),
    confidence,
    note: parsed.note?.trim() || "Teacher review is required.",
  };
}

export async function gradeSubmission(
  questions: QuestionRecord[],
  ocrResult: OCRResult,
  options?: {
    shortAnswerGrader?: typeof gradeShortAnswer;
  },
): Promise<GradeSuggestion[]> {
  return Promise.all(
    questions.map(async (question, index) => {
      const answer = ocrResult.answers.find((item) => item.questionNumber === index + 1)?.response ?? "";

      if (question.type === "mcq") {
        const result = gradeMcqAnswer({
          correctOption: question.correct_option,
          maxPoints: Number(question.max_points),
          response: answer,
        });

        return {
          questionId: question.id,
          questionNumber: index + 1,
          score: result.score,
          confidence: result.confidence,
          note: result.note,
          autoAccepted: result.autoAccepted,
          needsReview: result.needsReview,
          studentResponse: answer,
          questionType: question.type,
          maxPoints: Number(question.max_points),
        } satisfies GradeSuggestion;
      }

      try {
        const shortAnswerGrader = options?.shortAnswerGrader ?? gradeShortAnswer;
        const result = await retryOnce(() =>
          shortAnswerGrader({
            prompt: question.prompt,
            rubric: question.rubric ?? "",
            maxPoints: Number(question.max_points),
            response: answer,
          }),
        );

        return {
          questionId: question.id,
          questionNumber: index + 1,
          score: result.score,
          confidence: result.confidence,
          note: result.note,
          autoAccepted: false,
          needsReview: true,
          studentResponse: answer,
          questionType: question.type,
          maxPoints: Number(question.max_points),
        } satisfies GradeSuggestion;
      } catch {
        return {
          questionId: question.id,
          questionNumber: index + 1,
          score: 0,
          confidence: "low" as const,
          note: "AI grading was unavailable after retry, so enter a score manually.",
          autoAccepted: false,
          needsReview: true,
          studentResponse: answer,
          questionType: question.type,
          maxPoints: Number(question.max_points),
        } satisfies GradeSuggestion;
      }
    }),
  );
}
