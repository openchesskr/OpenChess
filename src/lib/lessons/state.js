// (v0.7.9 성능, 번들 분할) 레슨 진행 기록의 가벼운 부분 — 상태 = { done: { 레슨 id: 완료 시각(ms) } }.
// App(첫 화면)·소셜 탭은 저장·완료 표시·요약만 쓰므로 레슨 본문(curriculum.js)이 필요 없다. 다음 레슨·잠금 판정은 progress.js(학습 탭).
import { LESSON_IDS } from "./lessonIds.js";

export function normalizeLessonState(raw) {
  const done = {};
  if (raw && typeof raw === "object" && raw.done && typeof raw.done === "object") {
    for (const [k, v] of Object.entries(raw.done)) if (typeof k === "string" && k.length <= 40) done[k] = typeof v === "number" ? v : 1;
  }
  return { done };
}
export function markLessonDone(state, id) {
  const st = normalizeLessonState(state);
  if (st.done[id]) return st;
  return { done: { ...st.done, [id]: Date.now() } };
}
export const isLessonDone = (state, id) => !!(state && state.done && state.done[id]);
/** 프로필 공개용 요약 — 예전 mainQuestSummary와 같은 모양({ claimed, totalChapters })을 유지해 다른 버전 클라이언트도 그대로 읽는다. */
export function lessonSummary(state) {
  const claimed = LESSON_IDS.filter((id) => isLessonDone(state, id)).length;
  return { claimed, totalChapters: LESSON_IDS.length, doneItems: claimed, totalItems: LESSON_IDS.length };
}
