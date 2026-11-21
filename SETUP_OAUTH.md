# Apple / Facebook 로그인 설정 가이드

이 문서는 OpenChess에 **Apple 로그인**과 **Facebook 로그인**을 실제로 켜기 위해, Supabase
대시보드 바깥에서 사람이 직접 해야 하는 절차를 정리합니다. 코드(`src/App.jsx`, `supabase-setup.sql`)는
이미 준비되어 있고 provider 이름만 다를 뿐 Google 로그인과 완전히 같은 방식(Supabase Auth의
OAuth 리다이렉트)으로 동작하므로, **여기 정리된 대시보드 설정만 마치면 추가 배포 없이 바로 켜집니다.** (v0.7.9부터 로그인 창은 Supabase에 켜진 제공자의 버튼만 보여 주므로, 켜기 전에는 버튼이 숨겨져 있다가 켜는 순간 나타납니다.)

작업 순서는 항상 같습니다: ① 각 회사의 개발자 콘솔에서 "이 앱이 Supabase Auth를 통해 로그인해도
된다"는 자격증명(Client ID/Secret)을 만든다 → ② Supabase 대시보드 **Authentication → Providers**에
그 값을 입력하고 켠다.

---

## 0) 미리 알아둘 것 — 콜백 URL

Apple/Facebook 둘 다 "로그인 성공 후 되돌아올 주소"를 미리 등록해야 합니다. OpenChess는 Supabase
Auth(GoTrue)를 직접 쓰므로, 이 주소는 **여러분의 사이트 주소가 아니라 Supabase 프로젝트 주소**입니다.

```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

`<your-project-ref>`는 Supabase 대시보드 좌측 상단 프로젝트 설정이나, `.env`의
`VITE_SUPABASE_URL`(`https://xxxxxxxx.supabase.co`)에서 확인할 수 있습니다. 이 URL을 아래 두
회사 콘솔 모두에 **정확히 그대로** 등록해야 합니다(마지막 슬래시, 대소문자까지 동일해야 함).

---

## 1) Apple ("Sign in with Apple")

Apple 로그인은 **유료 Apple Developer Program 멤버십(연 $99)** 이 있어야 설정할 수 있습니다.

1. https://developer.apple.com 접속 → **Certificates, Identifiers & Profiles**로 이동합니다.
2. **Identifiers → App IDs**에서 앱용 App ID가 없다면 하나 만들고(웹만 쓸 거라도 필요), Capabilities
   목록에서 **Sign In with Apple**을 체크합니다.
3. **Identifiers → Services IDs**에서 "+"를 눌러 새 Services ID를 만듭니다. 이 Identifier
   (`kr.openchess.web` 같은 형식 문자열)가 나중에 Supabase에 입력할 **Client ID**입니다.
   - 만들 때 **Sign In with Apple**을 체크하고 "Configure"를 눌러:
     - Primary App ID: 위 2번에서 만든 App ID 선택
     - Domains: 여러분의 사이트 도메인(예: `openchess.kr`)
     - Return URLs: 위 0)의 콜백 URL(`https://<project-ref>.supabase.co/auth/v1/callback`)
4. **Keys**에서 "+"를 눌러 새 키를 만들고 **Sign In with Apple**을 체크, 위 2번 App ID와
   연결합니다. 생성 후 `.p8` 키 파일을 다운로드합니다(**한 번만 다운로드할 수 있으니 잘 보관**).
   이 키의 **Key ID**도 함께 기록해 둡니다.
5. 화면 어딘가에 표시되는 **Team ID**(Apple Developer 계정 우측 상단, 10자리)도 기록해 둡니다.
6. 정리하면 Supabase에 넣을 값 4가지: **Services ID(Client ID)**, **Team ID**, **Key ID**,
   **.p8 키 파일 내용(Secret Key)**.

### Supabase에 입력

Supabase 대시보드 → **Authentication → Providers(또는 Sign In / Providers) → Apple** → 켜기(Enable).

