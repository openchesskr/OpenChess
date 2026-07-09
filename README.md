# 오프닝 연구소 (OpenChess)

React + Vite 기반 체스 오프닝 트레이너. 실시간 Stockfish(단일 스레드 WASM) · Lichess Explorer · ECO 스냅샷(최대 10수)으로 동작하는 정적 SPA.

## 로컬 실행

```powershell
npm install      # postinstall 이 Stockfish 엔진을 public/engine 으로 복사
npm run dev      # http://localhost:5173
npm run build    # 정적 빌드 → dist/
npm run preview  # 빌드 결과 미리보기
```

Node 18 이상 필요. 단일 스레드 엔진이라 COOP/COEP 헤더가 필요 없어 어떤 정적 호스트에도 그대로 올라갑니다.

## 배포

빌드하면 `dist/` 정적 파일만 남으므로 아래 어디든 가능합니다.

### A. Vercel (권장 · 루트 도메인 · 설정 0)
1. 이 폴더를 GitHub 저장소로 푸시
2. vercel.com → New Project → 저장소 선택
3. Framework: Vite 자동 감지 / Build: `npm run build` / Output: `dist`
4. Deploy. 이후 main 에 푸시할 때마다 자동 재배포

### B. GitHub Pages (저장소에 포함된 워크플로 사용)
1. GitHub 저장소로 푸시 (.github/workflows/deploy.yml 포함됨)
2. 저장소 Settings → Pages → Source: GitHub Actions
3. main 에 푸시하면 자동 빌드/배포. 주소: https://<사용자명>.github.io/<저장소이름>/
4. 워크플로가 하위 경로에 맞춰 VITE_BASE 를 주입하므로 엔진/에셋 경로가 깨지지 않습니다.

### C. Netlify / Cloudflare Pages
Build command `npm run build`, Publish directory `dist`. 나머지는 Vercel 과 동일.

## Lichess Opening Explorer 인증 (필수)

Lichess가 Opening Explorer API를 로그인 계정 전용으로 바꿔서, 토큰 없이는 호출이 401로 막힙니다.

1. Lichess 계정으로 로그인한 상태에서 `https://lichess.org/account/oauth/token/create` 접속
2. 설명은 아무거나 입력, 권한(Scope)은 체크 안 해도 됨(공개 읽기 전용 데이터라 무권한 토큰으로 충분) → Create
3. 발급된 토큰(`lip_...`)을 아래 두 곳에 설정:
   - **로컬(`npm run refresh`용)**: `$env:LICHESS_TOKEN = "lip_..."` (PowerShell) 또는 `export LICHESS_TOKEN=lip_...` (bash) 후 같은 세션에서 `npm run refresh` 실행
   - **Vercel(배포된 사이트용)**: Project → Settings → Environment Variables 에 `LICHESS_TOKEN` 추가(값은 토큰) 후 재배포. **`VITE_` 접두사를 붙이면 안 됩니다** — 그러면 브라우저 번들에 토큰이 그대로 노출됩니다. 이 이름 그대로 서버 전용 환경변수로 둬야 `api/lichess.js`(서버리스 함수)에서만 읽습니다.

브라우저는 Lichess를 직접 호출하지 않고 `/api/lichess`(Vercel 서버리스 함수)를 거쳐 호출합니다 — 토큰이 클라이언트에 노출되지 않도록 서버 쪽에서만 붙입니다.

## 데이터 갱신 (선택)

```bash
npm run refresh   # Lichess Explorer + Stockfish 로 openings.json 재생성 (LICHESS_TOKEN 필요)
```

## 구조

- `src/App.jsx` — 앱 전체 (단일 파일)
- `src/data/openings.json` — ECO 오프닝 트리 스냅샷 (최대 10수)
- `api/lichess.js` — Lichess Explorer 프록시(Vercel 서버리스 함수). 토큰을 서버에서만 붙여 브라우저에 노출하지 않음
- `scripts/copy-engine.mjs` — 엔진 파일을 public/engine 으로 복사 (postinstall)
- `scripts/refresh-data.mjs` — 라이브 데이터로 스냅샷 재생성

