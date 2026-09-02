-- ============================================================================
-- OpenChess v0.4.4 증분 마이그레이션
-- ============================================================================
-- 이미 v0.4.3까지의 supabase-setup.sql을 적용해 둔 프로젝트에, 이번 버전(v0.4.4)에서 바뀐/추가된
-- SQL만 모아 다시 실행할 수 있게 정리한 파일입니다. (물론 supabase-setup.sql 전체를 처음부터 다시
-- 실행해도 결과는 같습니다 — 모든 문장이 create or replace/if not exists라 안전합니다.)
--
-- 이번 버전에서 바뀐 것:
--   1) pvp_invite_friend() — 이미 pending 초대가 있을 때 아무것도 하지 않고 그대로 돌려주던 것을,
--      time_control·updated_at을 갱신하고 채팅에도 매번 새 카드를 남기도록 수정. 채팅 "/play n"
--      명령어가 재요청 시 아무 반응이 없어 보이던(=명령어가 안 되는 것처럼 보이던) 핵심 원인.
--   2) gen_mid() + profiles.mid 형식 변경 — "9자 아무 자리에나 영문/숫자가 섞인 9자리"에서
--      "앞 영문 대문자 5자리 + 뒤 숫자 4자리"로 고정(예: ABCDE1234). 기존에 옛 형식으로 발급된
--      MID는 새 형식으로 다시 발급된다.
--
-- SQL Editor에 이 파일 전체를 붙여넣고 RUN 하세요.
-- ============================================================================

-- 1) pvp_invite_friend — 이미 보낸 pending 초대가 있어도 time_control을 갱신하고 채팅에 매번
--    새 카드를 남긴다(받는 쪽 배너는 이 테이블을 event:"*"로 구독하므로 update만으로도 다시 뜬다).
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
  if found then
    update public.pvp_invites set time_control = p_time_control, updated_at = now() where id = v_inv.id returning * into v_inv;
  else
    insert into public.pvp_invites(from_uid, to_uid, time_control) values (v_me, p_to_uid, p_time_control) returning * into v_inv;
  end if;
  insert into public.chat_messages(from_uid, to_uid, body, pvp_invite_id) values (v_me, p_to_uid, '실시간 대국을 신청했어요.', v_inv.id);
  return v_inv;
end; $$;
grant execute on function public.pvp_invite_friend(uuid, text) to authenticated;

-- 2) gen_mid() + profiles.mid — 형식을 "앞 영문 대문자 5자리 + 뒤 숫자 4자리"로 고정
drop function if exists public.gen_mid() cascade;
create or replace function public.gen_mid()
returns text language plpgsql volatile set search_path = public as $$
declare v_letters text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; v_digits text := '0123456789'; v_code text; v_exists boolean;
begin
  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(v_letters, 1 + floor(random() * length(v_letters))::int, 1);
    end loop;
    for i in 1..4 loop
      v_code := v_code || substr(v_digits, 1 + floor(random() * length(v_digits))::int, 1);
    end loop;
    select exists(select 1 from public.profiles where mid = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end; $$;
alter table public.profiles drop constraint if exists profiles_mid_check;
alter table public.profiles add column if not exists mid text unique default public.gen_mid();
update public.profiles set mid = public.gen_mid() where mid is null or mid !~ '^[A-Z]{5}[0-9]{4}$';
alter table public.profiles add constraint profiles_mid_check check (mid ~ '^[A-Z]{5}[0-9]{4}$');
