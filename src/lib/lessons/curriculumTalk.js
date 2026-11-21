// (v0.7.9, 사용자 요청) 레슨 대화 층 — 레슨 본문(curriculum.js·curriculumMore.js) 위에 덧붙이는 두 코치(MILKU·KOKOA)의 대화.
//  ① 여는 대화(recap): 지난 레슨을 짧게 요약하고(제목·한 줄 요약) → 이번 레슨과 어떻게 이어지는지(LINK, 레슨마다 직접 쓴 문장) →
//     지난 레슨의 확인 문제 하나로 복습한 뒤 이번 레슨을 시작한다. 단계가 바뀌는 첫 레슨은 새 단계 소개를 덧붙인다.
//  ② 가르친 뒤 묻기(TEACH): 객관식 질문 바로 앞에, 그 질문의 답이 되는 개념을 대화로 먼저 설명한다(질문 문장으로 찾는다).
//     레슨 본문에서 아직 설명하지 않은 내용을 상식으로 풀게 하지 않기 위해서다. scripts/check-lessons.mjs가 질문마다 앞선 설명이 있는지 검사한다.
//  대사 형식: [누구, 문장] — "m" = MILKU(설명), "k" = KOKOA(질문·맞장구·정리). 문장은 t()로 번역된다.
import { t } from "../i18n.js";
import { variantsOf } from "./variants.js";

export const WHO = { m: "milku", k: "kokoa" };
/** 대사 목록 → 보드 없는 read 스텝들 */
export const talkSteps = (lines) => lines.map(([w, say]) => ({ kind: "read", who: WHO[w] || "milku", say, talk: true }));

/* LINK: 이번 레슨이 지난 레슨과 이어지는 방식 — 레슨 id → 대사
   TEACH: 질문 앞 설명 — 레슨 id → { 몇 번째 질문(0부터, 본문의 객관식 순서): 대사 }
   데이터는 curriculumTalkData.js(대사와 5개 언어 번역을 한 묶음으로 관리해 만든 파일). */
import { LINK, TEACH } from "./curriculumTalkData.js";
export { LINK, TEACH };

/** 여는 대화 + 복습 문제. prev: 바로 앞 레슨(allLessons 항목), prevSteps: 그 레슨의 스텝, newStage: 단계 정보(단계가 바뀌면). */
export function recapSteps(lesson, prev, prevSteps, newStage) {
  const out = [];
  if (newStage) out.push(...talkSteps([["k", t("새 단계 「{0}」에 들어왔어요.", newStage.title())], ["m", t("이번 단계의 주제는 이거예요. 「{0}」", newStage.desc())]]));
  if (prev) {
    out.push(...talkSteps([["k", t("지난 레슨 「{0}」, 기억나요?", prev.title())], ["m", t("핵심은 이 한 줄이었어요. 「{0}」", prev.sub())]]));
    const link = LINK[lesson.id];
    if (link) out.push(...talkSteps(link()));
    // 지난 레슨의 확인 문제 하나(보드 없는 것을 먼저) — 복습
    const qs = (prevSteps || []).filter((s) => s.kind === "choice" && !s.review && !s.recap);
    const q = qs.find((s) => !s.fen) || qs[0];
    if (q) out.push(...talkSteps([["k", t("시작하기 전에 지난 레슨 복습 문제 하나!")]]), { ...q, recap: true, who: "kokoa" });
    else {
      // 지난 레슨에 객관식이 없으면 수 두기 문제 하나를 대칭 변형으로 복습한다.
      const mv = (prevSteps || []).find((s) => s.kind === "move" && !s.review && s.fen);
      const v = mv ? variantsOf(mv)[0] || mv : null;
      if (v) out.push(...talkSteps([["k", t("시작하기 전에 지난 레슨 복습 문제 하나!")]]),
        { ...v, recap: true, say: t("지난 레슨의 문제예요. 설명 없이 풀어 보세요."), line: v.line.map((g) => ({ ...g, say: g.say ? t("설명 없이 다음 수를 두세요.") : undefined })) });
    }
  }
  out.push(...talkSteps([["m", t("좋아요. 이번 레슨 「{0}」, 시작할게요.", lesson.title())]]));
  return out;
}

/** 본문에 TEACH 대사를 끼워 넣는다 — 질문 바로 앞(이미 같은 대사가 있으면 넣지 않는다). */
export function withTeach(lessonId, steps) {
  const table = TEACH[lessonId]; if (!table) return steps;
  const out = []; let n = 0;
  for (const s of steps) {
    if (s.kind === "choice" && !s.recap && !s.review) { const f = table[n++]; if (f) out.push(...talkSteps(f())); }
    out.push(s);
  }
  return out;
}
