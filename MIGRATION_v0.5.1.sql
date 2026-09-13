-- ============================================================================
-- OpenChess v0.5.1 증분 마이그레이션
-- ============================================================================
-- 이미 v0.5.0까지의 supabase-setup.sql을 적용해 둔 프로젝트에, 이번 버전(v0.5.1)에서 바뀐/추가된
-- SQL만 모아 다시 실행할 수 있게 정리한 파일입니다. (물론 supabase-setup.sql 전체를 처음부터 다시
-- 실행해도 결과는 같습니다 — 모든 문장이 create or replace/if not exists라 안전합니다.)
--
-- 이번 버전에서 바뀐 것 — PvP 실시간 대국의 "시간 초과 좀비 대국" 근본 수정:
--   체크메이트/스테일메이트/3회 동형 반복은 v0.4.5의 pvp_finish_verified + api/pvp-finish.js가 sans를
--   chess.js로 재생해 서버가 독립 검증하므로, 진 쪽 클라이언트가 결과를 보고하지 못하고 사라져도
--   이긴 쪽이 안전하게 대신 확정할 수 있다. 하지만 "시간이 다 됐다"는 sans만으로는 계산할 수
--   없어(실제 경과한 벽시계 시간이 필요) 이 문제만 그대로 남아 있었다 — 시간 초과당한 쪽이 결과
--   보고 전에 탭을 닫으면, 이긴 쪽의 pvp_finish 호출은 "자기 승리 선언 금지" 가드에 막혀 조용히
--   실패하고 그 대국은 영원히 active로 남았다.
--   1) pvp_games에 white_ms/black_ms(각 진영의 남은 시간, ms)·clock_synced_at(그 값을 마지막으로
--      맞춘 시각) 신규 — 서버가 권위 있게 들고 다니는 시계. 시계가 없는 게임(코드/나이트 미니게임
--      매칭용 "0-0" 등)은 둘 다 null로 남는다.
--   2) 헬퍼 함수 _pvp_initial_ms(time_control) 신규 — 대국 생성 시 초기 남은 시간(ms) 계산.
--   3) 헬퍼 함수 _pvp_resolve_timeout(game_id) 신규 — 지금 둘 차례인 진영의 남은 시간을
--      clock_synced_at 이후 실제로 지난 시간만큼 깎아 계산해, 0 이하면 그 자리에서 상대 승리로
--      확정한다. 클라이언트가 무엇을 주장하든 상관없이 서버 저장값만으로 계산하므로 누가 불러도
--      안전하다 — pvp_move·pvp_check_flag·pvp_queue_join이 모두 이 함수 하나를 공유한다.
--   4) 새 RPC pvp_check_flag(game_id) — authenticated 누구나(참가자 확인만) 불러 위 계산을
--      트리거할 수 있다. 자기 승리 선언 금지 가드가 없다 — 계산 자체가 클라이언트 주장을 쓰지
--      않으므로 악용 여지가 없다.
--   5) pvp_move가 수를 두기 전에 먼저 _pvp_resolve_timeout으로 시간 초과 여부를 확인하고, 통과하면
--      남은 시간에서 실제로 지난 시간을 빼고 증가시간을 더해 시계를 갱신한다.
--   6) pvp_queue_join의 재접속(좀비) 판정이 무딘 "updated_at 2분 경과" 침묵 기준 전에 먼저
--      _pvp_resolve_timeout으로 서버 시계 기준 시간 초과부터 확정하도록 바뀌었다 — 진짜 시간
--      초과된 대국은 침묵 시간과 무관하게 그 즉시 종료 처리되고, 곧장 새 매칭으로 넘어간다.
--   7) pvp_queue_join·pvp_invite_respond·pvp_rematch_offer가 새 pvp_games 행을 만들 때
--      white_ms/black_ms/clock_synced_at을 함께 초기화한다.
-- ============================================================================

alter table public.pvp_games add column if not exists white_ms integer;
alter table public.pvp_games add column if not exists black_ms integer;
alter table public.pvp_games add column if not exists clock_synced_at timestamptz not null default now();

create or replace function public._pvp_initial_ms(p_time_control text)
returns integer language sql immutable as $$
  select case
    when split_part(coalesce(p_time_control, ''), '-', 1) ~ '^[0-9]+$'
      and split_part(p_time_control, '-', 1)::int > 0
    then split_part(p_time_control, '-', 1)::int * 1000
    else null
  end;
