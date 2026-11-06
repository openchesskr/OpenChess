import { Chess } from "chess.js";

// MEC 전술 탐지 — 포크·핀·스큐어·디스커버드 공격/체크·더블 체크·백랭크·메이트 위협·승격/통과폰.
// 순수 함수 모듈이다(문장은 만들지 않는다 — 문장은 common.jsx의 MEC_PHRASES가 맡는다). 모든 판정은 chess.js로 독립 검증한다.
//   · moveTactics(fenBefore, san)   이 수가 만들어 내는 전술(A). 좋은 등급의 수에만 쓴다.
//   · replyTactics(fenAfter)        이 수를 둔 뒤 상대가 걸 수 있는 가장 강한 전술·메이트(B). 나쁜 등급의 수 설명에 쓴다.
//   · pinnedMoveFact(fenBefore,san) 핀에 걸린 기물을 움직여 뒤의 기물을 노출시켰는지(B).
//   · bestMoveTactic(fenBefore,san) 놓친 최선 수의 전술(C).
// 반환값에 칸 좌표(squares)를 함께 담는다 — 전술 시각화 화살표가 그대로 쓸 수 있다.
const V = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const FILES = "abcdefgh";
const sqOf = (r, f) => FILES[f] + (8 - r);
const DIRS = { b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], r: [[1, 0], [-1, 0], [0, 1], [0, -1]] };
export const TACTIC_PRIORITY = ["doubleCheck", "discoveredCheck", "fork", "skewer", "pinAbs", "discoveredAttack", "backRank", "pinRel", "mateThreat", "promotion", "passedPawn"];

function boardList(c) { const out = []; c.board().forEach((row, r) => row.forEach((p, f) => { if (p) out.push({ ...p, sq: sqOf(r, f), r, f }); })); return out; }
function kingSq(c, color) { const k = boardList(c).find((p) => p.type === "k" && p.color === color); return k ? k.sq : null; }
// color가 두는 차례로 돌렸을 때 from 칸의 기물이 실제로 잡을 수 있는 칸들(자기 킹 앞에서 핀에 걸린 기물은 못 잡는다). 돌릴 수 없으면(상대가 체크 중 등) null.
function captureReach(after, color, from) {
  const parts = after.fen().split(" "); parts[1] = color; parts[3] = "-";
  try { const c = new Chess(parts.join(" ")); return new Set(c.moves({ square: from, verbose: true }).filter((m) => m.captured).map((m) => m.to)); } catch { return null; }
}
// 이 칸의 기물이 상대에게 싸게 잡힐 수 있는가(낮은 가치 기물에 공격받거나, 공격받는데 지켜 주는 기물이 없음)
function unsafe(c, sq) {
  const p = c.get(sq); if (!p) return false;
  const opp = p.color === "w" ? "b" : "w";
  const att = c.attackers(sq, opp); if (!att.length) return false;
  const lowest = Math.min(...att.map((a) => V[c.get(a).type]));
  if (lowest < V[p.type]) return true;
  return c.attackers(sq, p.color).length === 0;
}
// color 쪽 슬라이더가 만든 핀·스큐어 목록. key "S>X>Y".
function lines(c, color) {
  const map = new Map(); const b = c.board(); const opp = color === "w" ? "b" : "w";
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const S = b[r][f]; if (!S || S.color !== color || !"bqr".includes(S.type)) continue;
    const dirs = S.type === "b" ? DIRS.b : S.type === "r" ? DIRS.r : [...DIRS.b, ...DIRS.r];
    for (const [dr, df] of dirs) {
      let rr = r + dr, ff = f + df, X = null, xs = null;
      while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
        const P = b[rr][ff];
        if (P) {
          if (!X) { if (P.color !== opp) break; X = P; xs = sqOf(rr, ff); }
          else {
            if (P.color === opp) {
              const ys = sqOf(rr, ff), key = sqOf(r, f) + ">" + xs + ">" + ys;
              if (P.type === "k" && X.type !== "k") map.set(key, { kind: "pinAbs", S: S.type, X: X.type, Y: "k", s: sqOf(r, f), x: xs, y: ys });
              else if (X.type === "k" && V[P.type] >= 3) map.set(key, { kind: "skewer", S: S.type, X: "k", Y: P.type, s: sqOf(r, f), x: xs, y: ys });
              else if (X.type !== "k" && V[P.type] > V[X.type]) map.set(key, { kind: "pinRel", S: S.type, X: X.type, Y: P.type, s: sqOf(r, f), x: xs, y: ys });
              else if (X.type !== "k" && V[X.type] >= 5 && V[P.type] >= 3 && V[P.type] < V[X.type]) map.set(key, { kind: "skewer", S: S.type, X: X.type, Y: P.type, s: sqOf(r, f), x: xs, y: ys });
            }
            break;
          }
        }
        rr += dr; ff += df;
      }
    }
  }
  return map;
}

