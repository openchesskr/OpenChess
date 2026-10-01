#!/usr/bin/env node
/** (v0.5.9, BUG-039 재발 방지) 이론 수 판정(isBookMoveAt)이 수순 전환(같은 포지션을 다른 수 순서로 만든 경우)에도 맞는지 검사한다.
 *  예전엔 수순 경로(keyStr)로만 스냅샷·개발자 데이터를 찾아, 1.e4 g6 2.d4처럼 데이터에 1.d4 g6 2.e4로만 있는 이론 수가 리뷰에서
 *  비이론으로 떴다(마스터 대국 5,000판 첫 30수 중 약 6%).
 *  App.jsx의 이론 판정 함수들과 스냅샷(SNAP)을 그대로 잘라 실행한다 — 실제 데이터로 ① 수순 전환 사례가 이론, ② 이론이 아닌 수는 그대로
 *  비이론, ③ 개발자가 뺀 수(unbook)·포지션은 다른 경로로 되살아나지 않음, ④ 개발자 편집 뒤 색인이 다시 만들어짐을 확인한다.
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-book-transposition.mjs
 */
import fs from "node:fs";
import { boardFromSans, sanSrc, sansToFen, stripSuffix } from "../src/lib/chessRules.js";
import { bookPositionKey, ecoHash } from "../src/lib/ecoHash.js";

// src/lib/ecoBook.js와 같은 동작(그 파일은 번들러 전용 JSON import라 여기선 데이터를 직접 읽는다)
const ECO_BOOK = JSON.parse(fs.readFileSync(new URL("../src/data/ecoBook.json", import.meta.url), "utf8"));
const ecoSet = new Set(ECO_BOOK.hashes.split(" "));
const isEcoBookPosition = (key) => !!key && ecoSet.has(ecoHash(key));

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const fails = [];
const body = (name) => {
  const i = app.indexOf("function " + name + "(");
  if (i < 0) { fails.push("src/App.jsx — " + name + "를 찾지 못함"); return ""; }
  const open = app.indexOf("{", app.indexOf(")", i));
  let depth = 0;
  for (let k = open; k < app.length; k++) {
    if (app[k] === "{") depth++;
    else if (app[k] === "}" && --depth === 0) return app.slice(i, k + 1);
  }
  return "";
};
// 스냅샷 트리(SNAP) — `const SNAP = /*__DATA__*/ {…};`
const snapAt = app.indexOf("const SNAP = /*__DATA__*/ ") + "const SNAP = /*__DATA__*/ ".length;
let d = 0, e = snapAt;
for (; e < app.length; e++) { if (app[e] === "{") d++; else if (app[e] === "}" && --d === 0) break; }
const SNAP = JSON.parse(app.slice(snapAt, e + 1));

const names = ["forceKindFor", "addsFor", "isUnbooked", "isBookMoveAtPath", "bookPosAfter", "invalidateBookIndex", "bookPosIndex", "isBookMoveAt"];
const src = `
  let CONTENT = { treeAdds: {}, forceKind: {}, unbook: {} };
  const _bookPosAfterCache = new Map();
  let _bookPosIndex = null, _bookIndexVer = 0;
  ${names.map(body).join("\n")}
  return { isBookMoveAt, invalidateBookIndex, setContent: (c) => { CONTENT = c; }, content: () => CONTENT };`;
let api;
try { api = new Function("SNAP", "boardFromSans", "sanSrc", "sansToFen", "stripSuffix", "bookPositionKey", "isEcoBookPosition", src)(SNAP, boardFromSans, sanSrc, sansToFen, stripSuffix, bookPositionKey, isEcoBookPosition); }
catch (err) { fails.push("이론 판정 함수를 실행하지 못함: " + err.message); }

