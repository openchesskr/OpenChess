#!/usr/bin/env node
/** (v0.6.3) 마스터 대국 DB(public/master-games.json)에서 DB에 기록된 최고 엘로가 높은 선수 TOP_N명(엘로가 같으면 대국 수 많은 쪽) → src/data/dbMasters.json
 *  표기가 다른 같은 사람("Carlsen,M" · "Carlsen, Magnus")은 성 + 이름 첫 글자로 합친다. 도감 "마스터" 모식도 서쪽 목록이 알파벳(성) 순으로 나열한다.
 *  항목: [표시 이름("성, 이름" — 가장 긴 표기), 대국 수, 최고 엘로(없으면 null)]. 이미 정렬(성 → 이름)되어 있다.
 *  (v0.6.5) 마스터 상세 프로필이 있는 선수(masterProfiles.json)도 함께 넣는다(엘로 순위 밖의 옛 대가 포함) — build-master-profiles를 먼저 돌릴 것.
 *  실행: node scripts/build-db-masters.mjs  (DB를 다시 만든 뒤 실행) */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { peopleIndex, bestName } from "./lib/masterNames.mjs";

const TOP_N = 900;
const db = JSON.parse(readFileSync(new URL("../public/master-games.json", import.meta.url), "utf8")).games;
// (v0.7.5) 표기 정리·성 + 이름 첫 글자로 합치기·복합 성 합치기는 scripts/lib/masterNames.mjs(DB 기반 프로필 보충과 공용)
const ix = peopleIndex();
for (const g of db) { const y = String(g.date || "").slice(0, 4); ix.add(g.white, g.whiteElo, y); ix.add(g.black, g.blackElo, y); }   // (v0.7.7 BUG-152) 연도로 동명이인 구분
const people = ix.finish();
const best = bestName;
// (v0.7.7 BUG-152) 동명이인은 이제 따로 센다. 화면 이름이 같은 두 사람(예: 1997~98년의 "Fedoseev, Vladimir"와 GM "Fedoseev,Vl3")이 목록에 함께 있으면
//  앱은 이름으로 프로필을 찾으므로 구분할 수 없다 — 엘로(같으면 대국 수)가 높은 한 사람만 남긴다. 남은 사람의 대국 수·최고 엘로는 더 이상 합쳐지지 않는다.
const ranked = [...people.entries()].sort((a, b) => b[1].elo - a[1].elo || b[1].games - a[1].games);
const seenName = new Set(), top = [];
let homonyms = 0;
for (const [key, p] of ranked) {
  if (top.length >= TOP_N) break;
  const name = best(p);
  if (seenName.has(name)) { homonyms++; continue; }
  seenName.add(name); top.push({ key: key.replace(/#\d$/, ""), name, games: p.games, elo: p.elo || null });
}
// (v0.6.5) 마스터 상세 프로필(src/data/masterProfiles.json — build-master-profiles.mjs)이 있는 선수는 DB 최고 엘로 순위 밖이어도(옛 대가는 엘로 기록이 없다) 목록에 넣는다
// — 그래야 도감에서 그 선수의 노드를 눌러 상세 프로필을 열 수 있다. 대국 수는 프로필의 대국 수, 엘로는 프로필의 최고 엘로(없으면 null).
const profPath = new URL("../src/data/masterProfiles.json", import.meta.url);
let extra = 0;
if (existsSync(profPath)) {
  const have = new Set(top.map((m) => m.key));
  for (const [key, p] of Object.entries(JSON.parse(readFileSync(profPath, "utf8")).p)) if (!have.has(key)) { top.push({ key, name: p.name.includes(",") ? p.name : p.name.replace(/^(\S+)\s+(.+)$/, "$1, $2"), games: p.n, elo: p.peak[0] || null }); extra++; }
}
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
top.sort((a, b) => { const [sa, ga] = a.key.split("|"), [sb, gb] = b.key.split("|"); return cmp(sa, sb) || cmp(ga, gb); });   // 성 → 이름 첫 글자 (성이 짧은 쪽이 먼저: "Le" < "Lenderman")
writeFileSync(new URL("../src/data/dbMasters.json", import.meta.url), JSON.stringify({ games: db.length, top: TOP_N, masters: top.map((m) => [m.name, m.games, m.elo]) }) + "\n");
console.log("동명이인으로 뺀 선수", homonyms, "명");
console.log("선수", people.size, "중 상위", TOP_N, "명 + 프로필 선수", extra, "명 = 총", top.length, "명 · 최고 엘로 하한", Math.min(...top.map((m) => m.elo)), "· 처음", top[0].name, "· 끝", top[top.length - 1].name);
