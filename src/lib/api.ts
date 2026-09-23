import { supabase } from '../supabaseClient'
import { throttledGeminiCall } from './geminiThrottle'
import type { Exam, Question, Submission, SubmissionScore } from '../types'

export async function listExams(): Promise<Exam[]> {
  const { data, error } = await supabase.from('exams').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as Exam[]
}

export async function getExam(examId: string): Promise<Exam> {
  const { data, error } = await supabase.from('exams').select('*').eq('id', examId).single()
  if (error) throw error
  return data as Exam
}

export async function createExam(title: string): Promise<Exam> {
  const { data: userData } = await supabase.auth.getUser()
  const teacherId = userData.user?.id
  if (!teacherId) throw new Error('Not signed in')
  const { data, error } = await supabase
    .from('exams')
    .insert({ title, teacher_id: teacherId })
    .select()
    .single()
  if (error) throw error
  return data as Exam
}

export async function listQuestions(examId: string): Promise<Question[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('exam_id', examId)
    .order('question_number', { ascending: true })
  if (error) throw error
  return data as Question[]
}

export type NewQuestion = Omit<Question, 'id' | 'exam_id' | 'created_at'>

export async function createQuestions(examId: string, questions: NewQuestion[]): Promise<Question[]> {
  const rows = questions.map((q) => ({ ...q, exam_id: examId }))
  const { data, error } = await supabase.from('questions').insert(rows).select()
  if (error) throw error
  return data as Question[]
}

export async function listSubmissions(examId: string): Promise<Submission[]> {
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('exam_id', examId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Submission[]
}

export async function getSubmission(submissionId: string): Promise<Submission> {
  const { data, error } = await supabase.from('submissions').select('*').eq('id', submissionId).single()
  if (error) throw error
  return data as Submission
}

export async function listSubmissionScores(submissionId: string): Promise<SubmissionScore[]> {
  const { data, error } = await supabase
    .from('submission_scores')
    .select('*')
    .eq('submission_id', submissionId)
  if (error) throw error
  return data as SubmissionScore[]
}

export async function listScoresForSubmissions(submissionIds: string[]): Promise<SubmissionScore[]> {
  if (submissionIds.length === 0) return []
  const { data, error } = await supabase
    .from('submission_scores')
    .select('*')
    .in('submission_id', submissionIds)
  if (error) throw error
  return data as SubmissionScore[]
}

export async function uploadExamImage(examId: string, file: Blob): Promise<string> {
  const path = `${examId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('exam-scans').upload(path, file, {
    contentType: 'image/jpeg',
  })
  if (error) throw error
  return path
}

/** Calls the server-side process-submission edge function: a single Gemini
 * multimodal request does OCR + short-answer grading (MCQ is graded
 * deterministically server-side). Never touches the Gemini API key on the
 * client, and is throttled client-side to stay under Gemini's free-tier
 * rate limits. */
export async function processSubmission(examId: string, imagePath: string): Promise<{ submissionId: string }> {
  return throttledGeminiCall(async () => {
    const { data, error } = await supabase.functions.invoke('process-submission', {
      body: { examId, imagePath },
    })
    if (error) throw error
    return data as { submissionId: string }
  })
}

export interface ScoreUpdate {
  questionId: string
  finalScore: number
}

export async function confirmSubmissionScores(
  submissionId: string,
  updates: ScoreUpdate[],
): Promise<void> {
  const now = new Date().toISOString()
  for (const update of updates) {
    const { error } = await supabase
      .from('submission_scores')
      .update({ final_score: update.finalScore, confirmed: true, confirmed_at: now })
      .eq('submission_id', submissionId)
      .eq('question_id', update.questionId)
    if (error) throw error
  }
  const { error: statusError } = await supabase
    .from('submissions')
    .update({ status: 'confirmed', updated_at: now })
    .eq('id', submissionId)
  if (statusError) throw statusError
}
