import { env, hasVisionEnv } from "@/lib/env";
import type { OCRResult } from "@/lib/types";

function normalizeMultilineText(rawText: string) {
  return rawText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function mapAnswersFromText(rawText: string, questionCount: number): OCRResult {
  const lines = normalizeMultilineText(rawText);
  const answers = new Map<number, string>();
  let currentQuestion: number | null = null;

  for (const line of lines) {
    const match = line.match(/^(\d{1,2})[\).:-]\s*(.*)$/);

    if (match) {
      currentQuestion = Number(match[1]);
      if (currentQuestion >= 1 && currentQuestion <= questionCount) {
        answers.set(currentQuestion, match[2].trim());
      }
      continue;
    }

    if (currentQuestion && answers.has(currentQuestion)) {
      const previous = answers.get(currentQuestion);
      answers.set(currentQuestion, `${previous} ${line}`.trim());
    }
  }

  const firstQuestionIndex = lines.findIndex((line) => /^(\d{1,2})[\).:-]/.test(line));
  const possibleName = firstQuestionIndex > 0 ? lines.slice(0, firstQuestionIndex).join(" ").trim() : null;

  return {
    studentName: possibleName || null,
    rawText,
    answers: Array.from({ length: questionCount }, (_, index) => ({
      questionNumber: index + 1,
      response: answers.get(index + 1) ?? "",
    })),
  };
}

export async function extractTextWithVision(imageBase64: string, questionCount: number) {
  if (!hasVisionEnv()) {
    throw new Error("Google Cloud Vision API key is missing.");
  }

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${env.googleCloudVisionApiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: imageBase64,
            },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Vision OCR failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    responses?: Array<{ fullTextAnnotation?: { text?: string } }>;
  };
  const rawText = payload.responses?.[0]?.fullTextAnnotation?.text?.trim() ?? "";

  console.info("GradeSnap OCR raw output", rawText);

  return mapAnswersFromText(rawText, questionCount);
}
