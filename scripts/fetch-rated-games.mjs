#!/usr/bin/env node
/** (v0.6.7) 퍼포먼스 레이팅 보정용, chess.com 공개 API에서 레이팅대별 대국 수집. 로그인·계정 연동은 필요 없다(공개 API, 아이디만으로 대국과 대국 당시 레이팅이 나온다).
 *  마스터 대회 표본(FIDE 2300~2850)만으로는 일반 사용자의 정확도 구간을 실측할 수 없어서, 낮은 레이팅대를 이 수집으로 채운다.
 *
 *  실행(샌드박스에서는 Node fetch가 프록시를 쓰도록 NODE_USE_ENV_PROXY=1이 필요하다):
 *    NODE_USE_ENV_PROXY=1 node scripts/fetch-rated-games.mjs games [출력.ndjson=scripts/calibration/chesscom-games.ndjson]
 *      레이팅 구간(BAND점)마다 PLAYERS_PER_BAND명을 무작위로 골라, 각자의 최근 TIME_CLASS 대국 GAMES_PER_PLAYER판을 모은다. 이어서 하기 지원(받은 대국 id는 건너뜀).
 *    NODE_USE_ENV_PROXY=1 node scripts/fetch-rated-games.mjs offset [출력.json=scripts/calibration/chesscom-fide-offset.json]
 *      FIDE 레이팅이 공개된 타이틀 선수들의 chess.com 급수(래피드·블리츠)와 FIDE를 짝지어 두 척도의 차이를 잰다.
 *
 *  출력 대국 한 줄: { id, sans[], wElo, bElo, wName, bName, tc, timeClass, pool:"chesscom" }, scripts/calibrate-performance.mjs의 SOURCE로 읽는다.
 *  옵션(환경변수): TIME_CLASS=rapid · BAND=100 · MIN_BAND=500 · MAX_BAND=2400 · PLAYERS_PER_BAND=8 · GAMES_PER_PLAYER=4 · MIN_PLIES=40 · COUNTRIES=KR,US,IN,RU,DE,BR,GB,FR,ES,PL,TR,EG
 *            MIN_RECORD=150(선수의 해당 시간 규정 누적 판 수 하한) · MAX_RD=90(레이팅 편차 상한, 급수가 안정된 선수만) · SEED=1 · DELAY_MS=300
 *  예의: 요청을 직렬로, 요청 사이 DELAY_MS 간격으로 보내고 429/5xx는 물러났다 재시도한다.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { Chess } from "chess.js";

const mode = process.argv[2];
const here = (p) => new URL(p, import.meta.url).pathname;
const env = (k, d) => (process.env[k] != null && process.env[k] !== "" ? +process.env[k] : d);
const TIME_CLASS = process.env.TIME_CLASS || "rapid";
const BAND = env("BAND", 100), MIN_BAND = env("MIN_BAND", 500), MAX_BAND = env("MAX_BAND", 2400);
const PPB = env("PLAYERS_PER_BAND", 8), GPP = env("GAMES_PER_PLAYER", 4), MIN_PLIES = env("MIN_PLIES", 40);
const MIN_RECORD = env("MIN_RECORD", 150), MAX_RD = env("MAX_RD", 90), SEED = env("SEED", 1), DELAY = env("DELAY_MS", 300);
const COUNTRIES = (process.env.COUNTRIES || "KR,US,IN,RU,DE,BR,GB,FR,ES,PL,TR,EG").split(",");
const UA = "OpenChess-calibration/0.6.7 (+https://openchess.kr; openchesskr@gmail.com)";
if (mode !== "games" && mode !== "offset") { console.error("사용법: NODE_USE_ENV_PROXY=1 node scripts/fetch-rated-games.mjs <games|offset> [출력]"); process.exit(1); }

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const rand = rng(SEED);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0;
async function get(url, tries = 5) {
  for (let k = 0; k < tries; k++) {
    await sleep(DELAY); calls++;
    let r; try { r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } }); } catch (e) { await sleep(1000 * (k + 1)); continue; }
    if (r.status === 404 || r.status === 410) return null;
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * (k + 1) ** 2); continue; }
    if (!r.ok) return null;
    try { return await r.json(); } catch { return null; }
  }
  return null;
}
const stats = (u) => get(`https://api.chess.com/pub/player/${encodeURIComponent(u)}/stats`);
const key = "chess_" + TIME_CLASS;

/* ───────── offset: 타이틀 선수의 chess.com 급수 ↔ FIDE ───────── */
if (mode === "offset") {
  const out = process.argv[3] || here("./calibration/chesscom-fide-offset.json");
  const rows = [];
  for (const title of ["GM", "IM", "FM", "CM", "NM"]) {
    const list = await get(`https://api.chess.com/pub/titled/${title}`);
    const names = shuffle([...(list?.players || [])]).slice(0, env("PER_TITLE", 120));
    let got = 0;
    for (const u of names) {
      const s = await stats(u); if (!s || !s.fide) continue;
      const rap = s.chess_rapid?.last, blz = s.chess_blitz?.last;
      if (!rap && !blz) continue;
      rows.push({ u, title, fide: s.fide, rapid: rap?.rating ?? null, rapidRd: rap?.rd ?? null, blitz: blz?.rating ?? null, blitzRd: blz?.rd ?? null }); got++;
    }
    console.error(`${title}: FIDE가 있는 선수 ${got}명 (누적 요청 ${calls})`);
  }
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), rows }) + "\n");
  console.error(`✔ ${rows.length}명 → ${out}`); process.exit(0);
}

