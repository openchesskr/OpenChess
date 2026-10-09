#!/usr/bin/env node
/** (v0.6.5) PGN Mentor 선수별 대국 모음(players/*.zip) → 마스터 상세 프로필(src/data/masterProfiles.json).
 *  입력: --src <players 폴더>  (scripts/fetch-pgnmentor.mjs --only players/ 로 받은 zip. 시스템 unzip 필요. 저장소에는 올리지 않는다)
 *  출력: src/data/masterProfiles.json  { p: { "성|이름첫글자": 프로필 } } — 도감 마스터 상세 카드가 처음 열 때 지연 로드
 *  프로필 항목(모두 그 선수의 시점):
 *   n(대국 수) · y0/y1(첫·마지막 대국 연도) · wdl[승,무,패] · w/b[백·흑 전적 [승,무,패]] · peak[최고 엘로, 연도] · elo[[연도, 그 해 최고 엘로]…](5년 이상 비어 있으면 그대로)
 *   fm(백 첫 수 [수, 판수, 점수율%]) · e4/d4(검은색으로 1.e4·1.d4에 둔 응수 [수, 판수, 점수율%]) · ecoW/ecoB(백·흑으로 자주 둔 ECO [코드, 이름, 판수, 점수율%])
 *   len(평균 수 길이=한 수는 백·흑 한 쌍) · draw(무승부 %) · opp(자주 만난 상대 [이름, 판수, 승, 무, 패]) · ev(자주 나온 대회 [이름, 판수, 첫 연도, 마지막 연도]) · best(엘로 높은 상대를 이긴 대국 6판 [연도, 대회, 상대, 상대 엘로, 색, 수순 부호])
 *  선수 이름 표기는 build-pgn-tournaments와 같은 규칙(lib/pgnParse.mjs normalizeNames)으로 합친다. 열 때 이름 매칭 키는 build-db-masters.mjs와 같은 "성(영문 소문자)|이름 첫 글자".
 *  실행: node scripts/build-master-profiles.mjs --src <폴더>
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parsePgn, norm, normalizeNames } from "./lib/pgnParse.mjs";
import { encodeMoves } from "../src/lib/moveCodec.js";

const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
if (!opt("src") || !existsSync(resolve(opt("src")))) { console.error("사용법: node scripts/build-master-profiles.mjs --src <players 폴더>"); process.exit(1); }
const SRC = resolve(opt("src")), ROOT = new URL("../", import.meta.url).pathname;
const asciiKey = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();
const resCode = (r) => (r === "1-0" ? "W" : r === "0-1" ? "B" : r === "1/2-1/2" ? "D" : "?");
const eloOf = (s) => { const n = parseInt(s, 10); return n > 0 ? n : 0; };
const yearOf = (d) => { const m = /^(\d{4})/.exec(d || ""); return m ? +m[1] : 0; };
const pct = (s, n) => (n ? Math.round((s / n) * 100) : 0);

// ECO → 오프닝 이름(openings.json 트리에서 가장 먼저 나오는 = 가장 일반적인 이름)
const tree = JSON.parse(readFileSync(join(ROOT, "src/data/openings.json"), "utf8")).tree;
const ecoName = {};
for (const node of Object.values(tree)) for (const m of node.moves || []) if (m.eco && m.name && !ecoName[m.eco]) ecoName[m.eco] = m.name;

// 1) 모든 zip 풀어 파싱
const zips = readdirSync(SRC).filter((f) => f.endsWith(".zip")).sort();
const data = [];
for (const z of zips) {
  const r = spawnSync("unzip", ["-p", join(SRC, z)], { maxBuffer: 1 << 30 });
  if (r.status !== 0) { console.warn("풀기 실패:", z); continue; }
  data.push({ file: z.replace(/\.zip$/, ""), games: parsePgn(r.stdout.toString("utf8")) });
}
console.log("zip " + data.length + "개, 대국 " + data.reduce((a, d) => a + d.games.length, 0) + "판");

// 2) 이름 합치기(전체 상대 포함)
const counts = new Map();
for (const d of data) for (const g of d.games) for (const k of [g.tags.White, g.tags.Black]) counts.set(k, (counts.get(k) || 0) + 1);
const canon = normalizeNames(counts); const cn = (s) => canon.get(s) || s;

// 3) 선수별 프로필
// 쉼표 없는 표기에서 성을 잘못 짚는 이름(성이 둘째 낱말 이후인 경우)
const NAME_FIX = { "Carlos Torre Repetto": "Torre Repetto, Carlos" };
const keyOfName = (name) => { const i = name.indexOf(","); const sur = i >= 0 ? name.slice(0, i) : name.split(" ")[0], giv = i >= 0 ? name.slice(i + 1) : name.split(" ").slice(1).join(" "); return asciiKey(sur) + "|" + asciiKey(giv).slice(0, 1); };
const profiles = {}; const summary = [];
for (const d of data) {
  // 이 파일의 주인공 = 가장 자주 나오는 대표 이름
  const c = new Map(); for (const g of d.games) for (const k of [cn(g.tags.White), cn(g.tags.Black)]) c.set(k, (c.get(k) || 0) + 1);
  const subject0 = [...c.entries()].sort((a, b) => b[1] - a[1])[0][0], subject = NAME_FIX[subject0] || subject0, subKey = keyOfName(subject0 === subject ? subject : subject);
  const P = { name: subject, n: 0, y0: 9999, y1: 0, wdl: [0, 0, 0], w: [0, 0, 0], b: [0, 0, 0] };
  const eloByYear = new Map(), fm = new Map(), e4 = new Map(), d4 = new Map(), ecoW = new Map(), ecoB = new Map(), opp = new Map(), ev = new Map();
  let plies = 0, lenN = 0, peak = [0, 0]; const wins = [];
  const bump = (m, k, sc) => { const x = m.get(k) || [0, 0]; x[0]++; x[1] += sc; m.set(k, x); };
  for (const g of d.games) {
    const w = cn(g.tags.White), b = cn(g.tags.Black), key0 = keyOfName(subject0), isW = keyOfName(w) === subKey || keyOfName(w) === key0, isB = keyOfName(b) === subKey || keyOfName(b) === key0;
    if (!isW && !isB) continue;
    const res = resCode(g.tags.Result); if (res === "?") continue;
    const sc = res === "D" ? 0.5 : (res === "W") === isW ? 1 : 0, ix = sc === 1 ? 0 : sc === 0.5 ? 1 : 2;
    const y = yearOf(g.tags.Date), myElo = eloOf(isW ? g.tags.WhiteElo : g.tags.BlackElo), oppElo = eloOf(isW ? g.tags.BlackElo : g.tags.WhiteElo), oppName = isW ? b : w;
    P.n++; if (y) { P.y0 = Math.min(P.y0, y); P.y1 = Math.max(P.y1, y); } P.wdl[ix]++; (isW ? P.w : P.b)[ix]++;
    if (myElo) { if (y) eloByYear.set(y, Math.max(eloByYear.get(y) || 0, myElo)); if (myElo > peak[0]) peak = [myElo, y]; }
    if (g.moves.length) { plies += g.moves.length; lenN++; }
    const m0 = g.moves[0], m1 = g.moves[1];
    if (isW && m0) bump(fm, m0, sc);
    if (isB && m0 === "e4" && m1) bump(e4, m1, sc);
    if (isB && m0 === "d4" && m1) bump(d4, m1, sc);
    if (g.tags.ECO) bump(isW ? ecoW : ecoB, g.tags.ECO, sc);
    const o = opp.get(oppName) || [0, 0, 0, 0]; o[0]++; o[1 + ix]++; opp.set(oppName, o);
    const evName = (g.tags.Event || "").replace(/\b(19|20)\d\d\b.*$/, "").replace(/\s+/g, " ").trim() || "?";
    const e = ev.get(evName) || [0, 9999, 0]; e[0]++; if (y) { e[1] = Math.min(e[1], y); e[2] = Math.max(e[2], y); } ev.set(evName, e);
    if (sc === 1 && oppElo >= 2400 && g.moves.length >= 20) wins.push({ y, ev: evName, opp: oppName, oppElo, color: isW ? "w" : "b", moves: g.moves });
  }
  if (P.n < 20) { console.warn("대국이 너무 적어 건너뜀:", d.file, P.n); continue; }
  const top = (m, k, f) => [...m.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, k).map(([x, v]) => f(x, v));
  P.peak = peak; P.elo = [...eloByYear.entries()].sort((a, b) => a[0] - b[0]);
  P.fm = top(fm, 5, (x, v) => [x, v[0], pct(v[1], v[0])]); P.e4 = top(e4, 4, (x, v) => [x, v[0], pct(v[1], v[0])]); P.d4 = top(d4, 4, (x, v) => [x, v[0], pct(v[1], v[0])]);
  P.ecoW = top(ecoW, 6, (x, v) => [x, ecoName[x] || "", v[0], pct(v[1], v[0])]); P.ecoB = top(ecoB, 6, (x, v) => [x, ecoName[x] || "", v[0], pct(v[1], v[0])]);
  P.len = lenN ? Math.round(plies / lenN / 2) : 0; P.draw = pct(P.wdl[1], P.n);
  P.opp = [...opp.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, 8).map(([x, v]) => [x, v[0], v[1], v[2], v[3]]);
  P.ev = top(ev, 8, (x, v) => [x, v[0], v[1] === 9999 ? 0 : v[1], v[2]]);
  wins.sort((a, b) => b.oppElo - a.oppElo || b.moves.length - a.moves.length);
  // 같은 상대에게 거둔 승리는 2판까지만(레이팅 높은 한 명에게 몰리지 않게)
  const perOpp = new Map(), pick = [];
  for (const w of wins) { const c = perOpp.get(w.opp) || 0; if (c >= 2) continue; perOpp.set(w.opp, c + 1); pick.push(w); if (pick.length === 6) break; }
  P.best = pick.map((x) => [x.y, x.ev, x.opp, x.oppElo, x.color, encodeMoves(x.moves).code]);
  if (profiles[subKey]) { console.warn("키 충돌 — 대국이 더 많은 쪽 유지:", subKey, profiles[subKey].name, "/", subject); if (profiles[subKey].n >= P.n) continue; }
  profiles[subKey] = P; summary.push([subject, P.n, P.y0 + "–" + P.y1]);
}
writeFileSync(join(ROOT, "src/data/masterProfiles.json"), JSON.stringify({ p: profiles }));
const size = readFileSync(join(ROOT, "src/data/masterProfiles.json")).length;
console.log("프로필 " + Object.keys(profiles).length + "명, 파일 " + (size / 1024).toFixed(0) + "KB");
summary.sort((a, b) => b[1] - a[1]).slice(0, 8).forEach((s) => console.log("  " + s.join(" · ")));
