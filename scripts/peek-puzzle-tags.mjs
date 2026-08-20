#!/usr/bin/env node
/**
 * peek-puzzle-tags.mjs — 리체스 퍼즐 CSV에서 특정 키워드를 포함하는 OpeningTags 값과 개수를
 * 미리 훑어본다. build-daily-puzzles.mjs의 --tag는 정확히 일치해야 하므로, 실행 전에 실제
 * CSV에 어떤 표기로 들어있는지 이걸로 먼저 확인한다(awk 없이 크로스플랫폼으로 쓰려고 Node로 작성).
 *
 * 사용법: node scripts/peek-puzzle-tags.mjs <csv경로> <키워드>
 * 예:     node scripts/peek-puzzle-tags.mjs .\lichess_db_puzzle.csv Italian
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const [, , csvPath, keyword] = process.argv;
if (!csvPath || !keyword) {
  console.error("사용법: node scripts/peek-puzzle-tags.mjs <csv경로> <키워드>");
  process.exit(1);
}

const rl = createInterface({ input: createReadStream(csvPath, "utf8"), crlfDelay: Infinity });
let idx = null;
const counts = new Map();
let lines = 0;
for await (const line of rl) {
  if (!line) continue;
  if (!idx) { const header = line.split(","); idx = Object.fromEntries(header.map((h, i) => [h, i])); continue; }
  lines++;
  const cols = line.split(",");
  const tags = (cols[idx.OpeningTags] || "").split(" ").filter(Boolean);
  for (const t of tags) {
    if (t.toLowerCase().includes(keyword.toLowerCase())) counts.set(t, (counts.get(t) || 0) + 1);
  }
}

const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
console.log(lines + "개 행 검사 완료 — \"" + keyword + "\" 포함 태그 " + sorted.length + "개 발견\n");
for (const [tag, count] of sorted.slice(0, 25)) console.log(count.toString().padStart(6) + "  " + tag);
if (!sorted.length) console.log("(일치하는 태그가 없어요 — 다른 키워드로 다시 시도해 보세요)");
