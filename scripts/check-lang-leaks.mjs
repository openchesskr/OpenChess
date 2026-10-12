#!/usr/bin/env node
/** (v0.6.5, BUG-070·071) 언어 전환 시 화면이 깨지는 두 종류의 결함을 막는 검사(prebuild).
 *  ① 번역 누수: 번역 대상 화면(core-files.json)의 소스에서 t()/tx() 밖에 한글 문자열이 들어 있으면 영어·스페인어 등 다른 언어 화면에 한글이 그대로 샌다
 *     (예: formatDiff가 "1.2" + "배"로 붙여 영어 화면에 "1.2배"가 남았다 — check-i18n은 t() 안의 키만 보기 때문에 이런 이어 붙이기를 못 잡는다).
 *     - 과거 코드에 이미 있는 건수는 scripts/lang-leaks-baseline.json에 파일별로 기록해 두고(레슨·퀴즈 데이터, 동적 t(변수) 키 등 오탐 포함), 그보다 늘면 실패한다(래칫).
 *       줄여서 고쳤다면 --update로 기준선을 낮춘다. 기준선이 없는 파일은 0건이어야 한다 — 새 파일은 처음부터 깨끗해야 한다.
 *     - 개발자 전용 함수(dev-only.json의 functions)는 제외한다.
 *  ② 고정 폭 열: 번역 문구가 들어가는 표(성장 분석 기준별 비교)는 한국어 글자 수에 맞춘 고정 px 열을 쓰지 않는다 — 영어 "Almost the same"처럼 긴 문구가 칸 밖으로 넘친다.
 *     숫자 열은 auto, 문구 열은 minmax(0,1fr)로 두고, 판정 알약은 열이 아니라 라벨 아래에 둔다.
 *  실행: node scripts/check-lang-leaks.mjs [--update]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const parser = require("@babel/parser"); const traverse = require("@babel/traverse").default;
const root = new URL("../src/", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), "utf8");
const core = JSON.parse(read("lib/i18n/core-files.json"));
const devFn = new Set(JSON.parse(read("lib/i18n/dev-only.json")).functions);
const baselineUrl = new URL("./lang-leaks-baseline.json", import.meta.url);
const update = process.argv.includes("--update");
let baseline = {}; try { baseline = JSON.parse(readFileSync(baselineUrl, "utf8")); } catch { /* 처음 */ }
const HANGUL = /[가-힣]/;

/** 소스에서 t()/tx()의 첫 인자가 아닌 한글 문자열(문자열·템플릿·JSX 글자)의 위치 목록. */
function findLeaks(src) {
  const ast = parser.parse(src, { sourceType: "module", plugins: ["jsx"] });
  const hits = [];
  traverse(ast, {
    "StringLiteral|TemplateElement|JSXText"(p) {
      const n = p.node, v = n.type === "TemplateElement" ? n.value.cooked : n.value;
      if (!v || !HANGUL.test(v)) return;
      const par = p.parent;
      if (/^(ImportDeclaration|ExportNamedDeclaration|ExportAllDeclaration)$/.test(par.type)) return;
      if (par.type === "CallExpression" && par.callee.type === "Identifier" && (par.callee.name === "t" || par.callee.name === "tx") && par.arguments[0] === n) return;
      if (par.type === "ObjectProperty" && par.key === n) return;
      const fn = p.findParent((x) => x.isFunctionDeclaration() && x.parentPath.isProgram());
      if (fn && fn.node.id && devFn.has(fn.node.id.name)) return;
      hits.push({ line: n.loc.start.line, text: v.trim().slice(0, 50) });
    },
  });
  return hits;
}

const fails = [], counts = {};
for (const f of core) {
  const hits = findLeaks(read(f)); counts[f] = hits.length;
  const base = baseline[f] ?? 0;
  if (hits.length > base) fails.push(f + ": t() 밖의 한글 " + hits.length + "건(기준 " + base + ") — 다른 언어 화면에 한글이 샌다. t()로 감싸 번역을 추가할 것\n      " + hits.slice(-(hits.length - base)).slice(0, 6).map((h) => h.line + ": " + h.text).join("\n      "));
}
// ② 고정 폭 열
const growth = read("app/growth.jsx");
const layoutFails = [];
for (const m of growth.matchAll(/gridTemplateColumns:\s*"([^"]*)"/g)) if (!/repeat\(/.test(m[1]) && /\b\d+px\b/.test(m[1])) layoutFails.push("app/growth.jsx: 고정 px 열 \"" + m[1] + "\" — 언어에 따라 문구가 넘친다(auto 또는 minmax(0,1fr) 사용)");
if (!/className="growth-crit-table"/.test(growth)) layoutFails.push("app/growth.jsx: 기준별 비교 표(growth-crit-table)가 없음");
fails.push(...layoutFails);

if (update) {
  const next = {}; for (const [f, c] of Object.entries(counts)) if (c > 0) next[f] = c;
  writeFileSync(baselineUrl, JSON.stringify(next, null, 1) + "\n");
  console.log("기준선 갱신: " + Object.keys(next).length + "개 파일, 합계 " + Object.values(next).reduce((a, b) => a + b, 0) + "건");
  process.exit(layoutFails.length ? 1 : 0);
}
const better = Object.entries(baseline).filter(([f, b]) => (counts[f] ?? 0) < b);
if (fails.length) { console.error("✖ check-lang-leaks 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-lang-leaks: 번역 대상 " + core.length + "개 파일에서 t() 밖 한글이 기준선을 넘지 않고, 기준별 비교 표에 고정 px 열이 없다" + (better.length ? " (줄어든 파일 " + better.length + "개 — --update로 기준선을 낮출 수 있음)" : ""));
