// (v0.6.4) 내 약점 지도 · 실수 복습 카드(간격 반복)의 순수 로직. 화면(app/growth.jsx)과 검사(scripts/check-growth.mjs)가 함께 쓴다.
//  · 리뷰 결과(result.moves)에서 내 쪽 실수·블런더·놓친 수를 뽑아 (수 두기 전 FEN, 내가 둔 수, 엔진 최선수)와 함께 저장한다.
//  · 각 실수를 포지션만 보고(엔진 없이) "무엇을 놓쳤는가"로 분류한다 — 메이트 허용·기물 방치·기물 획득 놓침 등. 단계(오프닝/중반/엔드게임)도 함께.
//  · 같은 실수를 라이트너 간격(오늘·1·3·7·14·30일)으로 다시 풀게 한다. 맞히면 다음 칸, 틀리면 처음 칸.
import { Chess } from "chess.js";
import { t } from "./i18n.js";

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const MISTAKE_KINDS = ["mistake", "blunder", "miss"];
export const PHASES = ["opening", "middle", "end"];
export const THEMES = ["allowedMate", "hung", "missedMate", "missedWin", "missedCheck", "opening", "endgame", "positional"];
export const phaseLabel = (k) => ({ opening: t("오프닝"), middle: t("중반전"), end: t("엔드게임") }[k] || k);
export const themeLabel = (k) => ({
  allowedMate: t("메이트 허용"), hung: t("기물 방치"), missedMate: t("메이트 놓침"), missedWin: t("기물 획득 놓침"),
  missedCheck: t("체크 전술 놓침"), opening: t("오프닝 원칙"), endgame: t("엔드게임 기술"), positional: t("포지션 판단"),
}[k] || k);
export const themeAdvice = (k) => ({
  allowedMate: t("수를 두기 전에 상대의 체크·메이트 위협부터 확인하기"),
  hung: t("수를 두기 전에 내 기물이 공격받고 지켜지는지 확인하기"),
  missedMate: t("상대 킹 주변의 체크를 모두 세어 보기"),
  missedWin: t("상대 기물이 방치되어 있는지 매 수 확인하기"),
  missedCheck: t("체크로 시작하는 전술을 먼저 찾아보기"),
  opening: t("중앙 차지·기물 전개·캐슬링 원칙 되짚기"),
  endgame: t("킹 활용과 폰 전진 기본기 연습하기"),
  positional: t("기물 활동성과 폰 구조를 비교해 계획 세우기"),
}[k] || "");

