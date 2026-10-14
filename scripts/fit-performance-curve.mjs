#!/usr/bin/env node
/** (v0.6.7) 퍼포먼스 레이팅 곡선 R(A) 맞추기. scripts/calibrate-performance.mjs가 쌓은 NDJSON(진영별 레이팅·정확도·수 구성)으로 src/data/performanceCurve.json 을 만든다.
 *
 *  방법: "레이팅이 R인 선수의 기대 정확도 f(R)"를 먼저 구하고(포화형 함수 f(R)=c−b·e^(−R/τ)를 최소제곱으로 맞춘다 — 정확도는 레이팅이 오를수록 포화하고,
 *  구성상 단조라 곡선이 들쭉날쭉하지 않다), 그 역함수로 정확도 → 레이팅을 얻는다. 구간별 평균과 어긋나면(모양이 포화형이 아니면) 곡선을 쓰지 않는다. 득점률에서 레이팅 차이를 읽는 FIDE 표와
 *  같은 논리다("이 정확도는 어느 레이팅 선수가 평균적으로 내는 값인가"). 반대로 레이팅을 정확도에 회귀하면(R = c + d·A) 판마다 정확도가 흔들리는 탓에 기울기가 눌려
 *  모든 판이 평균 근처로 몰린다 — 퍼포먼스 레이팅으로는 부적절하다.
 *
 *  척도: chess.com 래피드 레이팅. 낮은 레이팅대는 이 데이터뿐이고, 리뷰 화면에 표시되는 선수 급수도 chess.com 기준이라 서로 비교할 수 있다. 마스터 대국(FIDE)은
 *  타이틀 선수의 (FIDE, chess.com 래피드) 쌍을 직선으로 맞춘 오프셋(chesscom-fide-offset.json)으로 이 척도에 옮긴다.
 *  보정 범위: 앵커가 놓인 정확도 구간[calibratedRange]만 실측이다. 그 밖은 (0, 하한)·(100, 상한)으로 이은 임시 꼬리이며 앱은 "보정 전 임시 수치"를 표시한다.
 *  기준 길이: 표본 진영들의 비이론 내 수 개수 중앙값을 refMoves로 담는다(앱은 이 길이의 대국에서 곡선 값이 그대로 나오도록 근거 수 가중치를 정규화한다).
 *
 *  사용법: node scripts/fit-performance-curve.mjs [--dry] [입력.ndjson ...]
 *          (입력 생략 시 scripts/calibration/perf-calibration.ndjson(마스터) + perf-calibration-chesscom.ndjson. pool 필드가 chesscom이면 그 척도, 없으면 마스터(FIDE))
 *          --dry: 파일을 쓰지 않고 보고만
 *  옵션(환경변수): MIN_EVIDENCE=20 · MIN_SIDES=300 · MIN_BIN=6(구간당 진영 수 하한) · BIN=100 · BOOT=1000 · OFFSET=오프셋 파일 · OUT=출력 경로
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { accuracyFingerprint } from "./lib/accuracyFingerprint.mjs";
import { PERF } from "../src/lib/performanceRating.js";

const here = (p) => new URL(p, import.meta.url).pathname;
const dry = process.argv.includes("--dry");
let inputs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!inputs.length) inputs = [here("./calibration/perf-calibration.ndjson"), here("./calibration/perf-calibration-chesscom.ndjson")].filter(existsSync);
const outPath = process.env.OUT || here("../src/data/performanceCurve.json");
const offsetPath = process.env.OFFSET || here("./calibration/chesscom-fide-offset.json");
const env = (k, d) => (process.env[k] ? +process.env[k] : d);
const MIN_EVIDENCE = env("MIN_EVIDENCE", 20), MIN_SIDES = env("MIN_SIDES", 300), MIN_BIN = env("MIN_BIN", 6), BIN = env("BIN", 100), BOOT = env("BOOT", 1000);
if (!inputs.length) { console.error("입력 파일이 없음"); process.exit(1); }

/* ── FIDE → chess.com 래피드 오프셋(타이틀 선수 쌍의 직선) ── */
let toCc = (fide) => fide, offsetInfo = null;
{
  const usable = existsSync(offsetPath) ? JSON.parse(readFileSync(offsetPath, "utf8")).rows.filter((r) => r.fide >= 2000 && r.rapid > 0 && (r.rapidRd ?? 999) <= 90) : [];
  if (usable.length >= 30) {
    const n = usable.length, mx = usable.reduce((s, r) => s + r.fide, 0) / n, my = usable.reduce((s, r) => s + r.rapid, 0) / n;
    let sxx = 0, sxy = 0; for (const r of usable) { sxx += (r.fide - mx) ** 2; sxy += (r.fide - mx) * (r.rapid - my); }
    const beta = sxy / sxx, alpha = my - beta * mx;
    toCc = (fide) => alpha + beta * fide;
    offsetInfo = { n, alpha: Math.round(alpha * 10) / 10, beta: Math.round(beta * 1000) / 1000, at2500: Math.round(alpha + beta * 2500) };
  }
}

