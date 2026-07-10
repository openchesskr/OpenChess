#!/usr/bin/env node
/** npm 'stockfish' 빌드를 public/engine 으로 복사 (Web Worker 동일 출처 로딩용).
 *  (20차 기능2) 두 엔진을 함께 제공한다 — 무겁지만 정확한 Stockfish 16(NNUE)과, 가볍고 빠른
 *  Stockfish 18 Lite. 같은 npm 패키지 이름을 두 버전으로 동시에 설치할 수 없어
 *  package.json에서 "stockfish16"/"stockfish18" 별칭(npm:stockfish@<버전>)으로 나눠 받는다. */
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const full = dirname(require.resolve("stockfish16/package.json")) + "/src";
const outFull = "public/engine"; mkdirSync(outFull, { recursive: true });
for (const f of ["stockfish-nnue-16-single.js", "stockfish-nnue-16-single.wasm", "nn-5af11540bbfe.nnue"]) {
  const src = join(full, f);
  if (existsSync(src)) { copyFileSync(src, join(outFull, f)); console.log("copied", f); }
  else console.warn("missing", f, "(빌드명이 다를 수 있음 — node_modules/stockfish16/src 확인)");
}

const lite = dirname(require.resolve("stockfish18/package.json")) + "/bin";
const outLite = "public/engine/lite"; mkdirSync(outLite, { recursive: true });
for (const f of ["stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm"]) {
  const src = join(lite, f);
  if (existsSync(src)) { copyFileSync(src, join(outLite, f)); console.log("copied", f); }
  else console.warn("missing", f, "(빌드명이 다를 수 있음 — node_modules/stockfish18/bin 확인)");
}
