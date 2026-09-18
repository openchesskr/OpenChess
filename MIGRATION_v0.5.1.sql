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

-- ============================================================================
-- 좌표 인지 게임(coord) 라운드 제한시간 제거 (v0.5.1 후속, 사용자 요청)
-- ============================================================================
-- 예전엔 라운드마다 4초 제한이 있어, 그 안에 아무도 정답을 못 맞히면 무승부 라운드로 자동 종료되고
-- 다음 라운드로 넘어갔다. 이제는 오답을 눌러도(양쪽 다) 라운드가 끝나지 않고, 누군가 정답을 맞힐
-- 때까지 계속 진행된다 — coord_reveal_next의 "제한시간 초과 시 무승부 확정" 블록과, coord_click의
-- "제한시간 초과 시 클릭 거부" 검사를 모두 제거했다(총 라운드 수 15가 홀수라 게임 전체가 무승부로
-- 끝나는 경우도 원래 없었다). 아래 두 함수를 그대로 다시 실행하면 기존 프로젝트에 반영된다.

create or replace function public.coord_reveal_next(p_game_id bigint)
returns public.pvp_games language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_game public.pvp_games; v_rounds jsonb; v_last jsonb; v_last_idx int;
  v_total_rounds constant int := 15;
  v_sq text;
begin
  if v_me is null then raise exception 'auth required'; end if;
  select * into v_game from public.pvp_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_game.game_type <> 'coord' then raise exception 'wrong game type'; end if;
  if v_me <> v_game.white_uid and v_me <> v_game.black_uid then raise exception 'not a participant'; end if;
  if v_game.status <> 'active' then return v_game; end if;
  v_rounds := v_game.sans;
  if jsonb_array_length(v_rounds) > 0 then
    v_last_idx := jsonb_array_length(v_rounds) - 1;
    v_last := v_rounds -> v_last_idx;
    if (v_last ->> 'winner') is null then
      return v_game;
    end if;
  end if;
  if jsonb_array_length(v_rounds) >= v_total_rounds then
    update public.pvp_games set sans = v_rounds, updated_at = now() where id = p_game_id returning * into v_game;
    return v_game;
  end if;
  v_sq := chr(97 + floor(random() * 8)::int) || (floor(random() * 8)::int + 1)::text;
  v_rounds := v_rounds || jsonb_build_object('sq', v_sq, 'revealedAt', now(), 'winner', null, 'resolvedAt', null, 'clicks', jsonb_build_object('w', null, 'b', null));
  update public.pvp_games set sans = v_rounds, updated_at = now() where id = p_game_id returning * into v_game;
  return v_game;
end; $$;
grant execute on function public.coord_reveal_next(bigint) to authenticated;

create or replace function public.coord_click(p_game_id bigint, p_round int, p_sq text)
returns public.pvp_games language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_game public.pvp_games; v_rounds jsonb; v_round jsonb;
  v_mycolor text; v_correct boolean;
begin
  if v_me is null then raise exception 'auth required'; end if;
  select * into v_game from public.pvp_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_game.game_type <> 'coord' or v_game.status <> 'active' then return v_game; end if;
  if v_me = v_game.white_uid then v_mycolor := 'w'; elsif v_me = v_game.black_uid then v_mycolor := 'b'; else raise exception 'not a participant'; end if;
  v_rounds := v_game.sans;
  if p_round < 0 or p_round >= jsonb_array_length(v_rounds) then return v_game; end if;
  v_round := v_rounds -> p_round;
  if (v_round ->> 'winner') is not null then return v_game; end if;
  v_correct := (v_round ->> 'sq' = p_sq);
  if v_round -> 'clicks' is null or jsonb_typeof(v_round -> 'clicks') <> 'object' then
    v_round := jsonb_set(v_round, array['clicks'], jsonb_build_object('w', null, 'b', null));
  end if;
  v_round := jsonb_set(v_round, array['clicks', v_mycolor], jsonb_build_object('sq', p_sq, 'correct', v_correct, 'at', now()));
  if v_correct then
    v_round := v_round || jsonb_build_object('winner', v_mycolor, 'resolvedAt', now());
  end if;
  v_rounds := jsonb_set(v_rounds, array[p_round::text], v_round);
  update public.pvp_games set sans = v_rounds, updated_at = now() where id = p_game_id returning * into v_game;
  return v_game;
end; $$;
grant execute on function public.coord_click(bigint, int, text) to authenticated;

