// (v0.7.3 개발 도구, 느림 — prebuild에 넣지 않음) 사용법: N_TOUR=40 N_CC=50 MAXPLY=60 DEPTH=11 OUT=/tmp/rows.json node scripts/analyze-grading.mjs
// 수 등급 실측 하네스: 실제 Stockfish로 대국을 분석해 gradeMoveKindConfirmed 결과와 "엔진 기준 희생"을 비교한다.
import { build } from "esbuild";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Chess } from "chess.js";
import { decodeMoves } from "../src/lib/moveCodec.js";
const ROOT = new URL("../", import.meta.url).pathname;
const DEPTH = +(process.env.DEPTH || 12), N_TOUR = +(process.env.N_TOUR || 30), N_CC = +(process.env.N_CC || 30), MAXPLY = +(process.env.MAXPLY || 60);
mkdirSync(join(ROOT, "node_modules/.gr"), { recursive: true });
const dir = mkdtempSync(join(ROOT, "node_modules/.gr/b-"));
const out = join(dir, "common.mjs");
await build({ entryPoints: [join(ROOT, "src/app/common.jsx")], bundle: true, platform: "node", format: "esm", outfile: out, jsx: "automatic", logLevel: "error",
  loader: { ".jsx": "jsx", ".js": "jsx", ".png": "dataurl", ".json": "json", ".svg": "dataurl" }, external: ["react", "react-dom", "@supabase/*", "lucide-react", "chess.js"], define: { "import.meta.env": "{}" } });
const C = await import(out);
rmSync(dir, { recursive: true, force: true });
const MQ = await import(ROOT + "src/lib/moveQuality.js");

// ── 엔진 풀 ──
class Eng {
  constructor() { this.p = spawn("node", [ROOT + "node_modules/stockfish18/bin/stockfish-18-lite-single.js"]); this.buf = ""; this.cb = null; this.busy = false;
    this.p.stdout.on("data", (d) => { this.buf += d; let i; while ((i = this.buf.indexOf("\n")) >= 0) { const l = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1); if (this.cb) this.cb(l); } });
    this.send("uci"); this.send("setoption name Hash value 64"); }
  send(s) { this.p.stdin.write(s + "\n"); }
  go(fen, depth, mpv) { return new Promise((res) => { const lines = {}; this.cb = (l) => {
      if (l.startsWith("info") && / multipv /.test(l) && / score /.test(l) && / pv /.test(l)) { const m = l.match(/depth (\d+).* multipv (\d+) score (cp|mate) (-?\d+).* pv (.*)$/); if (m) lines[m[2]] = { depth: +m[1], [m[3]]: +m[4], pv: m[5].split(" ") }; }
      if (l.startsWith("bestmove")) { this.cb = null; res(Object.keys(lines).sort().map((k) => lines[k])); } };
    this.send("setoption name MultiPV value " + mpv); this.send("position fen " + fen); this.send("go depth " + depth); }); }
}
const engs = Array.from({ length: 4 }, () => new Eng());
let rr = 0; const free = engs.slice(); const waiters = [];
const acquire = () => new Promise((r) => { const e = free.pop(); if (e) r(e); else waiters.push(r); });
const release = (e) => { const w = waiters.shift(); if (w) w(e); else free.push(e); };
const cache = new Map();
async function analyze(fen, mpv = 1) { const k = fen + "|" + mpv; if (cache.has(k)) return cache.get(k); const p = (async () => { const e = await acquire(); try { return await e.go(fen, DEPTH, mpv); } finally { release(e); } })(); cache.set(k, p); return p; }
const evaluate = async (fen) => { const L = await analyze(fen, 1); const l = L[0]; return l ? { cp: l.cp, mate: l.mate, pv: l.pv } : null; };

