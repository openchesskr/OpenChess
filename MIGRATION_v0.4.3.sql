-- ============================================================================
-- OpenChess v0.4.3 증분 마이그레이션
-- ============================================================================
-- 이미 v0.4.2까지의 supabase-setup.sql을 적용해 둔 프로젝트에, 이번 버전(v0.4.3)에서 바뀐/추가된
-- SQL만 모아 다시 실행할 수 있게 정리한 파일입니다. (물론 supabase-setup.sql 전체를 처음부터 다시
-- 실행해도 결과는 같습니다 — 모든 문장이 create or replace/if not exists라 안전합니다.)
--
-- 이번 버전에서 바뀐 것:
--   1) chat_messages.pvp_invite_id 컬럼 추가 — 친구 대국 신청을 채팅 메시지로도 남기기 위함.
--   2) pvp_queue_join()의 "재접속 시 이미 진행 중인 대국을 그대로 돌려준다" 로직이, 2분 넘게
--      방치된(좀비) 대국까지 무조건 즉시 돌려주던 문제 수정.
--   3) pvp_invite_friend()가 초대를 보낼 때 채팅 메시지도 함께 남기도록 확장.
--   4) delete_own_account() 신규 — 계정 센터의 "계정 탈퇴".
--   5) gen_mid() + profiles.mid 컬럼 신규 — 계정마다 고유한 9자리 영문 대문자+숫자 회원 번호(MID),
--      계정 센터에 표시.
--
-- SQL Editor에 이 파일 전체를 붙여넣고 RUN 하세요.
-- ============================================================================

-- 1) chat_messages — 실시간 대국 신청 카드용 컬럼
alter table public.chat_messages add column if not exists pvp_invite_id bigint;

-- 2) pvp_queue_join — 좀비 대국(2분 이상 응답 없는 active 대국)은 중단 처리 후 정상 매칭
drop function if exists public.pvp_queue_join() cascade;
drop function if exists public.pvp_queue_join(text) cascade;
create or replace function public.pvp_queue_join(p_time_control text default '600-0')
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
  delete from public.pvp_queue where uid = v_me;
  select uid into v_other from public.pvp_queue where uid <> v_me and time_control = p_time_control order by created_at asc limit 1 for update skip locked;
  if v_other is null then
    insert into public.pvp_queue(uid, time_control) values (v_me, p_time_control);
    return null;
  end if;
  delete from public.pvp_queue where uid = v_other;
  if random() < 0.5 then v_w := v_me; v_b := v_other; else v_w := v_other; v_b := v_me; end if;
  insert into public.pvp_games(white_uid, black_uid, time_control) values (v_w, v_b, p_time_control) returning * into v_game;
  return v_game;
end; $$;
grant execute on function public.pvp_queue_join(text) to authenticated;

-- 3) pvp_invite_friend — 초대를 보낼 때 채팅 메시지도 함께 남긴다
drop function if exists public.pvp_invite_friend(uuid, text) cascade;
create or replace function public.pvp_invite_friend(p_to_uid uuid, p_time_control text default '600-0')
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
  if found then return v_inv; end if;
  insert into public.pvp_invites(from_uid, to_uid, time_control) values (v_me, p_to_uid, p_time_control) returning * into v_inv;
  insert into public.chat_messages(from_uid, to_uid, body, pvp_invite_id) values (v_me, p_to_uid, '실시간 대국을 신청했어요.', v_inv.id);
  return v_inv;
end; $$;
grant execute on function public.pvp_invite_friend(uuid, text) to authenticated;

-- 4) delete_own_account — 계정 센터의 "계정 탈퇴". 본인 auth.users 행 삭제 → on delete cascade로
--    프로필·퍼즐·친구·채팅 등 연관 데이터가 함께 정리된다. 되돌릴 수 없다.
drop function if exists public.delete_own_account() cascade;
create or replace function public.delete_own_account()
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'auth required'; end if;
  delete from auth.users where id = v_me;
end; $$;
grant execute on function public.delete_own_account() to authenticated;

-- 5) gen_mid() + profiles.mid — 계정마다 고유한 9자리 영문 대문자+숫자 회원 번호(MID)
drop function if exists public.gen_mid() cascade;
create or replace function public.gen_mid()
returns text language plpgsql volatile set search_path = public as $$
declare v_chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; v_code text; v_exists boolean;
begin
  loop
    v_code := '';
    for i in 1..9 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    select exists(select 1 from public.profiles where mid = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end; $$;
alter table public.profiles add column if not exists mid text unique default public.gen_mid() check (mid ~ '^[A-Z0-9]{9}$');
update public.profiles set mid = public.gen_mid() where mid is null;