- **Client IDs**: 위 3번의 Services ID(예: `kr.openchess.web`). 0.9.0에 iOS 앱을 붙이면 앱 번들 ID(`kr.openchess.app`)를 쉼표로 덧붙인다.
- **Secret Key (for OAuth)**: Team ID·Key ID·Services ID·`.p8` 내용으로 **서명한 JWT 문자열**이다. `.p8` 파일 내용을 그대로 넣는 칸이 아니다.
  Supabase 문서(Login with Apple)에 이 JWT를 만들어 주는 도구가 있다(브라우저 안에서 서명하며, `.p8`은 서버로 보내지 않는다).
  - **(v0.7.9 정정)** 예전 이 문서에는 "Supabase가 4가지 값으로 자동 서명하니 갱신이 필요 없다"고 적혀 있었지만, 대시보드에 JWT를 넣는 방식이면
    **Apple 규칙상 최대 6개월 뒤 만료**된다. 만료되면 Apple 로그인만 조용히 실패하므로, 만든 날짜 기준 **5개월 뒤로 달력 알림**을 걸어 두고
    같은 도구로 새 JWT를 만들어 바꿔 넣는다(`.p8`·Key ID는 그대로 재사용). 대시보드 칸 이름이 위와 다르면 화면의 안내를 우선한다.

**Apple 로그인에서 알아둘 것**
- 사용자 이름은 **처음 로그인할 때 한 번만** 넘어온다. OpenChess는 첫 로그인 때 아이디 설정 창(UsernameSetupModal)을 따로 띄우므로 영향은 없다.
- 사용자가 "이메일 가리기"를 고르면 `xxxx@privaterelay.appleid.com` 주소가 넘어온다. 이 주소로 우리가 메일을 보내려면 Apple 개발자 페이지
  **Services → Sign in with Apple for Email Communication**에 보내는 도메인을 등록해야 한다(지금 OpenChess는 로그인 외의 메일을 보내지 않아 당장은 불필요).
- 같은 사람이 이메일 가리기로 들어오면 기존 이메일 계정과 주소가 달라 자동 연결(아래 3번)이 되지 않는다. 계정 센터의 "연결하기"로 합치게 안내한다.

---

## 2) Facebook

Facebook 로그인은 무료다. Meta 개발자 계정(본인 Facebook 계정으로 https://developers.facebook.com 가입)만 있으면 된다.
**(v0.7.9 정정)** Meta가 앱 만들기 화면을 "앱 유형" 대신 "사용 사례(Use case)" 방식으로 바꿔, 메뉴 이름이 예전 문서와 다르다. 화면 이름이 조금 달라도 순서는 같다.

1. https://developers.facebook.com/apps → **앱 만들기(Create App)** → 사용 사례에서
   **"Facebook 로그인으로 사용자 인증 및 데이터 요청(Authenticate and request data from users with Facebook Login)"** 선택 → 앱 이름(OpenChess)·연락처 이메일 입력 → 만들기.
   비즈니스 포트폴리오 연결은 "지금은 연결 안 함"으로 넘어가도 된다.
2. 앱 대시보드 → **사용 사례(Use cases) → Facebook 로그인 → 맞춤 설정(Customize)**:
   - **권한(Permissions)**에서 `email`이 "추가됨(Added)"인지 확인하고, 아니면 **추가**한다. `public_profile`은 기본으로 들어 있다.
     (`email`이 없으면 로그인은 되지만 이메일이 비어 와서, 이미 이메일로 가입한 계정과 자동 연결이 안 된다.)
   - **설정(Settings)** → **유효한 OAuth 리디렉션 URI(Valid OAuth Redirect URIs)**에 0)의 콜백 URL
     (`https://<project-ref>.supabase.co/auth/v1/callback`)을 넣고 저장. "클라이언트 OAuth 로그인"·"웹 OAuth 로그인"은 켜짐(기본값).
3. **앱 설정(App settings) → 기본 설정(Basic)**:
   - **앱 ID**·**앱 시크릿 코드**(표시 버튼 → 비밀번호 확인) — Supabase에 넣을 값.
   - **개인정보처리방침 URL**: `https://openchess.kr/privacy`
   - **서비스 약관 URL**: `https://openchess.kr/terms`
   - **사용자 데이터 삭제**: "데이터 삭제 안내 URL" 선택 → `https://openchess.kr/account-deletion`
   - **앱 아이콘**(1024×1024)·**카테고리**(게임 또는 교육)·**앱 도메인**(`openchess.kr`)
   - 맨 아래 **플랫폼 추가 → 웹사이트** → 사이트 URL `https://openchess.kr/`
