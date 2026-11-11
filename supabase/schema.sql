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

-- ---- Users, votes and community (run after the block above) ----
create table if not exists public.votes (
  user_id uuid not null references auth.users(id) on delete cascade,
  joke_id bigint not null references public.jokes(id) on delete cascade,
  value smallint not null check (value in (1, -1)),
  created_at timestamptz not null default now(),
  primary key (user_id, joke_id)
);
create index if not exists votes_joke_idx on public.votes (joke_id);
alter table public.votes enable row level security;

-- value: 1 like, -1 dislike, 0 remove the vote. Returns the joke's totals and the caller's vote.
create or replace function public.vote(p_user uuid, p_joke text, p_topic text, p_value smallint)
returns table (likes bigint, dislikes bigint, my smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.jokes (joke, topic) values (p_joke, nullif(p_topic, ''))
  on conflict (joke) do update set joke = excluded.joke
  returning id into v_id;

  if p_value = 0 then
    delete from public.votes where user_id = p_user and joke_id = v_id;
  else
    insert into public.votes (user_id, joke_id, value) values (p_user, v_id, p_value)
    on conflict (user_id, joke_id) do update set value = excluded.value;
  end if;

  return query
    select count(*) filter (where value = 1),
           count(*) filter (where value = -1),
           coalesce(max(value) filter (where user_id = p_user), 0)::smallint
    from public.votes where joke_id = v_id;
end;
$$;

-- p_sort: 'top' (most likes) or 'new'. p_user may be null for guests.
create or replace function public.community(p_user uuid, p_sort text, p_limit int)
returns table (joke text, topic text, likes bigint, dislikes bigint, my smallint)
language sql
security definer
set search_path = public
as $$
  select j.joke, j.topic,
         count(v.*) filter (where v.value = 1),
         count(v.*) filter (where v.value = -1),
         coalesce(max(v.value) filter (where v.user_id = p_user), 0)::smallint
  from public.jokes j
  join public.votes v on v.joke_id = j.id
  group by j.id
  order by case when p_sort = 'new' then null else count(v.*) filter (where v.value = 1) end desc nulls last,
           j.created_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

create or replace function public.my_likes(p_user uuid)
returns table (joke text, topic text, likes bigint, dislikes bigint)
language sql
security definer
set search_path = public
as $$
  select j.joke, j.topic,
         (select count(*) from public.votes a where a.joke_id = j.id and a.value = 1),
         (select count(*) from public.votes a where a.joke_id = j.id and a.value = -1)
  from public.votes mine
  join public.jokes j on j.id = mine.joke_id
  where mine.user_id = p_user and mine.value = 1
  order by mine.created_at desc;
$$;

revoke execute on function public.vote(uuid, text, text, smallint) from public, anon, authenticated;
revoke execute on function public.community(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.my_likes(uuid) from public, anon, authenticated;
