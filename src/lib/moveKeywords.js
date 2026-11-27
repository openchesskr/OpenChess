// (v0.7.6, 사용자 요청) 수 키워드 자동 부여 — 개발자가 수마다 키워드를 손으로 지정하던 기능(analysis.jsx 이름·키워드 편집, CONTENT.keywords)을 없애고,
// 수 블록으로 표시되는 모든 수에 그 포지션을 직접 분석해 키워드를 붙인다(v0.7.8: 하나가 아니라 조건에 맞는 키워드 전부, 아래 우선순위 순). 순수 함수라 scripts/check-move-keywords.mjs가 시험한다.
// 규칙(v0.7.8부터 맞는 것 전부를 이 순서로 — 하나도 없을 때만 NORMAL) — 2차안(SHARP를 "날카로운 수"로 바꾸고 18종 모두 사용), 사용자와 협의하며 조정한다:
//   1. LOW-LEVEL      최선보다 1.5 이상 나쁨 — 낮은 레벨에서 주로 보이는 수.
//                     (v0.8.0, 사용자 요청) 이론 수·등급이 좋은 수 이상(탁월·유일·최선·우수·좋음)인 수·평가 1위인 수·
//                     많이 두는 수(전체 채택률 5% 이상, 마스터 채택률 2% 이상 또는 마스터 상위 3수)에는 붙이지 않는다 — 1...c5 같은 정석에 붙던 문제.
//   2. TRICKY         기물 희생인데 최선과의 차이 0.5 이하 — 함정·희생을 노리는 까다로운 수
//   3. SHARP          최선(0.2 이내)인데 다른 모든 수가 0.8 이상 나쁨, 또는 유일한 수 — 정확히 둬야 하는 날카로운 수
//   4. TOP LEVEL      평가 1위이면서 마스터 채택률 25% 이상 또는 마스터 상위 3수
//   5. DRAWING-WEAPON 같은 포지션이 반복되는 수, 또는 평가가 균형(±0.4)인 퀸 교환
//   6. ANTI-          수의 오프닝 이름이 "Anti-"(특정 시스템에 대한 대응)
//   7. IMBALANCE      비숍과 나이트를 맞바꾸는 잡기 — 기물 구성이 비대칭이 됨
//   8. OPEN           폰으로 잡는 수 — 폰이 사라지며 파일·중앙이 열림
//   9. CLOSED         폰이 전진해 상대 폰과 정면으로 맞물리고 뒤에서 내 폰이 받침 — 폰 사슬로 중앙이 닫힘
//  10. SWITCH         잡지 않고 상대 폰을 공격하는 폰 전진(폰 브레이크) — 구조·플랜 전환
//  11. STRAIGHT-LINE  체크 또는 기물 잡기 — 상대의 응수가 정해져 이후가 단순·강제적
//  12. INTUITIVE      캐슬링 또는 첫 줄의 나이트·비숍을 처음 꺼내는 발전 수
//  13. BALANCE        직전 상대 수를 거울처럼 따라 두는 대칭 수
//  14. MAIN-LINE      이론 수 중 가장 많이 두어지는 수(채택률 30% 이상)
//  15. SIDESTEPPING   이론 수인데 채택률 5% 미만 — 잘 알려지지 않은 사이드라인
//  16. FLEXIBLE       최선 0.3 이내의 좋은 수가 셋 이상인 포지션의 조용한 수 — 여러 플랜을 남겨 둠
//  17. QUIET          최선과의 차이 0.3 이하인 조용한 수(잡기·체크 아님)
//  (v0.8.0, 사용자 요청) 포지션 성격 키워드 — 평가·채택률과 무관하게 보드만 보고 붙인다. 평가가 낮거나 드문 수도
//  LOW-LEVEL·SIDESTEPPING만 뜨지 않고 "어떤 성격의 수인지"가 함께 보이게 한다.
//  19. GAMBIT         오프닝(20수 이내)에서 폰을 내주는 수 — 움직인 폰이나 그 폰이 떠난 자리 때문에 폰을 순손실로 잃음(SEE)
//  20. EARLY QUEEN    8수 안에 퀸이 잡지 않고 나감
//  21. TEMPO LOSS     오프닝(15수 이내)에서 이미 나간 나이트·비숍을 잡기·체크 없이 다시 움직이거나, 퀸·룩이 자기 진영 쪽으로 물러남
//  22. KING WALK      퀸이 남은 상태에서 캐슬링이 아닌 킹 이동
//  23. WEAKENING      킹 앞 폰을 미는 수 — 캐슬링한 쪽의 f·g·h(a·b·c) 폰(h3·a3 한 칸 숨구멍 제외), 또는 캐슬링 전 f폰 한 칸
//  24. FIANCHETTO     g·b 파일 폰 한 칸 전진으로 제자리 비숍이 긴 대각선을 얻거나, 그 비숍이 긴 대각선 칸(g2·b2·g7·b7)으로 나감
//  25. PROPHYLAXIS    a·h 파일 폰 한 칸 전진(a3·h3·a6·h6) — 상대 기물이 들어올 칸을 미리 막는 예방 수
//  26. WING           b·g 파일 폰 두 칸 전진, 또는 a·h 파일 폰 두 칸 이상 전진 — 측면에서 공간을 넓히거나 공격
//  27. CENTER         중앙 네 칸(d4·e4·d5·e5)으로 가는 수, 또는 c·f 폰이 4·5랭크로 나가 중앙 칸을 치는 수
//  28. SPACE          폰이 상대 진영(백 5랭크·흑 4랭크 이상)으로 잡지 않고 넘어가는 전진
//  18. NORMAL         그 밖의 모든 수
// 입력값이 아직 없으면(평가 계산 중) 그 조건만 건너뛴다 — 평가가 들어오면 다시 계산된다.
import { sanSrc, decorateSan, applySan } from "./chessRules.js";
import { isSacrifice, seeSquare } from "./moveQuality.js";

