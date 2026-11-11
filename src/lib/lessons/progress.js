// (v0.7.5) 레슨 진행 기록 — 순수 함수. 상태 = { done: { 레슨 id: 완료 시각(ms) } }.
//  잠금 규칙: 커리큘럼 순서대로 하나씩 열린다(바로 앞 레슨을 끝내야 다음 레슨). 끝낸 레슨은 언제든 다시 할 수 있다.
import { allLessons } from "./curriculum.js";

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
/** 지금 할 레슨(아직 안 끝낸 첫 레슨). 다 끝냈으면 null. */
export function nextLesson(state) {
  return allLessons().find((l) => !isLessonDone(state, l.id)) || null;
}
/** 레슨 상태: "done" | "current"(지금 할 레슨) | "open"(열렸지만 지금 할 레슨은 아님 — 끝낸 레슨 뒤 다시 하기용) | "locked" */
export function lessonStatus(state, id) {
  if (isLessonDone(state, id)) return "done";
  const nx = nextLesson(state);
  return nx && nx.id === id ? "current" : "locked";
}
/** 프로필 공개용 요약 — 예전 mainQuestSummary와 같은 모양({ claimed, totalChapters })을 유지해 다른 버전 클라이언트도 그대로 읽는다. */
export function lessonSummary(state) {
  const all = allLessons();
  const claimed = all.filter((l) => isLessonDone(state, l.id)).length;
  return { claimed, totalChapters: all.length, doneItems: claimed, totalItems: all.length };
}
