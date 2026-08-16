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
--   public.puzzle_solve_events, public.puzzle_solvers, public.puzzle_likes, public.puzzle_reposts, public.puzzles,
--   public.app_content, public.user_progress, public.profiles, public.accounts cascade;
-- drop function if exists public.handle_new_user(), public.is_content_editor(uuid),
--   public.username_available(text), public.email_for_username(text), public.account_providers(text),
--   public.claim_username(text), public.friend_request(text), public.friend_accept(uuid),
--   public.friend_remove(uuid), public.puzzle_solve(bigint), public.puzzle_rank(text, int),
--   public.puzzle_like_toggle(bigint, uuid), public.friend_suggestions(int), public.leaderboard_top(int),
--   public.puzzle_share_inc(bigint), public.puzzle_repost_toggle(bigint, uuid), public.puzzle_share_reward(bigint, bigint),
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
  puzzle_no bigint,          -- (v0.1.0) 퍼즐 공유 카드 — 설정돼 있으면 이 메시지는 릴스 공유처럼 퍼즐 미리보기+풀러가기 버튼으로 렌더링됨
  share_reward jsonb,        -- (v0.1.0) 공유 보상 시스템 메시지 — {amount, no}. puzzle_share_reward RPC가 자동으로 생성(발신자 없이 to_uid=공유자에게 기록)
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_chat_messages_pair on public.chat_messages(from_uid, to_uid, created_at);
-- (v0.1.1 버그 수정) 위 puzzle_no/share_reward 컬럼은 create table if not exists 블록 안에 있어서,
-- 이미 chat_messages 테이블이 있는 기존 프로젝트에서는 실제로 추가되지 않았다(신규 프로젝트에서만 동작).
-- 기존 프로젝트에도 확실히 반영되도록 별도 alter로 추가한다.
alter table public.chat_messages add column if not exists puzzle_no bigint;
alter table public.chat_messages add column if not exists share_reward jsonb;
-- (v0.1.4 기능) 채팅 메시지 수정 기능 — 발신자가 본인 텍스트 메시지를 고쳤는지 표시.
alter table public.chat_messages add column if not exists edited boolean not null default false;
-- (v0.3.3 기능) 유산 공유 카드 — puzzle_no와 같은 패턴. 설정돼 있으면 이 메시지는 유산 미리보기
-- 카드로 렌더링된다. 값은 슬롯 키 그 자체(best/only/brilliant, 그랜드마스터 보너스 칸이면
-- best2/only2/brilliant2) — 유산은 퍼즐과 달리 번호별 전역 저장소가 없으므로 데이터를 복제해
-- 두지 않고, 받는 쪽 화면이 from_uid(=유산 주인)의 "지금" 공개 프로필(profiles.pub.legacies)에서
-- 그 슬롯을 그대로 읽어와 보여준다(legacyShareSend).
alter table public.chat_messages add column if not exists legacy_slot text;
-- (v0.3.4 기능) 리뷰 공유 카드 — puzzle_no/legacy_slot과 같은 패턴. 설정돼 있으면 이 메시지는 리뷰
-- 미리보기 카드로 렌더링된다. 값은 리뷰 딥링크 식별자 그 자체(reviewGameIdentifier가 만든 문자열 —
-- chess.com 대국은 숫자 ID, FEN 분석은 FEN 원문, PGN 분석은 암호화된 PGN)라 리뷰와 달리 별도 서버
-- 캐시가 필요 없다(chess.com 대국만 reviewed_games를 통해 복원되고, FEN/PGN은 식별자 자체가 데이터를
-- 담고 있다 — resolveReviewIdentifier 참고).
alter table public.chat_messages add column if not exists review_id text;
alter table public.chat_messages enable row level security;
drop policy if exists "chat select own" on public.chat_messages;
drop policy if exists "chat insert own" on public.chat_messages;
drop policy if exists "chat update own" on public.chat_messages;
drop policy if exists "chat delete own" on public.chat_messages;
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
-- (v0.1.4 기능) 채팅 메시지 삭제 — puzzle_likes/puzzle_reposts와 동일한 패턴으로, 보낸 사람만
-- 본인 메시지를 지울 수 있다(수정은 auth.uid()=to_uid만 허용하는 위 정책과 충돌하므로 별도
-- SECURITY DEFINER RPC인 chat_edit_message로 처리한다 — 아래 참고).
create policy "chat delete own" on public.chat_messages for delete using (auth.uid() = from_uid);
grant select, insert, update, delete on public.chat_messages to authenticated;
-- (v0.1.4 기능) 채팅 메시지 수정 — 발신자 본인의 텍스트 메시지(퍼즐 공유·보상 시스템 메시지 제외)만
-- 고칠 수 있고, 수정됨 표시(edited)를 함께 남긴다. "chat update own" 정책은 수신자의 읽음 처리
-- 전용이라 발신자의 본문 수정에는 쓸 수 없어, SECURITY DEFINER로 소유권을 직접 검증한다.
create or replace function public.chat_edit_message(p_id bigint, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.chat_messages
    set body = p_body, edited = true
    -- (v0.3.3) 유산 공유 카드(legacy_slot)도 puzzle_no/share_reward와 마찬가지로 텍스트로 "수정"할
    -- 수 없는 특수 메시지라 같이 제외한다(클라이언트도 이런 메시지엔 수정 버튼을 안 보여주지만,
    -- 서버에서도 이중으로 막는다).
    where id = p_id and from_uid = auth.uid() and puzzle_no is null and share_reward is null and legacy_slot is null;
end; $$;
grant execute on function public.chat_edit_message(bigint, text) to authenticated;

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
-- 기존에 만들어 둔 puzzles 테이블에는 likes 컬럼이 없으므로 별도로 추가한다.
alter table public.puzzles add column if not exists likes bigint not null default 0;

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
    -- (v0.1.1 버그 수정) 아래 우변의 likes를 테이블 한정 없이 그냥 쓰면, 이 함수의 반환값
    -- RETURNS TABLE(liked boolean, likes bigint)의 likes 출력 변수와 이름이 겹쳐 실행 시점에
    -- "column reference likes is ambiguous" 에러가 난다(취소를 눌러도 좋아요가 그대로 돌아오는
    -- 원인). public.puzzles.likes로 완전히 한정해 컬럼임을 명시한다.
    update public.puzzles set likes = greatest(0, public.puzzles.likes - 1) where no = p_no returning public.puzzles.likes into v_likes;
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
-- 7-1) puzzle_reposts / 공유·리포스트 카운터 / 공유 보상 (v0.1.0) — 소셜 기능 확장.
-- 퍼즐 공유는 친구 간 chat_messages 메시지(puzzle_no 설정)로 이뤄지고, 리포스트는 좋아요와 같은
-- 토글형 1인 1행 테이블이다. 공유 보상(친구가 내가 공유한 퍼즐을 풀면 그 XP의 10%를 내가 받는 것)은
-- XP 자체가 client가 소유한 user_progress jsonb 블롭이라 서버가 직접 그 값을 늘릴 수 없다(클라이언트가
-- 다음 저장 때 자기 로컬 값으로 통째로 덮어써 버림) — 대신 puzzle_share_reward RPC가 보상 내역을
-- chat_messages 시스템 메시지로 남기면, 수령자(공유자) 본인의 클라이언트가 그 메시지를 realtime으로
-- 받아 자기 자신의 XP에 더하고 읽음 처리한다(알림·좋아요와 같은 "본인 소유 데이터는 본인만 갱신" 원칙 유지).
-- ============================================================================
alter table public.puzzles add column if not exists shares bigint not null default 0;
alter table public.puzzles add column if not exists reposts bigint not null default 0;

