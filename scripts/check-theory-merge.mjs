#!/usr/bin/env node
/** (v0.5.6 재발 방지, BUGS.md BUG-015) 개발자가 추가한 이론 수가 화면마다 다르게(이론/비이론) 보이지 않도록 지키는 검사.
 *
 *  원인이었던 세 가지가 다시 들어오면 빌드를 멈춘다.
 *   1) 개발자 추가 수(addsFor/treeAdds)를 후보 목록에 { san: a.san, dev: true }처럼 이론 여부 없이 직접 끼워 넣는 코드
 *      → 반드시 devAddEntry(key, a) / mergeDevAdds(key, list)를 쓴다(이론 여부는 isBookMoveAt 하나가 정한다).
 *   2) assignTiers가 이론 판정을 isBookMoveAt이 아니라 스냅샷 book 플래그(m.book)만으로 하는 것
 *   3) forceKindFor가 체크·메이트 기호(+, #)를 떼고 다시 찾지 않는 것
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-theory-merge.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = new URL("..", import.meta.url).pathname;
const problems = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|mjs)$/.test(e.name)) {
      fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
        const code = line.trim();
        if (code.startsWith("//") || code.startsWith("*")) return;
        if (/push\(\s*\{\s*san:\s*a\.san\b/.test(code) && !/function devAddEntry/.test(code)) problems.push(path.relative(root, p) + ":" + (i + 1) + " — 개발자 추가 수를 devAddEntry 없이 직접 끼워 넣음");
      });
    }
  }
};
walk(path.join(root, "src"));

const app = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
// 함수 본문 — 중괄호 짝을 세어 정확히 그 함수만 잘라낸다(한 줄짜리 함수 포함).
const body = (name) => {
  const i = app.indexOf("function " + name + "(");
  if (i < 0) return null;
  const open = app.indexOf("{", app.indexOf(")", i));
  let depth = 0;
  for (let k = open; k < app.length; k++) {
    if (app[k] === "{") depth++;
    else if (app[k] === "}" && --depth === 0) return app.slice(i, k + 1);
  }
  return null;
};
const tiers = body("assignTiers");
if (!tiers) problems.push("src/App.jsx — assignTiers를 찾지 못함");
else if (!/isBookMoveAt\(keyStr,\s*m\.san\)/.test(tiers)) problems.push("src/App.jsx assignTiers — 이론 판정을 isBookMoveAt(keyStr, m.san)으로 하지 않음");
const fk = body("forceKindFor");
if (!fk) problems.push("src/App.jsx — forceKindFor를 찾지 못함");
else if (!/stripSuffix\(/.test(fk)) problems.push("src/App.jsx forceKindFor — 체크·메이트 기호를 뗀 표기로 다시 찾지 않음");
if (!body("devAddEntry") || !/isBookMoveAt\(/.test(body("devAddEntry") || "")) problems.push("src/App.jsx — devAddEntry가 없거나 이론 여부를 isBookMoveAt으로 정하지 않음");

if (problems.length) {
  console.error("✗ 이론 수 병합 검사 실패(BUGS.md BUG-015):");
  problems.forEach((p) => console.error("  · " + p));
  process.exit(1);
}
console.log("✓ theory merge check: 개발자 추가 수는 devAddEntry로만 병합, 이론 판정은 isBookMoveAt 하나로");
