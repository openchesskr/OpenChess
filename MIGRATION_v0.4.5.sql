-- ============================================================================
-- OpenChess v0.4.5 증분 마이그레이션
-- ============================================================================
-- 이미 v0.4.4까지의 supabase-setup.sql을 적용해 둔 프로젝트에, 이번 버전(v0.4.5)에서 바뀐 SQL만
-- 모아 다시 실행할 수 있게 정리한 파일입니다. (물론 supabase-setup.sql 전체를 처음부터 다시 실행해도
-- 결과는 같습니다 — 모든 문장이 create or replace/if not exists라 안전합니다.)
--
-- 이번 버전에서 바뀐 것:
--   1) pvp_queue_join(text) — "대국 상대 찾기"를 눌렀을 때, 내 참가자로 남아 있는 active 대국이
--      "최근"이면 새 매칭 대신 그 대국을 그대로 돌려주던(재접속 처리) 기준을 2분에서 10초로 줄였다.
--      체크메이트가 난 대국을 패자 쪽 클라이언트가 미처 보고하지 못하고 나가버리면(그 자체는
--      pvp_finish의 자기 승리 선언 금지 가드 때문에 승자 쪽이 대신 보고할 수 없다 — 서버가 sans를
--      직접 재생해 검증하지 않는 한 안전하게 허용할 방법이 없음, 보안 검토에서 지적됨) 그 pvp_games
--      행이 status='active'로 계속 남아, 승자가 다시 매칭을 시도할 때마다 최대 2분 동안 새 상대
--      대신 이미 끝난 그 대국의 결과 화면으로 되돌아가는 문제가 있었다. 이 창이 실제로 막아야 하는
--      건 "방금 새로고침해서 돌아온, 여전히 진행 중인 내 대국을 실수로 중단시키는 것"뿐이고 재접속은
--      보통 몇 초 안에 일어나므로, 10초로 줄여 좀비 대국이 다음 매칭을 막는 시간을 최소화한다.
--
-- SQL Editor에 이 파일 전체를 붙여넣고 RUN 하세요.
-- ============================================================================

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
    if v_game.updated_at > now() - interval '10 seconds' then return v_game; end if;
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
