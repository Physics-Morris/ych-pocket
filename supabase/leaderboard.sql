-- Run once in your project's Supabase SQL Editor. Safe to re-run.
-- Scores live outside the public API schema. Only the two narrow RPCs are exposed.
begin;

create schema if not exists ych_private;
revoke all on schema ych_private from public, anon, authenticated;

create table if not exists ych_private.scores (
  id uuid primary key,
  board text not null check (board in ('classic-calm', 'classic-fish', 'color-calm', 'color-fish')),
  name text not null check (char_length(name) between 1 and 20 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  ms integer not null check (ms > 0),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists scores_fastest on ych_private.scores (board, ms, created_at, id);
alter table ych_private.scores enable row level security;
revoke all on ych_private.scores from public, anon, authenticated;

create or replace function public.ych_leaderboard(p_board text)
returns table(name text, ms integer)
language sql stable security definer set search_path = ''
as $$
  select s.name, s.ms from ych_private.scores s
  where s.board = p_board
  order by s.ms, s.created_at, s.id limit 10;
$$;

create or replace function public.ych_submit_score(p_id uuid, p_board text, p_name text, p_ms integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  saved ych_private.scores%rowtype;
  position bigint;
begin
  if p_id is null or p_board is null or p_name is null or p_ms is null
    or p_board not in ('classic-calm', 'classic-fish', 'color-calm', 'color-fish')
    or char_length(p_name) not between 1 and 20 or p_name <> btrim(p_name)
    or p_name ~ '[[:cntrl:]]' or p_ms <= 0 then
    raise exception 'Invalid score' using errcode = '22023';
  end if;

  -- The same finished round can be retried after a lost response without adding a row.
  insert into ych_private.scores (id, board, name, ms) values (p_id, p_board, p_name, p_ms)
    on conflict (id) do nothing;
  select * into saved from ych_private.scores where id = p_id;
  if saved.board <> p_board or saved.name <> p_name or saved.ms <> p_ms then
    raise exception 'Submission already exists' using errcode = '22023';
  end if;
  select count(*) + 1 into position from ych_private.scores s
    where s.board = saved.board and (s.ms, s.created_at, s.id) < (saved.ms, saved.created_at, saved.id);
  return jsonb_build_object('rank', position);
end;
$$;

revoke all on function public.ych_leaderboard(text) from public, anon, authenticated;
revoke all on function public.ych_submit_score(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.ych_leaderboard(text) to anon;
grant execute on function public.ych_submit_score(uuid, text, text, integer) to anon;

notify pgrst, 'reload schema';
commit;
