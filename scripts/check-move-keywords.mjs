#!/usr/bin/env node
/** (v0.7.6, 사용자 요청) 수 키워드 자동 부여(src/lib/moveKeywords.js) — 수 블록마다 포지션을 분석해 키워드 하나. 개발자 수동 지정 코드가 되살아나지 않는지도 본다.
 *  실행: node scripts/check-move-keywords.mjs (prebuild로 자동 실행) */
import fs from "node:fs";
import { autoMoveKeyword, blockKeywords, AUTO_KEYWORDS } from "../src/lib/moveKeywords.js";
import { boardFromSans } from "../src/lib/chessRules.js";
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const kw = (sans, san, extra = {}) => autoMoveKeyword({ san, color: sans.length % 2 === 0 ? "w" : "b", board: boardFromSans(sans), ...extra });
ok(kw([], "Nf3", { lossCp: 10 }) === "INTUITIVE", "첫 줄 나이트 발전 → INTUITIVE");
ok(kw(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"], "O-O", { lossCp: 0 }) === "INTUITIVE", "캐슬링 → INTUITIVE");
ok(kw(["e4", "d5"], "exd5", { lossCp: 0 }) === "STRAIGHT-LINE", "기물 잡기 → STRAIGHT-LINE");
ok(kw(["e4", "e5", "Bc4", "Nc6"], "Bxf7+", { lossCp: 200 }) === "LOW-LEVEL", "최선보다 1.5 이상 나쁨 → LOW-LEVEL");
ok(kw(["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6"], "Qxf7#", { lossCp: 0 }) === "SHARP", "체크메이트 → SHARP");
ok(kw([], "e4", { lossCp: 0, isBest: true, masterAdopt: 40 }) === "TOP LEVEL", "평가 1위 + 마스터 선호 → TOP LEVEL");
ok(kw([], "e4", { lossCp: 0, book: true, adopt: 45 }) === "MAIN-LINE", "많이 두는 이론 수 → MAIN-LINE");
ok(kw([], "a3", { lossCp: 40, book: true, adopt: 1 }) === "SIDESTEPPING", "드문 이론 수 → SIDESTEPPING");
ok(kw([], "d3", { lossCp: 20 }) === "QUIET", "최선에 가까운 조용한 수 → QUIET");
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
