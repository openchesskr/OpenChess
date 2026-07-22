#!/usr/bin/env node
/** npm 'stockfish' 빌드를 public/engine 으로 복사 (Web Worker 동일 출처 로딩용).
 *  (20차 기능2, v0.2.0 기능 추가) 세 엔진을 함께 제공한다 — 무겁지만 정확한 Stockfish 16(NNUE),
 *  가볍고 빠른 Stockfish 18 Lite, 그리고 이 셋 중 가장 강력한 Stockfish 17.1(정식 대형 신경망).
 *  같은 npm 패키지 이름을 여러 버전으로 동시에 설치할 수 없어 package.json에서
 *  "stockfish16"/"stockfish171"/"stockfish18" 별칭(npm:stockfish@<버전>)으로 나눠 받는다. */
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const full = dirname(require.resolve("stockfish16/package.json")) + "/src";
const outFull = "public/engine"; mkdirSync(outFull, { recursive: true });
// (성능) 단일 스레드 빌드에 더해, 교차 출처 격리(COOP/COEP)가 된 페이지에서만 쓰는 멀티스레드
// 빌드(stockfish-nnue-16.js/.wasm)도 함께 받아 둔다 — 같은 신경망 파일(nn-*.nnue)을 공유한다.
for (const f of ["stockfish-nnue-16-single.js", "stockfish-nnue-16-single.wasm", "stockfish-nnue-16.js", "stockfish-nnue-16.wasm", "nn-5af11540bbfe.nnue"]) {
  const src = join(full, f);
  if (existsSync(src)) { copyFileSync(src, join(outFull, f)); console.log("copied", f); }
  else console.warn("missing", f, "(빌드명이 다를 수 있음 — node_modules/stockfish16/src 확인)");
}

const lite = dirname(require.resolve("stockfish18/package.json")) + "/bin";
const outLite = "public/engine/lite"; mkdirSync(outLite, { recursive: true });
for (const f of ["stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm", "stockfish-18-lite.js", "stockfish-18-lite.wasm"]) {
  const src = join(lite, f);
  if (existsSync(src)) { copyFileSync(src, join(outLite, f)); console.log("copied", f); }
  else console.warn("missing", f, "(빌드명이 다를 수 있음 — node_modules/stockfish18/bin 확인)");
}

// (v0.2.0 기능) Stockfish 17.1(정식 대형 신경망, 세 엔진 중 최고 성능) — npm 패키지가 신경망을
// 용량 제한 때문에 여러 조각(-part-N.wasm)으로 쪼개 배포한다. 로더 스크립트는 자기 자신의 전역
// 변수 self.enginePartsCount를 보고 조각을 이어 붙이는데, importScripts로 불러오는 시점엔 그 값이
// 아직 없다 — 조각 파일과 같은 폴더에 두는 아주 작은 부트스트랩 스크립트(boot-*.js)를 만들어 그
// 안에서 enginePartsCount를 먼저 정의한 뒤 실제 엔진 스크립트를 상대 경로로 importScripts한다.
const full171 = dirname(require.resolve("stockfish171/package.json")) + "/src";
const out171 = "public/engine/17"; mkdirSync(out171, { recursive: true });
const PARTS_171 = 6;
const singleJs171 = "stockfish-17.1-single-a496a04.js", mtJs171 = "stockfish-17.1-8e4d048.js";
const files171 = [singleJs171, mtJs171];
for (let i = 0; i < PARTS_171; i++) { files171.push(singleJs171.replace(/\.js$/, "-part-" + i + ".wasm")); files171.push(mtJs171.replace(/\.js$/, "-part-" + i + ".wasm")); }
for (const f of files171) {
  const src = join(full171, f);
  if (existsSync(src)) { copyFileSync(src, join(out171, f)); console.log("copied", f); }
  else console.warn("missing", f, "(빌드명이 다를 수 있음 — node_modules/stockfish171/src 확인)");
}
writeFileSync(join(out171, "boot-single.js"), "self.enginePartsCount=" + PARTS_171 + ";importScripts('" + singleJs171 + "');\n");
writeFileSync(join(out171, "boot-mt.js"), "self.enginePartsCount=" + PARTS_171 + ";importScripts('" + mtJs171 + "');\n");
console.log("wrote boot-single.js, boot-mt.js (17.1 다중 조각 부트스트랩)");
