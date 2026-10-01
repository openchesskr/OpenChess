#!/usr/bin/env node
/** (v0.6.0, App.jsx 분할) src/App.jsx를 src/app/*.jsx(탭·기능별 파일)로 나눈 구조를 지킨다.
 *  · 파일 사이 import 순환 금지 — 순환이 생기면 모듈 최상위에서 먼저 쓰는 const가 아직 초기화되지 않아(TDZ) 화면이 통째로 안 뜬다.
 *  · common.jsx(여러 탭이 같이 쓰는 코드)는 탭·기능 파일을 import하지 않는다(탭 파일이 common을 import하는 방향만 허용).
 *  · App.jsx는 맨 위(진입)라 아무도 import하지 않는다. App.jsx가 다시 커지지 않게 줄 수 상한을 둔다.
 *  새 기능은 해당 탭 파일에, 여러 탭이 쓰면 common.jsx에 둔다. 상세는 REFACTOR_NOTES.md Phase 3.
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-app-split.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const MAX_APP_LINES = 3000;
const files = { "App.jsx": join(SRC, "App.jsx") };
for (const f of readdirSync(join(SRC, "app"))) if (/\.jsx?$/.test(f)) files["app/" + f] = join(SRC, "app", f);
const fails = [];
const graph = new Map();
for (const [name, path] of Object.entries(files)) {
  const text = readFileSync(path, "utf8");
  const deps = new Set();
  for (const m of text.matchAll(/^import[^;]*?from\s+"(\.[^"]+)";/gms)) {
    const target = join(path, "..", m[1]);
    for (const [n2, p2] of Object.entries(files)) if (p2 === target) deps.add(n2);
    if (/(^|\/)App\.jsx$/.test(m[1]) && name !== "main.jsx") fails.push(name + " — App.jsx를 import함(진입 파일은 아무도 import하지 않는다)");
  }
  graph.set(name, deps);
  if (name === "App.jsx" && text.split("\n").length > MAX_APP_LINES) fails.push("App.jsx " + text.split("\n").length + "줄 — " + MAX_APP_LINES + "줄 초과. 새 코드는 src/app/ 파일에 둔다");
}
const common = graph.get("app/common.jsx") || new Set();
for (const d of common) if (d !== "app/changelog.js") fails.push("app/common.jsx가 " + d + "를 import함(공용 파일은 탭·기능 파일을 import하지 않는다)");
// 순환 탐지
const color = new Map();
const stack = [];
function dfs(n) {
  color.set(n, 1); stack.push(n);
  for (const m of graph.get(n) || []) {
    if (color.get(m) === 1) { fails.push("import 순환: " + [...stack.slice(stack.indexOf(m)), m].join(" → ")); continue; }
    if (!color.get(m)) dfs(m);
  }
  stack.pop(); color.set(n, 2);
}
for (const n of graph.keys()) if (!color.get(n)) dfs(n);
if (fails.length) { console.error("check-app-split 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-app-split: " + graph.size + "개 파일, import 순환 없음, common은 탭 파일을 import하지 않음, App.jsx " + readFileSync(files["App.jsx"], "utf8").split("\n").length + "줄");
