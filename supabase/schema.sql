create extension if not exists pgcrypto;

create table if not exists public.teachers (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_teacher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.teachers (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_teacher();

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  order_index integer not null,
  prompt text not null,
  type text not null check (type in ('mcq', 'short_answer')),
  correct_option text,
  rubric text,
  max_points integer not null check (max_points >= 0),
  created_at timestamptz not null default now(),
  unique (exam_id, order_index)
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  student_name text,
  image_path text not null,
  raw_ocr_text text not null default '',
  review_status text not null default 'pending' check (review_status in ('pending', 'confirmed')),
  total_ai_score numeric(8,2),
  total_final_score numeric(8,2),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  question_number integer not null,
  student_response text not null default '',
  ai_score numeric(6,2) not null default 0,
  final_score numeric(6,2) not null default 0,
  confidence text not null check (confidence in ('high', 'low')),
  note text not null,
  needs_review boolean not null default true,
  teacher_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (submission_id, question_id)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_exam_updated_at on public.exams;
create trigger set_exam_updated_at
before update on public.exams
for each row execute procedure public.touch_updated_at();

alter table public.teachers enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_answers enable row level security;

create policy if not exists "teachers manage own profile"
on public.teachers
for all
using (auth.uid() = id)
with check (auth.uid() = id);

create policy if not exists "teachers manage own exams"
on public.exams
for all
using (auth.uid() = teacher_id)
with check (auth.uid() = teacher_id);

create policy if not exists "teachers manage own questions"
on public.questions
for all
using (
  exists (
    select 1 from public.exams
    where public.exams.id = questions.exam_id and public.exams.teacher_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.exams
    where public.exams.id = questions.exam_id and public.exams.teacher_id = auth.uid()
  )
);

create policy if not exists "teachers manage own submissions"
on public.submissions
for all
using (auth.uid() = teacher_id)
with check (auth.uid() = teacher_id);

create policy if not exists "teachers manage own submission answers"
on public.submission_answers
for all
using (
  exists (
    select 1 from public.submissions
    where public.submissions.id = submission_answers.submission_id
      and public.submissions.teacher_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.submissions
    where public.submissions.id = submission_answers.submission_id
      and public.submissions.teacher_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public)
values ('submission-images', 'submission-images', false)
on conflict (id) do nothing;


create or replace function public.confirm_submission_review(
  target_submission_id uuid,
  actor_teacher_id uuid,
  target_student_name text,
  answer_updates jsonb
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_count integer;
  item jsonb;
  answer_id uuid;
  reviewed boolean;
  total_score numeric(8,2);
begin
  select count(*) into expected_count
  from public.submission_answers sa
  join public.submissions s on s.id = sa.submission_id
  where sa.submission_id = target_submission_id
    and s.teacher_id = actor_teacher_id;

  if expected_count = 0 then
    raise exception 'Submission not found.';
  end if;

  if jsonb_typeof(answer_updates) <> 'array' or jsonb_array_length(answer_updates) <> expected_count then
    raise exception 'Every stored answer must be included when confirming a paper.';
  end if;

  for item in select * from jsonb_array_elements(answer_updates)
  loop
    answer_id := (item ->> 'id')::uuid;
    reviewed := coalesce((item ->> 'reviewed')::boolean, false);

    update public.submission_answers sa
    set student_response = coalesce(item ->> 'studentResponse', ''),
        final_score = greatest(0, least(coalesce((item ->> 'finalScore')::numeric, 0), q.max_points)),
        teacher_confirmed = true,
        needs_review = case when reviewed then false else sa.needs_review end
    from public.questions q,
         public.submissions s
    where sa.id = answer_id
      and sa.question_id = q.id
      and sa.submission_id = target_submission_id
      and s.id = sa.submission_id
      and s.teacher_id = actor_teacher_id
      and (not sa.needs_review or reviewed);

    if not found then
      raise exception 'Every flagged answer must be reviewed before confirmation.';
    end if;
  end loop;

  select coalesce(sum(final_score), 0) into total_score
  from public.submission_answers
  where submission_id = target_submission_id;

  update public.submissions
  set student_name = nullif(trim(coalesce(target_student_name, '')), ''),
      review_status = 'confirmed',
      reviewed_at = now(),
      total_final_score = total_score
  where id = target_submission_id
    and teacher_id = actor_teacher_id;

  return total_score;
end;
$$;


create policy if not exists "teachers access own submission images"
on storage.objects
for all to authenticated
using (
  bucket_id = 'submission-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'submission-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);


create or replace function public.create_exam_with_questions(
  target_title text,
  question_rows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_exam_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if jsonb_typeof(question_rows) <> 'array' or jsonb_array_length(question_rows) = 0 then
    raise exception 'At least one question is required.';
  end if;

  insert into public.exams (teacher_id, title)
  values (auth.uid(), target_title)
  returning id into new_exam_id;

  insert into public.questions (exam_id, order_index, prompt, type, correct_option, rubric, max_points)
  select
    new_exam_id,
    (question_row ->> 'order_index')::integer,
    question_row ->> 'prompt',
    question_row ->> 'type',
    nullif(question_row ->> 'correct_option', ''),
    nullif(question_row ->> 'rubric', ''),
    (question_row ->> 'max_points')::integer
  from jsonb_array_elements(question_rows) as question_row;

  return new_exam_id;
end;
$$;


create or replace function public.create_submission_with_answers(
  actor_teacher_id uuid,
  target_exam_id uuid,
  target_student_name text,
  target_image_path text,
  target_raw_ocr_text text,
  target_total_ai_score numeric,
  answer_rows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_submission_id uuid;
begin
  if jsonb_typeof(answer_rows) <> 'array' or jsonb_array_length(answer_rows) = 0 then
    raise exception 'At least one answer row is required.';
  end if;

  insert into public.submissions (
    exam_id,
    teacher_id,
    student_name,
    image_path,
    raw_ocr_text,
    review_status,
    total_ai_score
  ) values (
    target_exam_id,
    actor_teacher_id,
    target_student_name,
    target_image_path,
    coalesce(target_raw_ocr_text, ''),
    'pending',
    target_total_ai_score
  )
  returning id into new_submission_id;

  insert into public.submission_answers (
    submission_id,
    question_id,
    question_number,
    student_response,
    ai_score,
    final_score,
    confidence,
    note,
    needs_review,
    teacher_confirmed
  )
  select
    new_submission_id,
    (answer_row ->> 'question_id')::uuid,
    (answer_row ->> 'question_number')::integer,
    coalesce(answer_row ->> 'student_response', ''),
    coalesce((answer_row ->> 'ai_score')::numeric, 0),
    coalesce((answer_row ->> 'final_score')::numeric, 0),
    answer_row ->> 'confidence',
    coalesce(answer_row ->> 'note', ''),
    coalesce((answer_row ->> 'needs_review')::boolean, true),
    coalesce((answer_row ->> 'teacher_confirmed')::boolean, false)
  from jsonb_array_elements(answer_rows) as answer_row;

  return new_submission_id;
end;
$$;


revoke all on function public.confirm_submission_review(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_submission_review(uuid, uuid, text, jsonb) to service_role;
revoke all on function public.create_submission_with_answers(uuid, uuid, text, text, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.create_submission_with_answers(uuid, uuid, text, text, text, numeric, jsonb) to service_role;
grant execute on function public.create_exam_with_questions(text, jsonb) to authenticated;
