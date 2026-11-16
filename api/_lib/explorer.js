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
