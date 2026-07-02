-- ===== OpenChess Supabase 설정 =====
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 RUN 하세요.

-- 1) 계정 테이블 (직접 접근 차단, RPC로만 접근)
create table if not exists public.accounts (
  id text primary key,
  pw_hash text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
alter table public.accounts enable row level security;
-- 정책을 만들지 않음 → anon 키로는 이 테이블을 직접 읽거나 쓸 수 없음.
-- 아래 SECURITY DEFINER 함수를 통해서만 접근(비밀번호 해시는 절대 클라이언트로 반환 안 됨).

-- 2) 공유 콘텐츠 테이블 (개발자/공동개발자가 넣은 트리·분기·해설·키워드, 모든 방문자 공유)
create table if not exists public.app_content (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.app_content enable row level security;
create policy "content read"   on public.app_content for select using (true);
create policy "content insert" on public.app_content for insert with check (true);
create policy "content update" on public.app_content for update using (true) with check (true);

-- 3) 회원가입
create or replace function public.app_signup(p_id text, p_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from accounts where id = p_id) then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end if;
  insert into accounts(id, pw_hash, data) values (p_id, p_hash, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'data',
    jsonb_build_object('id', p_id, 'progress', '{}'::jsonb, 'chesscom', ''));
end; $$;

-- 4) 로그인 (해시 일치 시에만 data 반환, pw_hash 는 반환하지 않음)
create or replace function public.app_login(p_id text, p_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r accounts;
begin
  select * into r from accounts where id = p_id;
  if not found or r.pw_hash <> p_hash then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'id', r.id,
    'progress', coalesce(r.data->'progress', '{}'::jsonb),
    'chesscom', coalesce(r.data->>'chesscom', '')
  ));
end; $$;

-- 5) 진도/연동 저장 (비밀번호 해시가 일치해야만 저장)
create or replace function public.app_save(p_id text, p_hash text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update accounts set data = p_data where id = p_id and pw_hash = p_hash;
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true);
end; $$;

-- 6) anon 키에 RPC 실행 권한 부여
grant execute on function public.app_signup(text, text)        to anon, authenticated;
grant execute on function public.app_login(text, text)         to anon, authenticated;
grant execute on function public.app_save(text, text, jsonb)   to anon, authenticated;

-- ===== 16차 수정: 퍼즐 카드의 "친구가 풀었어요" 표기 + 추천 퍼즐(일간/주간/월간) 랭킹 =====
-- 이미 puzzles(no, data, solves), friend_edges(from_uid, to_uid, status), profiles(id, username, pub) 테이블이
-- (이전 차수에서) 만들어져 있다는 전제 하에 아래를 추가로 실행하세요.

-- 7) 퍼즐별 해결자 uid 기록 — 퍼즐 카드에 "친구 OO, OO 외 N명이 풀었습니다!" 표기용(중복 없이 1인 1행)
create table if not exists public.puzzle_solvers (
  no bigint not null,
  uid uuid not null,
  solved_at timestamptz not null default now(),
  primary key (no, uid)
);
alter table public.puzzle_solvers enable row level security;
create policy "solvers read"   on public.puzzle_solvers for select using (true);
create policy "solvers upsert" on public.puzzle_solvers for insert with check (true);
create policy "solvers update" on public.puzzle_solvers for update using (true) with check (true);

-- 8) 퍼즐 해결 "이벤트" 로그 — 추천 랭킹 집계용(같은 사람이 같은 퍼즐을 여러 번 풀어도 매번 한 줄씩 쌓임)
create table if not exists public.puzzle_solve_events (
  id bigint generated always as identity primary key,
  no bigint not null,
  uid uuid,
  solved_at timestamptz not null default now()
);
create index if not exists idx_puzzle_solve_events_no_time on public.puzzle_solve_events(no, solved_at);
alter table public.puzzle_solve_events enable row level security;
create policy "solve events read"   on public.puzzle_solve_events for select using (true);
create policy "solve events insert" on public.puzzle_solve_events for insert with check (true);

-- 9) 기간별(day/week/month) 인기 퍼즐 랭킹 RPC — 상위 N개를 풀이수 내림차순으로 반환
create or replace function public.puzzle_rank(p_period text, p_limit int default 12)
returns table(no bigint, cnt bigint) language sql stable as $$
  select no, count(*) as cnt
  from public.puzzle_solve_events
  where solved_at >= now() - (case p_period
    when 'day' then interval '1 day'
    when 'week' then interval '7 days'
    when 'month' then interval '30 days'
    else interval '1 day'
  end)
  group by no
  order by cnt desc
  limit p_limit;
$$;

grant select, insert, update on public.puzzle_solvers        to anon, authenticated;
grant select, insert         on public.puzzle_solve_events   to anon, authenticated;

-- ===== 17차 수정: 친구 채팅(+이모티콘), 알림 =====
-- (기존 profiles/friend_edges 테이블이 이미 있다는 전제 하에 아래를 추가로 실행하세요.)

-- 10) 친구 채팅 메시지
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  from_uid uuid not null,
  to_uid uuid not null,
  body text,
  emoji text,               -- 이모티콘 코드(예: "milku_3") — body 대신 또는 함께 쓸 수 있음
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_chat_messages_pair on public.chat_messages(from_uid, to_uid, created_at);
alter table public.chat_messages enable row level security;
-- 로그인 토큰(auth.uid())을 anon 키 대신 Authorization 헤더로 실어 보내므로 auth.uid() 기준 정책이 유효함.
create policy "chat select own"  on public.chat_messages for select using (auth.uid() = from_uid or auth.uid() = to_uid);
create policy "chat insert own"  on public.chat_messages for insert with check (auth.uid() = from_uid);
create policy "chat update own"  on public.chat_messages for update using (auth.uid() = to_uid) with check (auth.uid() = to_uid);
grant select, insert, update on public.chat_messages to authenticated;

-- 11) 알림(받은/보낸 친구 요청 결과, 칭호 획득, 레벨 업 등)
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  to_uid uuid not null,
  kind text not null,        -- 'friend_request' | 'friend_accepted' | 'title_earned' | 'level_up'
  payload jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_to_time on public.notifications(to_uid, created_at desc);
alter table public.notifications enable row level security;
create policy "notif select own" on public.notifications for select using (auth.uid() = to_uid);
-- insert는 다른 유저에게 알림을 보내야 하는 경우(친구 요청 등)가 있어 to_uid 제한 없이, 로그인만 요구한다.
create policy "notif insert auth" on public.notifications for insert with check (auth.uid() is not null);
create policy "notif update own" on public.notifications for update using (auth.uid() = to_uid) with check (auth.uid() = to_uid);
grant select, insert, update on public.notifications to authenticated;
grant execute on function public.puzzle_rank(text, int)       to anon, authenticated;
