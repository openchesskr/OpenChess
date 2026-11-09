// (v0.7.4, 사용자 요청) 학습 탭 성장 분석용 자동 리뷰 — 최근 대국을 사용자가 열어 보지 않아도 엔진이 백그라운드에서 리뷰해 결과를 리뷰 화면과 같은 캐시(reviewCache.js)에 저장한다.
// 순서: ① 이 기기 캐시(깊이 무관, 수 개수만 일치하면 사용) → ② chess.com 대국이면 서버 공유 캐시(엔진 불필요) → ③ 엔진 분석(사용자가 설정한 리뷰 속도 그대로) 후 저장·공유.
// 같은 대국을 동시에 두 번 분석하지 않도록 진행 중인 분석은 키별로 한 번만 만든다. 분석은 중간에 멈출 수 없어서(analyzeGame), 화면이 사라져도 그 한 판은 끝까지 하고 캐시에 남긴다.
import { analyzeGame, REVIEW_DEPTH, REVIEW_MOVETIME_MS } from "./common.jsx";
import { reviewDepthFor, QUICK_REVIEW_MOVETIME_MS } from "../lib/prefs.js";
import { reviewResultStorageKey, loadCachedReviewResult, saveCachedReviewResult, reviewedAnalysisFetch, reviewedAnalysisShare, ocAnalysisShare } from "./reviewCache.js";

const isOcId = (id) => /^(pvp|bot)-/.test(String(id || ""));
const inflight = new Map();

export const reviewKeyOf = (game) => reviewResultStorageKey(game);
/* 이미 캐시에 있는 이 대국의 리뷰 결과(없으면 null). */
export function cachedReviewOf(game) {
  const key = reviewKeyOf(game);
  return key ? loadCachedReviewResult(key, game.sans ? game.sans.length : null, null) : null;
}
/* 이 대국의 리뷰 결과를 보장한다 — 캐시·공유 캐시에 있으면 그것, 없으면 엔진 분석. 엔진이 아직 준비되지 않았으면 null(준비되면 다시 부른다). */
export function ensureReview(game, { engine, reviewSpeed, quick }) {
  const key = reviewKeyOf(game);
  if (!key) return Promise.resolve(null);
  const hit = cachedReviewOf(game);
  if (hit) return Promise.resolve(hit);
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const len = game.sans.length;
    if (game.id && !isOcId(game.id)) {
      const remote = await reviewedAnalysisFetch(game.id, len, null);
      if (remote) { saveCachedReviewResult(key, remote, REVIEW_DEPTH); return remote; }
    }
    if (!engine || engine.status !== "ready") return null;
    const depth = reviewDepthFor(reviewSpeed, quick);
    const movetime = quick ? QUICK_REVIEW_MOVETIME_MS : reviewSpeed === "accurate" ? Math.round(REVIEW_MOVETIME_MS * 2.5) : REVIEW_MOVETIME_MS;
    const r = await analyzeGame(game.sans, engine, depth, undefined, movetime, undefined, null);
    if (!r) return null;
    saveCachedReviewResult(key, r, depth);
    // depth가 낮은 결과(더 빠르게)는 다른 사람과 공유하는 분석에 올리지 않는다(리뷰 화면과 같은 규칙, BUG-095).
    if (depth >= REVIEW_DEPTH) { if (isOcId(game.id)) ocAnalysisShare(game.sans, r, depth); else if (game.id) reviewedAnalysisShare(game.id, r, depth); }
    return r;
  })().catch(() => null).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
