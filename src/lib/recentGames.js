// (v0.7.4, 사용자 요청) 성장 분석의 데이터 원천 — 내가 직접 리뷰하지 않아도, 가장 최근 대국 5판을 컴퓨터가 백그라운드에서 자동으로 리뷰해 분석한다(항상 최신).
// 순수 함수라 scripts/check-growth.mjs가 시험한다. 실제 분석은 app/autoReview.js(엔진·캐시)가 한다.
export const GROWTH_RECENT_GAMES = 5;     // 분석에 쓰는 최근 대국 수(이만큼 있어야 시작)
export const MIN_GAME_PLIES = 8;          // 이보다 짧은 대국(중단·기권)은 분석에서 뺀다

/* sources: [{ game, owner }] — game은 chess.com 형태의 대국 객체(moves: SAN 배열, color, result, endTime, white/black{username}, id, opening, timeClass, rating, rules),
   owner는 그 대국에서의 내 아이디(chess.com 아이디 또는 OpenChess 아이디). 반환: 리뷰 화면에 바로 넘길 수 있는 대국 객체(sans 포함) 최근순 최대 n개.
   제외: 진영·수 목록이 없거나 MIN_GAME_PLIES 미만, 변형 체스, 우편(daily) 대국, 같은 대국의 중복. */
export function pickRecentGames(sources, n = GROWTH_RECENT_GAMES) {
  const seen = new Set(), out = [];
  const list = (sources || []).filter((s) => s && s.game && Array.isArray(s.game.moves)).sort((a, b) => (b.game.endTime || 0) - (a.game.endTime || 0));
  for (const { game: g, owner } of list) {
    if ((g.color !== "w" && g.color !== "b") || g.moves.length < MIN_GAME_PLIES) continue;
    if ((g.rules || "chess") !== "chess" || g.timeClass === "daily") continue;
    const id = g.id != null ? String(g.id) : (g.white && g.white.username) + "|" + (g.black && g.black.username) + "|" + g.endTime;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ sans: g.moves, color: g.color, result: g.result, rating: g.rating, timeClass: g.timeClass, opening: g.opening, endTime: g.endTime, username: owner || null, white: g.white, black: g.black, id: g.id });
    if (out.length >= n) break;
  }
  return out;
}

/* 한 판의 분석 기록 — lib/growthAnalysis.js의 analyzeGame이 받는 모양. key는 리뷰 결과 저장 키. */
export function recordOf(game, key, result) {
  return { key, color: game.color, owner: game.username ? String(game.username).toLowerCase() : null, endTime: game.endTime || null,
    white: (game.white && game.white.username) || null, black: (game.black && game.black.username) || null, id: game.id || null, opening: game.opening || null, result };
}
