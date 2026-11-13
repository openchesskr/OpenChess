#!/usr/bin/env node
/** (v0.7.3 재발 방지, BUGS.md BUG-137) 리뷰 화면 두 가지 규칙을 소스에서 직접 검사한다.
 *  ① 자유 탐색 수(setExploreMove)에는 항상 ply가 있어야 한다 — 빠져 있으면 코치 제목이 "NaN.수"로 나온다.
 *  ② 빠른 리뷰 진입 연출(QuickReviewIntro)은 사용자 요청 구성을 지킨다: 옛 문구·이니셜·화살표 없음, 단계별 최소 노출 시간(DWELL_MS),
 *     안전 영역 맞춤(FitBox), 글리치 중 특수문자 깜빡임(useGlitchFlicker), "분석 중 n%"를 연출 화면 아래에 표시(헤더 배지는 연출 중 숨김).
 *  ③ 전술 연출 기물(SlidePiece)은 고정 픽셀이 아니라 칸 단위(12.5%)로 위치를 잡고 일반 기물과 같은 크기 비율(0.74)을 쓴다.
 *  실행: node scripts/check-review-ui.mjs (npm run build 전에 prebuild로 자동 실행)
 */
import fs from "node:fs";
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const fails = [];

const review = rd("src/app/review.jsx");
for (const m of review.matchAll(/setExploreMove\((\{[^}]*\})\)/g)) if (!/\bply\b/.test(m[1])) fails.push("review.jsx: setExploreMove에 ply 없음 → " + m[1].slice(0, 70));
if (!/setExploreMove\(\{[^}]*\bply\b/.test(review)) fails.push("review.jsx: ply를 담은 setExploreMove 호출을 찾지 못함");
if (!/Number\.isFinite\(m\.ply\)/.test(review)) fails.push("review.jsx: reviewCoachCopy가 ply 없는 수를 방어하지 않음");
if (!/!\(quick && !quickIntroDone\)/.test(review)) fails.push("review.jsx: 빠른 리뷰 연출 중 헤더의 '분석 중 n%' 배지를 숨기지 않음");

const qr = rd("src/components/QuickReviewIntro.jsx");
const body = qr.replace(/\/\/.*$/gm, "");
if (/QUICK REVIEW|DEPTH|빠른 리뷰 분석 중\W*\s*·/.test(body.replace(/aria-label=\{t\("빠른 리뷰 분석 중"\)\}/, ""))) fails.push("QuickReviewIntro: 지우기로 한 'QUICK REVIEW // DEPTH'·'빠른 리뷰 분석 중' 텍스트가 남아 있음");
if (/▸/.test(body)) fails.push("QuickReviewIntro: 화살표(▸)가 남아 있음");
if (/\{cur\.k\}|\{w\.k\}<\/div>/.test(body)) fails.push("QuickReviewIntro: 이니셜 표시가 남아 있음");
if (!/const DWELL_MS = \d+/.test(body)) fails.push("QuickReviewIntro: 단계별 최소 노출 시간(DWELL_MS) 없음");
if (!/useGlitchFlicker\(base/.test(body) || !/useGlitchFlicker\(word/.test(body)) fails.push("QuickReviewIntro: OPEN 글자·게이지 이름 모두에 특수문자 깜빡임(useGlitchFlicker)이 필요함");
if (!/function GlitchLetters/.test(body) || !/<svg viewBox=/.test(body) || /<pre/.test(body)) fails.push("QuickReviewIntro: OPEN 글자는 글꼴 글자(pre)가 아니라 SVG(viewBox)로 그려야 함, 기기별 블록 글꼴 높이 차이로 게이지가 겹침");
if (!/env\(safe-area-inset-left\)/.test(body)) fails.push("QuickReviewIntro: 뷰포트 안전 영역(env(safe-area-inset-*)) 여백이 없음");
for (const w of ["OPENING", "PUZZLE", "ENDGAME", "NETWORK"]) if (!body.includes('"' + w + '"')) fails.push("QuickReviewIntro: 게이지 아래 '" + w + "' 이름이 없음");
if (!/function GaugeLabel/.test(body) || !/useScramble\(text/.test(body) || !/useGlitchFlicker\(word/.test(body)) fails.push("QuickReviewIntro: 게이지 이름에 스크램블·특수문자 깜빡임 효과가 필요함");
if (!/tx\("\{0\} 분석 중 \{1\}"/.test(body)) fails.push("QuickReviewIntro: 하단 '분석 중 n%' 표시가 없음");
{ // 단계가 4개이고 모두 같은 최소 시간을 쓰는지: shown을 한 칸씩만 올린다
  if (!/setShown\(\(v\) => Math\.min\(3, v \+ 1\)\)/.test(body)) fails.push("QuickReviewIntro: 단계를 한 칸씩 올리지 않음(EVALUATE가 건너뛰어질 수 있음)");
  // (v0.7.4) 게이지 한 칸이 차면 그 아래 이름이 글리치와 함께 바뀐다(OPENING→OBSERVE …), OPEN 위쪽엔 단어 UI가 없다.
  if (!/final=\{w\.w\}/.test(body) || !/full \? final : idle/.test(body)) fails.push("QuickReviewIntro: 게이지가 차면 아래 이름이 OBSERVE·PRACTICE·EVALUATE·NEXT LEVEL로 바뀌어야 함");
  if (/STEP \d|fontSize: 38/.test(body)) fails.push("QuickReviewIntro: OPEN 위쪽 단어·STEP UI가 다시 생김(사용자 요청으로 삭제)");
  // (v0.7.4) 글자마다 비슷한 시간: 단계 길이는 예상 전체 시간 ÷ 4, 최소 STAGE_MIN_MS — 진행률로 O만 길어지고 PEN이 몰려 지나가던 문제 방지
  if (!/STAGE_MIN_MS/.test(body) || !/est \/ 4/.test(body) || /Math\.floor\(pct \* 4\)/.test(body)) fails.push("QuickReviewIntro: 글자별 노출 시간이 비슷해야 함(예상 전체 시간 ÷ 4 기준, 진행률 구간 고정 금지)");
}

const common = rd("src/app/common.jsx");
const slide = (common.match(/function SlidePiece[\s\S]*?\n}\n/) || [""])[0];
if (!slide) fails.push("common.jsx: SlidePiece 없음");
else {
  if (!/width: "12\.5%"/.test(slide)) fails.push("SlidePiece: 칸 한 개 크기(12.5%) 상자로 위치를 잡아야 함(고정 px는 좁은 화면에서 칸 중앙을 벗어남)");
  if (/\* cell\b/.test(slide)) fails.push("SlidePiece: size 기반 고정 px(cell) 좌표를 쓰면 안 됨");
  if (!/pieceSize/.test(slide) || !/pieceSize=\{cell \* 0\.74\}/.test(common)) fails.push("SlidePiece: 일반 기물과 같은 크기(cell * 0.74)를 pieceSize로 받아야 함");
}

// (v0.7.5, 사용자 요청) 내 대국 리뷰는 내 진영이 아래 — 보드·시작 연출·평가 막대·선수 줄이 모두 같은 boardFlip을 따른다.
{
  if (!/export function reviewBoardFlip\(game\) \{ return !!game && game\.color === "b"; \}/.test(review)) fails.push("review.jsx: reviewBoardFlip(game.color === \"b\")가 없음");
  const boards = review.match(/<BoardWithMaterial [^\n]*/g) || [];
  if (!boards.length || boards.some((b) => !/flip=\{boardFlip\}/.test(b) || !/topInfo=\{boardFlip \? whitePInfo : blackPInfo\}/.test(b))) fails.push("review.jsx: 리뷰 보드가 boardFlip을 따르지 않음(flip·위아래 선수 줄)");
  if (!/<EvalBar vertical flip=\{boardFlip\}/.test(review)) fails.push("review.jsx: 세로 평가 막대가 보드 방향을 따르지 않음");
  if (!/<ReviewBoardIntroAnim sans=\{sans\} flip=\{boardFlip\}/.test(review)) fails.push("review.jsx: 보드 시작 연출이 보드 방향을 따르지 않음");
  const play = rd("src/app/play.jsx");
  if (/onOpenReview\(\{ sans, fenRoot \}\)/.test(play)) fails.push("play.jsx: 대국 후 리뷰를 열 때 내 진영(color)을 넘기지 않음");
}
// (v0.7.5) 코치 말풍선 본문은 고정 높이 — 설명 길이에 따라 아래 보드·그래프 위치가 흔들리지 않게(오프닝 이름도 그 안에)
{
  const card = (review.match(/function ReviewCoachCard[\s\S]*?\n}\n/) || [""])[0];
  if (!/height: narrow \? REVIEW_COACH_BODY_H\.narrow : REVIEW_COACH_BODY_H\.wide/.test(card) || !/overflowY: "auto"/.test(card)) fails.push("ReviewCoachCard: 본문 높이가 고정이 아님");
  if (/ReviewOpeningBanner text=/.test(review)) fails.push("review.jsx: 오프닝 배너가 말풍선 밖에서 나타났다 사라짐(보드 위치가 흔들림)");
}
// (v0.7.5 BUG-162) /review 링크 — 되돌릴 수 없는 ID(OpenChess 대국 pvp-·bot-)를 식별자로 쓰지 않고, 진영·선수 등은 PGN 태그로 왕복된다
{
  const idf = (common.match(/export async function reviewGameIdentifier[\s\S]*?\n}\n/) || [""])[0];
  if (/if \(game\.id\) return String\(game\.id\)/.test(idf)) fails.push("reviewGameIdentifier: game.id를 그대로 식별자로 쓰면 OpenChess 대국 링크가 열리지 않음(BUG-162)");
  const a = common.indexOf("const META_SAFE"), b = common.indexOf("// 위 reviewGameIdentifier의 역변환");
  if (a < 0 || b < 0) fails.push("common.jsx: 리뷰 링크 메타 태그 함수를 찾지 못함");
  else {
    const f = new Function(common.slice(a, b).replace(/export function/g, "function") + "; return { reviewMetaTags, reviewMetaFromPgn };")();
    const g = { white: { username: "kim\"]x", rating: 1500 }, black: { username: "이순신" }, color: "b", id: "pvp-77", endTime: 1760000000, username: "이순신" };
    const back = f.reviewMetaFromPgn(f.reviewMetaTags(g) + "\n\n1. e4 e5");
    if (back.color !== "b" || !back.black || back.black.username !== "이순신" || back.white.username !== "kimx") fails.push("리뷰 링크 메타 태그 왕복 실패: " + JSON.stringify(back));
    // (보안 검토) 링크는 누구나 만든다 — 공유 캐시 키(id)·기기 캐시 키(endTime)는 링크에서 절대 복원하지 않는다
    if ("id" in back || "endTime" in back) fails.push("리뷰 링크가 대국 ID·종료 시각(캐시 키)을 복원함 — 가짜 수순으로 공유·기기 캐시를 오염시킬 수 있음");
    const forged = f.reviewMetaFromPgn('[OCSide "x"]\n[OCId "123456"]\n[OCEnd "1760000000"]\n[Site "https://www.chess.com/game/live/123456"]');
    if (forged.color || forged.id || forged.endTime) fails.push("리뷰 링크 메타 태그: 모양이 틀리거나 허용하지 않은 값을 받아들임");
  }
  if (!/fromLink: true/.test(common) || !/game\.fromLink/.test(review)) fails.push("링크로 연 대국(fromLink)의 진영으로 유산을 만들 수 있음 — 링크 정보는 표시용");
  if (!/resolved\.game|reviewMetaFromPgn\(pgnText\)/.test(common) || !/\.\.\.reviewMetaFromPgn\(pgnText\)/.test(common)) fails.push("resolveReviewIdentifier가 링크의 대국 정보(진영 등)를 복원하지 않음");
}

// (v0.7.6, BUG-164) 리뷰 기보(데스크톱 표·모바일 줄)는 체크·체크메이트 기호를 지우지 않는다 — 원본에 없으면 포지션에서 붙인다.
{
  const { displaySans, parseFenFull } = await import("../src/lib/chessRules.js");
  const got = displaySans(null, ["e4", "f5", "Qh5", "g6"]);
  if (got[2] !== "Qh5+") fails.push("displaySans — 체크 수 Qh5에 +가 붙지 않음(" + got[2] + ")");
  const mate = displaySans(null, ["f3", "e5", "g4", "Qh4#"]);
  if (mate[3] !== "Qh4#") fails.push("displaySans — 체크메이트 기호 #가 사라짐(" + mate[3] + ")");
  const fen = displaySans(parseFenFull("4k3/8/8/8/8/8/8/R3K3 w - - 0 1"), ["Ra8"]);
  if (fen[0] !== "Ra8+") fails.push("displaySans — FEN 시작 대국의 체크 기호 누락(" + fen[0] + ")");
  const rv = fs.readFileSync(new URL("../src/app/review.jsx", import.meta.url), "utf8");
  if (/stripSuffix\((s|san)\)<\/(button|span)>/.test(rv)) fails.push("review.jsx — 기보 칸이 stripSuffix로 체크 기호를 지움");
  if (!/<ReviewMoveTable sans=\{shownSans\}/.test(rv) || !/<ReviewMoveStrip sans=\{shownSans\}/.test(rv)) fails.push("review.jsx — 기보 표·줄이 displaySans 결과(shownSans)를 쓰지 않음");
}
// (v0.7.6, BUG-165) 서버 공유 캐시의 대국(수 목록이 moves)도 리뷰 화면이 여는 sans 모양으로 맞춘다 — 채팅 "리뷰 보기"·/review/(숫자) 링크.
{
  const { normalizeReviewGame } = await import("../src/lib/reviewGame.js");
  const g = normalizeReviewGame({ moves: ["e4", "e5"], id: "1" });
  if (!g || !Array.isArray(g.sans) || g.sans.length !== 2) fails.push("normalizeReviewGame — moves만 있는 대국에 sans를 만들지 않음");
  const keep = normalizeReviewGame({ sans: ["d4"], moves: [{ ply: 1 }] });
  if (keep.sans[0] !== "d4") fails.push("normalizeReviewGame — 이미 있는 sans를 바꿈");
  const cm = fs.readFileSync(new URL("../src/app/common.jsx", import.meta.url), "utf8"), app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  if (!/normalizeReviewGame\(rows\[0\]\.data\)/.test(cm)) fails.push("common.jsx reviewedGameFetch — 서버 대국을 normalizeReviewGame으로 맞추지 않음");
  if (!/const openReview = useCallback\(\(rawGame\) => \{\s*const game = normalizeReviewGame\(rawGame\)/.test(app)) fails.push("App.jsx openReview — 받은 대국을 normalizeReviewGame으로 맞추지 않음");
}
if (fails.length) { console.error("✗ review-ui check 실패:\n" + fails.map((x) => "  " + x).join("\n")); process.exit(1); }
console.log("✓ review-ui check: 자유 탐색 ply·빠른 리뷰 연출 구성·전술 기물 칸 중앙 배치·내 진영 아래·코치 말풍선 고정 높이·리뷰 링크 왕복 유지");
