export type QuestionType = 'mcq' | 'short_answer'

export interface McqOption {
  label: string // e.g. "A", "B", "C", "D"
  text: string
}

export interface Question {
  id: string
  exam_id: string
  question_number: number
  type: QuestionType
  prompt: string
  // mcq only
  options: McqOption[] | null
  correct_option: string | null
  // short_answer only
  rubric: string | null
  max_points: number
  created_at: string
}

export interface Exam {
  id: string
  teacher_id: string
  title: string
  created_at: string
}

export type SubmissionStatus = 'pending' | 'graded' | 'confirmed' | 'error'

export interface Submission {
  id: string
  exam_id: string
  student_name: string | null
  image_path: string | null
  raw_ocr_text: string | null
  ocr_answers: Record<string, string> | null // question_number -> extracted answer text
  status: SubmissionStatus
  created_at: string
  updated_at: string
}

export type Confidence = 'high' | 'low'

export interface SubmissionScore {
  id: string
  submission_id: string
  question_id: string
  ai_score: number | null
  ai_confidence: Confidence | null
  ai_note: string | null
  final_score: number | null
  confirmed: boolean
  confirmed_at: string | null
}

/** JSON shape Gemini returns for a graded short-answer question. */
export interface ShortAnswerGradingResult {
  score: number
  confidence: Confidence
  note: string
}
