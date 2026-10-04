#!/usr/bin/env node
/** (v0.6.3) 마스터 대국 DB → 도감 대회 색인(src/data/tournamentIndex.json) 생성.
 *  입력: public/master-games.json(대국마다 event·date), src/data/chessTournaments.js, src/data/chessTournamentWinners.js
 *  출력(대회 id별):
 *   · games·years·editions(연도별 대국 수·선수 수) — DB에 실제로 있는 만큼만(수록은 일부라 실제 대회보다 적다)
 *   · players: 최다 출전 5명 · top: 대표 대국 8판(최고 레이팅 우선, 기보 포함 — 도감에서 바로 열기)
 *   · complete: 모든 쌍이 같은 횟수로 붙은 "대국이 완전한" 라운드로빈 연도만 — 그 순위(우승자 추정, 승1·무0.5)
 *   · winnerCheck: 손으로 입력한 우승자(chessTournamentWinners.js)를 DB와 대조 — ok(우승자가 그 연도 출전자 중에 있음) · conflict(DB에 그 연도 대회가 있는데 우승자가 없음) · nodata(DB에 그 연도 대회 없음)
 *  실행: node scripts/build-tournament-index.mjs  (결과 요약과 conflict 목록을 출력한다 — conflict는 입력 오류 후보) */
import { readFileSync, writeFileSync } from "node:fs";
import { matchTournament } from "./lib/tournamentEvents.mjs";
import { TOURNAMENTS } from "../src/data/chessTournaments.js";
import { WINNERS } from "../src/data/chessTournamentWinners.js";

const db = JSON.parse(readFileSync(new URL("../public/master-games.json", import.meta.url), "utf8")).games;
const yearOf = (g) => (g.date && /^\d{4}/.test(g.date) ? parseInt(g.date.slice(0, 4), 10) : null);
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const sur = (n) => norm(String(n).split(",")[0]);   // DB 이름 "Carlsen,M" → "carlsen"
const winnerKeys = (name) => { const parts = String(name).split(/\s+/).map(norm).filter(Boolean); return new Set([parts[parts.length - 1], parts[0], parts.join(""), parts.slice(-2).join("")]); };  // "Ding Liren" → ding / liren; "Maxime Vachier-Lagrave" → vachierlagrave
const byT = new Map(TOURNAMENTS.map((t) => [t.id, []]));
db.forEach((g, i) => { const y = yearOf(g); for (const t of TOURNAMENTS) if (matchTournament(t.id, g.event, y)) { byT.get(t.id).push({ g, i, y }); break; } });

