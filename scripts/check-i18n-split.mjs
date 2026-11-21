#!/usr/bin/env node
/** (v0.7.9 성능, 번역 파일 분할) 번역을 첫 화면용(core)·나머지(rest)로 나누는 규칙이 안전한지 검사한다(나누기 자체는 scripts/lib/i18nSplit.mjs).
 *  rest 문장은 afterFullCatalog로 감싼 화면이 열리기 직전에야 도착한다. 그래서 다음을 지킨다.
 *   1. 지연 화면 import(lazyScreens.jsx LOADERS, main.jsx의 /about·/faq·약관)는 모두 afterFullCatalog(() => import("…"))로 감싼다.
 *      감싸지 않으면 그 화면 문장은 core로 계산돼 안전하지만 rest를 기다리지 않는다 — 감싼 것만 "나중 영역"의 시작점이다.
 *   2. 게이트(afterFullCatalog) 시작점이 정확히 위 목록이다(다른 곳에서 새로 감싸면 여기 목록에도 넣는다).
 *   3. 첫 화면 쪽 소스(지연 영역 밖)에 나오는 문장은 rest에 들어가지 않는다 — 모든 언어에서 core ∪ rest = 전체, 겹침 없음.
 *   4. i18n.js가 core를 최상위 await로, rest를 loadFullCatalog로 받고, 5개 언어 모두 ?part=core·?part=rest 경로가 있다.
 *  실행: node scripts/check-i18n-split.mjs
 */
import { readFileSync } from "node:fs";
import { computeI18nSplit, splitCatalog } from "./lib/i18nSplit.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const rd = (p) => readFileSync(ROOT + p, "utf8");
const fails = [];

// 1·2. 게이트 시작점
const lazySrc = rd("src/app/lazyScreens.jsx"), mainSrc = rd("src/main.jsx");
const loaderLines = [...lazySrc.matchAll(/^\s*(\w+): (.*import\("\.\/[\w.]+"\).*),?$/gm)];
for (const [, key, body] of loaderLines) if (!/^afterFullCatalog\(\(\) => import\("\.\/[\w.]+"\)\),?$/.test(body.trim())) fails.push("lazyScreens.jsx " + key + ": afterFullCatalog(() => import(\"…\"))로 감싸지 않음");
for (const m of mainSrc.matchAll(/lazy\((.*?import\("\.\/(\w+)\.jsx"\).*?)\);/g)) if (!/^afterFullCatalog\(\(\) => import\(/.test(m[1])) fails.push("main.jsx " + m[2] + ": afterFullCatalog로 감싸지 않음");
const split = computeI18nSplit(ROOT);
const expected = new Set([
  ...[...lazySrc.matchAll(/import\("\.\/([\w.]+)"\)/g)].map((m) => "src/app/" + m[1]),
  ...[...mainSrc.matchAll(/import\("\.\/([\w.]+)"\)/g)].map((m) => "src/" + m[1]),
]);
const got = new Set(split.gatedStarts);
for (const f of expected) if (!got.has(f)) fails.push("게이트 시작점에 없음: " + f);
for (const f of got) if (!expected.has(f)) fails.push("예상하지 않은 게이트 시작점: " + f + " — lazyScreens.jsx·main.jsx 밖에서 afterFullCatalog를 쓰면 이 검사에 이유와 함께 추가할 것");

// 3. 언어별 분할
const rows = [];
for (const code of ["en", "es", "hi", "ja", "zh"]) {
  const full = (await import("../src/lib/i18n/" + code + ".js")).default;
  const { core, rest } = splitCatalog(full, split.isRest);
  const nk = Object.keys(full).length, nc = Object.keys(core).length, nr = Object.keys(rest).length;
  if (nc + nr !== nk || Object.keys(rest).some((k) => k in core)) fails.push(code + ": core ∪ rest ≠ 전체");
  if (!nr) fails.push(code + ": rest가 비어 있음 — 나누기 규칙이 동작하지 않음");
  const kb = (o) => Math.round(JSON.stringify(o).length / 1024);
  rows.push(code + " " + kb(core) + "KB+" + kb(rest) + "KB");
}
// 첫 화면 소스의 t("…") 문장이 rest로 가지 않는지 표본 확인(규칙상 불가능해야 한다).
const eagerSamples = [["src/app/shell.jsx", /\bt\("([^"\\]+)"/g], ["src/app/analysis.jsx", /\bt\("([^"\\]+)"/g], ["src/App.jsx", /\bt\("([^"\\]+)"/g]];
for (const [f, re] of eagerSamples) for (const m of rd(f).matchAll(re)) if (split.isRest(m[1])) { fails.push(f + "의 문장이 rest로 분류됨: " + m[1]); break; }

// 4. i18n.js 연결
const i18n = rd("src/lib/i18n.js");
for (const code of ["en", "hi", "ja", "zh", "es"]) for (const part of ["core", "rest"]) if (!i18n.includes('import("./i18n/' + code + '.js?part=' + part + '")')) fails.push("i18n.js: " + code + " " + part + " 경로 없음");
if (!/catalog = await loadCatalog\(lang\)/.test(i18n)) fails.push("i18n.js: core를 최상위 await로 받지 않음");
if (!/export const afterFullCatalog = \(load\) => \(\) => loadFullCatalog\(\)\.then\(load\)/.test(i18n)) fails.push("i18n.js: afterFullCatalog 정의가 바뀜");
if (!/i18nSplitPlugin\(/.test(rd("vite.config.js"))) fails.push("vite.config.js: i18nSplitPlugin이 없음(?part= 쿼리가 무시돼 두 조각 모두 전체 번역이 됨)");

if (fails.length) { console.error("✗ check-i18n-split 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-i18n-split: 게이트 시작점 " + got.size + "개, 지연 영역 " + split.lazyFiles.length + "개 파일, 첫 화면+나머지 " + rows.join(" · "));
