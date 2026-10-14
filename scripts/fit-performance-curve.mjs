#!/usr/bin/env node
/** (v0.6.7) 퍼포먼스 레이팅 곡선 R(A) 맞추기. scripts/calibrate-performance.mjs가 쌓은 NDJSON(진영별 레이팅·정확도·수 구성)으로 src/data/performanceCurve.json 을 만든다.
 *
 *  방법: "레이팅이 R인 선수의 기대 정확도 f(R)"를 먼저 구하고(포화형 함수 f(R)=c−b·e^(−R/τ)를 최소제곱으로 맞춘다 — 정확도는 레이팅이 오를수록 포화하고,
 *  구성상 단조라 곡선이 들쭉날쭉하지 않다), 그 역함수로 정확도 → 레이팅을 얻는다. 구간별 평균과 어긋나면(모양이 포화형이 아니면) 곡선을 쓰지 않는다. 득점률에서 레이팅 차이를 읽는 FIDE 표와
 *  같은 논리다("이 정확도는 어느 레이팅 선수가 평균적으로 내는 값인가"). 반대로 레이팅을 정확도에 회귀하면(R = c + d·A) 판마다 정확도가 흔들리는 탓에 기울기가 눌려
 *  모든 판이 평균 근처로 몰린다 — 퍼포먼스 레이팅으로는 부적절하다.
 *
 *  출처 이동량: 마스터(클래시컬)와 chess.com(래피드)은 같은 레이팅에서도 정확도가 체계적으로 다르다. 곡선과 함께 이동량 δ를 추정해 마스터를 래피드 척도로 옮긴다.
 *  척도: chess.com 래피드 레이팅. 낮은 레이팅대는 이 데이터뿐이고, 리뷰 화면에 표시되는 선수 급수도 chess.com 기준이라 서로 비교할 수 있다. 마스터 대국(FIDE)은
 *  FIDE 2300+ 타이틀 선수의 (래피드 − FIDE) 중앙값 상수 오프셋(chesscom-fide-offset.json)으로 이 척도에 옮긴다.
 *  보정 범위: 앵커가 놓인 정확도 구간[calibratedRange]만 실측이다. 그 밖은 (0, 하한)·(100, 상한)으로 이은 임시 꼬리이며 앱은 "보정 전 임시 수치"를 표시한다.
 *  기준 길이: 표본 진영들의 비이론 내 수 개수 중앙값을 refMoves로 담는다(앱은 이 길이의 대국에서 곡선 값이 그대로 나오도록 근거 수 가중치를 정규화한다).
 *
 *  사용법: node scripts/fit-performance-curve.mjs [--dry] [입력.ndjson ...]
 *          (입력 생략 시 scripts/calibration/perf-calibration-v2.ndjson(마스터) + perf-calibration-chesscom-v2.ndjson. pool 필드가 chesscom이면 그 척도, 없으면 마스터(FIDE).
 *           수별 기록(moves)이 있는 v2 파일만 쓴다 — 퍼포먼스 레이팅 입력 S = robustAccuracy(moves, PERF.SOFT_FLOOR, PERF.SOFT_POWER))
 *          --dry: 파일을 쓰지 않고 보고만
 *  옵션(환경변수): MIN_EVIDENCE=20 · MIN_SIDES=300 · MIN_BIN=6(구간당 진영 수 하한) · BIN=100 · BOOT=1000 · OFFSET=오프셋 파일 · OUT=출력 경로
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { accuracyFingerprint } from "./lib/accuracyFingerprint.mjs";
import { PERF, robustAccuracy } from "../src/lib/performanceRating.js";

const here = (p) => new URL(p, import.meta.url).pathname;
const dry = process.argv.includes("--dry");
let inputs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!inputs.length) inputs = [here("./calibration/perf-calibration-v2.ndjson"), here("./calibration/perf-calibration-chesscom-v2.ndjson")].filter(existsSync);
const outPath = process.env.OUT || here("../src/data/performanceCurve.json");
const offsetPath = process.env.OFFSET || here("./calibration/chesscom-fide-offset.json");
const env = (k, d) => (process.env[k] ? +process.env[k] : d);
const MIN_EVIDENCE = env("MIN_EVIDENCE", 20), MIN_SIDES = env("MIN_SIDES", 300), MIN_BIN = env("MIN_BIN", 6), BIN = env("BIN", 100), BOOT = env("BOOT", 1000);
if (!inputs.length) { console.error("입력 파일이 없음"); process.exit(1); }

/* ── FIDE → chess.com 래피드 오프셋: FIDE 2300 이상 타이틀 선수 (래피드 − FIDE)의 중앙값 상수 ──
   직선(rapid = α + β·FIDE)은 쓰지 않는다 — 양쪽 레이팅 모두 잡음이 있어 기울기가 눌리고(회귀 희석, 실측 β≈0.5) 마스터 구간이 압축된다.
   마스터 표본은 2300 이상뿐이라 그 범위의 상수 차이면 충분하다. 개인별 차이의 표준편차(≈190점)가 커서 오프셋 자체도 ±30점쯤 불확실하다. */
