-- ============================================================================
-- OpenChess — 퍼즐 데이터 전체 초기화 (v0.2.7)
-- ============================================================================
-- 오늘의 퍼즐 개편(폐기된 큐레이션 폴백 삭제, 이름 형식 통일)에 맞춰, 기존에 쌓인 모든 퍼즐
-- 데이터와 유저별 "푼 퍼즐" 기록을 깨끗하게 지우기 위한 일회성 스크립트입니다.
-- Supabase 대시보드 SQL Editor에 이 파일 전체를 붙여넣고 RUN 하세요.
--
-- 되돌릴 수 없습니다 — 실행 전 필요하다면 반드시 백업하세요.
--
-- 지우는 것:
--   1) 전역(모든 유저 공유) 퍼즐 데이터 — public.puzzles와 거기 딸린 좋아요/재게시/해결자/해결
--      이벤트 테이블 전부(테이블 구조·RLS 정책·함수는 그대로 두고 행만 비웁니다).
--   2) 유저별 "푼 퍼즐" 기록 — public.user_progress.progress(jsonb) 안의 solved(푼 퍼즐 id
--      목록)·lineSolves(퍼즐별 풀어낸 라인 태그) 두 필드만 초기화합니다.
--
-- 건드리지 않는 것: XP·코인·칭호·보드/기물 스킨·퀘스트 진행도·chat_messages(채팅 기록, 퍼즐
-- 공유 카드 포함)·친구 관계·프로필 등 — 퍼즐 풀이 기록과 무관한 나머지 진행 상황은 그대로
-- 남습니다. 채팅에 남아 있는 옛 퍼즐 공유 카드는 puzzles 테이블이 비워지면 그 카드를 다시
-- 열었을 때 "퍼즐을 찾을 수 없다"로 보일 수 있습니다(카드 자체는 채팅 기록이라 지우지 않음).
--
-- 순서: 자식 테이블(퍼즐 번호를 참조만 할 뿐 외래키 제약은 없음)부터 비우고 마지막에 puzzles를
-- 비웁니다. 실제 FK 제약은 없어 순서가 실패에 영향을 주진 않지만, 읽기 쉽게 논리적 순서를 지킵니다.
-- ============================================================================

truncate table public.puzzle_likes;
truncate table public.puzzle_reposts;
truncate table public.puzzle_solvers;
truncate table public.puzzle_solve_events;
truncate table public.puzzles;

-- 유저별 "푼 퍼즐" 기록만 초기화(그 외 진행 상황은 그대로 유지).
update public.user_progress
set progress = progress || jsonb_build_object('solved', '[]'::jsonb, 'lineSolves', '{}'::jsonb);
