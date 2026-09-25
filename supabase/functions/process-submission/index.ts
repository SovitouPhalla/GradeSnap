// Supabase Edge Function: process-submission.
// Single combined OCR + grading step: one multimodal Gemini request reads the
// photographed paper (one or more page images), identifies every question on
// it, and grades each answer using its own subject knowledge — there is no
// teacher-authored answer key.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { callGemini, type GeminiImage, type GeminiResult } from '../_shared/gemini.ts'
import { withRetryOnce } from '../_shared/retry.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

interface ProcessRequestBody {
  examId: string
  imagePaths: string[]
}

// Spreading a multi-megabyte Uint8Array into String.fromCharCode(...) overflows
// the call stack, so build the binary string in chunks instead.
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { examId, imagePaths } = (await req.json()) as ProcessRequestBody
    if (!examId || !imagePaths || imagePaths.length === 0) {
      return new Response(JSON.stringify({ error: 'examId and at least one imagePath are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const images: GeminiImage[] = []
    for (const imagePath of imagePaths) {
      const { data: imageBlob, error: downloadError } = await supabase.storage
        .from('exam-scans')
        .download(imagePath)
      if (downloadError) throw downloadError
      const imageBuffer = new Uint8Array(await imageBlob.arrayBuffer())
      images.push({ base64: bytesToBase64(imageBuffer), mimeType: imageBlob.type || 'image/jpeg' })
    }

    let geminiResult: GeminiResult | null = null
    let status: 'graded' | 'error' = 'graded'
    let geminiErrorMessage: string | null = null
    try {
      geminiResult = await withRetryOnce(() => callGemini(images))
    } catch (geminiError) {
      console.error('Gemini call failed after retry:', geminiError)
      status = 'error'
      geminiErrorMessage = geminiError instanceof Error ? geminiError.message : String(geminiError)
    }

    // Always log the raw model output (or the failure reason) for debugging.
    console.log('Gemini result for', imagePaths.join(', '), ':', JSON.stringify(geminiResult ?? geminiErrorMessage))

    const { data: submission, error: insertError } = await supabase
      .from('submissions')
      .insert({
        exam_id: examId,
        image_paths: imagePaths,
        student_name: geminiResult?.studentName ?? null,
        raw_ocr_text: geminiResult ? JSON.stringify(geminiResult) : geminiErrorMessage,
        status,
      })
      .select()
      .single()
    if (insertError) throw insertError

    if (geminiResult) {
      const itemRows = geminiResult.questions.map((q) => ({
        submission_id: submission.id,
        question_number: q.questionNumber,
        question_type: q.questionType,
        prompt: q.prompt,
        extracted_answer: q.extractedAnswer,
        max_points: q.maxPoints,
        ai_score: q.score,
        ai_confidence: q.confidence,
        ai_note: q.note,
      }))
      if (itemRows.length > 0) {
        const { error: itemsError } = await supabase.from('submission_items').insert(itemRows)
        if (itemsError) throw itemsError
      }
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
