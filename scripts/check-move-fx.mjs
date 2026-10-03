#!/usr/bin/env node
/** (v0.6.3, 수 등급 이펙트 전 등급 + 표시 범위 선택) 안전장치
 *  ① 수 체계 아이콘이 있는 모든 등급(BADGE_ICON_SRC)에 이펙트(MOVE_FX)·색(QCOLOR)·기호 이미지(public/move-fx/)가 있다 — 등급이 늘면 여기서 걸린다.
 *  ② 표시 범위 판정(moveFxKindOn)·저장값 이어받기(moveFxModeFromSaved)·정규화가 맞다 — 예전 불리언 moveFxOn(false=끔) 저장값 호환.
 *  ③ Board·퍼즐·무한 체크메이트가 `MOVE_FX[kind]` 직접 조회 대신 moveFxKindOn으로 이펙트 재생 여부를 정하고, 설정 탭은 토글이 아니라 선택 박스다.
 *  실행: node scripts/check-move-fx.mjs */
import { readFileSync, existsSync, readdirSync } from "node:fs";
const fails = [];
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(m + ": " + JSON.stringify(a) + " ≠ " + JSON.stringify(b)); };
const P = await import("../src/lib/moveFxPrefs.js");
const { BADGE_ICON_SRC, QCOLOR } = await import("../src/lib/moveKinds.js");
const common = readFileSync("src/app/common.jsx", "utf8");
// ① 등급 ↔ 이펙트 정의
const fxBlock = common.match(/export const MOVE_FX = \{([\s\S]*?)\n\};/)[1];
const fxKeys = [...fxBlock.matchAll(/^\s{2}(\w+): \{ label: t\("([^"]+)"\), src: "(\/move-fx\/[\w.-]+)", glyph: ([\d.]+) \}/gm)];
eq(fxKeys.map((m) => m[1]).sort(), Object.keys(BADGE_ICON_SRC).sort(), "MOVE_FX 등급이 수 체계 아이콘 등급과 다름");
eq([...P.MOVE_FX_KINDS].sort(), Object.keys(BADGE_ICON_SRC).sort(), "moveFxPrefs.MOVE_FX_KINDS가 수 체계 아이콘 등급과 다름");
for (const m of fxKeys) {
  if (!QCOLOR[m[1]]) fails.push(m[1] + ": QCOLOR 색 없음");
  if (!existsSync("public" + m[3])) fails.push(m[1] + ": 기호 이미지 없음 " + m[3]);
  const g = parseFloat(m[4]); if (!(g >= 0.4 && g <= 0.8)) fails.push(m[1] + ": glyph 비율(" + g + ")이 범위 밖");
}
const files = readdirSync("public/move-fx"); for (const f of files) if (!fxKeys.some((m) => m[3] === "/move-fx/" + f)) fails.push("public/move-fx/" + f + "를 쓰는 이펙트 정의가 없음(안 쓰는 파일은 지울 것)");
// ② 판정
for (const k of P.MOVE_FX_KINDS) { eq(P.moveFxKindOn("all", k), true, "all/" + k); eq(P.moveFxKindOn("off", k), false, "off/" + k); eq(P.moveFxKindOn("key", k), k === "brilliant" || k === "only", "key/" + k); }
eq(P.moveFxKindOn("all", "pending"), false, "계산 중(pending)은 이펙트 없음"); eq(P.moveFxKindOn("all", undefined), false, "등급 없음");
eq(P.moveFxKindOn(undefined, "best"), true, "모드 미지정은 모두 표시(기본)");
eq(P.normalizeMoveFxMode("key"), "key", "정규화 key"); eq(P.normalizeMoveFxMode("x"), "all", "알 수 없는 값은 기본값"); eq(P.normalizeMoveFxMode(undefined), "all", "미지정 기본값");
eq(P.moveFxModeFromSaved({ moveFxMode: "key" }), "key", "새 저장값"); eq(P.moveFxModeFromSaved({ moveFxOn: false }), "off", "예전 꺼짐 저장값 → off");
eq(P.moveFxModeFromSaved({ moveFxOn: true }), null, "예전 켜짐 저장값 → 기본값 유지"); eq(P.moveFxModeFromSaved({ moveFxMode: "off", moveFxOn: true }), "off", "새 값이 우선");
eq(P.moveFxModeFromSaved({ moveFxMode: "bad" }), null, "잘못된 값 무시"); eq(P.moveFxModeFromSaved(null), null, "저장값 없음");
// ③ 연결
const noComments = (t) => t.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const play = readFileSync("src/app/play.jsx", "utf8"), puz = readFileSync("src/app/puzzle.jsx", "utf8"), set = noComments(readFileSync("src/app/settings.jsx", "utf8")), app = noComments(readFileSync("src/App.jsx", "utf8"));
for (const [n, src] of [["play.jsx", play], ["puzzle.jsx", puz]]) if (/MOVE_FX\[/.test(src)) fails.push(n + "이 MOVE_FX[등급]을 직접 조회함 — moveFxKindOn(모드, 등급)을 쓸 것(표시 범위 설정이 안 먹음)");
if (!/!moveFxKindOn\(moveFxMode, lastQ\.kind\)/.test(common)) fails.push("Board가 moveFxKindOn으로 이펙트 재생을 정하지 않음");
if (/MOVE_FX\[lastQ\.kind\]/.test(common)) fails.push("Board가 MOVE_FX[lastQ.kind]를 직접 조회함");
if (!/id="move-fx-mode"/.test(set) || /setMoveFxOn/.test(set) || /setMoveFxOn|moveFxOn\b/.test(app)) fails.push("설정 탭·App이 토글(moveFxOn)이 아니라 표시 범위(moveFxMode) 선택 박스를 쓰지 않음");
if (!/moveFxModeFromSaved\(d\)/.test(app) || !/moveFxModeFromSaved\(pr\)/.test(app)) fails.push("App이 로컬·서버 저장값(예전 moveFxOn 포함)을 moveFxModeFromSaved로 읽지 않음");
if (!/mgDangerOn, moveFxMode \}/.test(app)) fails.push("App이 moveFxMode를 저장하지 않음");
if (fails.length) { console.error("✖ check-move-fx 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-move-fx: 수 등급 " + P.MOVE_FX_KINDS.length + "종 이펙트·색·기호 이미지, 표시 범위 판정·예전 저장값 호환, Board·퍼즐·체크메이트·설정 연결이 유지된다");
