// (v0.7.1, 사용자 요청) 집중 분석 해설 화면의 "영상" 블록 — 그 수까지의 수순으로 YouTube 영상을 찾는다. 실제 검색은 서버(api/youtube.js)가
// API 키로 하고, 같은 수순은 이 탭 안에서 다시 묻지 않는다(엣지 캐시도 7일). 서버에 키가 없으면 "off"로 블록을 숨긴다.
import { apiUrl } from "./siteConfig.js";

export const YT_MAX_PLIES = 40;   // api/_lib/youtube.js와 같아야 한다
const cache = new Map();          // moves → Promise<{ status, videos }>

// status: "ok" | "off"(서버 미설정) | "busy"(요청이 많음) | "error"
export function searchYoutube(sans) {
  if (!Array.isArray(sans) || !sans.length || sans.length > YT_MAX_PLIES) return Promise.resolve({ status: "ok", videos: [] });
  const moves = sans.map((s) => String(s)).join(",");
  if (cache.has(moves)) return cache.get(moves);
  const p = (async () => {
    try {
      const r = await fetch(apiUrl("/api/youtube?moves=" + encodeURIComponent(moves)));
      if (r.status === 503) return { status: "off", videos: [] };
      if (r.status === 429) return { status: "busy", videos: [] };
      if (!r.ok) return { status: "error", videos: [] };
      const data = await r.json();
      return { status: "ok", videos: Array.isArray(data && data.videos) ? data.videos : [] };
    } catch { return { status: "error", videos: [] }; }
  })();
  cache.set(moves, p);
  // 실패는 기억하지 않는다(다시 시도 가능)
  p.then((v) => { if (v.status !== "ok" && v.status !== "off") cache.delete(moves); });
  return p;
}
export const youtubeWatchUrl = (id) => "https://www.youtube.com/watch?v=" + encodeURIComponent(id);
