// (v0.7.8 BUG-178) 서버리스 함수 개수 제한(Vercel Hobby 12개) 때문에 별도 함수가 아니라 api/lichess.js(?games=1)가 부르는 처리기.
// 원래 설명(v0.7.8, 사용자 요청): 집중 분석 유저 통계의 "전체 통계" — Lichess 오프닝 탐색기(lichess DB)에서 이 수순의 최고 레이팅 대국·최근 대국을 받아
// OpenChess DB(explorer_games)에 계속 쌓고, 지금까지 쌓인 대국과 Lichess 전체 집계를 함께 돌려준다.
// 설계 요점
//  · 받는 값은 moves(쉼표 구분 SAN, 최대 60수) 하나뿐 — chess.js로 처음부터 둬 보며 검증한다(api/_lib/explorer.js). 임의 쿼리 중계 금지.
//  · 쓰기는 이 함수만(service_role RPC explorer_record) — 브라우저는 표에 접근할 수 없어 가짜 대국을 섞어 넣을 수 없다.
//  · 같은 수순은 6시간에 한 번만 Lichess를 부른다(explorer_positions.fetched_at) — 그 사이 요청은 쌓인 값으로 답한다. IP당 분당 40회, Lichess 호출은 전체 시간당 600회.
//  · DB가 없거나(환경변수 없음) 실패해도 Lichess 응답만으로 답한다(쌓기만 건너뜀).
import { clientIp, supabaseEnv, rateLimited } from "./server.js";
import { parseExplorerMoves, cleanExplorer, explorerView, needsRefresh, cleanGamePgn, EXPLORER_GAME_ID_RE } from "./explorer.js";

const rpc = async (env, fn, body) => {
  const r = await fetch(env.url + "/rest/v1/rpc/" + fn, { method: "POST", headers: { apikey: env.service, Authorization: "Bearer " + env.service, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(fn + " " + r.status);
  return r.json();
};

export async function explorerGamesHandler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "method" }); return; }
  const parsed = parseExplorerMoves((req.query || {}).moves);
  if (!parsed) { res.status(400).json({ error: "invalid_moves" }); return; }
  const env = supabaseEnv();
  if (await rateLimited(env, [["explorer:ip:" + clientIp(req), 40, 60]])) { res.status(429).json({ error: "rate_limited" }); return; }

  let stored = null;
  if (env) { try { stored = await rpc(env, "explorer_read", { p_pos: parsed.uci, p_top: 30, p_recent: 30 }); } catch { stored = null; } }

  let fresh = null;
  if (needsRefresh(stored) && !(await rateLimited(env, [["explorer:upstream", 600, 3600]]))) {
    const token = process.env.LICHESS_TOKEN;
    const headers = { "User-Agent": "openchess-explorer-games/1.0", Accept: "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    const q = new URLSearchParams({ play: parsed.uci, moves: "12", topGames: "4", recentGames: "4" });
    try {
      const up = await fetch("https://explorer.lichess.org/lichess?" + q.toString(), { headers });
      if (up.ok) fresh = cleanExplorer(await up.json());
    } catch { fresh = null; }
    if (fresh && env) {
      try { await rpc(env, "explorer_record", { p_pos: parsed.uci, p_white: fresh.white, p_draws: fresh.draws, p_black: fresh.black, p_moves: fresh.moves, p_games: fresh.games }); } catch { /* 쌓기 실패 — 응답은 그대로 */ }
    }
  }
  if (!stored && !fresh) { res.status(502).json({ error: "upstream" }); return; }
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=600, stale-while-revalidate=3600");
  res.status(200).json(explorerView(stored, fresh));
}

// (v0.7.9, 사용자 요청) 전체 통계 대국의 기보(PGN) — api/lichess.js?gpgn=1&id=<8자리 id>. 보기·리뷰 버튼이 Lichess로 나가지 않고 OpenChess 안에서 연다.
//  · explorer_games에 쌓인 대국만(explorer_pgn_read.known) — 임의 id 중계 금지. 이미 저장된 PGN은 그대로, 없으면 lichess.org/game/export에서 받아
//    chess.js로 검증·정리(cleanGamePgn)한 뒤 저장(explorer_pgn_save)하고 돌려준다. 끝난 대국의 기보는 바뀌지 않으므로 엣지에 30일 캐시.
//  · IP당 분당 30회, Lichess 기보 내려받기는 전체 시간당 300회.
export async function explorerPgnHandler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "method" }); return; }
  const id = String((req.query || {}).id || "");
  if (!EXPLORER_GAME_ID_RE.test(id)) { res.status(400).json({ error: "invalid_id" }); return; }
  const env = supabaseEnv();
  if (!env) { res.status(503).json({ error: "not_configured" }); return; }
  if (await rateLimited(env, [["explorer-pgn:ip:" + clientIp(req), 30, 60]])) { res.status(429).json({ error: "rate_limited" }); return; }
  let row;
  try { row = await rpc(env, "explorer_pgn_read", { p_game: id }); } catch { res.status(502).json({ error: "db" }); return; }
  if (!row || !row.known) { res.status(404).json({ error: "unknown_game" }); return; }
  const done = (pgn) => { res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=2592000, immutable"); res.status(200).json({ id, pgn }); };
  if (typeof row.pgn === "string" && row.pgn) { done(row.pgn); return; }
  if (await rateLimited(env, [["explorer-pgn:upstream", 300, 3600]])) { res.status(429).json({ error: "rate_limited" }); return; }
  const headers = { "User-Agent": "openchess-explorer-games/1.0", Accept: "application/x-chess-pgn" };
  if (process.env.LICHESS_TOKEN) headers.Authorization = "Bearer " + process.env.LICHESS_TOKEN;
  let cleaned = null;
  try {
    const up = await fetch("https://lichess.org/game/export/" + id + "?moves=true&tags=true&clocks=false&evals=false&opening=true&literate=false", { headers, signal: AbortSignal.timeout(8000) });
    if (up.ok) cleaned = cleanGamePgn(await up.text(), id);
  } catch { cleaned = null; }
  if (!cleaned) { res.status(502).json({ error: "upstream" }); return; }
  try { await rpc(env, "explorer_pgn_save", { p_game: id, p_pgn: cleaned.pgn }); } catch { /* 저장 실패 — 응답은 그대로 */ }
  done(cleaned.pgn);
}
