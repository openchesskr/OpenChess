// (v0.7.5) 레슨 진행 기록 — 순수 함수. 상태 = { done: { 레슨 id: 완료 시각(ms) } }.
//  잠금 규칙: 커리큘럼 순서대로 하나씩 열린다(바로 앞 레슨을 끝내야 다음 레슨). 끝낸 레슨은 언제든 다시 할 수 있다.
import { allLessons } from "./curriculum.js";

// (v0.7.9) 저장·완료 표시·요약은 state.js(레슨 본문 없이 첫 화면에서 쓰는 부분)로 옮기고 여기서 다시 내보낸다.
import { isLessonDone } from "./state.js";
export { normalizeLessonState, markLessonDone, isLessonDone, lessonSummary } from "./state.js";
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
