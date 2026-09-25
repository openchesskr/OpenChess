#!/usr/bin/env node
/** (v0.5.5) 플레이 탭 미니게임 목록의 "무한 체크메이트 게임"·"백랭크 러시아워" 버튼 보드(4줄×7칸)에서 무작위로
 *  돌려 재생할 장면들 → src/data/hubScenes.json
 *
 *  - mate: src/data/attackPositions.json의 1수·2수 메이트 중, 공격 측을 아래로 돌려 놓았을 때(흑이 공격이면 보드를
 *    뒤집는다) 수순 전체(공격 수·수비 응수)와 수비 킹이 4×7 창 안에 들어오는 포지션. 창 밖 기물은 그리지 않는다.
 *  - rush: 게임과 같은 규칙 엔진(src/lib/rushHour.js)으로, 8랭크~5랭크 7개 파일 창 안에만 기물을 둔 엉킨 포지션을 무작위로
 *    만들고, BFS 풀이기로 2~4수 안에 풀리며 풀이 중 모든 움직임(유인 포획·체크 응수 포함)이 창 안에서 끝나는 것만 남긴다.
 *  보드 칸 색이 실제 체스판과 같도록 창 위치의 홀짝을 목록 화면의 보드 조각(왼쪽 colOffset 1, 오른쪽 8)에 맞춘다.
 *  아래 두 모서리 칸(버튼의 둥근 모서리)에는 움직이는 기물·킹이 서지 않게 한다.
 *  실행: node scripts/build-hub-scenes.mjs
 */
import fs from "node:fs";
import { Chess } from "chess.js";
import { rushSolve, rushApply } from "../src/lib/rushHour.js";

const COLS = 7, ROWS = 4;
let seed = 5505;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const ri = (n) => Math.floor(rand() * n);
const isCorner = (c, r) => r === ROWS - 1 && (c === 0 || c === COLS - 1);

