// Supabase Edge Function: process-submission.
// Single combined OCR + grading step, per the Gemini-based stack: one
// multimodal request reads the photographed exam paper AND grades any
// short-answer questions against their rubric. MCQ questions are still
// graded deterministically in code against the answer key — Gemini only
// supplies the transcribed answer text for those, never the verdict.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { gradeMcq } from '../_shared/mcqGrading.ts'
import { callGemini, type GeminiResult, type QuestionForPrompt } from '../_shared/gemini.ts'
import { withRetryOnce } from '../_shared/retry.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

interface ProcessRequestBody {
  examId: string
  imagePath: string
}

interface QuestionRow {
  id: string
  question_number: number
  type: 'mcq' | 'short_answer'
  prompt: string
  options: Array<{ label: string; text: string }> | null
  correct_option: string | null
  rubric: string | null
  max_points: number
}

function clampScore(score: number | null, maxPoints: number): number {
  if (score == null) return 0
  return Math.min(Math.max(score, 0), maxPoints)
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { examId, imagePath } = (await req.json()) as ProcessRequestBody
    if (!examId || !imagePath) {
      return new Response(JSON.stringify({ error: 'examId and imagePath are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('*')
      .eq('exam_id', examId)
      .order('question_number', { ascending: true })
    if (questionsError) throw questionsError
    const questionRows = (questions ?? []) as QuestionRow[]

    const { data: imageBlob, error: downloadError } = await supabase.storage
      .from('exam-scans')
      .download(imagePath)
    if (downloadError) throw downloadError

    const imageBuffer = new Uint8Array(await imageBlob.arrayBuffer())
    const base64Image = btoa(String.fromCharCode(...imageBuffer))
    const mimeType = imageBlob.type || 'image/jpeg'

    const questionsForPrompt: QuestionForPrompt[] = questionRows.map((q) => ({
      questionNumber: q.question_number,
      type: q.type,
      prompt: q.prompt,
      options: q.options,
      rubric: q.rubric,
      maxPoints: q.max_points,
    }))

    let geminiResult: GeminiResult | null = null
    let status: 'graded' | 'error' = 'graded'
    try {
      geminiResult = await withRetryOnce(() => callGemini(base64Image, mimeType, questionsForPrompt))
    } catch (geminiError) {
      console.error('Gemini call failed after retry:', geminiError)
      status = 'error'
    }

    // Always log the raw model output for debugging, per spec.
    console.log('Gemini result for', imagePath, ':', JSON.stringify(geminiResult))

    const ocrAnswers: Record<string, string> = {}
    for (const answer of geminiResult?.answers ?? []) {
      if (answer.extractedAnswer) ocrAnswers[String(answer.questionNumber)] = answer.extractedAnswer
    }

    const { data: submission, error: insertError } = await supabase
      .from('submissions')
      .insert({
        exam_id: examId,
        image_path: imagePath,
        student_name: geminiResult?.studentName ?? null,
        raw_ocr_text: geminiResult ? JSON.stringify(geminiResult) : null,
        ocr_answers: ocrAnswers,
        status,
      })
      .select()
      .single()
    if (insertError) throw insertError

    for (const question of questionRows) {
      const geminiAnswer = geminiResult?.answers.find((a) => a.questionNumber === question.question_number)
      const extractedAnswer = geminiAnswer?.extractedAnswer ?? null

      let row: {
        submission_id: string
        question_id: string
        ai_score: number | null
        ai_confidence: 'high' | 'low' | null
        ai_note: string | null
      }

      if (!geminiResult) {
        row = {
          submission_id: submission.id,
          question_id: question.id,
          ai_score: null,
          ai_confidence: 'low',
          ai_note: 'AI grading failed — enter this score manually.',
        }
      } else if (question.type === 'mcq') {
        const result = gradeMcq(question, extractedAnswer)
        row = {
          submission_id: submission.id,
          question_id: question.id,
          ai_score: result.score,
          ai_confidence: 'high',
          ai_note: result.isCorrect
            ? `Matched answer key option "${question.correct_option}".`
            : `Selected "${result.normalizedAnswer ?? 'no answer detected'}"; answer key is "${question.correct_option}".`,
        }
      } else {
        row = {
          submission_id: submission.id,
          question_id: question.id,
          ai_score: geminiAnswer ? clampScore(geminiAnswer.score, question.max_points) : null,
          ai_confidence: geminiAnswer?.confidence ?? 'low',
          ai_note: geminiAnswer?.note ?? 'AI grading unavailable for this question — enter manually.',
        }
      }

      const { error: upsertError } = await supabase
        .from('submission_scores')
        .upsert(row, { onConflict: 'submission_id,question_id' })
      if (upsertError) throw upsertError
    }

    return new Response(JSON.stringify({ submissionId: submission.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('process-submission error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
