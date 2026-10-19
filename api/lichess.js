// Vercel 서버리스 함수: 브라우저 대신 Lichess Opening Explorer를 호출한다.
// Lichess가 Explorer API에 로그인(OAuth 토큰)을 요구하게 되면서, 토큰을 브라우저에 그대로 노출할 수 없어 이 프록시를 거친다 — 토큰은 Vercel 환경변수(LICHESS_TOKEN)로만 존재.
// (v0.7.0 보안, BUG-116) 예전에는 인증·제한 없이 아무 쿼리나 서버 토큰으로 중계해 누구나 토큰의 호출 한도를 소진시킬 수 있었다. 이제:
//  · 허용 목록의 쿼리 파라미터만 전달한다(그 밖의 값은 버린다).
//  · IP당 분당 90회로 제한한다(DB 카운터 — 인스턴스가 여럿이어도 함께 센다). 엣지 캐시에 맞은 응답은 이 함수를 거치지 않아 세지 않는다.
//  · 퍼즐 가져오기(?puzzle=, 공격 모드 개발자 도구)는 개발자/공동개발자 로그인이 필요하다.
import { clientIp, supabaseEnv, rateLimited, authUser, isEditor } from "./_lib/server.js";

const EXPLORER_PARAMS = new Set(["fen", "play", "variant", "speeds", "ratings", "since", "until", "moves", "topGames", "recentGames", "history"]);

export default async function handler(req, res) {
  const { master, pgn, ...params } = req.query || {};
  const env = supabaseEnv();
  if (await rateLimited(env, [["lichess:ip:" + clientIp(req), 90, 60]])) { res.status(429).json({ error: "rate_limited" }); return; }

  const token = process.env.LICHESS_TOKEN;
  const headers = { "User-Agent": "openchess-explorer-proxy/1.0" };
  if (token) headers.Authorization = "Bearer " + token;

  // 마스터 대국 하나의 전체 기보(PGN)를 조회하는 경로 — 집중학습에서 대국을 클릭했을 때 사용.
  // lila-openingexplorer는 "/masters/pgn/{id}"(현재 경로)와 "/master/pgn/{id}"(구버전 호환 경로)를 둘 다 같은 핸들러로 서비스한다. 현재 경로를 우선 시도하고, 실패하면 구버전 경로로 한 번 더 시도한다.
  if (pgn) {
    const raw = String(pgn);
    if (!/^[A-Za-z0-9_-]{4,16}$/.test(raw)) { res.status(400).json({ error: "invalid id" }); return; }
    const id = encodeURIComponent(raw);
    try {
      let upstream = await fetch("https://explorer.lichess.org/masters/pgn/" + id, { headers });
      if (!upstream.ok) upstream = await fetch("https://explorer.lichess.org/master/pgn/" + id, { headers });
      const body = await upstream.text();
      res.status(upstream.status);
      res.setHeader("content-type", upstream.headers.get("content-type") || "application/x-chess-pgn");
      res.send(body);
    } catch (e) {
      res.status(502).json({ error: "upstream error" });
    }
    return;
  }

  // (v0.5.3 기능) 공격 모드 개발자 도구 — 리체스 퍼즐 API에서 N수 메이트 퍼즐 하나를 가져온다.
  // ?puzzle=next&angle=mateIn2 → /api/puzzle/next?angle=mateIn2, ?puzzle=<id> → /api/puzzle/<id>.
  if (params.puzzle) {
    const user = await authUser(env, req);
    if (!user || !(await isEditor(env, user.id))) { res.status(user ? 403 : 401).json({ error: "developer only" }); return; }
    const id = String(params.puzzle);
    if (id !== "next" && !/^[A-Za-z0-9]{3,12}$/.test(id)) { res.status(400).json({ error: "invalid id" }); return; }
    const angle = params.angle && /^[A-Za-z0-9]{1,24}$/.test(String(params.angle)) ? "?angle=" + encodeURIComponent(String(params.angle)) : "";
    const url = id === "next" ? "https://lichess.org/api/puzzle/next" + angle : "https://lichess.org/api/puzzle/" + encodeURIComponent(id);
    try {
      const upstream = await fetch(url, { headers: { ...headers, Accept: "application/json" } });
      const body = await upstream.text();
      res.status(upstream.status);
      res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
      res.setHeader("cache-control", "no-store");
      res.send(body);
    } catch (e) {
      res.status(502).json({ error: "upstream error" });
    }
    return;
  }

  const base = master === "1"
    ? "https://explorer.lichess.org/masters"
    : "https://explorer.lichess.org/lichess";
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (!EXPLORER_PARAMS.has(k)) continue;
    const val = Array.isArray(v) ? v.join(",") : String(v);
    if (val.length <= 4000) q.set(k, val);
  }
  const url = base + "?" + q.toString();
  try {
    const upstream = await fetch(url, { headers });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
    // (사용자 요청, 성능 개선) Lichess Opening Explorer 자체가 포지션 통계를 즉석에서 집계하느라 5~10초씩 걸리는 경우가 많아, 채택률 카운팅 애니메이션이 그만큼 늦게 시작되던 근본 원인이었다.
    // 같은 포지션(수순)은 어느 사용자가 조회하든 응답이 사실상 동일하므로, 이 프록시 응답에 Vercel Edge Network가 캐싱할 수 있도록 헤더를 붙인다 — 최초 한 번만 느리고, 그 뒤로는 엣지에서 즉시 응답한다.
    if (upstream.ok) res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800");
    res.send(body);
  } catch (e) {
    res.status(502).json({ error: "upstream error" });
  }
}
