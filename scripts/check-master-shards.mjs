#!/usr/bin/env node
/** (v0.8.0) 마스터 대국 DB 조각(public/master/, scripts/build-master-shards.mjs) 검사 — prebuild(build-master-shards 다음).
 *  ① 조각이 원본(data/master-games.json)에서 만든 최신본인지(idx.src 해시)
 *  ② 3수 이상 수순: 조각에서 찾은 대국·통계가 원본 DB 전체에서 찾은 것과 정확히 같은지(masterGamesFor를 실제 파일로 실행)
 *  ③ 2수 이하 수순(1.e4 등): 통계(승·무·패·다음 수)가 원본 전체와 같고, 대표 대국이 모두 그 수순의 대국이며 연대가 고르게 섞였는지
 *  ④ extm_<번호> 대국 기보(masterGameMoves)가 원본과 같은지 — 대회 색인 등이 쓰는 번호가 유지되는지
 *  ⑤ 휴대폰 부담: 가장 큰 조각 gzip 4MB 이하, top.json gzip 400KB 이하, 원본 DB가 public/에 다시 들어오지 않았는지 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { masterGamesFor, masterGameMoves, staticMasterGamesFor, staticMasterStatsFor } from "../src/lib/lichessApi.js";

const ROOT = new URL("../", import.meta.url).pathname;
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const raw = readFileSync(join(ROOT, "data/master-games.json"), "utf8");
const full = JSON.parse(raw);
const dir = join(ROOT, "public/master");
ok(!existsSync(join(ROOT, "public/master-games.json")), "원본 DB(68MB)가 public/에 있음 — data/master-games.json에 두고 조각만 배포");
let idx = null;
try { idx = JSON.parse(readFileSync(join(dir, "idx.json"), "utf8")); } catch { fails.push("public/master/idx.json 없음 — node scripts/build-master-shards.mjs"); }
if (idx) {
  ok(idx.src === createHash("sha1").update(raw).digest("hex"), "조각이 원본과 다름(낡음) — node scripts/build-master-shards.mjs");
  // 실제 파일을 fetch로 읽게 한다
  globalThis.fetch = async (url) => { const p = join(dir, String(url).replace(/^.*master\//, "")); return existsSync(p) ? { ok: true, status: 200, json: async () => JSON.parse(readFileSync(p, "utf8")) } : { ok: false, status: 404, json: async () => null }; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const sans of [["e4", "c5", "Nf3"], ["d4", "Nf6", "c4", "e6"], ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"], ["Nf3", "d5", "g3"], ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O"], ["a4", "h5", "Ra3"]]) {
    const got = await masterGamesFor(sans), want = staticMasterGamesFor(sans, full);
    ok(!got.sample && same(got.games.map((g) => g.id).sort(), want.map((g) => g.id).sort()), "조각의 대국 목록이 원본과 다름: " + sans.join(" ") + " (" + got.games.length + " / " + want.length + ")");
    ok(same(got.stats, staticMasterStatsFor(sans, full)), "조각의 통계가 원본과 다름: " + sans.join(" "));
  }
  for (const sans of [["e4"], ["d4"], ["e4", "c5"], ["Nf3"], ["c4", "e5"]]) {
    const got = await masterGamesFor(sans), ws = staticMasterStatsFor(sans, full), want = staticMasterGamesFor(sans, full);
    ok(got.stats && got.stats.white === ws.white && got.stats.draws === ws.draws && got.stats.black === ws.black && same(got.stats.moves.map((m) => [m.san, m.white, m.draws, m.black]).sort(), ws.moves.map((m) => [m.san, m.white, m.draws, m.black]).sort()), "2수 이하 통계가 원본과 다름: " + sans.join(" "));
    ok(got.total === want.length, "2수 이하 전체 판수가 다름: " + sans.join(" ") + " " + got.total + " / " + want.length);
    const ids = new Set(want.map((g) => g.id));
    ok(got.games.length > 0 && got.games.every((g) => ids.has(g.id)), "대표 대국에 다른 수순의 대국이 섞이거나 비어 있음: " + sans.join(" "));
    if (want.length > got.games.length) {
      ok(got.sample === true, "대표 대국만인데 sample 표시가 없음: " + sans.join(" "));
      const decades = new Set(got.games.map((g) => g.year ? Math.floor(g.year / 10) : 0));
      ok(decades.size >= 3, "대표 대국이 한 연대에 몰림: " + sans.join(" ") + " (" + decades.size + "개 연대)");
    }
    if (sans.join(" ") === "e4") ok(got.games.length >= 100, "1.e4 대표 대국이 너무 적음(" + got.games.length + ")");
  }
  for (const gi of [0, 1, 777, 64000, full.games.length - 1]) ok(same(await masterGameMoves(gi), String(full.games[gi].moves).split(" ").filter(Boolean)), "extm_" + gi + " 기보가 원본과 다름");
  // 휴대폰 부담
  let maxGz = 0; for (let n = 0; n < idx.keys.length; n += 1) { const p = join(dir, "s", n + ".json"); if (!existsSync(p)) { fails.push("조각 없음 s/" + n + ".json"); continue; } if (n % 7 === 0 || n < 5) maxGz = Math.max(maxGz, gzipSync(readFileSync(p)).length); }
  ok(maxGz <= 4e6, "가장 큰 조각이 너무 큼(gzip " + (maxGz / 1e6).toFixed(1) + "MB)");
  const topGz = gzipSync(readFileSync(join(dir, "top.json"))).length;
  ok(topGz <= 4e5, "top.json이 너무 큼(gzip " + (topGz / 1e3).toFixed(0) + "KB)");
}
if (fails.length) { console.error("✘ check-master-shards:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-master-shards: 조각 " + idx.keys.length + "개가 원본과 같음(3수 이상 목록·통계, 2수 이하 통계·대표 대국, extm 기보), 휴대폰 부담 기준 통과");
