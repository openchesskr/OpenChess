#!/usr/bin/env node
/** (v0.6.5) PGN Mentor 대회 PGN(events/*.pgn) → 도감 "마스터" 대회 데이터 생성.
 *  입력: --src <events 폴더>  (scripts/fetch-pgnmentor.mjs --only events/ 로 받은 파일. 저장소에는 올리지 않는다)
 *  출력(모두 저장소에 커밋하는 가공 결과):
 *   · src/data/tournaments/<대회id>.json   대회 하나의 모든 회차(선수·라운드·결과·압축한 수순) — 대회를 열 때만 지연 로드
 *   · src/data/tournamentsAuto.js          새로 생긴 대회 시리즈의 메타(chessTournaments.js가 손으로 쓴 대회 뒤에 이어 붙임)
 *   · src/data/tournamentIndex.json        가공된 대회의 색인(연도 블록·최다 출전·대표 대국·집계 결과·우승자 대조) — build-tournament-index.mjs의 결과 위에 덮어씀
 *   · src/data/tournamentSearch.json       선수 이름 → 출전한 대회(검색용, 지연 로드)
 *  연결 순서: ① 파일명 예외 → ② 파일명 접두어(손으로 쓴 대회) → ③ 이벤트 정규식(lib/tournamentEvents.mjs, 대회 기간 안일 때만) → ④ 접두어 기준 새 시리즈.
 *  회차 = 파일 하나. 한 파일에 서로 다른 Event가 섞이면(예: Norway Chess + Armageddon) 가장 많은 Event가 본 경기, 나머지는 같은 회차의 다른 단계로 붙는다.
 *  선수 이름은 "Aronian,L"·"Aronian, Levon" 표기를 하나로 합친다. 수순은 src/lib/moveCodec.js로 압축(약 3배 작음).
 *  실행: node scripts/build-pgn-tournaments.mjs --src <폴더>   (약 10분 — chess.js로 모든 수를 검증하며 압축)
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { cpus } from "node:os";
import { norm, normalizeNames } from "./lib/pgnParse.mjs";
import { matchTournament } from "./lib/tournamentEvents.mjs";
import { PLACE_KO, PLACE_EN, PLACE_CC, SERIES_OVERRIDE } from "./lib/placeKo.mjs";
import { TOURNAMENTS as MANUAL } from "../src/data/chessTournaments.manual.js";
import { WINNERS } from "../src/data/chessTournamentWinners.js";

const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const SRC = resolve(String(opt("src", "")));
if (!opt("src") || !existsSync(SRC)) { console.error("사용법: node scripts/build-pgn-tournaments.mjs --src <events 폴더>"); process.exit(1); }
const ROOT = new URL("../", import.meta.url).pathname;
const OUT = join(ROOT, "src/data/tournaments");

// ── 연결 규칙 ──
const FILE_OVERRIDE = { Zurich1953: "zurich", AVRO1938: "avro", Nottingham1936: "nottingham", Carlsbad1907: "pm_karlsbad" };
const PREFIX_MAP = { hastings: "hastings", wijkaanzee: "tata", dortmund: "dortmund", linares: "linares", candidates: "candidates", shamkir: "gashimov", worldcup: "worldCup" };
const PREFIX_ALIAS = { carlsbad: "karlsbad" };          // 같은 도시의 두 철자
const CYCLE = new Set(["interzonal", "wccqual", "pcachamp", "pcaqual", "pcacand", "fidechamp", "worldchamp", "candidates"]);
const manualById = new Map(MANUAL.map((t) => [t.id, t]));
const inLife = (t, y) => y >= t.from - 1 && (t.to == null || y <= t.to + 1);

// ── 1) 파싱·압축(작업자 4개) ──
const files = readdirSync(SRC).filter((f) => f.endsWith(".pgn")).sort();
const N = Math.max(1, Math.min(cpus().length, 8)), buckets = Array.from({ length: N }, () => []);
files.forEach((f, i) => buckets[i % N].push(join(SRC, f)));
console.log("파일 " + files.length + "개 → 작업자 " + N + "개로 파싱·압축");
let doneCount = 0; const t0 = Date.now();
const parsed = (await Promise.all(buckets.map((b) => new Promise((res, rej) => {
  const w = new Worker(new URL("./lib/pgnWorker.mjs", import.meta.url), { workerData: { files: b } });
  w.on("message", (m) => { if (m.progress) { if (++doneCount % 100 === 0) console.log("  " + doneCount + "/" + files.length + " (" + Math.round((Date.now() - t0) / 1000) + "초)"); } else if (m.done) res(m.done); });
  w.on("error", rej);
})))).flat();
console.log("파싱·압축 완료 (" + Math.round((Date.now() - t0) / 1000) + "초)");

// ── 2) 이름 합치기 ──
const counts = new Map();
for (const f of parsed) for (const g of f.games) for (const k of [g.white, g.black]) counts.set(k, (counts.get(k) || 0) + 1);
const canon = normalizeNames(counts); const cn = (s) => canon.get(s) || s;
console.log("선수 이름 " + counts.size + " → 대표 표기 " + new Set(canon.values()).size);

// ── 3) 회차 만들기 ──
const mode = (arr) => { const m = new Map(); arr.forEach((x) => m.set(x, (m.get(x) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; };
const stripCc = (s) => { const m = /^(.*?)(?:\s+([A-Z]{3}))?$/.exec(String(s || "").trim()); return { city: (m[1] || "").trim(), cc: m[2] || "" }; };
const resCode = (r) => (r === "1-0" ? 2 : r === "0-1" ? 0 : r === "1/2-1/2" ? 1 : -1);
const eloOf = (s) => { const n = parseInt(s, 10); return n > 0 ? n : 0; };
const dateOf = (d) => { const m = /^(\d{4})\.(\d\d)\.(\d\d)$/.exec(d || ""); return m ? d : ""; };
const keyOf = (a, b) => (a < b ? a + "\u0000" + b : b + "\u0000" + a);

function buildEdition(file, games) {
  const base = file.replace(/^.*\//, "").replace(/\.pgn$/, "");
  const y = +(/(\d{4})/.exec(base) || [])[1];
  const evCount = new Map(); games.forEach((g) => evCount.set(g.ev, (evCount.get(g.ev) || 0) + 1));
  const evs = [...evCount.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  const main = evs[0];
  const P = new Map();   // 이름 → { elo, title, s2, n }
  const pl = (name, elo, title) => { let p = P.get(name); if (!p) { p = { name, elo: 0, title: "", s2: 0, n: 0 }; P.set(name, p); } if (elo > p.elo) p.elo = elo; if (title && !p.title) p.title = title; return p; };
  const rows = [];
  for (const g of games) {
    const w = cn(g.white), b = cn(g.black), r = resCode(g.result), st = evs.indexOf(g.ev);
    const pw = pl(w, eloOf(g.we), g.wt), pb = pl(b, eloOf(g.be), g.bt);
    const m = /^(\d+)(?:\.(\d+))?$/.exec(g.round.trim());
    const rd = m ? +m[1] : 0, bd = m && m[2] ? +m[2] : 0;
    if (st === 0) { pw.n++; pb.n++; if (r === 2) pw.s2 += 2; else if (r === 0) pb.s2 += 2; else if (r === 1) { pw.s2++; pb.s2++; } }
    rows.push({ rd, bd, w, b, r, code: g.code, eco: g.eco, st, we: eloOf(g.we), be: eloOf(g.be), date: dateOf(g.date), n: g.n, total: g.total });
  }
  const players = [...P.values()].sort((a, b) => b.s2 - a.s2 || b.elo - a.elo || (a.name < b.name ? -1 : 1));
  const idx = new Map(players.map((p, i) => [p.name, i]));
  const mainRows = rows.filter((r) => r.st === 0);
  const n = players.filter((p) => p.n > 0).length;
  // 형식 판정: match(2명) · ko(라운드마다 짝이 줄고 한 짝이 여러 국) · rr(거의 모든 쌍) · swiss(라운드가 있고 쌍이 적음) · list
  const pairCnt = new Map(); mainRows.forEach((r) => { const k = keyOf(r.w, r.b); pairCnt.set(k, (pairCnt.get(k) || 0) + 1); });
  const dotted = mainRows.filter((r) => r.bd > 0).length / (mainRows.length || 1), known = mainRows.filter((r) => r.rd > 0).length / (mainRows.length || 1);
  let fmt = "list", cov = 0, dbl = false;
  const need = (n * (n - 1)) / 2; cov = need ? Math.min(1, pairCnt.size / need) : 0;
  if (n === 2) fmt = "match";
  else {
    let ko = false;
    if (dotted >= 0.9 && n >= 4) {
      const byRound = new Map(); mainRows.forEach((r) => { const k = r.rd; if (!byRound.has(k)) byRound.set(k, new Map()); const m = byRound.get(k), pk = keyOf(r.w, r.b); m.set(pk, (m.get(pk) || 0) + 1); });
      const rounds = [...byRound.keys()].sort((a, b) => a - b);
      const multi = [...byRound.values()].reduce((a, m) => a + [...m.values()].filter((c) => c >= 2).length, 0), pairsAll = [...byRound.values()].reduce((a, m) => a + m.size, 0);
      // 한 라운드 안에서 한 선수가 두 짝에 나오는 비율(이름 표기 차이·부전승 처리 때문에 아주 조금은 생긴다) — 5% 이하면 녹아웃으로 본다.
      let dupN = 0, appN = 0; for (const rr of rounds) { const seen = new Set(); for (const k of byRound.get(rr).keys()) for (const nm of k.split("\u0000")) { appN++; if (seen.has(nm)) dupN++; seen.add(nm); } }
      const disjoint = dupN / (appN || 1) <= 0.05;
      const shrink = rounds.length >= 2 && byRound.get(rounds[rounds.length - 1]).size < byRound.get(rounds[0]).size;
      ko = disjoint && shrink && multi / (pairsAll || 1) >= 0.5;
    }
    if (ko) fmt = "ko";
    else if (cov >= 0.8 && n <= 24) { fmt = "rr"; const two = [...pairCnt.values()].filter((c) => c >= 2).length / (pairCnt.size || 1); dbl = two >= 0.6; }
    else if (known >= 0.7 && n >= 6) fmt = "swiss";
    else if (n <= 24 && cov >= 0.5) fmt = "rr";
  }
  // 우승자
  let winners = [], top = 0;
  if (fmt === "ko") {
    const last = Math.max(...mainRows.map((r) => r.rd)), fin = mainRows.filter((r) => r.rd === last), sc = new Map();
    fin.forEach((r) => { const a = sc.get(r.w) || 0, b = sc.get(r.b) || 0; sc.set(r.w, a + (r.r === 2 ? 1 : r.r === 1 ? 0.5 : 0)); sc.set(r.b, b + (r.r === 0 ? 1 : r.r === 1 ? 0.5 : 0)); });
    const e = [...sc.entries()].sort((a, b) => b[1] - a[1]); if (e.length >= 2 && e[0][1] > e[1][1]) { winners = [e[0][0]]; top = e[0][1]; }
  } else if (players.length) { top = players[0].s2 / 2; winners = players.filter((p) => p.s2 === players[0].s2 && p.n > 0).map((p) => p.name); if (winners.length > 4) winners = []; }
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  const eq = [...pairCnt.values()]; const complete = fmt === "rr" && cov === 1 && new Set(eq).size === 1;
  const ed = {
    k: base, y, ev: main, evs: evs.slice(1), site: mode(games.map((g) => g.site)) || "", d0: dates[0] || "", d1: dates[dates.length - 1] || "", fmt, dbl: dbl ? 1 : 0, cov: Math.round(cov * 100), complete: complete ? 1 : 0,
    rounds: Math.max(0, ...mainRows.map((r) => r.rd)),
    pl: players.map((p) => [p.name, p.elo || 0, p.title || "", p.s2, p.n]),
    g: rows.map((r) => { const a = [r.rd, r.bd, idx.get(r.w), idx.get(r.b), r.r, r.code, r.eco || ""]; if (r.st) a.push(r.st); return a; }),
  };
  return { ed, winners, topScore: top, n, rows, players, mainRows, base, y, main };
}

// 회차 → 시리즈 연결
const prefixOf = (base) => base.replace(/\d{4}.*$/, "");
const eds = parsed.map((f) => buildEdition(f.file, f.games));
function seriesOf(e) {
  if (FILE_OVERRIDE[e.base]) return FILE_OVERRIDE[e.base];
  const px = norm(prefixOf(e.base)); if (PREFIX_MAP[px]) return PREFIX_MAP[px];
  for (const t of MANUAL) if (inLife(t, e.y) && matchTournament(t.id, e.main, e.y)) return t.id;
  return "pm_" + (PREFIX_ALIAS[px] || px);
}
const bySeries = new Map();
for (const e of eds) { const id = seriesOf(e); if (!bySeries.has(id)) bySeries.set(id, []); bySeries.get(id).push(e); }

// ── 4) 시리즈 메타(새 시리즈) ──
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const missingPlace = new Set();
const auto = [];
for (const [id, list] of bySeries) {
  if (manualById.has(id)) continue;
  const px = id.slice(3), ov = SERIES_OVERRIDE[px] || {};
  const ys = list.map((e) => e.y).sort((a, b) => a - b), y0 = ys[0], y1 = ys[ys.length - 1];
  const site = stripCc(mode(list.map((e) => e.ed.site)) || ""), rawCity = site.city || px;
  const place = ov.place || PLACE_EN[rawCity] || rawCity;
  const placeKo = ov.placeKo != null ? ov.placeKo : PLACE_KO[rawCity]; if (placeKo == null) missingPlace.add(rawCity);
  const uy = [...new Set(ys)]; const gaps = uy.slice(1).map((y, i) => y - uy[i]);
  const freq = uy.length === 1 ? "oneoff" : median(gaps) === 1 ? "annual" : median(gaps) === 2 ? "biennial" : undefined;
  // 종류: 세계선수권 사이클 계열은 cycle. 1975년 이전에 끝난 대회는 historic. 현대까지 이어지며 1970년 이후 회차의 상위 엘로 중앙값이 2600 이상이면 elite(슈퍼 토너먼트), 아니면 general.
  const edTop = list.filter((e) => e.y >= 1970).map((e) => Math.max(0, ...e.players.map((p) => p.elo))).filter(Boolean);
  const type = ov.type || (CYCLE.has(px) ? "cycle" : y1 <= 1975 ? "historic" : edTop.length >= 2 && median(edTop) >= 2600 ? "elite" : "general");
  const rec = { id, name: ov.name || place, ko: ov.ko || ((placeKo || place) + " 대회"), type, from: y0, place, placeKo: placeKo == null ? place : placeKo, cc: site.cc || ov.cc || PLACE_CC[rawCity] || "", auto: 1 };
  if (y1 < 2023 || uy.length === 1) rec.to = y1;
  if (freq) rec.freq = freq;
  auto.push(rec);
}
auto.sort((a, b) => a.from - b.from || (a.id < b.id ? -1 : 1));

// ── 5) 출력: 대회별 데이터 ──
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
let bytes = 0, totalGames = 0;
const seriesList = [];
for (const [id, list] of bySeries) {
  list.sort((a, b) => a.y - b.y || (a.base < b.base ? -1 : 1));
  const json = JSON.stringify({ id, eds: list.map((e) => e.ed) });
  writeFileSync(join(OUT, id + ".json"), json); bytes += json.length; totalGames += list.reduce((a, e) => a + e.rows.length, 0);
  seriesList.push(id);
}
writeFileSync(join(ROOT, "src/data/tournamentsAuto.js"), "// (v0.6.5) scripts/build-pgn-tournaments.mjs가 만든 파일 — 직접 고치지 않는다. 새로 생긴 대회 시리즈(PGN Mentor 대회 파일 기준)의 메타.\nexport const AUTO_TOURNAMENTS = " + JSON.stringify(auto) + ";\n");

// ── 6) 색인(tournamentIndex.json 위에 덮어쓰기) + 우승자 대조 ──
const idxPath = join(ROOT, "src/data/tournamentIndex.json");
const index = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, "utf8")) : { source: {}, byId: {} };
const surSet = (name) => { const sn = String(name).split(",")[0].trim(); const ks = new Set([norm(sn)]); for (const w of sn.split(/\s+/)) ks.add(norm(w)); return ks; };   // 복합 성("Dominguez Perez")은 낱말마다도
const winnerKeys = (name) => { const p = String(name).split(/\s+/).map(norm).filter(Boolean); return new Set([p[p.length - 1], p[0], p.join(""), p.slice(-2).join("")]); };
const conflicts = [];
const allT = [...MANUAL, ...auto];
for (const t of allT) {
  const list = bySeries.get(t.id); if (!list) continue;
  const byYear = new Map(); for (const e of list) { if (!byYear.has(e.y)) byYear.set(e.y, []); byYear.get(e.y).push(e); }
  const editions = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([y, es]) => {
    const names = new Map(); es.forEach((e) => e.players.forEach((p) => names.set(p.name, Math.max(names.get(p.name) || 0, p.s2))));
    const nm = [...names.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    return [y, es.reduce((a, e) => a + e.rows.length, 0), nm.length, nm.slice(0, 16)];
  });
  const cnt = new Map(); list.forEach((e) => e.rows.forEach((r) => { cnt.set(r.w, (cnt.get(r.w) || 0) + 1); cnt.set(r.b, (cnt.get(r.b) || 0) + 1); }));
  const players = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const rate = (r) => Math.max(r.we, r.be);
  const cand = []; list.forEach((e) => e.rows.forEach((r, i) => { if (r.n >= 24 && r.r >= 0 && r.st === 0) cand.push({ e, r, i }); }));
  cand.sort((a, b) => rate(b.r) - rate(a.r) || b.r.n - a.r.n);
  const topG = cand.slice(0, 8).map(({ e, r, i }) => ({ id: "pg_" + t.id + "_" + e.base + "_" + i, w: r.w, b: r.b, we: r.we || null, be: r.be || null, y: e.y, r: r.r === 2 ? "1-0" : r.r === 0 ? "0-1" : "1/2-1/2", ev: e.main, mc: r.code }));
  const complete = [], partial = [];
  for (const e of list) {
    if (e.ed.fmt !== "rr" || e.n < 4 || e.n > 16 || e.ed.cov < 80) continue;
    const row = { y: e.y, n: e.n, games: e.mainRows.length, cov: e.ed.cov, winners: e.winners, score: e.topScore, k: e.base };
    if (!e.winners.length) continue;
    (e.ed.complete ? complete : partial).push(row);
  }
  const wc = {};
  for (const [year, names] of WINNERS[t.id] || []) {
    const pool = new Set(); let any = false, nGames = 0;
    for (const y of [year, year + 1, year - 1]) {
      if (!byYear.has(y)) continue; if (y !== year && t.id !== "candidates") continue;
      // 본 대회가 아닌 부문(오픈·B그룹: 스위스·목록형)만 있는 해는 우승자를 대조할 수 없다 → nodata
      const real = byYear.get(y).filter((e) => e.ed.fmt === "rr" || e.ed.fmt === "ko" || e.ed.fmt === "match"); if (!real.length) continue;
      any = true; for (const e of real) { nGames += e.rows.length; e.players.forEach((p) => surSet(p.name).forEach((k) => pool.add(k))); }
    }
    if (t.type === "team" || !any || pool.size < 8 || nGames < 20) { wc[year] = "nodata"; continue; }
    const ok = names.every((n) => [...winnerKeys(n)].some((k) => pool.has(k)));
    wc[year] = ok ? "ok" : "conflict"; if (!ok) conflicts.push(t.id + " " + year + " " + names.join("/"));
  }
  index.byId[t.id] = { games: list.reduce((a, e) => a + e.rows.length, 0), y0: editions[0][0], y1: editions[editions.length - 1][0], editions, players, top: topG, complete, partial, winnerCheck: wc, pgn: 1 };
}
index.source = { ...index.source, pgnGames: totalGames, pgnSeries: seriesList.length };
writeFileSync(idxPath, JSON.stringify(index));

// ── 7) 선수 검색 색인 ──
const sidx = new Map(); // 이름 → Map(시리즈 번호 → [횟수, y0, y1])
const sl = [...bySeries.keys()];
for (const [id, list] of bySeries) for (const e of list) for (const p of e.players) { if (!p.n) continue; if (!sidx.has(p.name)) sidx.set(p.name, new Map()); const m = sidx.get(p.name), k = sl.indexOf(id), c = m.get(k) || [0, 9999, 0]; c[0]++; c[1] = Math.min(c[1], e.y); c[2] = Math.max(c[2], e.y); m.set(k, c); }
const search = { t: sl, p: {} };
for (const [name, m] of sidx) search.p[name] = [...m.entries()].sort((a, b) => b[1][0] - a[1][0]).map(([k, c]) => [k, c[0], c[1], c[2]]);
writeFileSync(join(ROOT, "src/data/tournamentSearch.json"), JSON.stringify(search));

// ── 요약 ──
const manualCovered = MANUAL.filter((t) => bySeries.has(t.id)), manualNone = MANUAL.filter((t) => !bySeries.has(t.id));
console.log("\n=== 요약 ===\n대회 시리즈 " + bySeries.size + "개(손으로 쓴 대회 " + manualCovered.length + " + 새 시리즈 " + auto.length + "), 회차 " + eds.length + "개, 대국 " + totalGames + "판, 대회 데이터 " + (bytes / 1048576).toFixed(1) + "MB");
console.log("손으로 쓴 대회 중 데이터 있음: " + manualCovered.map((t) => t.id + "(" + bySeries.get(t.id).length + ")").join(" "));
console.log("손으로 쓴 대회 중 데이터 없음: " + manualNone.map((t) => t.id).join(" "));
const fm = {}; eds.forEach((e) => { fm[e.ed.fmt] = (fm[e.ed.fmt] || 0) + 1; }); console.log("형식 판정: " + JSON.stringify(fm));
if (missingPlace.size) console.log("\n⚠ 한국어 개최지 이름이 없는 곳(scripts/lib/placeKo.mjs에 추가): " + [...missingPlace].sort().join(" | "));
if (conflicts.length) console.log("\n⚠ 우승자 conflict(입력 오류 후보):\n  " + conflicts.join("\n  "));
