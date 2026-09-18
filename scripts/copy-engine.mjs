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

// (8z5dbt 세션 기능 → v0.4.9 → v0.5.1) Stockfish 18 정식(비-Lite) 대형 신경망 — npm 패키지가 이
// 빌드는 조각내지 않고 wasm 파일 하나(~108MB, Vercel의 배포 파일당 100MB 제한을 넘음)로만 배포한다.
// v0.4.9에서 100MB 미만 조각(-part-N.wasm)으로 직접 쪼개 public/engine/18에 뒀다가(단일+멀티스레드
// 두 빌드 합쳐 약 216MB라 매 배포마다 다시 패키징돼 Vercel Deployment Storage 10GB 무료 한도 초과의
// 주범이 됨) 외부 저장소(Vercel Blob → GitHub Release)로 옮기는 시도를 두 번 했지만, 각각 원인
// 불명의 다운로드 실패(Blob)와 CORS 헤더 부재(GitHub Release는 애초에 브라우저 fetch용 CORS를
// 지원하지 않는다 — README v0.5.1 참고, 실제 배포 환경에서 Network 탭으로 직접 확인)로 둘 다
// 실패했다. 외부 저장소 자체가 계속 새로운 종류의 문제를 만들어내, 사용자 요청으로 원래 방식(같은
// 출처에서 직접 서빙, 17.1과 완전히 같은 패턴)으로 되돌린다 — 같은 출처면 CORS 문제 자체가 없고,
// v0.4.9 때와 달리 이제 멀티스레드(mtUrl) 빌드는 포기했으므로(단일 스레드만 써도 충분히 안정적으로
// 동작하는 게 우선이라는 판단, 이전 세션에서 이미 결정) 배포 용량 증가분은 절반(~108MB)뿐이다 —
// 이미 같은 방식으로 서빙 중인 17.1(~80MB, 마찬가지로 매 배포마다 재생성)과 비슷한 수준이라, 같은
// 위험을 17.1도 이미 감수하고 있는 셈이다. 17.1과 달리 stockfish18 npm 패키지의 로더는 조각
// 재조립 기능(self.enginePartsCount)을 자체적으로 지원하지 않으므로, 그 대신 v0.4.9 Vercel Blob
// 업로드 스크립트가 쓰던 self.fetch 가로채기 방식을 그대로 재사용한다 — 다만 이번엔 외부 절대 URL이
// 아니라 self.location 기준 상대 경로로 같은 폴더의 조각을 가리키므로, 어떤 도메인에 배포되든
// (localhost 개발 서버 포함) 항상 올바르게 동작한다.
const full18 = dirname(require.resolve("stockfish18/package.json")) + "/bin";
const out18 = "public/engine/18"; mkdirSync(out18, { recursive: true });
const SF18_LOADER = "stockfish-18-single.js";
const SF18_WASM = "stockfish-18-single.wasm";
const SF18_PART_CAP = 90 * 1024 * 1024; // Vercel 배포 파일당 100MB 제한보다 여유 있게
{
  const src = join(full18, SF18_LOADER);
  if (existsSync(src)) { copyFileSync(src, join(out18, SF18_LOADER)); console.log("copied", SF18_LOADER); }
  else console.warn("missing", SF18_LOADER, "(빌드명이 다를 수 있음 — node_modules/stockfish18/bin 확인)");
}
const wasmSrc = join(full18, SF18_WASM);
let sf18PartNames = [];
if (existsSync(wasmSrc)) {
  const buf = readFileSync(wasmSrc);
  const partCount = Math.max(1, Math.ceil(buf.length / SF18_PART_CAP));
  const partSize = Math.ceil(buf.length / partCount);
  for (let i = 0; i < partCount; i++) {
    const name = SF18_WASM.replace(/\.wasm$/, "-part-" + i + ".wasm");
    writeFileSync(join(out18, name), buf.subarray(i * partSize, Math.min(buf.length, (i + 1) * partSize)));
    sf18PartNames.push(name);
  }
  console.log("split", SF18_WASM, "(" + buf.length + " bytes) into", partCount, "part(s)");
} else {
  console.warn("missing", SF18_WASM, "(빌드명이 다를 수 있음 — node_modules/stockfish18/bin 확인)");
}
writeFileSync(join(out18, "boot-single.js"),
  "(function(){" +
  "var parts=" + JSON.stringify(sf18PartNames) + ".map(function(n){return new URL(n,self.location).href;});" +
  "var f=self.fetch.bind(self);" +
  "var merged=Promise.all(parts.map(function(u){return f(u).then(function(r){return r.arrayBuffer();});}))" +
  "  .then(function(bufs){var total=bufs.reduce(function(n,b){return n+b.byteLength;},0);var out=new Uint8Array(total);var off=0;bufs.forEach(function(b){out.set(new Uint8Array(b),off);off+=b.byteLength;});return out;});" +
  "self.fetch=function(u,o){if(typeof u===\"string\"&&u.indexOf(\".wasm\")!==-1)return merged.then(function(m){return new Response(m,{headers:{\"Content-Type\":\"application/wasm\"}});});return f(u,o);};" +
  "importScripts(" + JSON.stringify("./" + SF18_LOADER) + ");})();\n");
console.log("wrote boot-single.js (18 같은 출처 조각 이어붙이기)");
