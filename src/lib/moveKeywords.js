// (v0.7.6, 사용자 요청) 수 키워드 자동 부여 — 개발자가 수마다 키워드를 손으로 지정하던 기능(analysis.jsx 이름·키워드 편집, CONTENT.keywords)을 없애고,
// 수 블록으로 표시되는 모든 수에 그 포지션을 직접 분석해 키워드 "하나"를 붙인다. 순수 함수라 scripts/check-move-keywords.mjs가 시험한다.
// 규칙(위에서부터 먼저 맞는 하나) — 2차안(SHARP를 "날카로운 수"로 바꾸고 18종 모두 사용), 사용자와 협의하며 조정한다:
//   1. LOW-LEVEL      최선보다 1.5 이상 나쁨 — 낮은 레벨에서 주로 보이는 수
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
//  18. NORMAL         그 밖의 모든 수
// 입력값이 아직 없으면(평가 계산 중) 그 조건만 건너뛴다 — 평가가 들어오면 다시 계산된다.
import { sanSrc, decorateSan, applySan } from "./chessRules.js";
import { isSacrifice } from "./moveQuality.js";

export const AUTO_KEYWORDS = ["LOW-LEVEL", "TRICKY", "SHARP", "TOP LEVEL", "DRAWING-WEAPON", "ANTI-", "IMBALANCE", "OPEN", "CLOSED", "SWITCH", "STRAIGHT-LINE", "INTUITIVE", "BALANCE", "MAIN-LINE", "SIDESTEPPING", "FLEXIBLE", "QUIET", "NORMAL"];

const strip = (s) => String(s || "").replace(/[+#!?]/g, "");
// 보드 배치 문자열(반복 판정용) — 같은 배치 + 같은 차례면 같은 포지션으로 본다
export const placementKey = (board, toMove) => board.map((row) => row.map((p) => (p ? (p.c === "w" ? p.t : p.t.toLowerCase()) : ".")).join("")).join("/") + " " + toMove;
// 상대 수를 거울에 비춘 SAN(랭크 r ↔ 9-r): e4 ↔ e5, Nf3 ↔ Nf6, O-O ↔ O-O
const mirror = (san) => strip(san).replace(/[1-8]/g, (d) => String(9 - Number(d)));

/* board: 수를 두기 전 포지션, color: 두는 쪽("w"|"b").
   lossCp: 최선 대비 손실(센티폰, 모르면 null) · isBest: 평가 1위인지 · gapCp: 이 수와 나머지 수 중 최선의 차이(모든 형제 평가가 있을 때만, 없으면 null)
   nearBest: 최선 0.3 이내 수의 개수(모르면 null) · evalCp: 이 수를 둔 뒤 두는 쪽 관점 평가(모르면 null) · kind: 수 등급(only 등)
   adopt·masterAdopt: 채택률(%) · masterTop: 마스터 상위 3수 · book: 이론 수 · name: 이 수의 오프닝 이름
   prevSan: 직전 상대 수 · history: 지금까지 나온 포지션 배치 키 Set(placementKey) */
export function autoMoveKeyword({ san, color, board, lossCp = null, isBest = false, gapCp = null, nearBest = null, evalCp = null, kind = null, adopt = null, masterAdopt = null, masterTop = false, book = false, name = null, prevSan = null, history = null }) {
  if (!san) return "NORMAL";
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

  if (lossCp != null && lossCp >= 150) return "LOW-LEVEL";
  if (sac && lossCp != null && lossCp <= 50) return "TRICKY";
  if (kind === "only" || (lossCp != null && lossCp <= 20 && gapCp != null && gapCp >= 80)) return "SHARP";
  if (isBest && (masterTop || (masterAdopt != null && masterAdopt >= 25))) return "TOP LEVEL";
  if (after && history && history.has(placementKey(after, enemy))) return "DRAWING-WEAPON";
  if (piece === "Q" && captured && captured.t === "Q" && evalCp != null && Math.abs(evalCp) <= 40) return "DRAWING-WEAPON";
  if (name && /\bAnti[-\s]/i.test(name)) return "ANTI-";
  if (captured && ((piece === "B" && captured.t === "N") || (piece === "N" && captured.t === "B"))) return "IMBALANCE";
  if (piece === "P" && capture) return "OPEN";
  if (piece === "P" && !capture && info && after) {
    const [r, c] = info.to, front = after[r + fwd] && after[r + fwd][c];
    const own = (rr, cc) => cc >= 0 && cc < 8 && after[rr] && after[rr][cc] && after[rr][cc].t === "P" && after[rr][cc].c === color;
    if (front && front.t === "P" && front.c === enemy && (own(r - fwd, c - 1) || own(r - fwd, c + 1))) return "CLOSED";   // 막힌 데다 뒤에서 내 폰이 받쳐 사슬이 됨
    const hits = [c - 1, c + 1].some((cc) => cc >= 0 && cc < 8 && after[r + fwd] && after[r + fwd][cc] && after[r + fwd][cc].t === "P" && after[r + fwd][cc].c === enemy);
    if (hits) return "SWITCH";
  }
  if (check || capture) return "STRAIGHT-LINE";
  if (/^O-O/.test(san)) return "INTUITIVE";
  if (info && /^[NB]/.test(san) && info.from && info.from[0] === (color === "w" ? 7 : 0)) return "INTUITIVE";
  if (prevSan && mirror(prevSan) === strip(san)) return "BALANCE";
  if (book && adopt != null && adopt >= 30) return "MAIN-LINE";
  if (book && adopt != null && adopt < 5) return "SIDESTEPPING";
  if (quiet && lossCp != null && lossCp <= 30 && nearBest != null && nearBest >= 3) return "FLEXIBLE";
  if (quiet && lossCp != null && lossCp <= 30) return "QUIET";
  return "NORMAL";
}
// 수 블록·현재 수 블록·집중 분석·도감이 함께 쓰는 표시용 목록(키워드 하나). assignTiers가 붙인 m.kwAuto만 쓴다 — 예전 m.kw(개발자 지정·정적 데이터)는 보지 않는다.
export const blockKeywords = (m) => (m && typeof m.kwAuto === "string" ? [m.kwAuto] : []);
