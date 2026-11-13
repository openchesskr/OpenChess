// (v0.7.6, 사용자 요청) 학습 탭 "맞춤 학습" — 성장 분석(최근 5판)의 약점 진단과 이어지는 복습·추가 학습 계획. 순수 함수라 scripts/check-practice.mjs가 시험한다.
//  · 복습(drillQueue): 내 실수·블런더가 나온 포지션을 다시 풀기. 승률을 많이 잃은 수부터, 아직 맞히지 못한 문제를 앞에.
//    정답(isDrillAnswer)은 엔진 최선수와, 최선 후보와 승률 차이가 작은 다른 좋은 수(growthAnalysis.betterMoves) 모두 인정한다.
//  · 추가 학습(recommendLessons): 반복되는 실수 원인·가장 약한 구간을 레슨(src/lib/lessons/curriculum.js)에 이어 추천한다. 끝낸 레슨은 뒤로 미룬다.
import { betterMoves } from "./growthAnalysis.js";

const strip = (s) => String(s || "").replace(/[+#!?]/g, "");
export const drillKey = (m) => (m && m.game ? m.game.key : "") + ":" + (m ? m.ply : "");
const dropOf = (m) => (m.winBefore != null && m.winAfter != null ? Math.max(0, m.winBefore - m.winAfter) : (m.loss || 0));

/* g: buildGrowth 결과, done: 맞힌 문제 키 Set. 반환: [{ m, key, done }] — 정답 후보가 있는 실수만. */
export function drillQueue(g, done = new Set()) {
  if (!g || !Array.isArray(g.badMoves)) return [];
  const seen = new Set(), out = [];
  for (const m of [...g.badMoves].sort((a, b) => dropOf(b) - dropOf(a))) {
    const key = drillKey(m);
    if (seen.has(key) || !m.game || !Array.isArray(m.game.sans) || !betterMoves(m).length) continue;
    seen.add(key);
    out.push({ m, key, done: done.has(key) });
  }
  return [...out.filter((x) => !x.done), ...out.filter((x) => x.done)];
}
export function isDrillAnswer(m, san) {
  const k = strip(san);
  return !!k && betterMoves(m).some((b) => strip(b.san) === k);
}

// 실수 원인 → 레슨(앞에 있을수록 먼저). 전술 원인은 가장 자주 나온 전술(detail)에 맞는 레슨을 맨 앞에 둔다.
export const CAUSE_LESSONS = {
  hung: ["t_hanging", "r_values"],
  allowedTactic: ["t_fork", "t_pin", "t_skewer", "t_discovered"],
  missedTactic: ["t_fork", "t_pin", "t_skewer", "t_discovered"],
  missedWin: ["t_hanging", "t_fork"],
  missedCheck: ["r_check", "t_fork", "t_discovered"],
  allowedMate: ["m_backrank", "r_check", "o_safety"],
  missedMate: ["m_backrank", "m_queen", "m_ladder", "m_smothered"],
  opening: ["o_center", "o_develop", "o_safety", "o_trap"],
  endgame: ["e_square", "e_opposition", "e_rookmate"],
  positional: ["o_develop", "o_center", "o_safety"],
};
export const DETAIL_LESSON = { fork: "t_fork", skewer: "t_skewer", discoveredAttack: "t_discovered", discoveredCheck: "t_discovered", doubleCheck: "t_discovered", pin: "t_pin" };
export const PHASE_LESSONS = { opening: ["o_develop", "o_center", "o_safety"], middle: ["t_fork", "t_pin", "t_hanging"], end: ["e_opposition", "e_square", "e_rookmate"] };

/* g: buildGrowth 결과, isDone(id): 끝낸 레슨인지, has(id): 존재하는 레슨인지. 반환: 최대 max개 [{ id, why: { kind: "cause"|"phase", key, detail? }, done }] */
export function recommendLessons(g, { isDone = () => false, has = () => true, max = 4 } = {}) {
  if (!g) return [];
  const out = [], seen = new Set();
  const push = (id, why) => { if (!id || seen.has(id) || !has(id)) return; seen.add(id); out.push({ id, why, done: !!isDone(id) }); };
  for (const c of (g.causes || []).slice(0, 3)) {
    const detail = g.focus && g.focus.cause === c.key ? g.focus.detail : null;
    if (detail && DETAIL_LESSON[detail]) push(DETAIL_LESSON[detail], { kind: "cause", key: c.key, detail });
    for (const id of CAUSE_LESSONS[c.key] || []) push(id, { kind: "cause", key: c.key });
  }
  if (g.weakPhase) for (const id of PHASE_LESSONS[g.weakPhase.key] || []) push(id, { kind: "phase", key: g.weakPhase.key });
  return [...out.filter((x) => !x.done), ...out.filter((x) => x.done)].slice(0, max);
}
