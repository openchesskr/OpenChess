#!/usr/bin/env node
/** (v0.7.8 BUG-179 재발 방지) React 훅을 조기 반환(if (…) return …) 뒤에 두면, 그 분기를 타는 렌더에서 훅 수가 줄어
 *  "Rendered fewer hooks than expected"(운영 빌드 React error #300)로 화면 전체가 무너진다. 퍼즐 탭(PuzzleTab)에서만 세 번 반복됐다
 *  (v0.4.1 useMemo 두 건, v0.7.7 useTabMemory — 퍼즐을 누르면 항상 오류 화면).
 *  검사 — src/의 모든 컴포넌트·훅 함수(이름이 대문자 또는 use로 시작, 열 0에서 시작)에서 함수 본문 최상위(들여쓰기 2칸)의 조기 반환 뒤에
 *  최상위 훅 호출(use…()이 있으면 실패. 실행: node scripts/check-hook-order.mjs (prebuild) */
import { readFileSync, readdirSync, statSync } from "node:fs";
const root = new URL("../src/", import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = d + f; return statSync(p).isDirectory() ? walk(p + "/") : /\.jsx?$/.test(f) ? [p] : []; });
const fails = [];
let fnCount = 0;
for (const file of walk(root)) {
  const L = readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < L.length; i++) {
    const m = /^(?:export )?(?:default )?function ((?:[A-Z]|use[A-Z])\w*)\s*\(/.exec(L[i]);
    if (!m || /\}\s*$/.test(L[i]) && !/\{\s*$/.test(L[i])) continue;   // 한 줄짜리 함수는 건너뜀
    fnCount++;
    let early = null;
    for (let j = i + 1; j < L.length && !/^\}/.test(L[j]); j++) {
      const ln = L[j];
      if (/^ {2}\/\//.test(ln)) continue;
      if (early == null && (/^ {2}if \(.*\)\s*return\b/.test(ln) || /^ {2}if \(.*\)\s*\{[^}]*\breturn\b[^}]*\}\s*$/.test(ln))) { early = j; continue; }
      if (early != null && /^ {2}(?:const|let|var|\[|use)[^=]*?(?:=\s*)?use[A-Z]\w*\(/.test(ln)) {
        fails.push(file.slice(root.length - 4) + ":" + (j + 1) + " " + m[1] + " — 훅이 " + (early + 1) + "줄의 조기 반환 뒤에 있음: " + ln.trim().slice(0, 80));
        break;
      }
    }
  }
}
if (fails.length) { console.error("✗ check-hook-order 실패(React #300 위험) — 훅을 조기 반환 위로 옮길 것:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-hook-order: 컴포넌트·훅 " + fnCount + "개 — 조기 반환 뒤 훅 호출 없음");
