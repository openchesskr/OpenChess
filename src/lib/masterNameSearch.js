// (v0.6.6) 마스터 이름 검색 순위 — 학습 탭 "마스터 스타일"의 비교 검색 규칙을 그대로 공용화했다(집중 분석 마스터 통계 검색도 같이 쓴다).
//  영문 이름에서 "맨 앞 일치 → 단어 앞 일치 → 포함 일치" 순서, 같은 순위 안에서는 eloOf 높은 순. 개수 제한은 두지 않는다(드롭다운이 스크롤).
export const normName = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** items: 아무 객체 배열. enOf(x) = 표시용 영문 이름, rawOf(x) = 원본 표기(DB "Carlsen,M" 등), eloOf(x) = 동순위 정렬용(선택). */
export function rankMasterMatches(items, query, enOf, rawOf, eloOf = () => 0) {
  const q = normName(query).trim();
  if (!q) return [];
  const scored = [];
  for (const x of items) {
    const nm = normName(enOf(x)), raw = normName(rawOf(x));
    const rank = nm.startsWith(q) || raw.startsWith(q) ? 0 : nm.split(" ").some((w) => w.startsWith(q)) ? 1 : nm.includes(q) || raw.includes(q) ? 2 : -1;
    if (rank >= 0) scored.push([rank, x]);
  }
  return scored.sort((a, b) => a[0] - b[0] || (eloOf(b[1]) || 0) - (eloOf(a[1]) || 0)).map((e) => e[1]);
}
