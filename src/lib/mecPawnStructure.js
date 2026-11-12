import { Chess } from "chess.js";

// (v0.7.5) MEC 폰 구조 인식 — 폰 배치만 보고 이름 있는 구조를 찾는다(순수 함수, 문장은 mecStructureText.js).
// 구조 정의와 계획은 웹에서 확인한 일반적인 설명을 바탕으로 했다(BUGS.md·README v0.7.5 참고):
//   · chess.com "Every Pawn Structure Explained"(GM Johan Hellsten), thechessworld.com "10 Pawn Structures in Chess"
//   · Wikipedia "Pawn structure"(검색 요약으로 확인), chessbio.com "Boleslavsky hole", chess.com "The Sicilian Hole"
//   · chess.com "The advance variation of the French defence", thomasollo.net Mar del Plata 항목
// side는 구조의 "주인"(IQP·행잉 폰·스톤월은 그 폰을 가진 쪽, 칼스바드는 소수 공격을 하는 쪽). 대칭이 아닌 구조는 백 기준 한 방향만 본다.
export const STRUCTURE_ORDER = ["hedgehog", "maroczy", "dragon", "boleslavsky", "scheveningen", "benoni", "kidChain", "frenchChain", "slavTriangle", "carlsbad", "hanging", "iqp", "stonewall", "openCenter"];

const FILES = "abcdefgh";
const other = (c) => (c === "w" ? "b" : "w");
// 내 쪽에서 센 랭크의 칸 이름 — sq("d", 4, "b") = "d5"
const sq = (file, relRank, color) => file + (color === "w" ? relRank : 9 - relRank);

// 폰 구조의 계획(킹사이드 공격·돌파 등)은 기물이 남아 있는 중반 이야기다 — 엔드게임에서는 구조 문장을 내지 않는다.
// 기준: 양쪽 폰·킹을 뺀 기물 점수 합이 이 값 이상(시작 62점, 예: 양쪽 퀸+룩 하나+마이너 하나 = 34점).
export const STRUCTURE_MIN_MATERIAL = 24;
const VAL = { n: 3, b: 3, r: 5, q: 9 };
function pawnMap(fen) {
  const c = new Chess(fen);
  const P = { w: new Set(), b: new Set() }; let mat = 0;
  c.board().forEach((row, r) => row.forEach((p, f) => { if (!p) return; if (p.type === "p") P[p.color].add(FILES[f] + (8 - r)); else mat += VAL[p.type] || 0; }));
  P.mat = mat;
  return P;
}
const onFile = (set, file) => [...set].filter((s) => s[0] === file);
const has = (set, ...squares) => squares.every((s) => set.has(s));
const noFile = (set, ...files) => files.every((f) => !onFile(set, f).length);

/** fen의 폰 구조 목록(우선순위 순). 각 항목 { kind, side, squares: [구조를 이루는 폰 칸] }. */
export function detectStructures(fen) {
  let P;
  try { P = pawnMap(fen); } catch { return []; }
  if (P.mat < STRUCTURE_MIN_MATERIAL) return [];
  const W = P.w, B = P.b, out = [];
  const push = (kind, side, squares, extra) => out.push({ kind, side, squares, ...extra });
  // ── 시칠리안·인디언 계열(백 e4, 흑 c폰 없음) ──
  const sicilianFrame = W.has("e4") && noFile(W, "d") && noFile(B, "c");
  if (sicilianFrame && W.has("c4") && has(B, "a6", "b6", "d6", "e6")) push("hedgehog", "b", ["c4", "e4", "a6", "b6", "d6", "e6"]);
  else if (sicilianFrame && W.has("c4") && (B.has("d6") || B.has("d7"))) push("maroczy", "w", ["c4", "e4"]);
  else if (sicilianFrame && has(B, "d6", "g6", "e7")) push("dragon", "b", ["d6", "e7", "g6"]);
  else if (sicilianFrame && has(B, "d6", "e5")) push("boleslavsky", "b", ["d6", "e5"], { hole: "d5" });
  else if (sicilianFrame && has(B, "d6", "e6")) push("scheveningen", "b", ["d6", "e6"]);
  // ── 닫힌 중앙 ──
  if (W.has("d5") && has(B, "c5", "d6") && noFile(B, "e")) push("benoni", "w", ["d5", "c5", "d6"]);
  else if (has(W, "d5", "e4") && has(B, "d6", "e5")) push("kidChain", "w", ["d5", "e4", "d6", "e5"]);
  if (has(W, "d4", "e5") && has(B, "d5", "e6")) push("frenchChain", "w", ["d4", "e5", "d5", "e6"]);
  if (has(W, "c4", "d4") && has(B, "c6", "d5", "e6")) push("slavTriangle", "b", ["c6", "d5", "e6"]);
  // ── 칼스바드(소수 공격 쪽 S: d폰 4랭크·e폰 2~3랭크·c폰 없음 / 상대: c폰 2~3랭크·d폰 4랭크·e폰 없음 — 상대 기준 랭크) ──
  for (const S of ["w", "b"]) {
    const O = other(S), mine = P[S], theirs = P[O];
    const e = onFile(mine, "e");
    if (mine.has(sq("d", 4, S)) && noFile(mine, "c") && e.length === 1 && (e[0] === sq("e", 2, S) || e[0] === sq("e", 3, S))
      && theirs.has(sq("d", 4, O)) && (theirs.has(sq("c", 2, O)) || theirs.has(sq("c", 3, O))) && noFile(theirs, "e") && onFile(mine, "b").length)
      push("carlsbad", S, [sq("d", 4, S), e[0], sq("d", 4, O)], { minority: S === "w" ? "b4–b5" : "...b5–b4", knightSq: S === "w" ? "e4" : "e5" });
  }
  // ── 행잉 폰·고립 d폰 ──
  for (const S of ["w", "b"]) {
    const mine = P[S];
    if (has(mine, sq("c", 4, S), sq("d", 4, S)) && onFile(mine, "c").length === 1 && onFile(mine, "d").length === 1 && noFile(mine, "b", "e")) push("hanging", S, [sq("c", 4, S), sq("d", 4, S)]);
    const d = onFile(mine, "d");
    // IQP는 상대 d폰이 없어(반쯤 열린 d파일) 고립 폰 앞 칸을 막을 수 있는 구조다 — 상대 d폰과 마주 보면 다른 구조다.
    if (d.length === 1 && (d[0] === sq("d", 4, S) || d[0] === sq("d", 5, S)) && noFile(mine, "c", "e") && noFile(P[other(S)], "d"))
      push("iqp", S, [d[0]], { blockade: d[0][0] + (S === "w" ? +d[0][1] + 1 : +d[0][1] - 1) });
  }
  // ── 스톤월(c3·d4·e3·f4 / c6·d5·e6·f5 중 d·e·f 필수) ──
  for (const S of ["w", "b"]) {
    if (has(P[S], sq("d", 4, S), sq("e", 3, S), sq("f", 4, S))) push("stonewall", S, [sq("d", 4, S), sq("e", 3, S), sq("f", 4, S)], { outpost: sq("e", 5, S), hole: sq("e", 4, S) });
  }
  // ── 열린 중앙(d·e파일에 폰이 하나도 없음) ──
  if (noFile(W, "d", "e") && noFile(B, "d", "e") && W.size + B.size >= 6) push("openCenter", null, []);
  return out.sort((a, b) => STRUCTURE_ORDER.indexOf(a.kind) - STRUCTURE_ORDER.indexOf(b.kind));
}

