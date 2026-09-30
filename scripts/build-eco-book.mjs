#!/usr/bin/env node
/** (v0.5.9, BUG-039) 이름 있는 오프닝(ECO) 이론 포지션 데이터 → src/data/ecoBook.json
 *  lichess-org/chess-openings(a~e.tsv, CC0 퍼블릭 도메인)의 모든 수순이 지나는 포지션을 앱과 같은 규칙(src/lib/chessRules.js
 *  sansToFen → src/lib/ecoHash.js bookPositionKey → ecoHash)으로 해시해 담는다. 앱은 수를 둔 뒤 포지션이 여기 있으면 이론으로 본다
 *  (App.jsx isBookMoveAt). 원본 목록이 갱신되면 다시 실행한다.
 *  실행: node scripts/build-eco-book.mjs            (GitHub에서 받음)
 *        ECO_DIR=경로 node scripts/build-eco-book.mjs  (미리 받아 둔 a.tsv~e.tsv 사용)
 */
import fs from "node:fs";
import path from "node:path";
import { sansToFen } from "../src/lib/chessRules.js";

import { bookPositionKey, ecoHash } from "../src/lib/ecoHash.js";

const BASE = "https://raw.githubusercontent.com/lichess-org/chess-openings/master/";
async function readTsv(f) {
  if (process.env.ECO_DIR) return fs.readFileSync(path.join(process.env.ECO_DIR, f + ".tsv"), "utf8");
  const r = await fetch(BASE + f + ".tsv");
  if (!r.ok) throw new Error(f + ".tsv 받기 실패: " + r.status);
  return r.text();
}
const hashes = new Set();
let lines = 0, bad = 0;
for (const f of ["a", "b", "c", "d", "e"]) {
  for (const row of (await readTsv(f)).trim().split("\n").slice(1)) {
    const pgn = (row.split("\t")[2] || "").trim();
    const sans = pgn.split(/\s+/).filter((t) => t && !/^\d+\.+$/.test(t));
    if (!sans.length) continue;
    lines++;
    try { for (let i = 1; i <= sans.length; i++) hashes.add(ecoHash(bookPositionKey(sansToFen(sans.slice(0, i))))); }
    catch { bad++; }
  }
}
const out = {
  source: "lichess-org/chess-openings (CC0 1.0 Public Domain Dedication) — https://github.com/lichess-org/chess-openings",
  builtBy: "scripts/build-eco-book.mjs",
  lines, positions: hashes.size,
  hashes: [...hashes].sort().join(" "),
};
fs.writeFileSync(new URL("../src/data/ecoBook.json", import.meta.url), JSON.stringify(out));
console.log("ECO 수순", lines, "개(실패", bad, ") → 이론 포지션", hashes.size, "개 → src/data/ecoBook.json");
