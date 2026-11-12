#!/usr/bin/env node
/** (v0.7.5) 저장소 안의 대국 데이터로 마스터 상세 프로필 보충 → src/data/masterProfiles.json에 추가(기존 프로필은 건드리지 않는다).
 *  배경: 상세 프로필은 선수별 PGN 묶음(build-master-profiles.mjs, 원본은 저장소 밖)이 있는 249명뿐이라, 도감 목록(dbMasters.json, 986명)의
 *  딩리런·웨이이·두보프 같은 최상위 선수도 상세 카드가 비어 있었다. 외부 사이트를 긁지 않고, 이미 저장소에 있는 두 데이터로 계산한다.
 *   · public/master-games.json(마스터 대국 DB) · src/data/tournaments/*.json(대회 데이터) — 같은 대국(두 선수·연도·첫 24수)이 겹치면 한 번만 센다
 *  대상: 도감 목록에 있고 아직 프로필이 없으며(masterProfile.js의 findProfile로 확인 — 앱이 찾는 방식 그대로) 합친 대국이 --min판(기본 150) 이상인 선수.
 *  최고 엘로가 높은 선수부터, 프로필 파일이 --budget KB(기본 960, check-tournament-data 상한 1024KB 아래)를 넘지 않을 때까지 넣는다.
 *  계산은 build-master-profiles와 같은 scripts/lib/masterProfileStats.mjs. 이렇게 만든 프로필에는 src: "db"를 붙여 화면이 "수록 대국 기준"임을 밝힌다.
 *  실행: node scripts/build-master-profiles-db.mjs [--min 150] [--budget 960] [--dry-run]   → 그 뒤 node scripts/build-db-masters.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { decodeMoves } from "../src/lib/moveCodec.js";
import { findProfile } from "../src/lib/masterProfile.js";
import { computeProfile, ecoNameTable } from "./lib/masterProfileStats.mjs";
import { peopleIndex, bestName, split, ascii } from "./lib/masterNames.mjs";

const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const MIN = +opt("min", 150), BUDGET = +opt("budget", 960) * 1024, DRY = argv.includes("--dry-run");
const ROOT = new URL("../", import.meta.url).pathname, rj = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const tree = rj("src/data/openings.json").tree, ecoName = ecoNameTable(tree);
const PROF_PATH = join(ROOT, "src/data/masterProfiles.json"), prof = rj("src/data/masterProfiles.json");
const dex = rj("src/data/dbMasters.json").masters;

// 수순 → ECO(오프닝 트리에서 가장 깊이 일치한 이름 있는 수) — 대회 데이터에는 ECO 태그가 없다
function ecoOf(moves) {
  let eco = "", key = "";
  for (let i = 0; i < moves.length && i < 30; i++) {
    const node = tree[key]; if (!node) break;
    const m = (node.moves || []).find((x) => x.san === moves[i]); if (!m) break;
    if (m.eco) eco = m.eco;
    key = key ? key + " " + moves[i] : moves[i];
  }
  return eco;
}
const yearOf = (d) => { const m = /^(\d{4})/.exec(d || ""); return m ? +m[1] : 0; };

// 1) 두 데이터를 공통 형태로: { white, black, wElo, bElo, res, y, ev, eco, moves }
//  대회 데이터의 수순 복원(decodeMoves)은 한 판에 수십 ms라 9만 판을 다 풀면 40분이 넘는다 — 이름만 먼저 읽어 대상 선수를 정한 뒤,
//  대상 선수의 대국만, 그리고 마스터 DB에 이미 있는 대국(같은 두 선수 성·연도·결과)은 건너뛰고 푼다.
const games = [];
const ix = peopleIndex();
const surs = (w, b) => [w, b].map((n) => ascii(split(n)[0]).replace(/ /g, "")).join("/");
const seenMaster = new Map();   // "성/성@연도:결과" → 마스터 DB 판수
let nMaster = 0, nTour = 0, dup = 0;
for (const x of rj("public/master-games.json").games) {
  const res = x.result === "1-0" ? "W" : x.result === "0-1" ? "B" : x.result === "1/2-1/2" ? "D" : "?";
  if (res === "?" || !x.white || !x.black) continue;
  const g = { white: x.white, black: x.black, wElo: x.whiteElo || 0, bElo: x.blackElo || 0, res, y: yearOf(x.date), ev: x.event || "", eco: x.eco || "", moves: String(x.moves || "").split(" ").filter(Boolean) };
  games.push(g); ix.add(g.white, g.wElo); ix.add(g.black, g.bElo); nMaster++;
  const k = surs(g.white, g.black) + "@" + g.y + ":" + res; seenMaster.set(k, (seenMaster.get(k) || 0) + 1);
}
const TDIR = join(ROOT, "src/data/tournaments"), tourRaw = [];
for (const f of readdirSync(TDIR).filter((f) => f.endsWith(".json"))) {
  for (const ed of JSON.parse(readFileSync(join(TDIR, f), "utf8")).eds) {
    for (const g of ed.g) {
      if (g[4] == null || g[4] < 0 || typeof g[5] !== "string") continue;
      const W = ed.pl[g[2]], B = ed.pl[g[3]]; if (!W || !B) continue;
      const res = g[4] === 2 ? "W" : g[4] === 0 ? "B" : "D", y = ed.y || yearOf(ed.d0);
      const k = surs(W[0], B[0]) + "@" + y + ":" + res, c = seenMaster.get(k) || 0;
      if (c > 0) { seenMaster.set(k, c - 1); dup++; continue; }   // 마스터 DB에 이미 있는 대국
      tourRaw.push({ white: W[0], black: B[0], wElo: W[1] || 0, bElo: B[1] || 0, res, y, ev: ed.ev || "", code: g[5] });
      ix.add(W[0], W[1]); ix.add(B[0], B[1]);
    }
  }
}
const people = ix.finish();

// 2) 대상 선수: 도감 목록에 있고 프로필이 없는 사람
const byKey = new Map();
for (const [name] of dex) {
  if (findProfile(prof, name)) continue;
  const k = ix.resolve(name); const p = people.get(k);
  if (p && p.games >= MIN) byKey.set(k, { dexName: name, p });
}
const targets = [...byKey.entries()].sort((a, b) => b[1].p.elo - a[1].p.elo || b[1].p.games - a[1].p.games);
for (const t of tourRaw) {
  if (!byKey.has(ix.resolve(t.white)) && !byKey.has(ix.resolve(t.black))) continue;
  let moves; try { moves = decodeMoves(t.code); } catch { continue; }
  games.push({ ...t, eco: ecoOf(moves), moves }); nTour++;
}
console.log("대국: 마스터 DB " + nMaster + " + 대회 " + nTour + "(대상 선수 대국만 · 마스터 DB와 겹친 " + dup + "판 제외) · 선수 " + people.size + "명");
console.log("프로필 없는 도감 선수 중 " + MIN + "판 이상: " + targets.length + "명");

// 3) 선수별 대국 모으기(한 번 훑기) → 프로필 계산
const recsBy = new Map(targets.map(([k]) => [k, []]));
const disp = (raw) => { const p = people.get(ix.resolve(raw)); return p ? bestName(p) : raw; };
for (const g of games) {
  const kw = ix.resolve(g.white), kb = ix.resolve(g.black);
  if (recsBy.has(kw)) recsBy.get(kw).push({ isW: true, res: g.res, y: g.y, myElo: g.wElo, oppElo: g.bElo, opp: disp(g.black), moves: g.moves, eco: g.eco, ev: g.ev });
  if (recsBy.has(kb) && kb !== kw) recsBy.get(kb).push({ isW: false, res: g.res, y: g.y, myElo: g.bElo, oppElo: g.wElo, opp: disp(g.white), moves: g.moves, eco: g.eco, ev: g.ev });
}
const out = { p: { ...prof.p } }; const added = [];
let size = Buffer.byteLength(JSON.stringify(out));
// 동명이인 분리: 이름 표기로만 합치므로 같은 성·이름 첫 글자의 다른 사람이 섞일 수 있다(실측: 1997~98년의 Vladimir Fedoseev와 1995년생 GM Vladimir Fedoseev).
// 대국이 GAP년 이상 끊긴 구간이 있으면 대국이 가장 많은 연속 구간만 쓴다(최상위 선수가 8년 넘게 쉬는 일은 드물다). 연도 없는 대국은 그대로 둔다.
const GAP = 8; let splitN = 0;
function mainEra(recs) {
  const ys = [...new Set(recs.filter((r) => r.y).map((r) => r.y))].sort((a, b) => a - b);
  const eras = []; for (const y of ys) { const e = eras[eras.length - 1]; if (e && y - e.y1 < GAP) e.y1 = y; else eras.push({ y0: y, y1: y }); }
  if (eras.length <= 1) return recs;
  const cnt = (e) => recs.filter((r) => r.y >= e.y0 && r.y <= e.y1).length;
  const best = eras.reduce((a, b) => (cnt(b) > cnt(a) ? b : a));
  splitN++; return recs.filter((r) => !r.y || (r.y >= best.y0 && r.y <= best.y1));
}
for (const [k, { dexName }] of targets) {
  const P = computeProfile(dexName, mainEra(recsBy.get(k)), ecoName, MIN);
  if (!P) continue;
  P.src = "db";
  const extra = Buffer.byteLength(JSON.stringify(k) + ":" + JSON.stringify(P) + ",");
  if (size + extra > BUDGET) { console.log("용량 예산(" + (BUDGET / 1024) + "KB)에 닿아 멈춤 — 남은 후보 " + (targets.length - added.length) + "명"); break; }
  if (out.p[k]) { console.warn("키 충돌 — 건너뜀:", k, out.p[k].name, "/", dexName); continue; }
  out.p[k] = P; size += extra; added.push([dexName, P.n, P.peak[0], P.y0 + "–" + P.y1]);
}
console.log("동명이인 의심으로 연속 구간만 쓴 선수 " + splitN + "명");
console.log("추가 " + added.length + "명 → 프로필 " + Object.keys(out.p).length + "명, 약 " + (size / 1024).toFixed(0) + "KB");
added.slice(0, 15).forEach((a) => console.log("  " + a.join(" · ")));
if (!DRY) writeFileSync(PROF_PATH, JSON.stringify(out));
