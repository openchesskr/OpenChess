# 리팩터링 노트 (오류 발생 시 디버깅 경로)

App.jsx(원래 ~28,392줄)를 기능별 순수 모듈로 점진적으로 분리하는 작업의 디버깅 인덱스.
각 모듈 추출은 이름 변경 없이 통째로 옮기고 같은 이름으로 다시 import하는 방식(behavior change 없음)이며,
여기서는 "나중에 버그가 나면 어디부터 봐야 하는지"만 짧게 적는다.

## Phase 1

이 노트가 생기기 전(Phase 1)에 커밋된 4개 모듈. git log 기준 커밋: `6ec3694`, `6cc119b`, `265c9fe`, `43a9601`.

### src/lib/theme.js (commit 6ec3694)
- 이동: T, FILES, MOTION_EASE, BOARD_GLOSS, DRAG_SCROLL_MULT, 기물 지오메트리 상수, BOARD_SKINS,
  PIECE_SKINS, boardSquareBg, pieceShadow, TIER_IMAGE/TIER_BG_IMAGE, tierPieceSrc, TIER_IMG_NATIVE_H,
  TIER_DECAGON_PTS — 전부 순수 상수/데이터 + 순수 함수.
- 남겨둔 것: PieceGlyph/TierPieceGlyph/TierLogoDisc/GeoBackdrop/FadeIn 등 이 데이터를 쓰는 JSX 컴포넌트는
  App.jsx에 그대로 둠(순수 데이터만 분리).
- 위험도: 낮음. 값이 변형 없이 그대로 옮겨졌으므로 이 파일 자체가 원인이 될 가능성은 낮다.
- 증상이 보이면: 보드/기물 스킨이 깨지거나 티어 이미지가 안 뜨면 src/lib/theme.js의 값이 App.jsx가
  기대하는 것과 이름이 같은지, import 목록이 실제 사용처와 어긋나지 않는지 확인.

### src/lib/prefs.js (commit 6cc119b)
- 이동: 리뷰 속도/변동성 보정 프리퍼런스, BGM/SFX on-off+볼륨 프리퍼런스, 마지막 대국 퀄리티 캐시,
  SFX_SRC/playSfx/playMoveSfx.
- 남겨둔 것: loadEnginePref 등 엔진 프리퍼런스 — ANALYSIS_ENGINE_IDS에 의존해 옮기면 순환 참조가
  생기므로 App.jsx에 남김.
- 위험도: 낮음. 전부 localStorage 기반 순수 함수, 모듈 간 공유 mutable state 없음.
- 증상이 보이면: BGM/SFX 설정이 저장되지 않거나 리뷰 속도/변동성 토글이 반영되지 않으면
  src/lib/prefs.js의 localStorage 키 이름(occ_bgm_on 등)이 실제 읽기/쓰기 지점과 일치하는지 확인.

### src/lib/chessRules.js (commit 265c9fe)
- 이동: SAN/FEN/UCI 변환, 합법수 계산, 체크/체크메이트/무승부 판정, 수순 번호 헬퍼 등 순수 체스 엔진 전체.
- 남겨둔 것: useEngine, genPunishLine, downscaleImageFile, scanImageFile, snapNode/overlayAt — React
  state/웹워커/SNAP·OVERLAY 트리 데이터에 얽혀 있어 App.jsx에 남김.
- 위험도: 중간(양 자체는 낮지만 사용 범위가 매우 넓음 — App.jsx 거의 전역에서 이 엔진 함수들을 씀).
  다만 값/시그니처 변경 없이 그대로 옮겨졌으므로 이름 매칭 문제만 조심하면 됨.
- 증상이 보이면: 기물 이동 판정, 체크/스테일메이트 판정, SAN↔FEN 변환 관련 버그는 우선
  src/lib/chessRules.js를 확인. App.jsx에서 이 함수들을 그림자(shadow)로 재정의한 곳이 없는지도 grep.

### src/lib/pgn.js (commit 43a9601)
- 이동: PGN 파싱/포매팅 순수 헬퍼(pgnResultToken, autoResultFromPgn, pgnHeaderTag, splitPgnGames,
  parsePgnGameForImport, parsePgnMoves, parsePgnSans, sansToPgnText, sanSequenceValid).
- 남겨둔 것: addDevMasterGame/addDevMasterGamesBulk/fetchMasterGamePgn 등 Supabase에 쓰는 헬퍼는
  네트워크/DB 부수효과가 있어 App.jsx에 남김.
