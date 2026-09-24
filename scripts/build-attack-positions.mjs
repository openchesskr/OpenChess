#!/usr/bin/env node
/** (v0.5.3 기능) 공격 모드용 "강제 체크메이트 포지션" 풀을 만든다 → src/data/attackPositions.json
 *
 *  리체스 퍼즐 API는 빌드 환경에서 막혀 있는 경우가 많아(외부망 제한), 시드 풀은 이미 저장소에 있는
 *  public/master-games.json(실전 마스터 대국 12만여 판)에서 직접 뽑는다 — 결과가 난(1-0/0-1) 대국의
 *  마지막 몇 수 안에서 "이긴 쪽이 둘 차례인" 포지션을 Stockfish로 분석해, 강제 메이트(1~4수)가 있고
 *  공격 측의 매 수가 유일한 정답인(두 번째로 좋은 수는 그만큼 빠른 메이트가 아닌) 포지션만 남긴다.
 *  수비 측 응수는 엔진 최선 응수(가장 오래 버티는 수)로 고정한다 — 마지막 메이트 수는 다른 메이트
 *  수도 정답으로 인정하므로(클라이언트가 chess.js로 체크메이트 여부를 직접 확인) 유일성 검사에서 뺀다.
 *  실행: node scripts/build-attack-positions.mjs [목표개수배율=1]
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { Chess } from "chess.js";

const require = createRequire(import.meta.url);
const SF = dirname(require.resolve("stockfish18/package.json")) + "/bin/stockfish-18-lite-single.js";
const scale = parseFloat(process.argv[2] || "1");
const TARGET = { 1: Math.round(90 * scale), 2: Math.round(90 * scale), 3: Math.round(70 * scale), 4: Math.round(45 * scale) };
const DEPTH = 16;

function makeEngine() {
  const p = spawn("node", [SF], { stdio: ["pipe", "pipe", "pipe"] });
  p.stderr.on("data", () => { });
  let buf = "", waiter = null, lines = [];
  p.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      lines.push(line);
      if (waiter && waiter.test(line)) { const w = waiter; waiter = null; const out = lines; lines = []; w.resolve(out); }
    }
  });
  const send = (s) => p.stdin.write(s + "\n");
  const until = (re) => new Promise((resolve) => { waiter = { test: (l) => re.test(l), resolve }; });
  return {
    async init() { send("uci"); await until(/^uciok/); send("setoption name Hash value 64"); send("isready"); await until(/^readyok/); },
    async analyse(fen, multipv, depth = DEPTH) {
      lines = [];
      send("setoption name MultiPV value " + multipv);
      send("position fen " + fen);
      send("go depth " + depth);
      const out = await until(/^bestmove/);
      const best = {};
      for (const l of out) {
        const m = l.match(/ multipv (\d+) score (cp|mate) (-?\d+).* pv (.+)$/);
        if (m && / depth (\d+)/.test(l)) best[m[1]] = { kind: m[2], val: parseInt(m[3], 10), pv: m[4].split(" ") };
      }
      return [best[1], best[2]].filter(Boolean);
    },
    quit() { send("quit"); p.kill(); },
  };
}

// 결정론적 셔플(시드 고정) — 다시 돌려도 같은 대국 순서로 훑어 결과가 재현되게 한다.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const master = JSON.parse(readFileSync("public/master-games.json", "utf8"));
const games = master.games.filter((g) => g.result === "1-0" || g.result === "0-1");
const rand = rng(530);
for (let i = games.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [games[i], games[j]] = [games[j], games[i]]; }

const eng = makeEngine();
await eng.init();
const found = { 1: [], 2: [], 3: [], 4: [] };
const done = () => Object.keys(TARGET).every((k) => found[k].length >= TARGET[k]);
const seenFen = new Set();
let scanned = 0;

async function verifyLine(fen, n) {
  // 공격 측의 모든 수(마지막 메이트 수 제외)가 유일해야 하고, 수비 측은 엔진 최선 응수를 따른다.
  const c = new Chess(fen);
  const moves = [];
  for (let k = n; k >= 1; k--) {
    const res = await eng.analyse(c.fen(), 2);
    const a = res[0];
    if (!a || a.kind !== "mate" || a.val !== k) return null;
    if (k > 1) {
      const b = res[1];
      if (b && b.kind === "mate" && b.val > 0 && b.val <= k) return null; // 다른 수도 같은 속도로 메이트 → 모호
    }
    const mv = a.pv[0];
    moves.push(mv);
    c.move({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] });
    if (k === 1) return c.isCheckmate() ? moves : null;
    const d = await eng.analyse(c.fen(), 1);
    if (!d[0]) return null;
    const reply = d[0].pv[0];
    moves.push(reply);
    c.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
  }
  return null;
}

for (const g of games) {
  if (done()) break;
  scanned++;
  if (scanned % 200 === 0) process.stderr.write(`scanned ${scanned}\n`);
  const winner = g.result === "1-0" ? "w" : "b";
  const c = new Chess();
  const sans = g.moves.split(" ");
  const fens = [];
  try { for (const s of sans) { fens.push(c.fen()); c.move(s); } } catch { continue; }
  // 마지막 14플라이 안, 이긴 쪽 차례인 포지션만 뒤에서부터 본다 — 한 대국에서 하나만 채택.
  for (let i = fens.length - 1; i >= Math.max(0, fens.length - 14); i--) {
    const fen = fens[i];
    if (fen.split(" ")[1] !== winner) continue;
    const key = fen.split(" ").slice(0, 4).join(" ");
    if (seenFen.has(key)) continue;
    seenFen.add(key);
    // 빠른 1차 선별(얕은 탐색, 단일 PV) — 메이트 점수가 보일 때만 깊게 다시 본다.
    const quick = await eng.analyse(fen, 1, 10);
    if (!quick[0] || quick[0].kind !== "mate" || quick[0].val < 1 || quick[0].val > 5) continue;
    const res = await eng.analyse(fen, 2);
    const a = res[0];
    if (!a || a.kind !== "mate" || a.val < 1 || a.val > 4) continue;
    const n = a.val;
    if (found[n].length >= TARGET[n]) continue;
    const line = await verifyLine(fen, n);
    if (!line) continue;
    const who = (g.white || "?").split(",")[0] + "–" + (g.black || "?").split(",")[0];
    found[n].push({ id: "m" + n + "-" + found[n].length, fen, moves: line, mateIn: n, src: who + (g.date ? " " + g.date.slice(0, 4) : "") });
    process.stderr.write(`[${scanned}] mate${n} ${found[1].length}/${found[2].length}/${found[3].length}/${found[4].length}\n`);
    break;
  }
}
eng.quit();
const all = [...found[1], ...found[2], ...found[3], ...found[4]];
writeFileSync("src/data/attackPositions.json", JSON.stringify(all));
console.log("saved", all.length, "positions after scanning", scanned, "games");
