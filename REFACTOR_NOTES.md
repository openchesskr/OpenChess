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

### src/lib/lichessApi.js
- 이동: LICHESS_API, WIKI_API, `lichessFetchWithRetry`(+ 그 안에서만 쓰던 모듈 비공개 `_sleep` 헬퍼),
  `lichessSinceParam`, `LICHESS_STATS_WINDOW_MONTHS`, `MASTER_DATA_BASE`, `loadMasterGameData`
  (+ 그 비공개 캐시 변수 `masterGameData`/`masterGameLoadPromise`), `staticMasterGamesFor`.
- 남겨둔 것(의도적): `_lichessCache`(Map), `lichessFetchJson`/`lichessFetchText`,
  `fetchLichess`/`fetchMasterTopGames`/`fetchDevMasterGames`/`fetchAllMasterGames` 등은 지침에 명시된
  이동 대상이 아니라서 App.jsx에 그대로 두고, `lichessFetchWithRetry`만 새 모듈에서 import해서 쓰도록
  배선만 바꿨다. `fetchDevMasterGames`는 supabaseClient.js의 `SB_ON`/`sbSelect`를 그대로 쓴다(순환 아님 —
  App.jsx → supabaseClient.js, App.jsx → lichessApi.js 둘 다 단방향).
- **위험도 높음 — 진짜 조심해야 할 지점**: `_lichessCooldownUntil`은 "여러 개의 동시 리체스 요청이
  429(레이트리밋)를 공유해서 인지"하도록 만든 모듈 전역 단일(singleton) mutable 변수다. 지침대로
  export하지 않고 `src/lib/lichessApi.js` 안에서만 선언·갱신되게 두었다 — 이 변수가 두 곳에 따로
  생기면(예: 나중에 실수로 이 파일을 복사해 비슷한 함수를 또 만들거나, App.jsx에 같은 이름의 변수를
  다시 선언하면) 쿨다운이 반씩 나뉘어 429 폭주 방지 로직이 무력화된다.
  - **어디를 볼지**: src/lib/lichessApi.js의 `let _lichessCooldownUntil = 0`과 `lichessFetchWithRetry`.
  - **어떤 증상이면 여기**: 리체스 API 호출이 공유 429 쿨다운을 더 이상 지키지 않는 것처럼 보이거나
    (한쪽에서 429를 맞았는데 다른 동시 호출들이 기다리지 않고 계속 요청을 쏨), 콘솔에 리체스 429
    에러가 다시 몰아치는 패턴이 보이면 이 파일에 `_lichessCooldownUntil`이 정확히 한 군데에만
    선언돼 있는지, App.jsx나 다른 파일에서 같은 이름을 재선언하지 않았는지 확인.
- `masterGameData`/`masterGameLoadPromise`도 마찬가지로 "정적 마스터 대국 JSON을 최초 1회만 fetch"를
  보장하는 모듈 단일 캐시 — `loadMasterGameData` 밖에서 재선언되면 마스터 게임 데이터를 여러 번
  중복 fetch하게 된다(기능은 깨지지 않지만 불필요한 네트워크 요청 증가). 증상: 마스터 대국 목록이
  느리게 뜨거나 네트워크 탭에 master-games.json 요청이 여러 번 찍히면 이 지점 확인.
- 환경 의존 값: `MASTER_DATA_BASE`는 `import.meta.env.BASE_URL`(Vite 빌드 base 경로)에서 읽는다 —
  옮기기 전과 동일한 표현식. 배포 base 경로가 바뀌었는데 마스터 대국 JSON을 못 찾는 증상이면 이
  값과 실제 배포 base 설정(vite.config)을 대조.
- import 순서: lichessApi.js는 다른 src/lib 모듈에 의존하지 않는다(순수, 외부 fetch만 사용) — 순환 없음.

