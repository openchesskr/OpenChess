// (v0.6.6) 대국의 대회 이름(event) → 도감 마스터 트리의 { 대회 id, 연도 }. 색인은 scripts/build-event-index.mjs가 만든다.
// 같은 이름이 여러 회차에 있으면(드물다) 대국 연도에 가장 가까운 회차를 고른다. 색인에 없으면 null — 화면에서 링크가 아닌 글자로만 보인다.
import EVENT_INDEX from "../data/eventIndex.json";
const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
export function tournamentOfEvent(event, year) {
  const list = EVENT_INDEX.events[norm(event)]; if (!list || !list.length) return null;
  let best = list[0];
  if (year) for (const x of list) if (Math.abs(x[1] - year) < Math.abs(best[1] - year)) best = x;
  return { tourId: best[0], year: best[1] };
}
