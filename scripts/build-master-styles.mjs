#!/usr/bin/env node
/** (v0.6.4) 마스터 대국 DB(public/master-games.json) → 마스터별 스타일 특징 벡터 src/data/masterStyles.json
 *  대상: 도감 DB 마스터 900명(src/data/dbMasters.json) 중 대국 MIN_GAMES판 이상. 특징 계산은 앱과 같은 src/lib/masterStyle.js의 styleFeatures를 쓴다(앱이 계산하는 내 특징과 같은 정의여야 비교가 맞다).
 *  항목: [표시 이름("성, 이름"), 대국 수(그 선수로 합친 전체), 최고 엘로, 특징 벡터 14개(소수 3자리, 분모 없으면 null)]. mean/std는 이 선수들 전체의 평균·표준편차.
 *  실행: node scripts/build-master-styles.mjs  (build-db-masters.mjs 뒤에) */
import { readFileSync, writeFileSync } from "node:fs";
import { styleFeatures, STYLE_KEYS, RETREAT_GAMES_BUILD } from "../src/lib/masterStyle.js";
import { peopleIndex, bestName } from "./lib/masterNames.mjs";

const MIN_GAMES = 120;
const db = JSON.parse(readFileSync(new URL("../public/master-games.json", import.meta.url), "utf8")).games;
const top = JSON.parse(readFileSync(new URL("../src/data/dbMasters.json", import.meta.url), "utf8")).masters;
// build-db-masters.mjs와 같은 이름 합치기(scripts/lib/masterNames.mjs — v0.7.7 BUG-152부터 FIDE 동명이인 숫자 표지·활동 연도까지 같은 규칙)
const ix = peopleIndex();
for (const g of db) { const y = String(g.date || "").slice(0, 4); ix.add(g.white, g.whiteElo, y); ix.add(g.black, g.blackElo, y); }
const people = ix.finish(), dexNames = new Map(top.map(([name, games, elo]) => [name, { name, games, elo, list: [] }]));
const want = new Map();
for (const [key, p] of people) { const m = dexNames.get(bestName(p)); if (m && !m.taken) { m.taken = true; want.set(key, m); } }
const res = (r, color) => (r === "1/2-1/2" ? "draw" : r === "1-0" ? (color === "w" ? "win" : "loss") : r === "0-1" ? (color === "b" ? "win" : "loss") : null);
for (const g of db) {
  const mv = g.moves ? g.moves.split(" ") : null; if (!mv) continue;
  for (const [raw, color] of [[g.white, "w"], [g.black, "b"]]) {
    const m = want.get(ix.resolve(raw)); if (m) m.list.push({ moves: mv, color, result: res(g.result, color) });
  }
}
const rows = [];
for (const m of want.values()) { if (m.list.length < MIN_GAMES) continue; const f = styleFeatures(m.list, { retreatGames: RETREAT_GAMES_BUILD }); rows.push([m.name, m.games, m.elo, f.vec.map((v) => (v == null ? null : Math.round(v * 1000) / 1000))]); }
const mean = [], std = [];
for (let i = 0; i < STYLE_KEYS.length; i++) {
  const xs = rows.map((r) => r[3][i]).filter((v) => v != null), mu = xs.reduce((a, b) => a + b, 0) / xs.length;
  mean.push(Math.round(mu * 1000) / 1000); std.push(Math.round(Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length) * 1000) / 1000);
}
writeFileSync(new URL("../src/data/masterStyles.json", import.meta.url), JSON.stringify({ keys: STYLE_KEYS, minGames: MIN_GAMES, mean, std, masters: rows }) + "\n");
console.log("마스터", rows.length, "명 (최소", MIN_GAMES, "판) · 평균", mean.join(" "));