// ── 표본 ──
const games = [];
for (const f of ["norway", "candidates", "dortmund", "linares", "grandSwiss"]) { try { const d = JSON.parse(readFileSync(ROOT + "src/data/tournaments/" + f + ".json", "utf8")); games.push(...d.eds.flatMap((e) => e.g).filter((g) => typeof g[5] === "string" && g[5].length > 60).slice(0, Math.ceil(N_TOUR / 5)).map((g) => ({ src: f, sans: decodeMoves(g[5]).slice(0, MAXPLY) }))); } catch { } }
for (const fn of ["chesscom-games-high.ndjson", "chesscom-games.ndjson"]) { const rows = readFileSync(ROOT + "scripts/calibration/" + fn, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((g) => g.sans && g.sans.length >= 30); games.push(...rows.slice(0, Math.ceil(N_CC / 2)).map((g) => ({ src: fn.slice(0, 18), sans: g.sans.slice(0, MAXPLY) }))); }
console.error("games", games.length);

const fenOf = (sans) => { const c = new Chess(); for (const s of sans) c.move(s); return c.fen(); };
const uciOf = (sans, san) => { const c = new Chess(); for (const s of sans) c.move(s); const m = c.move(san); return m.from + m.to + (m.promotion || ""); };
const matOf = (fen, color) => { const V = { p: 1, n: 3, b: 3, r: 5, q: 9 }; const c = new Chess(fen); let d = 0; for (const r of c.board()) for (const p of r) if (p && V[p.type]) d += (p.color === color ? 1 : -1) * V[p.type]; return d; };
const sc = (l) => (l.mate != null ? (l.mate > 0 ? 100000 - l.mate : -100000 - l.mate) : l.cp);

const rows = [];
async function doGame(g, gi) {
  for (let p = 0; p < g.sans.length; p++) {
    const prev = g.sans.slice(0, p), san = g.sans[p]; const color = p % 2 ? "b" : "w";
    if (p < 6) continue;   // 이론 수순 건너뜀
    const fenB = fenOf(prev);
    const L = await analyze(fenB, 3); if (!L.length) continue;
    const bestCp = sc(L[0]); const secondCp = L[1] ? sc(L[1]) : null;
    const uci = uciOf(prev, san); const idx = L.findIndex((l) => l.pv[0] === uci);
    let playedCp;
    if (idx >= 0) playedCp = sc(L[idx]);
    else { const A = await analyze(fenOf([...prev, san]), 1); if (!A.length) continue; playedCp = -sc(A[0]); }
    const loss = Math.max(0, bestCp - playedCp);
    const matched = idx === 0;
    const args = { loss, matched, bestCp, playedCp, secondCp, priorSac: MQ.ownPriorMoveWasSacrifice(prev, color, null), singleRecapture: C.singleRecaptureCheck(prev, san, color, null), san };
    const kind = await C.gradeMoveKindConfirmed(args, { fenRoot: null, prevSans: prev, san, color, evaluate });
    const staticSac = MQ.isSacrifice((await import(ROOT + "src/lib/chessRules.js")).boardOfRoot(null, prev), san, color);
    // 엔진 기준 투자: 둔 뒤 엔진 수순이 "내 수로 끝나는" 지점(2·4·6수)마다 기물 점수 손실(둔 쪽 관점)을 재서, 4·6수 지점에서 모두 2점 이상 뒤처지면 실제로 기물을 내준 희생으로 본다.
    let invest = null, pvEnd = null;
    try { const A = await analyze(fenOf([...prev, san]), 1); const pv = A[0].pv; const c = new Chess(fenOf([...prev, san])); const inv = []; for (let i = 0; i < Math.min(6, pv.length); i++) { const u = pv[i]; try { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { break; } if (i % 2 === 1) inv.push(matOf(fenB, color) - matOf(c.fen(), color)); } if (inv.length >= 2) invest = Math.min(inv[inv.length - 1], inv[inv.length - 2]); } catch { }
    rows.push({ gi, src: g.src, p, san, color, kind, staticSac, bestCp, playedCp, secondCp, loss, matched, priorSac: args.priorSac, invest, fenB });
  }
}
let next = 0; await Promise.all(Array.from({ length: 4 }, async () => { while (next < games.length) { const gi = next++; await doGame(games[gi], gi); process.stderr.write("."); writeFileSync(process.env.OUT || "/tmp/gr-rows.json", JSON.stringify(rows)); } }));
writeFileSync(process.env.OUT || "/tmp/gr-rows.json", JSON.stringify(rows));
console.error("\nrows", rows.length);
engs.forEach((e) => e.send("quit"));
process.exit(0);
