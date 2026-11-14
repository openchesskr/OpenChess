#!/usr/bin/env node
/** (v0.7.6, 사용자 요청) /master/<고유 주소> — 마스터 프로필(src/data/masterProfiles.json)마다 고정 주소(slug)와 전체 이름을 만든다 → src/data/masterSlugs.json
 *  · 전체 이름 찾는 순서: 세계 챔피언 표(worldChampions.js) → 프로필 이름이 이미 온전하면 그대로 → FIDE 순위 → 위키데이터 국적표(masterCountry.json) → 대회 대진표(tournamentSearch.json) → 한국어 표기표 원문 키 → 프로필 이름 그대로
 *    (같은 성 + 이름 첫 글자로 맞춘다 — "Anand, V" → "Anand, Viswanathan"). 이름 칸에 두 사람이 붙은 옛 데이터("Adams, Michael:Mortazavi,Ali")는 앞사람만.
 *  · slug = "이름-성" 소문자, 악센트 제거, 영숫자 외는 하이픈(예: magnus-carlsen). 겹치면 출생 연도 대신 -2, -3(프로필 키 순으로 고정).
 *  · 한 번 정한 slug는 바꾸지 않는다: 이미 있는 masterSlugs.json의 값은 그대로 두고 새 프로필만 추가한다(공유된 링크가 깨지지 않게).
 *  실행: node scripts/build-master-slugs.mjs (데이터를 바꾼 뒤 수동 실행) · 검사: scripts/check-master-pages.mjs */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { CHAMPIONS } from "../src/data/worldChampions.js";
const rd = (f) => JSON.parse(readFileSync(new URL("../" + f, import.meta.url), "utf8"));
const OUT = new URL("../src/data/masterSlugs.json", import.meta.url);
const profiles = rd("src/data/masterProfiles.json").p, fide = rd("src/data/fideRankings.json"), ko = rd("src/data/masterKo.json");
const strip = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s) => strip(s).toLowerCase().replace(/[^a-z]/g, "");
const split = (raw) => { const s = String(raw || "").split(":")[0].replace(/\s+/g, " ").trim(), i = s.indexOf(","); return i >= 0 ? [s.slice(0, i).trim(), s.slice(i + 1).trim()] : (() => { const t = s.split(" "); return [t.pop() || "", t.join(" ")]; })(); };
const keyOf = (raw) => { const [sur, giv] = split(raw); return norm(sur) + "|" + norm(giv).slice(0, 1); };
// 전체 이름 후보(키 → "성, 이름") — 믿을 만한 출처부터: 세계 챔피언 → FIDE 순위 → 한국어 표기표 중 기존 표기·위키데이터. 한 출처 안에서 같은 키가 둘 이상이면(동명이인 가능) 그 출처는 쓰지 않는다.
const sources = [];
const addSource = (names) => { const m = new Map(), dup = new Set(); for (const raw of names) { const [sur, giv] = split(raw); if (!sur || !giv) continue; const k = keyOf(raw); if (m.has(k) && norm(m.get(k)) !== norm(sur + giv)) dup.add(k); else m.set(k, sur + ", " + giv); } for (const k of dup) m.delete(k); sources.push(m); };
addSource(CHAMPIONS.map((c) => { const t = c.name.split(" "); return t.slice(-1)[0] + ", " + t.slice(0, -1).join(" "); }));
addSource(Object.values(fide.lists).flatMap((l) => l.map((r) => r[2])));
addSource(Object.keys(rd("src/data/masterCountry.json")));            // 위키데이터 시민권 표의 이름(전체 이름)
addSource(Object.keys(rd("src/data/tournamentSearch.json").p));        // 대회 대진표의 선수 이름
addSource(Object.keys(ko.names));                                      // 한국어 표기표의 원문 키(마지막)
// 프로필 이름의 이름 칸이 이미 온전하면(3글자 이상 단어) 그대로 쓴다 — 뒤에 붙은 가운데 이니셜("Lev O")은 뗀다.
const ownFull = (raw) => { const [sur, giv] = split(raw); const words = giv.split(" ").filter((w) => w.replace(/\./g, "").length >= 2); return words.length && words[0].replace(/\./g, "").length >= 3 ? sur + ", " + words.join(" ") : null; };
// 어느 출처에도 전체 이름이 없는 유명 선수(검수한 표기)
const OVERRIDE = { "gukesh|d": "Gukesh, Dommaraju", "praggnanandhaa|r": "Praggnanandhaa, Rameshbabu", "naroditsky|d": "Naroditsky, Daniel", "naiditsch|a": "Naiditsch, Arkadij", "ponkratov|p": "Ponkratov, Pavel",
  "predke|a": "Predke, Alexandr", "pichot|a": "Pichot, Alan", "savchenko|b": "Savchenko, Boris", "kuzubov|y": "Kuzubov, Yuriy", "demchenko|a": "Demchenko, Anton", "chigaev|m": "Chigaev, Maksim", "abasov|n": "Abasov, Nijat" };
// 세계 챔피언은 표준 표기("Garry Kasparov")를 가장 먼저 쓴다.
const fullName = (raw) => { const k = keyOf(raw); if (sources[0].has(k)) return sources[0].get(k); const own = ownFull(raw); if (own) return own; if (OVERRIDE[k]) return OVERRIDE[k]; for (const m of sources.slice(1)) if (m.has(k) && ownFull(m.get(k))) return ownFull(m.get(k)); return split(raw).filter(Boolean).join(", "); };
const display = (raw) => { const [sur, giv] = split(raw); if (!giv) return sur; return giv.split(" ").map((w) => (w.replace(/\./g, "").length === 1 ? w.replace(/\.?$/, ".") : w)).join(" ") + " " + sur; };
const slugOf = (name) => strip(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")).bySlug || {} : {};
const bySlug = { ...prev }, used = new Set(Object.keys(prev)), have = new Set(Object.values(prev).map((v) => v.key));
let added = 0;
for (const key of Object.keys(profiles).sort()) {
  if (have.has(key)) continue;
  const raw = profiles[key].name, best = fullName(raw);
  const name = display(best);
  let slug = slugOf(name) || slugOf(key), n = 1;
  while (used.has(n === 1 ? slug : slug + "-" + n)) n++;
  if (n > 1) slug += "-" + n;
  used.add(slug); bySlug[slug] = { key, name }; added++;
}
writeFileSync(OUT, JSON.stringify({ note: "마스터 페이지 고유 주소(/master/<slug>) — scripts/build-master-slugs.mjs가 만든다. 한 번 정한 값은 바꾸지 않는다.", bySlug }, null, 0) + "\n");
console.log("✓ master slugs: " + Object.keys(bySlug).length + "명 (새로 " + added + "명)");
