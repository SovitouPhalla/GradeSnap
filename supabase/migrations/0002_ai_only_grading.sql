-- Remove the pre-authored question/answer-key model: teachers no longer type in
-- questions, options, or rubrics before scanning. Gemini now identifies the
-- questions on the page itself and grades them from its own subject knowledge
-- (no answer key), replacing `questions` + `submission_scores` with a single
-- per-submission table populated entirely from the AI's reading of the paper.

drop policy if exists "Teachers manage scores on their own exams" on submission_scores;
drop policy if exists "Teachers manage questions on their own exams" on questions;
drop table if exists submission_scores;
drop table if exists questions;

alter table submissions drop column if exists ocr_answers;

create table if not exists submission_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions (id) on delete cascade,
  question_number integer not null,
  question_type text not null check (question_type in ('mcq', 'short_answer')),
  prompt text, -- question text as read off the page by the AI (best effort)
  extracted_answer text,
  max_points numeric not null default 1,
  ai_score numeric,
  ai_confidence text check (ai_confidence in ('high', 'low')),
  ai_note text,
  final_score numeric,
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (submission_id, question_number)
);

create index if not exists submission_items_submission_id_idx on submission_items (submission_id);

alter table submission_items enable row level security;

create policy "Teachers manage items on their own submissions" on submission_items
  for all
  using (
    exists (
      select 1 from submissions s
      join exams e on e.id = s.exam_id
      where s.id = submission_items.submission_id and e.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from submissions s
      join exams e on e.id = s.exam_id
      where s.id = submission_items.submission_id and e.teacher_id = auth.uid()
    )
  );
