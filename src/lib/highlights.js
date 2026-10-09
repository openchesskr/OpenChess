// (v0.6.4) 대국 하이라이트 — 리뷰 결과에서 가장 극적인 수 최대 3개를 고른다(블런더·놓친 메이트·탁월한 수·결정타).
// 점수는 수 등급 + 그 수가 승률을 얼마나 움직였는지. 서로 4수(ply) 이상 떨어진 것만 고르고, 화면에는 시간순으로 보여 준다.
import { Chess } from "chess.js";
import { t } from "./i18n.js";

const strip = (s) => String(s || "").replace(/[+#!?]+$/g, "");
export const HIGHLIGHT_MIN_SCORE = 12, HIGHLIGHT_MIN_GAP = 4;

export function momentScore(m, swing) {
  if (!m) return 0;
  if (/#$/.test(m.san || "")) return 45;                 // 메이트로 끝낸 결정타
  if (m.kind === "brilliant") return 50 + swing / 4;
  if (m.kind === "great") return 30 + swing / 4;
  if (["blunder", "miss", "mistake"].includes(m.kind)) return (m.lossWinPct || 0) + (m.kind === "blunder" ? 6 : 0);
  return swing / 2;
}
export const momentLabel = (m) => (/#$/.test(m.san || "") ? t("결정타") : ({ brilliant: t("탁월한 수"), great: t("유일한 수"), blunder: t("블런더"), mistake: t("실수"), miss: t("놓친 수") }[m.kind] || t("승부처")));

/* result: analyzeGame 결과({moves, evalWin}). 반환: 시간순 [{ply, san, kind, white, score, swing, label, fen, from, to, moveNo, best, winBefore, winAfter}] */
export function pickHighlights(result, max = 3) {
  const moves = (result && result.moves) || [];
  if (moves.length < 4) return [];
  const ew = result.evalWin || [];
  const cands = [];
  for (let i = 0; i < moves.length; i++) {
    const a = ew[i], b = ew[i + 1];
    const swing = typeof a === "number" && typeof b === "number" ? Math.abs(b - a) : (moves[i].lossWinPct || 0);
    const score = momentScore(moves[i], swing);
    if (score >= HIGHLIGHT_MIN_SCORE) cands.push({ ply: i, score, swing });
  }
  cands.sort((x, y) => y.score - x.score);
  const chosen = [];
  for (const c of cands) { if (chosen.length >= max) break; if (chosen.every((o) => Math.abs(o.ply - c.ply) >= HIGHLIGHT_MIN_GAP)) chosen.push(c); }
  chosen.sort((x, y) => x.ply - y.ply);
  // 포지션·이동 칸은 chess.js로 한 번만 재생해 채운다.
  const g = new Chess(), out = [], want = new Map(chosen.map((c) => [c.ply, c]));
  for (let i = 0; i < moves.length && out.length < chosen.length; i++) {
    const fen = g.fen(); let mv = null;
    try { mv = g.move(strip(moves[i].san)); } catch { break; }
    const c = want.get(i);
    if (c && mv) out.push({ ply: i, san: moves[i].san, kind: moves[i].kind, white: !!moves[i].white, score: Math.round(c.score), swing: Math.round(c.swing), label: momentLabel(moves[i]), fen, from: mv.from, to: mv.to, moveNo: Math.floor(i / 2) + 1, best: moves[i].best || null, winBefore: ew[i] ?? null, winAfter: ew[i + 1] ?? null });
  }
  return out;
}
