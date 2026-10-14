#!/usr/bin/env node
/** (v0.6.7) 퍼포먼스 레이팅 불변식 검사(prebuild). src/lib/performanceRating.js의 상수를 어떻게 조정해도 아래 성질은 깨지면 안 된다:
 *   ① 정확도가 오르면 점수가 내려가지 않는다(R(A) 곡선이 단조 증가, 구간별 앵커 순서).
 *   ② 같은 정확도에서 근거 수(n)가 늘면 점수가 올라간다(정확도 > 0).
 *   ③ 이론 수·탁월·유일이 늘면 점수가 올라가고, 블런더가 늘면 내려간다. 블런더는 개수가 늘수록 한 개당 더 아프다.
 *   ④ 오프닝 항은 ±OPENING_MAX 안, 총점은 [FLOOR, CAP] 안.
 *   ⑤ 근거 수가 0이면 점수를 만들지 않는다(null).
 *   ⑥ 오프닝 데이터: 이론 연속 구간 계산이 실제 ECO 목록에서 동작하고, openingStrength.json 형식이 맞다.
 *   ⑦ 곡선 파일(performanceCurve.json): 보정된 곡선도 ①②를 지키고, 기준 길이(refMoves)에서 곡선 값이 그대로 나오고, 정확도가 실측 구간 밖이면 provisional이며,
 *      보정 당시의 정확도 계산 지문이 지금과 같다(정확도 계산이 바뀌었는데 곡선을 안 맞추면 빌드 실패).
 */
import { readFileSync } from "node:fs";
import { PERF, RA_ANCHORS, ratingFromAccuracy, performanceRating, countSideMoves, openingTerm, bookNodesOfLine, openingTermFromLine, isCurveCalibrated } from "../src/lib/performanceRating.js";
import { accuracyFingerprint } from "./lib/accuracyFingerprint.mjs";
import { sansToFen } from "../src/lib/chessRules.js";
import { bookPositionKey, ecoHash } from "../src/lib/ecoHash.js";

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };
const rp = (acc, c, opening = 0) => performanceRating({ acc, counts: { evidence: 20, book: 0, brilliant: 0, only: 0, blunder: 0, ...c }, opening });

// ① 앵커 순서 + 단조
for (let i = 1; i < RA_ANCHORS.length; i++) ok(RA_ANCHORS[i][0] > RA_ANCHORS[i - 1][0] && RA_ANCHORS[i][1] > RA_ANCHORS[i - 1][1], `RA_ANCHORS ${i}번째가 증가하지 않음`);
ok(RA_ANCHORS[0][0] === 0 && RA_ANCHORS[RA_ANCHORS.length - 1][0] === 100, "RA_ANCHORS가 정확도 0~100을 덮지 않음");
for (let a = 0; a < 100; a += 0.5) ok(ratingFromAccuracy(a + 0.5) >= ratingFromAccuracy(a), `R(A)가 ${a}→${a + 0.5}에서 줄어듦`);
for (let a = 0; a < 100; a += 1) { const lo = rp(a, {}), hi = rp(a + 1, {}); ok(hi.rating >= lo.rating, `정확도 ${a}→${a + 1}에서 점수가 줄어듦`); }

// ② n 증가
for (const a of [10, 40, 60, 80, 95]) for (let n = 1; n < 120; n++) {
  const lo = performanceRating({ acc: a, counts: { evidence: n, book: 0, brilliant: 0, only: 0, blunder: 0 } });
  const hi = performanceRating({ acc: a, counts: { evidence: n + 1, book: 0, brilliant: 0, only: 0, blunder: 0 } });
  ok(hi.rating >= lo.rating, `정확도 ${a}에서 n ${n}→${n + 1}에 점수가 줄어듦`);
}
ok(rp(85, {}).rating > performanceRating({ acc: 85, counts: { evidence: 5, book: 0, brilliant: 0, only: 0, blunder: 0 } }).rating, "정확도 85에서 n=20이 n=5보다 높지 않음");

