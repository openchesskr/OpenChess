// (v0.7.1 기능, 사용자 요청) 유산 재생 보드의 기물 연출 계획 — 수 하나(SAN)를 "잡기 연출 → 이동 연출" 타임라인으로 바꾼다. 화면과 분리된 순수 계산만
// 둔다(scripts/check-legacy-motion.mjs가 검사). 그리는 쪽은 src/components/legacyMotion.jsx.
//  · 잡기 연출(기물마다 다르다): 폰 박치기·나이트 점프 후 내려찍기는 이동을 겸한다(captureMoves). 비숍 저격 조준·룩 검기·퀸 8방향 파동→폭발·킹 일격은
//    제자리에서 상대를 먼저 쓰러뜨리고, 그 연출이 완전히 끝난 뒤에 이동 연출이 이어진다.
//  · 이동 연출: 지나가는 칸이 차례로 빛나고 기물 뒤로 잔상이 따라간다. 나이트는 L자(긴 쪽 두 칸 → 짧은 쪽 한 칸)로 밟고 간다.
import { sanSrc } from "./chessRules.js";

export const MOVE_STEP_MS = 120;              // 이동 연출: 칸 하나를 지나는 시간
export const MOVE_MIN_MS = 380, MOVE_MAX_MS = 900;
export const BURST_STEP_MS = 95;              // 퀸 파동이 한 칸 퍼지는 시간
export const CAPTURE_STYLE = { P: "headbutt", N: "leap", B: "snipe", R: "slash", Q: "burst", K: "strike" };
export const CAPTURE_MOVES = { headbutt: true, leap: true };   // 이동을 겸하는 잡기
const CAPTURE_MS = { headbutt: 720, leap: 820, snipe: 1050, slash: 950, strike: 480 };
export const burstMs = (dist) => 420 + dist * BURST_STEP_MS;
// 수 아이콘: 윤곽선이 한 바퀴 그려지고(RING) 그 안에 아이콘이 도장처럼 찍힌다(HIT).
export const STAMP_RING_MS = 420, STAMP_HIT_MS = 340;
export const STAMP_MS = STAMP_RING_MS + STAMP_HIT_MS;

const sgn = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const inBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
// from에서 to까지 밟고 지나가는 칸(from 제외, to 포함). 직선·대각선은 한 칸씩, 나이트는 L자.
export function movePath(from, to, piece) {
  const dr = to[0] - from[0], dc = to[1] - from[1];
  if (piece === "N") {
    if (Math.abs(dr) === 2) { const s = sgn(dr); return [[from[0] + s, from[1]], [from[0] + 2 * s, from[1]], to]; }
    const s = sgn(dc); return [[from[0], from[1] + s], [from[0], from[1] + 2 * s], to];
  }
  const sr = sgn(dr), sc = sgn(dc), n = Math.max(Math.abs(dr), Math.abs(dc));
  const out = [];
  for (let i = 1; i <= n; i++) out.push([from[0] + sr * i, from[1] + sc * i]);
  return out;
}
export const moveMsFor = (path) => Math.max(MOVE_MIN_MS, Math.min(MOVE_MAX_MS, path.length * MOVE_STEP_MS));
// 퀸 파동 — 8방향으로 한 칸씩 퍼지다 기물(어느 편이든)을 만나면 그 칸에서 멈춘다. [{ sq, dist }]
export function burstRays(board, from) {
  const out = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    for (let i = 1; i < 8; i++) {
      const r = from[0] + dr * i, c = from[1] + dc * i;
      if (!inBoard(r, c)) break;
      out.push({ sq: [r, c], dist: i });
      if (board[r][c]) break;
    }
  }
  return out;
}

// 돌려주는 값: null(읽을 수 없는 수) | {
//   moves: [{ from, to, piece:{t,c}, path }](캐슬링이면 킹·룩 둘), capture: null | { style, sq(잡히는 기물 칸 — 앙파상이면 도착 칸과 다르다), piece, dist },
//   captureMs, moveMs(captureMoves면 0), total, captureMoves, rays(퀸 파동일 때) }
export function legacyMotionPlan(board, san, color) {
  if (!board || !san) return null;
  const info = sanSrc(board, san, color);
  if (!info) return null;
  if (info.castle) {
    const rank = color === "w" ? 7 : 0, king = info.castle === "k";
    const kFrom = [rank, 4], kTo = [rank, king ? 6 : 2], rFrom = [rank, king ? 7 : 0], rTo = [rank, king ? 5 : 3];
    const moves = [
      { from: kFrom, to: kTo, piece: board[kFrom[0]][kFrom[1]] || { t: "K", c: color }, path: movePath(kFrom, kTo, "K") },
      { from: rFrom, to: rTo, piece: board[rFrom[0]][rFrom[1]] || { t: "R", c: color }, path: movePath(rFrom, rTo, "R") },
    ];
    const moveMs = Math.max(...moves.map((m) => moveMsFor(m.path)));
    return { moves, capture: null, captureMs: 0, moveMs, total: moveMs, captureMoves: false, rays: null, promo: null };
  }
  const { from, to } = info;
  const piece = board[from[0]][from[1]] || { t: info.piece, c: color };
  const path = movePath(from, to, info.piece);
  const moves = [{ from, to, piece, path }];
  let capture = null;
  if (info.isCap) {
    // 앙파상: 도착 칸이 비어 있으면 잡히는 폰은 출발 줄·도착 열에 있다.
    const sq = board[to[0]][to[1]] ? to : [from[0], to[1]];
    const victim = board[sq[0]][sq[1]];
    if (victim) capture = { style: CAPTURE_STYLE[info.piece] || "strike", sq, piece: victim, dist: Math.max(Math.abs(sq[0] - from[0]), Math.abs(sq[1] - from[1])) };
  }
  const captureMoves = !!(capture && CAPTURE_MOVES[capture.style]);
  const captureMs = capture ? (capture.style === "burst" ? burstMs(capture.dist) : CAPTURE_MS[capture.style]) : 0;
  const moveMs = captureMoves ? 0 : moveMsFor(path);
  const rays = capture && capture.style === "burst" ? burstRays(board, from) : null;
  return { moves, capture, captureMs, moveMs, total: captureMs + moveMs, captureMoves, rays, promo: info.promo || null };
}
