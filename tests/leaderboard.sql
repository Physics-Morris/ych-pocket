-- Run against a disposable database after supabase/leaderboard.sql.
-- Everything here is rolled back, including the sample scores.
begin;
set local role anon;
do $$
declare
  result jsonb;
  sample_id uuid := '11111111-1111-4111-8111-111111111111';
begin
  result := public.ych_submit_score(sample_id, 'classic-calm', 'Database check', 5000);
  assert result->>'rank' = '1', 'first score must rank first';
  result := public.ych_submit_score(sample_id, 'classic-calm', 'Database check', 5000);
  assert (select count(*) from public.ych_leaderboard('classic-calm')) = 1, 'retry must not duplicate';

  begin
    perform public.ych_submit_score(sample_id, 'classic-calm', 'Changed', 4000);
    raise exception 'Changed retry accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.ych_submit_score(gen_random_uuid(), 'fake-board', 'Invalid', 1000);
    raise exception 'Invalid board accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.ych_submit_score(gen_random_uuid(), 'classic-calm', '', 1000);
    raise exception 'Empty name accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.ych_submit_score(gen_random_uuid(), 'classic-calm', E'Bad\nname', 1000);
    raise exception 'Control character accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.ych_submit_score(gen_random_uuid(), 'classic-calm', 'Invalid', -1);
    raise exception 'Negative time accepted';
  exception when invalid_parameter_value then null;
  end;
  for i in 1..12 loop
    perform public.ych_submit_score(gen_random_uuid(), 'classic-calm', 'Player ' || i, i * 100);
  end loop;
  assert (select count(*) from public.ych_leaderboard('classic-calm')) = 10, 'only fastest ten are public';
  assert (select min(ms) = 100 and max(ms) = 1000 from public.ych_leaderboard('classic-calm')), 'top ten must be the fastest';
  result := public.ych_submit_score(sample_id, 'classic-calm', 'Database check', 5000);
  assert result->>'rank' = '13', 'rank includes scores outside top ten';

  perform public.ych_submit_score(gen_random_uuid(), 'classic-fish', 'Fish', 2100);
  perform public.ych_submit_score(gen_random_uuid(), 'color-calm', 'Color', 2200);
  perform public.ych_submit_score(gen_random_uuid(), 'color-fish', 'Color fish', 2300);
  assert (select name = 'Fish' from public.ych_leaderboard('classic-fish')), 'classic fish isolated';
  assert (select name = 'Color' from public.ych_leaderboard('color-calm')), 'color calm isolated';
  assert (select name = 'Color fish' from public.ych_leaderboard('color-fish')), 'color fish isolated';

  begin
    perform * from ych_private.scores;
    raise exception 'Direct table read allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from ych_private.scores;
    raise exception 'Direct delete allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update ych_private.scores set ms = 1;
    raise exception 'Direct update allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;
