// (v0.7.8, 사용자 요청) 집중 분석 "전체 통계"(api/lichess.js?games=1 → api/_lib/explorerGames.js)의 순수 계산 — 수순 검증, Lichess 탐색기 응답 정리, 화면에 줄 값 만들기.
// scripts/check-explorer-games.mjs가 검사한다.
import { Chess } from "chess.js";

export const EXPLORER_MAX_PLIES = 60;
export const EXPLORER_REFRESH_MS = 6 * 3600 * 1000;   // 같은 수순은 6시간에 한 번만 Lichess에서 새로 받는다(그 사이엔 쌓아 둔 값)

// "e4,e5,Nf3"(쉼표 구분 SAN, 빈 문자열 = 시작 포지션) → 실제로 둘 수 있으면 { sans, uci }(uci = "e2e4,e7e5,g1f3"), 아니면 null.
export function parseExplorerMoves(raw) {
  if (raw == null || raw === "") return { sans: [], uci: "" };
  if (typeof raw !== "string" || raw.length > EXPLORER_MAX_PLIES * 9) return null;
  const toks = raw.split(",");
  if (toks.length > EXPLORER_MAX_PLIES) return null;
  const chess = new Chess();
  const sans = [], uci = [];
  for (const tok of toks) {
    if (!/^[A-Za-z0-9=+#-]{2,8}$/.test(tok)) return null;
    let mv = null;
    try { mv = chess.move(tok); } catch { mv = null; }
    if (!mv) return null;
    sans.push(mv.san); uci.push(mv.from + mv.to + (mv.promotion || ""));
  }
  return { sans, uci: uci.join(",") };
}

const name = (p) => (p && typeof p.name === "string" ? p.name.slice(0, 40) : null);
const rating = (p) => (p && Number.isInteger(p.rating) && p.rating > 0 && p.rating < 4000 ? p.rating : null);
// Lichess 탐색기(lichess DB) 응답 → 저장할 값. topGames는 "top", recentGames는 "recent"(둘 다에 있으면 top).
export function cleanExplorer(j) {
  if (!j || typeof j !== "object") return null;
  const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const moves = (Array.isArray(j.moves) ? j.moves : []).slice(0, 12).filter((m) => m && typeof m.san === "string" && /^[A-Za-z0-9=+#-]{2,8}$/.test(m.san))
    .map((m) => ({ san: m.san, white: n(m.white), draws: n(m.draws), black: n(m.black) }));
  const seen = new Map();
  const take = (list, source) => {
    for (const g of Array.isArray(list) ? list : []) {
      if (!g || typeof g.id !== "string" || !/^[A-Za-z0-9]{8}$/.test(g.id)) continue;
      if (seen.has(g.id)) continue;
      seen.set(g.id, {
        id: g.id, source, white_name: name(g.white), white_rating: rating(g.white), black_name: name(g.black), black_rating: rating(g.black),
        winner: g.winner === "white" || g.winner === "black" ? g.winner : null,
        speed: typeof g.speed === "string" && /^[a-z]{3,16}$/.test(g.speed) ? g.speed : null,
        month: typeof g.month === "string" && /^\d{4}-\d\d$/.test(g.month) ? g.month : null,
        next_uci: typeof g.uci === "string" && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(g.uci) ? g.uci : null,
      });
    }
  };
  take(j.topGames, "top");
  take(j.recentGames, "recent");
  return { white: n(j.white), draws: n(j.draws), black: n(j.black), moves, games: [...seen.values()] };
}

// 저장된 값(explorer_read 결과) → 화면 값. 대국은 게임 id로 중복을 없애고 최고 레이팅 순.
export function explorerView(stored, fresh) {
  const pos = (stored && stored.position) || null;
  const totals = fresh ? { white: fresh.white, draws: fresh.draws, black: fresh.black } : pos ? { white: +pos.white || 0, draws: +pos.draws || 0, black: +pos.black || 0 } : { white: 0, draws: 0, black: 0 };
  const moves = fresh ? fresh.moves : pos && Array.isArray(pos.moves) ? pos.moves : [];
  const byId = new Map();
  for (const g of [...((stored && stored.games) || []).map((x) => ({ ...x, id: x.game_id || x.id })), ...((fresh && fresh.games) || [])]) if (g && g.id && !byId.has(g.id)) byId.set(g.id, g);
  const top = (g) => Math.max(g.white_rating || 0, g.black_rating || 0);
  const games = [...byId.values()].sort((a, b) => top(b) - top(a)).slice(0, 60).map((g) => ({
    id: g.id, source: g.source === "top" ? "top" : "recent", winner: g.winner || null, speed: g.speed || null, month: g.month || null,
    white: { name: g.white_name || "?", rating: g.white_rating || null }, black: { name: g.black_name || "?", rating: g.black_rating || null },
  }));
  const stored_n = Math.max(Number(stored && stored.stored) || 0, games.length);
  return { totals, moves, games, stored: stored_n };
}

// 저장된 값이 오래돼 Lichess에서 다시 받아야 하는지
export const needsRefresh = (stored, now = Date.now()) => {
  const at = stored && stored.position && Date.parse(stored.position.fetched_at);
  return !Number.isFinite(at) || now - at >= EXPLORER_REFRESH_MS;
};

// ── (v0.7.9, 사용자 요청) 전체 통계 대국을 Lichess로 보내지 않고 OpenChess 안에서 보기·리뷰 — 대국 기보를 PGN으로 저장한다(explorer_game_pgns).
// 서버가 lichess.org/game/export/{id}에서 받은 PGN을 chess.js로 처음부터 다시 둬 보고, 표준 체스·정상 수순인 것만 정해진 머리글과 함께 다시 써서 저장한다.
export const EXPLORER_GAME_ID_RE = /^[A-Za-z0-9]{8}$/;
export const EXPLORER_PGN_MAX = 30000;
const PGN_KEEP_TAGS = ["Event", "Date", "White", "Black", "Result", "WhiteElo", "BlackElo", "TimeControl", "ECO", "Opening", "Termination"];
/** Lichess PGN 원문 → { pgn, sans } (정리된 PGN·SAN 수순) 또는 null(변형 체스·시작 포지션 지정·불법 수·너무 김). */
export function cleanGamePgn(text, id) {
  if (typeof text !== "string" || !text.trim() || text.length > 200000 || !EXPLORER_GAME_ID_RE.test(String(id || ""))) return null;
  const chess = new Chess();
  try { chess.loadPgn(text, { strict: false }); } catch { return null; }
  const tags = chess.getHeaders ? chess.getHeaders() : chess.header();
  if ((tags.Variant && tags.Variant !== "Standard") || tags.SetUp === "1" || tags.FEN) return null;
  const sans = chess.history();
  if (!sans.length || sans.length > 600) return null;
  const out = new Chess();
  for (const k of PGN_KEEP_TAGS) {
    const v = typeof tags[k] === "string" ? tags[k].replace(/[\r\n"\\]/g, "").slice(0, 120) : "";
    if (v) out.setHeader ? out.setHeader(k, v) : out.header(k, v);
  }
  out.setHeader ? out.setHeader("Site", "https://lichess.org/" + id) : out.header("Site", "https://lichess.org/" + id);
  for (const s of sans) out.move(s);
  const pgn = out.pgn({ maxWidth: 0, newline: "\n" });
  return pgn.length <= EXPLORER_PGN_MAX ? { pgn, sans } : null;
}
