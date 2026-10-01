#!/usr/bin/env node
/** (v0.5.3 기능 → v0.6.1 대폭 확장) 무한 체크메이트 게임용 "강제 체크메이트 포지션" 풀을 만든다 → src/data/attackPositions.json
 *
 *  v0.6.1: 포지션 수를 수백 개 → 수천 개로 늘리고(한 번 나온 포지션은 다시 내지 않으므로 풀이 커야 한다), 메이트 모양 테마
 *  (scripts/lib/mateThemes.mjs — Lichess 퍼즐 테마 이름과 같다)를 붙여 게임이 테마를 고르게 뽑게 한다.
 *
 *  소스 두 가지(둘 다 같은 검증을 거친다 — 공격 측의 매 수가 유일한 정답이고 수비 측은 엔진 최선 응수, 마지막은 chess.js 체크메이트):
 *   ① 마스터 대국(기본) — public/master-games.json 12만여 판에서, 마지막 --window 플라이 안의 포지션을 Stockfish로 분석해 강제
 *      메이트(1~4수)를 뽑는다. 한 대국에서 최대 --max-per-game개. 외부망이 필요 없다. 코어 수만큼 병렬(--workers).
 *        node scripts/build-attack-positions.mjs [--workers=4] [--window=20] [--max-per-game=2] [--limit-games=N]
 *      진행 결과는 scripts/.attack-cache/found.jsonl에 계속 쌓이므로 중간에 멈췄다 다시 돌려도 이어서 한다(--fresh로 처음부터).
 *   ② Lichess 퍼즐 DB(CSV, database.lichess.org/lichess_db_puzzle.csv.zst를 푼 것) — 인기 있는 메이트 퍼즐을 테마별로 골라 합친다.
 *        node scripts/build-attack-positions.mjs --lichess-csv=lichess_db_puzzle.csv [--per-bucket=400]
 *  마지막에 캐시 + 기존 JSON을 합쳐(FEN 중복 제거) src/data/attackPositions.json을 다시 쓴다. 캐시만 합치려면 --assemble.
 *
 *  출력 형식(용량 때문에 배열): [fen, "uci uci ...", "theme theme", 출처]  — mateIn은 수순 길이에서 구한다.
 */
import { spawn, fork } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, createReadStream, rmSync } from "node:fs";
import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import { mateThemes } from "./lib/mateThemes.mjs";

const arg = (name, def) => { const a = process.argv.find((x) => x.startsWith("--" + name + "=")); return a ? a.split("=").slice(1).join("=") : (process.argv.includes("--" + name) ? true : def); };
const OUT = "src/data/attackPositions.json";
const CACHE_DIR = "scripts/.attack-cache";
const CACHE = CACHE_DIR + "/found.jsonl";
const DEPTH = 14;
const fenKey = (fen) => fen.split(" ").slice(0, 4).join(" ");

