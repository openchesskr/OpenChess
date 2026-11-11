// (v0.7.5) 레슨 규칙 판정 — 순수 함수(chess.js). 화면(LessonPlayer)과 검사 스크립트(check-lessons)가 같은 판정을 쓴다.
//  스텝 종류
//   read   { fen?, say, marks?:[칸], marksFrom?:칸(그 기물이 갈 수 있는 칸 강조), arrows?:[[from,to]] }
//   tap    { fen, say, tap?:[칸] | tapFrom:칸(그 기물이 갈 수 있는 칸 전부) } — 정답 칸을 모두 누르면 통과
//   move   { fen, say, line:[{ goal, reply?:uci, say? }], hint?:uci } — goal을 만족하는 수를 두면 reply(상대 응수)를 두고 다음 goal로
//   choice { fen?, say, options:[문구], answer:번호 }
//  goal: { uci:[...] } | { mate:true } | { check:true } | { castle:"k"|"q" } | { promote:"q" } | { safe:true }(둔 뒤 상대에게 한 수 메이트가 없음)
import { Chess } from "chess.js";

const FILES = "abcdefgh";
export const sqToRc = (sq) => [8 - parseInt(sq[1], 10), FILES.indexOf(sq[0])];
export const rcToSq = (r, c) => FILES[c] + (8 - r);

export function chessOf(fen) { return new Chess(fen); }
/** 화면 보드 형식(8×8, { t:"K", c:"w" } | null). */
export function boardOf(fen) {
  return new Chess(fen).board().map((row) => row.map((p) => (p ? { t: p.type.toUpperCase(), c: p.color } : null)));
}
export const turnOf = (fen) => (String(fen).split(" ")[1] === "b" ? "b" : "w");
/** 그 칸의 기물이 둘 수 있는 도착 칸(합법 수). 차례가 아닌 쪽의 기물이면 빈 배열. */
export function legalTargets(fen, from) {
  try { return [...new Set(new Chess(fen).moves({ square: from, verbose: true }).map((m) => m.to))]; } catch { return []; }
}
/** from→to 수를 둔다(승격은 기본 퀸). 합법이 아니면 null. */
export function playMove(fen, from, to, promotion) {
  try {
    const c = new Chess(fen);
    const needsPromo = c.moves({ square: from, verbose: true }).some((m) => m.to === to && m.promotion);
    const mv = c.move({ from, to, promotion: needsPromo ? promotion || "q" : undefined });
    if (!mv) return null;
    return { mv, fen: c.fen(), uci: mv.from + mv.to + (mv.promotion || ""), san: mv.san, chess: c };
  } catch { return null; }
}
export function playUci(fen, uci) { return playMove(fen, uci.slice(0, 2), uci.slice(2, 4), uci[4]); }

function hasMateInOne(fen) {
  const c = new Chess(fen);
  for (const m of c.moves({ verbose: true })) { const d = new Chess(fen); d.move(m); if (d.isCheckmate()) return true; }
  return false;
}
/** 둔 수(played = playMove 결과)가 goal을 만족하는지. */
export function goalMet(goal, played) {
  if (!goal || !played) return false;
  const { mv, chess } = played;
  if (goal.uci) return goal.uci.some((u) => u === played.uci || (u.length === 4 && played.uci.slice(0, 4) === u && !mv.promotion));
  if (goal.mate) return chess.isCheckmate();
  if (goal.check) return chess.inCheck();
  if (goal.castle) return mv.flags.includes(goal.castle === "q" ? "q" : "k");
  if (goal.promote) return mv.promotion === goal.promote;
  if (goal.safe) return !hasMateInOne(played.fen);
  return false;
}
/** tap 스텝의 정답 칸 집합. */
export function tapAnswer(step) {
  if (step.tap) return new Set(step.tap);
  if (step.tapFrom) return new Set(legalTargets(step.fen, step.tapFrom));
  return new Set();
}
/** read 스텝의 강조 칸. */
export function readMarks(step) {
  if (step.marks) return step.marks;
  if (step.marksFrom && step.fen) return legalTargets(step.fen, step.marksFrom);
  return [];
}
