#!/usr/bin/env node
/** (v0.6.3) FIDE 상위 100명(오픈) 스탠다드·래피드·블리츠 순위 → src/data/fideRankings.json
 *  출처: https://ratings.fide.com/a_top.php (list=open · men_rapid · men_blitz — FIDE 사이트의 "Top 100 Players" 표).
 *  FIDE는 불렛 레이팅을 발표하지 않는다. 도감 "마스터" 모식도 남쪽 세 갈래(스탠다드·래피드·블리츠)가 이 파일을 쓴다.
 *  실행: node scripts/build-fide-rankings.mjs  (매달 FIDE 목록이 갱신된 뒤 다시 실행 · 네트워크 필요 — prebuild에는 넣지 않는다)
 *  항목: [순위, FIDE ID, "성, 이름", 국가 코드, 레이팅, 출생 연도] */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";   // curl — 프록시 환경 변수·인증서를 그대로 따른다(Node fetch는 따르지 않는다)

const LISTS = { standard: "open", rapid: "men_rapid", blitz: "men_blitz" };
const out = { source: "https://ratings.fide.com/a_top.php", month: null, fetched: new Date().toISOString().slice(0, 10), lists: {} };
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').trim();
for (const [key, list] of Object.entries(LISTS)) {
  const html = execFileSync("curl", ["-sSf", "-m", "40", "https://ratings.fide.com/a_top.php?list=" + list], { encoding: "utf8", maxBuffer: 20e6 });
  const title = (html.match(/(?:Rapid |Blitz )?Top 100 Players ([A-Za-z]+ \d{4})/) || [])[1];
  if (!title) throw new Error(list + ": 제목(월)을 찾지 못함");
  if (out.month && out.month !== title) throw new Error("목록의 월이 서로 다름: " + out.month + " vs " + title);
  out.month = title;
  const rows = [];
  for (const tr of html.split("<tr>").slice(1)) {
    const m = tr.match(/<td>(?:<span class="rank_span">)?(\d+)(?:<\/span>)?<\/td>\s*<td><a href=\/profile\/(\d+)>([^<]*)<\/a><\/td>[\s\S]*?height=20>\s*([A-Z]{3})[\s\S]*?rating_column>(\d+)<[\s\S]*?bday_column>(\d{4})?</);
    if (m) rows.push([+m[1], +m[2], decode(m[3]), m[4], +m[5], m[6] ? +m[6] : null]);
  }
  if (rows.length !== 100) throw new Error(list + ": 100명이 아님(" + rows.length + ")");
  rows.forEach((r, i) => { if (r[0] !== i + 1) throw new Error(list + ": 순위가 1부터 이어지지 않음 " + r[0]); if (i && r[4] > rows[i - 1][4]) throw new Error(list + ": 레이팅이 내림차순이 아님 " + r[2]); });
  out.lists[key] = rows;
  console.log(key.padEnd(9), out.month, "1위", rows[0][2], rows[0][4], "· 100위", rows[99][2], rows[99][4]);
}
writeFileSync(new URL("../src/data/fideRankings.json", import.meta.url), JSON.stringify(out) + "\n");
console.log("→ src/data/fideRankings.json");