## 참고

- 계정·개발자 콘텐츠 저장은 현재 브라우저 localStorage 기반입니다. 다기기 동기화가 필요하면 App.jsx 의 accountStore / saveContent / loadContent 를 백엔드 API(Supabase, Firebase 등)로 교체하세요.
- Lichess Explorer · chess.com API 는 브라우저에서 직접 호출하며 CORS 를 허용합니다.

## 백엔드(Supabase) 연동 — 다기기 로그인 + 공유 개발자 콘텐츠

미설정 시 브라우저 localStorage로 동작합니다(기기별 저장, 공유 안 됨). 아래를 설정하면 계정·진도가 다기기에서 동기화되고, 개발자/공동개발자 콘텐츠가 모든 방문자에게 공유됩니다.

1. supabase.com 에서 프로젝트 생성
2. 대시보드 → SQL Editor → `supabase-setup.sql` 내용을 붙여넣고 RUN
3. Project Settings → API 에서 **Project URL** 과 **anon public key** 복사
4. 로컬: `.env.example` 를 `.env` 로 복사해 두 값을 채움 → `npm run dev`
5. 배포:
   - Vercel: Project → Settings → Environment Variables 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 추가 후 재배포
   - GitHub Pages: 저장소 Settings → Secrets and variables → Actions 에 같은 이름의 Secret 2개 추가(워크플로가 빌드시 주입)

`supabase-setup.sql`은 예전엔 차수(16차/17차/18차/20차)별로 나뉘어 있었지만, 지금은 **테이블·함수·정책 전체를 한 파일로 통합**했습니다. 새 프로젝트든 기존 프로젝트를 밀고 새로 만들든 이 파일 하나만 SQL Editor에 붙여넣고 RUN 하면 됩니다(파일 맨 위 주석에 전체 초기화용 `drop` 블록도 있습니다 — 필요할 때만 주석 해제).

설계: 회원가입·로그인은 Supabase Auth(GoTrue, `/auth/v1/signup`·`/auth/v1/token`)를 직접 호출합니다 — 비밀번호는 Supabase가 서버 측에서 안전하게 해시·저장하며, 클라이언트/DB 어디에도 평문이나 자체 해시가 노출되지 않습니다. 이메일·비밀번호 가입 시 `auth.users` insert와 같은 트랜잭션에서 트리거가 `profiles` 행을 원자적으로 만들고(아이디 중복이면 가입 자체가 롤백됨), Google OAuth 가입은 최초 로그인 후 `claim_username()` RPC로 아이디를 확정합니다. 로그인 성공 시 발급되는 access token(`auth.uid()`)이 이후 모든 요청의 신원 증명이 되고, `user_progress`/`chat_messages`/`notifications`/`friend_edges`처럼 사용자별로 보호돼야 하는 테이블은 전부 `auth.uid()` 기반 RLS 정책으로 서버에서 강제됩니다. 친구 요청/수락/삭제도 테이블을 직접 건드리지 못하게 막고 `friend_request`/`friend_accept`/`friend_remove` RPC로만 가능하게 했습니다. 공유 콘텐츠(`app_content`)는 모든 방문자가 읽되, 쓰기는 `is_content_editor(auth.uid())`가 개발자(`openchesskr`)·공동개발자 계정인지 확인해야만 허용합니다.

로컬에 Postgres가 있다면(`sudo pg_ctlcluster <ver> main start` 등) `auth` 스키마를 최소 스텁으로 만들어 이 파일 전체를 실제로 실행·검증해볼 수 있습니다 — 이번에 그렇게 문법·트리거·RLS 동작(가입, 아이디 중복, 맞친구 자동수락, 타인 진행상황 접근 차단, 퍼즐 풀이수 증가, 도용 방지 등)을 전부 실제 쿼리로 확인했습니다. 보안 헤더(CSP 등)는 `vercel.json`을 참고하세요 — CSP는 우선 Report-Only로 넣어 두었으니, 배포 후 브라우저 콘솔에서 위반 항목이 없는지 확인한 뒤 `Content-Security-Policy`로 바꿔 실제로 적용하세요.
