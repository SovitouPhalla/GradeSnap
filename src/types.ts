export type QuestionType = 'mcq' | 'short_answer'

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
  status: SubmissionStatus
  created_at: string
  updated_at: string
}

export type Confidence = 'high' | 'low'

/** One question the AI identified on the page, with its own AI-assigned grade. */
export interface SubmissionItem {
  id: string
  submission_id: string
  question_number: number
  question_type: QuestionType
  prompt: string | null
  extracted_answer: string | null
  max_points: number
  ai_score: number | null
  ai_confidence: Confidence | null
  ai_note: string | null
  final_score: number | null
  confirmed: boolean
  confirmed_at: string | null
  created_at: string
}

/** JSON shape Gemini returns per graded question. */
export interface GradingResult {
  score: number
  confidence: Confidence
  note: string
}
