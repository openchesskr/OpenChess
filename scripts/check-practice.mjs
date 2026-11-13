#!/usr/bin/env node
/** (v0.7.6, 사용자 요청) 학습 탭 맞춤 학습(src/lib/practicePlan.js) — 성장 분석의 약점과 이어지는 실수 복습·추천 레슨.
 *  복습 순서(승률을 많이 잃은 수부터, 맞힌 문제는 뒤로), 정답 판정(최선수·좋은 대안 모두 인정, 실전 수는 오답), 레슨 추천(원인·전술·약한 구간 → 실제 있는 레슨)을 시험한다.
 *  실행: node scripts/check-practice.mjs (prebuild로 자동 실행) */
import fs from "node:fs";
import { drillQueue, drillKey, isDrillAnswer, recommendLessons, CAUSE_LESSONS, DETAIL_LESSON, PHASE_LESSONS } from "../src/lib/practicePlan.js";
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const game = { key: "g1", sans: ["e4", "e5", "Nf3", "Nc6"] };
const a = { game, ply: 2, san: "Qh5", best: "Nf3", winBefore: 55, winAfter: 40, alts: [{ san: "Nf3", win: 55 }, { san: "Nc3", win: 53 }, { san: "a4", win: 30 }], kind: "mistake" };
const b = { game, ply: 3, san: "f6", best: "Nc6", winBefore: 50, winAfter: 20, alts: [{ san: "Nc6", win: 50 }], kind: "blunder" };
const noAlt = { game, ply: 1, san: "e5", best: null, winBefore: 50, winAfter: 45, alts: [] };
const g = { badMoves: [a, b, noAlt, { ...a }], causes: [{ key: "allowedTactic" }, { key: "hung" }], focus: { cause: "allowedTactic", detail: "skewer" }, weakPhase: { key: "end" } };
const q = drillQueue(g);
ok(q.length === 2, "정답 후보가 없는 실수·같은 문제 중복은 빼야 함(" + q.length + ")");
ok(q[0].m === b, "승률을 더 많이 잃은 실수가 먼저");
const q2 = drillQueue(g, new Set([drillKey(b)]));
ok(q2[0].m === a && q2[1].done, "맞힌 문제는 뒤로");
ok(isDrillAnswer(a, "Nf3") && isDrillAnswer(a, "Nc3") && isDrillAnswer(a, "Nf3+"), "최선수·좋은 대안(승률 차이 작음)·체크 표기 모두 정답");
ok(!isDrillAnswer(a, "Qh5") && !isDrillAnswer(a, "a4") && !isDrillAnswer(a, ""), "실전 수·나쁜 대안·빈 값은 오답");
const recs = recommendLessons(g, { max: 6 });
ok(recs[0] && recs[0].id === "t_skewer", "가장 자주 나온 전술(스큐어)에 맞는 레슨이 맨 앞(" + (recs[0] && recs[0].id) + ")");
ok(recs.some((r) => r.id === "t_hanging"), "기물 방치 → 기물 지키기 레슨 추천");
ok(new Set(recs.map((r) => r.id)).size === recs.length, "같은 레슨을 두 번 추천하지 않음");
const doneFirst = recommendLessons(g, { isDone: (id) => id === "t_skewer" });
ok(doneFirst[0].id !== "t_skewer" && doneFirst.length <= 4, "끝낸 레슨은 뒤로, 기본 최대 4개");
ok(recommendLessons({ causes: [], weakPhase: { key: "end" } })[0].why.kind === "phase", "원인이 없으면 약한 구간으로 추천");
ok(recommendLessons(null).length === 0 && drillQueue(null).length === 0, "분석이 없으면 빈 목록");
// 추천하는 모든 레슨 id가 실제 커리큘럼(서버 보상 목록 seedChapters)에 있어야 한다.
const sql = fs.readFileSync(new URL("../supabase-setup.sql", import.meta.url), "utf8");
const seed = JSON.parse((/"seedChapters": (\{[^}]*\})/.exec(sql) || [0, "{}"])[1]);
const ids = new Set([...Object.values(CAUSE_LESSONS).flat(), ...Object.values(DETAIL_LESSON), ...Object.values(PHASE_LESSONS).flat()]);
for (const id of ids) ok(id in seed, "추천 레슨 '" + id + "'이 커리큘럼(seedChapters)에 없음");
if (fails.length) { console.error("✗ check-practice 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-practice: 실수 복습 순서·정답 판정, 약점 → 레슨 추천(" + ids.size + "개 레슨 연결) 유지");
