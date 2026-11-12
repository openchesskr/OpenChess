// (v0.7.5, 사용자 요청) 기보 용지(chess.com 기보 용지 PDF 같은 손글씨 스코어시트) 인식 결과를 체스 규칙으로 바로잡는다.
//  비전 모델은 손글씨를 칸 단위로 옮겨 적을 뿐이라 b↔6, l↔1, 0-0↔O-O, 대소문자, 체크 표시 누락, e2-e4 같은 긴 표기 등이 섞인다.
//  매 수마다 그 포지션의 합법 수와 대조해, 정확히 맞으면 그대로, 아니면 흔한 판독 혼동을 싸게 치는 편집 거리로
//  가장 가까운 합법 수 하나가 뚜렷할 때만 고친다. 고칠 수 없는 수를 만나면 거기서 멈추고 그때까지의 수순을 돌려준다(지어내지 않는다).
//  순수 함수 — api/scan-board.js와 scripts/check-scoresheet.mjs가 쓴다.
import { Chess } from "chess.js";

// 손글씨·인쇄 판독에서 자주 헷갈리는 글자 쌍(치환 비용을 낮춘다)
const CONFUSE = [["b", "6"], ["l", "1"], ["i", "1"], ["g", "9"], ["s", "5"], ["o", "0"], ["z", "2"], ["B", "8"], ["a", "d"], ["c", "e"], ["h", "b"], ["f", "t"], ["N", "H"], ["5", "6"], ["3", "8"], ["1", "7"], ["4", "9"]];
const CONF = new Set(CONFUSE.flatMap(([a, b]) => [a + b, b + a, a.toLowerCase() + b.toLowerCase(), b.toLowerCase() + a.toLowerCase()]));
const subCost = (a, b) => (a === b ? 0 : a.toLowerCase() === b.toLowerCase() ? 0.3 : CONF.has(a + b) ? 0.45 : 1);
function dist(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + subCost(a[i - 1], b[j - 1]));
  return d[m][n];
}
const strip = (san) => san.replace(/[+#!?]/g, "");
/** 판독된 칸 하나를 SAN에 가깝게 정리한다(판단은 하지 않고 표기만). */
export function normalizeToken(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  s = s.replace(/[!?]+$/g, "").replace(/\s+/g, "").replace(/e\.?p\.?$/i, "").replace(/[‐–—−]/g, "-").replace(/[×:]/g, "x");
  if (/^[0oO]-?[0oO]-?[0oO][+#]?$/.test(s)) return "O-O-O";
  if (/^[0oO]-?[0oO][+#]?$/.test(s)) return "O-O";
  s = s.replace(/[+#]+$/, "");
  // 기물 글자가 소문자로 적혔고 뒤에 칸이 오면 대문자로(단 b는 폰 b파일 잡기일 수 있어 그대로 둔다)
  if (/^[nrqk][a-h]?[1-8]?x?[a-h][1-8]$/.test(s)) s = s[0].toUpperCase() + s.slice(1);
  s = s.replace(/=?([qrbnQRBN])$/, (m, p, off) => (/[a-h][18]$/.test(s.slice(0, off)) ? "=" + p.toUpperCase() : m));
  return s;
}
/** 한 수 고르기: { san, how: "exact"|"long"|"fuzzy" } 또는 null. */
export function matchMove(chess, raw) {
  const tok = normalizeToken(raw);
  if (!tok) return null;
  const legal = chess.moves({ verbose: true });
  const exact = legal.find((m) => strip(m.san) === tok);
  if (exact) return { san: exact.san, how: "exact" };
  // 잡기 표시(x) 누락·추가
  const noX = legal.filter((m) => strip(m.san).replace("x", "") === tok.replace("x", ""));
  if (noX.length === 1) return { san: noX[0].san, how: "exact" };
  // 긴 표기: Ng1-f3, e2-e4, e2e4, e7e8Q
  const lm = /^([KQRBN]?)([a-h][1-8])[-x]?([a-h][1-8])=?([QRBN])?$/.exec(tok);
  if (lm) {
    const hit = legal.filter((m) => m.from === lm[2] && m.to === lm[3] && (!lm[4] || (m.promotion || "").toUpperCase() === lm[4]));
    if (hit.length >= 1) return { san: (hit.find((m) => (m.promotion || "q") === "q") || hit[0]).san, how: "long" };
  }
  // 가장 가까운 합법 수 — 뚜렷하게 하나일 때만
  const scored = legal.map((m) => ({ m, d: dist(tok, strip(m.san)) })).sort((a, b) => a.d - b.d);
  if (!scored.length) return null;
  const best = scored[0], second = scored[1];
  const limit = tok.length <= 2 ? 0.5 : tok.length <= 4 ? 1 : 1.5;
  if (best.d <= limit && (!second || second.d - best.d >= 0.5)) return { san: best.m.san, how: "fuzzy" };
  return null;
}
/**
 * rows: [{ no, white, black }] (수 번호 순서가 아니어도 된다). 반환:
 *  { sans, fixed: [{ ply, raw, san }], stoppedAt: null | { ply, raw }, total }
 *  total은 기보 용지에 적힌 반수(빈 칸 제외) 수, sans는 앞에서부터 합법으로 이어진 수순.
 */
export function repairScoresheet(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && (r.white || r.black)).map((r, i) => ({ no: Number.isFinite(+r.no) && +r.no > 0 ? +r.no : i + 1, white: r.white, black: r.black }));
  list.sort((a, b) => a.no - b.no);
  const toks = [];
  for (const r of list) { toks.push(r.white || ""); toks.push(r.black || ""); }
  while (toks.length && !String(toks[toks.length - 1]).trim()) toks.pop();
  const chess = new Chess(), sans = [], fixed = [];
  let stoppedAt = null;
  for (let i = 0; i < toks.length; i++) {
    const raw = String(toks[i] || "").trim();
    if (!raw) { stoppedAt = { ply: i, raw: "" }; break; }
    if (/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(raw)) break;
    const m = matchMove(chess, raw);
    if (!m) { stoppedAt = { ply: i, raw }; break; }
    chess.move(m.san);
    sans.push(m.san);
    if (m.how !== "exact") fixed.push({ ply: i, raw, san: m.san });
  }
  return { sans, fixed, stoppedAt, total: toks.filter((x) => String(x || "").trim()).length };
}
/** 수순 + 머리 정보 → PGN 문자열. */
export function scoresheetPgn(sans, head = {}) {
  const q = (v) => String(v || "?").replace(/["\\\]]/g, "").slice(0, 80) || "?";
  const result = /^(1-0|0-1|1\/2-1\/2)$/.test(String(head.result || "").replace("½-½", "1/2-1/2")) ? String(head.result).replace("½-½", "1/2-1/2") : "*";
  const tags = [["Event", head.event], ["Date", head.date], ["White", head.white], ["Black", head.black], ["Result", result]].map(([k, v]) => "[" + k + " \"" + (k === "Result" ? v : q(v)) + "\"]");
  const body = sans.map((s, i) => (i % 2 === 0 ? (i / 2 + 1) + ". " : "") + s).join(" ");
  return tags.join("\n") + "\n\n" + (body ? body + " " : "") + result;
}
