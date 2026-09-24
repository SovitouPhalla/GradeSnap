# GradeSnap

A mobile-first PWA that lets a teacher photograph a paper exam and get AI-assisted
grading, with a **mandatory human review step** before any grade is final.

There's no manual exam setup: a teacher just names the exam, then scans papers.
Gemini reads each photographed page itself — identifying every question, transcribing
the student's answer, and grading it from its own subject-matter knowledge. There is no
answer key or rubric to author up front.

## Stack

- **Frontend:** React + Vite (PWA via `vite-plugin-pwa`), React Router, mobile-first CSS (min 375px).
- **Backend:** Supabase — Postgres (exams/submissions/submission_items), Auth (email/password), Storage (captured exam photos), Edge Functions (Deno).
- **OCR + grading:** Google Gemini API (free tier, `gemini-flash-latest` by default — an alias Google keeps pointed at their current flash model, since pinned version ids get retired periodically), called only from the single `process-submission` edge function. One multimodal request reads the photographed paper, identifies each question and the student's answer, and grades every question — MCQ or short-answer — using its own knowledge. There is no deterministic answer-key comparison; every score is the model's judgment, which is why the human review step is mandatory.
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
    grading.ts          Response-validation/clamping logic + review-flagging rule (unit tested)
supabase/
  migrations/            Schema + RLS policies + storage bucket (0001 original, 0002 moves to AI-only grading)
  functions/
    process-submission/ Image in → Gemini reads + grades every question → submission + submission_items out
    _shared/            CORS, retry-once helper, Gemini client
```

## Setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migrations in `supabase/migrations/` in order (via `supabase db push` with the [Supabase CLI](https://supabase.com/docs/guides/cli), or paste them into the SQL editor). `0001_init.sql` creates the original schema; `0002_ai_only_grading.sql` drops the manual `questions`/`submission_scores` tables and adds `submission_items`, which stores whatever questions Gemini finds on each page. Row-level security stays scoped per teacher, plus the private `exam-scans` storage bucket.
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

Covers the AI response validation/clamping logic (`src/lib/grading.ts`) — parsing and
clamping the score against a question's max points, rejecting malformed responses, and
the confidence-based review-flagging rule — since grading has no deterministic fallback.

## How grading/review works

1. Teacher creates an exam with just a title — no questions or answer key to enter.
2. Teacher photographs a paper (camera or file picker with `capture="environment"`).
3. The client throttles/queues the call (`src/lib/geminiThrottle.ts`) so a stack of scans
   doesn't burst past Gemini's free-tier rate limits, then calls the single
   `process-submission` edge function.
4. That function sends one Gemini multimodal request with just the image. Gemini reads the
   student's name, finds every question on the page, transcribes the student's answer, and
   grades it from its own knowledge — for open-ended questions it grades on effort/completeness
   rather than a single right answer — returning `{ score, confidence, note }` per question,
   clamped to that question's max points. There is no answer key involved at any point.
5. On the **Review** screen: high-confidence results are pre-accepted (still editable); every
   low-confidence result is flagged and requires an explicit tap to confirm or override before
   the paper can be saved. Nothing is saved as final until every row is confirmed. If Gemini
   couldn't read the page at all, the teacher is prompted to retake the photo instead of seeing
   a per-question grading UI.
6. **Results** screen shows class average, per-student totals, and which question numbers lost
   the most points, computed only from confirmed submissions.

If the Gemini call fails (including free-tier rate limiting), the edge function retries once;
if it still fails, the submission is marked `error` with no questions to review, and the teacher
is prompted to retake the photo. If the client-side daily cap is hit first, the teacher sees a
friendly message before any request is even sent.

## Out of scope for this MVP

Guaranteed-correct MCQ grading (every score, MCQ or short-answer, is now the model's judgment
rather than a deterministic answer-key comparison — the human review step is the only
safety net), essay-length/multi-criteria rubric grading, multi-school/admin dashboards,
non-English OCR/grading, offline mode, native apps, and analytics beyond the single-exam
results screen.