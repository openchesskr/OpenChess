#!/usr/bin/env node
/** (v0.5.7, BUG-020 재발 방지) 나이트 레이스 라운드 검사(src/lib/knightRace.js).
 *   · 위협 칸이 실제 체스와 같은지 — 독립 구현(보드 배열을 직접 훑기)과 비교, 공격선은 기물에 막힘
 *   · 사용자 제보 포지션(목표 e5, 흑 룩 b4·f4, 비숍 d2, 나이트 h2)의 f1이 위협 칸이고 답이 없다고 판정되는지(회귀)
 *   · 생성한 라운드(혼자·실시간 양쪽, 라운드 1~5)가 전부 풀리는지 — 시작·목표 칸 안전, par 경로를 규칙대로 밟아 잡히지 않고
 *     도착, 기물 잡기까지 고려한 실제 최단 수 ≤ 이동 수 제한. 실시간은 흑 쪽도 같은 par
 *   · 5라운드는 반드시 상대 퀸이 있는지
 *   · (v0.5.7) 1·2라운드는 방해 기물이 없고 3라운드부터 있는지, 제한시간이 10·12.5·15·17.5·20초인지, 클라이언트 KNIGHT_ROUND_SPECS와
 *     서버 _knight_gen_round의 표(v_specs)가 같은지, 판정 규칙(knightJudge — 거리 → 거리 같으면 소모 시간)이 맞는지
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-knight-rounds.mjs
 */
import {
  KNIGHT_ALL_SQS, KNIGHT_HAZARD_DIRS, knightDangerFor, knightApplyMove, knightExactPath, knightSafeWalls, knightShortestPath,
  knightNeighbors, knightGenRound, knightOwnBlocked, KNIGHT_ROUND_SPECS, knightJudge,
} from "../src/lib/knightRace.js";
import { readFileSync } from "node:fs";

const problems = [];
const fail = (m) => problems.push(m);

// 독립 구현: 8×8 배열에 기물을 놓고 방향마다 한 칸씩 훑는다.
function refDanger(round, color, taken) {
  const t = new Set(taken || []);
  const live = (round.hazards || []).filter((h) => !t.has(h.sq));
  const occ = {}; live.forEach((h) => { occ[h.sq] = h; });
  const out = new Set();
  for (const h of live) {
    if (h.color === color) continue;
    const f0 = h.sq.charCodeAt(0) - 97, r0 = +h.sq[1] - 1;
    for (const [df, dr] of KNIGHT_HAZARD_DIRS[h.type]) {
      for (let k = 1; k < 8; k++) {
        const f = f0 + df * k, r = r0 + dr * k;
        if (f < 0 || f > 7 || r < 0 || r > 7) break;
        const sq = "abcdefgh"[f] + (r + 1);
        out.add(sq);
        if (occ[sq]) break;
      }
    }
  }
  return out;
}
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// 1) 사용자 제보 포지션 회귀
const shot = { target: "e5", hazards: [{ sq: "b4", type: "R", color: "b" }, { sq: "f4", type: "R", color: "b" }, { sq: "d2", type: "B", color: "b" }] };
const shotDanger = new Set(knightDangerFor(shot, "w", []));
for (const sq of ["f1", "f3", "g4"]) if (!shotDanger.has(sq)) fail("제보 포지션: 칸 " + sq + " — 위협 칸이 아님(룩 f4가 공격)");
if (knightExactPath(shot, "w", "h2")) fail("제보 포지션: 답이 없어야 하는데 경로가 있다고 판정");
// 2) 공격선 막힘: 흑 룩 a4, 흑 비숍 c4 → b4·c4는 공격, d4 이후는 룩이 못 봄
const blk = { target: "h8", hazards: [{ sq: "a4", type: "R", color: "b" }, { sq: "c4", type: "B", color: "b" }] };
const blkD = new Set(knightDangerFor(blk, "w", []));
if (!blkD.has("b4") || !blkD.has("c4") || blkD.has("d4")) fail("공격선 막힘: a4 룩의 선이 c4에서 멈춰야 함");
if (!new Set(knightDangerFor(blk, "w", ["c4"])).has("h4")) fail("기물을 잡은 뒤: c4 비숍이 사라지면 a4 룩의 선이 h4까지 열려야 함");
// 퀸
const q = new Set(knightDangerFor({ target: "a1", hazards: [{ sq: "d4", type: "Q", color: "b" }] }, "w", []));
if (!["d8", "h4", "a1", "h8", "a7"].every((s) => q.has(s))) fail("퀸 공격 칸이 룩+비숍과 다름");