const out = { source: { games: db.length }, byId: {} };
const conflicts = [];
for (const t of TOURNAMENTS) {
  const rows = byT.get(t.id);
  const ed = new Map();
  for (const r of rows) { if (r.y == null) continue; if (!ed.has(r.y)) ed.set(r.y, []); ed.get(r.y).push(r); }
  const editions = [...ed.entries()].sort((a, b) => a[0] - b[0]).map(([y, rs]) => { const p = new Set(); rs.forEach((r) => { p.add(r.g.white); p.add(r.g.black); }); return [y, rs.length, p.size]; });
  const cnt = new Map(); for (const r of rows) for (const n of [r.g.white, r.g.black]) cnt.set(n, (cnt.get(n) || 0) + 1);
  const players = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  // 대표 대국: 높은 쪽 레이팅 순(없으면 길이), 기보 24수 이상, 결과가 난 대국
  const cand = rows.filter((r) => r.g.moves && r.g.moves.split(" ").length >= 24 && /^(1-0|0-1|1\/2-1\/2)$/.test(r.g.result || ""));
  const rate = (g) => Math.max(parseInt(g.whiteElo, 10) || 0, parseInt(g.blackElo, 10) || 0);
  cand.sort((a, b) => rate(b.g) - rate(a.g) || b.g.moves.length - a.g.moves.length);
  const top = cand.slice(0, 8).map((r) => ({ id: "extm_" + r.i, w: r.g.white, b: r.g.black, we: parseInt(r.g.whiteElo, 10) || null, be: parseInt(r.g.blackElo, 10) || null, y: r.y, r: r.g.result, ev: r.g.event, m: r.g.moves }));
  // 라운드로빈 집계: 4~16명 대회에서 "서로 붙은 쌍" 수가 (선수 수 × (선수 수-1) / 2)의 몇 %인지(coverage)를 구한다.
  //  · 모든 쌍이 같은 횟수로 갖춰진(100%) 연도 = complete — 순위가 확정이라 우승자를 DB로 확인할 수 있다.
  //  · 80% 이상이면 partial — 빠진 대국이 있어 참고용(선두가 실제와 다를 수 있다).
  const complete = [], partial = [];
  for (const [y, rs] of ed) {
    const pl = new Set(); rs.forEach((r) => { pl.add(r.g.white); pl.add(r.g.black); });
    const n = pl.size; if (n < 4 || n > 16) continue;
    const pairs = new Map(); rs.forEach((r) => { const k = [r.g.white, r.g.black].sort().join("|"); pairs.set(k, (pairs.get(k) || 0) + 1); });
    const need = (n * (n - 1)) / 2, cov = pairs.size / need;
    if (cov < 0.8) continue;
    const sc = new Map(); rs.forEach((r) => { const res = r.g.result; const a = r.g.white, b = r.g.black; sc.set(a, sc.get(a) || 0); sc.set(b, sc.get(b) || 0); if (res === "1-0") sc.set(a, sc.get(a) + 1); else if (res === "0-1") sc.set(b, sc.get(b) + 1); else if (res === "1/2-1/2") { sc.set(a, sc.get(a) + 0.5); sc.set(b, sc.get(b) + 0.5); } });
    const best = Math.max(...sc.values());
    const row = { y, n, games: rs.length, cov: Math.round(cov * 100), winners: [...sc.entries()].filter(([, v]) => v === best).map(([k]) => k), score: best };
    (cov === 1 && new Set(pairs.values()).size === 1 ? complete : partial).push(row);
  }
  // 우승자 대조
  const wc = {};
  for (const [year, names] of WINNERS[t.id] || []) {
    const pool = new Set(); let any = false, nGames = 0;
    for (const y of [year, year + 1, year - 1]) { if (!ed.has(y)) continue; if (y !== year && t.id !== "candidates") continue; any = true; nGames += ed.get(y).length; ed.get(y).forEach((r) => { pool.add(sur(r.g.white)); pool.add(sur(r.g.black)); }); }
    // 팀 대회의 우승 "나라"는 선수 출전 대조를 할 수 없고, 수록이 적은 연도(선수 8명 미만·20판 미만 — 다른 하위 대회 표본이 섞이는 경우가 있다)는 우승자가 없어도 오류로 볼 수 없다 — 둘 다 nodata.
    if (t.type === "team" || !any || pool.size < 8 || nGames < 20) { wc[year] = "nodata"; continue; }
    const ok = names.every((n) => [...winnerKeys(n)].some((k) => pool.has(k)));
    wc[year] = ok ? "ok" : "conflict";
    if (!ok) conflicts.push(t.id + " " + year + " " + names.join("/"));
  }
  out.byId[t.id] = { games: rows.length, y0: editions.length ? editions[0][0] : null, y1: editions.length ? editions[editions.length - 1][0] : null, editions, players, top, complete, partial, winnerCheck: wc };
}
writeFileSync(new URL("../src/data/tournamentIndex.json", import.meta.url), JSON.stringify(out));
for (const t of TOURNAMENTS) { const o = out.byId[t.id]; const wc = Object.values(o.winnerCheck); console.log(t.id.padEnd(14), String(o.games).padStart(5), "games", String(o.editions.length).padStart(3), "editions", "complete", o.complete.length, "partial", o.partial.length, "| winners ok", wc.filter((x) => x === "ok").length, "nodata", wc.filter((x) => x === "nodata").length, "conflict", wc.filter((x) => x === "conflict").length); }
if (conflicts.length) console.log("\n⚠ 우승자 conflict(입력 오류 후보):\n  " + conflicts.join("\n  "));
