// (v0.7.8, 사용자 요청) 집중 분석 해설 화면 "커뮤니티" 블록의 웹 검색 — 실제 검색은 서버(api/youtube.js ?web=1 → api/_lib/webSearchHandler.js)가 API 키로 한다.
// 같은 검색은 이 탭 안에서 다시 묻지 않는다(엣지 캐시도 7일). 서버에 키가 없으면 "off"로 웹 검색 칸을 숨긴다.
import { apiUrl } from "./siteConfig.js";
import { YT_MAX_PLIES } from "./youtubeSearch.js";

const cache = new Map();   // moves|name → Promise<{ status, results, query }>
// status: "ok" | "off"(서버 미설정) | "busy"(요청이 많음) | "error"
export function searchWeb(sans, name) {
  if (!Array.isArray(sans) || !sans.length || sans.length > YT_MAX_PLIES) return Promise.resolve({ status: "ok", results: [], query: "" });
  const moves = sans.map((s) => String(s)).join(",");
  const nm = typeof name === "string" ? name.slice(0, 80) : "";
  const k = moves + "|" + nm;
  if (cache.has(k)) return cache.get(k);
  const p = (async () => {
    try {
      const r = await fetch(apiUrl("/api/youtube?web=1&moves=" + encodeURIComponent(moves) + (nm ? "&name=" + encodeURIComponent(nm) : "")));
      if (r.status === 503) return { status: "off", results: [], query: "" };
      if (r.status === 429) return { status: "busy", results: [], query: "" };
      if (!r.ok) return { status: "error", results: [], query: "" };
      const data = await r.json();
      return { status: "ok", results: Array.isArray(data && data.results) ? data.results : [], query: (data && data.query) || "" };
    } catch { return { status: "error", results: [], query: "" }; }
  })();
  cache.set(k, p);
  p.then((v) => { if (v.status !== "ok" && v.status !== "off") cache.delete(k); });
  return p;
}
