#!/usr/bin/env node
/** (v0.7.5) MEC 오프닝 레파토리(src/lib/mecOpenings.js)·폰 구조(src/lib/mecPawnStructure.js) 회귀 검사.
 *   · 레파토리: 모든 수순이 합법이고, 모든 항목의 포지션이 실제 ECO 이론 포지션(ecoBook)이며, 계열 이름이 있다
 *     트랜스포지션(다른 수순으로 같은 포지션)도 같은 설명을 찾고, 이론을 벗어나는 수에서만 중반 계획을 붙인다. 시작 포지션이 다른 대국(FEN)은 대상이 아니다
 *   · 폰 구조: 대표 수순마다 기대한 구조가 정확히 그 수에 생기고, 비슷하지만 다른 배치(오탐 후보)에는 생기지 않는다
 *   · 실제 대국 표본: 오류 없이 돌고, 보고한 구조가 정말 그 수에 새로 생겼는지 직접 다시 계산해 확인
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-mec-repertoire.mjs
 */
import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { openingMoveFact, openingOfGame, openingEntries } from "../src/lib/mecOpenings.js";
import { detectStructures, structureFact, structureFactInGame, structureTimeline } from "../src/lib/mecPawnStructure.js";
import { bookPositionKey, ecoHash } from "../src/lib/ecoHash.js";

const fails = [];
const ROOT = new URL("../", import.meta.url).pathname;
const ECO = new Set(JSON.parse(readFileSync(ROOT + "src/data/ecoBook.json", "utf8")).hashes.split(" ").filter(Boolean));

// ── 레파토리 ──
const entries = openingEntries();
for (const e of entries) {
  const c = new Chess();
  for (const s of e.line.split(" ")) { try { if (!c.move(s)) throw 0; } catch { fails.push("레파토리 수순이 합법이 아님: " + e.line); break; } }
  if (!ECO.has(ecoHash(bookPositionKey(c.fen())))) fails.push("ECO 이론에 없는 포지션(정석 수에만 쓰이므로 화면에 안 나옴): " + e.line);
  if (!e.hasName) fails.push("계열 이름 없음: " + e.fam + " (" + e.line + ")");
}
const fact = (line, nextSan, fen) => { const s = line.split(" "); return openingMoveFact(s.slice(0, -1), s[s.length - 1], nextSan, fen); };
const expect = (label, cond) => { if (!cond) fails.push(label); };
expect("루이 로페즈 3.Bb5를 찾음", (fact("e4 e5 Nf3 Nc6 Bb5", "a6") || {}).family === "ruy");
expect("이론이 이어지는 수(3.Bb5 → 3...a6)에는 계획을 붙이지 않음", !(fact("e4 e5 Nf3 Nc6 Bb5", "a6") || {}).plan);
expect("이론을 벗어나는 수에는 계획을 붙임(3...g6)", !!(fact("e4 e5 Nf3 Nc6 Bb5", "g6") || {}).plan);
expect("다음 수가 없고 이어지는 이론도 없으면 계획(나이도르프)", !!(fact("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6", null) || {}).plan);
expect("트랜스포지션: 1.Nf3 Nf6 2.c4 e6 3.d4 Bb4+는 없음, 1.c4 Nf6 2.d4 e6 3.Nc3 Bb4 = 님조인디언", (fact("c4 Nf6 d4 e6 Nc3 Bb4", null) || {}).family === "nimzo");
expect("트랜스포지션: 1.d4 Nf6 2.Bf4와 1.d4 d5 2.Bf4 모두 런던", (fact("d4 Nf6 Bf4", null) || {}).family === "london" && (fact("d4 d5 Bf4", null) || {}).family === "london");
expect("시작 포지션이 다른 대국은 대상이 아님", fact("e4", null, "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1") === null);
expect("이론 밖 수는 설명 없음(1.a3)", fact("a3", null) === null);
{ const g = openingOfGame("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3".split(" ")); expect("대국의 가장 깊은 레파토리 = 드래곤", g && g.family === "dragon" && g.ply === 9); }

