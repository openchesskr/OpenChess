-- ============================================================================
-- OpenChess Supabase 설정 — 통합본 (20차)
-- ============================================================================
-- 이전에 여러 차수(16차/17차/18차/20차)에 걸쳐 나뉘어 있던 SQL을 이 한 파일로 합쳤습니다.
-- 새 Supabase 프로젝트에 처음부터 적용하거나, 기존 테이블·함수를 모두 지우고 다시 만들 때
-- 이 파일 하나만 SQL Editor에 붙여넣고 RUN 하면 됩니다(위에서 아래로 순서대로 실행됨).
--
-- 전제: src/App.jsx는 회원가입·로그인에 Supabase Auth(GoTrue)를 직접 사용합니다
-- (이메일/비밀번호는 /auth/v1/signup·/auth/v1/token, Google은 /auth/v1/authorize).
-- 비밀번호는 Supabase가 서버에서 안전하게 처리하므로 이 파일에는 별도의 계정/비밀번호 테이블이
-- 없습니다(과거 SHA-256 자체 해시 방식은 폐기).
--
-- 적용 후 Supabase 대시보드에서 한 가지 설정을 확인하세요:
--   Authentication → Providers → Email → "Confirm email"
--   켜두면(권장) 가입 후 메일 인증이 끝나야 로그인되고, 꺼두면 가입 즉시 로그인됩니다.
--   두 경우 모두 src/App.jsx 코드가 이미 처리합니다(authSignup의 confirm_required 분기).
--
-- (선택) 기존 프로젝트를 완전히 초기화하고 싶다면 아래 주석을 해제해 먼저 실행하세요.
-- 되돌릴 수 없으니 실행 전 필요한 데이터는 반드시 백업하세요.
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop table if exists public.chat_messages, public.notifications, public.friend_edges,
--   public.puzzle_solve_events, public.puzzle_solvers, public.puzzle_likes, public.puzzles,
--   public.app_content, public.user_progress, public.profiles, public.accounts cascade;
-- drop function if exists public.handle_new_user(), public.is_content_editor(uuid),
--   public.username_available(text), public.email_for_username(text), public.account_providers(text),
--   public.claim_username(text), public.friend_request(text), public.friend_accept(uuid),
--   public.friend_remove(uuid), public.puzzle_solve(bigint), public.puzzle_rank(text, int),
--   public.puzzle_like_toggle(bigint, uuid),
--   public.app_signup(text, text), public.app_login(text, text), public.app_save(text, text, jsonb) cascade;

-- ============================================================================
-- 1) profiles — 계정의 공개 프로필(닉네임/사진/칭호/chess.com 연동 등은 pub jsonb에 저장)
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9]{3,20}$'),
  pub jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_profiles_username on public.profiles (username);
alter table public.profiles enable row level security;
drop policy if exists "profiles select all" on public.profiles;
drop policy if exists "profiles insert self" on public.profiles;
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles select all"  on public.profiles for select using (true);
create policy "profiles insert self" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update self" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

-- 이메일/비밀번호로 가입할 때(user_metadata.username 포함) auth.users insert와 같은 트랜잭션에서
-- profiles 행을 원자적으로 생성 — username이 이미 있으면(UNIQUE 위반) 가입 전체가 롤백됨(레이스 방지).
-- Google OAuth 가입은 이 시점에 username이 없으므로 건너뛰고, 이후 claim_username()으로 확정한다.
-- 이미 다른 시그니처/반환형으로 만들어져 있을 수 있으므로(예: 이전에 대시보드에서 직접 만든 경우),
-- create or replace 가 "cannot change return type" 오류를 내지 않도록 먼저 지우고 새로 만든다.
drop function if exists public.handle_new_user() cascade;
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uname text := lower(coalesce(new.raw_user_meta_data->>'username', ''));
begin
  if v_uname <> '' then
    insert into public.profiles(id, username, pub) values (new.id, v_uname, '{}'::jsonb);
  end if;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 가입 폼에서 아이디 중복을 실시간으로 확인(로그인 전이라 anon 필요)