- 위험도: 낮음. chessRules.js에 의존하지만 단방향(pgn.js → chessRules.js)이라 순환 없음.
- 증상이 보이면: PGN 대량 가져오기/기보 텍스트 표시/자동 결과 판정이 이상하면 src/lib/pgn.js 확인.

## Phase 2

### src/lib/supabaseClient.js
- 이동: SB_URL, SB_KEY, SB_ON, `let` → `export let SB_TOKEN`(모듈 단일 mutable 변수), sbHeaders,
  sbClient(Realtime용 supabase-js 클라이언트), setSbToken, sbRpc/sbSelect/sbInsert/sbPatch/sbUpsert/sbDelete,
  pvpFinishVerified(/api/pvp-finish 호출).
- 남겨둔 것(의도적): `useRealtimeTable`(React 훅, useRef/useEffect 사용)과 `rtChanSeq`는 App.jsx에 그대로
  둠 — 지침대로 순수 훅으로 완전히 확신이 서지 않는 한 옮기지 않기로 함. 대신 App.jsx의
  useRealtimeTable은 이 파일에서 import한 `sbClient`를 그대로 사용하도록 배선만 바꿈.
- **위험도 높음 — 진짜 조심해야 할 지점**: `SB_TOKEN`은 원래 App.jsx 안의 `let SB_TOKEN = null` 모듈
  단일 변수였고, 로그인/로그아웃/토큰 갱신 전 지점에서 `setSbToken()`을 통해서만 대입되고 있었다
  (직접 대입하는 곳이 코드베이스에 없음을 grep으로 확인함). 이걸 `export let SB_TOKEN`으로 그대로
  내보내 App.jsx에서 `import { SB_TOKEN } from "./lib/supabaseClient.js"`로 읽는 구조로 바꿨다.
  ES 모듈의 named export는 live binding이라 supabaseClient.js 내부에서 setSbToken()이 재대입하면
  App.jsx 쪽 import도 즉시 최신 값을 본다 — 이론적으로는 문제없지만, "값이 마치 안 바뀌는 것처럼
  보인다"는 버그가 나오면 제일 먼저 의심할 지점이다.
  - **어디를 볼지**: src/lib/supabaseClient.js의 `export let SB_TOKEN` 선언과 `setSbToken()`.
  - **어떤 증상이면 여기**: 로그인 후에도 인증이 필요한 Supabase 호출(sbHeaders가 Authorization
    헤더에 넣는 값)이 계속 로그아웃 상태처럼 동작하거나, PvP 결과 보고(pvpFinishVerified)가
    "세션 없음"으로 실패하는 경우. 또는 App.jsx 어딘가에 `SB_TOKEN = ...` 직접 대입이 새로 생겨
    live binding을 깨뜨렸는지(모듈 밖에서 import된 바인딩에 직접 대입은 사실 문법 에러로
    빌드 시점에 걸리긴 하지만, 새로 `let SB_TOKEN`을 App.jsx에 재선언해 그림자 변수를 만들었는지)
    확인.
- **환경 의존 값**: SB_URL/SB_KEY는 `import.meta.env.VITE_SUPABASE_*`에서 읽는다(Vite 환경변수) —
  이 값의 유무에 따라 SB_ON이 갈리고, 이 모듈의 sbClient도 null이 될 수 있다. 이 부분은 옮기기 전과
  완전히 동일한 표현식이라 새 위험은 아니지만, 혹시 "로컬 개발에서는 되는데 배포本에서는 DB 기능이
  전부 꺼진다" 같은 증상이면 여기(.env / 호스팅 환경변수 설정)를 먼저 볼 것.
- **import 순서**: supabaseClient.js는 `@supabase/supabase-js`의 `createClient`만 의존하고 다른
  src/lib 모듈에 의존하지 않는다(단방향, 순환 없음). App.jsx는 이 모듈에서 SB_TOKEN을 포함해 13개
  이름을 import한다 — 이 목록이 실제 sb* 호출부(100곳 이상, grep "sbRpc(\|sbSelect(\|sbInsert(\|
  sbPatch(\|sbUpsert(\|sbDelete(\|SB_ON\|SB_TOKEN\|sbHeaders(\|sbClient\." 로 확인 가능)를 전부
  커버하는지 추출 시점에 grep으로 대조 완료.
- 신뢰도: 100% 확신은 아니고 ~95% — live binding으로 export된 `let` 변수라는 점이 이 리팩터링
  전체에서 유일하게 "패턴이 새로운" 부분이라 표시해둔다. 빌드는 통과했고(`npm run build`), 런타임
  동작(로그인 → sbHeaders에 최신 토큰이 실리는지)은 실제 로그인 플로우로 별도 수동 확인이 필요할 수 있음.
