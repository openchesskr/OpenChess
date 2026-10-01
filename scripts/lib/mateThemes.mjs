// (v0.6.1) 체크메이트 포지션의 "메이트 모양" 테마 분류 — 무한 체크메이트 게임의 포지션 풀을 테마별로 고르게 뽑는 데 쓴다.
// Lichess 퍼즐의 테마 이름(backRankMate·smotheredMate 등)과 같은 이름을 쓴다. 빌드 스크립트 전용(브라우저 번들에 들어가지 않는다).
// 입력: 공격 측이 두기 직전 FEN과 UCI 수순(공격·수비 번갈아, 마지막은 체크메이트). 체크메이트로 끝나지 않으면 null.
import { Chess } from "chess.js";

const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const sqName = (f, r) => "abcdefgh"[f] + (r + 1);
const inB = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

// 보드를 [file][rank] 칸 배열로 — 칸 이름 → { type, color }
function toMap(c) {
  const m = new Map();
  c.board().forEach((row) => row.forEach((p) => { if (p) m.set(p.square, { type: p.type, color: p.color, sq: p.square }); }));
  return m;
}
const fr = (sq) => [sq.charCodeAt(0) - 97, parseInt(sq[1], 10) - 1];
// piece(칸 from)가 target 칸을 공격(= 그 칸에 있는 기물을 잡을 수 있는 위치)하는가 — 막는 기물은 map으로 본다.
function attacks(map, p, target) {
  const [f, r] = fr(p.sq), [tf, tr] = fr(target);
  const df = tf - f, dr = tr - r;
  if (p.type === "n") return KN.some(([a, b]) => a === df && b === dr);
  if (p.type === "k") return Math.max(Math.abs(df), Math.abs(dr)) === 1;
  if (p.type === "p") return dr === (p.color === "w" ? 1 : -1) && Math.abs(df) === 1;
  const dirs = p.type === "r" ? ORTHO : p.type === "b" ? DIAG : [...ORTHO, ...DIAG];
  for (const [a, b] of dirs) {
    let x = f + a, y = r + b;
    while (inB(x, y)) {
      const s = sqName(x, y);
      if (s === target) return true;
      if (map.has(s)) break;
      x += a; y += b;
    }
  }
  return false;
}

export function mateThemes(fenBefore, ucis) {
  const c = new Chess(fenBefore);
  let last = null;
  for (const u of ucis) {
    try { last = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" }); } catch { return null; }
    if (!last) return null;
  }
  if (!c.isCheckmate()) return null;
  const matedColor = c.turn(), by = matedColor === "w" ? "b" : "w";
  const map = toMap(c);
  const king = [...map.values()].find((p) => p.type === "k" && p.color === matedColor);
  const mine = [...map.values()].filter((p) => p.color === by);
  const checkers = mine.filter((p) => attacks(map, p, king.sq));
  const [kf, kr] = fr(king.sq);
  const nbrs = [];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if ((a || b) && inB(kf + a, kr + b)) nbrs.push(sqName(kf + a, kr + b));
  const own = (s) => { const p = map.get(s); return !!p && p.color === matedColor; };
  const allOwn = nbrs.every(own);
  const th = [];
  const only = checkers.length === 1 ? checkers[0] : null;
  const homeRank = matedColor === "w" ? 0 : 7;
  const kingEdge = kf === 0 || kf === 7 || kr === 0 || kr === 7;
  const kingCorner = (kf === 0 || kf === 7) && (kr === 0 || kr === 7);
  const adj = (p) => Math.max(Math.abs(fr(p.sq)[0] - kf), Math.abs(fr(p.sq)[1] - kr)) === 1;
  const orthoAdj = (p) => Math.abs(fr(p.sq)[0] - kf) + Math.abs(fr(p.sq)[1] - kr) === 1;
  const diagAdj = (p) => Math.abs(fr(p.sq)[0] - kf) === 1 && Math.abs(fr(p.sq)[1] - kr) === 1;
  const protectedBy = (target, pred) => mine.some((p) => pred(p) && p.sq !== target && attacks(map, p, target));
  if (only && only.type === "n" && allOwn) th.push("smotheredMate");
  if (only && (only.type === "r" || only.type === "q") && kr === homeRank && fr(only.sq)[1] === kr) {
    const fwd = nbrs.filter((s) => Math.abs(fr(s)[1] - kr) === 1);
    if (fwd.length && fwd.every(own)) th.push("backRankMate");
  }
  const hasN = checkers.some((p) => p.type === "n"), hasRQ = checkers.some((p) => p.type === "r" || p.type === "q");
  if (checkers.length === 2 && hasN && hasRQ && kingEdge && !kingCorner && nbrs.some(own)) th.push("anastasiaMate");
  if (kingCorner && only && only.type === "r" && orthoAdj(only) && protectedBy(only.sq, (p) => p.type === "n")) th.push("arabianMate");
  if (only && only.type === "r" && orthoAdj(only) && protectedBy(only.sq, (p) => p.type === "n")) {
    const kn = mine.find((p) => p.type === "n" && attacks(map, p, only.sq));
    if (kn && protectedBy(kn.sq, (p) => p.type === "p")) th.push("hookMate");
  }
  if (only && only.type === "r" && orthoAdj(only) && protectedBy(only.sq, (p) => p.type === "q" && diagAdj(p))) th.push("killBoxMate");
  const bishops = mine.filter((p) => p.type === "b");
  if (only && only.type === "b" && bishops.length >= 2) {
    const other = bishops.find((p) => p.sq !== only.sq && nbrs.some((s) => attacks(map, p, s)));
    if (other) th.push(kingEdge ? "doubleBishopMate" : "bodenMate");
  }
  if (only && only.type === "q" && diagAdj(only)) {
    const free = nbrs.filter((s) => !own(s) && !attacks(map, only, s) && s !== only.sq);
    if (!free.length && nbrs.filter(own).length >= 2) th.push("dovetailMate");
  }
  if (only && (only.type === "q" || only.type === "r") && orthoAdj(only)) {
    const [px, py] = fr(only.sq);
    const side = px === kf ? [[kf - 1, kr], [kf + 1, kr]] : [[kf, kr - 1], [kf, kr + 1]];
    if (side.every(([x, y]) => inB(x, y) && own(sqName(x, y)))) th.push("epauletteMate");
  }
  if (checkers.length >= 2) th.push("doubleCheckMate");
  if (last.promotion) th.push("promotionMate");
  if (only && only.sq !== last.to && !last.promotion) th.push("discoveredCheckMate");
  if (only) th.push({ q: "queenMate", r: "rookMate", b: "bishopMate", n: "knightMate", p: "pawnMate" }[only.type]);
  if (!th.length) th.push("mate");
  return th.filter(Boolean);
}
export const MATE_THEMES = ["smotheredMate", "backRankMate", "anastasiaMate", "arabianMate", "hookMate", "killBoxMate", "bodenMate", "doubleBishopMate", "dovetailMate", "epauletteMate", "doubleCheckMate", "promotionMate", "discoveredCheckMate", "queenMate", "rookMate", "bishopMate", "knightMate", "pawnMate", "mate"];
