import { Chess } from "chess.js";

// MEC 전략·구조 탐지(D) — 전술이 없는 조용한 수를 설명한다.
//   루프트(킹 앞에 숨 쉴 칸) · 킹 앞 폰 이동으로 약해진 킹 주변 · 전초기지 · 7번째 줄 룩 · 폰이 비켜 열어 준 비숍·퀸·룩의 길
//   중앙 폰 점유·중앙 통제 · 새 통과폰 · 겹폰·고립폰 · 엔드게임 킹 활성화 · 미들게임 킹 전진 · 활동성 떨어진 나이트·비숍 · 측면 폰 전진
// 순수 함수 모듈이다(문장은 common.jsx의 MEC_PHRASES가 만든다). 판정은 모두 chess.js 포지션으로 계산하고, 칸 좌표(squares)를 함께 돌려준다.
const V = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const FILES = "abcdefgh";
const sqOf = (r, f) => FILES[f] + (8 - r);
const rankOf = (sq) => parseInt(sq[1], 10);
const rel = (sq, color) => (color === "w" ? rankOf(sq) : 9 - rankOf(sq)); // 내 쪽에서 센 랭크(1~8)
export const STRATEGY_ORDER = ["luft", "shield", "outpost", "seventh", "openLine", "centerPawn", "centerControl", "passedCreated", "doubled", "isolated", "kingActivation", "kingWalk", "passiveMinor", "wingSpace"];

function list(c) { const out = []; c.board().forEach((row, r) => row.forEach((p, f) => { if (p) out.push({ ...p, sq: sqOf(r, f), r, f }); })); return out; }
function kingOf(c, color) { return list(c).find((p) => p.type === "k" && p.color === color) || null; }
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]], ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// 슬라이더 S가 board c에서 갈 수 있는(막히기 전까지의) 칸 수 — 마지막 칸이 적 기물이면 그 칸도 센다
function sliderReach(c, S) {
  const b = c.board(); const dirs = S.type === "b" ? DIAG : S.type === "r" ? ORTHO : [...DIAG, ...ORTHO]; let n = 0;
  for (const [dr, df] of dirs) { let r = S.r + dr, f = S.f + df; while (r >= 0 && r < 8 && f >= 0 && f < 8) { const P = b[r][f]; if (P) { if (P.color !== S.color) n++; break; } n++; r += dr; f += df; } }
  return n;
}
function knightReach(c, N) {
  const b = c.board(); let n = 0;
  for (const [dr, df] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) { const r = N.r + dr, f = N.f + df; if (r < 0 || r > 7 || f < 0 || f > 7) continue; const P = b[r][f]; if (!P || P.color !== N.color) n++; }
  return n;
}
function pawnsOf(c, color) { return list(c).filter((p) => p.type === "p" && p.color === color); }
function isPassed(c, P) {
  const opp = P.color === "w" ? "b" : "w", dir = P.color === "w" ? -1 : 1; const b = c.board();
  for (let r = P.r + dir; r >= 0 && r < 8; r += dir) for (const df of [-1, 0, 1]) { const f = P.f + df; if (f < 0 || f > 7) continue; const E = b[r][f]; if (E && E.type === "p" && E.color === opp) return false; }
  return true;
}
function structure(c, color) { // 겹폰 수·고립폰 수
  const ps = pawnsOf(c, color); const perFile = new Array(8).fill(0); ps.forEach((p) => perFile[p.f]++);
  let doubled = 0, isolated = 0; perFile.forEach((n) => { if (n > 1) doubled += n - 1; });
  ps.forEach((p) => { if ((p.f === 0 || !perFile[p.f - 1]) && (p.f === 7 || !perFile[p.f + 1])) isolated++; });
  return { doubled, isolated };
}
const nonPawnMaterial = (c) => list(c).filter((p) => p.type !== "p" && p.type !== "k").reduce((a, p) => a + V[p.type], 0);
const centerDist = (sq) => Math.max(Math.abs(FILES.indexOf(sq[0]) - 3.5), Math.abs(rankOf(sq) - 4.5));
// 킹 앞(내 쪽 2번째 줄, 킹 파일 ±1)에서 비어 있고 상대가 노리지 않는 칸 수 — 루프트가 있으면 1 이상
function frontFree(c, kingSq, color) {
  const opp = color === "w" ? "b" : "w", rank = color === "w" ? 2 : 7, kf = FILES.indexOf(kingSq[0]); let n = 0;
  for (const df of [-1, 0, 1]) { const f = kf + df; if (f < 0 || f > 7) continue; const sq = FILES[f] + rank; if (!c.get(sq) && c.attackers(sq, opp).length === 0) n++; }
  return n;
}
const isEndgame = (c) => { const mat = nonPawnMaterial(c); const queens = list(c).some((p) => p.type === "q"); return mat <= 6 || (!queens && mat <= 20); };

