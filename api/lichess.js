// Vercel 서버리스 함수: 브라우저 대신 Lichess Opening Explorer를 호출한다.
// Lichess가 Explorer API에 로그인(OAuth 토큰)을 요구하게 되면서, 토큰을 브라우저에
// 그대로 노출할 수 없어 이 프록시를 거친다 — 토큰은 Vercel 환경변수(LICHESS_TOKEN)로만 존재.
export default async function handler(req, res) {
  const { master, pgn, ...params } = req.query;
  const token = process.env.LICHESS_TOKEN;
  const headers = { "User-Agent": "openchess-explorer-proxy/1.0" };
  if (token) headers.Authorization = "Bearer " + token;

  // 마스터 대국 하나의 전체 기보(PGN)를 조회하는 경로 — 집중학습에서 대국을 클릭했을 때 사용.
  // lila-openingexplorer는 "/masters/pgn/{id}"(현재 경로)와 "/master/pgn/{id}"(구버전 호환 경로)를
  // 둘 다 같은 핸들러로 서비스한다. 현재 경로를 우선 시도하고, 실패하면 구버전 경로로 한 번 더 시도한다.
  if (pgn) {
    const id = encodeURIComponent(pgn);
    try {
      let upstream = await fetch("https://explorer.lichess.org/masters/pgn/" + id, { headers });
      if (!upstream.ok) upstream = await fetch("https://explorer.lichess.org/master/pgn/" + id, { headers });
      const body = await upstream.text();
      res.status(upstream.status);
      res.setHeader("content-type", upstream.headers.get("content-type") || "application/x-chess-pgn");
      res.send(body);
    } catch (e) {
      res.status(502).json({ error: String(e) });
    }
    return;
  }

  const base = master === "1"
    ? "https://explorer.lichess.org/masters"
    : "https://explorer.lichess.org/lichess";
  const url = base + "?" + new URLSearchParams(params).toString();
  try {
    const upstream = await fetch(url, { headers });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
    // (사용자 요청, 성능 개선) Lichess Opening Explorer 자체가 포지션 통계를 즉석에서 집계하느라
    // 5~10초씩 걸리는 경우가 많아, 채택률 카운팅 애니메이션이 그만큼 늦게 시작되던 근본 원인이었다.
    // 같은 포지션(수순)은 어느 사용자가 조회하든 응답이 사실상 동일하므로, 이 프록시 응답에
    // Vercel Edge Network가 캐싱할 수 있도록 헤더를 붙인다 — 최초 한 번만 느리고, 그 뒤로는 같은
    // 포지션을 누가 조회하든(수 블록 목록이 흔히 찾는 초반 오프닝일수록 효과가 큼) 엣지에서 즉시
    // 응답해 애니메이션이 거의 지연 없이 시작된다.
    if (upstream.ok) res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800");
    res.send(body);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
