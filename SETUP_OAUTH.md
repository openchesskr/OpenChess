# Apple / Facebook 로그인 설정 가이드

이 문서는 OpenChess에 **Apple 로그인**과 **Facebook 로그인**을 실제로 켜기 위해, Supabase
대시보드 바깥에서 사람이 직접 해야 하는 절차를 정리합니다. 코드(`src/App.jsx`, `supabase-setup.sql`)는
이미 준비되어 있고 provider 이름만 다를 뿐 Google 로그인과 완전히 같은 방식(Supabase Auth의
OAuth 리다이렉트)으로 동작하므로, **여기 정리된 대시보드 설정만 마치면 추가 배포 없이 바로 켜집니다.**

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

Supabase 대시보드 → **Authentication → Providers → Apple** → 켜기(Enable) → 위 4가지 값을
붙여넣고 저장합니다. (Supabase가 이 4가지로 매번 새 client secret을 자동으로 서명해 만들어주므로,
Apple처럼 client secret이 6개월마다 만료되는 방식이어도 따로 갱신할 필요가 없습니다.)

---

## 2) Facebook

1. https://developers.facebook.com/apps 접속 → **앱 만들기(Create App)** → 유형은
   "소비자(Consumer)" 또는 "기타(Other)" 선택 → 이름 입력(예: OpenChess) → 만들기.
2. 만들어진 앱 대시보드에서 **Facebook 로그인(Facebook Login)** 제품을 "설정(Set Up)"으로
   추가합니다. 플랫폼은 **웹(Web)**을 선택하고, Site URL에 여러분의 사이트 주소(예:
   `https://openchess.kr`)를 입력합니다.
3. 좌측 메뉴 **Facebook 로그인 → 설정(Settings)**에서 **유효한 OAuth 리디렉션 URI(Valid OAuth
   Redirect URIs)**에 위 0)의 콜백 URL을 추가하고 저장합니다.
4. 좌측 메뉴 **설정(Settings) → 기본 설정(Basic)**에서 **앱 ID(App ID)**와 **앱 시크릿 코드(App
   Secret)**를 확인합니다("표시(Show)"를 누르면 비밀번호 확인 후 보입니다). 이 화면에서 **개인정보
   처리방침 URL**, **앱 도메인**도 채워야 다음 단계(앱 검수)가 가능합니다.
5. 앱을 만들면 기본적으로 "개발 모드"라 여러분(앱 관리자로 등록된 Facebook 계정)만 로그인을 테스트할
   수 있습니다. **실제 사용자에게 열려면** 상단의 모드 스위치를 "라이브(Live)"로 바꿔야 하고, 이때
   Facebook이 **앱 검수(App Review)** — `email`, `public_profile` 권한 사용 승인 — 를 요구할 수
   있습니다(대개 이 두 권한은 기본으로 승인되어 있어 추가 검수 없이 라이브 전환만으로 충분한 경우가
   많습니다만, 반려되면 화면 녹화 등 사용 사례 증빙을 요구할 수 있습니다).

### Supabase에 입력

Supabase 대시보드 → **Authentication → Providers → Facebook** → 켜기(Enable) → 위에서 확인한
**App ID**를 Client ID에, **App Secret**을 Client Secret에 입력하고 저장합니다.

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
- [ ] Supabase Authentication → Providers에서 Apple을 켜고 Services ID/Team ID/Key ID/.p8 키를 입력했다.
- [ ] Supabase Authentication → Providers에서 Facebook을 켜고 App ID/App Secret을 입력했다.
- [ ] Facebook 앱을 "라이브" 모드로 전환했다(실제 사용자가 쓸 수 있도록).
- [ ] Authentication → Settings에서 "Allow manual linking"을 켰다(계정 센터의 연결/해제 기능용).
- [ ] (권장) "Allow automatic linking"도 켰다.
- [ ] `supabase-setup.sql`을 SQL Editor에서 다시 실행해 `delete_own_account()`를 반영했다.
- [ ] 배포 후 실제로 Apple/Facebook 버튼으로 로그인 → 계정 센터에서 다른 수단 연결 → 연결 해제 →
      계정 탈퇴까지 한 번씩 직접 눌러 확인했다(이 환경은 실제 Supabase 접속 정보가 없어 여기서는
      코드만 준비했고 실제 동작 확인은 배포 환경에서 필요합니다).