create table if not exists public.puzzle_reposts (
  no bigint not null,
  uid uuid not null references auth.users(id) on delete cascade,
  reposted_at timestamptz not null default now(),
  primary key (no, uid)
);
alter table public.puzzle_reposts enable row level security;
drop policy if exists "reposts read"   on public.puzzle_reposts;
drop policy if exists "reposts insert" on public.puzzle_reposts;
drop policy if exists "reposts delete" on public.puzzle_reposts;
create policy "reposts read"   on public.puzzle_reposts for select using (true);
create policy "reposts insert" on public.puzzle_reposts for insert with check (auth.uid() = uid);
create policy "reposts delete" on public.puzzle_reposts for delete using (auth.uid() = uid);
grant select on public.puzzle_reposts to anon, authenticated;
grant insert, delete on public.puzzle_reposts to authenticated;

-- 공유 수 — 퍼즐 카드/풀이 화면의 종이비행기 아이콘을 눌러 친구에게 보낼 때마다 1 증가(받는 친구 수만큼).
drop function if exists public.puzzle_share_inc(bigint) cascade;
create or replace function public.puzzle_share_inc(p_no bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_shares bigint;
begin
  insert into public.puzzles(no, data, shares) values (p_no, '{}'::jsonb, 1)
  on conflict (no) do update set shares = public.puzzles.shares + 1
  returning shares into v_shares;
  return v_shares;
end; $$;
grant execute on function public.puzzle_share_inc(bigint) to authenticated;

-- 리포스트 토글 — puzzle_like_toggle과 동일한 패턴(이미 리포스트했으면 취소, 아니면 등록).
drop function if exists public.puzzle_repost_toggle(bigint, uuid) cascade;
create or replace function public.puzzle_repost_toggle(p_no bigint, p_uid uuid)
returns table(reposted boolean, reposts bigint) language plpgsql security definer set search_path = public as $$
declare v_reposts bigint; v_reposted boolean;
begin
  if exists (select 1 from public.puzzle_reposts where no = p_no and uid = p_uid) then
    delete from public.puzzle_reposts where no = p_no and uid = p_uid;
    -- (v0.1.1 버그 수정) puzzle_like_toggle과 동일한 원인의 버그 — 아래 우변의 reposts가 이 함수의
    -- 반환 변수 reposts(RETURNS TABLE(reposted boolean, reposts bigint))와 이름이 겹쳐 "column
    -- reference reposts is ambiguous" 런타임 에러가 나서 리포스트 취소가 항상 실패하고 있었다.
    update public.puzzles set reposts = greatest(0, public.puzzles.reposts - 1) where no = p_no returning public.puzzles.reposts into v_reposts;
    v_reposted := false;
  else
    insert into public.puzzle_reposts(no, uid) values (p_no, p_uid);
    insert into public.puzzles(no, data, reposts) values (p_no, '{}'::jsonb, 1)
    on conflict (no) do update set reposts = public.puzzles.reposts + 1
    returning puzzles.reposts into v_reposts;
    v_reposted := true;
  end if;
  return query select v_reposted, coalesce(v_reposts, 0);
end; $$;
grant execute on function public.puzzle_repost_toggle(bigint, uuid) to authenticated;

-- 공유 보상 — 퍼즐 공유 메시지(chat_messages.puzzle_no)를 타고 들어온 수신자가 그 퍼즐의 라인을 풀 때마다
-- 호출된다. p_share_msg_id로 "실제로 나에게(to_uid=나) 온 퍼즐 공유 메시지"인지 검증해, 임의 메시지
-- id를 넣어 아무에게나 보상을 위조해 보낼 수 없도록 한다. 자기 자신이 공유한 퍼즐을 자기가 푸는
-- 경우(from_uid=to_uid 방지는 원 메시지 자체가 항상 다른 사람에게만 보내지므로 자연히 배제됨)는
-- 애초에 발생하지 않는다. 금액은 클라이언트가 계산해 보내지만(이 앱의 XP 자체가 이미 전부 클라이언트
-- 계산이라 신뢰 모델은 동일), 비정상적으로 큰 값이 들어오는 것만 서버에서 상한으로 방어한다.
drop function if exists public.puzzle_share_reward(bigint, bigint) cascade;
create or replace function public.puzzle_share_reward(p_share_msg_id bigint, p_amount bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_from uuid; v_no bigint; v_amount bigint;
begin
  if v_me is null then return false; end if;
  select from_uid, puzzle_no into v_from, v_no
  from public.chat_messages where id = p_share_msg_id and to_uid = v_me and puzzle_no is not null;
  if v_from is null or v_from = v_me then return false; end if;
  v_amount := greatest(1, least(coalesce(p_amount, 0), 1000));
  insert into public.chat_messages(from_uid, to_uid, share_reward) values (v_me, v_from, jsonb_build_object('amount', v_amount, 'no', v_no));
  return true;
end; $$;
grant execute on function public.puzzle_share_reward(bigint, bigint) to authenticated;

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

-- ============================================================================
-- 9) friend_suggestions / leaderboard_top — 유저 검색창을 열었을 때(아직 아무것도 입력하기 전)
--    기본으로 보여줄 두 후보군. "친구의 친구"는 다른 사람의 friend_edges를 들여다봐야 하는데
--    위 4번 섹션의 RLS("friend edges select own")가 본인이 관련된 행만 읽도록 막아 두어 클라이언트
--    에서 직접 조합할 수 없다 — SECURITY DEFINER 함수로 서버에서 계산해, 원본 friend_edges 행이
--    아니라 결과(추천 유저 + 같이 아는 친구 수)만 돌려준다.
-- ============================================================================
drop function if exists public.friend_suggestions(int) cascade;
create or replace function public.friend_suggestions(p_limit int default 8)
returns table(id uuid, username text, pub jsonb, mutual int)
language sql stable security definer set search_path = public as $$
  with my_edges as (
    select from_uid, to_uid, status from public.friend_edges
    where from_uid = auth.uid() or to_uid = auth.uid()
  ),
  my_friends as (
    select case when from_uid = auth.uid() then to_uid else from_uid end as uid
    from my_edges where status = 'accepted'
  ),
  excluded as (
    select auth.uid() as uid
    union
    select case when from_uid = auth.uid() then to_uid else from_uid end from my_edges
  ),
  candidates as (
    select (case when fe.from_uid = mf.uid then fe.to_uid else fe.from_uid end) as uid,
           count(*)::int as mutual
    from public.friend_edges fe
    join my_friends mf on fe.status = 'accepted' and (fe.from_uid = mf.uid or fe.to_uid = mf.uid)
    where (case when fe.from_uid = mf.uid then fe.to_uid else fe.from_uid end) not in (select uid from excluded)
    group by 1
  )
  select p.id, p.username, p.pub, c.mutual
  from candidates c join public.profiles p on p.id = c.uid
  order by c.mutual desc, p.username asc
  limit p_limit;
$$;
grant execute on function public.friend_suggestions(int) to authenticated;

-- 티어(pub->xp) 상위 유저 — xp는 profiles.pub jsonb 안의 텍스트라, PostgREST의 문자열 정렬
-- (order=pub->>xp.desc)로는 "9000"이 "20000"보다 앞에 오는 등 자릿수가 다르면 숫자 크기와
-- 다르게 정렬된다. 숫자로 캐스팅해 정렬하도록 서버 함수로 만든다. profiles는 이미 누구나
-- 읽을 수 있어(위 1번 섹션 "profiles select all") SECURITY DEFINER가 필요 없다(puzzle_rank와 동일).
-- (v0.3.3) 경험치를 아직 하나도 얻지 못한 계정(신규 가입 직후 등)도 순위에서 빠지지 않도록
-- xp>0 필터를 없앤다 — 존재하는 모든 계정을 대상으로 순위를 매겨야 "0위 근처"의 유저도 검색 시
-- 리더보드에서 자신의 위치를 확인할 수 있다.
drop function if exists public.leaderboard_top(int) cascade;
create or replace function public.leaderboard_top(p_limit int default 8)
returns table(id uuid, username text, pub jsonb) language sql stable as $$
  select id, username, pub
  from public.profiles
  order by coalesce((pub->>'xp')::bigint, 0) desc, username asc
  limit p_limit;
$$;
grant execute on function public.leaderboard_top(int) to anon, authenticated;

-- ============================================================================
-- 12) master_games_dev — 개발자가 수동으로 추가하는 마스터 대국 (v0.2.3)
-- ============================================================================
-- Lichess 마스터 DB에 없는(또는 chessgames.com에서만 볼 수 있는) 유명 대국을 개발자 권한으로 직접
-- 등록한다. 화면에서는 Lichess 마스터 대국과 구분 없이 같은 목록에 섞여 표시된다(src/App.jsx의
-- fetchAllMasterGames 참고) — sans(jsonb 배열)는 클라이언트가 PGN을 파싱해 미리 채워 넣어, 특정
-- 수순이 "이 대국에서 두어졌는지"를 매 조회마다 PGN을 다시 파싱하지 않고 배열 접두사 비교만으로
-- 빠르게 걸러낼 수 있게 한다.
create table if not exists public.master_games_dev (
  id bigint generated always as identity primary key,
  white_name text not null,
  white_rating int,
  black_name text not null,
  black_rating int,
  year int,
  pgn text not null,
  sans jsonb not null,
  result text not null check (result in ('1-0', '0-1', '1/2-1/2')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.master_games_dev enable row level security;

drop policy if exists "master games dev read"   on public.master_games_dev;
drop policy if exists "master games dev insert" on public.master_games_dev;
drop policy if exists "master games dev delete" on public.master_games_dev;
-- 읽기는 누구나(로그인 없이도 마스터 대국 목록을 보므로), 쓰기·삭제는 개발자/공동개발자만
-- (app_content와 동일한 is_content_editor 헬퍼 재사용).
create policy "master games dev read"   on public.master_games_dev for select using (true);
create policy "master games dev insert" on public.master_games_dev for insert with check (public.is_content_editor(auth.uid()));
create policy "master games dev delete" on public.master_games_dev for delete using (public.is_content_editor(auth.uid()));
grant select on public.master_games_dev to anon, authenticated;
grant insert, delete on public.master_games_dev to authenticated;

-- ============================================================================
-- 13) daily_puzzle_themes — 오늘의 퍼즐 오프닝 테마 2주 로테이션 (v0.2.4)
-- ============================================================================
-- 리체스 퍼즐 DB에서 오프닝 테마별로 미리 걸러 둔 후보 풀(scripts/build-daily-puzzles.mjs가 만든
-- public/daily-puzzles/<opening_tag>.json)을 어느 날짜 구간에 쓸지 개발자가 그때그때 지정한다.
-- 한 날짜(KST)에 적용되는 테마 = starts_on이 그 날짜 이하인 행 중 가장 최근 것.
create table if not exists public.daily_puzzle_themes (
  id bigint generated always as identity primary key,
  starts_on date not null unique,
  opening_tag text not null,   -- public/daily-puzzles/<opening_tag>.json 파일명과 일치해야 함
  label text,                  -- 화면 표시용 이름(선택, 없으면 opening_tag 그대로 표시)
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.daily_puzzle_themes enable row level security;

drop policy if exists "daily puzzle themes read"   on public.daily_puzzle_themes;
drop policy if exists "daily puzzle themes insert" on public.daily_puzzle_themes;
drop policy if exists "daily puzzle themes delete" on public.daily_puzzle_themes;
create policy "daily puzzle themes read"   on public.daily_puzzle_themes for select using (true);
create policy "daily puzzle themes insert" on public.daily_puzzle_themes for insert with check (public.is_content_editor(auth.uid()));
create policy "daily puzzle themes delete" on public.daily_puzzle_themes for delete using (public.is_content_editor(auth.uid()));
grant select on public.daily_puzzle_themes to anon, authenticated;
grant insert, delete on public.daily_puzzle_themes to authenticated;

-- ============================================================================
-- 14) daily_puzzles_dev — 특정 날짜의 오늘의 퍼즐을 개발자가 PGN으로 직접 지정 (v0.2.4)
-- ============================================================================
-- 이 테이블에 그 날짜(KST) 행이 있으면, 테마 풀에서 뽑는 대신 이 PGN을 오늘의 퍼즐로 쓴다(주로
-- 미래 날짜를 미리 예약해 두는 용도). sans/puzzle_ply는 클라이언트가 PGN을 미리 파싱해 채운다 —
-- sans는 시작 위치부터의 전체 SAN 배열, puzzle_ply는 그중 몇 번째 수부터가 "퍼즐(상대의 실수)"
-- 인지를 가리키는 0-based 인덱스(setupSans = sans[0:puzzle_ply], mistakeSan = sans[puzzle_ply]).
create table if not exists public.daily_puzzles_dev (
  date date primary key,
  pgn text not null,
  sans jsonb not null,
  puzzle_ply int not null,
  opening text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.daily_puzzles_dev enable row level security;

drop policy if exists "daily puzzles dev read"   on public.daily_puzzles_dev;
drop policy if exists "daily puzzles dev insert" on public.daily_puzzles_dev;
drop policy if exists "daily puzzles dev update" on public.daily_puzzles_dev;
drop policy if exists "daily puzzles dev delete" on public.daily_puzzles_dev;
create policy "daily puzzles dev read"   on public.daily_puzzles_dev for select using (true);
create policy "daily puzzles dev insert" on public.daily_puzzles_dev for insert with check (public.is_content_editor(auth.uid()));
create policy "daily puzzles dev update" on public.daily_puzzles_dev for update using (public.is_content_editor(auth.uid())) with check (public.is_content_editor(auth.uid()));
create policy "daily puzzles dev delete" on public.daily_puzzles_dev for delete using (public.is_content_editor(auth.uid()));
grant select on public.daily_puzzles_dev to anon, authenticated;
grant insert, update, delete on public.daily_puzzles_dev to authenticated;

-- ============================================================================
-- 15) move_notes — 학습 탭 "수 설명" 커뮤니티 게시판 (v0.2.9)
-- ============================================================================
-- 예전엔 특정 수(move_key = "<그 수까지의 SAN 공백연결>|<그 수 SAN>")에 대한 설명을 app_content(위
-- 3번 섹션, is_content_editor만 쓸 수 있는 단일 값 콘텐츠 블롭)에 개발자/공동개발자만 등록할 수
-- 있었다. 이제 로그인한 모든 유저가 짧은 설명을 남길 수 있도록 완전히 별도 테이블로 분리한다 —
-- app_content는 그대로 두고(다른 콘텐츠가 계속 그 테이블을 쓰므로) 이 기능만 여기로 옮겼다.
-- 1인당 같은 수에 남길 수 있는 개수는 계정 등급에 따라 다르다(v0.3.4, 사용자 요청) — 개발자/
-- 공동개발자(is_content_editor, app_content·master_games_dev와 동일한 헬퍼 재사용)는 무제한,
-- 그랜드마스터 티어에 도달한 일반 계정은 2개까지, 그 외는 기존과 같이 1개만(스팸 방지 —
-- puzzle_likes/puzzle_solvers와 같은 1인 1행 패턴의 확장). 그래서 고정된 unique(move_key, uid)
-- 제약 대신, 아래 move_notes_cap()이 계정마다 다른 한도를 계산하고 move_notes_moderate 트리거가
-- 삽입 시점에 그 한도를 검사한다. 수정·삭제는
-- 작성자 본인(자기 글에 한해)과 개발자/공동개발자(모든 글, is_content_editor)가 함께 할 수 있다
-- (v0.3.4 변경 — 예전엔 본인도 스스로 못 고치고 개발자에게만 최종 편집권이 있었다).
create table if not exists public.move_notes (
  id bigint generated always as identity primary key,
  move_key text not null,
  uid uuid not null references auth.users(id) on delete cascade,
  author_username text not null default '',
  body text not null check (char_length(body) between 1 and 100),
  created_at timestamptz not null default now()
);
-- (v0.3.4 변경) 예전엔 여기 unique(move_key, uid)로 "1인 1개"를 DB 제약으로 강제했다 — 계정 등급별로
-- 허용 개수가 달라지므로 고정 제약을 걷어내고, 그 자리를 아래 move_notes_moderate 트리거의 동적
-- 개수 검사로 대신한다(기존에 이미 이 제약이 걸려 있던 배포본을 위한 정리).
alter table public.move_notes drop constraint if exists move_notes_move_key_uid_key;
create index if not exists idx_move_notes_key on public.move_notes(move_key, created_at);
alter table public.move_notes enable row level security;

-- (v0.3.4 기능) 이 계정이 한 수에 남길 수 있는 수 설명 개수 한도 — 개발자/공동개발자
-- (is_content_editor, 처음엔 개발자 계정만이었다가 사용자 요청으로 공동개발자까지 넓힘)는
-- 사실상 무제한, 그랜드마스터
-- 티어(누적 XP가 src/App.jsx TIER_XP_REQ 총합인 200,000 이상 — 그 배열이 바뀌면 이 숫자도 함께
-- 맞춰야 한다)에 도달한 계정은 2개, 그 외는 1개. XP는 클라이언트가 소유한 user_progress.progress
-- 블롭 값을 그대로 신뢰한다(이 앱의 XP·티어 체계 전체가 이미 같은 신뢰 모델이다 — 서버가 직접
-- XP를 증감시키지 않는다, 7-1번 섹션 주석 참고). auth.uid()가 없으면(비로그인) 1을 돌려주는데,
-- 어차피 insert 정책이 로그인 없이는 애초에 막는다.
create or replace function public.move_notes_cap()
returns int language sql stable security definer set search_path = public as $$
  select case
    when public.is_content_editor(auth.uid()) then 2147483647
    when coalesce((select (up.progress->>'xp')::bigint from public.user_progress up where up.id = auth.uid()), 0) >= 200000 then 2
    else 1
  end;
$$;
grant execute on function public.move_notes_cap() to authenticated;

-- 등록·수정 시 서버에서도 흔한 욕설·혐오 표현을 다시 검사한다 — 클라이언트 필터(src/App.jsx의
-- containsBannedWord)는 REST를 직접 호출하면 우회할 수 있으므로, 실제 강제력은 이 트리거에서
-- 나온다. 숫자·영문·한글만 남기고 나머지(공백·구두점·이모지 등)는 전부 지운 뒤 부분 문자열로
-- 대조한다 — 같은 단어를 특수문자로 쪼개 피하는 경우("시🌟발")도 걸러진다. 완벽한 검열은 아니며,
-- 이를 뚫는 표현은 개발자가 delete 정책(아래)으로 사후에 지운다.
-- (v0.3.4 기능) INSERT일 때만 위 move_notes_cap()으로 이 계정이 이 수(move_key)에 이미 남긴 개수를
-- 검사한다 — UPDATE(기존 글 수정)는 새 글을 만드는 게 아니므로 이 검사와 무관하다.
create or replace function public.move_notes_moderate()
returns trigger language plpgsql as $$
declare v_norm text; v_word text; v_cnt int;
  v_words text[] := array[
    '시발','씨발','씨팔','시팔','개새끼','개새기','병신','븅신','좆','좃','자지','보지','걸레년',
    '미친놈','미친년','닥쳐','꺼져','죽어라','죽여버','강간','섹스','야동','포르노',
    'fuck','shit','bitch','asshole','cunt','nigger','nigga','faggot','rape','porn'
  ];
begin
  if TG_OP = 'INSERT' then
    select count(*) into v_cnt from public.move_notes where move_key = new.move_key and uid = new.uid;
    if v_cnt >= public.move_notes_cap() then
      raise exception 'move_notes_cap_exceeded';
    end if;
  end if;
  v_norm := lower(regexp_replace(new.body, '[^0-9a-zA-Zㄱ-ㆎ가-힣]', '', 'g'));
  foreach v_word in array v_words loop
    if v_norm like '%' || v_word || '%' then
      raise exception 'move_notes_moderation_blocked';
    end if;
  end loop;
  return new;
end; $$;
drop trigger if exists move_notes_moderate_trigger on public.move_notes;
create trigger move_notes_moderate_trigger
  before insert or update on public.move_notes
  for each row execute function public.move_notes_moderate();

drop policy if exists "move notes read"   on public.move_notes;
drop policy if exists "move notes insert" on public.move_notes;
drop policy if exists "move notes update" on public.move_notes;
drop policy if exists "move notes delete" on public.move_notes;
-- 읽기는 누구나(로그인 없이도 학습 탭을 쓸 수 있으므로), 등록은 로그인 유저 본인 이름으로만,
-- 수정·삭제는 작성자 본인(auth.uid() = uid, 자기 글만) 또는 개발자/공동개발자(app_content·
-- master_games_dev와 동일한 is_content_editor 재사용, 모든 글) 둘 중 하나만 만족하면 된다.
create policy "move notes read"   on public.move_notes for select using (true);
create policy "move notes insert" on public.move_notes for insert with check (auth.uid() = uid);
create policy "move notes update" on public.move_notes for update using (auth.uid() = uid or public.is_content_editor(auth.uid())) with check (auth.uid() = uid or public.is_content_editor(auth.uid()));
create policy "move notes delete" on public.move_notes for delete using (auth.uid() = uid or public.is_content_editor(auth.uid()));
grant select on public.move_notes to anon, authenticated;
grant insert on public.move_notes to authenticated;
grant update, delete on public.move_notes to authenticated;

-- ============================================================================
-- 16) search_puzzles_prefix — 퍼즐 탭 "번호로 풀기" 검색 추천어용 (v0.3.1)
-- ============================================================================
-- 예전엔 입력 중인 번호로 시작하는 퍼즐을 클라이언트가 이미 들고 있는 puzzles(로컬 계정에서
-- 한 번이라도 열어본 퍼즐만 누적되는 배열)에서만 골라 추천했다 — 그래서 한 번도 안 열어본
-- 퍼즐은 번호를 다 알고 있어도 추천 목록에 뜨지 않았다. puzzles.no는 bigint라 PostgREST
-- 필터로는 "숫자로 시작하는지"를 직접 표현할 수 없어(문자열 like 연산자는 text 컬럼에만
-- 적용됨) 이 RPC로 no::text like 검사를 서버에서 대신 해 준다 — 테이블 자체가 이미
-- select using(true)로 전체 공개라 이 함수도 딱히 더 열어주는 권한은 없다(SECURITY DEFINER가
-- 아닌 일반 함수).
create or replace function public.search_puzzles_prefix(p_prefix text, p_limit int default 8)
returns table(no bigint, data jsonb)
language sql stable
as $$
  select no, data
  from public.puzzles
  where p_prefix is not null and p_prefix <> '' and no::text like p_prefix || '%'
  order by no
  limit least(coalesce(p_limit, 8), 20);