// ---------- 엔진 ----------
function makeEngine() {
  const require = createRequire(import.meta.url);
  const SF = dirname(require.resolve("stockfish18/package.json")) + "/bin/stockfish-18-lite-single.js";
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
    async init() { send("uci"); await until(/^uciok/); send("setoption name Hash value 32"); send("isready"); await until(/^readyok/); },
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

// 공격 측의 모든 수(마지막 메이트 수 제외)가 유일해야 하고, 수비 측은 엔진 최선 응수를 따른다. 반환: UCI 수순 | null
async function verifyLine(eng, fen, n) {
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

// ---------- 작업자: 대국을 훑어 JSONL 한 줄(포지션)씩 부모에게 보낸다 ----------
async function worker(idx, total) {
  const windowPlies = parseInt(arg("window", "20"), 10);
  const maxPerGame = parseInt(arg("max-per-game", "2"), 10);
  const limit = parseInt(arg("limit-games", "0"), 10);
  const master = JSON.parse(readFileSync("public/master-games.json", "utf8"));
  let games = master.games.filter((g) => g.result === "1-0" || g.result === "0-1");
  // 결정론적 셔플(시드 고정) — 다시 돌려도 같은 순서라 캐시와 함께 이어서 할 수 있다.
  let s = 530 >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = games.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [games[i], games[j]] = [games[j], games[i]]; }
  if (limit) games = games.slice(0, limit);
  const doneFile = CACHE_DIR + "/done.txt";
  const done = new Set(existsSync(doneFile) ? readFileSync(doneFile, "utf8").split("\n").filter(Boolean).map(Number) : []);
  const eng = makeEngine();
  await eng.init();
  let scanned = 0;
  for (let gi = idx; gi < games.length; gi += total) {
    if (done.has(gi)) continue;
    const g = games[gi];
    scanned++;
    const c = new Chess();
    const fens = [];
    let ok = true;
    try { for (const san of g.moves.split(" ")) { fens.push(c.fen()); c.move(san); } } catch { ok = false; }
    let got = 0;
    if (ok) {
      for (let i = fens.length - 1; i >= Math.max(0, fens.length - windowPlies) && got < maxPerGame; i--) {
        const fen = fens[i];
        // 빠른 1차 선별(얕은 탐색) — 이기는 메이트 점수가 보일 때만 깊게 다시 본다.
        const quick = await eng.analyse(fen, 1, 9);
        if (!quick[0] || quick[0].kind !== "mate" || quick[0].val < 1 || quick[0].val > 5) continue;
        const res = await eng.analyse(fen, 2);
        const a = res[0];
        if (!a || a.kind !== "mate" || a.val < 1 || a.val > 4) continue;
        const line = await verifyLine(eng, fen, a.val);
        if (!line) continue;
        const th = mateThemes(fen, line);
        if (!th) continue;
        got++;
        const who = (g.white || "?").split(",")[0] + "–" + (g.black || "?").split(",")[0];
        process.send({ type: "found", row: [fen, line.join(" "), th.join(" "), who + (g.date ? " " + g.date.slice(0, 4) : "")], gi });
      }
    }
    process.send({ type: "game", gi });
  }
  eng.quit();
  process.send({ type: "end", scanned });
}

// ---------- 조립: 캐시 + 기존 JSON(+ Lichess 몫) → src/data/attackPositions.json ----------
function loadExisting() {
  if (!existsSync(OUT)) return [];
  return JSON.parse(readFileSync(OUT, "utf8")).map((p) => Array.isArray(p) ? p : [p.fen, p.moves.join(" "), p.th ? p.th.join(" ") : "", p.src || ""]);
}
function backfillThemes(row) {
  if (row[2]) return row;
  const th = mateThemes(row[0], row[1].split(" "));
  return th ? [row[0], row[1], th.join(" "), row[3]] : null;
}
function assemble(extra = []) {
  const rows = [...loadExisting(), ...(existsSync(CACHE) ? readFileSync(CACHE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).row) : []), ...extra];
  const seen = new Set(), out = [];
  for (const r0 of rows) {
    const r = backfillThemes(r0);
    if (!r) continue;
    const k = fenKey(r[0]);
    if (seen.has(k)) continue;
    seen.add(k); out.push(r);
  }
  // 결정적 순서(FEN 순) — 두 클라이언트가 같은 목록을 같은 순서로 갖는다.
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  writeFileSync(OUT, JSON.stringify(out));
  const byN = {}, byTheme = {};
  out.forEach((r) => { const n = (r[1].split(" ").length + 1) / 2; byN[n] = (byN[n] || 0) + 1; r[2].split(" ").forEach((t) => { byTheme[t] = (byTheme[t] || 0) + 1; }); });
  console.log("saved", out.length, "positions →", OUT);
  console.log("수별:", JSON.stringify(byN));
  console.log("테마별:", JSON.stringify(byTheme));
}

