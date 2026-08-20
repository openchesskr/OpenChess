#!/usr/bin/env node
/** npm 'stockfish' 빌드를 public/engine 으로 복사 (Web Worker 동일 출처 로딩용).
 *  (20차 기능2, v0.2.0 기능 추가 → v0.3.5 정리 → 8z5dbt 세션 기능 추가) 세 엔진을 함께 제공한다 —
 *  가볍고 빠른 Stockfish 18 Lite, Stockfish 17.1(정식 대형 신경망), 그리고 셋 중 가장 강력한
 *  Stockfish 18 정식(비-Lite) 대형 신경망. 게임 리뷰 전용으로 고정해 쓰던 네 번째 엔진 Stockfish
 *  16(NNUE)은 v0.3.5에서 폐기했다 — 게임 리뷰도 이제 이 아래 엔진 중 사용자가 설정 탭에서 고른 것을
 *  그대로 쓴다(App.jsx ENGINE_PROFILES 참고). 같은 npm 패키지 이름을 여러 버전으로 동시에 설치할 수
 *  없어 package.json에서 "stockfish171"/"stockfish18" 별칭(npm:stockfish@<버전>)으로 나눠 받는다. */
import { mkdirSync, copyFileSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

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

// (8z5dbt 세션 기능) Stockfish 18 정식(비-Lite) 대형 신경망 — npm 패키지(stockfish18, 17.1과 같은
// 'stockfish' 패키지의 다른 버전 별칭)가 이 빌드는 조각내지 않고 wasm 파일 하나(~113MB, Vercel의
// 배포 파일당 100MB 제한을 넘음)로만 배포한다. 17.1과 달리 이 로더 스크립트엔 조각을 이어 붙이는
// 기능이 아예 없어서(self.enginePartsCount를 읽는 코드가 없음 — 로더 소스 직접 확인함), 우리가
// 빌드 시점에 wasm을 100MB 미만 조각으로 직접 쪼개고, 런타임에는 그 조각들을 워커 안에서 fetch로
// 받아 이어붙인 뒤 self.fetch를 몰래 바꿔치기해서(monkeypatch) 로더가 원래 하려던 단일 fetch 요청에
// 대신 끼워 넣어준다 — 로더 입장에서는 평소처럼 한 번의 (아주 느린) 파일 하나를 받는 것과
// 구별되지 않는다. self.fetch 교체는 importScripts 호출 *전에* 동기적으로 끝내 둬야 한다 — 로더가
// onmessage 핸들러를 등록하는 시점도 그 안에서 동기적으로 일어나므로, 조각 다운로드(비동기)가 먼저
// 끝나길 기다렸다가 늦게 importScripts하면 그 사이 들어온 "uci" 등 초기 명령이 리스너 없이 유실된다
// (헤드리스 브라우저로 직접 재현·검증함). Vercel 100MB 제한에 여유를 두기 위해 조각당 상한을
// 90MB로 잡는다(113MB → 2조각).
const full18Dir = lite; // stockfish18 패키지의 bin 폴더 — Lite와 정식 빌드가 같은 폴더에 있음
const out18 = "public/engine/18"; mkdirSync(out18, { recursive: true });
const PART_CAP_BYTES = 90 * 1024 * 1024;

function splitWasm(srcPath, outDir, baseName) {
  if (!existsSync(srcPath)) { console.warn("missing", srcPath, "(빌드명이 다를 수 있음 — node_modules/stockfish18/bin 확인)"); return null; }
  const buf = readFileSync(srcPath);
  const partCount = Math.max(1, Math.ceil(buf.length / PART_CAP_BYTES));
  const partSize = Math.ceil(buf.length / partCount);
  const parts = [];
  for (let i = 0; i < partCount; i++) {
    const partName = baseName + "-part-" + i + ".wasm";
    writeFileSync(join(outDir, partName), buf.subarray(i * partSize, Math.min(buf.length, (i + 1) * partSize)));
    parts.push(partName);
  }
  console.log("split", baseName + ".wasm", "(" + buf.length + " bytes) into", partCount, "part(s)");
  return parts;
}

function bootScript(parts, loaderJs) {
  return "(function(){\n" +
    "var parts=" + JSON.stringify(parts) + ";\n" +
    "var base=self.location.href.replace(/[^/]*$/,\"\");\n" +
    "var partsPromise=Promise.all(parts.map(function(p){return fetch(base+p,{credentials:\"same-origin\"}).then(function(r){if(!r.ok)throw new Error(\"part fetch failed: \"+p+\" \"+r.status);return r.arrayBuffer();});}))\n" +
    "  .then(function(buffers){var total=buffers.reduce(function(n,b){return n+b.byteLength;},0);var merged=new Uint8Array(total);var offset=0;buffers.forEach(function(b){merged.set(new Uint8Array(b),offset);offset+=b.byteLength;});return merged;});\n" +
    "var realFetch=self.fetch.bind(self);\n" +
    "self.fetch=function(url,opts){if(typeof url===\"string\"&&url.indexOf(\".wasm\")!==-1){return partsPromise.then(function(merged){return new Response(merged,{headers:{\"Content-Type\":\"application/wasm\"}});});}return realFetch(url,opts);};\n" +
    "importScripts(" + JSON.stringify(loaderJs) + ");\n" +
    "})();\n";
}

const singleJs18 = "stockfish-18-single.js", mtJs18 = "stockfish-18.js";
for (const f of [singleJs18, mtJs18]) {
  const src = join(full18Dir, f);
  if (existsSync(src)) { copyFileSync(src, join(out18, f)); console.log("copied", f); }
  else console.warn("missing", f, "(빌드명이 다를 수 있음 — node_modules/stockfish18/bin 확인)");
}
const singleParts18 = splitWasm(join(full18Dir, "stockfish-18-single.wasm"), out18, "stockfish-18-single");
const mtParts18 = splitWasm(join(full18Dir, "stockfish-18.wasm"), out18, "stockfish-18");
if (singleParts18) writeFileSync(join(out18, "boot-single.js"), bootScript(singleParts18, singleJs18));
if (mtParts18) writeFileSync(join(out18, "boot-mt.js"), bootScript(mtParts18, mtJs18));
console.log("wrote boot-single.js, boot-mt.js (18 정식 빌드 조각 부트스트랩)");
