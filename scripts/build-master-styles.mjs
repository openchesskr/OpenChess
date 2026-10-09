#!/usr/bin/env node
/** (v0.6.4) 마스터 대국 DB(public/master-games.json) → 마스터별 스타일 특징 벡터 src/data/masterStyles.json
 *  대상: 도감 DB 마스터 900명(src/data/dbMasters.json) 중 대국 MIN_GAMES판 이상. 특징 계산은 앱과 같은 src/lib/masterStyle.js의 styleFeatures를 쓴다(앱이 계산하는 내 특징과 같은 정의여야 비교가 맞다).
 *  항목: [표시 이름("성, 이름"), 대국 수(그 선수로 합친 전체), 최고 엘로, 특징 벡터 13개(소수 3자리, 분모 없으면 null)]. mean/std는 이 선수들 전체의 평균·표준편차.
 *  실행: node scripts/build-master-styles.mjs  (build-db-masters.mjs 뒤에) */
import { readFileSync, writeFileSync } from "node:fs";
import { styleFeatures, STYLE_KEYS } from "../src/lib/masterStyle.js";

const MIN_GAMES = 120;
const db = JSON.parse(readFileSync(new URL("../public/master-games.json", import.meta.url), "utf8")).games;
const top = JSON.parse(readFileSync(new URL("../src/data/dbMasters.json", import.meta.url), "utf8")).masters;
// build-db-masters.mjs와 같은 이름 합치기(성 + 이름 첫 글자)
const ascii = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();
const clean = (raw) => String(raw).replace(/\d+/g, "").replace(/\s+[A-Z]{3}$/, "").replace(/\.$/, "").replace(/\s+/g, " ").trim();
const split = (raw0) => { const raw = clean(raw0), i = raw.indexOf(","); if (i >= 0) return [raw.slice(0, i).trim(), raw.slice(i + 1).trim()]; const t = raw.split(" "); return t.length > 1 ? [t[0], t.slice(1).join(" ")] : [raw, ""]; };
const keyOf = (raw) => { const [s, g] = split(raw); return ascii(s) + "|" + ascii(g).slice(0, 1); };
const want = new Map(top.map(([name, games, elo]) => [keyOf(name), { name, games, elo, list: [] }]));
const res = (r, color) => (r === "1/2-1/2" ? "draw" : r === "1-0" ? (color === "w" ? "win" : "loss") : r === "0-1" ? (color === "b" ? "win" : "loss") : null);
for (const g of db) {
  const mv = g.moves ? g.moves.split(" ") : null; if (!mv) continue;
  for (const [raw, color] of [[g.white, "w"], [g.black, "b"]]) {
    const m = want.get(keyOf(raw)); if (m) m.list.push({ moves: mv, color, result: res(g.result, color) });
  }
}
const rows = [];
for (const m of want.values()) { if (m.list.length < MIN_GAMES) continue; const f = styleFeatures(m.list); rows.push([m.name, m.games, m.elo, f.vec.map((v) => (v == null ? null : Math.round(v * 1000) / 1000))]); }
const mean = [], std = [];
for (let i = 0; i < 13; i++) {
  const xs = rows.map((r) => r[3][i]).filter((v) => v != null), mu = xs.reduce((a, b) => a + b, 0) / xs.length;
  mean.push(Math.round(mu * 1000) / 1000); std.push(Math.round(Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length) * 1000) / 1000);
}
writeFileSync(new URL("../src/data/masterStyles.json", import.meta.url), JSON.stringify({ keys: STYLE_KEYS, minGames: MIN_GAMES, mean, std, masters: rows }) + "\n");
console.log("마스터", rows.length, "명 (최소", MIN_GAMES, "판) · 평균", mean.join(" "));
