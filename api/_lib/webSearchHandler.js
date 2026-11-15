// (v0.7.8 BUG-178) 서버리스 함수 개수 제한(Vercel Hobby 12개) 때문에 별도 함수가 아니라 api/youtube.js(?web=1)가 부르는 처리기.
// 원래 설명(v0.7.8, 사용자 요청): 집중 분석 해설 화면 "커뮤니티" 블록 — 그 수의 오프닝 이름(없으면 PGN 수순)으로 웹을 검색한다.
// 설계 요점(api/youtube.js와 같은 방식)
//  · API 키(BRAVE_SEARCH_API_KEY, Brave Search API)는 Vercel 환경변수로만 존재한다. 키가 없으면 503 not_configured(화면은 웹 검색 칸을 조용히 숨긴다).
//  · 받는 값은 moves(쉼표 구분 SAN, chess.js로 검증)와 name(오프닝 이름, 허용 글자·길이 검사) — 임의 검색어 중계 금지. 검색어는 늘 "… chess opening".
//  · 같은 검색은 엣지에 7일 캐시, IP당 분당 20회·전체 하루 400회로 제한한다.
import { clientIp, supabaseEnv, rateLimited } from "./server.js";
import { parseMovesParam } from "./youtube.js";
import { parseNameParam, webQuery, cleanWebResults, WEB_MAX_RESULTS } from "./websearch.js";

export async function webSearchHandler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "method" }); return; }
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "not_configured" }); return; }
  const sans = parseMovesParam((req.query || {}).moves);
  if (!sans) { res.status(400).json({ error: "invalid_moves" }); return; }
  const name = parseNameParam((req.query || {}).name);
  const env = supabaseEnv();
  if (await rateLimited(env, [["websearch:ip:" + clientIp(req), 20, 60], ["websearch:global", 400, 86400]])) { res.status(429).json({ error: "rate_limited" }); return; }
  const query = webQuery(sans, name);
  const q = new URLSearchParams({ q: query, count: String(WEB_MAX_RESULTS + 2), safesearch: "strict", text_decorations: "false" });
  try {
    const upstream = await fetch("https://api.search.brave.com/res/v1/web/search?" + q.toString(), { headers: { Accept: "application/json", "X-Subscription-Token": apiKey } });
    if (!upstream.ok) { res.status(502).json({ error: "upstream" }); return; }
    const results = cleanWebResults(await upstream.json());
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=604800, stale-while-revalidate=2592000");
    res.status(200).json({ query, results });
  } catch {
    res.status(502).json({ error: "upstream" });
  }
}
