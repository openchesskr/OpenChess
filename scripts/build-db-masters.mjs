#!/usr/bin/env node
/** (v0.6.3) 마스터 대국 DB(public/master-games.json)에서 DB에 기록된 최고 엘로가 높은 선수 TOP_N명(엘로가 같으면 대국 수 많은 쪽) → src/data/dbMasters.json
 *  표기가 다른 같은 사람("Carlsen,M" · "Carlsen, Magnus")은 성 + 이름 첫 글자로 합친다. 도감 "마스터" 모식도 서쪽 목록이 알파벳(성) 순으로 나열한다.
 *  항목: [표시 이름("성, 이름" — 가장 긴 표기), 대국 수, 최고 엘로(없으면 null)]. 이미 정렬(성 → 이름)되어 있다.
 *  실행: node scripts/build-db-masters.mjs  (DB를 다시 만든 뒤 실행) */
import { readFileSync, writeFileSync } from "node:fs";

const TOP_N = 900;
const db = JSON.parse(readFileSync(new URL("../public/master-games.json", import.meta.url), "utf8")).games;
const ascii = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();
// 표기 정리: 끝의 숫자("Vladimir3")·나라 코드("Filippov, Anton UZB")·마침표를 지우고, 쉼표가 없는 "Ding Liren"은 첫 낱말을 성으로 본다.
const clean = (raw) => String(raw).replace(/\d+/g, "").replace(/\s+[A-Z]{3}$/, "").replace(/\.$/, "").replace(/\s+/g, " ").trim();
const split = (raw0) => { const raw = clean(raw0), i = raw.indexOf(","); if (i >= 0) return [raw.slice(0, i).trim(), raw.slice(i + 1).trim()]; const t = raw.split(" "); return t.length > 1 ? [t[0], t.slice(1).join(" ")] : [raw, ""]; };
const people = new Map();
const add = (raw, elo) => {
  if (!raw || raw === "?") return;
  const [sur, giv] = split(raw), key = ascii(sur) + "|" + ascii(giv).slice(0, 1);
  let p = people.get(key); if (!p) { p = { sur, names: new Map(), games: 0, elo: 0 }; people.set(key, p); }
  const nm = sur + (giv ? ", " + giv : ""); p.names.set(nm, (p.names.get(nm) || 0) + 1); p.games++;
  const e = parseInt(elo, 10); if (e > p.elo) p.elo = e;
};
for (const g of db) { add(g.white, g.whiteElo); add(g.black, g.blackElo); }
// 복합 성의 앞부분만 쓴 표기("Dominguez, L" ↔ "Dominguez Perez, Leinier")는 같은 사람으로 합친다(앞부분 + 이름 첫 글자가 같고 후보가 하나일 때).
for (const [key, p] of [...people]) {
  const [sur, ini] = key.split("|"); if (!sur) continue;
  const cands = [...people.entries()].filter(([k, q]) => k !== key && k.endsWith("|" + ini) && k.startsWith(sur + " "));
  if (cands.length === 1) { const q = cands[0][1]; for (const [n, c] of p.names) q.names.set(n, (q.names.get(n) || 0) + c); q.games += p.games; q.elo = Math.max(q.elo, p.elo); people.delete(key); }
}
const best = (p) => [...p.names.entries()].sort((a, b) => b[0].length - a[0].length || b[1] - a[1])[0][0];
const top = [...people.entries()].sort((a, b) => b[1].elo - a[1].elo || b[1].games - a[1].games).slice(0, TOP_N)
  .map(([key, p]) => ({ key, name: best(p), games: p.games, elo: p.elo || null }));
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
top.sort((a, b) => { const [sa, ga] = a.key.split("|"), [sb, gb] = b.key.split("|"); return cmp(sa, sb) || cmp(ga, gb); });   // 성 → 이름 첫 글자 (성이 짧은 쪽이 먼저: "Le" < "Lenderman")
writeFileSync(new URL("../src/data/dbMasters.json", import.meta.url), JSON.stringify({ games: db.length, top: top.length, masters: top.map((m) => [m.name, m.games, m.elo]) }) + "\n");
console.log("선수", people.size, "중 상위", top.length, "명 · 최고 엘로 하한", Math.min(...top.map((m) => m.elo)), "· 처음", top[0].name, "· 끝", top[top.length - 1].name);