// 3) 무작위 라운드 — 시드 고정(결과가 매번 같게)
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const PER = 24;
let rounds = 0, queenRounds = 0;
function checkSide(r, color, start, tag) {
  const d = new Set(knightDangerFor(r, color, []));
  const refD = refDanger(r, color, []);
  if (!sameSet(d, refD)) fail(tag + ": 위협 칸이 독립 구현과 다름");
  if (d.has(r.target)) fail(tag + ": 목표 칸이 위협 칸");
  if (d.has(start)) fail(tag + ": 시작 칸이 위협 칸");
  const path = knightShortestPath(start, r.target, knightSafeWalls(r, color));
  if (!path) { fail(tag + ": 잡지 않고 가는 경로가 없음"); return; }
  if (path.length - 1 !== r.par) fail(tag + ": par " + r.par + " ≠ 경로 " + (path.length - 1));
  let taken = [];
  const own = new Set(knightOwnBlocked(r, color, []));
  for (let i = 1; i < path.length; i++) {
    if (!knightNeighbors(path[i - 1], own).includes(path[i])) { fail(tag + ": 경로에 나이트 수가 아닌 이동"); break; }
    const mv = knightApplyMove(r, color, taken, path[i]); taken = mv.taken;
    if (mv.captured) { fail(tag + ": par 경로 " + path[i] + "에서 잡힘"); break; }
  }
  const ex = knightExactPath(r, color, start);
  if (!ex || ex.length - 1 > r.moveBudget) fail(tag + ": 이동 수 제한 안에 답이 없음");
}
for (const solo of [true, false]) {
  for (let idx = 0; idx < 5; idx++) {
    const rnd = mulberry32(1000 * idx + (solo ? 7 : 13));
    for (let n = 0; n < PER; n++) {
      const r = knightGenRound(idx, { solo, rnd });
      rounds++;
      const tag = (solo ? "혼자" : "실시간") + " " + (idx + 1) + "라운드 #" + n + " (" + r.target + ")";
      if (idx < 2 && r.hazards.length) fail(tag + ": 1·2라운드인데 방해 기물이 있음");
      if (idx >= 2 && !r.hazards.length) fail(tag + ": 기물 없는 기본 라운드로 떨어짐");
      if (r.timeLimitMs !== 10000 + 2500 * idx) fail(tag + ": 제한시간 " + r.timeLimitMs + "ms (기대 " + (10000 + 2500 * idx) + ")");
      if (solo && r.hazards.some((h) => h.color === "w")) fail(tag + ": 혼자 플레이에 내 진영 기물이 있음");
      checkSide(r, "w", r.whiteStart, tag + " 백");
      if (!solo) checkSide(r, "b", r.blackStart, tag + " 흑");
      if (idx === 4) {
        const bq = r.hazards.some((h) => h.type === "Q" && h.color === "b"), wq = r.hazards.some((h) => h.type === "Q" && h.color === "w");
        if (!bq || (!solo && !wq)) fail(tag + ": 5라운드에 상대 퀸이 없음"); else queenRounds++;
      }
    }
  }
}
// 4) 클라이언트·서버 라운드 표가 같은지
{
  const sql = readFileSync(new URL("../supabase-setup.sql", import.meta.url), "utf8");
  const m = /v_specs int\[\]\[\] := array\[(.*?)\];/.exec(sql);
  if (!m) fail("supabase-setup.sql에서 _knight_gen_round의 v_specs를 찾지 못함");
  else {
    const rows = [...m[1].matchAll(/\[([\d,\s]+)\]/g)].map((x) => x[1].split(",").map((v) => +v.trim()));
    const js = KNIGHT_ROUND_SPECS.map((sp) => [sp.minDist, sp.maxDist, sp.pairs, sp.minDetour, sp.queens, sp.onlyFirst ? 1 : 0, sp.timeMs]);
    if (JSON.stringify(rows) !== JSON.stringify(js)) fail("라운드 표가 다름\n    서버 " + JSON.stringify(rows) + "\n    클라 " + JSON.stringify(js));
  }
}
// 5) 판정 규칙 — 목표 d4, 방해 기물 없음
{
  const r = { target: "d4", hazards: [] };
  const rep = (o) => ({ reached: false, moves: 2, atMs: 5000, captured: false, taken: [], ...o });
  const j1 = knightJudge(r, rep({ finalSq: "b3" }), rep({ finalSq: "a1" })); // b3→d4 1수, a1→d4 2수
  if (j1.winner !== "w" || j1.basis !== "distance" || j1.wDist !== 1 || j1.bDist !== 2) fail("판정: 가까운 쪽이 이겨야 함 " + JSON.stringify(j1));
  const j2 = knightJudge(r, rep({ finalSq: "b3", atMs: 7000 }), rep({ finalSq: "f5", atMs: 6000 })); // 둘 다 1수 거리
  if (j2.winner !== "b" || j2.basis !== "distanceTime") fail("판정: 거리가 같으면 시간이 적은 쪽 " + JSON.stringify(j2));
  const j3 = knightJudge(r, rep({ finalSq: "b3", captured: true }), rep({ finalSq: "a1" }));
  if (j3.winner !== "b" || j3.wDist !== 99) fail("판정: 잡힌 나이트는 가장 멀다 " + JSON.stringify(j3));
  const j4 = knightJudge(r, rep({ reached: true, moves: 3 }), rep({ reached: true, moves: 2 }));
  if (j4.winner !== "b" || j4.basis !== "moves") fail("판정: 둘 다 도착하면 적은 수 " + JSON.stringify(j4));
  const sql = readFileSync(new URL("../supabase-setup.sql", import.meta.url), "utf8");
  const body = /function public\.knight_resolve_round[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql);
  if (!body || !/'distanceTime'/.test(body[1]) || /v_w_remain/.test(body[1]) || !/'judge'/.test(body[1])) fail("서버 knight_resolve_round가 거리 → 시간 규칙·judge 기록을 따르지 않음");
}
if (problems.length) {
  console.error("✗ knight rounds check 실패:\n  " + problems.slice(0, 30).join("\n  ") + (problems.length > 30 ? "\n  … 외 " + (problems.length - 30) + "건" : ""));
  process.exit(1);
}
console.log("✓ knight rounds check: 위협 칸 = 실제 체스(막힘·퀸 포함), 제보 포지션 회귀, 라운드 " + rounds + "개 모두 풀림, 5라운드 퀸 " + queenRounds + "/" + (PER * 2));