### src/lib/chesscom.js
- 이동: `chesscomChangeDaysLeft`(+ 비공개 `CHESSCOM_CHANGE_COOLDOWN_MS`), `chesscomDisplayUsername`,
  `countryFlag`, `OPENING_NAME_TERMINATORS`(+ 비공개 `OPENING_NAME_EPONYMS`), `segmentOpeningWords`,
  `ecoOpeningName`, `computeRatingChanges`, `CHESSCOM_CACHE_VERSION`, `chesscomCacheKey`,
  `loadChesscomCache`, `saveChesscomCache`, `extractChesscomGameId` — 전부 순수 함수/상수.
- 남겨둔 것(의도적): `fetchChesscomProfile`(네트워크 fetch, 지침 대상 아님)과 `useChessCom`(React
  훅, 무거운 state/effect)은 App.jsx에 그대로 두고 이 새 모듈의 `chesscomDisplayUsername`,
  `ecoOpeningName`, `loadChesscomCache`, `saveChesscomCache`, `extractChesscomGameId` 등을 import해서
  쓰도록 배선만 바꿨다.
- 위험도: 낮음. 전부 순수 함수 + localStorage 읽기/쓰기(캐시)뿐, 공유 mutable 싱글턴 없음. 유일하게
  주의할 값은 `CHESSCOM_CACHE_VERSION`(현재 3) — localStorage 캐시 키에 박히는 값이라, 나중에 캐시
  스키마를 또 바꿀 때 이 상수를 올리는 걸 잊으면(신규든 기존이든) 옛 스키마 캐시를 새 스키마로
  오인해서 읽는 버그가 날 수 있다(이건 새로 생긴 위험이 아니라 원래도 있던 규칙 — 옮기면서 값·주석
  그대로 유지).
- 증상이 보이면: chess.com 대국 캐시가 이상하게 비거나(옛 스키마 오인) 오프닝 이름 표기가
  깨지면(ecoOpeningName/segmentOpeningWords) src/lib/chesscom.js 확인. 대국 목록 자체가 안 뜨면
  useChessCom(App.jsx에 남아 있음) 쪽을 먼저 볼 것 — 이 파일은 순수 변환 로직만 담당한다.
- import 순서: chesscom.js는 다른 src/lib 모듈에 의존하지 않는다 — 순환 없음.

### src/lib/moveQuality.js
- 이동: `materialDiff`(+ `PIECE_VAL_MAT`), `isDevelopingMove`(+ `MINOR_HOME_SQUARES`), `VAL`,
  `enemyMinAttacker`, `ownDefenders`, `lva`, `seeSquare`, `pawnDefendsSquare`,
  `canCaptureSquareLegally`, `countLegalCapturesOnSquare`, `hangingLossSq`, `attacksPricier`,
  `attacksPricierIndependent`, `hasSaferSquare`, `attacksSquare`, `forkForcedTheOtherSide`,
  `isSacrifice`, `ownPriorMoveWasSacrifice`, `matePliesOf`, `fmtEvalCp`, `posEvalToWhite`, `tierOf`,
  `winPctFromCp`, `stdev`, `normalCdf`, `sharpLossMultiplier`, `newAccuracyFromAvgLoss`,
  `newCumulativeAccuracy`, `NEW_ACC_PENALTY_MULT`, `MUST_NOT_INCREASE_KINDS` — 전부 순수 수 체계/
  정확도 계산 로직. `chessRules.js`에서 `canMove`/`exposesKing`/`sanSrc`/`applySan`/`kingPos`/
  `isAttacked`/`plyIsWhite`/`boardOfRoot`를 import해서 쓴다(단방향, 순환 없음).