// ---------- Lichess 퍼즐 CSV ----------
const LICHESS_MATE_THEMES = new Set(["mateIn1", "mateIn2", "mateIn3", "mateIn4", "mateIn5"]);
async function ingestLichess(path) {
  const perBucket = parseInt(arg("per-bucket", "400"), 10);
  const rl = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  let idx = null;
  const buckets = new Map(); // `${mateIn}|${primaryTheme}` → [{ pop, row }]
  for await (const line of rl) {
    if (!line) continue;
    const cols = line.split(",");
    if (!idx) { idx = Object.fromEntries(cols.map((h, i) => [h, i])); continue; }
    const themes = (cols[idx.Themes] || "").split(" ");
    if (!themes.some((t) => LICHESS_MATE_THEMES.has(t))) continue;
    const mateN = parseInt((themes.find((t) => LICHESS_MATE_THEMES.has(t)) || "").slice(-1), 10);
    if (!(mateN >= 1 && mateN <= 4)) continue; // 5수 이상은 너무 길다
    const moves = (cols[idx.Moves] || "").split(" ");
    let fen;
    try { const c = new Chess(cols[idx.FEN]); c.move({ from: moves[0].slice(0, 2), to: moves[0].slice(2, 4), promotion: moves[0][4] || "q" }); fen = c.fen(); } catch { continue; }
    const sol = moves.slice(1);
    if (sol.length % 2 === 0 || (sol.length + 1) / 2 !== mateN) continue;
    const th = mateThemes(fen, sol);
    if (!th) continue; // 마지막이 체크메이트가 아니거나 불법 수순
    const lt = themes.filter((t) => /Mate$/.test(t) && !/^mateIn/.test(t) && t !== "mate");
    const all = [...new Set([...lt, ...th])];
    const key = mateN + "|" + all[0];
    const arr = buckets.get(key) || [];
    arr.push({ pop: parseInt(cols[idx.Popularity], 10) || 0, row: [fen, sol.join(" "), all.join(" "), "lichess:" + cols[idx.PuzzleId]] });
    buckets.set(key, arr);
  }
  const extra = [];
  for (const arr of buckets.values()) { arr.sort((a, b) => b.pop - a.pop); arr.slice(0, perBucket).forEach((x) => extra.push(x.row)); }
  console.log("Lichess 퍼즐에서", extra.length, "개 선별");
  assemble(extra);
}

// ---------- 진입점 ----------
if (process.argv.includes("--worker")) {
  await worker(parseInt(arg("worker-index", "0"), 10), parseInt(arg("workers", "1"), 10));
} else if (arg("assemble", false)) {
  assemble();
} else if (arg("lichess-csv", null)) {
  await ingestLichess(arg("lichess-csv", null));
} else {
  const n = parseInt(arg("workers", "4"), 10);
  mkdirSync(CACHE_DIR, { recursive: true });
  const progress = CACHE_DIR + "/done.txt";
  if (arg("fresh", false)) { rmSync(CACHE, { force: true }); rmSync(progress, { force: true }); }
  const doneList = existsSync(progress) ? readFileSync(progress, "utf8").split("\n").filter(Boolean) : [];
  const seen = new Set();
  if (existsSync(CACHE)) readFileSync(CACHE, "utf8").split("\n").filter(Boolean).forEach((l) => seen.add(fenKey(JSON.parse(l).row[0])));
  let found = seen.size, scanned = doneList.length, alive = n;
  const t0 = Date.now();
  await new Promise((resolve) => {
    for (let i = 0; i < n; i++) {
      const ch = fork(fileURLToPath(import.meta.url), ["--worker", "--worker-index=" + i, "--workers=" + n, ...process.argv.slice(2).filter((a) => /^--(window|max-per-game|limit-games)=/.test(a))]);
      ch.on("message", (m) => {
        if (m.type === "found") {
          const k = fenKey(m.row[0]);
          if (seen.has(k)) return;
          seen.add(k); found++;
          appendFileSync(CACHE, JSON.stringify({ row: m.row }) + "\n");
        } else if (m.type === "game") {
          scanned++;
          appendFileSync(progress, m.gi + "\n");
          if (scanned % 500 === 0) console.log(`[${Math.round((Date.now() - t0) / 1000)}s] 훑은 대국 ${scanned} · 포지션 ${found}`);
        }
      });
      ch.on("exit", () => { if (--alive === 0) resolve(); });
    }
  });
  console.log(`끝: 훑은 대국 ${scanned}, 새 포지션 ${found}`);
  assemble();
}
