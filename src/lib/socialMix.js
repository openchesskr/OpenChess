// (v0.7.6, 사용자 요청) 소셜 탭 피드 — 퍼즐과 유산 게시물을 한 줄로 섞는다. 순수 함수라 scripts/check-social-feed.mjs가 시험한다.
// 규칙: 퍼즐 PUZZLES_PER_LEGACY(2)개마다 유산 1개. 한쪽이 바닥나면 남은 쪽을 그대로 이어 붙인다. 순서는 각 목록의 순서(퍼즐은 정렬·필터 결과, 유산은 최신순)를 지킨다.
export const FEED_KINDS = ["all", "puzzle", "legacy"];
export const PUZZLES_PER_LEGACY = 2;
// 반환: [{ type: "puzzle", key, p } | { type: "legacy", key, post }]
export function mixFeed(puzzles, legacies, kind = "all") {
  const P = (puzzles || []).filter((p) => p && p.id != null).map((p) => ({ type: "puzzle", key: "p:" + p.id, p }));
  const L = (legacies || []).filter((x) => x && x.owner && x.id).map((post) => ({ type: "legacy", key: "l:" + post.owner + ":" + post.id, post }));
  if (kind === "puzzle") return P;
  if (kind === "legacy") return L;
  const out = []; let i = 0, j = 0;
  while (i < P.length || j < L.length) {
    for (let k = 0; k < PUZZLES_PER_LEGACY && i < P.length; k++) out.push(P[i++]);
    if (j < L.length) out.push(L[j++]);
  }
  return out;
}