// before 포지션에서 mv(verbose)를 둔 뒤의 포지션 after에서, 이 수가 만든 전술 목록(우선순위 순)
function analyzeMove(before, mv, after) {
  const color = mv.color, opp = color === "w" ? "b" : "w", to = mv.to, M = mv.piece;
  const res = [];
  const b = after.board();
  const oppKing = kingSq(after, opp);
  // 체크 계열
  if (after.isCheck() && oppKing) {
    const ch = after.attackers(oppKing, color);
    if (ch.length >= 2) res.push({ kind: "doubleCheck", squares: { to, checkers: ch, king: oppKing } });
    else if (!ch.includes(to)) res.push({ kind: "discoveredCheck", piece: M, by: after.get(ch[0]).type, squares: { from: mv.from, to, checker: ch[0], king: oppKing } });
    // 백랭크: 킹이 마지막 줄, 룩·퀸이 그 줄을 따라 체크, 킹 앞 칸이 전부 자기 기물로 막힘
    const backRank = oppKing[1] === (opp === "w" ? "1" : "8");
    if (backRank && (M === "r" || M === "q") && ch.includes(to) && to[1] === oppKing[1]) {
      const kf = FILES.indexOf(oppKing[0]), rr = 8 - parseInt(oppKing[1], 10) + (opp === "w" ? -1 : 1);
      let boxed = true;
      for (const df of [-1, 0, 1]) { const f = kf + df; if (f < 0 || f > 7) continue; const P = b[rr] && b[rr][f]; if (!P || P.color !== opp) boxed = false; }
      if (boxed) res.push({ kind: "backRank", piece: M, squares: { to, king: oppKing } });
    }
  }
  // 포크
  if (M !== "k" && !unsafe(after, to)) {
    const targets = [];
    const reach = captureReach(after, color, to);
    for (const E of boardList(after)) {
      if (E.color !== opp || !after.attackers(E.sq, color).includes(to)) continue;
      if (E.type !== "k" && reach && !reach.has(E.sq)) continue; // 핀에 걸려 실제로는 못 잡는 대상
      const defended = after.attackers(E.sq, opp).length > 0;
      if (E.type === "k" || V[E.type] > V[M] || (!defended && E.type !== "p")) targets.push({ type: E.type, sq: E.sq });
    }
    targets.sort((a, c) => V[c.type] - V[a.type]);
    if (targets.length >= 2) res.push({ kind: "fork", piece: M, targets, squares: { to, targets: targets.map((x) => x.sq) } });
  }
  // 핀·스큐어(이 수로 새로 생긴 것만)
  const lb = lines(before, color), la = lines(after, color);
  for (const [k, v] of la) {
    if (lb.has(k) || unsafe(after, v.s)) continue;
    if (v.kind === "pinAbs" && "nbrq".includes(v.X)) res.push({ kind: "pinAbs", piece: v.S, pinned: v.X, squares: { s: v.s, x: v.x, y: v.y } });
    else if (v.kind === "pinRel" && "qr".includes(v.Y) && "nbr".includes(v.X) && (v.Y === "q" || after.attackers(v.x, opp).length === 0)) res.push({ kind: "pinRel", piece: v.S, pinned: v.X, behind: v.Y, squares: { s: v.s, x: v.x, y: v.y } });
    else if (v.kind === "skewer") res.push({ kind: "skewer", piece: v.S, front: v.X, back: v.Y, squares: { s: v.s, x: v.x, y: v.y } });
  }
  // 디스커버드 공격
  for (const S of boardList(after)) {
    if (S.color !== color || !"bqr".includes(S.type) || S.sq === to) continue;
    for (const E of boardList(after)) {
      if (E.color !== opp || E.type === "k" || V[E.type] < 3) continue;
      if (!after.attackers(E.sq, color).includes(S.sq) || before.attackers(E.sq, color).includes(S.sq)) continue;
      const undefended = after.attackers(E.sq, opp).length === 0;
      if (V[E.type] >= 5 || undefended || V[E.type] > V[S.type]) { res.push({ kind: "discoveredAttack", piece: M, slider: S.type, target: E.type, squares: { from: mv.from, to, slider: S.sq, target: E.sq } }); break; }
    }
  }
  // 승격·통과폰
  if (mv.promotion) res.push({ kind: "promotion", piece: mv.promotion, squares: { from: mv.from, to } });
  else if (M === "p") {
    const dir = color === "w" ? -1 : 1, tr = 8 - parseInt(to[1], 10), tf = FILES.indexOf(to[0]);
    let passed = true;
    for (let r = tr + dir; r >= 0 && r < 8; r += dir) for (const df of [-1, 0, 1]) { const f = tf + df; if (f < 0 || f > 7) continue; const E = b[r][f]; if (E && E.type === "p" && E.color === opp) passed = false; }
    const rel = color === "w" ? parseInt(to[1], 10) : 9 - parseInt(to[1], 10);
    if (passed && rel >= 5) res.push({ kind: "passedPawn", left: 8 - rel, squares: { to, goal: to[0] + (color === "w" ? "8" : "1") } });
  }
  // 메이트 위협(체크가 아닐 때): 상대 차례를 건너뛰고 내가 한 번 더 두면 체크메이트인가
  if (!after.isCheck()) {
    const m = mateThreat(after, color);
    if (m) res.push({ kind: "mateThreat", san: m.san, squares: { to, king: oppKing, mateFrom: m.from, mateTo: m.to } });
  }
  res.sort((a, c) => TACTIC_PRIORITY.indexOf(a.kind) - TACTIC_PRIORITY.indexOf(c.kind));
  return res;
}
function mateThreat(after, color) {
  const parts = after.fen().split(" "); parts[1] = color; parts[3] = "-";
  let c; try { c = new Chess(parts.join(" ")); } catch { return null; }
  for (const mv of c.moves({ verbose: true })) { c.move(mv.san); const mate = c.isCheckmate(); c.undo(); if (mate) return { san: mv.san, from: mv.from, to: mv.to }; }
  return null;
}
function play(fen, san) {
  try { const after = new Chess(fen); const mv = after.move(san); return mv ? { before: new Chess(fen), after, mv } : null; } catch { return null; }
}

