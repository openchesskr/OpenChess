#!/usr/bin/env node
/** (v0.7.3 개발 도구) genPuzzleTree를 실제 Stockfish로 돌려 퍼즐 라인이 어디서 끝나는지 점검한다.
 *  사용법: node scripts/analyze-puzzle-gen.mjs "<FEN>" [theme=advantage|sacrifice|punish] [firstSan]
 *  엔진은 npm stockfish18(lite single)을 노드에서 직접 쓴다(브라우저 워커 풀 대신 단일 엔진으로 폴백).
 */
import { build } from "esbuild";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Chess } from "chess.js";
const ROOT = new URL("../", import.meta.url).pathname;
mkdirSync(join(ROOT, "node_modules/.gr"), { recursive: true });
const dir = mkdtempSync(join(ROOT, "node_modules/.gr/p-"));
const out = join(dir, "common.mjs");
await build({ entryPoints: [join(ROOT, "src/app/common.jsx")], bundle: true, platform: "node", format: "esm", outfile: out, jsx: "automatic", logLevel: "error",
  loader: { ".jsx": "jsx", ".js": "jsx", ".png": "dataurl", ".json": "json", ".svg": "dataurl" }, external: ["react", "react-dom", "@supabase/*", "lucide-react", "chess.js"], define: { "import.meta.env": "{}" } });
const C = await import(out);
rmSync(dir, { recursive: true, force: true });

class Eng {
  constructor() { this.p = spawn("node", [ROOT + "node_modules/stockfish18/bin/stockfish-18-lite-single.js"]); this.buf = ""; this.cb = null; this.q = Promise.resolve();
    this.p.stdout.on("data", (d) => { this.buf += d; let i; while ((i = this.buf.indexOf("\n")) >= 0) { const l = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1); if (this.cb) this.cb(l); } });
    this.send("uci"); this.send("setoption name Hash value 64"); }
  send(s) { this.p.stdin.write(s + "\n"); }
  run(fen, depth, mpv, movetime) { const job = () => new Promise((res) => { const lines = {}; this.cb = (l) => {
      if (l.startsWith("info") && / multipv /.test(l) && / score /.test(l) && / pv /.test(l)) { const m = l.match(/depth (\d+).* multipv (\d+) score (cp|mate) (-?\d+).* pv (.*)$/); if (m) { const pv = m[5].split(" "); lines[m[2]] = { uci: pv[0], pv, depth: +m[1], cp: m[3] === "cp" ? +m[4] : null, mate: m[3] === "mate" ? +m[4] : null }; } }
      if (l.startsWith("bestmove")) { this.cb = null; res(Object.keys(lines).sort().map((k) => lines[k])); } };
    this.send("setoption name MultiPV value " + mpv); this.send("position fen " + fen); this.send(movetime && depth > 40 ? "go movetime " + movetime : "go depth " + Math.min(depth, +(process.env.DEPTH || 14))); });
    const r = this.q.then(job); this.q = r.catch(() => { }); return r; }
}
const eng = new Eng();
const engine = {
  profile: "node", urls: [], status: "ready",
  evaluateMulti: (fen, d, n, mt) => eng.run(fen, d, n, mt),
  evaluate: async (fen, d, _p, mt) => { const L = await eng.run(fen, d, 1, mt); return L[0] ? { cp: L[0].cp, mate: L[0].mate, pv: L[0].pv } : null; },
};
const fen = process.argv[2], theme = process.argv[3] || "advantage", firstSanArg = process.argv[4] || null;
const { parseFenFull } = await import(ROOT + "src/lib/chessRules.js"); const fenRoot = parseFenFull(fen);
if (!fenRoot) { console.error("FEN 파싱 실패(parseFenFull)"); process.exit(1); }
let firstSan = firstSanArg;
if (theme === "sacrifice" && !firstSan) { firstSan = await C.findSacrificeFirstMove(engine, [], fenRoot); console.log("희생 첫 수 탐색:", firstSan); }
const t0 = Date.now();
const gen = await C.genPuzzleTree(engine, [], { ...C.puzzleThemeOpts(theme), firstSan }, undefined, fenRoot);
console.log("소요", ((Date.now() - t0) / 1000).toFixed(1) + "s");
const V = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
// 리프 진단: 마지막 사용자 수 뒤에 상대가 바로 이득을 보는 잡기가 있는가(미해결), 체크 중인가, 시작 대비 기물 변화
function leafInfo(startFen, path, userColor) {
  const c = new Chess(startFen); const m0 = mat(c, userColor);
  for (const sn of path) { try { c.move(sn); } catch { return null; } }
  let hang = 0;
  for (const mv of c.moves({ verbose: true })) { if (!mv.captured) continue; const att = V[mv.piece]; const gain = V[mv.captured] - (isDefended(c, mv.to, userColor) ? att : 0); if (gain > hang) hang = gain; }
  return { unsettled: hang >= 2 || c.inCheck(), hang, check: c.inCheck(), matΔ: mat(c, userColor) - m0, ply: path.length };
}
function mat(c, col) { let d = 0; for (const r of c.board()) for (const p of r) if (p && p.type !== "k") d += (p.color === col ? 1 : -1) * V[p.type]; return d; }
function isDefended(c, sq, color) { try { return c.attackers(sq, color).length > 0; } catch { return false; } }
if (!gen) console.log("→ 생성 실패(null)");
else {
  const show = (n, d = 0) => { console.log("  ".repeat(d) + (n.pass === false ? "✗" : "·") + n.san + " [" + n.kind + "] ev=" + (n.ev ? (n.ev.cp != null ? n.ev.cp : "M" + n.ev.mate) : "-")); (n.children || []).forEach((k) => show(k, d + 1)); };
  if (!process.env.QUIET) gen.tree.children.forEach((n) => show(n));
  const userColor = fenRoot.turn === "b" ? "b" : "w";
  let bad = 0; const reasons = [];
  for (const l of gen.lines) { const li = leafInfo(fen, l.solution, userColor); if (li && li.unsettled) { bad++; reasons.push(l.solution.join(" ") + " ⇒ 상대 바로 잡기 " + li.hang + (li.check ? " (체크)" : "") + " matΔ" + li.matΔ); } }
  console.log("라인", gen.lines.length, "· 미해결 종료", bad);
  reasons.slice(0, 4).forEach((r) => console.log("   ✗ " + r));
}
eng.send("quit"); process.exit(0);