- 남겨둔 것(의도적): `SHARP_REF_MEAN`/`SHARP_REF_SD`/`NEW_ACC_DECAY`/`NEW_ACC_SHARP_LO`/
  `NEW_ACC_SHARP_HI`/`NEW_ACC_CALIB`/`NEW_ACC_HARMONIC_FLOOR`는 moveQuality.js 안에서만 쓰여
  export하지 않았다(단, `NEW_ACC_PENALTY_MULT`는 App.jsx의 다른 곳(gradeOne류 함수)에서도 쓰여
  export함 — 이 하나만 예외). `classifyMoveKindDetailed`/`classifyMoveKind`/`classifyOwnMovesFast`
  (엔진 비동기 호출 포함)와 `assignTiers`(App.jsx 전역 상태 `forceKindFor`/`isUnbooked`/`CONTENT`에
  의존)는 지침대로 순수 로직이 아니거나 앱 상태에 얽혀 있어 App.jsx에 그대로 두고, 이 모듈에서
  `tierOf`/`isSacrifice`/`ownPriorMoveWasSacrifice` 등을 import해서 쓴다.
- 위험도: 낮음~중간. 전부 순수 함수·상수라 로직 자체의 위험은 낮지만, 이 모듈의 함수들(특히
  `isSacrifice`/`tierOf`/`seeSquare`)은 App.jsx 안에서 게임 리뷰·퍼즐 채점·분석 탭·매칭 대기 화면
  장식 등 최소 4곳 이상에서 서로 다른 맥락으로 재사용된다 — 값 자체는 옮기며 전혀 바꾸지 않았지만,
  한 곳을 고치려다 이 공용 모듈을 건드리면 나머지 호출부에도 동시에 영향이 간다는 점을 기억해 둘 것
  (이건 새로 생긴 위험이 아니라 원래도 있던 "공용 함수" 구조 — 옮기면서 새로 생긴 게 아니라 이제
  한 파일에 모여 있어 더 잘 보이는 것뿐).
- 증상이 보이면: 게임 리뷰·퍼즐·분석 탭에서 "탁월한 수"/등급(best/excellent/.../blunder) 판정이나
  정확도(%) 계산이 어긋나면 src/lib/moveQuality.js를 1차로 확인. 그 등급을 실제로 화면에 붙이는
  로직(assignTiers, classifyMoveKindDetailed 등)은 여전히 App.jsx에 있으니, "이 모듈이 반환하는 값
  자체"와 "그 값을 조합해 최종 등급을 매기는 App.jsx 쪽 로직" 중 어디가 원인인지 나눠서 봐야 한다.
- import 순서: moveQuality.js → chessRules.js 단방향 의존만 있고 다른 src/lib 모듈에는 의존하지
  않는다 — 순환 없음.

## Phase 3

Phase 1-2가 훑은 범위(1~9614줄쯤)를 넘어, 그 이후(약 9614~27707줄, 대부분 ReviewPage/LearnTab/
OpeningSchematic/PuzzleSolver/SettingsTab 등 거대 JSX 컴포넌트로 채워진 구간)를 처음부터 끝까지 훑어
순수 함수·상수만 3개 더 추출했다. git log 기준 커밋: `31533a8`, `62770f4`, `c478313`.

**중요 발견 — 이번 phase 지시문이 후보로 짚었던 CONTENT/EXPLAIN/BRANCH/moveExplain 계열
(seedContent, branchFor, explainFor, tensionFacts, mecFacts 등)은 실제로는 전부 1~9614줄 안쪽
(Phase 1-2가 이미 훑은 범위)에 있었다** — grep으로 위치를 다시 확인해서 검증함. 이 phase의 "훑지 않은
나머지"라는 전제와 어긋나는 부분이라 별도로 남겨 적는다. 새로 훑은 9614~27707줄 구간은 거의 전부가
JSX 컴포넌트이고, 그 사이사이에 컴포넌트가 쓰는 순수 헬퍼/상수가 드문드문 섞여 있는 구조였다.