/** A. 이 수가 만든 전술(우선순위 순). 없으면 빈 배열. */
export function moveTactics(fenBefore, san) {
  const g = play(fenBefore, san); if (!g) return [];
  try { return analyzeMove(g.before, g.mv, g.after); } catch { return []; }
}

/** B. 이 수를 둔 뒤 상대가 걸 수 있는 가장 강한 전술. { kind: "mate"|"doubleCheck"|"fork"|"skewer"|"discoveredAttack"|"discoveredCheck", san, ... } */
export function replyTactics(fenAfter) {
  let c; try { c = new Chess(fenAfter); } catch { return null; }
  let best = null; const rank = ["mate", "doubleCheck", "fork", "skewer", "discoveredCheck", "discoveredAttack"];
  for (const r of c.moves({ verbose: true })) {
    const g = play(fenAfter, r.san); if (!g) continue;
    if (g.after.isCheckmate()) return { kind: "mate", san: r.san, squares: { from: r.from, to: r.to } };
    let tacs = []; try { tacs = analyzeMove(g.before, g.mv, g.after); } catch { }
    for (const t of tacs) {
      const i = rank.indexOf(t.kind); if (i < 0) continue;
      if (!best || i < rank.indexOf(best.kind)) best = { ...t, san: r.san };
    }
  }
  return best;
}

/** B. 핀에 걸린 기물을 움직여 뒤의 기물이 노출됐는가. */
export function pinnedMoveFact(fenBefore, san) {
  const g = play(fenBefore, san); if (!g) return null;
  try {
    const { before, after, mv } = g; const opp = mv.color === "w" ? "b" : "w";
    for (const v of lines(before, opp).values()) {
      if (v.x !== mv.from || v.kind !== "pinRel") continue;
      if (!after.attackers(v.y, opp).includes(v.s)) continue;
      const defended = after.attackers(v.y, mv.color).length > 0;
      if (!defended || V[v.Y] > V[v.S]) return { piece: mv.piece, exposed: v.Y, squares: { from: mv.from, to: mv.to, slider: v.s, target: v.y } };
    }
  } catch { }
  return null;
}

