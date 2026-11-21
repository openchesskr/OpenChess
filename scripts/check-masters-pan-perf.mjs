#!/usr/bin/env node
/** (BUG-076) 마스터 트리 드래그 렉 회귀 방지 — 패닝이 React 렌더를 거치지 않고(캔버스 transform 직접 갱신) 화면 밖 노드를 그리지 않는 구조를 유지하는지 정적 검사. */
import { readFileSync } from "node:fs";
const s = readFileSync(new URL("../src/app/dexMasters.jsx", import.meta.url), "utf8");
const need = [
  [/const paint = /, "paint(): 캔버스 transform 직접 갱신"],
  [/style\.transform/, "style.transform 사용"],
  [/CULL_MARGIN/, "뷰포트 컬링 상수"],
  [/cullRef/, "컬링 창 기준 ref"],
  [/commitTimerRef/, "디바운스 commit"],
];
const bad = need.filter(([re]) => !re.test(s));
if (bad.length) { console.error("✗ 마스터 트리 패닝 성능 구조 누락:\n" + bad.map((b) => "  - " + b[1]).join("\n")); process.exit(1); }
if (/onPointerMove[^\n]*setView\(/.test(s)) { console.error("✗ 포인터 이동마다 setView 호출 — 드래그 렉 재발"); process.exit(1); }
// (BUG-080) 마스터 이름 검색·키워드 칩 제거·되돌리기 버튼·사이트 드롭다운 유지
const extra = [];
if (!/masterKeys/.test(s) || !/n\.kind === "fide"/.test(s) || !/n\.kind === "dbm"/.test(s)) extra.push("마스터(챔피언·FIDE·DB 선수) 이름 검색 누락");
if (/TOURNAMENT_TYPES|setFtype/.test(s)) extra.push("대회 키워드 선택 UI가 되살아남");
if (!/RotateCcw/.test(s) || !/resetView/.test(s)) extra.push("처음 화면으로 되돌리는 버튼 누락");
const setting = readFileSync(new URL("../src/app/settings.jsx", import.meta.url), "utf8"), tv = readFileSync(new URL("../src/components/tournamentView.jsx", import.meta.url), "utf8");
if (/<select[^>]*move-fx-mode/.test(setting) || /<select[^>]*value=\{year\}/.test(tv)) extra.push("시각 효과·대회 연도 선택에 브라우저 기본 <select> 사용(사이트 드롭다운 Dropdown.jsx를 쓸 것)");
// (BUG-198) 아주 큰 모식도 캔버스(오프닝·마스터)에 will-change: transform을 늘 걸어 두면 처음 올린 배율로 래스터가 고정돼
//  높은 배율 → 25%로 줄였을 때 GPU 타일 메모리를 넘겨 이동 중 트리 일부가 빈 칸으로 보였다. 조작 중에만 거는 createLayerHint를 써야 한다.
const dexSrc = readFileSync(new URL("../src/app/dex.jsx", import.meta.url), "utf8");
for (const [name, src] of [["dexMasters.jsx", s], ["dex.jsx", dexSrc]]) {
  if (/willChange:\s*"transform"/.test(src)) extra.push(name + ": 모식도 캔버스에 will-change: transform을 고정으로 걸었음 — lib/layerHint.js(createLayerHint)로 조작 중에만(BUG-198)");
  if (!/createLayerHint\(\)/.test(src) || !/layerHintRef\.current\.touch\(/.test(src)) extra.push(name + ": 캔버스를 움직일 때 layerHint.touch를 부르지 않음(BUG-198)");
}
if (!/refreshCullWindow\(\);[^\n]*BUG-198/.test(dexSrc)) extra.push("dex.jsx: applyView에서 그릴 범위 이탈을 바로 확인하지 않음(BUG-198)");
if (extra.length) { console.error("✗ " + extra.join("\n✗ ")); process.exit(1); }
console.log("✓ 마스터 트리 패닝 성능·검색·드롭다운 구조 유지");