### src/lib/schematicGeometry.js (commit 31533a8)
- 이동: ROOT_ORDER, DIR_OF_ROOT, SCHEMATIC_BOX_W/H, SCHEMATIC_ZOOM_LABEL_BASE, schematicZoomLabel,
  SCHEMATIC_ZOOM_STEP/MIN/MAX, snapSchematicZoom, PUZZLE_ZOOM_LABEL_BASE, puzzleZoomLabel,
  PUZZLE_ZOOM_STEP/MIN/MAX, snapPuzzleZoom, anchoredZoomPan, SCHEMATIC_TOP_INSET, clampPanAxis,
  schematicItemVisible, clampSchematicPan, SCHEMATIC_ELECTRIC, DEX_SELECT_FLOW_SPEED,
  DEX_ELECTRIC_FLOW_SPEED, schematicCoord, schematicElbow — OpeningSchematic(도감 오프닝 트리)과
  PuzzleSchematic(퍼즐 모식도)이 공유하는 확대/축소·팬·좌표 계산 순수 함수/상수 전부.
- 남겨둔 것: 같은 구역에 있던 dexIsUnlocked/dexCapFor/DEX_MIN_DEPTH 등(useOpeningTreeAuto 훅과
  얽혀 있어 경계가 애매함), centerOrderByAdopt, DexEdgesLayer/DexNodesLayer(React.memo 컴포넌트)는
  전부 App.jsx에 그대로 둠 — 순수하긴 하지만 이번엔 가장 명확한 덩어리만 먼저 옮김.
- 위험도: 낮음. 전부 좌표/배율 계산만 하는 순수 함수, 외부 의존성 없음(다른 src/lib 모듈도 import
  안 함). OpeningSchematic·PuzzleSchematic 두 컴포넌트 모두 정의 지점 이후에서만 이 값들을 쓰는지
  grep으로 확인 완료(선언보다 먼저 쓰는 곳 없음).
- 증상이 보이면: 도감 오프닝 트리나 퍼즐 모식도에서 확대/축소 배율 표시(25~200%)가 이상하거나,
  드래그 팬이 빈 공간에서 안 멈추고 계속 나가거나, 트리 연결선(elbow)이 엉뚱한 곳을 가리키면
  src/lib/schematicGeometry.js 확인.

### src/lib/puzzleRating.js (commit 62770f4)
- 이동: isSanSequenceValid/isTreeSequenceValid/isPuzzleSequenceValid(퍼즐 저장 전 수순 합법성 검증),
  RATING_MIN_SAMPLES/expectedSolveMsFromRating/applySolveTimeAdjustment/puzzleAverageRating(정적
  기본 레이팅 보정·평균), PUZZLE_RATING_K/puzzleEloExpected/puzzleEloUpdate(공개 퍼즐 레이팅 Elo
  갱신) — 전부 순수 함수/상수, chessRules.js에서 startBoard/plyIsWhite/sanSrc/applySan/parseFenFull만
  단방향으로 import.
- **남겨둔 것(중요 — 반드시 이유가 있음)**: 같은 구역에 있던 puzzleTreeOf는 App.jsx 전역의
  `CONTENT.puzzleOverrides`를, puzzleLineBaseRating은 App.jsx 전역의 `tensionFacts`(moveExplain
  계열, 1~9614줄 안쪽이라 이번 phase 범위 밖)를 참조한다 — 둘 다 App.jsx에만 남아 있는 값이라, 이
  함수들을 lib으로 옮기면 lib → App.jsx 역방향 import(순환 참조)가 생겨버린다. puzzleRatingOf도
  이 둘에 의존해 연쇄적으로 남겼다. **원칙: 새 lib 모듈은 절대 App.jsx를 import하지 않는다** — 이
  경계에 걸리는 함수는 아무리 "퍼즐 로직"으로 보여도 옮기지 않고 그대로 둔다.
- 위험도: 낮음. 전부 순수 함수, chessRules.js 외 다른 src/lib 모듈에 의존하지 않음(순환 없음).
- 증상이 보이면: 퍼즐 저장 시 불법 수순인데도 저장되거나(반대로 정상 라인이 저장 거부되면)
  isPuzzleSequenceValid 계열을, 퍼즐 레이팅(★평균/공개 Elo)이나 "풀이 시간 보정" 수치가 이상하면
  src/lib/puzzleRating.js 확인. 단, 기본 레이팅 자체(난이도 점수 산출)가 이상하면 여전히 App.jsx의
  puzzleLineBaseRating(위 사유로 안 옮김)을 먼저 볼 것.

