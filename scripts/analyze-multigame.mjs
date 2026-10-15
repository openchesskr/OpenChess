#!/usr/bin/env node
/** (v0.6.7) 여러 판을 합친 퍼포먼스 레이팅의 환산 오차 연구. 한 선수의 판이 많은 표본(chesscom-games-study.ndjson → calibrate-performance 분석 → perf-calibration-study-v2.ndjson)으로:
 *   ① 오차를 "같은 선수의 판마다 달라지는 부분(선수 내)"과 "선수마다 일정하게 다른 부분(선수 간 — 판을 아무리 합쳐도 안 줄어드는 바닥)"으로 나눈다(대국 단위가 아니라 선수 단위 부트스트랩 신뢰구간 포함).
 *   ② 선수당 k판을 무작위로 뽑아 합쳤을 때의 실제 오차(레이팅 환산 RMSE)를 k별로 잰다 — 합산 방식 두 가지: 판별 지표의 평균 / 수를 합쳐서 한 번에 계산.
 *  환산은 본 보정 표본(chess.com v2)에서 구한 지표-레이팅 기울기로 한다(연구 표본만으로는 기울기가 불안정하다). 연구 표본에 들어 있는 대국이 본 표본과 겹치면 연구 쪽에서 뺀다.
 *  사용법: node scripts/analyze-multigame.mjs [연구 분석.ndjson=scripts/calibration/perf-calibration-study-v2.ndjson]   옵션: MIN_GAMES=8(선수당 최소 판 수) · DRAWS=200 · GAMES_FILE=연구 대국 파일(선수 이름 매핑)
 */
import { readFileSync, existsSync } from "node:fs";
import { robustAccuracy } from "../src/lib/performanceRating.js";

const here = (p) => new URL(p, import.meta.url).pathname;
const studyPath = process.argv[2] || here("./calibration/perf-calibration-study-v2.ndjson");
const MIN_GAMES = +(process.env.MIN_GAMES || 8), DRAWS = +(process.env.DRAWS || 200);
const rd = (p) => readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const rand = rng(5);

// 지표: 수별 기록 배열 → 숫자(클수록 좋음). 합산 "수 합치기"는 두 진영의 수를 이어 붙여 같은 함수를 적용한다.
const W = { best: 0, only: 0, brilliant: 0, excellent: 22, good: 52, inaccuracy: 85, mistake: 150, blunder: 320, miss: 120 };
const STATS = {
  "티어 ACPL(상한 150)": (moves) => { const k = moves.filter((m) => m[0] !== "book" && m[2] != null); return k.length ? -mean(k.map((m) => Math.min(150, W[m[0]] ?? 50))) : null; },
  "산술·40": (moves) => robustAccuracy(moves, 40, 1),
  "화면 정확도식(조화·22)": (moves) => robustAccuracy(moves, 22, -1),
};

// 본 보정 표본(chess.com v2)의 기울기
const mainPath = here("./calibration/perf-calibration-chesscom-v2.ndjson");
const mainRecs = existsSync(mainPath) ? rd(mainPath) : [];
const mainIds = new Set(mainRecs.map((r) => r.id));
const mainSides = mainRecs.flatMap((r) => [r.w, r.b]).filter((s) => s.counts.evidence >= 20 && s.moves && s.elo > 0);
if (mainSides.length < 200) { console.error("본 보정 표본(chess.com v2)이 부족해 기울기를 구할 수 없음"); process.exit(1); }
function slopeOf(f) { const x = mainSides.map((s) => s.elo), y = mainSides.map((s) => f(s.moves)); const mx = mean(x), my = mean(y); let a = 0, b = 0; x.forEach((v, i) => { a += (v - mx) * (y[i] - my); b += (v - mx) ** 2; }); return { sl: a / b, ic: my - (a / b) * mx }; }

// 연구 표본: 선수별 판 목록
if (!existsSync(studyPath)) { console.error("연구 분석 파일이 없음: " + studyPath); process.exit(1); }
const gamesPath = process.env.GAMES_FILE || here("./calibration/chesscom-games-study.ndjson");
const names = Object.fromEntries(rd(gamesPath).map((g) => [g.id, g]));
const by = {};
for (const r of rd(studyPath)) {
  if (mainIds.has(r.id)) continue;
  const g = names[r.id]; if (!g) continue;
  for (const [s, who] of [[r.w, g.wName], [r.b, g.bName]]) if (s.counts.evidence >= 20 && s.moves && s.elo > 0) (by[who] = by[who] || []).push(s);
}
const players = Object.entries(by).filter(([, a]) => a.length >= MIN_GAMES);
console.log(`연구 표본: 선수 ${Object.keys(by).length}명 중 ${MIN_GAMES}판 이상 ${players.length}명 (판 수 평균 ${players.length ? mean(players.map(([, a]) => a.length)).toFixed(1) : 0}) · 본 표본 기울기용 진영 ${mainSides.length}개`);
if (players.length < 12) { console.error(`※ 선수가 ${players.length}명뿐이라 선수 간 차이를 추정할 수 없음 — 분석이 더 쌓인 뒤 다시 실행`); process.exit(2); }

function decompose(P, f, slope) {   // P: [[sides…], …]
  const E = P.map((a) => a.map((s) => (f(s.moves) - slope.ic - slope.sl * s.elo) / slope.sl));
  let ws = 0, wn = 0; for (const e of E) { const m = mean(e); ws += e.reduce((s, v) => s + (v - m) ** 2, 0); wn += e.length - 1; }
  const sw2 = ws / wn, means = E.map(mean), mm = mean(means);
  const sb2 = Math.max(0, mean(means.map((v) => (v - mm) ** 2)) - sw2 * mean(E.map((e) => 1 / e.length)));
  return { within: Math.sqrt(sw2), between: Math.sqrt(sb2) };
}
const KS = [1, 2, 4, 8].filter((k) => k <= MIN_GAMES);
console.log(`\n지표                    선수 내(한 판 흔들림)   선수 간(바닥) [95% 구간]    k판 합산 오차(점): 평균 방식 / 수 합치기 방식`);
for (const [name, f] of Object.entries(STATS)) {
  const slope = slopeOf(f), P = players.map(([, a]) => a);
  const d = decompose(P, f, slope);
  // 선수 단위 부트스트랩으로 바닥의 신뢰구간
  const bs = []; for (let i = 0; i < 400; i++) { const S = []; for (let k = 0; k < P.length; k++) S.push(P[Math.floor(rand() * P.length)]); bs.push(decompose(S, f, slope).between); }
  bs.sort((a, b) => a - b);
  const out = [];
  for (const k of KS) {
    const e1 = [], e2 = [];
    for (const a of P) for (let t = 0; t < DRAWS; t++) {
      const idx = a.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      const pick = idx.slice(0, k).map((i) => a[i]), R = mean(pick.map((s) => s.elo));
      const m1 = mean(pick.map((s) => f(s.moves))), m2 = f(pick.flatMap((s) => s.moves));
      e1.push((m1 - slope.ic - slope.sl * R) / slope.sl); e2.push((m2 - slope.ic - slope.sl * R) / slope.sl);
    }
    const rm = (e) => Math.round(Math.sqrt(mean(e.map((v) => v * v))));
    out.push(`${k}판 ${rm(e1)}/${rm(e2)}`);
  }
  console.log(name.padEnd(22), String(Math.round(d.within)).padStart(10), `${String(Math.round(d.between)).padStart(10)} [${Math.round(bs[Math.floor(bs.length * 0.025)])}~${Math.round(bs[Math.floor(bs.length * 0.975)])}]`.padEnd(26), out.join("   "));
}