-- ============================================================================
-- 나이트 경주(knight) 재설계 — 보드 하나로 통합 + 위협 기물 기반 칸 제한 (v0.5.1 후속, 사용자 요청)
-- ============================================================================
-- 예전엔 "내 보드"·"상대 보드"를 따로 그리고, 라운드마다 무작위로 고른 "방해 칸"(착지 자체가 금지된
-- 칸)이 있었다. 이제는 둘의 나이트·목표 칸을 한 보드 위에 함께 그리고(공정성을 위해 목표 칸을
-- 기준으로 두 시작 칸을 점대칭으로 배치 — 나이트 이동은 두 축 부호를 모두 뒤집어도 유효해 최短 거리가
-- 항상 같다), "방해 칸" 대신 서로 상대 색의 기물(비숍·룩)을 역시 점대칭으로 배치해 그 기물이 실제로
-- 공격하는 칸에 들어가면 나이트가 잡히도록 바꿨다. round.blocked가 target/whiteStart/blackStart/
-- hazards/wIllegal/bIllegal로 바뀌었다 — 자세한 설명은 supabase-setup.sql의 knight 섹션 주석 참고.

create or replace function public.knight_reflect_sq(p_sq text, p_center text)
returns text language plpgsql immutable as $$
declare
  f int := ascii(substr(p_sq,1,1)) - 97; r int := substr(p_sq,2)::int - 1;
  cf int := ascii(substr(p_center,1,1)) - 97; cr int := substr(p_center,2)::int - 1;
  nf int := 2*cf - f; nr int := 2*cr - r;
begin
  if nf < 0 or nf > 7 or nr < 0 or nr > 7 then return null; end if;
  return chr(97+nf) || (nr+1)::text;
end; $$;

create or replace function public.knight_attacked_squares(p_sq text, p_type text)
returns text[] language plpgsql immutable as $$
declare
  f int := ascii(substr(p_sq,1,1)) - 97; r int := substr(p_sq,2)::int - 1;
  dirs int[][] := case when p_type = 'R' then array[[1,0],[-1,0],[0,1],[0,-1]] else array[[1,1],[1,-1],[-1,1],[-1,-1]] end;
  out text[] := '{}'; i int; step int; nf int; nr int;
begin
  for i in 1..4 loop
    step := 1;
    loop
      nf := f + dirs[i][1]*step; nr := r + dirs[i][2]*step;
      exit when nf < 0 or nf > 7 or nr < 0 or nr > 7;
      out := out || (chr(97+nf) || (nr+1)::text);
      step := step + 1;
    end loop;
  end loop;
  return out;
end; $$;

create or replace function public.knight_start_round(p_game_id bigint)
returns public.pvp_games language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_game public.pvp_games; v_rounds jsonb; v_last jsonb; r jsonb;
  v_w_wins int := 0; v_b_wins int := 0; v_round_idx int;
  v_walk_len int; v_hazard_count int; v_time_ms constant int := 25000;
  v_target text; v_walk text[]; v_walk_mirror text[]; v_cand1 text; v_cand2 text;
  v_white_start text; v_black_start text; v_white_path text[]; v_black_path text[];
  v_haz_w text[]; v_haz_b text[]; v_ok boolean; v_try int; v_piece_type text; i int;
  v_hazards jsonb; v_w_illegal text[]; v_b_illegal text[];