drop function if exists public.username_available(text) cascade;
create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where username = lower(p_username));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- 아이디로 로그인 시 GoTrue token 엔드포인트에 넘길 이메일을 찾기 위한 조회(로그인 전이라 anon 필요)
drop function if exists public.email_for_username(text) cascade;
create or replace function public.email_for_username(p_username text)
returns text language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  select u.email into v_email from public.profiles p join auth.users u on u.id = p.id
  where p.username = lower(p_username);
  return v_email;
end; $$;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- 이메일이 어떤 방식(email/google)으로 가입돼 있는지 — 같은 메일로 다른 방식 재가입 시 안내용
drop function if exists public.account_providers(text) cascade;
create or replace function public.account_providers(p_email text)
returns text[] language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_providers text[];
begin
  select id into v_uid from auth.users where lower(email) = lower(p_email);
  if v_uid is null then return array[]::text[]; end if;
  select array_agg(distinct provider) into v_providers from auth.identities where user_id = v_uid;
  return coalesce(v_providers, array[]::text[]);
end; $$;
grant execute on function public.account_providers(text) to anon, authenticated;

-- Google 최초 로그인 후 아이디를 확정해 profiles 행을 만든다(로그인된 상태 = authenticated).
drop function if exists public.claim_username(text) cascade;
create or replace function public.claim_username(p_username text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_uname text := lower(p_username);
begin
  if v_uid is null then return 'invalid'; end if;
  if v_uname !~ '^[a-z0-9]{3,20}$' then return 'invalid'; end if;
  if exists (select 1 from public.profiles where id = v_uid) then return 'already'; end if;
  insert into public.profiles(id, username, pub) values (v_uid, v_uname, '{}'::jsonb);
  return 'ok';
exception when unique_violation then
  return 'taken';
end; $$;
grant execute on function public.claim_username(text) to authenticated;

-- ============================================================================
-- 2) user_progress — 퍼즐 진도/코인/칭호 등 계정별 진행 상황(비공개, 본인만 접근)
-- ============================================================================
create table if not exists public.user_progress (
  id uuid primary key references auth.users(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_progress enable row level security;
drop policy if exists "progress select own" on public.user_progress;
drop policy if exists "progress upsert own" on public.user_progress;
drop policy if exists "progress update own" on public.user_progress;
create policy "progress select own" on public.user_progress for select using (auth.uid() = id);
create policy "progress upsert own" on public.user_progress for insert with check (auth.uid() = id);
create policy "progress update own" on public.user_progress for update using (auth.uid() = id) with check (auth.uid() = id);
grant select, insert, update on public.user_progress to authenticated;

-- ============================================================================
-- 3) app_content — 개발자/공동개발자가 만든 공유 콘텐츠(오프닝 트리·해설·키워드 등, 모든 방문자 공유)
-- ============================================================================
create table if not exists public.app_content (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_content enable row level security;

-- 개발자 계정(DEV_ACCOUNT, src/App.jsx와 동일한 값으로 유지) 또는 현재 콘텐츠의
-- value.codev 배열에 포함된 공동개발자만 쓰기를 허용 — 편집 UI가 아니라 서버(RLS)가 강제한다.
-- anon 키만으로는(REST를 직접 호출해도) 읽기만 가능하고 쓰기는 불가능하다.
drop function if exists public.is_content_editor(uuid) cascade;
create or replace function public.is_content_editor(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles pr
    where pr.id = p_uid
    and (
      pr.username = 'openchesskr'
      or pr.username in (
        select jsonb_array_elements_text(
          coalesce((select value from public.app_content where key = 'global') -> 'codev', '[]'::jsonb)
        )
      )
    )
  );
$$;
grant execute on function public.is_content_editor(uuid) to anon, authenticated;

drop policy if exists "content read"   on public.app_content;
drop policy if exists "content insert" on public.app_content;
drop policy if exists "content update" on public.app_content;
create policy "content read"                    on public.app_content for select using (true);
create policy "content insert (dev/codev only)" on public.app_content for insert with check (public.is_content_editor(auth.uid()));
create policy "content update (dev/codev only)" on public.app_content for update using (true) with check (public.is_content_editor(auth.uid()));
grant select on public.app_content to anon, authenticated;
grant insert, update on public.app_content to authenticated;

-- ============================================================================
-- 4) friend_edges — 친구 요청/수락 상태(from_uid → to_uid, status: pending|accepted)
-- ============================================================================
create table if not exists public.friend_edges (
  from_uid uuid not null references auth.users(id) on delete cascade,
  to_uid   uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (from_uid, to_uid)
);
alter table public.friend_edges enable row level security;
drop policy if exists "friend edges select own" on public.friend_edges;
create policy "friend edges select own" on public.friend_edges for select using (auth.uid() = from_uid or auth.uid() = to_uid);
grant select on public.friend_edges to authenticated;
-- insert/update/delete는 아래 RPC로만 가능(SECURITY DEFINER) — 테이블 직접 쓰기 권한은 부여하지 않는다.

-- 요청 상대가 이미 나에게 보낸 요청이 있으면 자동으로 서로 수락(맞요청) 처리한다.
drop function if exists public.friend_request(text) cascade;
create or replace function public.friend_request(p_to_username text)
returns text language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_to uuid; v_existing text;
begin
  if v_me is null then return 'unauth'; end if;
  select id into v_to from public.profiles where username = lower(p_to_username);
  if v_to is null then return 'notfound'; end if;
  if v_to = v_me then return 'self'; end if;

  select status into v_existing from public.friend_edges where from_uid = v_me and to_uid = v_to;
  if v_existing is not null then return 'exists'; end if;

  select status into v_existing from public.friend_edges where from_uid = v_to and to_uid = v_me;
  if v_existing = 'accepted' then return 'exists'; end if;
  if v_existing = 'pending' then
    update public.friend_edges set status = 'accepted' where from_uid = v_to and to_uid = v_me;
    return 'accepted';
  end if;

  insert into public.friend_edges(from_uid, to_uid, status) values (v_me, v_to, 'pending');
  return 'pending';
end; $$;
grant execute on function public.friend_request(text) to authenticated;

drop function if exists public.friend_accept(uuid) cascade;
create or replace function public.friend_accept(p_other_uid uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.friend_edges set status = 'accepted'
  where from_uid = p_other_uid and to_uid = auth.uid() and status = 'pending';
  return found;
end; $$;
grant execute on function public.friend_accept(uuid) to authenticated;

drop function if exists public.friend_remove(uuid) cascade;
create or replace function public.friend_remove(p_other_uid uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from public.friend_edges
  where (from_uid = auth.uid() and to_uid = p_other_uid) or (from_uid = p_other_uid and to_uid = auth.uid());
  return found;
end; $$;
grant execute on function public.friend_remove(uuid) to authenticated;

-- ============================================================================
-- 5) chat_messages — 친구 간 채팅(텍스트/이모티콘)
-- ============================================================================
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  from_uid uuid not null references auth.users(id) on delete cascade,
  to_uid uuid not null references auth.users(id) on delete cascade,
  body text,
  emoji text,               -- 이모티콘 코드(예: "milku_3") — body 대신 또는 함께 쓸 수 있음
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_chat_messages_pair on public.chat_messages(from_uid, to_uid, created_at);
alter table public.chat_messages enable row level security;
drop policy if exists "chat select own" on public.chat_messages;
drop policy if exists "chat insert own" on public.chat_messages;
drop policy if exists "chat update own" on public.chat_messages;
create policy "chat select own" on public.chat_messages for select using (auth.uid() = from_uid or auth.uid() = to_uid);
-- (v0.0.5 보안) 예전에는 from_uid만 검증해, 친구 목록에 없는 임의 uid를 REST로 직접 지정해도
-- DM을 보낼 수 있었다(UI는 친구에게만 채팅 버튼을 보여줬을 뿐 서버가 강제하지 않았음). 서로
-- accepted 상태인 friend_edges가 있을 때만 메시지를 만들 수 있도록 서버에서도 강제한다.
create policy "chat insert own" on public.chat_messages for insert with check (
  auth.uid() = from_uid
  and exists (
    select 1 from public.friend_edges fe
    where fe.status = 'accepted'
      and ((fe.from_uid = auth.uid() and fe.to_uid = chat_messages.to_uid) or (fe.to_uid = auth.uid() and fe.from_uid = chat_messages.to_uid))
  )
);
create policy "chat update own" on public.chat_messages for update using (auth.uid() = to_uid) with check (auth.uid() = to_uid);
grant select, insert, update on public.chat_messages to authenticated;

-- ============================================================================
-- 6) notifications — 친구 요청/수락, 칭호 획득, 레벨 업 등 알림
-- ============================================================================
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  to_uid uuid not null references auth.users(id) on delete cascade,
  kind text not null,        -- 'friend_request' | 'friend_accepted' | 'title_earned' | 'level_up'
  payload jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_to_time on public.notifications(to_uid, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "notif select own" on public.notifications;
drop policy if exists "notif insert auth" on public.notifications;
drop policy if exists "notif update own" on public.notifications;
create policy "notif select own" on public.notifications for select using (auth.uid() = to_uid);
-- (v0.0.5 보안) 예전에는 로그인만 하면 누구에게든(to_uid 제한 없이) 어떤 kind든 알림을 만들 수 있어,
-- 임의 유저에게 위조된 title_earned/level_up/friend_accepted 알림을 보낼 수 있었다. src/App.jsx의
-- notifyCreate 호출 패턴(title_earned·level_up은 항상 본인에게, friend_request/friend_accepted는
-- 실제 friend_edges 관계가 막 생긴 직후에만 상대에게)만 허용하도록 좁힌다.
create policy "notif insert auth" on public.notifications for insert with check (
  auth.uid() is not null
  and kind in ('friend_request', 'friend_accepted', 'title_earned', 'level_up')
  and (
    (kind in ('title_earned', 'level_up') and to_uid = auth.uid())
    or (kind = 'friend_request' and exists (
      select 1 from public.friend_edges fe where fe.from_uid = auth.uid() and fe.to_uid = notifications.to_uid
    ))
    or (kind = 'friend_accepted' and exists (
      select 1 from public.friend_edges fe where fe.status = 'accepted'
        and ((fe.from_uid = auth.uid() and fe.to_uid = notifications.to_uid) or (fe.to_uid = auth.uid() and fe.from_uid = notifications.to_uid))
    ))
  )
);
create policy "notif update own" on public.notifications for update using (auth.uid() = to_uid) with check (auth.uid() = to_uid);
grant select, insert, update on public.notifications to authenticated;

-- ============================================================================
-- 7) puzzles / puzzle_solvers / puzzle_solve_events — 퍼즐 데이터 공유, 해결자 기록, 인기 랭킹
-- ============================================================================
-- 퍼즐 데이터(no = 6자리 해시 번호, data = 퍼즐 전체 JSON). 같은 실수는 항상 같은 no로 귀결되므로
-- 누구나 자신이 만난 퍼즐을 공유하는 크라우드소싱 방식이다(의도된 설계). 더 엄격하게 잠그고 싶다면
-- app_content처럼 is_content_editor 류의 검증을 추가하되, 그러면 첫 발견자 외에는 공유가 막히므로
-- 신중히 판단하세요.
create table if not exists public.puzzles (
  no bigint primary key,
  data jsonb not null default '{}'::jsonb,
  solves bigint not null default 0,
  created_at timestamptz not null default now()
);
-- (v0.0.5 보안) 아래 "puzzles insert" 정책이 likes 컬럼을 참조하므로, 원래 더 아래(퍼즐 좋아요 절)에
-- 있던 이 컬럼 추가를 여기로 옮겨 정책 생성 시점에 이미 존재하도록 한다(기존 DB는 이미 컬럼이 있어
-- if not exists로 무해하게 스킵됨).
alter table public.puzzles add column if not exists likes bigint not null default 0;
alter table public.puzzles enable row level security;
drop policy if exists "puzzles read"   on public.puzzles;
drop policy if exists "puzzles insert" on public.puzzles;
drop policy if exists "puzzles update" on public.puzzles;
create policy "puzzles read"   on public.puzzles for select using (true);
-- (v0.0.5 보안) insert는 새 퍼즐 공유 목적이므로 여전히 열어두되, solves/likes를 0이 아닌 값으로
-- 미리 심어 랭킹·좋아요 집계를 조작하는 걸 막는다(정상 카운트는 puzzle_solve/puzzle_like_toggle
-- RPC가 SECURITY DEFINER로 올린다).
create policy "puzzles insert" on public.puzzles for insert with check (coalesce(solves, 0) = 0 and coalesce(likes, 0) = 0);
create policy "puzzles update" on public.puzzles for update using (true) with check (true);
grant select, insert on public.puzzles to anon, authenticated;
-- (v0.0.5 보안) 기존에는 update가 테이블 전체(위 RLS와 함께 사실상 using(true)/with check(true))에
-- 열려 있어, 로그인 없이도 REST를 직접 호출해 임의 퍼즐의 solves/likes 카운터를 덮어쓸 수 있었다.
-- 컬럼 단위 권한으로 좁혀 REST를 통한 직접 update는 data(퍼즐 내용 보정)만 가능하게 하고, solves/
-- likes는 grant 자체가 없어 RLS가 true여도 권한 계층에서 막힌다 — 두 카운터는 오직 puzzle_solve/
-- puzzle_like_toggle RPC(SECURITY DEFINER, 테이블 소유자 권한으로 실행되어 이 grant를 우회함)로만
-- 바뀐다. src/App.jsx의 puzzleShare()는 비로그인 게스트도 새로 만난 퍼즐을 공유하므로(집중 학습은
-- 로그인 없이 쓸 수 있는 핵심 기능) data update는 anon도 유지하되, solves/likes는 어느 role도 직접
-- 건드릴 수 없다.
grant update (data) on public.puzzles to anon, authenticated;

-- 퍼즐별 해결자 uid 기록 — "친구 OO 외 N명이 풀었습니다!" 표기용(1인 1행). 본인 명의로만 기록 가능.
create table if not exists public.puzzle_solvers (
  no bigint not null,
  uid uuid not null references auth.users(id) on delete cascade,
  solved_at timestamptz not null default now(),
  primary key (no, uid)
);
alter table public.puzzle_solvers enable row level security;
drop policy if exists "solvers read"   on public.puzzle_solvers;
drop policy if exists "solvers upsert" on public.puzzle_solvers;
drop policy if exists "solvers update" on public.puzzle_solvers;
create policy "solvers read"   on public.puzzle_solvers for select using (true);
create policy "solvers upsert" on public.puzzle_solvers for insert with check (auth.uid() = uid);
create policy "solvers update" on public.puzzle_solvers for update using (auth.uid() = uid) with check (auth.uid() = uid);
grant select on public.puzzle_solvers to anon, authenticated;
grant insert, update on public.puzzle_solvers to authenticated;

-- 퍼즐 해결 "이벤트" 로그 — 추천 랭킹 집계용(같은 사람이 여러 번 풀어도 매번 한 줄씩 쌓임).
-- 게스트(비로그인)는 uid 없이 기록 가능하지만, 로그인 상태라면 본인 uid로만 기록 가능(도용 방지).
create table if not exists public.puzzle_solve_events (
  id bigint generated always as identity primary key,
  no bigint not null,
  uid uuid references auth.users(id) on delete set null,
  solved_at timestamptz not null default now()
);
create index if not exists idx_puzzle_solve_events_no_time on public.puzzle_solve_events(no, solved_at);
alter table public.puzzle_solve_events enable row level security;
drop policy if exists "solve events read"   on public.puzzle_solve_events;
drop policy if exists "solve events insert" on public.puzzle_solve_events;
create policy "solve events read"   on public.puzzle_solve_events for select using (true);
create policy "solve events insert" on public.puzzle_solve_events for insert with check (uid is null or uid = auth.uid());
grant select, insert on public.puzzle_solve_events to anon, authenticated;

-- 퍼즐 해결 시 solves 카운터를 원자적으로 1 증가(행이 없으면 새로 만들며 1로 시작)
drop function if exists public.puzzle_solve(bigint) cascade;
create or replace function public.puzzle_solve(p_no bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_solves bigint;
begin
  insert into public.puzzles(no, data, solves) values (p_no, '{}'::jsonb, 1)
  on conflict (no) do update set solves = public.puzzles.solves + 1
  returning solves into v_solves;
  return v_solves;
end; $$;
grant execute on function public.puzzle_solve(bigint) to anon, authenticated;

-- 기간별(day/week/month) 인기 퍼즐 랭킹 — 상위 N개를 풀이수 내림차순으로 반환
drop function if exists public.puzzle_rank(text, int) cascade;
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
grant execute on function public.puzzle_rank(text, int) to anon, authenticated;

-- 퍼즐 좋아요 — 풀이수(solves)와 달리 취소 가능(토글)해야 하므로 1인 1행을 직접 만들고 지운다.
-- (likes 컬럼은 위 puzzles 테이블 생성 직후로 옮겨 추가함 — "puzzles insert" 정책이 참조하므로)
create table if not exists public.puzzle_likes (
  no bigint not null,
  uid uuid not null references auth.users(id) on delete cascade,
  liked_at timestamptz not null default now(),
  primary key (no, uid)
);
alter table public.puzzle_likes enable row level security;
drop policy if exists "likes read"   on public.puzzle_likes;
drop policy if exists "likes insert" on public.puzzle_likes;
drop policy if exists "likes delete" on public.puzzle_likes;
create policy "likes read"   on public.puzzle_likes for select using (true);
create policy "likes insert" on public.puzzle_likes for insert with check (auth.uid() = uid);
create policy "likes delete" on public.puzzle_likes for delete using (auth.uid() = uid);
grant select on public.puzzle_likes to anon, authenticated;
grant insert, delete on public.puzzle_likes to authenticated;

-- 좋아요 토글 — 이미 눌렀으면 취소(행 삭제 + likes-1), 아니면 등록(행 추가 + likes+1).
-- 반환값으로 이 호출 후의 상태(liked)와 갱신된 전체 좋아요 수(likes)를 함께 돌려줘, 클라이언트가
-- 별도 조회 없이 그 자리에서 화면(하트 채움/카운트)을 갱신할 수 있게 한다.
drop function if exists public.puzzle_like_toggle(bigint, uuid) cascade;
create or replace function public.puzzle_like_toggle(p_no bigint, p_uid uuid)
returns table(liked boolean, likes bigint) language plpgsql security definer set search_path = public as $$
declare v_likes bigint; v_liked boolean;
begin
  if exists (select 1 from public.puzzle_likes where no = p_no and uid = p_uid) then
    delete from public.puzzle_likes where no = p_no and uid = p_uid;
    update public.puzzles set likes = greatest(0, likes - 1) where no = p_no returning puzzles.likes into v_likes;
    v_liked := false;
  else
    insert into public.puzzle_likes(no, uid) values (p_no, p_uid);
    insert into public.puzzles(no, data, likes) values (p_no, '{}'::jsonb, 1)
    on conflict (no) do update set likes = public.puzzles.likes + 1
    returning puzzles.likes into v_likes;
    v_liked := true;
  end if;
  return query select v_liked, coalesce(v_likes, 0);
end; $$;
grant execute on function public.puzzle_like_toggle(bigint, uuid) to authenticated;

-- ============================================================================
-- 8) Realtime — 알림/채팅/친구요청 배지가 폴링 대신 실시간으로 갱신되려면(src/App.jsx의
--    useRealtimeTable, v0.0.5) 아래 3개 테이블이 supabase_realtime publication에 포함돼 있어야
--    한다. 신규 프로젝트는 기본적으로 포함돼 있지 않으므로 반드시 실행할 것 — 빠지면 클라이언트는
--    postgres_changes 이벤트를 받지 못하고 1~2분 안전망 재조회에만 의존하게 된다(조용히 느려질 뿐
--    에러는 나지 않아 누락을 알아채기 어려움).
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friend_edges') then
    alter publication supabase_realtime add table public.friend_edges;
  end if;
end $$;