let toCc = (fide) => fide, offsetInfo = null;
{
  const usable = existsSync(offsetPath) ? JSON.parse(readFileSync(offsetPath, "utf8")).rows.filter((r) => r.fide >= 2300 && r.rapid > 0 && (r.rapidRd ?? 999) <= 90) : [];
  if (usable.length >= 30) {
    const df = usable.map((r) => r.rapid - r.fide).sort((a, b) => a - b), n = df.length, mean = df.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(df.reduce((s, v) => s + (v - mean) ** 2, 0) / n), median = df[Math.floor(n / 2)];
    toCc = (fide) => fide + median;
    offsetInfo = { n, fideMin: 2300, median, mean: Math.round(mean), sd: Math.round(sd), se: Math.round(sd / Math.sqrt(n)) };
  }
}

/* ── 데이터 ── */
const recs = inputs.flatMap((f) => readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean));
const pts = []; let noMoves = 0;
for (const r of recs) for (const s of [r.w, r.b]) {
  if (!(s.elo > 0) || s.counts.evidence < MIN_EVIDENCE) continue;
  if (!s.moves) { noMoves++; continue; }
  const S = robustAccuracy(s.moves);   // 퍼포먼스 레이팅 전용 정확도(PERF.SOFT_FLOOR·SOFT_POWER)
  if (S == null) continue;
  const cc = r.pool === "chesscom";
  pts.push({ R: cc ? s.elo : toCc(s.elo), A: S, n: s.counts.evidence, pool: cc ? "chesscom" : "masters", game: r.id });
}
if (noMoves) console.error(`※ 수별 기록(moves)이 없는 진영 ${noMoves}개는 제외(v1 파일). v2 분석 결과만 사용`);
const engines = [...new Set(recs.map((r) => `${r.engine} depth ${r.depth} ${r.movetime}ms`))];
const fails = [];
if (!offsetInfo && pts.some((p) => p.pool === "masters")) fails.push("마스터 표본이 있는데 chess.com↔FIDE 오프셋 데이터가 없음(node scripts/fetch-rated-games.mjs offset 먼저)");
console.error(`입력 ${inputs.length}개 · 대국 ${recs.length}판 · 진영 ${pts.length}개(근거 수 ≥ ${MIN_EVIDENCE}; 마스터 ${pts.filter((p) => p.pool === "masters").length}, chess.com ${pts.filter((p) => p.pool === "chesscom").length}) · 엔진 ${engines.join(", ")}`);
if (offsetInfo) console.error(`오프셋: chess.com 래피드 ≈ FIDE ${offsetInfo.median >= 0 ? "+" : "−"} ${Math.abs(offsetInfo.median)} (FIDE ${offsetInfo.fideMin}+ 타이틀 선수 ${offsetInfo.n}명, 평균 ${offsetInfo.mean} ± ${offsetInfo.se}, 개인별 표준편차 ${offsetInfo.sd})`);

/* ── 포화형 최소제곱 + 출처 이동량: y = c + d·exp(−R/τ) + δ·[마스터], d<0 ──
   마스터는 클래시컬, chess.com은 래피드라 같은 레이팅이어도 정확도가 체계적으로 다르다(래피드는 시간 압박 실수가 늘어남). 이 차이 δ를 곡선과 함께 추정해
   마스터 표본을 chess.com 래피드 척도의 정확도로 옮긴다(A_adj = A − δ). τ는 기하 격자(거의 직선인 곡선까지 포함), c·d·δ는 3원 정규방정식의 닫힌 해. */
