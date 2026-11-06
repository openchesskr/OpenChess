#!/usr/bin/env node
/** (v0.7.3 재발 방지) 퍼즐 생성(genPuzzleTree·findSacrificeFirstMove)이 지켜야 할 구조를 소스에서 직접 검사한다.
 *  ① 라인이 미해결 위치(상대가 바로 이득을 보는 잡기·체크·되찾지 못한 희생)에서 끊기지 않도록 정리(settle) 로직이 있다 — 상한에 닿아도, 이득 기준을 채워도 미해결이면 이어 간다.
 *  ② 상대 차례 노드는 사용자 응수가 상한을 넘으면 만들지 않는다(버려질 노드를 평가하느라 라인이 사용자 수 직후에서 끊기던 문제).
 *  ③ 희생 첫 수 후보는 보드 순서가 아니라 유망한 순서(체크·큰 기물)로 정렬해 평가한다 — 앞 N개만 자르는 구조에서 진짜 탁월한 수가 버려지지 않게.
 *  실제 엔진으로 라인 끝의 미해결 비율을 재려면: node scripts/analyze-puzzle-gen.mjs "<FEN>" punish|advantage|sacrifice  (개발용, 느림)
 *  실행: node scripts/check-puzzle-gen.mjs (npm run build 전에 prebuild로 자동 실행)
 */
import fs from "node:fs";
const src = fs.readFileSync(new URL("../src/app/common.jsx", import.meta.url), "utf8");
const gen = (src.match(/export async function genPuzzleTree[\s\S]*?\n}\n/) || [""])[0];
const fsac = (src.match(/export async function findSacrificeFirstMove[\s\S]*?\n}\n/) || [""])[0];
const fails = [];
if (!gen) fails.push("genPuzzleTree를 찾지 못함");
if (!fsac) fails.push("findSacrificeFirstMove를 찾지 못함");
if (gen) {
  if (!/function leafUnsettled\(/.test(gen)) fails.push("genPuzzleTree: leafUnsettled(미해결 위치 판정) 없음");
  if (!/hangingLossSq\(brd, userColor, null\)\.loss >= 2/.test(gen)) fails.push("leafUnsettled: 상대가 바로 이득을 보는 잡기(≥2점) 검사가 없음");
  if (!/SETTLE_EXTRA_PLIES/.test(gen) || !/SETTLE_EXTRA_NODES/.test(gen) || !/settleCount/.test(gen)) fails.push("genPuzzleTree: 정리용 추가 깊이·노드 예산(SETTLE_EXTRA_*, settleCount)이 없음");
  if (!/isUserTurn \? depth >= maxPlies : depth \+ 1 >= maxPlies/.test(gen)) fails.push("expand: 상대 차례 노드는 사용자 응수가 상한을 넘으면 만들지 않아야 함(isUserTurn ? depth >= maxPlies : depth + 1 >= maxPlies)");
  if (!/leafUnsettled\(cur2\)\) settleHere = true/.test(gen)) fails.push("종료 판정: 이득 기준을 채워도 미해결이면 이어 가야 함(settleHere)");
  if (/\|\| nodeCount >= maxNodes\) return \[\];/.test(gen)) fails.push("expand: 노드 상한에서 무조건 끊는 옛 코드가 남아 있음(정리 예산을 무시함)");
}
if (fsac) {
  if (!/\.sort\(\(a, b\) => sacScore\(b\) - sacScore\(a\)\)/.test(fsac)) fails.push("findSacrificeFirstMove: 희생 후보를 유망한 순서로 정렬해야 함(sacScore)");
  if (!/\/\[\+#\]\/\.test\(san\)/.test(fsac)) fails.push("findSacrificeFirstMove: 정렬 점수에 체크 여부가 있어야 함");
}
if (fails.length) { console.error("✗ puzzle-gen check 실패:\n" + fails.map((x) => "  " + x).join("\n")); process.exit(1); }
console.log("✓ puzzle-gen check: 미해결 위치 정리·상대 노드 상한·희생 후보 정렬 유지");