/* ── 데이터 ── */
const recs = inputs.flatMap((f) => readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean));
const pts = [];
for (const r of recs) for (const s of [r.w, r.b]) {
  if (s.acc == null || !(s.elo > 0) || s.counts.evidence < MIN_EVIDENCE) continue;
  const cc = r.pool === "chesscom";
  pts.push({ R: cc ? s.elo : toCc(s.elo), A: s.acc, n: s.counts.evidence, pool: cc ? "chesscom" : "masters", game: r.id });
}
const engines = [...new Set(recs.map((r) => `${r.engine} depth ${r.depth} ${r.movetime}ms`))];
const fails = [];
if (!offsetInfo && pts.some((p) => p.pool === "masters")) fails.push("마스터 표본이 있는데 chess.com↔FIDE 오프셋 데이터가 없음(node scripts/fetch-rated-games.mjs offset 먼저)");
console.error(`입력 ${inputs.length}개 · 대국 ${recs.length}판 · 진영 ${pts.length}개(근거 수 ≥ ${MIN_EVIDENCE}; 마스터 ${pts.filter((p) => p.pool === "masters").length}, chess.com ${pts.filter((p) => p.pool === "chesscom").length}) · 엔진 ${engines.join(", ")}`);
if (offsetInfo) console.error(`오프셋: chess.com 래피드 ≈ ${offsetInfo.alpha} + ${offsetInfo.beta}·FIDE (타이틀 선수 ${offsetInfo.n}명) → FIDE 2500 = chess.com ${offsetInfo.at2500}`);

/* ── 포화형 최소제곱: y = c + d·exp(−R/τ), d<0. τ는 격자 탐색, c·d는 닫힌 해 ── */
function fitSat(P) {
  const n = P.length; let best = null;
  const my = P.reduce((s, p) => s + p.A, 0) / n;
  for (let tau = 200; tau <= 4000; tau += 25) {
    const g = P.map((p) => Math.exp(-p.R / tau)), mg = g.reduce((s, v) => s + v, 0) / n;
    let sgg = 0, sgy = 0; for (let i = 0; i < n; i++) { sgg += (g[i] - mg) ** 2; sgy += (g[i] - mg) * (P[i].A - my); }
    if (sgg < 1e-18) continue;
    const d = sgy / sgg, c = my - d * mg;
    let sse = 0; for (let i = 0; i < n; i++) sse += (P[i].A - c - d * g[i]) ** 2;
    if (!best || sse < best.sse) best = { tau, c, d, sse };
  }
  return best;
}
/* ── 구간 평균(진단용) → 단조(PAV) ── */
function binsOf(P) {
  const m = new Map();
  for (const p of P) { const k = Math.floor(p.R / BIN) * BIN; if (!m.has(k)) m.set(k, []); m.get(k).push(p); }
  return [...m.entries()].filter(([, a]) => a.length >= MIN_BIN).sort((a, b) => a[0] - b[0])
    .map(([k, a]) => ({ R: a.reduce((s, p) => s + p.R, 0) / a.length, A: a.reduce((s, p) => s + p.A, 0) / a.length, w: a.length }));
}
function pav(bins) {   // 가중 단조 증가 회귀: 정확도가 레이팅에 대해 줄어들지 않게 구간을 합친다
  const blocks = bins.map((b) => ({ ...b }));
  const out = [];
  for (const b of blocks) {
    out.push({ ...b });
    while (out.length > 1 && out[out.length - 2].A >= out[out.length - 1].A) {
      const y = out.pop(), x = out.pop(), w = x.w + y.w;
      out.push({ R: (x.R * x.w + y.R * y.w) / w, A: (x.A * x.w + y.A * y.w) / w, w });
    }
  }
  return out;
}
function curveFrom(P) {
  const bins = binsOf(P); if (bins.length < 4) return null;
  const mono = pav(bins), sat = fitSat(P);
  return { bins, mono, sat };
}
const full = curveFrom(pts);
if (!full) fails.push("구간이 부족함(구간당 최소 " + MIN_BIN + "명, 4구간 이상 필요)");
const satF = (R) => full.sat.c + full.sat.d * Math.exp(-R / full.sat.tau);