### src/lib/tierSystem.js (commit c478313)
- 이동: TIERS(7단계 티어 정의), TIER_COLORS, tierGlowHex, tierGradientCss, gmPhotoRingStyle,
  TIER_XP_REQ, GM_STAR_XP, DIVISIONS_PER_TIER, TIER_STATIONS, tierFromXp, xpForTierDivision,
  DIVISION_ROMAN, tierDisplayLabel, tierDisplayLabelArabic, rollLineXp — 티어/XP 진행 시스템 전체
  (계산·색·라벨), 외부 의존성 전혀 없는 완전히 독립된 블록.
- 남겨둔 것: 이 값들을 실제로 그리는 컴포넌트(TierBadge, TierStatPill, TierProgressStrip,
  TierJourneyMap, TierUpOverlay, TierLogoDisc 등)는 전부 JSX라 App.jsx에 그대로 둠. 이 컴포넌트들은
  이제 새 모듈에서 TIER_COLORS 등을 import해서 쓴다.
- 위험도: 낮음. 전부 순수 계산/상수, 다른 src/lib 모듈에 의존하지 않음. TIER_COLORS/tierFromXp 등은
  정의 지점보다 훨씬 앞쪽 줄(예: 9382줄의 TierBadge 등)에서도 쓰이는데, 전부 컴포넌트 함수 본문
  안에서만 참조되고(모듈 top-level 실행 시점에는 안 쓰임) import가 top-level에서 먼저 해석되므로
  안전함을 확인함.
- 증상이 보이면: 티어 배지·진행바·승급 팝업의 색이 잘못되거나, XP→티어 환산(예: 500XP인데 아직
  아이언으로 나옴) 또는 개발자 패널의 "티어 직접 설정"이 어긋나면 src/lib/tierSystem.js 확인.

### 이번 phase에서 의도적으로 건너뛴 것들(참고용)
아래는 지시문이 후보로 짚었거나 훑는 중 발견했지만, CONTENT/EXPLAIN/BRANCH/tensionFacts 등
App.jsx-local 값에 의존해 옮기면 역방향 import가 생기거나, JSX/훅을 포함해 애초에 대상이 아니었던
것들 — 나중에 다시 검토할 때 참고.
- puzzleTreeOf, puzzleLineBaseRating, puzzleRatingOf, isPuzzlePlayable, solvedLineTagsOf —
  CONTENT.puzzleOverrides 또는 tensionFacts 의존(위 puzzleRating.js 항목 참고).
- puzzleDifficultyFitScore/themeSolveRates/puzzleWeaknessScore/puzzleThemeFitScore/
  puzzleExposureScore, themesOf/sortedThemesOf/primaryTheme/themeLabelsOf — 서로 얽혀 있어 이번엔
  건드리지 않음(themesOf 자체는 순수하지만 나머지와 묶어서 봐야 의미가 있어 다음 기회로 미룸).
- extendPuzzleLeaf/addSiblingBranch/removeLastMoveOfLine(퍼즐 트리 편집, 개발자 전용) — cloneTree/
  findTreeNode/nextLeafTag/PUZZLE_PASS_KINDS에 의존하는 순수 함수라 다음 phase 후보로 남겨둠.
- dexIsUnlocked/dexCapFor/DEX_MIN_DEPTH/DEX_ADOPT_CUTOFF/DEX_MAX_CHILDREN* — useOpeningTreeAuto
  훅과 경계가 애매해 이번엔 보류.
- lastNamedOpening/firstNamedOpening/openingNamesAlong/puzzleName/livePuzzleName — App.jsx-local
  effectiveOpeningNameAt(오프닝 콘텐츠 시스템, Phase 1-2 범위)에 의존해 이번 phase에서는 옮길 수
  없음.