function solve3(M, v) {   // 3×3 가우스 소거
  const a = M.map((r, i) => [...r, v[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(a[k][i]) > Math.abs(a[p][i])) p = k;
    if (Math.abs(a[p][i]) < 1e-14) return null; [a[i], a[p]] = [a[p], a[i]];
    for (let k = i + 1; k < 3; k++) { const f = a[k][i] / a[i][i]; for (let j = i; j < 4; j++) a[k][j] -= f * a[i][j]; }
  }
  const x = [0, 0, 0]; for (let i = 2; i >= 0; i--) { let t = a[i][3]; for (let j = i + 1; j < 3; j++) t -= a[i][j] * x[j]; x[i] = t / a[i][i]; }
  return x;
}
function fitSat(P) {
  const hasM = P.some((p) => p.pool === "masters") && P.some((p) => p.pool !== "masters");
  let best = null;
  for (let tau = 200; tau <= 30000; tau *= 1.05) {
    const X = P.map((p) => [1, Math.exp(-p.R / tau), hasM && p.pool === "masters" ? 1 : 0]);
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
    for (let i = 0; i < P.length; i++) for (let r = 0; r < 3; r++) { v[r] += X[i][r] * P[i].A; for (let c = 0; c < 3; c++) M[r][c] += X[i][r] * X[i][c]; }
    if (!hasM) { M[2][2] = 1; }   // 이동량 열이 없으면 0으로 고정
    const x = solve3(M, v); if (!x) continue;
    let sse = 0; for (let i = 0; i < P.length; i++) sse += (P[i].A - x[0] - x[1] * X[i][1] - x[2] * X[i][2]) ** 2;
    if (!best || sse < best.sse) best = { tau, c: x[0], d: x[1], delta: hasM ? x[2] : 0, sse };
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
  const sat = fitSat(P); if (!sat) return null;
  const adj = P.map((p) => ({ ...p, A: p.A - (p.pool === "masters" ? sat.delta : 0) }));   // 마스터 정확도를 래피드 척도로 옮긴 점
  const bins = binsOf(adj); if (bins.length < 4) return null;
  return { bins, mono: pav(bins), sat, adj };
}
const full = curveFrom(pts);
if (!full) fails.push("구간이 부족함(구간당 최소 " + MIN_BIN + "명, 4구간 이상 필요)");
const satF = (R) => full.sat.c + full.sat.d * Math.exp(-R / full.sat.tau);   // 래피드 척도 기대 정확도

/* ── 진단: 상관, 구간별 기대 정확도, 두 출처가 겹치는 구간의 일치, 불확실성 ── */
function spearman(P) {
  const rank = (v) => { const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; };
  const a = rank(P.map((p) => p.R)), b = rank(P.map((p) => p.A)), n = P.length, ma = (n - 1) / 2;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - ma); saa += (a[i] - ma) ** 2; sbb += (b[i] - ma) ** 2; }
  return sab / Math.sqrt(saa * sbb);
}
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
let rho = null, sigma = null, deltaCI = null, curveSE = null;
if (full) {
  const adj = full.adj;
  rho = spearman(adj);
  // 대국 단위 부트스트랩(한 대국의 두 진영은 같은 포지션을 공유해 독립이 아니다): 상관의 95% 구간, 이동량 δ의 95% 구간
  const byGame = new Map(); for (const p of pts) { if (!byGame.has(p.game)) byGame.set(p.game, []); byGame.get(p.game).push(p); }
  const games = [...byGame.values()], rand = rng(11), rs = [], ds = [], fits = [];
  for (let i = 0; i < BOOT; i++) { const sm = []; for (let k = 0; k < games.length; k++) sm.push(...games[Math.floor(rand() * games.length)]); const ft = fitSat(sm); if (!ft) continue; ds.push(ft.delta); fits.push(ft); rs.push(spearman(sm.map((p) => ({ ...p, A: p.A - (p.pool === "masters" ? ft.delta : 0) })))); }
  rs.sort((a, b) => a - b); ds.sort((a, b) => a - b);
  const rhoLo = rs[Math.floor(rs.length * 0.025)], rhoHi = rs[Math.floor(rs.length * 0.975)];
  deltaCI = [ds[Math.floor(ds.length * 0.025)], ds[Math.floor(ds.length * 0.975)]];
  sigma = Math.sqrt(full.sat.sse / pts.length);
  const mS = full.sat;
  // 곡선 자체의 불확실성: 대국을 다시 뽑아 곡선을 새로 맞췄을 때 같은 정확도가 가리키는 레이팅이 얼마나 흔들리는가(= '한 판의 잡음'이 아니라 '매핑을 얼마나 아는가')
  const invR = (m, A) => { const q = (m.c - A) / -m.d; return q > 0 ? -m.tau * Math.log(q) : null; };
  const sdv = (a) => { const mm = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - mm) ** 2, 0) / a.length); };
  curveSE = {};
  console.error("곡선 자체의 불확실성(부트스트랩 " + fits.length + "회, 정확도 → 레이팅의 ±1표준편차):");
  for (const A of [70, 75, 80, 85, 88]) { const rr = fits.map((m) => invR(m, A)).filter((v) => v != null && isFinite(v)); curveSE[A] = Math.round(sdv(rr)); console.error(`  정확도 ${A}% → 레이팅 ${Math.round(invR(mS, A))} ± ${curveSE[A]}점`); }
  console.error(`상관(스피어먼, 이동량 보정 후) ${rho.toFixed(3)} (95% ${rhoLo.toFixed(3)} ~ ${rhoHi.toFixed(3)}) · 곡선 주변 정확도 표준편차 ${sigma.toFixed(2)}%p`);
  console.error(`출처 이동량 δ(마스터 클래시컬 − chess.com 래피드, 같은 레이팅에서) = ${mS.delta.toFixed(2)}%p (95% ${deltaCI[0].toFixed(2)} ~ ${deltaCI[1].toFixed(2)})`);
  console.error(`적합: 정확도 f(R) = ${mS.c.toFixed(2)} − ${(-mS.d).toFixed(2)}·exp(−R/${Math.round(mS.tau)}) (래피드 척도; R→∞ 점근선 ${mS.c.toFixed(1)}%)`);
  const satF0 = (R) => mS.c + mS.d * Math.exp(-R / mS.tau);
  console.error("레이팅 구간 │ 진영 │ 평균 정확도(이동량 보정) │ 적합값 │ 원본 평균: 마스터 / chess.com (겹치는 구간)");
  for (const b of full.bins) {
    const lo = Math.floor(b.R / BIN) * BIN, inB = (p) => Math.floor(p.R / BIN) * BIN === lo;
    const m = pts.filter((p) => inB(p) && p.pool === "masters"), c = pts.filter((p) => inB(p) && p.pool === "chesscom");
    const mean = (a) => (a.length ? (a.reduce((s, p) => s + p.A, 0) / a.length).toFixed(1) + `(${a.length})` : "—");
    console.error(`${String(lo).padStart(5)}~${lo + BIN - 1} │ ${String(b.w).padStart(4)} │ ${b.A.toFixed(1).padStart(6)}  │ ${satF0(b.R).toFixed(1).padStart(5)}  │ ${m.length && c.length ? mean(m) + " / " + mean(c) : ""}`);
  }
  // 구간 평균이 적합값에서 벗어난 정도를 "순수 잡음일 때 기대되는 크기"와 비교한다(구간 평균의 표준오차 = σ/√n).
  const sw = full.bins.reduce((s, b) => s + b.w, 0), binRmse = Math.sqrt(full.bins.reduce((s, b) => s + b.w * (b.A - satF0(b.R)) ** 2, 0) / sw);
  const expRmse = sigma * Math.sqrt(full.bins.length / sw);
  console.error(`구간 평균과 적합값의 가중 RMSE ${binRmse.toFixed(2)}%p (순수 잡음이면 약 ${expRmse.toFixed(2)}%p — 비율 ${(binRmse / expRmse).toFixed(2)})`);
  for (const R of [600, 1000, 1400, 1800, 2200, 2600]) { const slope = (satF0(R + 50) - satF0(R - 50)) / 100; console.error(`  레이팅 ${R}: 100점당 정확도 ${(slope * 100).toFixed(2)}%p → 한 판 정확도의 ±1표준편차(${sigma.toFixed(1)}%p)는 약 ±${(sigma / slope).toFixed(0)}점`); }
  if (full.sat.d >= 0) fails.push("포화형 적합이 증가형이 아님(d ≥ 0)");
  if (binRmse / expRmse > 1.5) fails.push(`구간 평균이 순수 잡음보다 훨씬 크게 적합값에서 벗어남(비율 ${(binRmse / expRmse).toFixed(2)} > 1.5) — 모델이 데이터 모양과 맞지 않음`);
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
  version: 3, fingerprint: accuracyFingerprint(), statistic: { floor: PERF.SOFT_FLOOR, power: PERF.SOFT_POWER }, scale: "chesscom-rapid", refMoves: ns[Math.floor(ns.length / 2)],
  anchors, calibratedRange,
  fit: { sides: pts.length, games: recs.length, rho: Math.round(rho * 1000) / 1000, sigma: round(sigma), curveSE, model: { c: round(full.sat.c), d: round(full.sat.d), tau: Math.round(full.sat.tau), delta: round(full.sat.delta), deltaCI: deltaCI.map(round) }, offset: offsetInfo },
  source: engines.join(", "),
};
function rAt(a) { for (let i = 1; i < anchors.length; i++) if (a <= anchors[i][0]) { const [x0, y0] = anchors[i - 1], [x1, y1] = anchors[i]; return y0 + ((y1 - y0) * (a - x0)) / (x1 - x0); } return anchors[anchors.length - 1][1]; }
writeFileSync(outPath, JSON.stringify(out) + "\n");
console.error(`✔ ${outPath}\n  앵커 ${anchors.length}개 · 실측 정확도 구간 ${out.calibratedRange[0]}~${out.calibratedRange[1]}% · 예) 70%→${Math.round(rAt(70))} 80%→${Math.round(rAt(80))} 90%→${Math.round(rAt(90))} 95%→${Math.round(rAt(95))}`);