$$;
grant execute on function public.search_puzzles_prefix(text, int) to anon, authenticated;
-- (v0.3.1 성능) 위 no::text like 'prefix%' 조건에 맞는 인덱스가 없어, puzzles 테이블이 계속
-- 쌓이는 구조(대국을 둘 때마다·집중 학습에서 실수를 만날 때마다 새 퍼즐이 자동 생성·공유됨)라
-- 검색창에 숫자를 입력할 때마다 매번 테이블 전체를 훑는 순차 스캔이 됐다 — "퍼즐 검색으로 퍼즐을
-- 불러오는 시간이 길다"는 원인. text_pattern_ops 표현식 인덱스를 추가하면 이런 접두어(prefix)
-- LIKE 검색에 인덱스를 태울 수 있다.
create index if not exists idx_puzzles_no_text_pattern on public.puzzles ((no::text) text_pattern_ops);

-- ============================================================================
-- 17) daily_puzzle_cache — 오늘의 퍼즐 캐러셀 계산 결과 캐시 (v0.3.1)
-- ============================================================================
-- 오늘의 퍼즐(resolveDailyPuzzle)은 날짜를 시드로 결정적으로 계산되므로 항상 모든 유저에게 완전히
-- 같은 결과가 나온다. 그런데 이 계산은 로컬 체스 엔진으로 genPuzzleTree를 실제로 돌리는(수백 ms~
-- 수 초) 무거운 작업인데, 예전엔 이걸 매번 각자의 브라우저에서 처음부터 새로 돌렸다 — 캐러셀에
-- 최근 7일치가 한꺼번에 나열되다 보니 캐러셀을 열 때마다 며칠치 계산이 한꺼번에 밀려 느리게
-- 느껴졌다. date를 키로 계산 결과를 여기 캐시해 두면, 이미 누군가(대개 그 날짜가 시작된 직후
-- 가장 먼저 연 사람) 계산해 올려 둔 날짜는 이후 모든 유저가 로컬 엔진을 아예 돌리지 않고 이
-- 테이블에서 완성된 결과만 읽어 온다(puzzles 테이블과 같은 크라우드소싱 패턴 — 같은 날짜는
-- 항상 같은 내용으로 귀결되므로 누가 먼저 계산해 올리든 안전하다).
create table if not exists public.daily_puzzle_cache (
  date date primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.daily_puzzle_cache enable row level security;
drop policy if exists "daily puzzle cache read"   on public.daily_puzzle_cache;
drop policy if exists "daily puzzle cache insert" on public.daily_puzzle_cache;
create policy "daily puzzle cache read"   on public.daily_puzzle_cache for select using (true);
create policy "daily puzzle cache insert" on public.daily_puzzle_cache for insert with check (true);
grant select, insert on public.daily_puzzle_cache to anon, authenticated;

-- ============================================================================
-- 18) puzzle_line_solve_times — 퍼즐 레이팅용 라인별 실제 풀이 시간 기록 (v0.3.4)
-- ============================================================================
-- 퍼즐 레이팅(src/App.jsx의 puzzleLineBaseRating)은 길이·긴장·유일수/탁월수 개수·평가치 표준편차
-- 같은 정적 요소로 먼저 기본값(100~3000)을 정하고, 실제 유저들이 그 라인을 푸는 데 걸린 시간으로
-- 가감(applySolveTimeAdjustment)한다. puzzle_solve_events와 같은 append-only 로그 패턴 — 같은
-- 사람이 같은 라인을 여러 번 풀어도(재도전) 매번 한 줄씩 쌓인다. 게스트(비로그인)는 uid 없이
-- 기록 가능하지만, 로그인 상태라면 본인 uid로만 기록 가능(도용 방지, puzzle_solve_events와 동일).
create table if not exists public.puzzle_line_solve_times (
  id bigint generated always as identity primary key,
  no bigint not null,
  tag text not null,
  uid uuid references auth.users(id) on delete set null,
  ms bigint not null,
  solved_at timestamptz not null default now()
);
create index if not exists idx_puzzle_line_solve_times_no_tag on public.puzzle_line_solve_times(no, tag);
alter table public.puzzle_line_solve_times enable row level security;
drop policy if exists "line solve times read"   on public.puzzle_line_solve_times;
drop policy if exists "line solve times insert" on public.puzzle_line_solve_times;
create policy "line solve times read"   on public.puzzle_line_solve_times for select using (true);
create policy "line solve times insert" on public.puzzle_line_solve_times for insert with check (uid is null or uid = auth.uid());
grant select, insert on public.puzzle_line_solve_times to anon, authenticated;

