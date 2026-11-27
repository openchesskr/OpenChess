#!/usr/bin/env node
/** (v0.8.0, 사용자 요청: 휴대폰 집중 분석에서 1.e4 같은 수에 마스터 대국이 안 나옴)
 *  마스터 대국 DB(data/master-games.json, 12만여 판·68MB, gzip 21MB)를 휴대폰이 받을 수 있는 크기로 나눈다.
 *  예전엔 집중 분석에서 마스터 대국을 처음 볼 때 DB 전체를 한 번에 받아 파싱·색인해야 해서(메모리 약 190MB), 휴대폰에서는 오래 걸리거나 실패했고
 *  실패하면 새로고침 전까지 다시 시도하지도 않았다.
 *
 *  출력(public/master/):
 *   · s/<n>.json  — 첫 SHARD_PLIES수(체크 기호 제외)가 같은 대국 묶음. 행: [gi, white, black, whiteElo, blackElo, event, date, result, moves]
 *                   gi는 원본 DB의 대국 번호(extm_gi) — 대회 색인(tournamentIndex.json) 등이 쓰는 번호를 그대로 유지한다.
 *   · idx.json    — { src: 원본 sha1, keys: [조각 키…], shardOf: 대국 번호마다 조각 번호(36진수 2자리)를 이어 붙인 문자열 }
 *   · top.json    — 수순이 TOP_PLIES수 이하인 포지션(1.e4, 1.e4 c5 …): 정확한 승·무·패·다음 수 통계와
 *                   연대별로 고르게 고른 고레이팅 대표 대국 TOP_GAMES판(행: [gi, white, black, whiteElo, blackElo, event, date, result, nextSan]).
 *                   이런 포지션은 조각 여러 개(1.e4는 6만 8천 판)에 걸쳐 있어 휴대폰에서 전부 받을 수 없다.
 *  실행: node scripts/build-master-shards.mjs  (check-master-shards가 원본과 맞는지 prebuild에서 확인)
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export const SHARD_PLIES = 3, TOP_PLIES = 2, TOP_GAMES = 300;
const ROOT = new URL("../", import.meta.url).pathname;
const SRC = join(ROOT, "data/master-games.json"), OUT = join(ROOT, "public/master");
const strip = (s) => String(s || "").replace(/[+#]/g, "");
const resOf = (r) => (r === "1-0" ? "w" : r === "0-1" ? "b" : "d");
const elo = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const yearOf = (g) => { const y = g.date ? parseInt(String(g.date).slice(0, 4), 10) : NaN; return y > 1000 && y < 2100 ? y : null; };

export function buildMasterShards(raw) {
  const games = JSON.parse(raw).games;
  const src = createHash("sha1").update(raw).digest("hex");
  const keys = [], keyIdx = new Map(), shards = [];
  const shardOf = new Array(games.length);
  games.forEach((g, gi) => {
    const toks = strip(g.moves).split(" ").filter(Boolean);
    const k = toks.slice(0, SHARD_PLIES).join(" ");
    let n = keyIdx.get(k);
    if (n == null) { n = keys.length; keys.push(k); keyIdx.set(k, n); shards.push([]); }
    shardOf[gi] = n;
    shards[n].push([gi, g.white || "", g.black || "", elo(g.whiteElo), elo(g.blackElo), g.event || "", g.date || "", g.result || "", g.moves || ""]);
  });
  if (keys.length > 36 * 36) throw new Error("조각이 너무 많음(" + keys.length + ") — 36진수 2자리를 넘는다");
  // 2수 이하 포지션 요약
  const byPrefix = new Map();
  games.forEach((g, gi) => {
    const toks = strip(g.moves).split(" ").filter(Boolean), rawToks = String(g.moves || "").split(" ");
    for (let L = 1; L <= TOP_PLIES && L <= toks.length; L++) {
      const p = toks.slice(0, L).join(" ");
      let e = byPrefix.get(p); if (!e) { e = { n: 0, w: 0, d: 0, b: 0, next: new Map(), all: [] }; byPrefix.set(p, e); }
      const r = resOf(g.result); e.n++; e[r]++;
      const nx = rawToks[L];
      if (nx) { const x = e.next.get(nx) || [nx, 0, 0, 0]; x[r === "w" ? 1 : r === "d" ? 2 : 3]++; e.next.set(nx, x); }
      e.all.push(gi);
    }
  });
  const top = {};
  for (const [p, e] of [...byPrefix].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const L = p.split(" ").length;
    // 대표 대국: 연대별 묶음에서 레이팅(두 선수 중 높은 쪽 → 낮은 쪽) 높은 순으로, 최근 연대부터 한 판씩 돌아가며 뽑는다 — 연도·레이팅 필터 어느 쪽을 골라도 대국이 남게
    const buckets = new Map();
    for (const gi of e.all) { const g = games[gi], y = yearOf(g), dec = y ? Math.floor(y / 10) * 10 : 0; if (!buckets.has(dec)) buckets.set(dec, []); buckets.get(dec).push(gi); }
    const mx = (gi) => Math.max(elo(games[gi].whiteElo) || 0, elo(games[gi].blackElo) || 0), mn = (gi) => Math.min(elo(games[gi].whiteElo) || 0, elo(games[gi].blackElo) || 0);
    const lists = [...buckets.entries()].sort((a, b) => b[0] - a[0]).map(([, l]) => l.sort((a, b) => mx(b) - mx(a) || mn(b) - mn(a) || String(games[b].date).localeCompare(String(games[a].date)) || a - b));
    const pick = []; for (let i = 0; pick.length < TOP_GAMES && lists.some((l) => i < l.length); i++) for (const l of lists) { if (i < l.length && pick.length < TOP_GAMES) pick.push(l[i]); }
    pick.sort((a, b) => a - b);
    const mv = [...e.next.values()].sort((a, b) => (b[1] + b[2] + b[3]) - (a[1] + a[2] + a[3]) || (a[0] < b[0] ? -1 : 1)).slice(0, 12);
    top[p] = { n: e.n, st: [e.w, e.d, e.b, mv], g: pick.map((gi) => { const g = games[gi]; return [gi, g.white || "", g.black || "", elo(g.whiteElo), elo(g.blackElo), g.event || "", g.date || "", g.result || "", String(g.moves || "").split(" ")[L] || null]; }) };
  }
  const shardOfStr = shardOf.map((n) => n.toString(36).padStart(2, "0")).join("");
  return { idx: { src, plies: SHARD_PLIES, topPlies: TOP_PLIES, keys, shardOf: shardOfStr }, shards, top };
}

if (import.meta.url === "file://" + process.argv[1]) {
  const raw = readFileSync(SRC, "utf8");
  // 원본이 그대로면(idx.json의 src 해시가 같으면) 다시 만들지 않는다 — prebuild·predev에서 매번 불린다
  const sha = createHash("sha1").update(raw).digest("hex");
  try { const cur = JSON.parse(readFileSync(join(OUT, "idx.json"), "utf8")); if (cur.src === sha && existsSync(join(OUT, "top.json")) && cur.keys.every((_, n) => existsSync(join(OUT, "s", n + ".json")))) { console.log("✔ build-master-shards: 최신(원본 변화 없음)"); process.exit(0); } } catch { }
  const { idx, shards, top } = buildMasterShards(raw);
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, "s"), { recursive: true });
  writeFileSync(join(OUT, "idx.json"), JSON.stringify(idx));
  writeFileSync(join(OUT, "top.json"), JSON.stringify(top));
  shards.forEach((rows, n) => writeFileSync(join(OUT, "s", n + ".json"), JSON.stringify(rows)));
  const sizes = shards.map((r) => JSON.stringify(r).length).sort((a, b) => b - a);
  console.log("✔ build-master-shards: 조각 " + shards.length + "개(가장 큰 것 " + (sizes[0] / 1e6).toFixed(1) + "MB), 2수 이하 요약 " + Object.keys(top).length + "곳(top.json " + (JSON.stringify(top).length / 1e6).toFixed(1) + "MB), idx " + (JSON.stringify(idx).length / 1e3).toFixed(0) + "KB");
}