if (api) {
  const book = (line) => { const s = line.split(" "); return api.isBookMoveAt(s.slice(0, -1).join(" "), s[s.length - 1]); };
  // ① 수순 전환 — 경로로는 스냅샷에 없지만 둔 뒤 포지션은 이론 포지션
  const TRANS = [
    "e4 g6 d4",                           // 1.d4 g6 2.e4로만 있음(앙파상 칸이 달라도 같은 포지션)
    "e4 c5 Nf3 Nc6 c3 Nf6 e5 Nd5",        // 알라핀 순서 전환
    "e4 c5 Nf3 Nc6 c3 Nf6 e5 Nd5 Bc4",    // 한 번 빠지면 이어지는 수까지 빠지던 것
  ];
  for (const line of TRANS) {
    const s = line.split(" ");
    const key = s.slice(0, -1).join(" ");
    const node = SNAP.tree[key];
    const onPath = !!(node && (node.moves || []).some((m) => stripSuffix(m.san) === stripSuffix(s[s.length - 1]) && m.book));
    if (onPath) fails.push("사례 '" + line + "'가 이미 경로상 이론이라 수순 전환 검사가 되지 않는다 — 다른 사례로 바꿀 것");
    if (!book(line)) fails.push("수순 전환 — '" + line + "'가 이론이어야 한다");
  }
  // ①-2 이름 있는 오프닝(ECO) — 스냅샷엔 없지만 정식 오프닝
  if (ECO_BOOK.positions < 5000) fails.push("src/data/ecoBook.json 이론 포지션이 " + ECO_BOOK.positions + "개뿐 — scripts/build-eco-book.mjs로 다시 만들 것");
  for (const line of ["Nf3 d5", "e4 g6", "e4 d6 d4 Nf6 Nc3 g6"]) {   // 레티, 모던, 피르크
    const s = line.split(" "), key = s.slice(0, -1).join(" ");
    if (SNAP.tree[key] && (SNAP.tree[key].moves || []).some((m) => stripSuffix(m.san) === s[s.length - 1] && m.book)) continue;
    if (!book(line)) fails.push("이름 있는 오프닝 — '" + line + "'가 이론이어야 한다(ECO)");
  }
  // 경로상 이론은 그대로
  if (!book("e4 e5 Nf3")) fails.push("경로상 이론 '1.e4 e5 2.Nf3'가 이론이 아니게 됐다");
  // ② 이론이 아닌 수는 그대로
  for (const line of ["d4 d5 Kd2", "e4 g6 Kf1", "d4 Nf6 c4 e6 Nc3 Bb4 Kd2"]) if (book(line)) fails.push("이론이 아닌 수 '" + line + "'가 이론으로 나왔다");
  // ③ 개발자가 뺀 수 — 그 경로에선 빠지고, 포지션도 다른 경로의 수순 전환으로 되살아나지 않는다
  api.setContent({ treeAdds: {}, forceKind: {}, unbook: { "d4 g6|e4": true } }); api.invalidateBookIndex();
  if (book("d4 g6 e4")) fails.push("unbook한 '1.d4 g6 2.e4'가 여전히 이론");
  if (book("e4 g6 d4")) fails.push("unbook한 포지션이 수순 전환 '1.e4 g6 2.d4'로 되살아났다");
  // ④ 개발자 편집 뒤 색인 갱신 — 같은 CONTENT 객체를 고치고 invalidateBookIndex(bumpContent가 부름)하면 반영
  const c = api.content(); delete c.unbook["d4 g6|e4"]; api.invalidateBookIndex();
  if (!book("e4 g6 d4")) fails.push("unbook을 되돌린 뒤 색인이 다시 만들어지지 않았다(invalidateBookIndex)");
  // 개발자가 추가한 이론(경로 A)은 수순 전환(경로 B)에서도 이론 — 스냅샷에 없는 수로 검사
  c.treeAdds["e4 e5 Nf3 Nc6"] = [{ san: "a3", theory: true }]; api.invalidateBookIndex();
  if (!book("e4 e5 Nf3 Nc6 a3")) fails.push("개발자 추가 이론 '…Nc6 a3'가 이론이 아니다");
  if (!book("Nf3 Nc6 e4 e5 a3")) fails.push("개발자 추가 이론이 수순 전환 경로('1.Nf3 Nc6 2.e4 e5 3.a3')에서 이론이 아니다");
}
if (!/const bumpContent = useCallback\(async \(\) => \{ invalidateBookIndex\(\);/.test(app)) fails.push("src/App.jsx — bumpContent가 invalidateBookIndex()를 부르지 않는다(개발자 편집이 이론 판정에 반영되지 않음)");

// 게임 리뷰(analyzeGame gradeOne)는 엔진 평가 실패 분기보다 먼저 이론 여부를 정해야 한다 — 평가가 시간 초과된 이론 수가 "좋음"으로 뜨던 문제
{
  const g = body("gradeOne");
  const iBook = g.indexOf("const bookMove = "), iFail = g.indexOf("if (!posEval[i].ok");
  if (iBook < 0 || iFail < 0 || iBook > iFail) fails.push("src/App.jsx gradeOne — 엔진 평가 실패 분기(!posEval[i].ok)보다 먼저 이론 여부(bookMove)를 정하지 않는다");
  else if (!/if \(bookMove\)/.test(g.slice(iFail))) fails.push("src/App.jsx gradeOne — 엔진 평가 실패 분기에서 이론 수를 이론으로 매기지 않는다");
}

if (fails.length) {
  console.error("✗ 이론 수 수순 전환 검사 실패 (BUG-039 재발 방지):\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log("✓ 이론 수 수순 전환·ECO 검사 통과 (수순 전환 3건 · ECO 3건 · 비이론 3건 · 개발자 데이터 4건 · 리뷰 평가 실패 분기)");