-- 이상치를 제외한 평균 풀이 시간(ms)과 표본 수를 반환한다. 표본이 20개 이상 모이면 상하위 10%
-- (percentile_cont 0.1/0.9 경계 밖)를 잘라낸 절사평균(trimmed mean)을 쓰고, 그보다 적으면 자를
-- 만큼 표본이 충분치 않다고 보고 단순평균을 쓴다. 표본이 아예 없으면 avg_ms는 null — 클라이언트
-- (applySolveTimeAdjustment)는 표본 수가 RATING_MIN_SAMPLES(현재 5) 미만이면 이 값 자체를 무시하고
-- 정적 기본 레이팅을 그대로 쓰므로, 여기서는 표본 수를 항상 정확히 돌려주기만 하면 된다.
drop function if exists public.puzzle_line_avg_solve_ms(bigint, text) cascade;
create or replace function public.puzzle_line_avg_solve_ms(p_no bigint, p_tag text)
returns table(avg_ms numeric, sample_count bigint) language sql stable as $$
  with samples as (
    select ms from public.puzzle_line_solve_times where no = p_no and tag = p_tag
  ), bounds as (
    select
      count(*) as cnt,
      percentile_cont(0.1) within group (order by ms) as lo,
      percentile_cont(0.9) within group (order by ms) as hi
    from samples
  )
  select
    case
      when b.cnt = 0 then null
      when b.cnt >= 20 then (select avg(s.ms) from samples s where s.ms between b.lo and b.hi)
      else (select avg(s.ms) from samples s)
    end as avg_ms,
    b.cnt as sample_count
  from bounds b;
