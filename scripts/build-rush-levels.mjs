#!/usr/bin/env node
/** (v0.5.3 기능) 러시아워(룩 탈출) 레벨 생성기 → src/data/rushLevels.json
 *
 *  무작위로 "엉킨" 포지션을 만들고(주인공 룩 주변을 내 기물로 둘러싸고, 상대 킹은 자기 폰에 갇힌
 *  백랭크에 두고, 수비 기물 몇 개를 흩어 둔다), 게임과 똑같은 규칙 엔진(src/lib/rushHour.js)의
 *  BFS 풀이기로 실제로 풀리는지·최소 몇 수(par)인지 확인한 것만 남긴다. 따라서 레벨 파일의 모든
 *  퍼즐은 풀이가 보장되고, par는 실제 최소 수다.
 *  난이도: easy(par 3~4) / normal(5~6) / hard(7~9). 희생으로 상대 기물을 끌어내야만 하는(유인 없이는
 *  par가 더 길어지거나 풀리지 않는) 퍼즐에는 lure 표시를 붙인다.
 *  실행: node scripts/build-rush-levels.mjs
 */
import { writeFileSync } from "node:fs";
import { rushParse, rushSerialize, rushSolve, rushTargetsFrom, rushAttacked } from "../src/lib/rushHour.js";

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const rand = rng(5303);
const ri = (n) => Math.floor(rand() * n);
const pick = (a) => a[ri(a.length)];
const idx = (f, r) => r * 8 + f;

const WANT = { easy: 16, normal: 16, hard: 14 };
const band = (par) => (par <= 4 ? "easy" : par <= 6 ? "normal" : "hard");
const out = { easy: [], normal: [], hard: [] };
const seen = new Set();

function genOne() {
  const board = new Array(64).fill(null);
  // 상대 킹 — 백랭크(8랭크), 자기 폰 세 개에 갇혀 있다.
  const kf = 1 + ri(6);
  board[idx(kf, 7)] = "bK";
  for (const df of [-1, 0, 1]) { const f = kf + df; if (f >= 0 && f < 8) board[idx(f, 6)] = "bP"; }
  // 가끔 폰 하나를 한 칸 앞으로(루프 구멍) — 그 칸을 다른 수비 기물이 막고 있어야 메이트가 된다.
  if (rand() < 0.25) { const f = kf + pick([-1, 1]); if (f >= 0 && f < 8 && board[idx(f, 6)]) { board[idx(f, 6)] = null; board[idx(f, 5)] = "bP"; } }
  // 수비 기물 1~3개.
  const guards = 1 + ri(3);
  for (let g = 0; g < guards; g++) {
    for (let t = 0; t < 20; t++) {
      const f = ri(8), r = 2 + ri(6);
      if (board[idx(f, r)]) continue;
      board[idx(f, r)] = "b" + pick(["B", "N", "R", "N", "B", "Q"]);
      break;
    }
  }
  // 주인공 룩 — 1~2랭크 어딘가.
  const hf = ri(8), hr = ri(2);
  if (board[idx(hf, hr)]) return null;
  board[idx(hf, hr)] = "wR";
  const hero = idx(hf, hr);
  // 룩을 둘러싸는 내 기물 3~6개(체비셰프 거리 2 이내, 1~3랭크).
  const blockers = 3 + ri(4);
  let placed = 0;
  for (let t = 0; t < 60 && placed < blockers; t++) {
    const f = hf + ri(5) - 2, r = hr + ri(4) - 1;
    if (f < 0 || f > 7 || r < 0 || r > 2 || board[idx(f, r)]) continue;
    const type = pick(["P", "P", "P", "N", "B", "N", "B", "Q", "R"]);
    if (type === "P" && r === 0) continue;
    board[idx(f, r)] = "w" + type; placed++;
  }
  // 멀리 떨어진 내 기물 0~2개(3~5랭크) — 길을 막거나, 희생용으로 쓰일 수 있다.
  const extras = ri(3);
  for (let e = 0; e < extras; e++) {
    const f = ri(8), r = 2 + ri(3);
    if (board[idx(f, r)]) continue;
    board[idx(f, r)] = "w" + pick(["P", "N", "B"]);
  }
  const state = { board, hero };
  // 시작부터 흑 킹이 체크면 버린다. 룩이 이미 자유로우면(합법 수 2개 이상) "엉킨" 퍼즐이 아니다.
  if (rushAttacked(board, idx(kf, 7), "w")) return null;
  if (rushTargetsFrom(state, hero).length > 1) return null;
  return state;
}

