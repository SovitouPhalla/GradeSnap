# GradeSnap

GradeSnap is a mobile-first Next.js PWA for capturing paper exams, extracting answers with Google Cloud Vision OCR, generating AI-assisted grading suggestions, and requiring a teacher review before any grade becomes final.

## Stack

- **Frontend / hosting:** Next.js App Router (Vercel-friendly PWA)
- **Auth / data / storage:** Supabase Auth + Postgres + Storage
- **OCR:** Google Cloud Vision `DOCUMENT_TEXT_DETECTION` via server-side API routes
- **Short-answer grading:** Anthropic `claude-haiku-4-5-20251001` via server-side API routes

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the values.
3. Run the Supabase SQL in `supabase/schema.sql`.
4. The schema also creates the private `submission-images` bucket if it does not already exist.
5. Start the app:

   ```bash
   npm run dev
   ```

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLOUD_VISION_API_KEY`
- `ANTHROPIC_API_KEY`

## Key flows

- Teacher sign up / sign in with email and password
- Create an exam with MCQ and short-answer questions
- Capture one paper at a time from a phone camera or file input
- OCR extraction to student name + question-to-answer mapping
- MCQ auto-grading with deterministic scoring
- Short-answer AI scoring suggestions with mandatory teacher review
- Per-exam results for averages, student totals, and biggest point losses

## Validation

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
