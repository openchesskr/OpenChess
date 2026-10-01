#!/usr/bin/env node
/** (v0.7.0, 다국어) 번역이 깨지지 않게 지키는 검사.
 *   ① t()/tx()가 i18n.js의 t를 실제로 부르는지 — 지역 변수 t(예: .map((t) => …))가 가리면 번역 호출이 엉뚱한 값을 부르다 화면이 죽는다.
 *   ② 번역 파일(src/lib/i18n/<언어>.js)의 모든 값이: 자리표시자({0}…)가 원문과 같은 번호를 쓰고, 한글이 섞여 있지 않고, 원문 그대로 복사가 아니고,
 *      체스 용어집(glossary.js)의 표준 표기를 쓴다 — 원문에 "블런더"가 있으면 번역에 그 언어의 Blunder 표기가 있어야 한다.
 *   ③ 번역 파일에 소스에 없는 키(원문이 바뀌어 남은 번역)가 있으면 경고.
 *   ④ CORE_FILES에 든 화면은 모든 언어가 100% 번역돼 있어야 한다(미번역 키가 있으면 실패). 나머지 화면은 현황만 보여준다 — 번역이 없으면 한국어 원문이 그대로 나온다.
 *  새 문구를 쓸 때: t("한국어 문구")로 쓰고 5개 언어 파일에 번역을 넣는다. 용어는 glossary.js의 표기를 쓴다.
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-i18n.mjs [--report]
 */
import { extractAll } from "./lib/i18nKeys.mjs";
import { GLOSSARY, LANG_CODES } from "../src/lib/i18n/glossary.js";

// 번역을 100% 요구하는 파일(src 기준 경로). 화면을 번역할 때마다 여기에 추가한다.
export const CORE_FILES = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(new URL("../src/lib/i18n/core-files.json", import.meta.url), "utf8")));
// 용어집이 오탐하는 경우만 적는다: { "원문 키": ["용어 id", …] } — 이유를 주석으로 남길 것.
const GLOSSARY_EXEMPT = {};

const fails = [], warns = [];
const { byFile, all } = extractAll();
// ① 바인딩
for (const [f, r] of Object.entries(byFile)) r.badBinding.forEach((l) => fails.push(f + ":" + l + " — t()가 i18n.js의 t가 아니라 지역 변수를 가리킴(변수 이름을 바꿀 것)"));
// 키 검사 함수
const idx = (s) => { const out = new Set(); for (const m of s.matchAll(/\{(\d+)(?:[|:][^}]*)?\}/g)) out.add(m[1]); return out; };
const eqSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const gloss = GLOSSARY.map((g) => ({ ...g, re: new RegExp(g.ko) }));
const coverage = {};
for (const code of LANG_CODES) {
  const cat = (await import("../src/lib/i18n/" + code + ".js")).default;
  let done = 0;
  for (const [k, v] of Object.entries(cat)) {
    if (typeof v !== "string" || !v) { fails.push(code + " — 빈 번역: " + k.slice(0, 40)); continue; }
    if (!all.has(k)) { warns.push(code + " — 소스에 없는 키(오래된 번역): " + k.slice(0, 50)); continue; }
    if (!eqSet(idx(k), idx(v))) fails.push(code + " — 자리표시자 불일치: " + JSON.stringify(k.slice(0, 40)) + " → " + JSON.stringify(v.slice(0, 50)));
    if (/[가-힣]/.test(v)) fails.push(code + " — 번역에 한글이 섞임: " + JSON.stringify(k.slice(0, 30)) + " → " + JSON.stringify(v.slice(0, 50)));
    if (v === k) fails.push(code + " — 원문 그대로 복사: " + JSON.stringify(k.slice(0, 40)));
    const ex = GLOSSARY_EXEMPT[k] || [];
    for (const g of gloss) {
      if (ex.includes(g.id) || !g.re.test(k)) continue;
      const accepted = g[code]; const lv = v.toLowerCase();
      if (!accepted.some((a) => lv.includes(a.toLowerCase()))) fails.push(code + " — 용어집 위반[" + g.id + "]: " + JSON.stringify(k.slice(0, 40)) + " → " + JSON.stringify(v.slice(0, 60)) + "  (표준: " + accepted[0] + ")");
    }
    done++;
  }
  coverage[code] = { cat, done };
}
// ④ 핵심 화면 100%
let coreKeys = 0;
for (const f of CORE_FILES) {
  const r = byFile[f]; if (!r) { fails.push("CORE_FILES에 없는 파일: " + f); continue; }
  for (const k of r.keys.keys()) { coreKeys++; for (const code of LANG_CODES) if (!coverage[code].cat[k]) fails.push(code + " — 핵심 화면 미번역(" + f + "): " + JSON.stringify(k.slice(0, 50))); }
}
// 현황
const total = all.size;
const lines = LANG_CODES.map((c) => c + " " + coverage[c].done + "/" + total + " (" + Math.round((coverage[c].done / total) * 100) + "%)");
const perFile = Object.entries(byFile).filter(([, r]) => r.keys.size).map(([f, r]) => { const miss = [...r.keys.keys()].filter((k) => !LANG_CODES.every((c) => coverage[c].cat[k])).length; return [f, r.keys.size, miss]; });
if (process.argv.includes("--report")) { console.log("파일별 미번역(어느 한 언어라도 없는 키):"); perFile.sort((a, b) => b[2] - a[2]).forEach(([f, n, m]) => console.log("  " + String(m).padStart(5) + " / " + String(n).padStart(5) + "  " + f + (CORE_FILES.includes(f) ? "  [핵심]" : ""))); }
warns.slice(0, 15).forEach((w) => console.warn("경고 " + w)); if (warns.length > 15) console.warn("경고 … 외 " + (warns.length - 15) + "건");
if (fails.length) { console.error("check-i18n 실패 (" + fails.length + "건):\n  " + fails.slice(0, 60).join("\n  ") + (fails.length > 60 ? "\n  … 외 " + (fails.length - 60) + "건" : "")); process.exit(1); }
console.log("✔ check-i18n: 키 " + total + "개 · " + lines.join(" · ") + " · 핵심 화면 " + CORE_FILES.length + "개 파일(" + coreKeys + "키) 전 언어 100%");