4. **게시(Publish)**: 개발 모드에서는 앱 관리자·테스터로 등록된 계정만 로그인된다. 3번 항목을 다 채우면 대시보드의 **게시(Publish)**(또는 앱 모드 "라이브")로
   전환한다. `email`·`public_profile`은 기본 권한(Standard Access)이라 보통 **앱 검수 없이** 게시만으로 모든 사용자가 쓸 수 있다. 화면이 검수·비즈니스 인증을 요구하면 그 안내를 따른다.

### Supabase에 입력

Supabase 대시보드 → **Authentication → Providers → Facebook** → 켜기(Enable) → **Client ID = 앱 ID**, **Client Secret = 앱 시크릿 코드** → 저장.

---

## 3) 계정 센터의 "다른 로그인 수단 연결하기"가 되려면 — Manual Linking

OpenChess 계정 센터(로그인 후 우측 상단 프로필 메뉴 → **계정 센터**, 또는 설정 탭 → 계정 센터)에서
로그인된 상태로 Google/Apple/Facebook을 추가로 연결하거나 해제할 수 있습니다. 이 기능은 Supabase
Auth의 "Manual Linking"이 켜져 있어야 동작합니다.

Supabase 대시보드 → **Authentication → Settings**(또는 최신 UI 기준 **Authentication → Sign In / Providers**
하단) → **"Allow manual linking"**(계정 하나에 여러 identity를 수동으로 연결하도록 허용) 옵션을
켭니다. 이 옵션이 꺼져 있으면 계정 센터에서 "연결하기"를 눌렀을 때 오류가 납니다.

추가로, **"Allow automatic linking"**(같은 이메일로 다른 방식 가입 시 자동으로 같은 계정으로
합쳐줌)도 켜두는 것을 권장합니다 — 이걸 켜두면, 이미 이메일로 가입한 사용자가 나중에 같은 이메일의
Google/Apple/Facebook으로 로그인을 시도해도 새 계정이 아니라 원래 계정으로 자동 연결됩니다(계정
센터에서 미리 연결해두지 않아도 됨). 다만 이 옵션은 각 제공자가 이메일을 **인증된(verified) 상태로
넘겨줄 때만** 안전하게 동작합니다 — Google/Apple/Facebook은 기본적으로 인증된 이메일만 넘기므로
문제없습니다.

---

## 4) 계정 탈퇴 — 별도 설정 필요 없음

계정 탈퇴(계정 센터 → 계정 탈퇴)는 `supabase-setup.sql`의 `delete_own_account()` 함수가 처리합니다.
`supabase-setup.sql`을 SQL Editor에서 다시 실행하면 이 함수가 만들어지며, 별도의 대시보드 설정은
필요 없습니다. `auth.users`에서 본인 행을 지우면 프로필·퍼즐·친구·채팅 등 이 프로젝트의 모든
사용자 데이터가 외래키 `on delete cascade`를 통해 함께 정리됩니다(되돌릴 수 없습니다).

---

## 5) 체크리스트

- [ ] Supabase 콜백 URL(`https://<project-ref>.supabase.co/auth/v1/callback`)을 Apple Services ID의
      Return URLs와 Facebook의 Valid OAuth Redirect URIs 양쪽에 등록했다.
- [ ] Supabase Authentication → Providers에서 Apple을 켜고 Client IDs(Services ID)와 Secret Key(서명한 JWT)를 입력했다.
- [ ] Apple Secret Key 만료 대비 달력 알림(만든 날 + 5개월)을 걸었다.
- [ ] Supabase Authentication → Providers에서 Facebook을 켜고 App ID/App Secret을 입력했다.
- [ ] Facebook 사용 사례 권한에 `email`이 추가돼 있고, 개인정보처리방침·약관·데이터 삭제 URL을 채운 뒤 앱을 게시(라이브)했다.
- [ ] (v0.7.9) 로그인 창에 Apple·Facebook 버튼이 나타나는지 확인했다 — 버튼은 Supabase에서 켜진 제공자만 보인다(`src/lib/authProviders.js`, BUG-193).
- [ ] Authentication → Settings에서 "Allow manual linking"을 켰다(계정 센터의 연결/해제 기능용).
- [ ] (권장) "Allow automatic linking"도 켰다.
- [ ] `supabase-setup.sql`을 SQL Editor에서 다시 실행해 `delete_own_account()`를 반영했다.
- [ ] 배포 후 실제로 Apple/Facebook 버튼으로 로그인 → 계정 센터에서 다른 수단 연결 → 연결 해제 →
      계정 탈퇴까지 한 번씩 직접 눌러 확인했다(이 환경은 실제 Supabase 접속 정보가 없어 여기서는
      코드만 준비했고 실제 동작 확인은 배포 환경에서 필요합니다).