$$;

create or replace function public._pvp_resolve_timeout(p_game_id bigint)
returns public.pvp_games language plpgsql security definer set search_path = public as $$
declare v_game public.pvp_games; v_ply int; v_white_turn boolean; v_elapsed_ms bigint; v_mover_ms int;
begin
  select * into v_game from public.pvp_games where id = p_game_id for update;
  if not found or v_game.status <> 'active' or v_game.white_ms is null or v_game.black_ms is null then
    return v_game;
  end if;
  v_ply := jsonb_array_length(v_game.sans);
  v_white_turn := (v_ply % 2) = 0;
  v_mover_ms := case when v_white_turn then v_game.white_ms else v_game.black_ms end;
  v_elapsed_ms := extract(epoch from (now() - v_game.clock_synced_at)) * 1000;
  if v_mover_ms - v_elapsed_ms > 0 then return v_game; end if;
  update public.pvp_games
    set status = case when v_white_turn then 'black_won' else 'white_won' end,
        result_reason = 'timeout', updated_at = now()
    where id = p_game_id returning * into v_game;
  return v_game;
end; $$;
grant execute on function public._pvp_resolve_timeout(bigint) to authenticated;

drop function if exists public.pvp_check_flag(bigint) cascade;
create or replace function public.pvp_check_flag(p_game_id bigint)
returns public.pvp_games language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_game public.pvp_games;
begin
  if v_me is null then raise exception 'auth required'; end if;
  select * into v_game from public.pvp_games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if v_me <> v_game.white_uid and v_me <> v_game.black_uid then raise exception 'not a participant'; end if;
  return public._pvp_resolve_timeout(p_game_id);
end; $$;
grant execute on function public.pvp_check_flag(bigint) to authenticated;

drop function if exists public.pvp_queue_join(text) cascade;
create or replace function public.pvp_queue_join(p_time_control text default '600-0', p_game_type text default 'chess')
returns public.pvp_games language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_other uuid; v_game public.pvp_games; v_w uuid; v_b uuid;
begin
  if v_me is null then raise exception 'auth required'; end if;
  select * into v_game from public.pvp_games
    where status = 'active' and (white_uid = v_me or black_uid = v_me)
    order by created_at desc limit 1;
  if found then
    v_game := public._pvp_resolve_timeout(v_game.id);
    if v_game.status = 'active' then
      if v_game.updated_at > now() - interval '2 minutes' then return v_game; end if;
      update public.pvp_games set status = 'aborted', updated_at = now() where id = v_game.id;
    end if;
  end if;
  select uid into v_other from public.pvp_queue
    where uid <> v_me and time_control = p_time_control and game_type = p_game_type
    order by created_at asc limit 1 for update skip locked;
  if v_other is null then
    insert into public.pvp_queue(uid, time_control, game_type) values (v_me, p_time_control, p_game_type)
      on conflict (uid) do update set time_control = excluded.time_control, game_type = excluded.game_type, created_at = now();
    return null;
  end if;
  delete from public.pvp_queue where uid = v_me;
  delete from public.pvp_queue where uid = v_other;
  if random() < 0.5 then v_w := v_me; v_b := v_other; else v_w := v_other; v_b := v_me; end if;
  insert into public.pvp_games(white_uid, black_uid, time_control, game_type, white_ms, black_ms, clock_synced_at)
    values (v_w, v_b, p_time_control, p_game_type, public._pvp_initial_ms(p_time_control), public._pvp_initial_ms(p_time_control), now())
    returning * into v_game;
  return v_game;
end; $$;
grant execute on function public.pvp_queue_join(text, text) to authenticated;

-- (v0.5.1 버그 수정, 개발 중 재현·수정) plpgsql 예외는 이 함수 호출 전체를 롤백시키므로,
-- _pvp_resolve_timeout이 방금 커밋해 둔 시간 초과 확정 직후 곧장 raise exception으로 넘어가면 그
-- 확정까지 함께 롤백돼 대국이 다시 조용히 active로 남는다 — "이미 끝나 있던 대국"(예외로 처리해도
-- 잃을 상태 변화가 없음)과 "방금 확정된 시간 초과"(예외 없이 그대로 반환해 커밋을 보존해야 함)를
-- 구분해야 한다.
drop function if exists public.pvp_move(bigint, text) cascade;
create or replace function public.pvp_move(p_game_id bigint, p_san text)
returns public.pvp_games language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_pre public.pvp_games; v_game public.pvp_games; v_ply int; v_white_turn boolean; v_expected uuid;
        v_inc_sec int; v_elapsed_ms bigint; v_mover_ms int; v_remaining_ms int;