$$;
grant execute on function public.puzzle_line_avg_solve_ms(bigint, text) to anon, authenticated;

-- ============================================================================
-- 19) chat_conv_prefs — 채팅 목록의 대화방별 설정(고정/알림 끄기)과 "나에게서만 삭제" 워터마크 (v0.3.4)
-- ============================================================================
-- 대화(conversation) 자체는 별도 테이블 없이 chat_messages를 클라이언트가 상대별로 묶어서 쓰는
-- 구조라, 그 목록 화면에서만 의미 있는 "나만의" 설정(고정 여부·알림 끄기 여부·내가 지운 시점)을
-- 담을 곳이 없었다. (uid, other_uid) 조합마다 딱 한 행 — pinned/muted는 uid 본인이 자유롭게
-- 읽고 쓴다(일반 RLS, RPC 불필요). cleared_before(대화 삭제 워터마크)만은 상대방의 워터마크를
-- 함께 봐야 영구 삭제 여부를 판단할 수 있어 아래 SECURITY DEFINER RPC로 처리한다.
create table if not exists public.chat_conv_prefs (
  uid uuid not null references auth.users(id) on delete cascade,
  other_uid uuid not null references auth.users(id) on delete cascade,
  pinned boolean not null default false,
  muted boolean not null default false,
  cleared_before timestamptz,
  updated_at timestamptz not null default now(),
  primary key (uid, other_uid)
);
alter table public.chat_conv_prefs enable row level security;
drop policy if exists "conv prefs own" on public.chat_conv_prefs;
create policy "conv prefs own" on public.chat_conv_prefs for all using (auth.uid() = uid) with check (auth.uid() = uid);
grant select, insert, update, delete on public.chat_conv_prefs to authenticated;

