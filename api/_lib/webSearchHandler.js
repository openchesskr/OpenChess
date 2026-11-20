// (v0.7.8 BUG-178) 서버리스 함수 개수 제한(Vercel Hobby 12개) 때문에 별도 함수가 아니라 api/youtube.js(?web=1)가 부르는 처리기.
// 원래 설명(v0.7.8, 사용자 요청): 집중 분석 해설 화면 "커뮤니티" 블록 — 그 수의 오프닝 이름(없으면 PGN 수순)으로 웹을 검색한다.
// 설계 요점(api/youtube.js와 같은 방식)
//  · (v0.7.8, 사용자 결정) 검색 서비스는 Tavily — 카드 없이 매달 1,000회 무료(Researcher 요금제, 매월 초기화). Brave는 2026년부터 무료 요금제가 없어지고 카드 등록이 필요해 바꿨다.
//    API 키(TAVILY_API_KEY)는 Vercel 환경변수로만 존재한다. 키가 없으면 503 not_configured(화면은 웹 검색 칸을 조용히 숨긴다).
//  · 받는 값은 moves(쉼표 구분 SAN, chess.js로 검증)와 name(오프닝 이름, 허용 글자·길이 검사) — 임의 검색어 중계 금지. 검색어는 늘 "… chess opening".
//  · (v0.7.9) 결과마다 미리보기 이미지·아이콘·사이트 이름·게시일(withPreviews) — 결과는 최대 WEB_MAX_RESULTS(10)개.
//  · 같은 검색은 엣지에 7일 캐시, IP당 분당 20회·전체 하루 WEB_DAILY_CAP회(무료 1,000회/월 안쪽)로 제한한다. 기본 검색(1회 = 1크레딧)만 쓴다.
import { clientIp, supabaseEnv, rateLimited } from "./server.js";
import { parseMovesParam } from "./youtube.js";
import { parseNameParam, webQuery, cleanWebResults, WEB_MAX_RESULTS, WEB_DAILY_CAP, isPublicHttpUrl, extractPreview, PREVIEW_TIMEOUT_MS, PREVIEW_MAX_BYTES } from "./websearch.js";

// (v0.7.9, 사용자 요청) 구글 검색 결과처럼 미리보기 이미지·아이콘 — 결과 페이지의 <head>를 읽는다. 공개 주소만(리디렉트도 매번 다시 확인, 최대 3번),
// 페이지당 PREVIEW_TIMEOUT_MS, 앞부분 PREVIEW_MAX_BYTES만. 실패하면 미리보기 없이 결과만 둔다(검색 응답 자체는 막지 않는다).
async function readHead(url) {
  const signal = AbortSignal.timeout(PREVIEW_TIMEOUT_MS);
  let cur = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!isPublicHttpUrl(cur)) return null;
    const r = await fetch(cur, { redirect: "manual", signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; OpenChessPreview/1.0; +https://openchess.kr)", Accept: "text/html,application/xhtml+xml" } });
    if (r.status >= 300 && r.status < 400) { const loc = r.headers.get("location"); if (!loc) return null; cur = new URL(loc, cur).href; continue; }
    if (!r.ok || !/html/i.test(r.headers.get("content-type") || "") || !r.body) return null;
    const reader = r.body.getReader(); const dec = new TextDecoder(); let html = "", got = 0;
    while (got < PREVIEW_MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length; html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    try { await reader.cancel(); } catch { /* 이미 닫힘 */ }
    return { html, base: cur };
  }
  return null;
}
async function withPreviews(results) {
  return Promise.all(results.map(async (r) => {
    try {
      const page = await readHead(r.url);
      if (!page) return r;
      const p = extractPreview(page.html, page.base);
      return { ...r, image: p.image, icon: p.icon, site: p.siteName || r.site, date: p.date };
    } catch { return r; }
  }));
}

export async function webSearchHandler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "method" }); return; }
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "not_configured" }); return; }
  const sans = parseMovesParam((req.query || {}).moves);
  if (!sans) { res.status(400).json({ error: "invalid_moves" }); return; }
  const name = parseNameParam((req.query || {}).name);
  const env = supabaseEnv();
  if (await rateLimited(env, [["websearch:ip:" + clientIp(req), 20, 60], ["websearch:global", WEB_DAILY_CAP, 86400]])) { res.status(429).json({ error: "rate_limited" }); return; }
  const query = webQuery(sans, name);
  try {
    const upstream = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({ query, search_depth: "basic", max_results: WEB_MAX_RESULTS + 2, include_answer: false, include_raw_content: false, include_images: false }),
    });
    if (!upstream.ok) { res.status(502).json({ error: "upstream" }); return; }
    const results = await withPreviews(cleanWebResults(await upstream.json()));
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=604800, stale-while-revalidate=2592000");
    res.status(200).json({ query, results });
  } catch {
    res.status(502).json({ error: "upstream" });
  }
}