/* ── 진단: 상관, 구간별 기대 정확도, 두 출처가 겹치는 구간의 일치, 불확실성 ── */
function spearman(P) {
  const rank = (v) => { const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; };
  const a = rank(P.map((p) => p.R)), b = rank(P.map((p) => p.A)), n = P.length, ma = (n - 1) / 2;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - ma); saa += (a[i] - ma) ** 2; sbb += (b[i] - ma) ** 2; }
  return sab / Math.sqrt(saa * sbb);
}
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
let rho = null, sigma = null;
if (full) {
  rho = spearman(pts);
  // 대국 단위 부트스트랩으로 상관의 95% 하한(한 대국의 두 진영은 같은 포지션을 공유해 독립이 아니다)
  const byGame = new Map(); for (const p of pts) { if (!byGame.has(p.game)) byGame.set(p.game, []); byGame.get(p.game).push(p); }
  const games = [...byGame.values()], rand = rng(11), rs = [];
  for (let i = 0; i < BOOT; i++) { const s = []; for (let k = 0; k < games.length; k++) s.push(...games[Math.floor(rand() * games.length)]); rs.push(spearman(s)); }
  rs.sort((a, b) => a - b); const rhoLo = rs[Math.floor(BOOT * 0.025)], rhoHi = rs[Math.floor(BOOT * 0.975)];
  // 단조 곡선 주변 잔차의 표준편차
  sigma = Math.sqrt(pts.reduce((s, p) => s + (p.A - satF(p.R)) ** 2, 0) / pts.length);
  console.error(`상관(스피어먼) ${rho.toFixed(3)} (95% ${rhoLo.toFixed(3)} ~ ${rhoHi.toFixed(3)}) · 곡선 주변 정확도 표준편차 ${sigma.toFixed(2)}%p`);
  console.error(`포화형 적합: 정확도 f(R) = ${full.sat.c.toFixed(2)} − ${(-full.sat.d).toFixed(2)}·exp(−R/${full.sat.tau}) (점근선 ${full.sat.c.toFixed(1)}%)`);
  console.error("레이팅 구간 │ 진영 │ 평균 정확도 │ 적합값 │ 마스터/chess.com 평균(겹치는 구간)");
  for (const b of full.bins) {
    const lo = Math.floor(b.R / BIN) * BIN, inB = (p) => Math.floor(p.R / BIN) * BIN === lo;
    const m = pts.filter((p) => inB(p) && p.pool === "masters"), c = pts.filter((p) => inB(p) && p.pool === "chesscom");
    const mean = (a) => (a.length ? (a.reduce((s, p) => s + p.A, 0) / a.length).toFixed(1) + `(${a.length})` : "—");
    console.error(`${String(lo).padStart(5)}~${lo + BIN - 1} │ ${String(b.w).padStart(4)} │ ${b.A.toFixed(1).padStart(6)}     │ ${satF(b.R).toFixed(1).padStart(5)}  │ ${m.length && c.length ? mean(m) + " / " + mean(c) : ""}`);
  }
  const binRmse = Math.sqrt(full.bins.reduce((s, b) => s + b.w * (b.A - satF(b.R)) ** 2, 0) / full.bins.reduce((s, b) => s + b.w, 0));
  console.error(`구간 평균과 적합값의 가중 RMSE ${binRmse.toFixed(2)}%p`);
  for (const R of [800, 1200, 1600, 2000, 2400]) { const slope = (satF(R + 50) - satF(R - 50)) / 100; console.error(`  레이팅 ${R}: 100점당 정확도 ${(slope * 100).toFixed(2)}%p → 정확도 ±1표준편차(${sigma.toFixed(1)}%p)는 약 ±${(sigma / slope).toFixed(0)}점`); }
  if (full.sat.d >= 0) fails.push("포화형 적합이 증가형이 아님(d ≥ 0)");
  if (full.sat.tau <= 200 || full.sat.tau >= 4000) fails.push(`포화형 적합의 τ(${full.sat.tau})가 탐색 범위 끝 — 모양이 포화형이 아님`);
  if (binRmse > 1.5) fails.push(`구간 평균과 적합값이 크게 어긋남(RMSE ${binRmse.toFixed(2)}%p > 1.5) — 포화형이 데이터 모양과 맞지 않음`);
  if (pts.length < MIN_SIDES) fails.push(`표본이 적음: 진영 ${pts.length}개 (MIN_SIDES=${MIN_SIDES})`);
  if (!(rhoLo > 0.2)) fails.push(`상관의 95% 하한이 ${rhoLo.toFixed(3)} — 레이팅과 정확도의 관계를 확신하기엔 약함(0.2 초과 필요). 표본을 더 쌓을 것`);
}
if (fails.length) { console.error("✖ 곡선을 쓰지 않음:\n  - " + fails.join("\n  - ")); if (!dry) process.exit(1); }
if (dry) process.exit(fails.length ? 1 : 0);