-- 대화 삭제("나에게서만 삭제") — 내 워터마크(cleared_before)를 지금 시각으로 올려 두면, 클라이언트는
-- 이후 그 시각 이전 메시지를 더 이상 불러오지 않는다(나에게만 안 보임, 상대방 화면엔 그대로 남음).
-- 상대방도 이미 자신의 워터마크를 기록해 두었다면(=상대도 그 대화를 지운 적이 있다면), 두 워터마크
-- 중 더 이른 시점까지의 메시지는 이제 양쪽 어디에서도 다시 보일 일이 없으므로 서버에서 영구적으로
-- 삭제한다 — chat_edit_message와 같은 이유(상대 소유 행까지 들여다봐야 함)로 SECURITY DEFINER.
create or replace function public.chat_clear_conversation(p_other uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_now timestamptz := now();
  v_other_cleared timestamptz;
begin
  insert into public.chat_conv_prefs(uid, other_uid, cleared_before, updated_at)
    values (v_me, p_other, v_now, v_now)
    on conflict (uid, other_uid) do update set cleared_before = v_now, updated_at = v_now;
  select cleared_before into v_other_cleared from public.chat_conv_prefs where uid = p_other and other_uid = v_me;
  if v_other_cleared is not null then
    delete from public.chat_messages
      where ((from_uid = v_me and to_uid = p_other) or (from_uid = p_other and to_uid = v_me))
        and created_at <= least(v_now, v_other_cleared);
  end if;
end; $$;
grant execute on function public.chat_clear_conversation(uuid) to authenticated;


-- ============================================================================
-- 20) puzzles 생성자 — 퍼즐 제작자 표시·본인 퍼즐 편집권(1시간 주기)·개발자의 재지정 (v0.3.4)
-- ============================================================================
-- 지금까지 puzzles(위 7번 섹션)는 "no"만으로 식별되는 완전한 크라우드소싱 데이터라 어느 유저가
-- 처음 만들었는지 전혀 기록하지 않았다. 이제 그 최초 생성자를 별도 컬럼으로 기록해 풀이 카드에
-- 표시하고, 생성자 본인에게는 그 퍼즐에 한해 개발자와 같은 라인 추가/삭제·재생성 권한을 준다.
-- data(퍼즐 본문 jsonb) 자체는 기존처럼 누구나 갱신할 수 있어야 한다(테마 태그 병합 등 크라우드
-- 소싱 자체는 그대로 유지 — puzzleShare 참고) — 그래서 생성자 식별 정보는 data 안이 아니라 별도
-- 컬럼으로 분리하고, 그 컬럼들은 REST 직접 update grant를 아예 주지 않는다(update(data)만 grant됨,
-- 아래 puzzle_solve/puzzle_like_toggle과 같은 패턴) — 오직 이 섹션의 SECURITY DEFINER RPC 세 개
-- (테이블 소유자 권한으로 실행되어 grant를 우회함)로만 바뀐다.
alter table public.puzzles add column if not exists creator_uid uuid references auth.users(id) on delete set null;
alter table public.puzzles add column if not exists creator_username text;
alter table public.puzzles add column if not exists creator_edited_at timestamptz;
create index if not exists idx_puzzles_creator_uid on public.puzzles(creator_uid);

