#!/usr/bin/env node
/** (v0.7.7 BUG-167·BUG-170) 이미 만든 마스터 상세 프로필(src/data/masterProfiles.json)의 이름 표기 정리 — 원본 PGN 묶음은 저장소 밖이라 다시 만들 수 없어 결과 파일을 직접 고친다.
 *  ① 두 사람이 붙은 이름("Adams, Michael:Mortazavi,Ali")은 앞사람만 남긴다 — 프로필 이름·자주 만난 상대(opp, 같은 이름이 되면 판수·승무패를 합침)·명국(best)의 상대 이름.
 *  ② 저장소 대국으로 보충한 프로필(src: "db")은 이름을 도감 목록(dbMasters.json)의 같은 키 이름에 맞춘다(도감 대표 이름 규칙이 바뀌면 함께 따라가게).
 *  생성 스크립트(build-master-profiles.mjs)도 같은 정리를 하므로, 원본으로 다시 만들면 이 스크립트는 바꿀 것이 없다.
 *  실행: node scripts/build-db-masters.mjs && node scripts/fix-master-profile-names.mjs   (검사: scripts/check-master-pages.mjs) */
import { readFileSync, writeFileSync } from "node:fs";
import { personKey } from "./lib/masterNames.mjs";
const PATH = new URL("../src/data/masterProfiles.json", import.meta.url);
const prof = JSON.parse(readFileSync(PATH, "utf8"));
const dex = JSON.parse(readFileSync(new URL("../src/data/dbMasters.json", import.meta.url), "utf8")).masters;
const sk = (k) => k.replace(/ /g, ""), dexByKey = new Map(dex.map((m) => [sk(personKey(m[0])), m[0]]));
const one = (s) => String(s || "").split(":")[0].trim();
let fixed = 0, renamed = 0;
for (const [key, p] of Object.entries(prof.p)) {
  if (p.name.includes(":")) { p.name = one(p.name); fixed++; }
  if (p.src === "db" && dexByKey.has(sk(key)) && dexByKey.get(sk(key)) !== p.name) { p.name = dexByKey.get(sk(key)); renamed++; }
  if (Array.isArray(p.opp)) {
    const m = new Map();
    for (const o of p.opp) { const nm = one(o[0]); if (nm !== o[0]) fixed++; const x = m.get(nm); if (x) for (let i = 1; i < o.length; i++) x[i] += o[i]; else m.set(nm, [nm, ...o.slice(1)]); }
    p.opp = [...m.values()].sort((a, b) => b[1] - a[1]);
  }
  if (Array.isArray(p.best)) for (const b of p.best) if (typeof b[2] === "string" && b[2].includes(":")) { b[2] = one(b[2]); fixed++; }
}
writeFileSync(PATH, JSON.stringify(prof) + "\n");
console.log("두 사람이 붙은 이름", fixed, "곳 정리 · 보충 프로필 이름", renamed, "명을 도감 이름에 맞춤");
