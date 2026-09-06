-- ============================================================================
-- OpenChess v0.4.8 증분 마이그레이션
-- ============================================================================
-- 이미 v0.4.7까지의 supabase-setup.sql을 적용해 둔 프로젝트에, 이번 버전(v0.4.8)에서 바뀐/추가된
-- SQL만 모아 다시 실행할 수 있게 정리한 파일입니다. (물론 supabase-setup.sql 전체를 처음부터 다시
-- 실행해도 결과는 같습니다 — 모든 문장이 create or replace/if not exists라 안전합니다.)
--
-- 이번 버전에서 바뀐 것 (v0.5.0 예정인 보드 위 오리지널 미니게임 PvP를 대비한 선행 정리 — 아직
-- 미니게임 자체는 없고, 지금 유일한 게임 타입인 체스 실시간 대국의 동작은 전혀 바뀌지 않는다):
--   1) pvp_queue / pvp_games / pvp_invites에 game_type(text, 기본값 'chess') 신규 — 매칭·초대·대국이
--      모두 이 값을 들고 다니게 해서, 나중에 새 게임 타입이 추가돼도 서로 다른 타입끼리 잘못 매칭되는
--      일이 없게 한다. 지금은 모든 행이 'chess'뿐이라 실질적인 동작 변화는 없다.
--   2) pvp_queue_join / pvp_invite_friend에 p_game_type 인자 신규(기본값 'chess') — 매칭은 같은
--      time_control이면서 같은 game_type인 상대끼리만 짝짓는다. pvp_invite_respond·pvp_rematch_offer가
--      만드는 새 대국도 원래 대국/초대의 game_type을 그대로 물려받는다.
--   3) pvp_games.sans 컬럼은 이름과 달리 이제 "SAN 문자열만" 담는 컬럼이 아니라, game_type별로 해석
--      방식이 다를 수 있는 불투명한 수순 토큰 배열이라는 것을 주석으로 명시(컬럼 자체는 하위 호환을
--      위해 이름을 바꾸지 않는다 — 실제 운영 데이터가 있는 컬럼 rename은 위험도가 높고, 클라이언트
--      전역에서 이미 이 이름을 쓰고 있다).
-- ============================================================================

alter table public.pvp_queue add column if not exists game_type text not null default 'chess';
alter table public.pvp_games add column if not exists game_type text not null default 'chess';
alter table public.pvp_invites add column if not exists game_type text not null default 'chess';

comment on column public.pvp_games.sans is
  '수순 토큰 배열 — game_type이 ''chess''일 때만 SAN 문자열이다. 다른 game_type이 추가되면 그 타입
   전용 인코딩을 담는 불투명한 배열로 취급할 것(하위 호환을 위해 컬럼명은 그대로 둔다).';

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
    if v_game.updated_at > now() - interval '2 minutes' then return v_game; end if;
    update public.pvp_games set status = 'aborted', updated_at = now() where id = v_game.id;
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
  insert into public.pvp_games(white_uid, black_uid, time_control, game_type) values (v_w, v_b, p_time_control, p_game_type) returning * into v_game;
  return v_game;
end; $$;
grant execute on function public.pvp_queue_join(text, text) to authenticated;

drop function if exists public.pvp_invite_friend(uuid, text) cascade;
create or replace function public.pvp_invite_friend(p_to_uid uuid, p_time_control text default '600-0', p_game_type text default 'chess')
returns public.pvp_invites language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_are_friends boolean; v_inv public.pvp_invites;
begin
  if v_me is null then raise exception 'auth required'; end if;
  if v_me = p_to_uid then raise exception 'cannot invite self'; end if;
  select exists (
    select 1 from public.friend_edges
    where status = 'accepted' and ((from_uid = v_me and to_uid = p_to_uid) or (from_uid = p_to_uid and to_uid = v_me))
  ) into v_are_friends;
  if not v_are_friends then raise exception 'not friends'; end if;
  select * into v_inv from public.pvp_invites where from_uid = v_me and to_uid = p_to_uid and status = 'pending' order by created_at desc limit 1;
  if found then
    update public.pvp_invites set time_control = p_time_control, game_type = p_game_type, updated_at = now() where id = v_inv.id returning * into v_inv;
  else
    insert into public.pvp_invites(from_uid, to_uid, time_control, game_type) values (v_me, p_to_uid, p_time_control, p_game_type) returning * into v_inv;
  end if;
  insert into public.chat_messages(from_uid, to_uid, body, pvp_invite_id) values (v_me, p_to_uid, '실시간 대국을 신청했어요.', v_inv.id);
  return v_inv;
end; $$;
grant execute on function public.pvp_invite_friend(uuid, text, text) to authenticated;

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
  insert into public.pvp_games(white_uid, black_uid, time_control, game_type) values (v_w, v_b, v_inv.time_control, v_inv.game_type) returning * into v_game;
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
  insert into public.pvp_games(white_uid, black_uid, time_control, game_type) values (v_w, v_b, v_game.time_control, v_game.game_type) returning * into v_new;
  update public.pvp_games set rematch_offered_by = null, rematch_game_id = v_new.id, updated_at = now() where id = p_game_id;
  return v_new;
end; $$;
grant execute on function public.pvp_rematch_offer(bigint) to authenticated;

-- SQL Editor에 이 파일 전체를 붙여넣고 RUN 하세요.