/** fenBefore에서 san을 둔 수의 전략·구조 사실. kind는 "good"(엔진이 좋게 본 수)/"poor"(나쁘게 본 수)/"neutral". 없으면 null. */
export function strategicFact(fenBefore, san, tone = "neutral") {
  let before, after, mv;
  try { before = new Chess(fenBefore); after = new Chess(fenBefore); mv = after.move(san); } catch { return null; }
  if (!mv) return null;
  const color = mv.color, opp = color === "w" ? "b" : "w", M = mv.piece, to = mv.to, from = mv.from;
  const full = parseInt(fenBefore.split(" ")[5] || "1", 10);
  const oppHasHeavy = list(after).some((p) => p.color === opp && (p.type === "q" || p.type === "r"));
  const oppHasQueen = list(after).some((p) => p.color === opp && p.type === "q");
  const found = {};
  const kb = kingOf(before, color);
  // 킹 앞 폰 이동: 루프트(좋은 쪽) vs 킹 주변 약화
  if (M === "p" && !mv.captured && kb && rel(kb.sq, color) === 1 && "abcgh".includes(kb.sq[0]) && Math.abs(FILES.indexOf(from[0]) - kb.f) <= 1 && rel(from, color) === 2 && oppHasHeavy) {
    const f0 = frontFree(before, kb.sq, color), f1 = frontFree(after, kb.sq, color);
    if (f0 === 0 && f1 > 0 && FILES.indexOf(from[0]) !== kb.f) found.luft = { squares: { from, to, king: kb.sq } };
    else if (oppHasQueen) found.shield = { squares: { from, to, king: kb.sq } };
  }
  // 전초기지
  if ((M === "n" || M === "b") && rel(to, color) >= 5 && rel(to, color) <= 6) {
    const tf = FILES.indexOf(to[0]), tr = 8 - rankOf(to), dir = color === "w" ? 1 : -1; const b = after.board();
    const sup = [-1, 1].some((df) => { const f = tf + df, r = tr + dir; return f >= 0 && f < 8 && r >= 0 && r < 8 && b[r][f] && b[r][f].type === "p" && b[r][f].color === color; });
    let atk = false; for (const df of [-1, 1]) for (let r = tr - dir; r >= 0 && r < 8; r -= dir) { const f = tf + df; if (f < 0 || f > 7) continue; const E = b[r][f]; if (E && E.type === "p" && E.color === opp) atk = true; }
    if (M === "n" && sup && !atk) found.outpost = { piece: M, squares: { to } };
  }
  // 7번째 줄 룩·퀸
  if ((M === "r" || M === "q") && rel(to, color) === 7) {
    const sevenRank = list(after).filter((p) => p.color === opp && (p.type === "p" || p.type === "k") && rel(p.sq, color) === 7);
    if (M === "r" && sevenRank.length) found.seventh = { piece: M, squares: { to } };
  }
  // 폰이 비켜 열어 준 길
  if (M === "p" && !mv.captured) {
    let best = null;
    for (const S of list(after)) {
      if (S.color !== color || !"bqr".includes(S.type)) continue;
      const Sb = list(before).find((p) => p.sq === S.sq); if (!Sb) continue;
      const gain = sliderReach(after, S) - sliderReach(before, Sb);
      if (gain >= 3 && (!best || gain > best.gain)) best = { gain, type: S.type, sq: S.sq };
    }
    if (best) found.openLine = { piece: best.type, squares: { from, to, slider: best.sq } };
  }
  // 중앙 폰 점유·통제
  if (M === "p" && !mv.captured && full <= 15) {
    if ("de".includes(to[0]) && (rel(to, color) === 4 || rel(to, color) === 5)) found.centerPawn = { square: to, squares: { to } };
    else {
      const attacks = []; const tf = FILES.indexOf(to[0]), tr = 8 - rankOf(to), dir = color === "w" ? -1 : 1;
      for (const df of [-1, 1]) { const f = tf + df, r = tr + dir; if (f >= 0 && f < 8 && r >= 0 && r < 8) attacks.push(sqOf(r, f)); }
      const center = attacks.filter((a) => ["d4", "e4", "d5", "e5"].includes(a));
      if (center.length) found.centerControl = { square: center[0], squares: { to, target: center[0] } };
    }
  }
  // 새 통과폰
  { const pb = new Set(pawnsOf(before, color).filter((p) => isPassed(before, p)).map((p) => p.sq));
    const pa = pawnsOf(after, color).filter((p) => isPassed(after, p)).map((p) => p.sq);
    const fresh = pa.filter((s) => !(M === "p" && s === to ? pb.has(from) : pb.has(s)));
    if (fresh.length && !(M === "p" && fresh.length === 1 && fresh[0] === to && rel(to, color) >= 5)) found.passedCreated = { square: fresh[0], squares: { target: fresh[0] } }; }
  // 겹폰·고립폰
  { const sb = structure(before, color), sa = structure(after, color);
    if (sa.doubled > sb.doubled && mv.captured) found.doubled = { squares: { to } };
    else if (sa.isolated > sb.isolated) found.isolated = { squares: { to } }; }
  // 킹 활성화·전진
  if (M === "k" && !mv.flags.includes("k") && !mv.flags.includes("q")) {
    if (isEndgame(after) && centerDist(to) < centerDist(from)) found.kingActivation = { squares: { from, to } };
    else if (oppHasQueen && rel(from, color) === 1 && rel(to, color) >= 2) found.kingWalk = { squares: { from, to } };
  }
  // 활동성이 떨어진 나이트·비숍
  if (tone === "poor" && (M === "n" || M === "b")) {
    const P = list(after).find((p) => p.sq === to); const n = M === "n" ? knightReach(after, P) : sliderReach(after, P);
    if ((M === "n" && n <= 3) || (M === "b" && n <= 2)) found.passiveMinor = { piece: M, count: n, squares: { to } };
  }
  // 측면 폰 전진
  if (M === "p" && !mv.captured && "abgh".includes(to[0]) && rel(to, color) >= 4 && rel(to, color) <= 6) found.wingSpace = { file: to[0], side: "ab".includes(to[0]) ? "queen" : "king", squares: { from, to } };
  for (const k of STRATEGY_ORDER) if (found[k]) return { kind: k, ...found[k] };
  return null;
}
