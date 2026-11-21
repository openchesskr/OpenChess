// (v0.7.9, 사용자 요청) 레슨 예상 플레이 시간(초) — "레슨 하나는 최소 1분 이상". check-lessons가 모든 레슨에 대해 확인한다.
//  보수적인 어림값: 읽기는 한국어 초당 12자 + 넘김 2초, 수 두기는 목표 하나당 7초, 칸 누르기 6초, 객관식은 질문·보기 읽기 + 고르기 3초.
const read = (s) => String(s || "").length / 12;
export function stepSeconds(s) {
  if (s.kind === "read") return 2 + read(s.say);
  if (s.kind === "move") return read(s.say) + 7 * Math.max(1, (s.line || []).length);
  if (s.kind === "tap") return read(s.say) + 6;
  if (s.kind === "choice") return 3 + read(s.say) + read((s.options || []).join(" "));
  return 2;
}
export const lessonSeconds = (steps) => Math.round(steps.reduce((a, s) => a + stepSeconds(s), 0));
export const LESSON_MIN_SECONDS = 60;