/* ── 곡선 파일: 적합 f(R)을 레이팅 격자에서 읽어 (정확도 → 레이팅) 앵커로 ── */
const round = (v) => Math.round(v * 100) / 100, round3 = (v) => Math.round(v * 1000) / 1000;
const Rs = pts.map((p) => p.R).sort((u, v) => u - v), pct = (q) => Rs[Math.floor((Rs.length - 1) * q)];
let anchors = [[0, PERF.FLOOR]];
for (let R = 300; R <= PERF.CAP; R += R < 2800 ? 100 : 200) {
  const A = round3(satF(R));
  if (A > anchors[anchors.length - 1][0] && A < 100) anchors.push([A, R]);
}
if (anchors[anchors.length - 1][1] < PERF.CAP) anchors.push([100, PERF.CAP]);
const calibratedRange = [round(satF(pct(0.03))), round(satF(pct(0.97)))];
for (let i = 1; i < anchors.length; i++) if (!(anchors[i][0] > anchors[i - 1][0] && anchors[i][1] > anchors[i - 1][1])) { console.error("✖ 앵커가 증가하지 않음: " + JSON.stringify(anchors)); process.exit(1); }
for (const [, y] of anchors) if (y < PERF.FLOOR || y > PERF.CAP) { console.error("✖ 앵커가 [FLOOR, CAP] 밖: " + y); process.exit(1); }
const ns = pts.map((q) => q.n).sort((u, v) => u - v);
const out = {
  version: 2, fingerprint: accuracyFingerprint(), scale: "chesscom-rapid", refMoves: ns[Math.floor(ns.length / 2)],
  anchors, calibratedRange,
  fit: { sides: pts.length, games: recs.length, rho: Math.round(rho * 1000) / 1000, sigma: round(sigma), model: { c: round(full.sat.c), d: round(full.sat.d), tau: full.sat.tau }, offset: offsetInfo },
  source: engines.join(", "),
};
function rAt(a) { for (let i = 1; i < anchors.length; i++) if (a <= anchors[i][0]) { const [x0, y0] = anchors[i - 1], [x1, y1] = anchors[i]; return y0 + ((y1 - y0) * (a - x0)) / (x1 - x0); } return anchors[anchors.length - 1][1]; }
writeFileSync(outPath, JSON.stringify(out) + "\n");
console.error(`✔ ${outPath}\n  앵커 ${anchors.length}개 · 실측 정확도 구간 ${out.calibratedRange[0]}~${out.calibratedRange[1]}% · 예) 70%→${Math.round(rAt(70))} 80%→${Math.round(rAt(80))} 90%→${Math.round(rAt(90))} 95%→${Math.round(rAt(95))}`);
