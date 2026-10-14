#!/usr/bin/env node
/** (v0.6.7) 퍼포먼스 레이팅 보정용 분석 하네스.
 *  저장소의 마스터 대회 대국(src/data/tournaments, 대회 당시 선수 레이팅 포함)을 앱의 실제 채점 코드(src/app/common.jsx analyzeGame)로 분석해
 *  진영별 { 레이팅, 정확도, 수 구성 }을 NDJSON으로 쌓는다. scripts/fit-performance-curve.mjs가 이 파일로 R(A) 곡선을 맞춘다.
 *  앱 코드를 esbuild로 번들해 그대로 실행하고(scripts/check-mec-facts.mjs와 같은 방식), 엔진은 Node UCI 어댑터(scripts/lib/nodeEngine.mjs)로 바꿔 끼운다 —
 *  수 등급·희생 확인·날카로움 보정·정확도 계산이 앱과 같은 코드 경로를 탄다.
 *
 *  사용법: node scripts/calibrate-performance.mjs [출력.ndjson=scripts/calibration/perf-calibration.ndjson]
 *  재실행하면 이미 분석한 대국은 건너뛴다(이어서 하기). 오래 걸리므로 백그라운드로 돌리고 중간에 끊어도 된다.
 *  옵션(환경변수):
 *    GAMES=300        이번 실행에서 새로 분석할 대국 수 상한
 *    MINUTES=0        이 시간(분)이 지나면 새 대국을 더 시작하지 않는다(0 = 제한 없음)
 *    CONCURRENCY=4    동시에 분석할 대국 수(엔진 프로세스 수) — 코어 수에 맞춘다
 *    DEPTH=20         앱 리뷰와 같은 목표 depth(REVIEW_DEPTH)  ·  MOVETIME=1500  앱 리뷰와 같은 포지션당 시간(REVIEW_MOVETIME_MS)
 *    ENGINE=lite-single  node_modules/stockfish18/bin/stockfish-18-<ENGINE>.js (lite-single | single)
 *    MIN_ELO=2300     두 선수 모두 이 이상인 대국만  ·  MIN_PLIES=40  이보다 짧은 대국은 제외(정확도가 너무 불안정)
 *    SEED=1           표본 추출 시드(같은 시드면 같은 순서)
 *  표본: 평균 레이팅 구간(50점)마다 같은 수를 뽑는 층화 추출 — 레이팅이 높은 쪽으로 쏠린 원본 분포 때문에 곡선이 한쪽으로 기울지 않게 한다.
 */
import { build } from "esbuild";
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { decodeMoves } from "../src/lib/moveCodec.js";
import { countSideMoves } from "../src/lib/performanceRating.js";
import { createNodeEngine } from "./lib/nodeEngine.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const outPath = process.argv[2] || join(ROOT, "scripts/calibration/perf-calibration.ndjson");
const env = (k, d) => (process.env[k] != null && process.env[k] !== "" ? +process.env[k] : d);
const GAMES = env("GAMES", 300), MINUTES = env("MINUTES", 0), CONC = env("CONCURRENCY", 4), DEPTH = env("DEPTH", 20), MOVETIME = env("MOVETIME", 1500);
const MIN_ELO = env("MIN_ELO", 2300), MIN_PLIES = env("MIN_PLIES", 40), SEED = env("SEED", 1);
const ENGINE = process.env.ENGINE || "lite-single";
const bin = join(ROOT, "node_modules/stockfish18/bin/stockfish-18-" + ENGINE + ".js");
if (!existsSync(bin)) { console.error("엔진 파일이 없음: " + bin); process.exit(1); }

// ── 앱 코드 번들 ──
const dir = mkdtempSync(join(ROOT, "node_modules/.perf-cal-"));
const bundle = join(dir, "common.mjs");
await build({ entryPoints: [join(ROOT, "src/app/common.jsx")], bundle: true, platform: "node", format: "esm", outfile: bundle, jsx: "automatic", logLevel: "error",
  loader: { ".jsx": "jsx", ".js": "jsx", ".png": "dataurl", ".json": "json", ".svg": "dataurl" }, external: ["react", "react-dom", "@supabase/*", "lucide-react", "chess.js"], define: { "import.meta.env": "{}" } });
