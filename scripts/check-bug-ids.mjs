// BUGS.md 번호 검사 (v0.7.5, BUG-150 재발 방지)
// - 상세 기록(### BUG-NNN)의 번호가 중복되지 않을 것
// - 현황 표의 번호가 중복되지 않을 것
// - 상세 기록이 있는 버그는 현황 표에도 있을 것
// v0.7.4에서 새 버그를 기존 번호(BUG-107~112)로 다시 매겨 서로 다른 버그가 같은 번호를 쓰게 된 일을 막는다.
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../BUGS.md", import.meta.url), "utf8");
const lines = src.split("\n");
const detail = new Map();
const table = new Map();
const errors = [];

lines.forEach((line, i) => {
  const d = line.match(/^### (BUG-\d+)\b/);
  if (d && d[1] !== "BUG-000") { // BUG-000은 작성 템플릿
    if (detail.has(d[1])) errors.push(`상세 기록 번호 중복: ${d[1]} (${detail.get(d[1])}행, ${i + 1}행)`);
    else detail.set(d[1], i + 1);
  }
  const t = line.match(/^\|\s*(BUG-\d+)\s*\|/);
  if (t) {
    if (table.has(t[1])) errors.push(`현황 표 번호 중복: ${t[1]} (${table.get(t[1])}행, ${i + 1}행)`);
    else table.set(t[1], i + 1);
  }
});

for (const [id, ln] of detail) {
  if (!table.has(id)) errors.push(`현황 표에 없는 상세 기록: ${id} (${ln}행)`);
}

if (errors.length) {
  console.error("✗ check-bug-ids: BUGS.md 번호 문제\n  " + errors.join("\n  "));
  console.error("  새 버그는 현황 표의 가장 큰 번호 다음 번호를 쓰고, 표와 상세 기록에 함께 적을 것.");
  process.exit(1);
}
const max = Math.max(...[...table.keys()].map((k) => +k.slice(4)));
console.log(`✓ check-bug-ids: 버그 ${table.size}건, 번호 중복 없음 (다음 번호 BUG-${max + 1})`);
