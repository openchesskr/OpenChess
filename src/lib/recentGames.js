// (v0.7.4, 사용자 요청) 성장 분석의 데이터 원천 — 내가 직접 리뷰하지 않아도, 가장 최근 대국 5판을 컴퓨터가 백그라운드에서 자동으로 리뷰해 분석한다(항상 최신).
// 순수 함수라 scripts/check-growth.mjs가 시험한다. 실제 분석은 app/autoReview.js(엔진·캐시)가 한다.
export const GROWTH_RECENT_GAMES = 5;     // 분석에 쓰는 최근 대국 수(이만큼 있어야 시작)
export const GROWTH_MAX_GAMES = 30;       // (v0.8.1, 사용자 요청) 첫 5판 뒤에도 더 지난 대국을 이어서 분석해 통계에 더하는 상한(기기 저장 공간·배터리를 고려)
export const MIN_GAME_PLIES = 8;
export const RECENT_PERF_MIN_GAMES = 3;   // 퍼포먼스 레이팅: 이보다 적게 합쳐진 값은 보여주지 않는다, 한두 판은 오차가 너무 크다(v0.7.9, recentPerformance.js에서 옮김 — 화면이 계산 모듈 없이 안내 문구를 쓰도록)          // 이보다 짧은 대국(중단·기권)은 분석에서 뺀다

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

// (v0.8.1, BUG-223) 엔진이 평가하지 못한 수가 많은 리뷰 결과인가 — 휴대폰에서 화면을 끄거나 다른 앱으로 넘어가 워커가 멈춘 동안 자동 리뷰가 돌면 포지션 평가가
//  시간 초과로 잇달아 실패하고(analyzeGame은 그런 수를 정확도 없는 "좋음"으로 채운다), 그 결과가 저장돼 성장 분석 통계를 영구히 흐렸다.
//  이 비율을 넘는 결과는 저장하지 않고 나중에 다시 분석한다(app/autoReview.js ensureReview).
export const MAX_FAILED_MOVE_RATIO = 0.2;
export function tooManyFailedMoves(result, maxRatio = MAX_FAILED_MOVE_RATIO) {
  const ms = result && Array.isArray(result.moves) ? result.moves : [];
  if (!ms.length) return true;
  const failed = ms.filter((m) => m && m.kind !== "book" && m.acc == null && m.lossWinPct == null).length;
  return failed / ms.length > maxRatio;
}
