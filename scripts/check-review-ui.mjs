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
    if (back.color !== "b" || back.id !== "pvp-77" || back.endTime !== 1760000000 || !back.black || back.black.username !== "이순신" || back.white.username !== "kimx") fails.push("리뷰 링크 메타 태그 왕복 실패: " + JSON.stringify(back));
    const evil = f.reviewMetaFromPgn('[OCSide "x"]\n[OCId "javascript:alert(1)"]\n[OCEnd "abc"]');
    if (evil.color || evil.id || evil.endTime) fails.push("리뷰 링크 메타 태그: 모양이 틀린 값을 받아들임");
  }
  if (!/resolved\.game|reviewMetaFromPgn\(pgnText\)/.test(common) || !/\.\.\.reviewMetaFromPgn\(pgnText\)/.test(common)) fails.push("resolveReviewIdentifier가 링크의 대국 정보(진영 등)를 복원하지 않음");
}

if (fails.length) { console.error("✗ review-ui check 실패:\n" + fails.map((x) => "  " + x).join("\n")); process.exit(1); }
console.log("✓ review-ui check: 자유 탐색 ply·빠른 리뷰 연출 구성·전술 기물 칸 중앙 배치·내 진영 아래·코치 말풍선 고정 높이·리뷰 링크 왕복 유지");