const idOf = (s) => s.kind + ":" + (s.side || "");
/** 대국 수순(sansBefore 뒤 san)에서 이 수로 처음 생긴 구조 — 같은 대국에서 앞서 한 번이라도 있었던 구조는 다시 말하지 않는다(생겼다 사라졌다 반복하는 구조 대응). */
// futureSans(그 대국의 이어지는 실제 수, 최대 2수)를 주면 그 뒤에도 남아 있는 구조만 돌려준다 — 교환 도중 한두 수만 생겼다 사라지는 구조(실측 약 16%)를 말하지 않기 위해서다.
export function structureFactInGame(sansBefore, san, fenRoot, futureSans) {
  const tl = structureTimeline([...sansBefore, san], fenRoot, true);
  const cands = tl.filter((s) => s.ply === sansBefore.length);
  const fut = (futureSans || []).filter(Boolean).slice(0, 2);
  if (!cands.length || !fut.length) return cands[0] || null;
  let c;
  try { c = fenRoot ? new Chess(fenRoot) : new Chess(); for (const m of [...sansBefore, san, ...fut]) if (!c.move(String(m).replace(/[+#!?]+$/, ""))) return cands[0]; } catch { return cands[0]; }
  const later = new Set(detectStructures(c.fen()).map(idOf));
  return cands.find((s) => later.has(idOf(s))) || null;
}
/** fenBefore에서 san을 둔 뒤 새로 생긴 구조(우선순위가 가장 높은 하나). 이미 있던 구조는 다시 말하지 않는다. 없으면 null. */
export function structureFact(fenBefore, san) {
  let after;
  try { const c = new Chess(fenBefore); if (!c.move(String(san).replace(/[+#!?]+$/, ""))) return null; after = c.fen(); } catch { return null; }
  const before = new Set(detectStructures(fenBefore).map(idOf));
  return detectStructures(after).find((s) => !before.has(idOf(s))) || null;
}

/** 대국 전체에서 구조가 생긴 시점 목록 — [{ ply, ...구조 }] (ply = 그 구조를 만든 수의 0부터 센 번호). firstOnly면 구조마다 처음 생긴 때만. 게임 요약(예정)용. */
export function structureTimeline(sans, fenRoot, firstOnly = false) {
  const out = [], ever = new Set();
  let c;
  try { c = fenRoot ? new Chess(fenRoot) : new Chess(); } catch { return out; }
  let prev = new Set(detectStructures(c.fen()).map(idOf));
  prev.forEach((k) => ever.add(k));
  for (let i = 0; i < sans.length; i++) {
    try { if (!c.move(String(sans[i]).replace(/[+#!?]+$/, ""))) break; } catch { break; }
    const now = detectStructures(c.fen());
    for (const s of now) if (!prev.has(idOf(s)) && !(firstOnly && ever.has(idOf(s)))) out.push({ ply: i, ...s });
    for (const s of now) ever.add(idOf(s));
    prev = new Set(now.map(idOf));
  }
  return out;
}
