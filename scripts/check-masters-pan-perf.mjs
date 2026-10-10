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
console.log("✓ 마스터 트리 패닝 성능 구조 유지");
