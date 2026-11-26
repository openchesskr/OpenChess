#!/usr/bin/env node
/** (v0.7.6, 사용자 요청) 수 키워드 자동 부여(src/lib/moveKeywords.js) — 수 블록마다 포지션을 분석해 키워드 하나. 개발자 수동 지정 코드가 되살아나지 않는지도 본다.
 *  실행: node scripts/check-move-keywords.mjs (prebuild로 자동 실행) */
import fs from "node:fs";
import { autoMoveKeyword, autoMoveKeywords, blockKeywords, AUTO_KEYWORDS } from "../src/lib/moveKeywords.js";
import { boardFromSans } from "../src/lib/chessRules.js";
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const kw = (sans, san, extra = {}) => autoMoveKeyword({ san, color: sans.length % 2 === 0 ? "w" : "b", board: boardFromSans(sans), ...extra });
import { placementKey } from "../src/lib/moveKeywords.js";
import { applySan } from "../src/lib/chessRules.js";
ok(kw([], "Nf3", { lossCp: 10 }) === "INTUITIVE", "첫 줄 나이트 발전 → INTUITIVE");
ok(kw(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"], "O-O", { lossCp: 0 }) === "INTUITIVE", "캐슬링 → INTUITIVE");
ok(kw(["e4", "e5", "Bc4", "Nc6"], "Bxf7+", { lossCp: 200 }) === "LOW-LEVEL", "최선보다 1.5 이상 나쁨 → LOW-LEVEL");
ok(kw(["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6"], "Qxf7#", { lossCp: 0 }) === "STRAIGHT-LINE", "체크(메이트)는 이제 SHARP가 아니라 강제적인 STRAIGHT-LINE");
ok(kw(["e4", "e5", "Nf3", "d6"], "Bc4", { lossCp: 0, gapCp: 120 }) === "SHARP", "최선이고 다른 수가 모두 0.8 이상 나쁨 → SHARP");
ok(kw(["e4", "e5", "Nf3", "d6"], "Bc4", { lossCp: 10, kind: "only" }) === "SHARP", "유일한 수 → SHARP");
ok(kw(["e4", "e5", "Nf3", "d6"], "Bc4", { lossCp: 0, gapCp: 40 }) !== "SHARP", "다른 좋은 수가 있으면 SHARP 아님");
ok(kw([], "e4", { lossCp: 0, isBest: true, masterAdopt: 40 }) === "TOP LEVEL", "평가 1위 + 마스터 선호 → TOP LEVEL");
{ // 같은 포지션 반복 → DRAWING-WEAPON (1.Nf3 Nf6 2.Ng1 Ng8 이후 3.Nf3은 1.Nf3 뒤 포지션 반복)
  const seq = ["Nf3", "Nf6", "Ng1", "Ng8"]; let b = boardFromSans([]); const h = new Set([placementKey(b, "w")]);
  seq.forEach((s2, i) => { const c = i % 2 === 0 ? "w" : "b"; b = applySan(b, s2, c); h.add(placementKey(b, c === "w" ? "b" : "w")); });
  ok(kw(seq, "Nf3", { lossCp: 0, history: h }) === "DRAWING-WEAPON", "반복 수 → DRAWING-WEAPON"); }
ok(kw(["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "Qd3", "Qd6", "Qxd5", "exd5"], "e3", { lossCp: 10 }) !== "DRAWING-WEAPON", "반복이 아니면 DRAWING-WEAPON 아님");
ok(kw(["e4", "e5", "Qh5", "Qh4", "Qxh4"].slice(0, 4), "Qxh4", { lossCp: 0, evalCp: 10 }) === "DRAWING-WEAPON", "균형인 퀸 교환 → DRAWING-WEAPON");
ok(kw(["e4", "c5"], "Nc3", { lossCp: 0, name: "Sicilian Defense: Closed, Anti-Open" }) === "ANTI-", "오프닝 이름에 Anti- → ANTI-");
ok(kw(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"], "Bxc6", { lossCp: 0 }) === "IMBALANCE", "비숍으로 나이트 잡기 → IMBALANCE");
ok(kw(["e4", "d5"], "exd5", { lossCp: 0 }) === "OPEN", "폰으로 잡기 → OPEN");
ok(kw(["e4", "e6", "d4", "d5"], "e5", { lossCp: 0 }) === "CLOSED", "상대 폰과 정면으로 맞물리는 전진 → CLOSED");
ok(kw(["d4", "d5"], "c4", { lossCp: 0 }) === "SWITCH", "상대 폰을 치는 폰 브레이크 → SWITCH");
ok(kw(["e4", "d5", "exd5"], "Qxd5", { lossCp: 0 }) === "STRAIGHT-LINE", "기물 잡기 → STRAIGHT-LINE");
ok(kw(["c4"], "c5", { lossCp: 0, prevSan: "c4" }) === "BALANCE", "상대 수를 거울처럼 → BALANCE");
ok(kw([], "e4", { lossCp: 0, book: true, adopt: 45 }) === "MAIN-LINE", "많이 두는 이론 수 → MAIN-LINE");
ok(kw([], "a3", { lossCp: 40, book: true, adopt: 1 }) === "SIDESTEPPING", "드문 이론 수 → SIDESTEPPING");
ok(kw([], "d3", { lossCp: 20, nearBest: 4 }) === "FLEXIBLE", "좋은 수가 여럿인 포지션의 조용한 수 → FLEXIBLE");
ok(kw([], "d3", { lossCp: 20, nearBest: 1 }) === "QUIET", "최선에 가까운 조용한 수 → QUIET");
ok(kw([], "d3", {}) === "NORMAL", "평가를 모르면 조건을 건너뛰고 NORMAL");
ok(autoMoveKeyword({ san: "Zz9", color: "w", board: null }) === "NORMAL", "이상한 수 표기에도 멈추지 않음");
ok(blockKeywords({ kwAuto: "QUIET", kw: ["TOP LEVEL", "NORMAL"] }).join() === "QUIET", "표시는 자동 키워드만(예전 kw 무시)");
// (v0.7.8, 사용자 요청) 조건에 맞는 키워드를 전부 — 하나만 고르지 않는다
const kws = (sans, san, extra = {}) => autoMoveKeywords({ san, color: sans.length % 2 === 0 ? "w" : "b", board: boardFromSans(sans), ...extra });
{ const a = kws(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"], "Bxc6", { lossCp: 0, kind: "only" });
  ok(a.includes("SHARP") && a.includes("IMBALANCE") && a.includes("STRAIGHT-LINE"), "유일한 수 + 비숍↔나이트 잡기는 SHARP·IMBALANCE·STRAIGHT-LINE 전부 (" + a.join() + ")"); }
{ const a = kws(["e4", "e5"], "Nf3", { lossCp: 0, book: true, adopt: 60 });
  ok(a.join() === "INTUITIVE,MAIN-LINE,QUIET", "발전 수·메인 라인·조용한 수 → 우선순위 순으로 전부 (" + a.join() + ")"); }
ok(kws([], "d3", { lossCp: 20, nearBest: 4 }).join() === "FLEXIBLE", "FLEXIBLE은 QUIET을 담으므로 QUIET을 겹쳐 표시하지 않음");
ok(kws([], "d3", {}).join() === "NORMAL", "아무 조건도 안 맞을 때만 NORMAL");
ok(!kws(["e4", "d5"], "exd5", { lossCp: 0 }).includes("NORMAL"), "다른 키워드가 있으면 NORMAL을 붙이지 않음");
ok(blockKeywords({ kwAuto: "OPEN", kwAutoAll: ["OPEN", "STRAIGHT-LINE"] }).join() === "OPEN,STRAIGHT-LINE", "수 블록 표시는 kwAutoAll 전부");
ok(blockKeywords({ kw: ["TOP LEVEL"] }).length === 0, "자동 키워드가 없으면 표시하지 않음");
// (v0.8.0, 사용자 요청) LOW-LEVEL은 이론 수·좋은 등급 이상·평가 1위·많이 두는 수에는 붙지 않는다
ok(!kws(["e4"], "c5", { lossCp: 200, book: true }).includes("LOW-LEVEL"), "이론 수(1...c5)에 LOW-LEVEL");
for (const kind of ["best", "excellent", "good", "only", "brilliant"]) ok(!kws(["e4"], "c5", { lossCp: 200, kind }).includes("LOW-LEVEL"), "등급 " + kind + "인 수에 LOW-LEVEL");
ok(!kws(["e4"], "c5", { lossCp: 200, isBest: true }).includes("LOW-LEVEL"), "평가 1위 수에 LOW-LEVEL");
ok(!kws(["e4"], "c5", { lossCp: 200, adopt: 8 }).includes("LOW-LEVEL") && !kws(["e4"], "c5", { lossCp: 200, masterAdopt: 3 }).includes("LOW-LEVEL"), "많이 두는 수에 LOW-LEVEL");
ok(kws(["e4", "e5", "Nf3", "Nc6"], "Ng1", { lossCp: 200, kind: "mistake", adopt: 0.1 }).includes("LOW-LEVEL"), "드물고 나쁜 수에는 LOW-LEVEL");
// (v0.8.0, 사용자 요청) 포지션 성격 키워드 — 평가가 낮거나 드문 수도 성격이 함께 보인다
const kp = (sans, san, extra = {}) => kws(sans, san, { ply: sans.length, ...extra });
const has = (sans, san, k, extra) => { const a = kp(sans, san, extra); ok(a.includes(k), san + " → " + k + " (" + a.join() + ")"); };
const hasNot = (sans, san, k, extra) => { const a = kp(sans, san, extra); ok(!a.includes(k), san + " → " + k + " 아님 (" + a.join() + ")"); };
has(["e4", "e5"], "f4", "GAMBIT"); has(["d4", "d5"], "c4", "GAMBIT"); hasNot(["e4"], "d5", "GAMBIT");
has(["e4", "e5"], "Qh5", "EARLY QUEEN"); hasNot(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "O-O", "Be7", "d3", "O-O", "Nc3", "d6", "h3", "h6", "a3", "a6"], "Qe2", "EARLY QUEEN");
has(["e4", "e5", "Nf3", "Nc6"], "Ng1", "TEMPO LOSS"); hasNot(["e4", "e5"], "Nf3", "TEMPO LOSS");
has(["e4", "e5"], "Ke2", "KING WALK"); has(["e4", "e5"], "f3", "WEAKENING");
hasNot(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "O-O", "Be7"], "h3", "WEAKENING"); has(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "O-O", "Be7"], "h3", "PROPHYLAXIS");
has(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "O-O", "Be7", "Re1", "O-O"], "g4", "WEAKENING");
has(["Nf3", "d5"], "g3", "FIANCHETTO"); has(["Nf3", "d5", "g3", "Nf6"], "Bg2", "FIANCHETTO");
has(["e4", "e5"], "a4", "WING"); has(["e4", "e6"], "g4", "WING");
has(["e4"], "c5", "CENTER"); has([], "e4", "CENTER"); has(["e4", "e6", "d4", "d5"], "e5", "SPACE"); hasNot([], "e4", "SPACE");
const kwDef = fs.readFileSync(new URL("../src/components/keywordScroll.jsx", import.meta.url), "utf8");
ok(AUTO_KEYWORDS.every((k) => kwDef.includes('"' + k + '"')), "자동 키워드가 표시 색표(KW)에 없음");
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const all = ["src/app/analysis.jsx", "src/app/dex.jsx", "src/app/common.jsx"].map(rd).join("\n");
ok(!/KW_PAIRS|KW_SINGLES|kwDraft|toggleKw|kwOverride|deriveKeywords|CONTENT\.keywords\[/.test(all), "개발자 키워드 수동 지정 코드가 남아 있음(삭제 대상)");
ok(/kwAutoAll = autoMoveKeywords\(/.test(rd("src/app/common.jsx")), "assignTiers가 수 블록마다 자동 키워드 전부(kwAutoAll)를 붙이지 않음");
// (v0.7.8 BUG-180) 기준(전체/마스터)을 바꿔도 같은 수의 키워드가 같아야 한다 — 마스터 기준은 adopt가 마스터 채택률이고 후보 목록도 다르다.
{
  const { build } = await import("esbuild");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const ROOT = new URL("../", import.meta.url).pathname;
  const dir = mkdtempSync(join(ROOT, "node_modules/.kw-check-")), out = join(dir, "common.mjs");
  await build({ entryPoints: [join(ROOT, "src/app/common.jsx")], bundle: true, platform: "node", format: "esm", outfile: out, jsx: "automatic", logLevel: "error",
    loader: { ".jsx": "jsx", ".js": "jsx", ".png": "dataurl", ".json": "json", ".svg": "dataurl" }, external: ["react", "react-dom", "@supabase/*", "lucide-react", "chess.js"], define: { "import.meta.env": "{}" } });
  const C = await import(out);
  rmSync(dir, { recursive: true, force: true });
  const sans = ["e4", "e5", "Nf3", "Nc6"], board = boardFromSans(sans), key = sans.join(" ");   // 실제 이론 포지션(Bb5·Bc4·d4는 이론 수)
  // 백 관점 평가(cp) — 전체 목록: Bb5·Bc4·d4·Nc3, 마스터 목록: Bb5·Bc4·d4(Nc3 없음). 최선 0.3 이내 수가 전체 목록에서만 3개(→ 유연한 수),
  //  Bc4의 채택률은 전체 28%(메인 라인 아님) / 마스터 35%(예전 기준이면 메인 라인)로 갈린다. allAdopt(전체)는 같다.
  const ev = { Bb5: 40, Bc4: 15, d4: 0, Nc3: 20 };
  const allAd = { Bb5: 45, Bc4: 28, d4: 12, Nc3: 4 }, masAd = { Bb5: 55, Bc4: 35, d4: 10 };
  const mk = (list, ad) => list.map((san) => ({ san, live: { cp: ev[san] }, adopt: ad[san], allAdopt: allAd[san], masterAdopt: masAd[san] ?? null, masterTop: ["Bb5", "Bc4", "d4"].includes(san) }));
  const all = mk(["Bb5", "Bc4", "d4", "Nc3"], allAd), mas = mk(["Bb5", "Bc4", "d4"], masAd);
  const pool = [...all, ...mas];
  const kwOf = (rows) => Object.fromEntries(C.assignTiers(rows, sans.length, board, key, sans, pool).map((m) => [m.san, (m.kwAutoAll || []).join(",")]));
  const A = kwOf(all), M = kwOf(mas);
  for (const san of ["Bb5", "Bc4", "d4"]) ok(A[san] === M[san], "BUG-180 — " + san + " 키워드가 기준마다 다름: 전체 [" + A[san] + "] / 마스터 [" + M[san] + "]");
  // (v0.8.0, 사용자 요청) 최선·좋은 수에 LOW-LEVEL이 붙던 원인 — 엔진 탐색 도중의 임시 값(live.prov)이 키워드 비교에 섞였다.
  //  1.e4 뒤: c5·e5는 확정 평가(+0.30 근처), d5만 탐색 초반의 임시 값(흑 관점 +2.0)일 때 c5·e5에 LOW-LEVEL이 붙으면 안 된다.
  //  이론 밖 포지션(1.a3 h6 2.h3 a6, 백 차례): Nf3·g3는 확정 평가, Nc3만 탐색 초반의 임시 값(+2.0)일 때 Nf3·g3에 LOW-LEVEL이 붙으면 안 된다.
  { const s2 = ["a3", "h6", "h3", "a6"], b2 = boardFromSans(s2), k2 = s2.join(" ");
    const rows = [{ san: "Nf3", live: { cp: 30 }, allAdopt: 1 }, { san: "g3", live: { cp: 20 }, allAdopt: 1 }, { san: "Nc3", live: { cp: 200, prov: true }, allAdopt: 1 }];
    const r = Object.fromEntries(C.assignTiers(rows, 4, b2, k2, s2, rows, { liveOnly: true }).map((m) => [m.san, m.kwAutoAll || []]));
    ok(!r.Nf3.includes("LOW-LEVEL") && !r.g3.includes("LOW-LEVEL"), "임시 평가(prov)가 키워드 비교에 섞임 — Nf3 [" + r.Nf3 + "] / g3 [" + r.g3 + "]");
    // 다른 목록에 있던 낡은 임시 값이 묶음(kwPool)에 남아 있어도 마찬가지
    const pool = [...rows, { san: "e4", live: { cp: 300, prov: true } }];
    const r2 = Object.fromEntries(C.assignTiers(rows.slice(0, 2), 4, b2, k2, s2, pool, { liveOnly: true }).map((m) => [m.san, m.kwAutoAll || []]));
    ok(!r2.Nf3.includes("LOW-LEVEL"), "묶음의 임시 값이 기준이 됨 — Nf3 [" + r2.Nf3 + "]");
    // 라이브 분석 중엔 정적 스냅샷 평가(evalCp)를 비교에 섞지 않는다
    const r3 = Object.fromEntries(C.assignTiers([{ san: "Nf3", live: { cp: 30 } }, { san: "d4", evalCp: 400 }], 4, b2, k2, s2, [], { liveOnly: true }).map((m) => [m.san, m.kwAutoAll || []]));
    ok(!r3.Nf3.includes("LOW-LEVEL"), "라이브 분석 중 스냅샷 평가가 섞임 — Nf3 [" + r3.Nf3 + "]");
    // 확정 값끼리 실제로 1.5 이상 나쁘면 붙는다(규칙이 살아 있는지)
    const r4 = Object.fromEntries(C.assignTiers([{ san: "Nf3", live: { cp: 30 } }, { san: "g4", live: { cp: -200 } }], 4, b2, k2, s2, [], { liveOnly: true }).map((m) => [m.san, m.kwAutoAll || []]));
    ok(r4.g4.includes("LOW-LEVEL"), "확정 평가로 1.5 이상 나쁜 드문 수에 LOW-LEVEL이 안 붙음 [" + r4.g4 + "]"); }
  const anP = rd("src/app/analysis.jsx");
  ok(/allAdopt: normal \? \(normalAdoptBy\[k\] \?\? null\)/.test(anP) && /assignTiers\(uniq, ply, board, key, sans, \[\.\.\.kwPoolRef\.current\.by\.values\(\)\], \{ liveOnly: liveKw \}\)/.test(anP), "BUG-180 — 분석 탭이 키워드에 전체 채택률(allAdopt)·평가 합집합(kwPool)을 넘기지 않음");
}
if (fails.length) { console.error("✗ check-move-keywords 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-move-keywords: 수 블록 자동 키워드 규칙 " + AUTO_KEYWORDS.length + "종(맞는 것 전부 표시), 개발자 수동 지정 코드 없음");
