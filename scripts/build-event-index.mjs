#!/usr/bin/env node
/** (v0.6.6) 대국의 대회 이름(event) → 도감 마스터 트리의 대회·연도 색인(src/data/eventIndex.json) 생성.
 *  집중 분석 마스터 통계의 대회 이름을 누르면 도감 마스터 트리의 그 대회(연도 블록)로 이동하는 데 쓴다(src/lib/eventLink.js).
 *  입력: src/data/tournaments/*.json의 모든 회차(ev·evs·y) — build-pgn-tournaments → build-db-tournaments 다음에 돌린다.
 *  출력: { events: { "<event 소문자·공백 정리>": [[대회 id, 연도], …] } }
 *  실행: node scripts/build-event-index.mjs */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = new URL("../", import.meta.url).pathname, dir = join(ROOT, "src/data/tournaments");
const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const events = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
  for (const e of d.eds) for (const ev of [e.ev, ...(e.evs || [])]) {
    const k = norm(ev); if (!k) continue;
    const list = events[k] || (events[k] = []);
    if (!list.some((x) => x[0] === d.id && x[1] === e.y)) list.push([d.id, e.y]);
  }
}
writeFileSync(join(ROOT, "src/data/eventIndex.json"), JSON.stringify({ events }));
console.log("대회 이름 " + Object.keys(events).length + "개 색인");