---

## 앱(Capacitor) 로그인·앱 링크·엔진 내려받기 설정 (v0.6.3, 앱 출시 준비 3단계)

코드는 준비돼 있고(`src/lib/nativeApp.js`·`engineDownload.js`), 래퍼를 붙이는 0.9.0에서 아래 값만 채우면 된다. 앱 식별자(번들 ID·패키지명)는 `kr.openchess.app`로 정했다 — 바꾸려면 `nativeApp.js`의 `APP_SCHEME`, 두 앱 링크 파일, `check-app-links` 기대값을 함께 바꾼다.

**시스템 브라우저 로그인**
- 앱에서 로그인 버튼을 누르면 시스템 브라우저(Android Custom Tabs·iOS SFSafariViewController)로 열리고, 끝나면 `kr.openchess.app://auth/callback#access_token=…`으로 앱에 돌아온다(구글이 웹뷰 로그인을 막기 때문).
- [ ] Supabase → Authentication → URL Configuration → Redirect URLs에 `kr.openchess.app://**` 추가. (웹은 기존 주소 그대로)
- [ ] 래퍼에 `@capacitor/app`·`@capacitor/browser` 설치. iOS는 URL Types에 스킴 `kr.openchess.app`, Android는 intent-filter(scheme `kr.openchess.app`) 등록.
- Apple 로그인은 Google 등 외부 로그인과 함께 제공해야 심사를 통과한다(위 1번 항목).

**앱 링크(https://openchess.kr/… 링크를 앱에서 열기)** — 파일은 `public/.well-known/`에 있고 배포 시 그대로 서빙된다(`vercel.json`이 `.well-known`을 index.html 재작성에서 제외하고 `application/json`으로 내려준다).
- [ ] `apple-app-site-association`의 `TEAMID`를 Apple 개발자 팀 ID(10자리)로 교체. iOS는 Associated Domains에 `applinks:openchess.kr` 추가.
- [ ] `assetlinks.json`의 `REPLACE_WITH_RELEASE_KEY_SHA256`을 릴리스 서명 키의 SHA-256 지문으로 교체(Play 앱 서명을 쓰면 Play Console의 "앱 서명" 지문). Android는 intent-filter에 `autoVerify="true"`, host `openchess.kr`.
- 두 파일의 자리표시자는 `npm run check:app-links`가 경고로 알려 준다(빌드를 막진 않음 — 출시 전에 반드시 교체).

**엔진 내려받기**
- `npm run build:app`이 `dist/engine/17`·`18`을 빼서 앱 번들에 Lite만 남긴다(약 154MB, Google Play 기본 한도 200MB). Stockfish 17.1(75MB)·18(108MB)은 설정 탭에서 고를 때 `https://openchess.kr/engine/…`(웹 배포본, CORS 허용 헤더 있음)에서 받아 기기 저장소(`Directory.Data/engine/`)에 둔다.
- [ ] 래퍼에 `@capacitor/filesystem` 설치. 빌드 환경변수 `VITE_API_BASE=https://openchess.kr`(API 주소)도 지정.
- 웹 배포본의 `engine/manifest.json`(`copy-engine` 스크립트가 빌드마다 생성)이 내려받을 파일 목록·크기다. 크기가 다르면 내려받기가 실패 처리된다.
- [ ] 실기기 확인 필요: 내려받은 파일 주소(`convertFileSrc`)로 Worker가 뜨는지, 엔진이 연결되는지(iOS·Android 각각).