begin
  if v_me is null then raise exception 'auth required'; end if;
  select * into v_game from public.pvp_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_game.game_type <> 'knight' then raise exception 'wrong game type'; end if;
  if v_me <> v_game.white_uid and v_me <> v_game.black_uid then raise exception 'not a participant'; end if;
  if v_game.status <> 'active' then return v_game; end if;
  v_rounds := v_game.sans;
  if jsonb_array_length(v_rounds) > 0 then
    v_last := v_rounds -> (jsonb_array_length(v_rounds) - 1);
    if (v_last ->> 'winner') is null then return v_game; end if;
  end if;
  for r in select * from jsonb_array_elements(v_rounds) loop
    if r ->> 'winner' = 'w' then v_w_wins := v_w_wins + 1; elsif r ->> 'winner' = 'b' then v_b_wins := v_b_wins + 1; end if;
  end loop;
  if v_w_wins >= 3 or v_b_wins >= 3 or jsonb_array_length(v_rounds) >= 5 then return v_game; end if;
  v_round_idx := jsonb_array_length(v_rounds);
  if v_round_idx < 2 then v_walk_len := 3; v_hazard_count := 0;
  elsif v_round_idx < 4 then v_walk_len := 4; v_hazard_count := 1;
  else v_walk_len := 5; v_hazard_count := 2;
  end if;
  v_ok := false;
  for v_try in 1..40 loop
    v_target := chr(97 + (2 + floor(random()*4))::int) || (3 + floor(random()*4))::int::text;
    v_walk := public.knight_random_walk(v_target, v_walk_len);
    v_cand1 := v_walk[array_length(v_walk,1)];
    v_cand2 := public.knight_reflect_sq(v_cand1, v_target);
    if v_cand2 is null then continue; end if;
    v_walk_mirror := array(select public.knight_reflect_sq(x, v_target) from unnest(v_walk) x);
    if array_position(v_walk_mirror, null) is not null then continue; end if;
    if substr(v_cand1,2)::int <= substr(v_cand2,2)::int then
      v_white_start := v_cand1; v_white_path := v_walk; v_black_start := v_cand2; v_black_path := v_walk_mirror;
    else
      v_white_start := v_cand2; v_white_path := v_walk_mirror; v_black_start := v_cand1; v_black_path := v_walk;
    end if;
    if v_hazard_count = 0 then
      v_haz_w := '{}'; v_haz_b := '{}';
    else
      v_haz_w := public.knight_pick_blocked(v_hazard_count, v_black_path || array[v_target, v_white_start]);
      if coalesce(array_length(v_haz_w,1),0) < v_hazard_count then continue; end if;
      v_haz_b := array(select public.knight_reflect_sq(x, v_target) from unnest(v_haz_w) x);
      if array_position(v_haz_b, null) is not null then continue; end if;
    end if;
    v_ok := true;
    exit;
  end loop;
  if not v_ok then
    v_target := 'd4';
    v_white_path := public.knight_random_walk(v_target, v_walk_len);
    v_white_start := v_white_path[array_length(v_white_path,1)];
    v_black_start := coalesce(public.knight_reflect_sq(v_white_start, v_target), v_white_start);
    v_haz_w := '{}'; v_haz_b := '{}';
  end if;
  v_hazards := '[]'::jsonb; v_w_illegal := '{}'; v_b_illegal := '{}';
  for i in 1..coalesce(array_length(v_haz_w,1),0) loop
    v_piece_type := case when random() < 0.5 then 'B' else 'R' end;
    v_hazards := v_hazards || jsonb_build_object('sq', v_haz_w[i], 'type', v_piece_type, 'color', 'w');
    v_hazards := v_hazards || jsonb_build_object('sq', v_haz_b[i], 'type', v_piece_type, 'color', 'b');
    v_b_illegal := v_b_illegal || array(select s from unnest(public.knight_attacked_squares(v_haz_w[i], v_piece_type)) s where public.knight_reflect_sq(s, v_target) is not null);
    v_w_illegal := v_w_illegal || array(select s from unnest(public.knight_attacked_squares(v_haz_b[i], v_piece_type)) s where public.knight_reflect_sq(s, v_target) is not null);
  end loop;
  v_rounds := v_rounds || jsonb_build_object(
    'target', v_target, 'whiteStart', v_white_start, 'blackStart', v_black_start,
    'hazards', v_hazards, 'wIllegal', to_jsonb(v_w_illegal), 'bIllegal', to_jsonb(v_b_illegal),
    'moveBudget', array_length(v_white_path,1) - 1 + 2, 'timeLimitMs', v_time_ms, 'startedAt', now(),
    'positions', jsonb_build_object('w', null, 'b', null),
    'reports', jsonb_build_object('w', null, 'b', null), 'winner', null, 'resolvedAt', null
  );
  update public.pvp_games set sans = v_rounds, updated_at = now() where id = p_game_id returning * into v_game;
  return v_game;
end; $$;
grant execute on function public.knight_start_round(bigint) to authenticated;

create or replace function public.knight_resolve_round(p_game_id bigint)
returns public.pvp_games language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_game public.pvp_games; v_rounds jsonb; v_round jsonb; v_round_idx int;
  v_wrep jsonb; v_brep jsonb; v_grace constant int := 2000; v_winner text;
  v_w_reached boolean; v_b_reached boolean; v_w_dist int; v_b_dist int; v_w_remain int; v_b_remain int;
  v_w_time numeric; v_b_time numeric; v_w_wins int := 0; v_b_wins int := 0; r jsonb;