// ── 폰 구조 ──
const LINES = [
  ["QGD 익스체인지 → 칼스바드(백 소수 공격)", "d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5", 7, "carlsbad", "w"],
  ["카로칸 익스체인지 → 칼스바드(흑 소수 공격)", "e4 c6 d4 d5 exd5 cxd5", 5, "carlsbad", "b"],
  ["프렌치 어드밴스 → d4–e5 사슬", "e4 e6 d4 d5 e5", 4, "frenchChain", "w"],
  ["킹스 인디언 8.d5 → 닫힌 중앙", "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5", 14, "kidChain", "w"],
  ["나이도르프 6...e5 → d5 구멍", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2 e5", 11, "boleslavsky", "b"],
  ["드래곤 5...g6", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6", 9, "dragon", "b"],
  ["셰베닝겐 5...e6", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6", 9, "scheveningen", "b"],
  ["가속 드래곤 5.c4 → 마로치 바인드", "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 c4", 8, "maroczy", "w"],
  ["모던 베노니 → 베노니 구조", "d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6", 9, "benoni", "w"],
  ["파노프 → 백 고립 d폰", "e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 e6 Nf3 Be7 cxd5 Nxd5", 13, "iqp", "w"],
  ["세미 슬라브 → 삼각형", "d4 d5 c4 c6 Nf3 Nf6 Nc3 e6", 7, "slavTriangle", "b"],
  ["더치 스톤월(흑)", "d4 f5 c4 Nf6 g3 e6 Bg2 d5", 7, "stonewall", "b"],
];
for (const [label, line, ply, kind, side] of LINES) {
  const tl = structureTimeline(line.split(" "));
  const hit = tl.find((s) => s.kind === kind && s.side === side);
  if (!hit) fails.push(label + ": " + kind + " 구조를 찾지 못함 (" + JSON.stringify(tl.map((s) => s.ply + ":" + s.kind)) + ")");
  else if (hit.ply !== ply) fails.push(label + ": " + kind + "가 " + (hit.ply + 1) + "번째 수에서 생김 (기대 " + (ply + 1) + ")");
}
const none = (label, fen, kind) => { if (detectStructures(fen).some((s) => s.kind === kind)) fails.push("오탐: " + label); };
none("시작 포지션에 구조 없음(열린 중앙 등)", new Chess().fen(), "openCenter");
none("c폰이 남아 있으면 고립 d폰 아님", "r2qk2r/8/8/8/3P4/8/2P5/R2QK2R w - - 0 1", "iqp");
none("e폰이 남아 있으면 고립 d폰 아님", "r2qk2r/8/8/8/3P4/4P3/8/R2QK2R w - - 0 1", "iqp");
none("b폰이 있으면 행잉 폰 아님", "r2qk2r/8/8/8/2PP4/8/1P6/R2QK2R w - - 0 1", "hanging");
none("흑 c폰이 있으면 마로치 아님", "r2qk2r/2pp4/8/8/2P1P3/8/8/R2QK2R w - - 0 1", "maroczy");
none("흑 e폰이 있으면 베노니 아님", "r2qk2r/8/3pp3/2pP4/8/8/8/R2QK2R w - - 0 1", "benoni");
none("폰이 거의 없는 엔드게임은 열린 중앙이라 하지 않음", "4k3/p7/8/8/8/8/P7/4K3 w - - 0 1", "openCenter");
none("기물이 적은 엔드게임에는 구조 문장 없음(룩 엔드게임의 고립 d폰)", "3rk3/pp3ppp/8/8/3P4/8/PP3PPP/3RK3 w - - 0 1", "iqp");
{ const s = detectStructures("r2qk2r/pp3ppp/8/8/3P4/8/PP3PPP/R2QK2R w - - 0 1"); expect("기물이 있는 중반의 고립 d폰은 인식", s.some((x) => x.kind === "iqp" && x.side === "w")); }
none("상대 d폰과 마주 보면 IQP 아님", "r2qk2r/pp2pppp/8/3p4/3P4/8/PP3PPP/R2QK2R w - - 0 1", "iqp");
{ const f = structureFact("r2qk2r/8/8/8/3P4/8/1PP5/R2QK2R w - - 0 1", "c4"); if (f) fails.push("b폰이 있는 c4·d4(행잉 폰 아님)에 구조 문장: " + f.kind); }
{ const f = structureFact("r2qk2r/8/8/8/3P4/8/2P5/R2QK2R w - - 0 1", "c4"); expect("b·e폰 없는 c4·d4 = 행잉 폰", f && f.kind === "hanging" && f.side === "w"); }
{ const f = structureFact("rnbqkbnr/pp2pppp/8/2pP4/8/8/PPP1PPPP/RNBQKBNR b KQkq - 0 3", "e5"); if (f && f.kind === "benoni") fails.push("흑 e폰이 e5에 있으면 베노니 아님"); }
{ const f = structureFact("r1bqkbnr/pp1ppppp/2n5/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq - 0 4", "g6"); if (f) fails.push("구조가 없는 수에 문장(" + f.kind + ")"); }
{ const f = structureFact("rnbqkb1r/pp3ppp/4pn2/3p4/2PP4/2N5/PP3PPP/R1BQKBNR w KQkq - 0 5", "cxd5+"); expect("체크 기호가 붙은 SAN도 처리(오류 없이 null 또는 구조)", f === null || typeof f.kind === "string"); }

// 대국 안에서: 이어지는 2수 뒤에도 남는 구조만, 앞서 한 번 있었던 구조는 다시 말하지 않음
{ const b = "d4 d5 c4 e6 Nc3 Nf6 cxd5".split(" ");
  expect("이어지는 수 뒤에도 남는 칼스바드는 말함", (structureFactInGame(b, "exd5", null, ["Bg5", "c6"]) || {}).kind === "carlsbad");
  const c = "e4 c6 d4 d5 exd5".split(" ");
  expect("다음 수(c4)로 곧 사라지는 칼스바드는 말하지 않음", structureFactInGame(c, "cxd5", null, ["c4", "Nf6"]) === null);
  expect("이어지는 수를 모르면(자유 탐색) 그대로 말함", (structureFactInGame(c, "cxd5", null, []) || {}).kind === "carlsbad");
  const tl = structureTimeline("d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6 e3 Be7 Qc2 O-O Bd3 Nbd7 Nge2 Re8 O-O Nf8 f3 Ne6 Bh4 Nh5 Bxe7 Qxe7 e4 dxe4 fxe4 Nf6 e5 Nd5 Ne4 c5 Nxc5 Nxc5 dxc5 Qxc5+".split(" "), null, true);
  expect("firstOnly 타임라인: 구조마다 한 번만", new Set(tl.map((s) => s.kind + s.side)).size === tl.length); }

// ── 실제 대국 표본 ──
const games = [];
for (const f of ["norway", "candidates", "dortmund"]) {
  const d = JSON.parse(readFileSync(ROOT + "src/data/tournaments/" + f + ".json", "utf8"));
  games.push(...d.eds.flatMap((e) => e.g).filter((g) => typeof g[5] === "string" && g[5].length > 60).slice(0, 30));
}
const { decodeMoves } = await import("../src/lib/moveCodec.js");
let n = 0, formed = 0;
const idOf = (s) => s.kind + ":" + (s.side || "");
for (const g of games) {
  let sans; try { sans = decodeMoves(g[5]); } catch { continue; }
  if (!Array.isArray(sans) || !sans.length) continue;
  n++;
  let tl; try { tl = structureTimeline(sans); } catch (e) { fails.push("structureTimeline 오류: " + e.message); continue; }
  try { openingOfGame(sans); for (let i = 0; i < Math.min(sans.length, 20); i++) openingMoveFact(sans.slice(0, i), sans[i], sans[i + 1] || null); } catch (e) { fails.push("openingMoveFact 오류: " + e.message); }
  const c = new Chess(); const fens = [c.fen()];
  for (const s of sans) { try { c.move(s); } catch { break; } fens.push(c.fen()); }
  for (const s of tl) {
    formed++;
    const before = detectStructures(fens[s.ply]).map(idOf), after = detectStructures(fens[s.ply + 1]).map(idOf);
    if (before.includes(idOf(s)) || !after.includes(idOf(s))) fails.push("구조 시점 불일치: " + idOf(s) + " @" + s.ply);
    const mv = new Chess(fens[s.ply]).move(sans[s.ply]);
    if (mv.piece !== "p" && !mv.captured) fails.push("폰이 움직이지도 잡히지도 않았는데 구조가 바뀜: " + sans[s.ply]);
  }
}
if (n < 30) fails.push("실제 대국 표본이 너무 적음(" + n + "판)");

if (fails.length) { console.error("✗ check-mec-repertoire 실패\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-mec-repertoire: 레파토리 " + entries.length + "항목(전부 ECO 이론·합법), 폰 구조 대표 수순 " + LINES.length + "개, 실제 대국 " + n + "판에서 구조 " + formed + "번 생성 확인");