begin
  if v_me is null then raise exception 'auth required'; end if;
  select * into v_pre from public.pvp_games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if v_pre.status <> 'active' then raise exception 'game not active'; end if;
  v_game := public._pvp_resolve_timeout(p_game_id);
  if v_game.status <> 'active' then return v_game; end if;
  if v_me <> v_game.white_uid and v_me <> v_game.black_uid then raise exception 'not a participant'; end if;
  v_ply := jsonb_array_length(v_game.sans);
  v_white_turn := (v_ply % 2) = 0;
  v_expected := case when v_white_turn then v_game.white_uid else v_game.black_uid end;
  if v_me <> v_expected then raise exception 'not your turn'; end if;
  if v_game.white_ms is not null and v_game.black_ms is not null then
    v_inc_sec := coalesce(nullif(split_part(v_game.time_control, '-', 2), '')::int, 0);
    v_mover_ms := case when v_white_turn then v_game.white_ms else v_game.black_ms end;
    v_elapsed_ms := extract(epoch from (now() - v_game.clock_synced_at)) * 1000;
    v_remaining_ms := greatest(v_mover_ms - v_elapsed_ms, 0) + (v_inc_sec * 1000);
    update public.pvp_games set
        sans = sans || to_jsonb(p_san), draw_offered_by = null, updated_at = now(),
        white_ms = case when v_white_turn then v_remaining_ms else v_game.white_ms end,
        black_ms = case when v_white_turn then v_game.black_ms else v_remaining_ms end,
        clock_synced_at = now()
      where id = p_game_id returning * into v_game;
  else
    update public.pvp_games set sans = sans || to_jsonb(p_san), draw_offered_by = null, updated_at = now()
      where id = p_game_id returning * into v_game;
  end if;
  return v_game;
end; $$;
grant execute on function public.pvp_move(bigint, text) to authenticated;

drop function if exists public.pvp_invite_respond(bigint, boolean) cascade;
create or replace function public.pvp_invite_respond(p_invite_id bigint, p_accept boolean)
returns public.pvp_invites language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_inv public.pvp_invites; v_game public.pvp_games; v_w uuid; v_b uuid;
begin
  if v_me is null then raise exception 'auth required'; end if;
  select * into v_inv from public.pvp_invites where id = p_invite_id for update;
  if not found then raise exception 'invite not found'; end if;
  if v_me <> v_inv.to_uid then raise exception 'not authorized'; end if;
  if v_inv.status <> 'pending' then return v_inv; end if;
  if not p_accept then
    update public.pvp_invites set status = 'declined', updated_at = now() where id = p_invite_id returning * into v_inv;
    return v_inv;
  end if;
  if random() < 0.5 then v_w := v_inv.from_uid; v_b := v_inv.to_uid; else v_w := v_inv.to_uid; v_b := v_inv.from_uid; end if;
  insert into public.pvp_games(white_uid, black_uid, time_control, game_type, white_ms, black_ms, clock_synced_at)
    values (v_w, v_b, v_inv.time_control, v_inv.game_type, public._pvp_initial_ms(v_inv.time_control), public._pvp_initial_ms(v_inv.time_control), now())
    returning * into v_game;
  update public.pvp_invites set status = 'accepted', game_id = v_game.id, updated_at = now() where id = p_invite_id returning * into v_inv;
  return v_inv;
end; $$;
grant execute on function public.pvp_invite_respond(bigint, boolean) to authenticated;

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
  insert into public.pvp_games(white_uid, black_uid, time_control, game_type, white_ms, black_ms, clock_synced_at)
    values (v_w, v_b, v_game.time_control, v_game.game_type, public._pvp_initial_ms(v_game.time_control), public._pvp_initial_ms(v_game.time_control), now())
    returning * into v_new;
  update public.pvp_games set rematch_offered_by = null, rematch_game_id = v_new.id, updated_at = now() where id = p_game_id;
  return v_new;
end; $$;
grant execute on function public.pvp_rematch_offer(bigint) to authenticated;

-- SQL Editor에 이 파일 전체를 붙여넣고 RUN 하세요.