/* ───────── games: 레이팅 구간별 선수 → 최근 대국 ───────── */
const out = process.argv[3] || here("./calibration/chesscom-games.ndjson");
const have = new Set();
if (existsSync(out)) for (const l of readFileSync(out, "utf8").split("\n")) { if (!l.trim()) continue; try { have.add(JSON.parse(l).id); } catch { /* 깨진 줄 */ } }

// 1) 선수 풀: 나라별 활동 선수 목록을 섞어 stats를 조회하며 구간별로 채운다. 높은 구간(2000+)은 무작위 선수에 드물어 타이틀 목록으로 보충한다.
const bands = []; for (let b = MIN_BAND; b <= MAX_BAND; b += BAND) bands.push(b);
const chosen = new Map(bands.map((b) => [b, []])), seen = new Set();
const bandOf = (r) => Math.floor(r / BAND) * BAND;
const okStats = (s) => { const m = s?.[key]; if (!m?.last?.rating || !m.record) return null; const n = (m.record.win || 0) + (m.record.loss || 0) + (m.record.draw || 0); if (n < MIN_RECORD || (m.last.rd ?? 999) > MAX_RD) return null; return m.last.rating; };
const needed = () => bands.filter((b) => chosen.get(b).length < PPB);
async function tryPlayer(u, onlyBands) {
  if (seen.has(u)) return; seen.add(u);
  const s = await stats(u); const r = okStats(s); if (r == null) return;
  const b = bandOf(r); if (!chosen.has(b) || chosen.get(b).length >= PPB || (onlyBands && !onlyBands.includes(b))) return;
  chosen.get(b).push({ u, rating: r });
}
const lists = [];
for (const c of COUNTRIES) { const d = await get(`https://api.chess.com/pub/country/${c}/players`); if (d?.players?.length) lists.push(shuffle([...d.players])); }
const MAX_PROBES = env("MAX_PROBES", 2500);
for (let i = 0, probes = 0; needed().length && probes < MAX_PROBES; i++) {
  let any = false;
  for (const l of lists) { if (i < l.length) { any = true; probes++; await tryPlayer(l[i]); if (!needed().length) break; } }
  if (!any) break;
  if (i % 100 === 99) console.error(`  선수 탐색 ${probes}명째, 남은 구간: ${needed().map((b) => b + ":" + (PPB - chosen.get(b).length)).join(" ")}`);
}
if (needed().length) {   // 부족한 높은 구간은 타이틀 선수로 보충
  const hi = needed().filter((b) => b >= 1800);
  for (const title of ["NM", "CM", "FM", "IM", "GM"]) {
    if (!needed().some((b) => hi.includes(b))) break;
    const d = await get(`https://api.chess.com/pub/titled/${title}`);
    for (const u of shuffle([...(d?.players || [])])) { if (!needed().some((b) => hi.includes(b))) break; await tryPlayer(u, hi); }
  }
}
console.error("선수 풀: " + bands.map((b) => `${b}:${chosen.get(b).length}`).join(" ") + ` (요청 ${calls})`);

// 2) 각 선수의 최근 대국
function toRecord(g, owner) {
  if (g.rules !== "chess" || !g.rated || g.time_class !== TIME_CLASS || !g.pgn) return null;
  if (g.white?.result === "abandoned" || g.black?.result === "abandoned") return null;
  const c = new Chess(); try { c.loadPgn(g.pgn); } catch { return null; }
  const sans = c.history(); if (sans.length < MIN_PLIES) return null;
  if (c.getHeaders().SetUp === "1" || c.getHeaders().FEN) return null;   // 표준 시작 포지션만
  const id = "cc|" + (g.uuid || g.url);
  return { id, sans, wElo: g.white.rating, bElo: g.black.rating, wName: g.white.username, bName: g.black.username, tc: g.time_control, timeClass: g.time_class, pool: "chesscom", owner };
}
let saved = 0;
for (const b of bands) for (const p of chosen.get(b)) {
  const arch = await get(`https://api.chess.com/pub/player/${encodeURIComponent(p.u)}/games/archives`);
  const months = (arch?.archives || []).slice(-4).reverse();
  let got = 0;
  for (const url of months) {
    if (got >= GPP) break;
    const m = await get(url); if (!m?.games) continue;
    for (const g of shuffle([...m.games])) {
      if (got >= GPP) break;
      const rec = toRecord(g, p.u); if (!rec || have.has(rec.id)) continue;
      have.add(rec.id); appendFileSync(out, JSON.stringify(rec) + "\n"); got++; saved++;
    }
  }
  console.error(`[${b}] ${p.u} (${p.rating}) → ${got}판 (누적 ${saved}판, 요청 ${calls})`);
}
console.error(`✔ 새로 ${saved}판 → ${out}`);