const DAY = 86400000;
export const SRS_DAYS = [0, 1, 3, 7, 14, 30];
export const MAX_MISTAKES = 400;
const stripSan = (s) => String(s || "").replace(/[+#!?]+$/g, "");
const phaseOf = (ply, game) => {
  if (ply < 16) return "opening";
  let sum = 0; for (const row of game.board()) for (const p of row) if (p && p.type !== "k" && p.type !== "p") sum += VAL[p.type];
  return sum <= 26 ? "end" : "middle";
};

/* 수 두기 전 포지션(FEN)·내가 둔 수(SAN)·최선수(SAN)로 실수를 분류한다. 불법·해석 불가면 "positional". */
export function classifyMistake(fen, san, best, phase) {
  try {
    const g = new Chess(fen);
    const b = new Chess(fen); const bm = b.move(stripSan(best));
    const um = g.move(stripSan(san));
    // 내 수 뒤 상대가 한 수에 메이트할 수 있나
    const replies = g.moves({ verbose: true });
    for (const o of replies) { const t2 = new Chess(g.fen()); t2.move(o.san); if (t2.isCheckmate()) return "allowedMate"; }
    // 내 수 뒤 상대가 값어치 큰 기물을 그냥(또는 이득으로) 가져갈 수 있나
    for (const o of replies) {
      if (!o.captured) continue;
      if (VAL[o.captured] < 3) continue;
      const t2 = new Chess(g.fen()); t2.move(o.san);
      const recapture = t2.moves({ verbose: true }).some((m) => m.to === o.to && m.captured);
      const net = recapture ? VAL[o.captured] - VAL[o.piece] : VAL[o.captured];
      if (net >= 2 || !recapture) return "hung";
    }
    if (bm && /#$/.test(bm.san)) return "missedMate";
    if (bm && bm.captured && !um.captured && VAL[bm.captured] >= 3) return "missedWin";
    if (bm && /\+$/.test(bm.san) && !/[+#]$/.test(um.san)) return "missedCheck";
    if (bm && bm.captured && !um.captured && VAL[bm.captured] >= 1 && phase !== "opening") return "missedWin";
  } catch { /* 아래 폴백 */ }
  return phase === "opening" ? "opening" : phase === "end" ? "endgame" : "positional";
}

/* 리뷰 결과에서 내(color: "w"|"b") 실수를 뽑는다. 최선수(best)가 없는 수는 복습 카드가 될 수 없어 뺀다. 표준 시작 위치 대국만 다룬다. */
export function extractMistakes(result, { color, gameKey, now = Date.now(), fenRoot = null }) {
  if (!result || !result.moves || !color || !gameKey || fenRoot) return [];
  const out = [], g = new Chess();
  for (let i = 0; i < result.moves.length; i++) {
    const m = result.moves[i], fenBefore = g.fen(), mine = (m.white ? "w" : "b") === color;
    if (mine && MISTAKE_KINDS.includes(m.kind) && m.best && m.san) {
      let to = null, piece = null;
      try { const c2 = new Chess(fenBefore); const mv = c2.move(stripSan(m.san)); to = mv.to; piece = mv.piece; } catch { /* 해석 불가 — 건너뜀 */ }
      if (to) {
        const phase = phaseOf(i, g);
        out.push({ id: gameKey + "#" + i, ply: i, fen: fenBefore, san: m.san, best: m.best, kind: m.kind, loss: Math.round((m.lossWinPct || 0) * 10) / 10, phase, theme: classifyMistake(fenBefore, m.san, m.best, phase), piece, to, color, ts: now, box: 0, due: now, reps: 0, lapses: 0 });
      }
    }
    try { g.move(stripSan(m.san)); } catch { break; }
  }
  return out;
}

/* 기존 목록에 새 실수를 합친다(id 중복 제외, 오래된 것부터 잘라 MAX_MISTAKES 유지). */
export function mergeMistakes(list, add) {
  const seen = new Set(list.map((m) => m.id)), merged = list.concat(add.filter((m) => !seen.has(m.id)));
  return merged.length > MAX_MISTAKES ? merged.slice(merged.length - MAX_MISTAKES) : merged;
}

const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
/* 약점 지도: 단계별·유형별·기물별 집계와 단계×유형 표, 도착 칸 열지도. */
export function weaknessReport(list) {
  const total = list.length;
  const group = (keyOf, keys) => keys.map((k) => { const ms = list.filter((m) => keyOf(m) === k); return { key: k, n: ms.length, share: total ? ms.length / total : 0, avgLoss: avg(ms.map((m) => m.loss)) }; });
  const byPhase = group((m) => m.phase, PHASES);
  const byTheme = group((m) => m.theme, THEMES).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || b.avgLoss - a.avgLoss);
  const byPiece = group((m) => m.piece, ["p", "n", "b", "r", "q", "k"]);
  const matrix = PHASES.map((p) => THEMES.map((th) => list.filter((m) => m.phase === p && m.theme === th).length));
  const heat = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (const m of list) { const f = "abcdefgh".indexOf(m.to[0]), r = 8 - parseInt(m.to[1], 10); if (f >= 0 && r >= 0 && r < 8) heat[r][f]++; }
  const weakPhase = byPhase.filter((x) => x.n > 0).sort((a, b) => b.n - a.n)[0] || null;
  return { total, byPhase, byTheme, byPiece, matrix, heat, heatMax: Math.max(0, ...heat.flat()), weakPhase, topThemes: byTheme.slice(0, 3) };
}

/* ── 간격 반복(라이트너) ── */
export function dueCards(list, now = Date.now(), limit = 10) {
  return list.filter((m) => (m.due || 0) <= now).sort((a, b) => (a.due || 0) - (b.due || 0) || b.loss - a.loss).slice(0, limit);
}
export function gradeCard(card, correct, now = Date.now()) {
  if (correct) { const box = Math.min((card.box || 0) + 1, SRS_DAYS.length - 1); return { ...card, box, due: now + SRS_DAYS[box] * DAY, reps: (card.reps || 0) + 1, last: now }; }
  return { ...card, box: 0, due: now + 5 * 60000, lapses: (card.lapses || 0) + 1, reps: (card.reps || 0) + 1, last: now };
}
export function srsStats(list, now = Date.now()) {
  const due = list.filter((m) => (m.due || 0) <= now).length, mastered = list.filter((m) => (m.box || 0) >= 4).length;
  return { total: list.length, due, mastered, learning: list.length - mastered };
}
/* 정답 판정: 최선수와 같은 수(체크·평가 기호는 무시). */
export const isCardAnswer = (card, san) => stripSan(san) === stripSan(card.best);