-- 생성자 "선점" — 아직 아무도 생성자로 기록되지 않은 퍼즐(creator_uid is null)에 한해, 처음
-- 성공적으로 호출한 로그인 유저를 생성자로 기록한다. puzzleShare가 퍼즐을 서버에 새로 공유할
-- 때마다 호출하므로(멱등 — 이미 생성자가 있으면 조용히 아무 일도 안 함), 같은 실수를 나중에
-- 다시 만난 다른 유저가 재호출해도 원래 생성자가 바뀌지 않는다. 비로그인 게스트가 먼저 만들어
-- 공유한 퍼즐은 게스트가 생성자로 기록될 수 없으므로(auth.uid() is null) 생성자 없는 채로 남고,
-- 이후 처음 로그인한 상태로 다시 공유하는 유저가 대신 생성자가 된다.
create or replace function public.puzzle_claim_creator(p_no bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_username text;
begin
  if auth.uid() is null then return; end if;
  select username into v_username from public.profiles where id = auth.uid();
  update public.puzzles set creator_uid = auth.uid(), creator_username = coalesce(v_username, ''), creator_edited_at = null
  where no = p_no and creator_uid is null;
end; $$;
grant execute on function public.puzzle_claim_creator(bigint) to authenticated;

-- 라인 추가/삭제·재생성 저장 — 개발자/공동개발자(is_content_editor)는 언제든, 그 퍼즐의 생성자
-- 본인은 마지막으로 이 함수를 성공적으로 호출한 지 1시간이 지난 뒤에만(creator_edited_at 기준)
-- 호출할 수 있다. 개발자 호출은 creator_edited_at을 건드리지 않는다(생성자의 다음 편집 가능
-- 시점과 무관 — 개발자가 손댔다고 생성자의 주기가 당겨지거나 늦춰지지 않는다).
-- p_tag_seq/p_target/p_puzzle_type은 선택값 — null이면 기존 data의 해당 필드를 그대로 둔다.
-- 개발자가 CONTENT.puzzleOverrides(app_content, is_content_editor 전용 블롭)로 이 번호에 이미
-- 만들어 둔 재조정이 있으면 puzzleTreeOf가 그 override를 이 data보다 항상 우선시켜, 생성자가
-- 여기서 저장한 내용이 다음 로드 때 가려질 수 있다 — 그 충돌을 막기 위해 이 함수가 그 override
-- 항목이 있으면 함께 지운다(SECURITY DEFINER라 app_content RLS와 무관하게 가능).
create or replace function public.puzzle_creator_save(
  p_no bigint, p_tree jsonb, p_lines jsonb,
  p_tag_seq int default null, p_target int default null, p_puzzle_type text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_creator uuid; v_last timestamptz; v_is_editor boolean;
begin
  select creator_uid, creator_edited_at into v_creator, v_last from public.puzzles where no = p_no for update;
  if not found then raise exception 'puzzle_not_found'; end if;
  v_is_editor := public.is_content_editor(auth.uid());
  if not v_is_editor then
    if v_creator is null or v_creator <> auth.uid() then raise exception 'not_puzzle_creator'; end if;
    if v_last is not null and now() < v_last + interval '1 hour' then raise exception 'edit_cooldown'; end if;
  end if;
  update public.puzzles set
    data = data
      || jsonb_build_object('tree', p_tree, 'lines', p_lines)
      || case when p_tag_seq is null then '{}'::jsonb else jsonb_build_object('tagSeq', p_tag_seq) end
      || case when p_target is null then '{}'::jsonb else jsonb_build_object('target', p_target) end
      || case when p_puzzle_type is null then '{}'::jsonb else jsonb_build_object('puzzleType', p_puzzle_type) end,
    creator_edited_at = case when v_is_editor then creator_edited_at else now() end
  where no = p_no;
  update public.app_content set value = value #- array['puzzleOverrides', p_no::text]
  where key = 'global' and (value -> 'puzzleOverrides') ? p_no::text;
end; $$;
grant execute on function public.puzzle_creator_save(bigint, jsonb, jsonb, int, int, text) to authenticated;

-- 생성자 재지정 — 개발자/공동개발자 전용. p_target_username이 비어 있으면 개발자 계정(DEV_ACCOUNT,
-- src/App.jsx와 동일한 값) 명의로 회수하고, 값이 있으면 그 아이디의 유저에게 생성 권한을 양도한다
-- (둘 다 원래 생성자의 그 퍼즐 편집권을 박탈하는 효과 — 대상이 바뀌므로). 새 생성자의 1시간 편집
-- 주기는 재지정 시점에 초기화된다(creator_edited_at을 null로).
create or replace function public.puzzle_reassign_creator(p_no bigint, p_target_username text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_uname text;
begin
  if not public.is_content_editor(auth.uid()) then raise exception 'not_authorized'; end if;
  if p_target_username is null or btrim(p_target_username) = '' then
    select id, username into v_uid, v_uname from public.profiles where username = 'openchesskr';
  else
    select id, username into v_uid, v_uname from public.profiles where username = btrim(p_target_username);
    if v_uid is null then raise exception 'user_not_found'; end if;
  end if;
  update public.puzzles set creator_uid = v_uid, creator_username = v_uname, creator_edited_at = null where no = p_no;
end; $$;
grant execute on function public.puzzle_reassign_creator(bigint, text) to authenticated;

-- ============================================================================
-- 21) reviewed_games — 게임 리뷰 고유 URL의 chess.com 대국 캐시 (v0.3.4)
-- ============================================================================
-- 사용자 요청: 리뷰 페이지에 openchess.kr/review/(대국 식별자) 형태의 고유 URL을 붙인다. chess.com
-- 대국은 chess.com이 이미 발급한 숫자 게임 ID를 그대로 식별자로 쓰는데, chess.com 공개 API는 "이
-- ID의 대국 하나"를 바로 조회하는 엔드포인트를 제공하지 않는다(플레이어별 월간 아카이브로만 조회
-- 가능) — 그래서 그 링크를 처음 만든 사람이 아닌 다른 방문자가 딥링크로 열면 원본 대국을 되찾을
-- 방법이 없다. puzzles 테이블과 똑같은 크라우드소싱 방식으로: 어떤 유저든 chess.com 대국을 리뷰로
-- 열면 그 순간 이 테이블에 게임 데이터를 올려 두고(멱등 upsert), 이후 누구든 그 ID로 딥링크를 열면
-- 여기서 그대로 복원한다. FEN 분석·PGN 분석 리뷰는 식별자 자체가 그 내용을 담고 있어(URL만으로
-- 완전히 복원 가능) 이 캐시가 필요 없다.
create table if not exists public.reviewed_games (
  cc_id bigint primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.reviewed_games enable row level security;
drop policy if exists "reviewed games read"   on public.reviewed_games;
drop policy if exists "reviewed games insert" on public.reviewed_games;
drop policy if exists "reviewed games update" on public.reviewed_games;
-- (puzzles 테이블과 동일한 판단) 게임 데이터를 조작해도 이득 볼 카운터·랭킹이 이 테이블엔 전혀
-- 없으므로, insert/update 모두 열어 둔다 — 크라우드소싱 캐시의 성격상 최초 발견자 외에도 누구나
-- 갱신할 수 있어야 한다(puzzles.data와 동일한 이유).
create policy "reviewed games read"   on public.reviewed_games for select using (true);
create policy "reviewed games insert" on public.reviewed_games for insert with check (true);
create policy "reviewed games update" on public.reviewed_games for update using (true) with check (true);
grant select, insert, update on public.reviewed_games to anon, authenticated;
