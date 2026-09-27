#!/usr/bin/env node
/** (v0.5.7, BUG-018 재발 방지) PostgREST 조회에서 "오름차순(asc) + limit" 조합을 막는다.
 *   · chatFetch가 order=created_at.asc&limit=300으로 가장 "오래된" 300개를 받아, 대화가 300개를 넘으면 최신 메시지가
 *     영영 안 보이고 보낸 메시지가 보내자마자 사라졌다. 최신 N개가 필요하면 desc로 받아 화면에서 뒤집을 것.
 *   · offset으로 끝까지 넘기는 페이지네이션(전체 스캔)은 결국 모든 행을 받으므로 허용한다. 주석 줄은 보지 않는다.
 *   · 정말로 가장 이른 행이 필요한 곳(예: limit=1로 첫 날짜 찾기)은 바로 윗줄 주석에 asc-limit-ok를 적어 허용한다.
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-latest-rows.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(jsx?|mjs)$/.test(f)) files.push(p);
  }
})(join(ROOT, "src"));

const RE = /order=[\w.,]*\.asc[^"'`]*limit=|limit=[^"'`]*order=[\w.,]*\.asc/;
const problems = [];
let allowed = 0;
for (const p of files) {
  const lines = readFileSync(p, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (!RE.test(line) || /^\s*(\/\/|\*)/.test(line) || /offset=/.test(line)) return;
    if (/asc-limit-ok/.test(line) || /asc-limit-ok/.test(lines[i - 1] || "")) { allowed++; return; }
    problems.push(relative(ROOT, p) + ":" + (i + 1) + " — 오름차순 + limit은 가장 오래된 행만 받는다(최신 N개면 desc로 받아 뒤집을 것)");
  });
}
if (problems.length) {
  console.error("✗ latest rows check 실패:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("✓ latest rows check: " + files.length + "개 파일에 asc+limit 조회 없음(의도된 예외 " + allowed + "곳)");
