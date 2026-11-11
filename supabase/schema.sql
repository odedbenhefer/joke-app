-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
create table if not exists public.jokes (
  id bigint generated always as identity primary key,
  joke text not null unique check (char_length(joke) between 1 and 500),
  topic text check (topic is null or char_length(topic) <= 40),
  laughs integer not null default 1,
  created_at timestamptz not null default now()
);

-- Only the server (service role key) touches this table.
alter table public.jokes enable row level security;

-- Adds a laugh: inserts the joke on the first laugh, increments afterwards.
create or replace function public.laugh(p_joke text, p_topic text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.jokes (joke, topic) values (p_joke, nullif(p_topic, ''))
  on conflict (joke) do update set laughs = public.jokes.laughs + 1
  returning laughs;
$$;

revoke execute on function public.laugh(text, text) from public, anon, authenticated;
