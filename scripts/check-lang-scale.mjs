#!/usr/bin/env node
/** (v0.6.2) 언어별 글자 크기 보정 검사 — 한국어 외 언어에서 UI가 글자 길이 때문에 일그러지던 문제의 안전장치(prebuild).
 *  ① 배율: 한국어 1, 그 외 모든 언어는 0.8~1 미만(줄이되 너무 작아지지 않게), 지원 언어(LANGS)마다 배율이 있다.
 *  ② 보정 함수: 숫자·"12px"·clamp(...px...) 보정, 8px 아래로는 안 줄이고, rem/em·한국어(1)는 그대로, DOM 요소와 motion 요소만 보정하고 일반 컴포넌트는 건드리지 않는다(이중 보정 방지).
 *  ③ 연결: vite.config.js가 jsxImportSource로 src/lib/jsx 런타임을 쓰고, 그 런타임이 scaleProps를 거친다 — 이게 끊기면 보정이 조용히 사라진다.
 *  실행: node scripts/check-lang-scale.mjs
 */
import { readFileSync } from "node:fs";
import { LANG_FONT_SCALE, MIN_SCALED_PX, scaleFontSize, scaleProps } from "../src/lib/langScale.js";
const fails = [];
const i18n = readFileSync(new URL("../src/lib/i18n.js", import.meta.url), "utf8");
const codes = [...i18n.matchAll(/\{ code: "(\w+)"/g)].map((m) => m[1]);
for (const c of codes) {
  const v = LANG_FONT_SCALE[c];
  if (v == null) { fails.push("LANG_FONT_SCALE에 " + c + " 배율이 없음"); continue; }
  if (c === "ko" ? v !== 1 : !(v >= 0.8 && v < 1)) fails.push(c + " 배율(" + v + ")이 범위를 벗어남 — ko는 1, 그 외는 0.8 이상 1 미만");
}
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(m + ": " + JSON.stringify(a) + " ≠ " + JSON.stringify(b)); };
eq(scaleFontSize(12, 0.85), 10.2, "숫자 보정");
eq(scaleFontSize("12px", 0.5), "8px", "문자열 px 보정(최소 " + MIN_SCALED_PX + "px)");
eq(scaleFontSize(7, 0.5), 7, "원래 8px 이하는 그대로");
eq(scaleFontSize("clamp(9px, 2.2cqw, 14px)", 0.9), "clamp(8.1px, 2.2cqw, 12.6px)", "clamp 안의 px 보정");
eq(scaleFontSize("1.2rem", 0.8), "1.2rem", "rem은 그대로");
eq(scaleFontSize(20, 1), 20, "배율 1(한국어)은 그대로");
const p = { style: { fontSize: 20, color: "red" } };
eq(scaleProps("div", p, 0.9).style, { fontSize: 18, color: "red" }, "DOM 요소 보정");
if (p.style.fontSize !== 20) fails.push("원본 props를 바꿈(불변이어야 함)");
eq(scaleProps(function Comp() { }, p, 0.9) === p, true, "일반 컴포넌트는 보정하지 않음(이중 보정 방지)");
const motionLike = { [Symbol.for("motionComponentSymbol")]: true };
eq(scaleProps(motionLike, p, 0.9).style.fontSize, 18, "motion 요소 보정");
eq(scaleProps("div", { style: { color: "red" } }, 0.9).style, { color: "red" }, "fontSize 없는 style은 그대로");
const vite = readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
if (!/jsxImportSource: "oc-jsx"/.test(vite)) fails.push("vite.config.js가 jsxImportSource로 언어 보정 런타임을 쓰지 않음");
if (!/oc-jsx\\\/jsx-runtime/.test(vite) || !/oc-jsx\\\/jsx-dev-runtime/.test(vite)) fails.push("vite.config.js에 oc-jsx 런타임 alias가 없음");
const rt = readFileSync(new URL("../src/lib/jsx/scaled-runtime.js", import.meta.url), "utf8");
const dev = readFileSync(new URL("../src/lib/jsx/jsx-dev-runtime.js", import.meta.url), "utf8");
if (!/scaleProps\(type, props, SCALE\)/.test(rt) || !/scaleProps\(type, props, SCALE\)/.test(dev)) fails.push("JSX 런타임이 scaleProps를 거치지 않음");
if (!/--oc-fs-scale/.test(readFileSync(new URL("../src/index.css", import.meta.url), "utf8"))) fails.push("index.css에 글자 크기를 안 준 요소용 보정 규칙이 없음");
if (fails.length) { console.error("✖ check-lang-scale 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-lang-scale: 한국어 외 " + (codes.length - 1) + "개 언어의 글자 크기 배율·보정 함수·JSX 런타임 연결이 유지된다");