// ③ 항별 방향
for (let k = 0; k < 30; k++) {
  ok(rp(80, { book: k + 1 }).rating >= rp(80, { book: k }).rating, `이론 ${k}→${k + 1}에 점수가 줄어듦`);
  ok(rp(80, { brilliant: k + 1 }).rating >= rp(80, { brilliant: k }).rating, `탁월 ${k}→${k + 1}에 점수가 줄어듦`);
  ok(rp(80, { only: k + 1 }).rating >= rp(80, { only: k }).rating, `유일 ${k}→${k + 1}에 점수가 줄어듦`);
  ok(rp(80, { blunder: k + 1 }).rating <= rp(80, { blunder: k }).rating, `블런더 ${k}→${k + 1}에 점수가 늘어남`);
}
ok(rp(80, { brilliant: 1 }).rating > rp(80, {}).rating, "탁월 1개가 점수를 올리지 못함");
ok(rp(80, { blunder: 1 }).rating < rp(80, {}).rating, "블런더 1개가 점수를 내리지 못함");
{ const d = (b) => rp(80, { blunder: b }).blunder; ok(d(2) - d(1) > d(1) - d(0) && d(3) - d(2) > d(2) - d(1), "블런더 한 개당 감점이 개수에 따라 커지지 않음"); }
ok(rp(80, { brilliant: 1 }).quality >= rp(80, { only: 1 }).quality, "탁월 1개가 유일 1개보다 낮게 반영됨");

// ④ 범위
for (const a of [0, 20, 50, 80, 100]) for (const c of [{}, { book: 40, brilliant: 20, only: 20 }, { blunder: 40 }]) {
  const r = rp(a, c, 999);
  ok(r.rating >= PERF.FLOOR && r.rating <= PERF.CAP, `총점이 범위 밖: acc ${a}, ${JSON.stringify(c)} → ${r.rating}`);
  ok(Math.abs(r.opening) <= PERF.OPENING_MAX + 1e-9, "오프닝 항이 상한을 넘음");
}
ok(Math.abs(openingTerm([100000, 99999], 2500)) <= PERF.OPENING_MAX && Math.abs(openingTerm([100000, 1], 2500)) <= PERF.OPENING_MAX, "openingTerm이 상한을 넘음");
ok(openingTerm([1000, 2700], 2500) > 0 && openingTerm([1000, 2300], 2500) < 0 && openingTerm(null, 2500) === 0, "openingTerm 방향/빈 값 처리 오류");
ok(Math.abs(openingTerm([2, 2800], 2500)) < Math.abs(openingTerm([2000, 2800], 2500)), "표본이 적은 포지션이 표본 많은 포지션만큼 크게 반영됨");

// ⑤ 근거 없음
ok(performanceRating({ acc: null, counts: { evidence: 10 } }) === null, "정확도가 없는데 점수가 나옴");
ok(performanceRating({ acc: 90, counts: { evidence: 0, book: 10 } }) === null, "근거 수 0인데 점수가 나옴");

// countSideMoves: 평가 안 끝난 수는 증거가 아님, 이론은 따로 센다
{
  const c = countSideMoves([{ kind: "book" }, { kind: "good", lossWinPct: null }, { kind: "brilliant", lossWinPct: 0 }, { kind: "only", lossWinPct: 0 }, { kind: "blunder", lossWinPct: 30 }, { kind: "best", lossWinPct: 0 }]);
  ok(c.book === 1 && c.evidence === 4 && c.brilliant === 1 && c.only === 1 && c.blunder === 1, `countSideMoves 집계 오류: ${JSON.stringify(c)}`);
}