// ---- mate ----
function mateScenes() {
  const A = JSON.parse(fs.readFileSync(new URL("../src/data/attackPositions.json", import.meta.url), "utf8"));
  const out = [];
  for (const p of A) {
    if (p.mateIn > 2) continue;
    const ch = new Chess(p.fen);
    const att = ch.turn();
    const flip = att === "b";
    const disp = (sq) => { let c = sq.charCodeAt(0) - 97, r = 8 - parseInt(sq[1], 10); return flip ? [7 - c, 7 - r] : [c, r]; };
    const board = ch.board();
    const moves = [];
    let ok = true;
    for (const u of p.moves) { let mv = null; try { mv = ch.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" }); } catch { } if (!mv || mv.flags.includes("k") || mv.flags.includes("q") || mv.flags.includes("e") || mv.promotion) { ok = false; break; } moves.push([...disp(mv.from), ...disp(mv.to)]); }
    if (!ok || !ch.isCheckmate()) continue;
    const kingSq = ch.board().flat().find((x) => x && x.type === "k" && x.color !== att).square;
    const k = disp(kingSq);
    const need = [k, ...moves.flatMap((m) => [[m[0], m[1]], [m[2], m[3]]])];
    // 왼쪽 버튼 보드 조각은 colOffset 1 → 창 (r0 + c0)이 홀수여야 칸 색이 실제와 같다.
    let best = null;
    for (let r0 = 0; r0 <= 8 - ROWS; r0++) for (let c0 = 0; c0 <= 8 - COLS; c0++) {
      if ((r0 + c0) % 2 !== 1) continue;
      const loc = need.map(([c, r]) => [c - c0, r - r0]);
      if (loc.some(([c, r]) => c < 0 || r < 0 || c >= COLS || r >= ROWS || isCorner(c, r))) continue;
      const kr = k[1] - r0;
      if (!best || kr < best.kr) best = { r0, c0, kr };
    }
    if (!best) continue;
    const pieces = [];
    for (let rr = 0; rr < 8; rr++) for (let cc = 0; cc < 8; cc++) {
      const x = board[rr][cc]; if (!x) continue;
      const [dc, dr] = disp(x.square);
      const c = dc - best.c0, r = dr - best.r0;
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      pieces.push([x.color + x.type.toUpperCase(), c, r]);
    }
    out.push({ p: pieces, m: moves.map((m) => [m[0] - best.c0, m[1] - best.r0, m[2] - best.c0, m[3] - best.r0]), k: [k[0] - best.c0, k[1] - best.r0], src: p.src });
  }
  return out;
}

// ---- rush ----
function rushScenes(want) {
  const out = [], seen = new Set();
  // 오른쪽 버튼 보드 조각은 colOffset 8 → 창 (r0 + c0)이 짝수. 창은 8~5랭크(r0 = 0) + 파일 c0..c0+6(c0 = 0).
  const c0 = 0, r0 = 0;
  const idx = (c, r) => (7 - (r + r0)) * 8 + (c + c0);          // 창 좌표 → 엔진 인덱스(rank0*8+file)
  const loc = (i) => [(i & 7) - c0, 7 - (i >> 3) - r0];
  const inWin = (i) => { const [c, r] = loc(i); return c >= 0 && r >= 0 && c < COLS && r < ROWS; };
  let tries = 0;
  while (out.length < want && tries < 60000) {
    tries++;
    const board = new Array(64).fill(null);
    const kc = 1 + ri(COLS - 2);
    board[idx(kc, 0)] = "bK";
    for (const dc of [-1, 0, 1]) board[idx(kc + dc, 1)] = "bP";
    const empty = () => { for (let t = 0; t < 50; t++) { const c = ri(COLS), r = 1 + ri(ROWS - 1); if (!board[idx(c, r)] && !isCorner(c, r)) return [c, r]; } return null; };
    const hs = (() => { for (let t = 0; t < 50; t++) { const c = ri(COLS), r = 2 + ri(ROWS - 2); if (!board[idx(c, r)] && !isCorner(c, r)) return [c, r]; } return null; })();
    if (!hs) continue;
    board[idx(hs[0], hs[1])] = "wR";
    const hero = idx(hs[0], hs[1]);
    const nw = 2 + ri(3), nb = ri(2);
    for (let i = 0; i < nw; i++) { const e = empty(); if (e) board[idx(e[0], e[1])] = "w" + "PPNB"[ri(4)]; }
    for (let i = 0; i < nb; i++) { const e = empty(); if (e && e[1] >= 1) board[idx(e[0], e[1])] = "b" + "NB"[ri(2)]; }
    // 백 폰이 1랭크 쪽(창 밖)으로 갈 일은 없지만, 8랭크에 선 백 폰은 규칙상 이상하므로 뺀다.
    if (board.some((x, i) => x === "wP" && (i >> 3) === 7)) continue;
    const start = { board, hero };
    // 처음부터 이미 메이트 상태거나 흑 킹이 체크 중이면 버린다.
    const sol = rushSolve(start, 4, 40000);
    if (!sol || sol.par < 2) continue;
    // 풀이 재생 — 유인 포획·체크 응수까지 모든 움직임이 창 안이어야 한다.
    let st = start, moves = [], okAll = true;
    for (const [a, b] of sol.line) {
      const res = rushApply(st, a, b);
      for (const e of res.events) {
        if (!inWin(e.from) || !inWin(e.to)) { okAll = false; break; }
        const [fc, fr] = loc(e.from), [tc, tr] = loc(e.to);
        if (e.from === st.hero && isCorner(tc, tr)) okAll = false;
        moves.push([fc, fr, tc, tr]);
      }
      if (!okAll) break;
      st = res.state;
    }
    if (!okAll) continue;
    const key = board.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const pieces = [];
    board.forEach((x, i) => { if (x) { const [c, r] = loc(i); pieces.push([x, c, r]); } });
    out.push({ p: pieces, m: moves, k: [kc, 0], h: [hs[0], hs[1]] });
  }
  return out;
}

const mate = mateScenes();
const rush = rushScenes(24);
fs.writeFileSync(new URL("../src/data/hubScenes.json", import.meta.url), JSON.stringify({ mate, rush }));
console.log("mate", mate.length, "rush", rush.length);
