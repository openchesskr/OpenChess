// (v0.7.9, 사용자 요청) 레슨 문제의 "대칭 변형" — 같은 전술·메이트를 좌우 반전(m)·색 바꿈(s)·둘 다(ms)한 새 포지션으로 만든다.
//  · 체스 규칙상 좌우 반전·색 바꿈은 수의 합법성과 전술(포크·핀·메이트 모양)을 그대로 보존한다. 좌우 반전은 캐슬링 권리를 지운다
//    (킹·룩 자리가 바뀌므로) — 그래서 캐슬링이 목표이거나 캐슬링 권리가 필요한 문제는 좌우 반전하지 않는다.
//  · 쓰는 곳: curriculum.js withReview(복습 문제가 같은 포지션을 되풀이하지 않게), scripts/build-lesson-puzzles.mjs(추가 학습 퍼즐 은행).
//  · 변형은 chess.js로 처음부터 끝까지 다시 두어(목표 수·응수 모두 합법, 목표 충족) 확인한 것만 돌려준다.
import { Chess } from "chess.js";

const FILES = "abcdefgh";
/** 칸 이름 변환. tf: "m"(좌우) · "s"(위아래+색) · "ms" */
export function mapSquare(sq, tf) {
  if (!sq || sq === "-") return sq;
  let f = FILES.indexOf(sq[0]), r = +sq[1];
  if (tf.includes("m")) f = 7 - f;
  if (tf.includes("s")) r = 9 - r;
  return FILES[f] + r;
}
export const mapUci = (u, tf) => (u ? mapSquare(u.slice(0, 2), tf) + mapSquare(u.slice(2, 4), tf) + u.slice(4) : u);

/** FEN 변환. 좌우 반전이 들어가면 캐슬링 권리를 지운다. */
export function mapFen(fen, tf) {
  const [place, side, castle = "-", ep = "-", half = "0", full = "1"] = String(fen).split(" ");
  let rows = place.split("/").map((row) => {
    const cells = [];
    for (const ch of row) { if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) cells.push(null); else cells.push(ch); }
    return cells;
  });
  if (tf.includes("m")) rows = rows.map((r) => r.slice().reverse());
  if (tf.includes("s")) rows = rows.slice().reverse().map((r) => r.map((c) => (c ? (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()) : c)));
  const pack = rows.map((r) => { let s = "", n = 0; for (const c of r) { if (!c) n++; else { if (n) { s += n; n = 0; } s += c; } } return s + (n ? n : ""); }).join("/");
  const nSide = tf.includes("s") ? (side === "w" ? "b" : "w") : side;
  let nCastle = castle;
  if (tf.includes("m")) nCastle = "-";
  else if (tf.includes("s") && castle !== "-") { const sw = castle.split("").map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())); nCastle = "KQkq".split("").filter((c) => sw.includes(c)).join(""); }
  return [pack, nSide, nCastle || "-", mapSquare(ep, tf), half, full].join(" ");
}

const goalOk = (goal, mv, c) => {
  if (!goal) return true;
  if (goal.uci) return goal.uci.some((u) => u === mv.from + mv.to + (mv.promotion || "") || (u.length === 4 && (mv.from + mv.to) === u && !mv.promotion));
  if (goal.mate) return c.isCheckmate();
  if (goal.check) return c.inCheck();
  if (goal.castle) return mv.flags.includes(goal.castle === "q" ? "q" : "k");
  if (goal.promote) return mv.promotion === goal.promote;
  if (goal.safe) return !c.moves({ verbose: true }).some((m) => { const d = new Chess(c.fen()); d.move(m); return d.isCheckmate(); });
  return false;
};
/** 목표를 만족하는 수(UCI) 하나 — uci 목표는 그 수, 나머지는 합법수 중 처음 맞는 것. 없으면 null. */
export function solveGoal(fen, goal) {
  let c; try { c = new Chess(fen); } catch { return null; }
  const list = goal && goal.uci ? goal.uci.map((u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || (goal.promote || undefined) })) : c.moves({ verbose: true });
  for (const m of list) {
    const d = new Chess(fen); let mv; try { mv = d.move(m.from ? { from: m.from, to: m.to, promotion: m.promotion || "q" } : m); } catch { mv = null; }
    if (mv && goalOk(goal, mv, d)) return mv.from + mv.to + (mv.promotion || "");
  }
  return null;
}
/** 목표를 만족하는 모든 수(SAN) — 추가 학습 퍼즐의 "다른 정답" 목록. */
export function goalAnswers(fen, goal) {
  let c; try { c = new Chess(fen); } catch { return []; }
  const out = [];
  for (const m of c.moves({ verbose: true })) { const d = new Chess(fen); const mv = d.move(m); if (mv && goalOk(goal, mv, d)) out.push(mv.san); }
  return out;
}

/** move 스텝 하나를 tf로 변환해 끝까지 둘 수 있으면 새 스텝, 아니면 null. */
export function variantMoveStep(step, tf) {
  if (!step || step.kind !== "move" || !step.fen) return null;
  if (tf.includes("m") && (step.line || []).some((g) => g.goal && g.goal.castle)) return null;
  const fen = mapFen(step.fen, tf);
  const line = (step.line || []).map((g) => ({ ...g, goal: g.goal && g.goal.uci ? { ...g.goal, uci: g.goal.uci.map((u) => mapUci(u, tf)) } : g.goal, reply: g.reply ? mapUci(g.reply, tf) : g.reply }));
  // 끝까지 두어 확인
  let c; try { c = new Chess(fen); } catch { return null; }
  for (const g of line) {
    const u = solveGoal(c.fen(), g.goal); if (!u) return null;
    try { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { return null; }
    if (g.reply) { try { if (!c.move({ from: g.reply.slice(0, 2), to: g.reply.slice(2, 4), promotion: g.reply[4] })) return null; } catch { return null; } }
  }
  return { ...step, fen, line, hint: step.hint ? mapUci(step.hint, tf) : step.hint, variant: tf };
}
export const VARIANT_ORDER = ["ms", "s", "m"];
/** 스텝의 변형 목록(가능한 것만, VARIANT_ORDER 순). */
export function variantsOf(step) { return VARIANT_ORDER.map((tf) => variantMoveStep(step, tf)).filter(Boolean); }
