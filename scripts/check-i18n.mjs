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
import { GLOSSARY, LANG_CODES, GLOSSARY_EXEMPT, CASE_EXEMPT } from "../src/lib/i18n/glossary.js";

// 번역을 100% 요구하는 파일(src 기준 경로). 화면을 번역할 때마다 여기에 추가한다.
export const CORE_FILES = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(new URL("../src/lib/i18n/core-files.json", import.meta.url), "utf8")));

const fails = [], warns = [];
const { byFile, all, deferredAll, txKinds } = extractAll();
// ① 바인딩
for (const [f, r] of Object.entries(byFile)) r.badBinding.forEach((l) => fails.push(f + ":" + l + " — t()가 i18n.js의 t가 아니라 지역 변수를 가리킴(변수 이름을 바꿀 것)"));
// 키 검사 함수
const idx = (s) => { const out = new Set(); for (const m of s.matchAll(/\{(\d+)(?:[|:][^}]*)?\}/g)) out.add(m[1]); return out; };
const eqSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const gloss = GLOSSARY.map((g) => ({ ...g, re: new RegExp(g.ko) }));

// ── 표기 규칙(대소문자·문장부호·아이콘 자리표시자) ──
// 영어·스페인어: 문구는 대문자로 시작한다(문장 중간에 끼워 쓰는 조각·이름/숫자 뒤 문구는 glossary.js CASE_EXEMPT에 이유와 함께 등록).
const bodyOf = (v) => { let x = v, p; do { p = x; x = x.replace(/^[\s✓⚠•●○✕⬜⬛·:\-–—"“‘'(\[（¿¡]+/, "").replace(/^\{\d+\}/, ""); } while (x !== p); return x; };
const CJK_RE = "\u3040-\u30ff\u3400-\u9fff";
function styleCheck(code, k, v) {
  const out = [];
  // {0}…로 시작하는 문구는 {0}이 이름·숫자·날짜일 수 있어 여기서는 보지 않는다(아이콘이면 iconCheck가 따로 검사). 괄호·기호로 시작하는 덧붙임, chess.com·예시(e.g.)·cp 같은 고정 표기도 제외.
  if ((code === "en" || code === "es") && !/^\s*\{\d/.test(k) && !/^\s*[(·•●]/.test(v) && /^[a-záéíóúñ]/.test(bodyOf(v)) && !/^(chess\.com|e\.g\.|p\. ej\.|cp |[a-h][1-8x])/i.test(bodyOf(v)) && !CASE_EXEMPT.includes(k)) out.push("소문자로 시작(문장 조각이면 CASE_EXEMPT에 등록)");
  if ((code === "zh" || code === "ja") && !v.includes("Φ(")) { // 수식(Φ(…))은 반각 괄호를 그대로 둔다
    if (new RegExp("[" + CJK_RE + "）」』”’][,?!:;]").test(v) || new RegExp("[" + CJK_RE + "）」』”’]\\.(\\s|$)").test(v)) out.push("한자·가나 옆에 반각 문장부호(, ? ! : ; .) — 전각(，？！：；。)으로");
    if (new RegExp("[,][ ]?[" + CJK_RE + "]").test(v)) out.push("한자·가나 바로 앞의 쉼표는 전각(，/、)으로");
    if (new RegExp("^[ ]?:[ ]?[" + CJK_RE + "]").test(v)) out.push("문구 앞머리 콜론은 전각(：)으로");
    if (new RegExp("\\([^()]*[" + CJK_RE + "][^()]*\\)").test(v)) out.push("한자·가나가 든 괄호는 전각 （ ）로");
  }
  if (code === "hi" && /[\u0900-\u097f]\.(\s|$)/.test(v)) out.push("힌디어 문장 끝은 '।'(마침표 . 아님)");
  if (code === "es") { if (/\?\s*$/.test(v) && !/¿/.test(v)) out.push("스페인어 의문문은 ¿…? 로 감쌀 것"); if (/!\s*$/.test(v) && !/¡/.test(v)) out.push("스페인어 감탄문은 ¡…! 로 감쌀 것"); }
  return out;
}
// tx()에 아이콘(lucide)이 끼워진 자리표시자: 번역은 그 자리표시자를 빼먹거나 숫자·이름처럼 다루면 안 된다
// (아이콘은 글자도 숫자도 아님: "{0} 분석"의 {0}을 "{0} 분석(명사)"로 옮기거나 "{0}수"의 복수형 표지에 쓰면 화면이 깨진다).
function iconCheck(k, v, code) {
  const kinds = txKinds.get(k); if (!kinds) return [];
  const out = [];
  kinds.forEach((kd, i) => {
    if (kd === "str" && new RegExp("\\{" + i + "\\|").test(v)) out.push("문자열(이름·문구) 자리표시자 {" + i + "}를 복수형 표지에 사용 — 숫자가 아님");
    if (kd !== "icon") return;
    if (!v.includes("{" + i + "}")) out.push("아이콘 자리표시자 {" + i + "}가 빠짐");
    if (new RegExp("\\{" + i + "\\|").test(v)) out.push("아이콘 자리표시자 {" + i + "}를 복수형 표지에 사용");
    if (i === 0 && k.startsWith("{0}") && !/^\s*\{0\}/.test(v)) out.push("원문처럼 아이콘({0})으로 시작해야 함");
    if (i === 0 && (code === "en" || code === "es") && /^\s*\{0\}\s*[a-záéíóúñ]/.test(v)) out.push("아이콘 뒤 문구는 대문자로 시작");
  });
  return out;
}
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
    for (const msg of styleCheck(code, k, v)) fails.push(code + " — 표기: " + msg + ": " + JSON.stringify(k.slice(0, 36)) + " → " + JSON.stringify(v.slice(0, 50)));
    for (const msg of iconCheck(k, v, code)) fails.push(code + " — 아이콘: " + msg + ": " + JSON.stringify(k.slice(0, 36)) + " → " + JSON.stringify(v.slice(0, 50)));
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
if (fails.length) { console.error("check-i18n 실패 (" + fails.length + "건):\n  " + fails.slice(0, 400).join("\n  ") + (fails.length > 400 ? "\n  … 외 " + (fails.length - 400) + "건" : "")); process.exit(1); }
console.log("✔ check-i18n: 키 " + total + "개(보류한 대형 콘텐츠 " + deferredAll.size + "개 별도) · " + lines.join(" · ") + " · 핵심 화면 " + CORE_FILES.length + "개 파일(" + coreKeys + "키) 전 언어 100%");
