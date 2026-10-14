#!/usr/bin/env node
/** (v0.6.7) 오프닝 강도 데이터 → src/data/openingStrength.json
 *  퍼포먼스 레이팅의 오프닝 항(src/lib/performanceRating.js openingTerm)이 쓰는 표를 만든다. 각 대국이 이론(ECO 목록) 안에서 지나간 모든 포지션마다
 *  "그 포지션을 거친 대국에서 백/흑 선수의 평균 레이팅"을 쌓는다. 대국 출처는 둘 중 하나(섞으면 같은 대국이 두 번 세어진다):
 *   · 인자 없음(기본): 저장소의 src/data/tournaments/*.json — 대회 대국의 수순과 대회 당시 선수 레이팅(pl[i][1])을 쓴다. 외부 접속이 필요 없다.
 *   · 첫 인자가 NDJSON 경로: fetch-external-games.mjs가 만든 파일(대국 한 줄씩: whiteElo/blackElo/moves)을 스트리밍으로 읽는다.
 *  키는 "w:<해시>"·"b:<해시>"(해시 = ecoHash(bookPositionKey(fen)), 앱의 이론 판정과 같은 규칙). 값은 [표본 수, 평균 레이팅].
 *  한두 판짜리 포지션은 우연이므로 MIN_N 미만은 버린다(앱도 표본이 적으면 전체 평균 쪽으로 당긴다).
 *  이 샌드박스는 외부 대국 DB 접속이 막혀 있어 사용자가 로컬 PC에서 실행해야 한다.
 *
 *  사용법: node scripts/build-opening-strength.mjs [external-games.ndjson] [출력.json=src/data/openingStrength.json]
 *  옵션(환경변수): MIN_ELO=2300 (이 미만 레이팅의 선수는 집계에서 제외) · MIN_N=20 · MAX_PLY=32 (이론은 이 수까지만 본다 — 수순 복원이 대국 처리 시간의 대부분이라 길수록 느리다)
 */
import { createReadStream, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { sansToFen } from "../src/lib/chessRules.js";
import { bookPositionKey, ecoHash } from "../src/lib/ecoHash.js";
import { bookNodesOfLine } from "../src/lib/performanceRating.js";
import { decodeMoves } from "../src/lib/moveCodec.js";

const inPath = process.argv[2] && process.argv[2] !== "-" ? process.argv[2] : null;
const outPath = process.argv[3] || new URL("../src/data/openingStrength.json", import.meta.url).pathname;
const MIN_ELO = +(process.env.MIN_ELO || 2300), MIN_N = +(process.env.MIN_N || 20), MAX_PLY = +(process.env.MAX_PLY || 32);

const eco = JSON.parse(readFileSync(new URL("../src/data/ecoBook.json", import.meta.url), "utf8"));
const bookSet = new Set((eco.hashes || "").split(" ").filter(Boolean));
const isBook = (key) => bookSet.has(ecoHash(key));

const acc = new Map();   // "w:해시" → [합, 개수]
let games = 0, used = 0, sumAll = 0, cntAll = 0;

// 대국 출처 → { sans(), whiteElo, blackElo } 를 하나씩 내보낸다. sans()는 호출할 때만 수순을 복원한다(레이팅 조건을 못 넘는 대국은 복원하지 않는다).
async function* sourceGames() {
  if (inPath) {
    const rl = createInterface({ input: createReadStream(inPath, "utf8"), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let g; try { g = JSON.parse(line); } catch { continue; }
      yield { sans: () => String(g.moves || "").split(" ").filter(Boolean).slice(0, MAX_PLY), whiteElo: +g.whiteElo, blackElo: +g.blackElo };
    }
    return;
  }
  const dir = new URL("../src/data/tournaments/", import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const t = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    for (const ed of t.eds || []) for (const g of ed.g || []) {
      // g = [라운드, 보드, 백 인덱스, 흑 인덱스, 결과, 수순 부호, ECO, (단계)] · pl[i] = [이름, 대회 당시 레이팅, 칭호, 점수, 판 수]
      const w = ed.pl[g[2]], b = ed.pl[g[3]];
      if (!w || !b || !g[5]) continue;
      yield { sans: () => decodeMoves(btoa(atob(g[5]).slice(0, MAX_PLY))), whiteElo: +w[1], blackElo: +b[1] };
    }
  }
}

for await (const g of sourceGames()) {
  games++;
  const we = g.whiteElo, be = g.blackElo;
  const wOk = we >= MIN_ELO, bOk = be >= MIN_ELO;
  if (!wOk && !bOk) continue;
  const sans = g.sans();
  if (!sans.length) continue;
  let nodes; try { nodes = bookNodesOfLine(sans, sansToFen, bookPositionKey, ecoHash, isBook); } catch { continue; }
  if (!nodes.length) continue;
  used++;
  for (const [side, elo, ok] of [["w", we, wOk], ["b", be, bOk]]) {
    if (!ok) continue;
    sumAll += elo; cntAll++;
    for (const n of nodes) {
      const k = side + ":" + n.key;
      const cur = acc.get(k) || [0, 0];
      cur[0] += elo; cur[1]++;
      acc.set(k, cur);
    }
  }
  if (games % 20000 === 0) console.error(`  ${games}판 처리`);
}
const entries = {};
for (const [k, [sum, n]] of acc) if (n >= MIN_N) entries[k] = [n, Math.round(sum / n)];
const out = { globalMean: cntAll ? Math.round(sumAll / cntAll) : 0, entries };
writeFileSync(outPath, JSON.stringify(out) + "\n");
console.error(`대국 ${games}판 중 ${used}판 사용 · 항목 ${Object.keys(entries).length}개 · 전체 평균 ${out.globalMean} → ${outPath}`);
