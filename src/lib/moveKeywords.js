// (v0.7.6, 사용자 요청) 수 키워드 자동 부여 — 개발자가 수마다 키워드를 손으로 지정하던 기능(analysis.jsx 이름·키워드 편집, CONTENT.keywords)을 없애고,
// 수 블록으로 표시되는 모든 수에 그 포지션을 직접 분석해 키워드 "하나"를 붙인다. 순수 함수라 scripts/check-move-keywords.mjs가 시험한다.
// 규칙(위에서부터 먼저 맞는 하나) — 1차안, 사용자와 협의하며 조정한다:
//   1. TRICKY        기물 희생(isSacrifice)인데 최선과의 차이가 0.5 이하 — 함정·희생을 노리는 까다로운 수
//   2. LOW-LEVEL     최선보다 1.5 이상 나쁨 — 낮은 레벨에서 주로 보이는 수
//   3. TOP LEVEL     이 포지션의 최선(평가 1위)이면서 마스터 채택률 25% 이상 또는 마스터 상위 3수
//   4. SHARP         체크·체크메이트 — 상대의 응수를 강제하는 날카로운 수
//   5. STRAIGHT-LINE 기물을 잡는 수 — 이후 수순이 단순·강제적
//   6. INTUITIVE     캐슬링 또는 첫 줄의 나이트·비숍을 처음 꺼내는 발전 수 — 의도가 바로 보이는 수
//   7. MAIN-LINE     이론 수 중 가장 많이 두어지는 수(채택률 30% 이상)
//   8. SIDESTEPPING  이론 수인데 채택률 5% 미만 — 잘 알려지지 않은 사이드라인
//   9. QUIET         최선과의 차이 0.3 이하인 조용한 수(잡기·체크 아님)
//  10. NORMAL        그 밖의 모든 수
// 입력값이 아직 없으면(평가 계산 중) 그 조건만 건너뛴다 — 평가가 들어오면 다시 계산된다.
import { sanSrc, decorateSan } from "./chessRules.js";
import { isSacrifice } from "./moveQuality.js";

export const AUTO_KEYWORDS = ["TRICKY", "LOW-LEVEL", "TOP LEVEL", "SHARP", "STRAIGHT-LINE", "INTUITIVE", "MAIN-LINE", "SIDESTEPPING", "QUIET", "NORMAL"];

/* board: 수를 두기 전 포지션, color: 두는 쪽("w"|"b"), lossCp: 최선 대비 손실(센티폰, 모르면 null), isBest: 평가 1위인지,
   adopt·masterAdopt: 채택률(%), masterTop: 마스터 상위 3수, book: 이론 수 */
export function autoMoveKeyword({ san, color, board, lossCp = null, isBest = false, adopt = null, masterAdopt = null, masterTop = false, book = false }) {
  if (!san) return "NORMAL";
  let info = null, check = false, sac = false;
  try {
    if (board) {
      info = sanSrc(board, san, color);
      if (info) {
        check = /[+#]$/.test(decorateSan(board, san, color));
        sac = isSacrifice(board, san, color);
      }
    }
  } catch { info = null; }
  if (!check && /[+#]/.test(san)) check = true;
  const capture = info ? !!info.isCap : /x/.test(san);
  if (sac && lossCp != null && lossCp <= 50) return "TRICKY";
  if (lossCp != null && lossCp >= 150) return "LOW-LEVEL";
  if (isBest && (masterTop || (masterAdopt != null && masterAdopt >= 25))) return "TOP LEVEL";
  if (check) return "SHARP";
  if (capture) return "STRAIGHT-LINE";
  if (/^O-O/.test(san)) return "INTUITIVE";
  if (info && board && /^[NB]/.test(san)) {
    const backRank = color === "w" ? 7 : 0;
    if (info.from && info.from[0] === backRank) return "INTUITIVE";
  }
  if (book && adopt != null && adopt >= 30) return "MAIN-LINE";
  if (book && adopt != null && adopt < 5) return "SIDESTEPPING";
  if (lossCp != null && lossCp <= 30) return "QUIET";
  return "NORMAL";
}
// 수 블록·현재 수 블록·집중 분석·도감이 함께 쓰는 표시용 목록(키워드 하나). assignTiers가 붙인 m.kwAuto만 쓴다 — 예전 m.kw(개발자 지정·정적 데이터)는 보지 않는다.
export const blockKeywords = (m) => (m && typeof m.kwAuto === "string" ? [m.kwAuto] : []);