let tries = 0;
const t0 = Date.now();
const log = (b, sol) => process.stderr.write(`[${tries} ${((Date.now() - t0) / 1000) | 0}s] ${b} par${sol.par}${sol.lured ? " lure" : ""} (${out.easy.length}/${out.normal.length}/${out.hard.length})\n`);
const accept = (key, sol) => {
  const b = band(sol.par);
  if (out[b].length >= WANT[b]) return false;
  out[b].push({ spec: key, par: sol.par, lure: sol.lured, line: sol.line, state: rushParse(key) });
  log(b, sol);
  return true;
};
// 1단계: 무작위 생성 — 쉬움·보통을 채운다.
while ((out.easy.length < WANT.easy || out.normal.length < WANT.normal) && tries < 200000) {
  tries++;
  const s = genOne();
  if (!s) continue;
  const key = rushSerialize(s);
  if (seen.has(key)) continue;
  seen.add(key);
  const sol = rushSolve(s, 8, 30000);
  if (!sol || sol.par < 3) continue;
  accept(key, sol);
}
// 2단계: 언덕 오르기 — 이미 풀리는 보통 레벨에서 출발해, 내 기물 하나(룩 주변 위주)나 수비 기물
// 하나를 더하는 변이를 주고 다시 풀어 par가 늘어난 변이만 이어받는다. 무작위 생성으로는 거의 안
// 나오는 par 7~9 퍼즐을 "여전히 풀리는" 상태를 유지한 채 점점 어렵게 만든다.
function mutate(state) {
  for (let t = 0; t < 30; t++) {
    const board = state.board.slice();
    const r = rand();
    let i;
    if (r < 0.55) {
      const hf = state.hero & 7, hr = state.hero >> 3;
      const f = hf + ri(5) - 2, rr = hr + ri(4) - 1;
      if (f < 0 || f > 7 || rr < 0 || rr > 3) continue;
      i = idx(f, rr);
    } else i = ri(64);
    if (board[i]) continue;
    const rank = i >> 3;
    if (rank === 7) continue;
    if (r < 0.8) {
      const type = pick(["P", "P", "N", "B", "R", "Q"]);
      if (type === "P" && (rank === 0 || rank >= 6)) continue;
      board[i] = "w" + type;
    } else {
      if (rank < 2) continue;
      board[i] = "b" + pick(["N", "B", "R"]);
    }
    const ns = { board, hero: state.hero };
    if (rushAttacked(board, board.indexOf("bK"), "w")) continue;
    if (rushTargetsFrom(ns, ns.hero).length > 1) continue;
    return ns;
  }
  return null;
}
let climbs = 0;
while (out.hard.length < WANT.hard && climbs < 4000) {
  climbs++;
  let cur = pick(out.normal).state, curPar;
  { const s0 = rushSolve(cur, 9, 60000); if (!s0) continue; curPar = s0.par; }
  for (let step = 0; step < 14 && out.hard.length < WANT.hard; step++) {
    tries++;
    const ns = mutate(cur);
    if (!ns) continue;
    const key = rushSerialize(ns);
    if (seen.has(key)) continue;
    seen.add(key);
    const sol = rushSolve(ns, 9, 150000);
    if (!sol || sol.par <= curPar) continue;
    cur = ns; curPar = sol.par;
    if (sol.par >= 7) { accept(key, sol); break; }
  }
}
// 난이도 안에서 par 오름차순 → 같은 par면 유인 없는 것 먼저(자연스러운 학습 곡선).
const levels = [];
for (const b of ["easy", "normal", "hard"]) {
  out[b].sort((x, y) => x.par - y.par || (x.lure - y.lure));
  out[b].forEach((l, i) => levels.push({ id: b[0] + (i + 1), diff: b, spec: l.spec, par: l.par, lure: l.lure, line: l.line }));
}
writeFileSync("src/data/rushLevels.json", JSON.stringify(levels));
console.log("saved", levels.length, "levels in", tries, "tries");