export const AUTO_KEYWORDS = ["LOW-LEVEL", "TRICKY", "SHARP", "TOP LEVEL", "DRAWING-WEAPON", "ANTI-", "IMBALANCE", "OPEN", "CLOSED", "SWITCH", "STRAIGHT-LINE", "INTUITIVE", "BALANCE", "MAIN-LINE", "SIDESTEPPING", "FLEXIBLE", "QUIET", "GAMBIT", "EARLY QUEEN", "TEMPO LOSS", "KING WALK", "WEAKENING", "FIANCHETTO", "PROPHYLAXIS", "WING", "CENTER", "SPACE", "NORMAL"];
// (v0.8.0) LOW-LEVEL을 붙이지 않는 등급 — 등급(최선·좋음 등)과 키워드가 서로 모순되지 않게
const GOOD_KINDS = new Set(["brilliant", "only", "best", "excellent", "good", "book"]);

const strip = (s) => String(s || "").replace(/[+#!?]/g, "");
// 보드 배치 문자열(반복 판정용) — 같은 배치 + 같은 차례면 같은 포지션으로 본다
export const placementKey = (board, toMove) => board.map((row) => row.map((p) => (p ? (p.c === "w" ? p.t : p.t.toLowerCase()) : ".")).join("")).join("/") + " " + toMove;
// 상대 수를 거울에 비춘 SAN(랭크 r ↔ 9-r): e4 ↔ e5, Nf3 ↔ Nf6, O-O ↔ O-O
const mirror = (san) => strip(san).replace(/[1-8]/g, (d) => String(9 - Number(d)));

/* board: 수를 두기 전 포지션, color: 두는 쪽("w"|"b").
   lossCp: 최선 대비 손실(센티폰, 모르면 null) · isBest: 평가 1위인지 · gapCp: 이 수와 나머지 수 중 최선의 차이(모든 형제 평가가 있을 때만, 없으면 null)
   nearBest: 최선 0.3 이내 수의 개수(모르면 null) · evalCp: 이 수를 둔 뒤 두는 쪽 관점 평가(모르면 null) · kind: 수 등급(only 등)
   adopt·masterAdopt: 채택률(%) · masterTop: 마스터 상위 3수 · book: 이론 수 · name: 이 수의 오프닝 이름
   prevSan: 직전 상대 수 · history: 지금까지 나온 포지션 배치 키 Set(placementKey) · ply: 이 수 전까지 둔 반수(모르면 null — 오프닝 판정만 건너뜀) */
export function autoMoveKeywords({ san, color, board, lossCp = null, isBest = false, gapCp = null, nearBest = null, evalCp = null, kind = null, adopt = null, masterAdopt = null, masterTop = false, book = false, name = null, prevSan = null, history = null, ply = null }) {
  if (!san) return ["NORMAL"];
  const out = []; const add = (k) => { if (!out.includes(k)) out.push(k); };
  let info = null, check = false, sac = false, after = null, captured = null;
  try {
    if (board) {
      info = sanSrc(board, san, color);
      if (info) {
        check = /[+#]$/.test(decorateSan(board, san, color));
        sac = isSacrifice(board, san, color);
        after = applySan(board, san, color);
        if (info.isCap && info.to) captured = board[info.to[0]][info.to[1]] || { t: "P", c: color === "w" ? "b" : "w" };   // 빈 칸 잡기 = 앙파상
      }
    }
  } catch { info = null; after = null; }
  if (!check && /[+#]/.test(san)) check = true;
  const capture = info ? !!info.isCap : /x/.test(san);
  const piece = info ? info.piece : (/^[KQRBN]/.test(san) ? san[0] : /^O-O/.test(san) ? "K" : "P");
  const enemy = color === "w" ? "b" : "w", fwd = color === "w" ? -1 : 1;
  const quiet = !capture && !check;

  // (v0.8.0, 사용자 요청) LOW-LEVEL은 정말 드물고 나쁜 수에만 — 이론 수·좋은 등급·평가 1위·많이 두는 수에는 붙이지 않는다
  const popular = (adopt != null && adopt >= 5) || (masterAdopt != null && masterAdopt >= 2) || masterTop;
  if (lossCp != null && lossCp >= 150 && !book && !isBest && !(kind && GOOD_KINDS.has(kind)) && !popular) add("LOW-LEVEL");
  if (sac && lossCp != null && lossCp <= 50) add("TRICKY");
  if (kind === "only" || (lossCp != null && lossCp <= 20 && gapCp != null && gapCp >= 80)) add("SHARP");
  if (isBest && (masterTop || (masterAdopt != null && masterAdopt >= 25))) add("TOP LEVEL");
  if (after && history && history.has(placementKey(after, enemy))) add("DRAWING-WEAPON");
  if (piece === "Q" && captured && captured.t === "Q" && evalCp != null && Math.abs(evalCp) <= 40) add("DRAWING-WEAPON");
  if (name && /\bAnti[-\s]/i.test(name)) add("ANTI-");
  if (captured && ((piece === "B" && captured.t === "N") || (piece === "N" && captured.t === "B"))) add("IMBALANCE");
  if (piece === "P" && capture) add("OPEN");
  if (piece === "P" && !capture && info && after) {
    const [r, c] = info.to, front = after[r + fwd] && after[r + fwd][c];
    const own = (rr, cc) => cc >= 0 && cc < 8 && after[rr] && after[rr][cc] && after[rr][cc].t === "P" && after[rr][cc].c === color;
    if (front && front.t === "P" && front.c === enemy && (own(r - fwd, c - 1) || own(r - fwd, c + 1))) add("CLOSED");   // 막힌 데다 뒤에서 내 폰이 받쳐 사슬이 됨
    const hits = [c - 1, c + 1].some((cc) => cc >= 0 && cc < 8 && after[r + fwd] && after[r + fwd][cc] && after[r + fwd][cc].t === "P" && after[r + fwd][cc].c === enemy);
    if (hits) add("SWITCH");
  }
  if (check || capture) add("STRAIGHT-LINE");
  if (/^O-O/.test(san)) add("INTUITIVE");
  if (info && /^[NB]/.test(san) && info.from && info.from[0] === (color === "w" ? 7 : 0)) add("INTUITIVE");
  if (prevSan && mirror(prevSan) === strip(san)) add("BALANCE");
  if (book && adopt != null && adopt >= 30) add("MAIN-LINE");
  if (book && adopt != null && adopt < 5) add("SIDESTEPPING");
  if (quiet && lossCp != null && lossCp <= 30 && nearBest != null && nearBest >= 3) add("FLEXIBLE");
  if (quiet && lossCp != null && lossCp <= 30) add("QUIET");
  positionCharacter({ san, color, board, info, after, piece, capture, check, ply, add });
  if (out.includes("FLEXIBLE")) return out.filter((k) => k !== "QUIET");   // FLEXIBLE은 "좋은 수가 여럿인 포지션의 조용한 수"라 QUIET을 이미 담고 있다 — 같은 뜻 두 번 표시하지 않음
  return out.length ? out : ["NORMAL"];
}
export const autoMoveKeyword = (args) => autoMoveKeywords(args)[0];   // 가장 앞선(우선순위 높은) 키워드 하나
// 수 블록·현재 수 블록·집중 분석·도감이 함께 쓰는 표시용 목록(v0.7.8: 맞는 키워드 전부). assignTiers가 붙인 m.kwAutoAll(없으면 m.kwAuto)만 쓴다 — 예전 m.kw(개발자 지정·정적 데이터)는 보지 않는다.
export const blockKeywords = (m) => (m && Array.isArray(m.kwAutoAll) && m.kwAutoAll.length ? m.kwAutoAll : m && typeof m.kwAuto === "string" ? [m.kwAuto] : []);
// (v0.8.0, 사용자 요청) 포지션 성격 키워드(19~28) — 보드만 보고 판단한다(평가·채택률 불필요). 규칙은 파일 맨 위 주석.
const OPENING_PLIES = 40, EARLY_QUEEN_PLIES = 16, TEMPO_PLIES = 30;
function positionCharacter({ san, color, board, info, after, piece, capture, check, ply, add }) {
  if (!board || !info || !after || !info.from || !info.to) return;
  const [fr, fc] = info.from, [tr, tc] = info.to;
  const enemy = color === "w" ? "b" : "w", home = color === "w" ? 7 : 0, fwd = color === "w" ? -1 : 1;
  const opening = ply != null && ply < OPENING_PLIES;
  const isMine = (p, t) => p && p.c === color && p.t === t;
  if (/^O-O/.test(san)) return;   // 캐슬링은 INTUITIVE로 충분

  // GAMBIT — 움직인 폰, 또는 폰이 떠나 지켜 주지 못하게 된 다른 내 폰을 상대가 순이득으로 잡을 수 있음
  if (piece === "P" && opening && !check) {
    let lose = false;
    try {
      if (seeSquare(after, tr, tc, enemy) >= 1) lose = true;
      else for (let r = 0; r < 8 && !lose; r++) for (let c = 0; c < 8 && !lose; c++) { const q = after[r][c]; if (q && q.c === color && q.t === "P" && !(r === tr && c === tc) && seeSquare(board, r, c, enemy) < 1 && seeSquare(after, r, c, enemy) >= 1) lose = true; }
    } catch { lose = false; }
    if (lose) add("GAMBIT");
  }
  if (piece === "Q" && !capture && ply != null && ply < EARLY_QUEEN_PLIES) add("EARLY QUEEN");
  if (!capture && !check && ply != null && ply < TEMPO_PLIES) {
    if ((piece === "N" || piece === "B") && fr !== home) add("TEMPO LOSS");
    else if ((piece === "Q" || piece === "R") && (tr - fr) * fwd < 0) add("TEMPO LOSS");
  }
  // KING WALK — 퀸이 남아 있는 중반·오프닝의 킹 이동(엔드게임의 킹 활용은 제외)
  if (piece === "K") {
    let queens = 0; for (const row of after) for (const q of row) if (q && q.t === "Q") queens++;
    if (queens > 0) add("KING WALK");
  }
  if (piece === "P" && !capture) {
    const steps = Math.abs(tr - fr);
    const kp = (() => { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (isMine(board[r][c], "K")) return [r, c]; return null; })();
    // WEAKENING — 킹 쪽 방패 폰을 밀어 킹 주변 칸이 약해짐
    if (kp && kp[0] === home) {
      const shortSide = kp[1] >= 5, longSide = kp[1] <= 2;
      const luft = (fc === 0 || fc === 7) && steps === 1;   // 캐슬링 뒤 h3·a3 한 칸(숨구멍)은 약화로 보지 않는다
      if (!luft && ((shortSide && fc >= 5) || (longSide && fc <= 2) || (kp[1] === 4 && fc === 5 && steps === 1))) add("WEAKENING");
    }
    // FIANCHETTO — g/b 폰 한 칸 → 제자리 비숍(f1·c1 / f8·c8)이 긴 대각선을 얻음
    if (steps === 1 && (fc === 6 || fc === 1) && fr === home + fwd && isMine(board[home][fc === 6 ? 5 : 2], "B")) add("FIANCHETTO");
    if ((fc === 0 || fc === 7) && steps === 1 && fr === home + fwd) add("PROPHYLAXIS");
    if (((fc === 1 || fc === 6) && steps === 2) || ((fc === 0 || fc === 7) && (steps === 2 || fr !== home + fwd))) add("WING");
    const crossed = color === "w" ? tr <= 3 : tr >= 4;
    if (crossed) add("SPACE");
  }
  if (piece === "B" && !capture && fr === home && (fc === 5 || fc === 2) && tr === home + fwd && (tc === 6 || tc === 1)) add("FIANCHETTO");
  // CENTER — 중앙 네 칸으로 가거나, c·f 파일 폰이 4·5랭크로 나가 중앙 칸(d·e)을 치는 수(1...c5·1.c4·2.f4 등)
  const centerRank = tr === 3 || tr === 4;
  if (centerRank && (tc === 3 || tc === 4)) add("CENTER");
  else if (piece === "P" && centerRank && (tc === 2 || tc === 5)) add("CENTER");
}