// ⑥ 오프닝 데이터
{
  const eco = JSON.parse(readFileSync(new URL("../src/data/ecoBook.json", import.meta.url), "utf8"));
  const set = new Set((eco.hashes || "").split(" ").filter(Boolean));
  const isBook = (key) => set.has(ecoHash(key));
  const nodes = bookNodesOfLine(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"], sansToFen, bookPositionKey, ecoHash, isBook);
  ok(nodes.length >= 5, `루이 로페스 수순이 이론으로 잡히지 않음(${nodes.length}수)`);
  const nonBook = bookNodesOfLine(["h4", "a5", "Rh3", "a4", "Rg3", "a3", "Rg4"], sansToFen, bookPositionKey, ecoHash, isBook);
  ok(nonBook.length < 7, "이론이 아닌 수순이 끝까지 이론으로 잡힘");
  const last = nodes[nodes.length - 1];
  const strength = { globalMean: 2500, entries: { ["w:" + last.key]: [500, 2700], ["b:" + last.key]: [500, 2300] } };
  ok(openingTermFromLine(nodes, "w", strength) > 0 && openingTermFromLine(nodes, "b", strength) < 0, "진영별 오프닝 항이 통계 방향과 다름");
  ok(openingTermFromLine(nodes, "w", { globalMean: 2500, entries: {} }) === 0 && openingTermFromLine([], "w", strength) === 0, "통계가 없는데 오프닝 항이 0이 아님");
  const file = JSON.parse(readFileSync(new URL("../src/data/openingStrength.json", import.meta.url), "utf8"));
  ok(file && typeof file.entries === "object" && file.entries !== null, "openingStrength.json 형식 오류(entries 없음)");
  for (const [k, v] of Object.entries(file.entries)) { if (!/^[wb]:[0-9a-z]+$/.test(k) || !Array.isArray(v) || v.length !== 2 || !(v[0] > 0) || !(v[1] > 0)) { fails.push(`openingStrength.json 항목 형식 오류: ${k}`); break; } }
  if (Object.keys(file.entries).length) ok(file.globalMean > 0, "openingStrength.json에 항목이 있는데 globalMean이 없음");
}

// ⑦ 곡선 파일
{
  const rpc = (curve, acc, c) => performanceRating({ acc, counts: { evidence: 30, book: 0, brilliant: 0, only: 0, blunder: 0, ...c } }, PERF, curve);
  const synth = { anchors: [[0, 100], [87, 2300], [93, 2850], [100, 3400]], refMoves: 30, calibratedRange: [87, 93] };
  ok(isCurveCalibrated(synth) && !isCurveCalibrated({ anchors: null }) && !isCurveCalibrated(null), "isCurveCalibrated 판정 오류");
  ok(rpc(null, 90).provisional === true && rpc({ anchors: null }, 90).provisional === true, "곡선이 없는데 provisional이 아님");
  ok(rpc(synth, 90).provisional === false && rpc(synth, 80).provisional === true && rpc(synth, 97).provisional === true, "실측 구간 안/밖 provisional 판정 오류");
  ok(Math.abs(rpc(synth, 90).base - ratingFromAccuracy(90, synth.anchors)) < 1e-9, "기준 길이(refMoves)에서 곡선 값이 그대로 나오지 않음");
  for (let a = 0; a < 100; a += 1) ok(rpc(synth, a + 1).rating >= rpc(synth, a).rating, `곡선 사용 시 정확도 ${a}→${a + 1}에서 점수가 줄어듦`);
  for (const a of [20, 70, 90, 98]) for (let n = 1; n < 100; n++) {
    const lo = performanceRating({ acc: a, counts: { evidence: n, book: 0, brilliant: 0, only: 0, blunder: 0 } }, PERF, synth), hi = performanceRating({ acc: a, counts: { evidence: n + 1, book: 0, brilliant: 0, only: 0, blunder: 0 } }, PERF, synth);
    ok(hi.rating >= lo.rating, `곡선 사용 시 정확도 ${a}에서 n ${n}→${n + 1}에 점수가 줄어듦`);
  }
  const file = JSON.parse(readFileSync(new URL("../src/data/performanceCurve.json", import.meta.url), "utf8"));
  if (isCurveCalibrated(file)) {
    const A = file.anchors;
    ok(A[0][0] === 0 && A[A.length - 1][0] === 100, "곡선 파일 앵커가 정확도 0~100을 덮지 않음");
    for (let i = 1; i < A.length; i++) ok(A[i][0] > A[i - 1][0] && A[i][1] > A[i - 1][1], `곡선 파일 앵커 ${i}번째가 증가하지 않음`);
    ok(A.every(([, y]) => y >= PERF.FLOOR && y <= PERF.CAP), "곡선 파일 앵커가 [FLOOR, CAP] 밖");
    ok(Array.isArray(file.calibratedRange) && file.calibratedRange[0] >= 0 && file.calibratedRange[1] <= 100 && file.calibratedRange[0] < file.calibratedRange[1], "곡선 파일 calibratedRange 오류");
    ok(file.refMoves > 0, "곡선 파일에 refMoves가 없음");
    const fp = accuracyFingerprint();
    ok(file.fingerprint === fp, `정확도 계산이 곡선 보정 이후 바뀜(곡선 ${file.fingerprint} ≠ 현재 ${fp}) — scripts/calibrate-performance.mjs → fit-performance-curve.mjs로 곡선을 다시 맞출 것`);
  } else ok(file && file.anchors === null, "performanceCurve.json 형식 오류(보정 전이면 anchors는 null)");
}

if (fails.length) { console.error("퍼포먼스 레이팅 검사 실패:\n- " + fails.join("\n- ")); process.exit(1); }
console.log("퍼포먼스 레이팅 검사 통과");
