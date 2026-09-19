-- ============================================================================
-- OpenChess v0.5.2 증분 마이그레이션
-- ============================================================================
-- 이미 v0.5.1까지의 supabase-setup.sql을 적용해 둔 프로젝트에, 이번 버전(v0.5.2)에서 바뀐 SQL만
-- 모아 다시 실행할 수 있게 정리한 파일입니다. (supabase-setup.sql 전체를 처음부터 다시 실행해도
-- 결과는 같습니다 — 모든 문장이 create or replace/if not exists라 안전합니다.)
--
-- 바뀐 것 — 개발자/공동개발자의 퍼즐 생성자 "회수" 기능이 조용히 실패하던 문제:
--   puzzle_reassign_creator는 대상 아이디로 양도할 때는 그 유저를 못 찾으면 user_not_found로
--   막았지만, 대상 없이 개발자 계정으로 "회수"할 때는 개발자 계정('openchesskr') 프로필을 못 찾는
--   경우를 전혀 검사하지 않았다 — 그러면 v_uid가 null인 채로 update가 그대로 실행돼 creator_uid를
--   null로 지워버리면서도 예외 없이(=클라이언트에는 "성공"으로) 끝났다. 이제 이 경우도 명확히
--   dev_account_missing 예외를 던진다.
create or replace function public.puzzle_reassign_creator(p_no bigint, p_target_username text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_uname text; v_exists boolean;
begin
  if not public.is_content_editor(auth.uid()) then raise exception 'not_authorized'; end if;
  select true into v_exists from public.puzzles where no = p_no for update;
  if not v_exists then raise exception 'puzzle_not_found'; end if;
  if p_target_username is null or btrim(p_target_username) = '' then
    select id, username into v_uid, v_uname from public.profiles where username = 'openchesskr';
    if v_uid is null then raise exception 'dev_account_missing'; end if;
  else
    select id, username into v_uid, v_uname from public.profiles where username = lower(btrim(p_target_username));
    if v_uid is null then raise exception 'user_not_found'; end if;
  end if;
  update public.puzzles set creator_uid = v_uid, creator_username = v_uname, creator_edited_at = null where no = p_no;
end; $$;
grant execute on function public.puzzle_reassign_creator(bigint, text) to authenticated;
