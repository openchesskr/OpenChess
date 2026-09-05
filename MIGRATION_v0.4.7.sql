-- ============================================================================
-- OpenChess v0.4.7 증분 마이그레이션
-- ============================================================================
-- 이미 v0.4.6까지의 supabase-setup.sql을 적용해 둔 프로젝트에, 이번 버전(v0.4.7)에서 바뀐/추가된
-- SQL만 모아 다시 실행할 수 있게 정리한 파일입니다. (물론 supabase-setup.sql 전체를 처음부터 다시
-- 실행해도 결과는 같습니다 — 모든 문장이 create or replace/if not exists라 안전합니다.)
--
-- 이번 버전에서 바뀐 것:
--   1) pvp_games.draw_offered_by(uuid) 신규 — 실시간 대국에서 합의 무승부 제안 상태를 기록한다.
--   2) pvp_move() — 수를 두면 대기 중이던 무승부 제안을 자동으로 취소하도록 draw_offered_by를
--      함께 null로 되돌린다.
--   3) pvp_draw_offer(bigint) / pvp_draw_accept(bigint) / pvp_draw_decline(bigint) 신규 — 무승부
--      "제안"과 "수락"을 분리해, 한쪽이 일방적으로 무승부를 강제할 수 없게 한다(상대만 수락 가능).
--   4) pvp_games.rematch_offered_by(uuid) / rematch_game_id(bigint) 신규, pvp_rematch_offer(bigint)
--      / pvp_rematch_decline(bigint) 신규 — 대국 결과 팝업의 "재대결" 버튼. 랜덤 매칭 상대(친구가
--      아닐 수 있음)에게도 걸 수 있도록 pvp_invites 대신 방금 끝난 그 대국 행 자체에 제안 상태를
--      기록한다. 제안/수락을 한 함수로 합쳐, 상대가 이미 제안해 둔 상태에서 내가 다시 부르면 그
--      자리에서 곧바로(진영을 맞바꿔) 새 대국을 만든다.
--   5) move_note_votes 테이블 신규, move_notes_with_votes 뷰 신규, move_note_vote(bigint, smallint)
--      신규 — "수 설명"(move_notes)에 좋아요/싫어요를 달고, 그 집계로 인기순 정렬을 만든다.
--
-- SQL Editor에 이 파일 전체를 붙여넣고 RUN 하세요.
-- ============================================================================

alter table public.pvp_games add column if not exists draw_offered_by uuid references auth.users(id) on delete set null;

drop function if exists public.pvp_move(bigint, text) cascade;
create or replace function public.pvp_move(p_game_id bigint, p_san text)
returns public.pvp_games language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_game public.pvp_games; v_ply int; v_white_turn boolean; v_expected uuid;
begin
  if v_me is null then raise exception 'auth required'; end if;
  select * into v_game from public.pvp_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_game.status <> 'active' then raise exception 'game not active'; end if;
  if v_me <> v_game.white_uid and v_me <> v_game.black_uid then raise exception 'not a participant'; end if;
  v_ply := jsonb_array_length(v_game.sans);
  v_white_turn := (v_ply % 2) = 0;
  v_expected := case when v_white_turn then v_game.white_uid else v_game.black_uid end;
  if v_me <> v_expected then raise exception 'not your turn'; end if;
  update public.pvp_games set sans = sans || to_jsonb(p_san), draw_offered_by = null, updated_at = now()
    where id = p_game_id returning * into v_game;
  return v_game;
end; $$;
grant execute on function public.pvp_move(bigint, text) to authenticated;

drop function if exists public.pvp_draw_offer(bigint) cascade;
create or replace function public.pvp_draw_offer(p_game_id bigint)
returns public.pvp_games language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_game public.pvp_games;
begin
  if v_me is null then raise exception 'auth required'; end if;
  select * into v_game from public.pvp_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_me <> v_game.white_uid and v_me <> v_game.black_uid then raise exception 'not a participant'; end if;
  if v_game.status <> 'active' then return v_game; end if;
  update public.pvp_games set draw_offered_by = v_me, updated_at = now() where id = p_game_id returning * into v_game;
  return v_game;
end; $$;
grant execute on function public.pvp_draw_offer(bigint) to authenticated;

drop function if exists public.pvp_draw_accept(bigint) cascade;
create or replace function public.pvp_draw_accept(p_game_id bigint)
returns public.pvp_games language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_game public.pvp_games;
begin
  if v_me is null then raise exception 'auth required'; end if;
  select * into v_game from public.pvp_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_me <> v_game.white_uid and v_me <> v_game.black_uid then raise exception 'not a participant'; end if;
  if v_game.status <> 'active' then return v_game; end if;
  if v_game.draw_offered_by is null or v_game.draw_offered_by = v_me then raise exception 'no pending draw offer from opponent'; end if;
  update public.pvp_games set status = 'draw', draw_offered_by = null, updated_at = now() where id = p_game_id returning * into v_game;
  return v_game;
end; $$;
grant execute on function public.pvp_draw_accept(bigint) to authenticated;

drop function if exists public.pvp_draw_decline(bigint) cascade;
create or replace function public.pvp_draw_decline(p_game_id bigint)
returns public.pvp_games language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_game public.pvp_games;
begin
  if v_me is null then raise exception 'auth required'; end if;
  select * into v_game from public.pvp_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_me <> v_game.white_uid and v_me <> v_game.black_uid then raise exception 'not a participant'; end if;
  update public.pvp_games set draw_offered_by = null, updated_at = now() where id = p_game_id returning * into v_game;
  return v_game;
