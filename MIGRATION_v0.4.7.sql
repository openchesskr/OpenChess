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