const { analyzeGame } = await import(bundle);
rmSync(dir, { recursive: true, force: true });

// ── 표본 추출(층화) ──
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const pool = new Map();    // 평균 레이팅 구간 → 후보
const tdir = join(ROOT, "src/data/tournaments");
for (const f of readdirSync(tdir)) {
  if (!f.endsWith(".json")) continue;
  const t = JSON.parse(readFileSync(join(tdir, f), "utf8"));
  for (const ed of t.eds || []) for (const g of ed.g || []) {
    const w = ed.pl[g[2]], b = ed.pl[g[3]];
    if (!w || !b || typeof g[5] !== "string" || atob(g[5]).length < MIN_PLIES) continue;   // 부호는 한 수 = 1바이트(base64라 글자 수와 다르다)
    if (!(w[1] >= MIN_ELO && b[1] >= MIN_ELO)) continue;
    const band = Math.floor((w[1] + b[1]) / 2 / 50) * 50;
    if (!pool.has(band)) pool.set(band, []);
    pool.get(band).push({ id: t.id + "|" + ed.k + "|" + g[0] + "|" + g[1] + "|" + g[2] + "|" + g[3], code: g[5], wElo: w[1], bElo: b[1], wName: w[0], bName: b[0] });
  }
}
const rand = rng(SEED);
for (const arr of pool.values()) for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
const bands = [...pool.keys()].sort((a, b) => a - b);
const order = [];   // 구간을 번갈아 하나씩 — 어디서 끊어도 층화가 유지된다
for (let round = 0; ; round++) { let any = false; for (const b of bands) { const a = pool.get(b); if (round < a.length) { order.push(a[round]); any = true; } } if (!any) break; }

const done = new Set();
if (existsSync(outPath)) for (const line of readFileSync(outPath, "utf8").split("\n")) { if (!line.trim()) continue; try { done.add(JSON.parse(line).id); } catch { /* 깨진 줄 */ } }
const todo = order.filter((g) => !done.has(g.id));
console.error(`후보 ${order.length}판(레이팅 구간 ${bands.length}개: ${bands[0]}~${bands[bands.length - 1]}) · 이미 분석 ${done.size}판 · 이번 실행 최대 ${Math.min(GAMES, todo.length)}판 · 동시 ${CONC} · depth ${DEPTH} · ${MOVETIME}ms · ${ENGINE}`);

// ── 분석 ──
const t0 = Date.now(); let started = 0, finished = 0, next = 0;
const timeUp = () => MINUTES > 0 && Date.now() - t0 > MINUTES * 60000;
async function worker(slot) {
  const eng = createNodeEngine({ bin });
  try {
    for (;;) {
      if (started >= GAMES || timeUp() || next >= todo.length) return;
      const g = todo[next++]; started++;
      const sans = decodeMoves(g.code);
      if (sans.length < MIN_PLIES) continue;
      const g0 = Date.now();
      eng.newGame();
      let res;
      try { res = await analyzeGame(sans, eng, DEPTH, null, MOVETIME); } catch (e) { console.error("분석 실패 " + g.id + ": " + e.message); continue; }
      const side = (white) => ({ elo: white ? g.wElo : g.bElo, acc: white ? res.whiteAcc : res.blackAcc, counts: countSideMoves(res.moves.filter((m) => m.white === white)) });
      const rec = { id: g.id, plies: sans.length, w: side(true), b: side(false), depth: DEPTH, movetime: MOVETIME, engine: ENGINE, sec: Math.round((Date.now() - g0) / 1000) };
      appendFileSync(outPath, JSON.stringify(rec) + "\n");
      finished++;
      const el = (Date.now() - t0) / 60000;
      console.error(`[${slot}] ${finished}판 완료 (${rec.sec}s) ${g.wName} ${rec.w.elo} ${rec.w.acc} · ${g.bName} ${rec.b.elo} ${rec.b.acc} — 경과 ${el.toFixed(1)}분, 분당 ${(finished / el).toFixed(2)}판`);
    }
  } finally { eng.close(); }
}
await Promise.all(Array.from({ length: CONC }, (_, i) => worker(i)));
console.error(`끝: 이번 실행 ${finished}판 → ${outPath}`);
process.exit(0);