end; $$;
grant execute on function public.pvp_draw_decline(bigint) to authenticated;

-- ============================================================================
-- 추가 — 재대결(rematch) 제안/수락
-- ============================================================================
alter table public.pvp_games add column if not exists rematch_offered_by uuid references auth.users(id) on delete set null;
alter table public.pvp_games add column if not exists rematch_game_id bigint references public.pvp_games(id) on delete set null;

drop function if exists public.pvp_rematch_offer(bigint) cascade;
create or replace function public.pvp_rematch_offer(p_game_id bigint)
returns public.pvp_games language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_game public.pvp_games; v_new public.pvp_games; v_w uuid; v_b uuid;
begin
  if v_me is null then raise exception 'auth required'; end if;
  select * into v_game from public.pvp_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_me <> v_game.white_uid and v_me <> v_game.black_uid then raise exception 'not a participant'; end if;
  if v_game.status = 'active' then raise exception 'game still active'; end if;
  if v_game.rematch_game_id is not null then
    select * into v_new from public.pvp_games where id = v_game.rematch_game_id;
    return v_new;
  end if;
  if v_game.rematch_offered_by is null or v_game.rematch_offered_by = v_me then
    update public.pvp_games set rematch_offered_by = v_me, updated_at = now() where id = p_game_id returning * into v_game;
    return v_game;
  end if;
  if random() < 0.5 then v_w := v_game.white_uid; v_b := v_game.black_uid; else v_w := v_game.black_uid; v_b := v_game.white_uid; end if;
  insert into public.pvp_games(white_uid, black_uid, time_control) values (v_w, v_b, v_game.time_control) returning * into v_new;
  update public.pvp_games set rematch_offered_by = null, rematch_game_id = v_new.id, updated_at = now() where id = p_game_id;
  return v_new;
end; $$;
grant execute on function public.pvp_rematch_offer(bigint) to authenticated;

drop function if exists public.pvp_rematch_decline(bigint) cascade;
create or replace function public.pvp_rematch_decline(p_game_id bigint)
returns public.pvp_games language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_game public.pvp_games;
begin
  if v_me is null then raise exception 'auth required'; end if;
  select * into v_game from public.pvp_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_me <> v_game.white_uid and v_me <> v_game.black_uid then raise exception 'not a participant'; end if;
  update public.pvp_games set rematch_offered_by = null, updated_at = now() where id = p_game_id returning * into v_game;
  return v_game;
end; $$;
grant execute on function public.pvp_rematch_decline(bigint) to authenticated;

-- ============================================================================
-- 추가 — 수 설명(move_notes) 좋아요/싫어요 + 인기순 정렬
-- ============================================================================
create table if not exists public.move_note_votes (
  note_id bigint not null references public.move_notes(id) on delete cascade,
  uid uuid not null references auth.users(id) on delete cascade,
  value smallint not null check (value in (1, -1)),
  created_at timestamptz not null default now(),
  primary key (note_id, uid)
);
alter table public.move_note_votes enable row level security;
drop policy if exists "move note votes read" on public.move_note_votes;
drop policy if exists "move note votes write" on public.move_note_votes;
create policy "move note votes read" on public.move_note_votes for select using (true);
create policy "move note votes write" on public.move_note_votes for all using (auth.uid() = uid) with check (auth.uid() = uid);
grant select on public.move_note_votes to anon, authenticated;
grant insert, update, delete on public.move_note_votes to authenticated;

create or replace view public.move_notes_with_votes as
select
  mn.*,
  coalesce(v.likes, 0) as likes,
  coalesce(v.dislikes, 0) as dislikes,
  coalesce(v.likes, 0) - coalesce(v.dislikes, 0) as score,
  (select mv.value from public.move_note_votes mv where mv.note_id = mn.id and mv.uid = auth.uid()) as my_vote
from public.move_notes mn
left join (
  select note_id,
    count(*) filter (where value = 1) as likes,
    count(*) filter (where value = -1) as dislikes
  from public.move_note_votes
  group by note_id
) v on v.note_id = mn.id;
grant select on public.move_notes_with_votes to anon, authenticated;

drop function if exists public.move_note_vote(bigint, smallint) cascade;
create or replace function public.move_note_vote(p_note_id bigint, p_value smallint)
returns table(my_vote smallint, likes bigint, dislikes bigint) language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_existing smallint;
begin
  if v_me is null then raise exception 'auth required'; end if;
  if p_value not in (1, -1) then raise exception 'invalid value'; end if;
  select value into v_existing from public.move_note_votes where note_id = p_note_id and uid = v_me;
  if v_existing is not null and v_existing = p_value then
    delete from public.move_note_votes where note_id = p_note_id and uid = v_me;
  else
    insert into public.move_note_votes(note_id, uid, value) values (p_note_id, v_me, p_value)
      on conflict (note_id, uid) do update set value = excluded.value, created_at = now();
  end if;
  return query
    select
      (select mv.value from public.move_note_votes mv where mv.note_id = p_note_id and mv.uid = v_me),
      (select count(*) from public.move_note_votes where note_id = p_note_id and value = 1),
      (select count(*) from public.move_note_votes where note_id = p_note_id and value = -1);
end; $$;
grant execute on function public.move_note_vote(bigint, smallint) to authenticated;

