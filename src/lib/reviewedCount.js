// (v0.7.4, 사용자 요청) 성장 분석의 데이터 원천 — "내가 리뷰한 대국". 순수 함수(저장소를 인자로 받음)라 scripts/check-growth.mjs가 가짜 저장소로 검사한다.
// 이 기기에 저장된 리뷰 결과(oc-review-result:*)를 읽는다. 항목 형식: { v, d, result, m? } — m(메타)은 리뷰 화면이 결과를 저장·열 때 함께 남긴다:
//   m = { color: "w"|"b"(내 진영), endTime(초), opening, white, black, id, owner(리뷰를 연 쪽 아이디, 소문자) }
// "내 대국"의 기준(남의 프로필에서 연 대국·PGN·남의 대국이 내 성장에 섞이지 않게):
//  · chess.com 대국 — 키(cc:흰선수|검은선수|종료시각)의 양쪽 이름 중 하나가 내 아이디(names)와 같다(대소문자 무시). 진영은 이름으로 정한다.
//  · 그 밖(OpenChess 대국 등) — 메타가 있고 m.owner가 내 아이디(names)와 같다. 메타가 없는 옛 항목은 진영을 알 수 없어 세지 않는다(다시 열면 메타가 붙는다).
// 결과 형식(버전·수 목록)이 맞는 것만 센다.
export const GROWTH_MIN_REVIEWS = 5;
const PREFIX = "oc-review-result:";
const low = (s) => String(s == null ? "" : s).trim().toLowerCase();

export function collectMyReviews({ names, ccName, version, storage }) {
  try {
    const st = storage || (typeof window !== "undefined" ? window.localStorage : null);
    if (!st) return [];
    const mine = new Set([...(names || []), ccName].map(low).filter(Boolean));
    if (!mine.size) return [];
    const out = [];
    for (let i = 0; i < st.length; i++) {
      const k = st.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      let p = null; try { p = JSON.parse(st.getItem(k)); } catch { p = null; }
      if (!p || p.v !== version || !p.result || !Array.isArray(p.result.moves) || !p.result.moves.length) continue;
      const rest = k.slice(PREFIX.length), m = p.m && typeof p.m === "object" ? p.m : null;
      let color = null, owner = m && m.owner || null, white = m && m.white || null, black = m && m.black || null, endTime = m && m.endTime || null;
      if (rest.startsWith("cc:")) {
        const parts = rest.slice(3).split("|");
        white = white || parts[0] || null; black = black || parts[1] || null; endTime = endTime || Number(parts[2]) || null;
        if (mine.has(low(parts[0]))) { color = "w"; owner = low(parts[0]); } else if (mine.has(low(parts[1]))) { color = "b"; owner = low(parts[1]); }
      } else if (m && (m.color === "w" || m.color === "b") && mine.has(low(m.owner))) color = m.color;
      if (!color) continue;
      out.push({ key: k, color, owner, endTime: endTime ? Number(endTime) : null, white, black, id: (m && m.id) || null, opening: (m && m.opening) || null, result: p.result });
    }
    out.sort((a, b) => (a.endTime || 0) - (b.endTime || 0));
    return out;
  } catch { return []; }
}
export function countMyReviewedGames(opts) { return collectMyReviews(opts).length; }
