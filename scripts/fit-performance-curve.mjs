#!/usr/bin/env node
/** (v0.6.7) 퍼포먼스 레이팅 곡선 R(A) 맞추기. scripts/calibrate-performance.mjs가 쌓은 NDJSON(진영별 레이팅·정확도·수 구성)으로
 *  src/data/performanceCurve.json 을 만든다.
 *
 *  방법: "레이팅이 R인 선수의 기대 정확도"를 먼저 맞추고(A = a + b·(R − 기준)), 그 역함수로 정확도 → 레이팅을 얻는다. 득점률에서 레이팅 차이를 읽는 FIDE 표와
 *  같은 논리다("이 정확도는 어느 레이팅 선수가 평균적으로 내는 값인가"). 반대로 레이팅을 정확도에 회귀하면(R = c + d·A) 정확도의 판마다 흔들림 때문에
 *  기울기가 눌려(회귀 희석) 모든 판이 평균 근처로 몰린다 — 퍼포먼스 레이팅으로는 부적절하다.
 *
 *  보정 범위: 표본이 마스터(2300~2850)뿐이라 그 레이팅에 해당하는 정확도 구간[calibratedRange]만 실측이다. 그 밖은 (0, 하한)·(100, 상한)까지 이은 임시 꼬리이며,
 *  앱은 정확도가 이 구간 밖이면 "보정 전 임시 수치"를 표시한다.
 *  기준 길이: 표본 진영들의 비이론 내 수 개수 중앙값을 refMoves로 곡선 파일에 담는다. 앱은 이 길이의 대국에서 곡선 값이 그대로 나오도록 근거 수 가중치를
 *  w(n)/w(refMoves)로 정규화한다(더 긴 대국은 위로, 더 짧은 대국은 아래로). MIN_EVIDENCE 미만의 짧은 판은 표본에서 뺀다.
 *
 *  사용법: node scripts/fit-performance-curve.mjs [입력.ndjson=scripts/calibration/perf-calibration.ndjson] [--dry]   (--dry: 파일을 쓰지 않고 보고만)
 *  옵션(환경변수): MIN_EVIDENCE=20 · MIN_GAMES=150 · REF_ELO=2550 · BOOT=2000 · OUT=출력 경로(기본 src/data/performanceCurve.json)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { accuracyFingerprint } from "./lib/accuracyFingerprint.mjs";
import { PERF } from "../src/lib/performanceRating.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dry = process.argv.includes("--dry");
const inPath = args[0] || new URL("./calibration/perf-calibration.ndjson", import.meta.url).pathname;
const outPath = process.env.OUT || new URL("../src/data/performanceCurve.json", import.meta.url).pathname;
const env = (k, d) => (process.env[k] ? +process.env[k] : d);
const MIN_EVIDENCE = env("MIN_EVIDENCE", 20), MIN_GAMES = env("MIN_GAMES", 150), REF_ELO = env("REF_ELO", 2550), BOOT = env("BOOT", 2000);
if (!existsSync(inPath)) { console.error("입력 파일이 없음: " + inPath); process.exit(1); }

const recs = readFileSync(inPath, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const pts = [];
for (const r of recs) for (const s of [r.w, r.b]) if (s.acc != null && s.elo > 0 && s.counts.evidence >= MIN_EVIDENCE) pts.push({ x: s.elo - REF_ELO, y: s.acc, n: s.counts.evidence });
const engines = [...new Set(recs.map((r) => `${r.engine} depth ${r.depth} ${r.movetime}ms`))];

// ── 최소제곱: y = a + b·x ──
function ols(p) {
  const n = p.length, mx = p.reduce((s, q) => s + q.x, 0) / n, my = p.reduce((s, q) => s + q.y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0; for (const q of p) { sxx += (q.x - mx) ** 2; sxy += (q.x - mx) * (q.y - my); syy += (q.y - my) ** 2; }
  const b = sxy / sxx, a = my - b * mx;
  const sse = p.reduce((s, q) => s + (q.y - a - b * q.x) ** 2, 0);
  return { a, b, n, sigma: Math.sqrt(sse / Math.max(1, n - 2)), corr: sxy / Math.sqrt(sxx * syy), sdX: Math.sqrt(sxx / n) };
}
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const fit = ols(pts);
// 기울기 부트스트랩 신뢰구간(대국 단위로 다시 뽑는다 — 한 대국의 두 진영은 같은 포지션을 공유하므로 독립이 아니다)
const byGame = recs.map((r) => [r.w, r.b].filter((s) => s.acc != null && s.elo > 0 && s.counts.evidence >= MIN_EVIDENCE).map((s) => ({ x: s.elo - REF_ELO, y: s.acc, n: s.counts.evidence }))).filter((g) => g.length);
const rand = rng(7), bs = [];
for (let i = 0; i < BOOT; i++) { const p = []; for (let k = 0; k < byGame.length; k++) p.push(...byGame[Math.floor(rand() * byGame.length)]); bs.push(ols(p).b); }
bs.sort((u, v) => u - v);
const bLo = bs[Math.floor(BOOT * 0.025)], bHi = bs[Math.floor(BOOT * 0.975)];

const per100 = fit.b * 100;
console.error(`대국 ${recs.length}판 · 진영 ${pts.length}개(근거 수 ≥ ${MIN_EVIDENCE}) · 엔진 ${engines.join(", ")}`);
console.error(`레이팅 ${REF_ELO}에서 기대 정확도 a = ${fit.a.toFixed(2)} · 기울기 100점당 ${per100.toFixed(2)}%p (95% 구간 ${(bLo * 100).toFixed(2)} ~ ${(bHi * 100).toFixed(2)}) · 판별 표준편차 ${fit.sigma.toFixed(2)}%p · 상관 ${fit.corr.toFixed(3)}`);
console.error(`→ 한 판의 정확도 하나가 가리키는 레이팅의 불확실성(±1표준편차)은 약 ${(fit.sigma / fit.b).toFixed(0)}점`);

const fails = [];
if (pts.length < MIN_GAMES * 2 * 0.8) fails.push(`표본이 적음: 진영 ${pts.length}개 (대국 ${MIN_GAMES}판 이상 필요, MIN_GAMES로 조정 가능)`);
if (!(bLo > 0)) fails.push(`기울기의 95% 구간이 0을 포함함(${(bLo * 100).toFixed(2)} ~ ${(bHi * 100).toFixed(2)}%p/100점) — 이 표본으로는 레이팅과 정확도의 관계를 확신할 수 없음. 표본을 더 쌓을 것`);
if (fails.length) { console.error("✖ 곡선을 쓰지 않음:\n  - " + fails.join("\n  - ")); if (!dry) process.exit(1); }
if (dry) process.exit(fails.length ? 1 : 0);

// ── 곡선: 실측 구간 [Elo 2300, 2850] 선형, 밖은 (0, FLOOR)·(100, 상한)으로 이은 꼬리 ──
const eloOf = (A) => REF_ELO + (A - fit.a) / fit.b;
const accOf = (elo) => fit.a + fit.b * (elo - REF_ELO);
const loElo = Math.min(...pts.map((p) => p.x + REF_ELO)), hiElo = Math.max(...pts.map((p) => p.x + REF_ELO));
let Alo = Math.max(0.5, accOf(Math.max(loElo, 2300))), Ahi = Math.min(99.5, accOf(Math.min(hiElo, 2850)));
if (!(Ahi > Alo)) { console.error("✖ 실측 구간이 비정상(Ahi ≤ Alo)"); process.exit(1); }
const top = Math.min(PERF.CAP, Math.max(eloOf(Ahi) + 50, eloOf(100)));
const anchors = [[0, PERF.FLOOR], [round(Alo), round(eloOf(Alo))], [round(Ahi), round(eloOf(Ahi))], [100, round(top)]];
function round(v) { return Math.round(v * 100) / 100; }
for (let i = 1; i < anchors.length; i++) if (!(anchors[i][0] > anchors[i - 1][0] && anchors[i][1] > anchors[i - 1][1])) { console.error("✖ 앵커가 증가하지 않음: " + JSON.stringify(anchors)); process.exit(1); }

const ns = pts.map((q) => q.n).sort((u, v) => u - v), refMoves = ns[Math.floor(ns.length / 2)];
const out = {
  version: 1, fingerprint: accuracyFingerprint(), refElo: REF_ELO, refMoves,
  anchors, calibratedRange: [round(Alo), round(Ahi)],
  fit: { a: round(fit.a), b: Math.round(fit.b * 1e5) / 1e5, bLo: Math.round(bLo * 1e5) / 1e5, bHi: Math.round(bHi * 1e5) / 1e5, sigma: round(fit.sigma), corr: Math.round(fit.corr * 1e3) / 1e3, sides: pts.length, games: recs.length },
  source: engines.join(", "),
};
writeFileSync(outPath, JSON.stringify(out, null, 1) + "\n");
console.error(`✔ ${outPath}\n  앵커 ${JSON.stringify(anchors)} · 실측 정확도 구간 ${out.calibratedRange[0]}~${out.calibratedRange[1]}%`);
