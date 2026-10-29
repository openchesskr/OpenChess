// (v0.7.1 기능, 사용자 요청) 채팅 퀴즈 — 보낸 사람이 PGN·FEN으로 정한 포지션에서 "최선의 수"를 오지선다로 맞히는 카드.
// 화면과 분리된 순수 계산만 여기 둔다(scripts/check-chat-quiz-roulette.mjs가 검사):
//   · parseQuizInput — 붙여넣은 PGN/FEN을 읽어 퀴즈 포지션(FEN)으로. 불법 수순·이미 끝난 포지션은 거른다.
//   · buildQuizOptions — 엔진 MultiPV 결과에서 정답(1순위)과 오답 후보를 골라 선택지를 만든다. 정답과 평가 차이가 거의 없는 수는 오답으로 쓰지 않는다.
//   · quizEvalText / normalizeQuiz — 평가치 표기(백 기준), 받은 payload 검증(신뢰할 수 없는 JSON이라 모양을 다시 확인).
import { parseFenFull, looksLikeFen, fenOfRoot, gameEndState } from "./chessRules.js";
import { parsePgnSans, sanSequenceValid, pgnHeaderTag } from "./pgn.js";

export const QUIZ_MAX_OPTIONS = 5;      // 오지선다
export const QUIZ_MIN_OPTIONS = 3;      // 이보다 둘 수 있는 수가 적으면 퀴즈를 만들지 않는다
export const QUIZ_CLEAR_GAP_CP = 40;    // 오답으로 쓰려면 정답보다 이만큼(센티폰) 이상 나빠야 "정답이 하나"라고 할 수 있다
const MATE_BASE = 100000;
const SAN_RE = /^[A-Za-z0-9=+#\-]{2,10}$/;

// 엔진 점수(둘 차례 기준 cp 또는 mate)를 크기 비교가 되는 숫자로 — 메이트는 빠를수록 크고, 당하는 쪽은 빠를수록 작다.
export function scoreForMover(line) {
  if (line.mate != null) return line.mate > 0 ? MATE_BASE - line.mate : -MATE_BASE - line.mate;
  return line.cp;
}
// 평가치 문구(백 기준): "+0.43", "-1.20", "#3", "-#2".
export function quizEvalText(ev) {
  if (!ev) return "";
  if (ev.mate != null) return ev.mate > 0 ? "#" + ev.mate : "-#" + Math.abs(ev.mate);
  if (ev.cp == null) return "";
  const v = ev.cp / 100;
  return (v > 0 ? "+" : "") + v.toFixed(2);
}
const spread = (list, n) => {
  if (list.length <= n) return list.slice();
  if (n <= 1) return list.slice(0, n);
  const out = [];
  for (let i = 0; i < n; i++) out.push(list[Math.round((i * (list.length - 1)) / (n - 1))]);
  return out;
};
const shuffle = (arr, rng) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// lines: [{ san, cp, mate }] — 엔진이 둘 차례 기준으로 돌려준 점수. turn: "w" | "b".
// 돌려주는 값: { ok:false, reason:"few" } | { ok:true, options:[{san, cp?, mate?}](백 기준 평가, 섞인 순서), best, ambiguous, gap }
export function buildQuizOptions(lines, turn, rng = Math.random) {
  const seen = new Set();
  const items = [];
  for (const l of lines || []) {
    if (!l || !l.san || seen.has(l.san) || (l.cp == null && l.mate == null)) continue;
    seen.add(l.san);
    items.push({ san: l.san, cp: l.cp, mate: l.mate, score: scoreForMover(l) });
  }
  if (items.length < QUIZ_MIN_OPTIONS) return { ok: false, reason: "few" };
  items.sort((a, b) => b.score - a.score);
  const best = items[0];
  const rest = items.slice(1);
  const clear = rest.filter((x) => best.score - x.score >= QUIZ_CLEAR_GAP_CP);
  const want = Math.min(QUIZ_MAX_OPTIONS - 1, rest.length);
  const picked = clear.length >= want ? spread(clear, want) : [...clear, ...rest.filter((x) => !clear.includes(x)).slice(0, want - clear.length)];
  const ambiguous = picked.some((x) => best.score - x.score < QUIZ_CLEAR_GAP_CP);
  const sign = turn === "w" ? 1 : -1;
  const toWhite = (x) => (x.mate != null ? { san: x.san, mate: x.mate * sign } : { san: x.san, cp: x.cp * sign });
  return { ok: true, options: shuffle([best, ...picked], rng).map(toWhite), best: best.san, ambiguous, gap: best.score - items[1].score };
}

// 받은 퀴즈 payload 검증 — 모양이 어긋나면 null(카드는 "읽을 수 없는 퀴즈"로 그린다).
export function normalizeQuiz(q) {
  if (!q || typeof q !== "object" || typeof q.fen !== "string" || q.fen.length > 100 || !parseFenFull(q.fen)) return null;
  if (!Array.isArray(q.opts) || q.opts.length < 2 || q.opts.length > QUIZ_MAX_OPTIONS) return null;
  const opts = [];
  for (const o of q.opts) {
    if (!o || typeof o.san !== "string" || !SAN_RE.test(o.san) || opts.some((x) => x.san === o.san)) return null;
    const ev = { san: o.san };
    if (Number.isInteger(o.mate) && o.mate !== 0 && Math.abs(o.mate) < 1000) ev.mate = o.mate;
    else if (Number.isFinite(o.cp)) ev.cp = Math.max(-99999, Math.min(99999, Math.round(o.cp)));
    opts.push(ev);
  }
  if (typeof q.best !== "string" || !opts.some((o) => o.san === q.best)) return null;
  return { fen: q.fen, opts, best: q.best };
}

// 붙여넣은 PGN·FEN → 퀴즈 포지션. 돌려주는 값: { ok:true, fen, turn, root, sans } | { ok:false, error:"empty"|"fen"|"pgn"|"illegal"|"over" }
export function parseQuizInput(text) {
  const src = (text || "").trim();
  if (!src) return { ok: false, error: "empty" };
  let root = null;
  let sans = [];
  const headerFen = pgnHeaderTag(src, "FEN");
  if (headerFen) {
    root = parseFenFull(headerFen);
    if (!root) return { ok: false, error: "fen" };
    sans = parsePgnSans(src);
  } else if (looksLikeFen(src)) {
    root = parseFenFull(src.split("\n")[0]);
    if (!root) return { ok: false, error: "fen" };
  } else {
    sans = parsePgnSans(src);
    if (!sans.length) return { ok: false, error: "pgn" };
  }
  let valid = false;
  try { valid = sanSequenceValid(sans, root); } catch { valid = false; }
  if (!valid) return { ok: false, error: "illegal" };
  let end = null;
  try { end = gameEndState(sans, root); } catch { return { ok: false, error: "illegal" }; }
  if (end && (end.end === "checkmate" || end.end === "stalemate")) return { ok: false, error: "over" };
  const fen = fenOfRoot(root, sans);
  const at = parseFenFull(fen);
  if (!at) return { ok: false, error: "illegal" };
  return { ok: true, fen, turn: at.turn, root: at, sans };
}
