#!/usr/bin/env node
/** (v0.6.6) 정적 마스터 대국 접두사 색인(src/lib/lichessApi.js staticMasterGameIdxsFor) 검사(prebuild).
 *  예전엔 openings.json 트리 노드(3,985곳)마다 최대 500판만 미리 뽑아 둔 index를 써서, 트리 밖 포지션의 대국은 있어도 못 찾고 1.e4도 500판에서 잘렸다.
 *  이제 어떤 포지션이든 "그 수순으로 시작하는 모든 대국"을 상한 없이 찾아야 한다.
 *  ① 합성 데이터: 접두사 일치·토큰 경계(Qa1 vs Qa1b2)·체크 기호 무시·수순 끝 대국·빈 수순(전체)·없는 수순.
 *  ② 실제 DB(public/master-games.json): 무작위 수순들을 전수 비교(brute force)와 대조하고, 1.e4 이후 대국이 예전 상한(500)을 넘는지 확인한다.
 *  ③ 통계: staticMasterStatsFor의 승·무·패 합과 다음 수 합이 대국 수와 맞는다.
 *  실행: node scripts/check-master-prefix.mjs */
import { readFileSync } from "node:fs";
import { staticMasterGameIdxsFor, staticMasterStatsFor } from "../src/lib/lichessApi.js";
const fails = [];
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(m + ": " + JSON.stringify(a) + " ≠ " + JSON.stringify(b)); };
// ① 합성
{
  const mk = (moves, result = "1-0") => ({ white: "A", black: "B", result, moves });
  const data = { games: [mk("e4 e5 Nf3 Nc6"), mk("e4 e5 Nf3+ Nc6"), mk("e4 e5"), mk("e4 c5 Qa1b2"), mk("e4 c5 Qa1 d5"), mk("d4 d5"), mk("e4 e6 d4")], index: {} };
  const s = (sans) => staticMasterGameIdxsFor(sans, data).sort((a, b) => a - b);
  eq(s(["e4", "e5"]), [0, 1, 2], "e4 e5 — 수순 끝 대국 포함·체크 기호 무시");
  eq(s(["e4", "e5", "Nf3"]), [0, 1], "체크 기호가 달라도 같은 수");
  eq(s(["e4", "c5", "Qa1"]), [4], "토큰 경계(Qa1 ≠ Qa1b2)");
  eq(s(["e4"]), [0, 1, 2, 3, 4, 6], "e4");
  eq(s([]), [0, 1, 2, 3, 4, 5, 6], "빈 수순 = 전체");
  eq(s(["c4"]), [], "없는 수순");
  eq(s(["e4", "e5", "Nf3", "Nc6", "Bb5"]), [], "대국보다 긴 수순");
  const st = staticMasterStatsFor(["e4"], data);
  eq([st.white + st.draws + st.black, st.moves.reduce((a, m) => a + m.white + m.draws + m.black, 0)], [6, 6], "통계 합");
}
// ② 실제 DB
{
  const data = JSON.parse(readFileSync(new URL("../public/master-games.json", import.meta.url), "utf8"));
  const strip = (x) => String(x || "").replace(/[+#]/g, "");
  const brute = (sans) => { const key = sans.map(strip).join(" "); const out = []; data.games.forEach((g, i) => { const m = strip(g.moves); if (m === key || m.startsWith(key + " ")) out.push(i); }); return out; };
  for (const sans of [["e4"], ["d4", "Nf6", "c4"], ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"], ["Nf3", "d5", "g3", "Nf6", "Bg2", "e6", "O-O", "Be7", "d3"]]) {
    const a = staticMasterGameIdxsFor(sans, data).sort((x, y) => x - y), b = brute(sans);
    eq([a.length, a.every((v, i) => v === b[i])], [b.length, true], "실제 DB 전수 비교 " + sans.join(" "));
  }
  const e4 = staticMasterGameIdxsFor(["e4"], data).length;
  if (e4 <= 500) fails.push("1.e4 이후 대국이 예전 상한(500) 이하(" + e4 + ") — 접두사 색인이 상한 없이 찾지 못함");
  const stt = staticMasterStatsFor(["e4"], data);
  eq(stt.white + stt.draws + stt.black, e4, "1.e4 통계 합 = 대국 수");
}
if (fails.length) { console.error("✖ check-master-prefix 실패 (" + fails.length + "건):\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-master-prefix: 접두사 색인이 토큰 경계·체크 기호를 지키며 실제 DB 전수 비교와 일치하고, 1.e4도 상한 없이 찾는다");
