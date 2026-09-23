-- GradeSnap MVP schema
-- Tables: exams, questions, submissions, submission_scores
-- RLS: teachers can only see/manage their own exams (and everything that hangs off them).

create extension if not exists "pgcrypto";

create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams (id) on delete cascade,
  question_number integer not null,
  type text not null check (type in ('mcq', 'short_answer')),
  prompt text not null,
  options jsonb, -- array of { label, text } for mcq
  correct_option text, -- mcq only
  rubric text, -- short_answer only
  max_points numeric not null default 1,
  created_at timestamptz not null default now(),
  unique (exam_id, question_number)
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams (id) on delete cascade,
  student_name text,
  image_path text,
  raw_ocr_text text,
  ocr_answers jsonb, -- { "1": "B", "2": "..." } keyed by question_number
  status text not null default 'pending' check (status in ('pending', 'graded', 'confirmed', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists submission_scores (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  ai_score numeric,
  ai_confidence text check (ai_confidence in ('high', 'low')),
  ai_note text,
  final_score numeric,
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  unique (submission_id, question_id)
);

create index if not exists questions_exam_id_idx on questions (exam_id);
create index if not exists submissions_exam_id_idx on submissions (exam_id);
create index if not exists submission_scores_submission_id_idx on submission_scores (submission_id);

alter table exams enable row level security;
alter table questions enable row level security;
alter table submissions enable row level security;
alter table submission_scores enable row level security;

create policy "Teachers manage their own exams" on exams
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "Teachers manage questions on their own exams" on questions
  for all
  using (exists (select 1 from exams e where e.id = questions.exam_id and e.teacher_id = auth.uid()))
  with check (exists (select 1 from exams e where e.id = questions.exam_id and e.teacher_id = auth.uid()));

create policy "Teachers manage submissions on their own exams" on submissions
  for all
  using (exists (select 1 from exams e where e.id = submissions.exam_id and e.teacher_id = auth.uid()))
  with check (exists (select 1 from exams e where e.id = submissions.exam_id and e.teacher_id = auth.uid()));

create policy "Teachers manage scores on their own exams" on submission_scores
  for all
  using (
    exists (
      select 1 from submissions s
      join exams e on e.id = s.exam_id
      where s.id = submission_scores.submission_id and e.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from submissions s
      join exams e on e.id = s.exam_id
      where s.id = submission_scores.submission_id and e.teacher_id = auth.uid()
    )
  );

-- Storage bucket for captured exam photos (created via Supabase dashboard/CLI as well;
-- this is here so it's tracked in migrations too). Object paths are "{examId}/{file}.jpg";
-- policies check that the exam in the path is owned by the requesting teacher.
insert into storage.buckets (id, name, public)
values ('exam-scans', 'exam-scans', false)
on conflict (id) do nothing;

create policy "Teachers can upload scans for their own exams" on storage.objects
  for insert
  with check (
    bucket_id = 'exam-scans'
    and exists (
      select 1 from exams e
      where e.id::text = (storage.foldername(name))[1]
        and e.teacher_id = auth.uid()
    )
  );

create policy "Teachers can read scans for their own exams" on storage.objects
  for select
  using (
    bucket_id = 'exam-scans'
    and exists (
      select 1 from exams e
      where e.id::text = (storage.foldername(name))[1]
        and e.teacher_id = auth.uid()
    )
  );
