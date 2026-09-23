# GradeSnap

A mobile-first PWA that lets a teacher photograph a paper exam and get AI-assisted
grading, with a **mandatory human review step** before any grade is final.

## Stack

- **Frontend:** React + Vite (PWA via `vite-plugin-pwa`), React Router, mobile-first CSS (min 375px).
- **Backend:** Supabase — Postgres (exams/questions/submissions/scores), Auth (email/password), Storage (captured exam photos), Edge Functions (Deno).
- **OCR + grading:** Google Gemini API (free tier, `gemini-2.0-flash` by default), called only from the single `process-submission` edge function. One multimodal request reads the photographed paper *and* grades any short-answer questions against their rubric — no separate OCR service or grading LLM. MCQ questions are still graded deterministically in code against the answer key, never by the model.
- **Client-side throttling:** requests to `process-submission` are queued and rate-limited in the browser (see `src/lib/geminiThrottle.ts`) to stay under Gemini's free-tier RPM/RPD limits when scanning a stack of papers.

## Project layout

```
src/                    Frontend app
  pages/                Login, exam list/create/detail, scan, review, results
  components/           CaptureCamera, ProtectedRoute
  contexts/AuthContext  Supabase auth session
  lib/
    api.ts              All Supabase table/storage/function calls
    geminiThrottle.ts   Client-side queue + daily cap for the Gemini-backed call
    grading.ts          Pure MCQ grading + response-validation logic (unit tested)
supabase/
  migrations/0001_init.sql   Schema + RLS policies + storage bucket
  functions/
    process-submission/ Image in → Gemini OCR + short-answer grading → submission + scores out
    _shared/            CORS, retry-once helper, deterministic MCQ grading, Gemini client
```

## Setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migration in `supabase/migrations/0001_init.sql` (via `supabase db push` with the [Supabase CLI](https://supabase.com/docs/guides/cli), or paste it into the SQL editor). It creates the `exams`, `questions`, `submissions`, `submission_scores` tables with row-level security scoped per teacher, plus the private `exam-scans` storage bucket.
3. Enable email/password auth (default) in Authentication settings.

### 2. Environment variables

Copy `.env.example` to `.env` (frontend) and fill in your Supabase project URL/anon key. **Never commit `.env`.**

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

For the edge function, set the server-side secret (this must never reach the client):

```bash
supabase secrets set GEMINI_API_KEY=your-key
```

Get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com/app/apikey).

### 3. Deploy the edge function

```bash
supabase functions deploy process-submission
```

### 4. Run the app

```bash
npm install
npm run dev
```

### 5. Tests

```bash
npm test
```

Covers the MCQ auto-grading logic (`src/lib/grading.ts`) — normalization of noisy OCR'd
option letters, correct/incorrect scoring, and validation/clamping of the AI JSON
response shape — since that path has no human-in-the-loop step.

## How grading/review works

1. Teacher photographs a paper (camera or file picker with `capture="environment"`).
2. The client throttles/queues the call (`src/lib/geminiThrottle.ts`) so a stack of scans
   doesn't burst past Gemini's free-tier rate limits, then calls the single
   `process-submission` edge function.
3. That function sends one Gemini multimodal request with the image plus the exam's
   questions/rubrics, and gets back the transcribed student name, each question's
   transcribed answer, and — for short-answer questions only — `{ score, confidence, note }`
   clamped to the question's max points. MCQ questions are graded deterministically in code
   from the transcribed answer vs. the answer key (no LLM verdict involved).
4. On the **Review** screen: high-confidence MCQ matches are pre-accepted (still editable);
   every short-answer question and every low-confidence result is flagged and requires an
   explicit tap to confirm or override before the paper can be saved. Nothing is saved as
   final until every row is confirmed.
5. **Results** screen shows class average, per-student totals, and which questions lost the
   most points, computed only from confirmed submissions.

If the Gemini call fails (including free-tier rate limiting), the edge function retries
once, then falls back to a manual-entry state on the Review screen instead of blocking the
flow. If the client-side daily cap is hit first, the teacher sees a friendly message before
any request is even sent.

## Out of scope for this MVP

Essay-length/multi-criteria rubric grading, multi-school/admin dashboards, non-English
OCR/grading, offline mode, native apps, and analytics beyond the single-exam results screen.