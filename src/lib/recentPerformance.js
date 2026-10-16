// (v0.6.7) 프로필의 "최근 N판 퍼포먼스 레이팅" — 분석이 저장된 대국만 모아 pooledPerformance(src/lib/performanceRating.js)로 합산한다.
// 한 판의 값은 오차가 ±1000점 안팎이라 보여주지 않고, 여러 판의 수를 합쳐야 쓸 만해진다(연구: 판 수의 제곱근에 비례해 줄어듦).
import { sansToFen } from "./chessRules.js";
import { bookPositionKey, isEcoBookPosition } from "./ecoBook.js";
import { ecoHash } from "./ecoHash.js";
import { PERF, countSideMoves, bookNodesOfLine, openingTermFromLine, timeProfile, pooledPerformance } from "./performanceRating.js";
import PERF_CURVE from "../data/performanceCurve.json";
import OPENING_STRENGTH from "../data/openingStrength.json";

export const RECENT_PERF_N = 10;        // 합산할 최근 대국 수(분석이 저장된 대국만 센다)
export const RECENT_PERF_MIN_GAMES = 3; // 이보다 적게 합쳐진 값은 보여주지 않는다 — 한두 판은 오차가 너무 크다

// 분석된 대국 하나 → 합산 입력. moves = analyzeGame 결과의 moves(양 진영), mineWhite = 내가 백인지, game = { timeClass, white, black, … }.
export function sidePerfInput(moves, mineWhite, game, curve = PERF_CURVE, strength = OPENING_STRENGTH) {
  const side = (moves || []).filter((m) => m && m.white === mineWhite);
  let opening = 0;
  if (countSideMoves(side).book > 0) {
    try {
      const nodes = bookNodesOfLine(moves.map((m) => m.san), sansToFen, bookPositionKey, ecoHash, isEcoBookPosition);
      opening = openingTermFromLine(nodes, mineWhite ? "w" : "b", strength);
    } catch { opening = 0; }
  }
  const tp = timeProfile(game, curve);
  return { moves: side, opening, timeShift: tp.shift, forceProvisional: tp.provisional };
}

// items: 최신 대국이 앞에 오는 [{ game, moves(분석 결과) }] — game.color("w"|"b")가 내 진영. 반환: null(합산할 판이 부족) | pooledPerformance 결과.
export function recentPerformance(items, n = RECENT_PERF_N, minGames = RECENT_PERF_MIN_GAMES, curve = PERF_CURVE, strength = OPENING_STRENGTH) {
  const inputs = [];
  for (const it of items || []) {
    if (!it || !it.moves || !it.game) continue;
    const inp = sidePerfInput(it.moves, it.game.color === "w", it.game, curve, strength);
    if (countSideMoves(inp.moves).evidence < PERF.POOL_MIN_EVIDENCE) continue;   // 너무 짧은 판은 "최근 N판"에 세지 않는다
    inputs.push(inp);
    if (inputs.length >= n) break;
  }
  if (inputs.length < minGames) return null;
  return pooledPerformance(inputs, PERF, curve);
}
