// Calls Google's Gemini API (multimodal) to do OCR + grading in a single
// request: it reads the exam photo, extracts the student name and each
// question's answer, and — for short-answer questions only — grades that
// answer against the supplied rubric. MCQ questions are never graded by
// Gemini; only their extracted answer text is used, and scoring against the
// answer key happens deterministically in code (see mcqGrading.ts).
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.0-flash'

export interface QuestionForPrompt {
  questionNumber: number
  type: 'mcq' | 'short_answer'
  prompt: string
  options: Array<{ label: string; text: string }> | null
  rubric: string | null
  maxPoints: number
}

export interface GeminiAnswer {
  questionNumber: number
  extractedAnswer: string | null
  score: number | null
  confidence: 'high' | 'low' | null
  note: string | null
}

export interface GeminiResult {
  studentName: string | null
  answers: GeminiAnswer[]
}

function buildPrompt(questions: QuestionForPrompt[]): string {
  const questionBlocks = questions
    .map((q) => {
      if (q.type === 'mcq') {
        const options = (q.options ?? []).map((o) => `${o.label}) ${o.text}`).join('\n')
        return `Question ${q.questionNumber} (multiple choice, ${q.maxPoints} pts):\n${q.prompt}\n${options}\nFor this question, only transcribe the option letter the student selected. Do not grade it.`
      }
      return `Question ${q.questionNumber} (short answer, ${q.maxPoints} pts max):\n${q.prompt}\nRubric / model answer: ${q.rubric ?? ''}\nTranscribe the student's answer, then grade it against the rubric.`
    })
    .join('\n\n')

  return `You are grading a scanned paper exam for a teacher. The image shows one student's handwritten or printed exam paper.

Step 1: If a student name is visible (usually handwritten at the top), read it. Otherwise return null.
Step 2: For each question listed below, find and transcribe the student's answer as written on the page.
Step 3: For short-answer questions only, grade the transcribed answer against the given rubric/model answer. Award a score from 0 up to the question's max points. Set confidence to "high" only if you are confident the transcription is accurate and the grade is clear-cut; otherwise use "low". Include a one-sentence note explaining the score. Do NOT grade multiple-choice questions — leave score/confidence/note null for them.

Questions:

${questionBlocks}

Respond with ONLY a JSON object matching this shape, no markdown fences or extra commentary:
{
  "studentName": string | null,
  "answers": [
    { "questionNumber": number, "extractedAnswer": string | null, "score": number | null, "confidence": "high" | "low" | null, "note": string | null }
  ]
}`
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    studentName: { type: 'STRING', nullable: true },
    answers: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          questionNumber: { type: 'INTEGER' },
          extractedAnswer: { type: 'STRING', nullable: true },
          score: { type: 'NUMBER', nullable: true },
          confidence: { type: 'STRING', nullable: true },
          note: { type: 'STRING', nullable: true },
        },
        required: ['questionNumber'],
      },
    },
  },
  required: ['answers'],
}

export async function callGemini(
  imageBase64: string,
  mimeType: string,
  questions: QuestionForPrompt[],
): Promise<GeminiResult> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured')
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: buildPrompt(questions) }, { inlineData: { mimeType, data: imageBase64 } }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    },
  )

  if (response.status === 429) {
    throw new Error('Gemini API rate limit reached (free tier). Please try again shortly.')
  }
  if (!response.ok) {
    throw new Error(`Gemini API HTTP ${response.status}`)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof text !== 'string') {
    throw new Error('Gemini response did not contain text output')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Gemini response was not valid JSON')
  }
  return validateGeminiResult(parsed)
}

function validateGeminiResult(raw: unknown): GeminiResult {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as Record<string, unknown>).answers)) {
    throw new Error('Gemini response missing "answers" array')
  }
  const obj = raw as Record<string, unknown>
  const studentName = typeof obj.studentName === 'string' ? obj.studentName : null
  const answers: GeminiAnswer[] = (obj.answers as unknown[]).map((a) => {
    const entry = (a ?? {}) as Record<string, unknown>
    return {
      questionNumber: typeof entry.questionNumber === 'number' ? entry.questionNumber : -1,
      extractedAnswer: typeof entry.extractedAnswer === 'string' ? entry.extractedAnswer : null,
      score: typeof entry.score === 'number' && !Number.isNaN(entry.score) ? entry.score : null,
      confidence: entry.confidence === 'high' || entry.confidence === 'low' ? entry.confidence : null,
      note: typeof entry.note === 'string' ? entry.note : null,
    }
  })
  return { studentName, answers }
}
