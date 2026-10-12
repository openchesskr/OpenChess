#!/usr/bin/env node
/** (v0.6.6) PGN Mentor 파일이 없는 대회(올림피아드·FIDE 그랜드 스위스·월드컵 …)의 회차 데이터를 마스터 대국 DB(public/master-games.json)에서 만든다.
 *  예전엔 이런 대회의 연도 블록을 누르면 출전자 이름만 적힌 "대진표" 상자가 열려, 대국 하나 볼 수 없었다(BUG-082).
 *  출력: src/data/tournaments/<대회id>.json — build-pgn-tournaments.mjs의 결과와 같은 형식이라 도감의 회차 화면(EditionView)이 그대로 연다.
 *   · DB에는 실제 대회의 일부 대국만 있어(partial: 1) 순위·점수는 "DB 수록 대국 기준"이고 우승자는 판정하지 않는다. 대국 목록은 모두 열 수 있다.
 *   · 라운드·보드 정보가 DB에 없어 형식은 항상 "list"다.
 *  주의: build-pgn-tournaments.mjs는 src/data/tournaments를 통째로 지우고 다시 만든다 — 그걸 돌렸다면 이 스크립트도 다시 돌릴 것(check-tournament-data가 빠진 파일을 잡는다).
 *  대상은 chessTournaments.js의 대회 중 tournamentIndex.json에 연도 블록(editions)이 있는데 대회 데이터 파일이 없는 것 전부다.
 *  색인(tournamentIndex.json)의 이 대회들 대표 대국도 평문 수순(m) 대신 압축 부호(mc)로 바꾼다(회차 화면과 같은 규칙 — check-tournament-data가 mc를 요구하고 용량도 줄어든다).
 *  실행 순서: build-tournament-index → build-pgn-tournaments → build-db-tournaments.   실행: node scripts/build-db-tournaments.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { matchTournament } from "./lib/tournamentEvents.mjs";
import { encodeMoves } from "../src/lib/moveCodec.js";
import { TOURNAMENTS } from "../src/data/chessTournaments.js";

const ROOT = new URL("../", import.meta.url).pathname;
const db = JSON.parse(readFileSync(join(ROOT, "public/master-games.json"), "utf8")).games;
const idx = JSON.parse(readFileSync(join(ROOT, "src/data/tournamentIndex.json"), "utf8"));
const yearOf = (g) => (g.date && /^\d{4}/.test(g.date) ? parseInt(g.date.slice(0, 4), 10) : null);
const resCode = (r) => (r === "1-0" ? 2 : r === "0-1" ? 0 : r === "1/2-1/2" ? 1 : -1);
const eloOf = (v) => { const n = parseInt(v, 10); return n > 0 ? n : 0; };
const dateOf = (d) => (/^\d{4}\.\d\d\.\d\d$/.test(d || "") ? d : "");

const targets = TOURNAMENTS.filter((t) => idx.byId[t.id] && idx.byId[t.id].editions.length && !idx.byId[t.id].pgn);
const targetIds = new Set(targets.map((t) => t.id));
const byT = new Map([...targetIds].map((id) => [id, new Map()]));
db.forEach((g) => {
  const y = yearOf(g); if (y == null) return;
  for (const t of TOURNAMENTS) if (matchTournament(t.id, g.event, y)) { if (targetIds.has(t.id)) { const m = byT.get(t.id); if (!m.has(y)) m.set(y, []); m.get(y).push(g); } break; }   // 색인 빌더와 같은 규칙(첫 일치 대회)
});

function edition(y, games) {
  const evCount = new Map(); games.forEach((g) => evCount.set(g.event, (evCount.get(g.event) || 0) + 1));
  const evsAll = [...evCount.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  // 한 해에 이벤트 이름이 서너 개를 넘으면(같은 대회의 표기 차이) 모두 본 경기로 본다. 두세 개면 단계로 나눈다(예: 월드 래피드 · 월드 블리츠).
  const staged = evsAll.length >= 2 && evsAll.length <= 3;
  const stOf = (e) => (staged ? evsAll.indexOf(e) : 0);
  const P = new Map();
  const pl = (name, elo) => { let p = P.get(name); if (!p) { p = { name, elo: 0, s2: 0, n: 0 }; P.set(name, p); } if (elo > p.elo) p.elo = elo; return p; };
  const rows = games.map((g) => {
    const r = resCode(g.result), st = stOf(g.event), pw = pl(g.white, eloOf(g.whiteElo)), pb = pl(g.black, eloOf(g.blackElo));
    if (st === 0) { pw.n++; pb.n++; if (r === 2) pw.s2 += 2; else if (r === 0) pb.s2 += 2; else if (r === 1) { pw.s2++; pb.s2++; } }
    return { w: g.white, b: g.black, r, st, eco: g.eco || "", date: dateOf(g.date), code: encodeMoves(String(g.moves || "").split(" ").filter(Boolean)).code };
  });
  const players = [...P.values()].sort((a, b) => b.s2 - a.s2 || b.elo - a.elo || (a.name < b.name ? -1 : 1));
  const at = new Map(players.map((p, i) => [p.name, i]));
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  return {
    k: String(y), y, ev: evsAll[0], evs: staged ? evsAll.slice(1) : [], site: "", d0: dates[0] || "", d1: dates[dates.length - 1] || "", fmt: "list", dbl: 0, cov: 0, complete: 0, partial: 1, rounds: 0,
    pl: players.map((p) => [p.name, p.elo, "", p.s2, p.n]),
    g: rows.map((r) => { const a = [0, 0, at.get(r.w), at.get(r.b), r.r, r.code, r.eco]; if (r.st) a.push(r.st); return a; }),
  };
}

let total = 0;
const topPatched = [];
for (const t of targets) {
  const eds = [...byT.get(t.id).entries()].sort((a, b) => a[0] - b[0]).map(([y, gs]) => edition(y, gs));
  if (!eds.length) continue;
  writeFileSync(join(ROOT, "src/data/tournaments", t.id + ".json"), JSON.stringify({ id: t.id, eds }));
  const n = eds.reduce((a, e) => a + e.g.length, 0); total += n;
  const x = idx.byId[t.id];
  x.top = x.top.map((g) => { if (g.mc || !g.m) return g; const { m, ...rest } = g; return { ...rest, mc: encodeMoves(m.split(" ").filter(Boolean)).code }; }); topPatched.push(t.id);
  console.log(t.id.padEnd(16), eds.length + "개 회차", String(n).padStart(5) + "판 (색인 " + idx.byId[t.id].games + ")");
}
writeFileSync(join(ROOT, "src/data/tournamentIndex.json"), JSON.stringify(idx));
console.log("합계 " + total + "판 · 색인 대표 대국 압축 " + topPatched.length + "개 대회");
