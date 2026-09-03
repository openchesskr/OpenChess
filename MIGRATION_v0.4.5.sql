-- ============================================================================
-- OpenChess v0.4.5 증분 마이그레이션
-- ============================================================================
-- 이미 v0.4.4까지의 supabase-setup.sql을 적용해 둔 프로젝트에, 이번 버전(v0.4.5)에서 바뀐 SQL만
-- 모아 다시 실행할 수 있게 정리한 파일입니다. (물론 supabase-setup.sql 전체를 처음부터 다시 실행해도
-- 결과는 같습니다 — 모든 문장이 create or replace/if not exists라 안전합니다.)
--
-- 이번 버전에서 바뀐 것:
--   1) pvp_finish(bigint, text, boolean) — 체크메이트를 당한 쪽의 클라이언트가 결과 화면을 보자마자
--      탭을 닫는 등으로 그 보고가 끝내 한 번도 성공하지 못하면, "자기 승리 선언 금지" 가드 때문에
--      이긴 쪽도 그 대국을 끝낼 수 없었다 — 그 pvp_games 행이 checkmate가 실제로 일어난 뒤에도
--      status='active'로 계속 남아, 이긴 쪽이 "대국 상대 찾기"를 다시 누르면 새 매칭 대신 이미 끝난
--      그 대국으로 되돌아가(재접속 처리) 곧장 결과 화면(패배 쪽 입장에선 "즉시 패배")을 다시 보게
--      됐다. 체크메이트·스테일메이트·3회 동형 반복은 서버가 이미 전적으로 신뢰하는 sans만으로 양쪽이
--      항상 동일하게 계산해내는 객관적 결과이므로, 이를 보고할 때만 p_objective=true를 넘겨 자기
--      승리 선언 금지를 건너뛴다(기권·시간초과 보고는 여전히 false — 협상 대상이라 그대로 막는다).
--
-- SQL Editor에 이 파일 전체를 붙여넣고 RUN 하세요.
-- ============================================================================

drop function if exists public.pvp_finish(bigint, text) cascade;
create or replace function public.pvp_finish(p_game_id bigint, p_status text, p_objective boolean default false)
returns public.pvp_games language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_game public.pvp_games; v_my_win_status text;
begin
  if v_me is null then raise exception 'auth required'; end if;
  if p_status not in ('white_won','black_won','draw','aborted') then raise exception 'invalid status'; end if;
  select * into v_game from public.pvp_games where id = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  if v_me <> v_game.white_uid and v_me <> v_game.black_uid then raise exception 'not a participant'; end if;
  v_my_win_status := case when v_me = v_game.white_uid then 'white_won' else 'black_won' end;
  if p_status = v_my_win_status and not p_objective then raise exception 'cannot self-declare victory'; end if;
  if v_game.status <> 'active' then return v_game; end if;
  update public.pvp_games set status = p_status, updated_at = now() where id = p_game_id returning * into v_game;
  return v_game;
end; $$;
grant execute on function public.pvp_finish(bigint, text, boolean) to authenticated;
