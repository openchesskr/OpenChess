// Vercel 서버리스 함수(v0.7.1, 사용자 요청): 집중 분석 해설 화면 하단 "영상" 블록 — 그 수까지의 PGN 수순("1. e4 e5 2. Nf3")으로 YouTube를 검색한다.
// 설계 요점
//  · API 키(YOUTUBE_API_KEY)는 Vercel 환경변수로만 존재하고 브라우저에 나가지 않는다. 키가 없으면 503 not_configured(화면은 블록을 조용히 숨긴다).
//  · 받는 값은 moves(쉼표로 구분한 SAN, 최대 40수) 하나뿐이고, chess.js로 처음부터 실제로 둬 보며 검증한다 — 임의 검색어 중계 금지.
//  · YouTube 검색 1회 = 하루 쿼터(기본 10,000)의 100 — 같은 수순은 누가 봐도 결과가 같으므로 엣지에 7일 캐시하고, IP당 분당 20회·전체 하루 90회로 제한한다
//    (엣지 캐시에 맞은 요청은 이 함수를 거치지 않아 세지 않는다).
//  · 응답은 영상 id·제목·채널·날짜·썸네일만 모양을 확인해 돌려준다(api/_lib/youtube.js, scripts/check-youtube-search.mjs).
import { clientIp, supabaseEnv, rateLimited } from "./_lib/server.js";
import { parseMovesParam, pgnQuery, cleanResults, YT_MAX_RESULTS } from "./_lib/youtube.js";

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "method" }); return; }
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "not_configured" }); return; }
  const sans = parseMovesParam((req.query || {}).moves);
  if (!sans) { res.status(400).json({ error: "invalid_moves" }); return; }
  const env = supabaseEnv();
  if (await rateLimited(env, [["youtube:ip:" + clientIp(req), 20, 60], ["youtube:global", 90, 86400]])) { res.status(429).json({ error: "rate_limited" }); return; }

  const q = new URLSearchParams({ part: "snippet", type: "video", maxResults: String(YT_MAX_RESULTS), safeSearch: "strict", q: pgnQuery(sans), key: apiKey });
  try {
    const upstream = await fetch("https://www.googleapis.com/youtube/v3/search?" + q.toString());
    if (!upstream.ok) { res.status(502).json({ error: "upstream" }); return; }
    const videos = cleanResults(await upstream.json());
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=604800, stale-while-revalidate=2592000");
    res.status(200).json({ query: pgnQuery(sans), videos });
  } catch {
    res.status(502).json({ error: "upstream" });
  }
}
