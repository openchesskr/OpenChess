#!/usr/bin/env node
/** (v0.7.6, 사용자 요청) 수 키워드 자동 부여(src/lib/moveKeywords.js) — 수 블록마다 포지션을 분석해 키워드 하나. 개발자 수동 지정 코드가 되살아나지 않는지도 본다.
 *  실행: node scripts/check-move-keywords.mjs (prebuild로 자동 실행) */
import fs from "node:fs";
import { autoMoveKeyword, blockKeywords, AUTO_KEYWORDS } from "../src/lib/moveKeywords.js";
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
ok(blockKeywords({ kwAuto: "QUIET", kw: ["TOP LEVEL", "NORMAL"] }).join() === "QUIET", "표시는 자동 키워드 하나만(예전 kw 무시)");
ok(blockKeywords({ kw: ["TOP LEVEL"] }).length === 0, "자동 키워드가 없으면 표시하지 않음");
const kwDef = fs.readFileSync(new URL("../src/components/keywordScroll.jsx", import.meta.url), "utf8");
ok(AUTO_KEYWORDS.every((k) => kwDef.includes('"' + k + '"')), "자동 키워드가 표시 색표(KW)에 없음");
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const all = ["src/app/analysis.jsx", "src/app/dex.jsx", "src/app/common.jsx"].map(rd).join("\n");
ok(!/KW_PAIRS|KW_SINGLES|kwDraft|toggleKw|kwOverride|deriveKeywords|CONTENT\.keywords\[/.test(all), "개발자 키워드 수동 지정 코드가 남아 있음(삭제 대상)");
ok(/kwAuto: autoMoveKeyword\(/.test(rd("src/app/common.jsx")), "assignTiers가 수 블록마다 자동 키워드(kwAuto)를 붙이지 않음");
if (fails.length) { console.error("✗ check-move-keywords 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-move-keywords: 수 블록 자동 키워드(1개) 규칙 " + AUTO_KEYWORDS.length + "종, 개발자 수동 지정 코드 없음");
