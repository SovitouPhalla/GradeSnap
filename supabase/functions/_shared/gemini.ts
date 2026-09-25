// Calls Google's Gemini API (multimodal) to do OCR + grading in a single
// request. There is no teacher-authored answer key: Gemini identifies every
// question on the page itself and grades each answer using its own
// subject-matter knowledge. A mandatory human review step in the app is what
// keeps this safe, not a deterministic check against a key.
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest'

export interface GeminiQuestionResult {
  questionNumber: number
  questionType: 'mcq' | 'short_answer'
  prompt: string | null
  extractedAnswer: string | null
  maxPoints: number
  score: number | null
  confidence: 'high' | 'low' | null
  note: string | null
}

export interface GeminiResult {
  studentName: string | null
  questions: GeminiQuestionResult[]
}

const PROMPT = `You are grading a scanned paper exam/worksheet for a teacher. The image(s) show one student's handwritten or printed paper — if there is more than one image, they are consecutive pages of the SAME paper in order; treat them as one continuous document and number questions continuously across all pages (do not restart numbering on later pages). No answer key is provided — use your own subject-matter knowledge to judge correctness and assign scores.

Step 1: If a student name is visible (usually handwritten at the top of the first page), read it. Otherwise return null.
Step 2: Identify every question across all pages, in order. For each one, read the question text as printed/written, and transcribe the student's answer as written.
Step 3: Decide whether each question is multiple-choice ("mcq", lettered options given) or open-ended ("short_answer").
Step 4: Decide reasonable max points per question: use the paper's own point notation if visible (e.g. "(2 pts)"); otherwise default to 1 point for simple/factual questions and up to 3-5 for questions that clearly expect a fuller written response.
Step 5: Grade the transcribed answer. For multiple choice, award full credit only if you can determine the selected option is correct. For open-ended questions with no single correct answer (opinions, creative writing, brainstorming), grade on effort, completeness, and whether the instructions were followed, not on matching one "right" answer.
Step 6: Set confidence to "high" only when you are confident in both the transcription and the grade; otherwise "low". Always include a one-sentence note explaining the score.

Respond with ONLY a JSON object matching this shape, no markdown fences or extra commentary:
{
  "studentName": string | null,
  "questions": [
    { "questionNumber": number, "questionType": "mcq" | "short_answer", "prompt": string | null, "extractedAnswer": string | null, "maxPoints": number, "score": number | null, "confidence": "high" | "low" | null, "note": string | null }
  ]
}`

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    studentName: { type: 'STRING', nullable: true },
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          questionNumber: { type: 'INTEGER' },
          questionType: { type: 'STRING' },
          prompt: { type: 'STRING', nullable: true },
          extractedAnswer: { type: 'STRING', nullable: true },
          maxPoints: { type: 'NUMBER' },
          score: { type: 'NUMBER', nullable: true },
          confidence: { type: 'STRING', nullable: true },
          note: { type: 'STRING', nullable: true },
        },
        required: ['questionNumber', 'questionType', 'maxPoints'],
      },
    },
  },
  required: ['questions'],
}

export interface GeminiImage {
  base64: string
  mimeType: string
}

export async function callGemini(images: GeminiImage[]): Promise<GeminiResult> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured')
  }

  const imageParts = images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } }))

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: PROMPT }, ...imageParts],
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
    const bodyText = await response.text()
    throw new Error(`Gemini API HTTP ${response.status}: ${bodyText.slice(0, 1500)}`)
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
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as Record<string, unknown>).questions)) {
    throw new Error('Gemini response missing "questions" array')
  }
  const obj = raw as Record<string, unknown>
  const studentName = typeof obj.studentName === 'string' ? obj.studentName : null
  const questions: GeminiQuestionResult[] = (obj.questions as unknown[]).map((q) => {
    const entry = (q ?? {}) as Record<string, unknown>
    const maxPoints =
      typeof entry.maxPoints === 'number' && Number.isFinite(entry.maxPoints) && entry.maxPoints > 0
        ? entry.maxPoints
        : 1
    const rawScore = typeof entry.score === 'number' && !Number.isNaN(entry.score) ? entry.score : null
    return {
      questionNumber: typeof entry.questionNumber === 'number' ? entry.questionNumber : -1,
      questionType: entry.questionType === 'mcq' ? 'mcq' : 'short_answer',
      prompt: typeof entry.prompt === 'string' ? entry.prompt : null,
      extractedAnswer: typeof entry.extractedAnswer === 'string' ? entry.extractedAnswer : null,
      maxPoints,
      score: rawScore == null ? null : Math.min(Math.max(rawScore, 0), maxPoints),
      confidence: entry.confidence === 'high' || entry.confidence === 'low' ? entry.confidence : null,
      note: typeof entry.note === 'string' ? entry.note : null,
    }
  })
  return { studentName, questions }
}