/** C. 놓친 최선 수의 전술. 체크메이트·더블/디스커버드 체크·포크·스큐어·디스커버드 공격·승격만 인정한다. */
export function bestMoveTactic(fenBefore, san) {
  const g = play(fenBefore, san); if (!g) return null;
  if (g.after.isCheckmate()) return { kind: "mate", san, squares: { from: g.mv.from, to: g.mv.to } };
  const ok = ["doubleCheck", "discoveredCheck", "fork", "skewer", "discoveredAttack", "promotion"];
  try { const t = analyzeMove(g.before, g.mv, g.after).find((x) => ok.includes(x.kind)); return t ? { ...t, san } : null; } catch { return null; }
}

// (v0.7.3, 사용자 요청) 체크메이트 분석 — 이 수가 어떤 종류의 체크메이트인지와, 시각화에 쓸 칸 정보를 돌려준다.
//   type: "smothered"(질식) · "double"(더블 체크) · "backRank"(백랭크) · "ladder"(사다리) · "generic"
//   squares: { king, checkers, zone } — zone은 킹 칸 + 주변 8칸(판 안쪽만) 각각의 { sq, occ, attackers }.
//     occ: null(빈 칸) | "own"(막힌 쪽 자기 기물이 차지) | "foe"(메이트 건 쪽 기물이 차지).
//     attackers: 그 칸을 공격·보호하는 메이트 건 쪽 기물의 칸들. 킹을 가린 채 계산하면 킹 뒤쪽 칸도 슬라이더가 겨누는 것으로 잡힌다(도망 불가의 이유).
export function checkmateInfo(fenBefore, san) {
  const g = play(fenBefore, san); if (!g || !g.after.isCheckmate()) return null;
  try {
    const { after, mv } = g; const color = mv.color, opp = color === "w" ? "b" : "w";
    const king = kingSq(after, opp); if (!king) return null;
    const checkers = after.attackers(king, color);
    const noKing = new Chess(after.fen()); noKing.remove(king);
    const kf = FILES.indexOf(king[0]), kr = parseInt(king[1], 10);
    const zone = [];
    // 킹 칸 → 위 → 오른쪽 위 … 시계 방향으로 주변 칸
    const order = [[0, 0], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
    for (const [df, dr] of order) {
      const f = kf + df, r = kr + dr; if (f < 0 || f > 7 || r < 1 || r > 8) continue;
      const sq = FILES[f] + r, p = after.get(sq);
      const occ = df === 0 && dr === 0 ? null : !p ? null : p.color === opp ? "own" : "foe";
      const attackers = df === 0 && dr === 0 ? checkers : noKing.attackers(sq, color);
      zone.push({ sq, occ, attackers });
    }
    const neighbors = zone.slice(1);
    let type = "generic";
    const one = checkers.length === 1 ? after.get(checkers[0]) : null;
    if (checkers.length >= 2) type = "double";
    else if (one && one.type === "n" && neighbors.every((z) => z.occ === "own")) type = "smothered";
    else {
      const backRank = king[1] === (opp === "w" ? "1" : "8");
      const fRow = (opp === "w" ? 2 : 7);
      const front = neighbors.filter((z) => parseInt(z.sq[1], 10) === fRow);
      if (backRank && one && (one.type === "r" || one.type === "q") && checkers[0][1] === king[1] && front.length && front.every((z) => z.occ === "own")) type = "backRank";
      else if (one && (one.type === "r" || one.type === "q")) {
        // 사다리: 킹이 가장자리에 있고, 체크한 룩·퀸 말고 메이트 쪽의 룩·퀸이 이웃한 선에서 도망 칸을 막는다
        const onEdgeRank = king[1] === "1" || king[1] === "8", onEdgeFile = king[0] === "a" || king[0] === "h";
        const heavy = boardList(after).filter((p) => p.color === color && (p.type === "r" || p.type === "q") && p.sq !== checkers[0]);
        const adjLine = (p) => (onEdgeRank && Math.abs(parseInt(p.sq[1], 10) - kr) === 1) || (onEdgeFile && Math.abs(FILES.indexOf(p.sq[0]) - kf) === 1);
        if ((onEdgeRank || onEdgeFile) && heavy.some(adjLine)) type = "ladder";
      }
    }
    return { kind: "checkmate", mate: type, piece: one ? one.type : mv.piece, squares: { king, checkers, zone } };
  } catch { return null; }
}