begin
  if v_me is null then raise exception 'auth required'; end if;
  select * into v_game from public.pvp_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_game.game_type <> 'knight' then raise exception 'wrong game type'; end if;
  if v_me <> v_game.white_uid and v_me <> v_game.black_uid then raise exception 'not a participant'; end if;
  if v_game.status <> 'active' then return v_game; end if;
  v_rounds := v_game.sans;
  if jsonb_array_length(v_rounds) = 0 then return v_game; end if;
  v_round_idx := jsonb_array_length(v_rounds) - 1;
  v_round := v_rounds -> v_round_idx;
  if (v_round ->> 'winner') is not null then return v_game; end if;
  v_wrep := v_round #> '{reports,w}'; if jsonb_typeof(v_wrep) = 'null' then v_wrep := null; end if;
  v_brep := v_round #> '{reports,b}'; if jsonb_typeof(v_brep) = 'null' then v_brep := null; end if;
  if not (v_wrep is not null and v_brep is not null)
     and (v_round ->> 'startedAt')::timestamptz + ((v_round->>'timeLimitMs')::int + v_grace || ' ms')::interval > now() then
    return v_game;
  end if;
  v_w_reached := coalesce((v_wrep ->> 'reached')::boolean, false);
  v_b_reached := coalesce((v_brep ->> 'reached')::boolean, false);
  if v_wrep is not null and v_brep is null then v_winner := 'w';
  elsif v_brep is not null and v_wrep is null then v_winner := 'b';
  elsif v_wrep is null and v_brep is null then v_winner := 'draw';
  elsif v_w_reached and not v_b_reached then v_winner := 'w';
  elsif v_b_reached and not v_w_reached then v_winner := 'b';
  elsif v_w_reached and v_b_reached then
    v_winner := case when (v_wrep->>'at')::timestamptz <= (v_brep->>'at')::timestamptz then 'w' else 'b' end;
  else
    v_w_dist := coalesce(public.knight_distance(v_wrep->>'finalSq', v_round->>'target', array(select jsonb_array_elements_text(v_round->'wIllegal'))), 99);
    v_b_dist := coalesce(public.knight_distance(v_brep->>'finalSq', v_round->>'target', array(select jsonb_array_elements_text(v_round->'bIllegal'))), 99);
    if v_w_dist <> v_b_dist then
      v_winner := case when v_w_dist < v_b_dist then 'w' else 'b' end;
    else
      v_w_remain := (v_round->>'moveBudget')::int - (v_wrep->>'movesUsed')::int;
      v_b_remain := (v_round->>'moveBudget')::int - (v_brep->>'movesUsed')::int;
      if v_w_remain <> v_b_remain then
        v_winner := case when v_w_remain > v_b_remain then 'w' else 'b' end;
      else
        v_w_time := (v_round->>'timeLimitMs')::int - extract(epoch from ((v_wrep->>'at')::timestamptz - (v_round->>'startedAt')::timestamptz)) * 1000;
        v_b_time := (v_round->>'timeLimitMs')::int - extract(epoch from ((v_brep->>'at')::timestamptz - (v_round->>'startedAt')::timestamptz)) * 1000;
        v_winner := case when v_w_time = v_b_time then 'draw' when v_w_time > v_b_time then 'w' else 'b' end;
      end if;
    end if;
  end if;
  v_round := jsonb_set(v_round, array['winner'], to_jsonb(v_winner));
  v_round := jsonb_set(v_round, array['resolvedAt'], to_jsonb(now()));
  v_rounds := jsonb_set(v_rounds, array[v_round_idx::text], v_round);
  for r in select * from jsonb_array_elements(v_rounds) loop
    if r ->> 'winner' = 'w' then v_w_wins := v_w_wins + 1; elsif r ->> 'winner' = 'b' then v_b_wins := v_b_wins + 1; end if;
  end loop;
  if v_w_wins >= 3 or v_b_wins >= 3 or jsonb_array_length(v_rounds) >= 5 then
    update public.pvp_games set sans = v_rounds,
      status = case when v_w_wins > v_b_wins then 'white_won' when v_b_wins > v_w_wins then 'black_won' else 'draw' end,
      result_reason = 'knight_score', updated_at = now()
    where id = p_game_id returning * into v_game;
  else
    update public.pvp_games set sans = v_rounds, updated_at = now() where id = p_game_id returning * into v_game;
  end if;
  return v_game;
end; $$;
grant execute on function public.knight_resolve_round(bigint) to authenticated;

-- SQL Editor에 이 파일 전체를 붙여넣고 RUN 하세요.
