alter table public.quiz_questions
  add column if not exists difficulty text not null default 'medium',
  add column if not exists code_snippet text,
  add column if not exists image_url text,
  add column if not exists enable_playground boolean not null default false,
  add column if not exists correct_answer_text text,
  add column if not exists time_limit_seconds integer;

notify pgrst, 'reload schema';