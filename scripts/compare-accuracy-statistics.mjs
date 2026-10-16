#!/usr/bin/env node
/** (v0.6.7) 퍼포먼스 레이팅 입력 지표 비교. scripts/calibrate-performance.mjs(v2)가 저장한 수별 기록으로 수별 정확도를 모으는 방식(하한 × 거듭제곱 평균)을 바꿔 가며
 *  같은 대국에서 다음을 비교한다, 어느 방식을 PERF.SOFT_FLOOR·SOFT_POWER로 쓸지 정하는 근거.
 *   · 한 판 잡음(레이팅 환산) = 레이팅을 통제한 잔차 표준편차 ÷ 레이팅에 대한 기울기. 작을수록 같은 판 수로 레이팅을 더 잘 가려낸다.
 *   · 블런더 1개의 비용(레이팅 환산) = 같은 레이팅대에서 (블런더 0개 판 − 1개 판)의 평균 지표 차이 ÷ 기울기. "블런더의 영향을 줄인다"가 얼마나 줄었는지를 점으로 본다.
 *   · 교차검증 오차 = 지표로 레이팅을 예측한 오차(5-fold, 대국 단위).
 *  모델: 지표 = a + b·(레이팅) + δ·[마스터]. 레이팅은 chess.com 래피드 척도(마스터는 FIDE 오프셋 -34). 표본이 한쪽 출처뿐이어도 동작한다.
 *  사용법: node scripts/compare-accuracy-statistics.mjs [입력.ndjson ...]   (기본: scripts/calibration/*-v2.ndjson)
 */
import { readFileSync, existsSync } from "node:fs";
import { robustAccuracy } from "../src/lib/performanceRating.js";

const here = (p) => new URL(p, import.meta.url).pathname;
let inputs = process.argv.slice(2);
if (!inputs.length) inputs = [here("./calibration/perf-calibration-v2.ndjson"), here("./calibration/perf-calibration-chesscom-v2.ndjson")].filter(existsSync);
const OFFSET = -34, MIN_EVIDENCE = 20;
const recs = inputs.flatMap((f) => readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((r) => r && r.w && r.w.moves));
const base = [];
for (const r of recs) for (const s of [r.w, r.b]) {
  if (s.counts.evidence < MIN_EVIDENCE || !(s.elo > 0)) continue;
  const cc = r.pool === "chesscom";
  base.push({ game: r.id, R: cc ? s.elo : s.elo + OFFSET, masters: cc ? 0 : 1, moves: s.moves, bl: s.counts.blunder, shown: s.acc });
}
if (base.length < 60) { console.error(`표본이 너무 적음(${base.length}개 진영). v2 분석 결과가 더 쌓인 뒤 다시 실행.`); process.exit(1); }
console.error(`대국 ${recs.length}판 · 진영 ${base.length}개 (마스터 ${base.filter((p) => p.masters).length}, chess.com ${base.filter((p) => !p.masters).length})`);

function ols(X, y) { const k = X[0].length; const M = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  for (let i = 0; i < X.length; i++) for (let a = 0; a < k; a++) { for (let b = 0; b < k; b++) M[a][b] += X[i][a] * X[i][b]; M[a][k] += X[i][a] * y[i]; }
  for (let i = 0; i < k; i++) { let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]]; for (let r = i + 1; r < k; r++) { const f = M[r][i] / M[i][i]; for (let c = i; c <= k; c++) M[r][c] -= f * M[i][c]; } }
  const b = new Array(k).fill(0); for (let i = k - 1; i >= 0; i--) { let t = M[i][k]; for (let j = i + 1; j < k; j++) t -= M[i][j] * b[j]; b[i] = t / M[i][i]; } return b; }
const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const hasM = base.some((p) => p.masters) && base.some((p) => !p.masters);
const games = [...new Set(base.map((p) => p.game))], fold = new Map(games.map((g, i) => [g, i % 5]));

function evaluate(floor, power) {
  const P = base.map((p) => ({ ...p, S: robustAccuracy(p.moves, floor, power) })).filter((p) => p.S != null);
  const X = P.map((p) => (hasM ? [1, p.R, p.masters] : [1, p.R])), y = P.map((p) => p.S);
  const b = ols(X, y), res = P.map((p, i) => p.S - X[i].reduce((s, v, j) => s + v * b[j], 0));
  const slope = b[1], sigma = Math.sqrt(res.reduce((s, v) => s + v * v, 0) / P.length);
  // 같은 레이팅대(300점 구간, chess.com)에서 블런더 0개 대비 1개의 지표 차이
  const diffs = []; for (let lo = 400; lo < 2500; lo += 300) { const q = P.filter((p) => !p.masters && p.R >= lo && p.R < lo + 300); const z = q.filter((p) => p.bl === 0), o = q.filter((p) => p.bl === 1); if (z.length >= 6 && o.length >= 6) diffs.push(mean(z.map((p) => p.S)) - mean(o.map((p) => p.S))); }
  // 교차검증: 지표 → 레이팅 예측
  const pred = new Array(P.length);
  for (let f = 0; f < 5; f++) { const tr = P.map((p, i) => i).filter((i) => fold.get(P[i].game) !== f), bb = ols(tr.map((i) => (hasM ? [1, P[i].S, P[i].masters] : [1, P[i].S])), tr.map((i) => P[i].R)); P.forEach((p, i) => { if (fold.get(p.game) === f) pred[i] = bb[0] + bb[1] * p.S + (hasM ? bb[2] * p.masters : 0); }); }
  const rmse = Math.sqrt(P.reduce((s, p, i) => s + (p.R - pred[i]) ** 2, 0) / P.length);
  return { floor, power, slope: slope * 100, sigma, noise: sigma / slope, blCost: diffs.length ? mean(diffs) / slope : NaN, blDrop: diffs.length ? mean(diffs) : NaN, rmse };
}
const rows = [];
for (const power of [-1, 0, 1]) for (const floor of [22, 30, 40, 50, 60, 70, 80]) rows.push(evaluate(floor, power));
const label = (p) => (p === -1 ? "조화" : p === 0 ? "기하" : "산술");
console.log("지표             │ 기울기(%p/100점) │ 한 판 잡음(점) │ 블런더 1개 −%p │ 블런더 1개 −점 │ 교차검증 오차(점)");
for (const r of rows) console.log(`${label(r.power)}평균·하한 ${String(r.floor).padStart(2)} │ ${r.slope.toFixed(2).padStart(10)}       │ ${String(Math.round(r.noise)).padStart(8)}       │ ${r.blDrop.toFixed(1).padStart(8)}      │ ${String(Math.round(r.blCost)).padStart(8)}      │ ${String(Math.round(r.rmse)).padStart(8)}`);
const cur = rows.find((r) => r.power === -1 && r.floor === 22);
console.log(`\n현재 방식(조화·하한 22) 대비: 블런더 1개 비용 ${Math.round(cur.blCost)}점, 한 판 잡음 ${Math.round(cur.noise)}점, 교차검증 오차 ${Math.round(cur.rmse)}점`);
