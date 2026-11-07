// (v0.7.4, 사용자 요청) 성장 분석이 열리는 조건 — 내가 리뷰한 대국 수. 순수 함수(저장소를 인자로 받음)라 scripts/check-growth.mjs가 가짜 저장소로 검사한다.
// 이 기기에 저장된 리뷰 결과(oc-review-result:*) 중 "내 대국"으로 확실히 알 수 있는 것만 센다:
//  · chess.com 대국 — 키(cc:흰선수|검은선수|종료시각)에 양쪽 이름이 있어 내 chess.com 아이디가 한쪽이면 내 대국(대소문자 무시)
//  · 내 OpenChess 대국 목록에서 연 대국 — id가 pvp-/bot-로 시작
// PGN 붙여넣기·남의 대국·대국 직후 바로 연 리뷰(식별자 없음)는 세지 않는다. 결과 형식(버전·수 목록)이 맞는 것만 센다.
export const GROWTH_MIN_REVIEWS = 5;
const PREFIX = "oc-review-result:";
export function countMyReviewedGames({ ccName, version, storage }) {
  try {
    const st = storage || (typeof window !== "undefined" ? window.localStorage : null);
    if (!st) return 0;
    const me = (ccName || "").trim().toLowerCase();
    let n = 0;
    for (let i = 0; i < st.length; i++) {
      const k = st.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const rest = k.slice(PREFIX.length);
      let mine = false;
      if (rest.startsWith("cc:")) { const parts = rest.slice(3).split("|"); mine = !!me && (String(parts[0]).toLowerCase() === me || String(parts[1]).toLowerCase() === me); }
      else if (rest.startsWith("id:pvp-") || rest.startsWith("id:bot-")) mine = true;
      if (!mine) continue;
      let p = null; try { p = JSON.parse(st.getItem(k)); } catch { p = null; }
      if (p && p.v === version && p.result && Array.isArray(p.result.moves) && p.result.moves.length > 0) n++;
    }
    return n;
  } catch { return 0; }
}
