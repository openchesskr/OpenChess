// (v0.7.4) 게임 리뷰 결과의 저장·조회·공유 — review.jsx 안에 있던 것을 꺼내 학습 탭의 자동 리뷰(autoReview.js)와 같이 쓴다.
// 로컬(이 기기) 캐시 → chess.com 대국이면 서버 공유 캐시(reviewed_games) → 없으면 분석. 같은 키를 쓰므로 자동으로 한 리뷰를 리뷰 화면에서 열면 바로 보인다.
import { SB_ON, sbSelect, sbRpc } from "../lib/supabaseClient.js";
import { REVIEW_RESULT_CACHE_VERSION, reviewStorageKey, reviewPut, recordReviewSummary } from "./common.jsx";
import { fixForcedOnlyMoves } from "../lib/moveQuality.js";

// 로컬(이 기기·브라우저) 캐시 — sessionStorage(탭 닫으면 사라짐)가 아니라 localStorage(브라우저를
// 껐다 켜도 남음)를 쓴다, "다시 열 때마다"라는 신고가 새로고침뿐 아니라 다른 날 다시 들어와도
// 재현되므로. reviewStorageKey와 같은 식별 방식(선수+종료 시각 / id / fenRoot+sans)을 재사용한다.
export function reviewResultStorageKey(game) {
  const posKey = reviewStorageKey(game);
  return posKey ? posKey.replace("oc-review-pos:", "oc-review-result:") : null;
}
// (v0.3.9 기능) "더 빠르게"/"더 정확하게"(depth 20/25)가 서로 다른 분석 결과를 만들어내므로, 캐시된
// 결과가 지금 선택된 속도와 다른 depth로 분석된 것이면(예: depth 20으로 캐시돼 있는데 방금 "더
// 정확하게"로 바꿈) 재사용하지 않고 새로 분석한다 — depth는 저장된 값에 함께 실어(`d`) 대조한다.
// (포지션 변동성 보정 on/off는 여기 영향을 안 준다 — 분석 자체가 아니라 이미 저장된 손실·날카로움
// 값을 최종 정확도로 변환하는 단계에서만 갈리므로, 캐시된 원본 그대로 재사용해도 무방하다.)
export function loadCachedReviewResult(storageKey, expectedLen, depth) {
  if (!storageKey) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== REVIEW_RESULT_CACHE_VERSION || !parsed.result) return null;
    if (depth != null && parsed.d !== depth) return null;
    if (expectedLen != null && (!parsed.result.moves || parsed.result.moves.length !== expectedLen)) return null;
    return fixForcedOnlyMoves(parsed.result);   // (v0.7.5) 강제 수를 유일한 수로 매긴 예전 결과 바로잡기
  } catch { return null; }
}
// (v0.7.7 BUG-095) 캐시된 결과가 어떤 깊이로 분석됐는지(없으면 null) — 퍼포먼스 레이팅은 곡선을 맞춘 깊이(REVIEW_DEPTH) 이상만 합산한다.
export function loadCachedReviewDepth(storageKey) {
  if (!storageKey) return null;
  try { const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "null"); return parsed && Number.isFinite(parsed.d) ? parsed.d : null; } catch { return null; }
}
export function saveCachedReviewResult(storageKey, result, depth) {
  if (!storageKey || !result) return;
  recordReviewSummary(storageKey, result); // 결과 캐시와 별개로 정확도·탁월·유일 개수 요약을 남긴다(저장 실패해도 요약은 유지)
  try { window.localStorage.setItem(storageKey, JSON.stringify({ v: REVIEW_RESULT_CACHE_VERSION, d: depth, result })); } catch { }
}
// chess.com 대국(game.id 있음)은 크라우드소싱 캐시(reviewed_games, puzzles 테이블과 같은 패턴)에도
// 함께 올려 둔다 — 다른 기기·다른 유저가 같은 대국을 리뷰로 열어도 항상 같은 값을 보게 하기 위함
// (이것도 "재현성" 신고를 해결하는 데 필요하다 — 로컬 캐시만으로는 이 기기에서만 일관될 뿐이다).
export async function reviewedAnalysisFetch(ccId, expectedLen, depth) {
  if (!SB_ON || !ccId) return null;
  try {
    const rows = await sbSelect("reviewed_games?cc_id=eq." + ccId + "&select=analysis&limit=1");
    const a = rows && rows[0] ? rows[0].analysis : null;
    if (!a || a.v !== REVIEW_RESULT_CACHE_VERSION || !a.result) return null;
    if (depth != null && a.d !== depth) return null;
    if (expectedLen != null && (!a.result.moves || a.result.moves.length !== expectedLen)) return null;
    return fixForcedOnlyMoves(a.result);
  } catch { return null; }
}
export async function reviewedAnalysisShare(ccId, result, depth) {
  if (!SB_ON || !ccId || !result) return;
  // (v0.5.7 BUG-023) reviewed_analysis_put RPC로 — 비어 있거나 더 새 버전·더 깊은 분석일 때만 바뀐다.
  const analysis = { v: REVIEW_RESULT_CACHE_VERSION, d: depth, result };
  // (v0.7.0 보안 BUG-115) 서버 API(/api/review-put)를 거친다 — 로그인 필요, 호출 제한, 크기·형식 검증.
  await reviewPut("analysis", ccId, analysis);
}
// (v0.6.7) OpenChess 대국(실시간·봇)의 분석도 서버에 올려 둔다, 프로필의 "최근 N판 퍼포먼스 레이팅"이 읽는다. 서버(game_analysis_put)가 기보로 "내가 참가한 같은 대국"을 찾아 묶고,
// 내 OpenChess 대국이 아니면(PGN 붙여넣기·남의 대국) 아무 일도 하지 않는다. 실패는 조용히 무시.
export async function ocAnalysisShare(sans, result, depth) {
  if (!SB_ON || !Array.isArray(sans) || !sans.length || !result) return;
  try { await sbRpc("game_analysis_put", { p_sans: sans, p_analysis: { v: REVIEW_RESULT_CACHE_VERSION, d: depth, result } }); } catch { }
}
