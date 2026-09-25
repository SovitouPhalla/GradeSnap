import { supabase } from '../supabaseClient'
import { throttledGeminiCall } from './geminiThrottle'
import type { Exam, Submission, SubmissionItem } from '../types'

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

export async function listSubmissionItems(submissionId: string): Promise<SubmissionItem[]> {
  const { data, error } = await supabase
    .from('submission_items')
    .select('*')
    .eq('submission_id', submissionId)
    .order('question_number', { ascending: true })
  if (error) throw error
  return data as SubmissionItem[]
}

export async function listItemsForSubmissions(submissionIds: string[]): Promise<SubmissionItem[]> {
  if (submissionIds.length === 0) return []
  const { data, error } = await supabase
    .from('submission_items')
    .select('*')
    .in('submission_id', submissionIds)
  if (error) throw error
  return data as SubmissionItem[]
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
 * multimodal request reads the page(s), identifies every question across
 * them, and grades each answer with its own subject knowledge (no answer
 * key). Never touches the Gemini API key on the client, and is throttled
 * client-side to stay under Gemini's free-tier rate limits. */
export async function processSubmission(examId: string, imagePaths: string[]): Promise<{ submissionId: string }> {
  return throttledGeminiCall(async () => {
    const { data, error } = await supabase.functions.invoke('process-submission', {
      body: { examId, imagePaths },
    })
    if (error) throw error
    return data as { submissionId: string }
  })
}

export interface ItemUpdate {
  itemId: string
  finalScore: number
}

export async function confirmSubmissionItems(submissionId: string, updates: ItemUpdate[]): Promise<void> {
  const now = new Date().toISOString()
  for (const update of updates) {
    const { error } = await supabase
      .from('submission_items')
      .update({ final_score: update.finalScore, confirmed: true, confirmed_at: now })
      .eq('id', update.itemId)
    if (error) throw error
  }
  const { error: statusError } = await supabase
    .from('submissions')
    .update({ status: 'confirmed', updated_at: now })
    .eq('id', submissionId)
  if (statusError) throw statusError
}

export async function deleteSubmission(submissionId: string): Promise<void> {
  const { data: submission, error: fetchError } = await supabase
    .from('submissions')
    .select('image_paths')
    .eq('id', submissionId)
    .single()
  if (fetchError) throw fetchError
  const paths = (submission?.image_paths as string[] | null) ?? []
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from('exam-scans').remove(paths)
    if (storageError) throw storageError
  }
  const { error } = await supabase.from('submissions').delete().eq('id', submissionId)
  if (error) throw error
}

export async function deleteExam(examId: string): Promise<void> {
  const { data: submissions, error: fetchError } = await supabase
    .from('submissions')
    .select('image_paths')
    .eq('exam_id', examId)
  if (fetchError) throw fetchError
  const allPaths = (submissions ?? []).flatMap((s) => (s.image_paths as string[] | null) ?? [])
  if (allPaths.length > 0) {
    const { error: storageError } = await supabase.storage.from('exam-scans').remove(allPaths)
    if (storageError) throw storageError
  }
  const { error } = await supabase.from('exams').delete().eq('id', examId)
  if (error) throw error
}
