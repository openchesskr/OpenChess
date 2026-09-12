#!/usr/bin/env node
/** (v0.4.9 기능, 사용자 요청) Stockfish 18 정식(비-Lite) 대형 신경망 엔진을 Vercel Blob으로 옮기는
 *  1회성 업로드 스크립트 — public/engine/18(약 216MB, 배포 결과물 중 가장 큰 단일 조각)을 git
 *  레포·Vercel 배포 결과물에서 완전히 빼기 위해서다. copy-engine.mjs의 splitWasm/bootScript 로직을
 *  거의 그대로 가져오되, 결정적인 차이가 하나 있다 — 생성되는 boot-single.js/boot-mt.js가
 *  self.location(워커 자신의 URL) 기준 상대 경로로 형제 파일(wasm 조각·로더 js)을 찾던 방식을
 *  전부 "업로드 시점에 실제로 받은 절대 Blob URL을 코드에 직접 박아 넣는" 방식으로 바꿨다.
 *
 *  이유: App.jsx의 엔진 워커 생성 로직(약 467줄)은 로컬 경로("/"로 시작)면 new Worker(url)로 직접
 *  만들어 self.location이 곧 그 파일의 실제 URL이 되지만, 외부(CDN/Blob) URL이면
 *  `new Worker(URL.createObjectURL(new Blob(["importScripts('"+url+"');"])))`로 감싸서 만든다 —
 *  이러면 워커의 self.location은 그 blob: 오브젝트 URL이지, 실제로 importScripts로 불러온 원격
 *  스크립트의 URL이 아니다. self.location 기준 상대 경로 계산(옛 boot 스크립트가 하던 방식)은 이
 *  경우 완전히 깨진다 — 그래서 이 스크립트가 만드는 boot-*.js는 self.location을 아예 참조하지
 *  않고, 업로드로 실제 확정된 절대 URL만 사용한다.
 *
 *  사용법: BLOB_READ_WRITE_TOKEN=... node scripts/upload-engine18-blob.mjs
 *  이미 올라간 파일은 건너뛰지 않고 매번 새로 올린다(addRandomSuffix:false로 경로 고정 — 같은
 *  경로에 다시 올리면 그냥 덮어써진다, 즉 재실행해도 안전). 스톡피시18 npm 패키지 버전을 올릴
 *  때만 이 스크립트를 다시 돌리면 된다.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { put } from "@vercel/blob";

const require = createRequire(import.meta.url);

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN 환경변수가 필요합니다.");
  process.exit(1);
}

const full18Dir = dirname(require.resolve("stockfish18/package.json")) + "/bin";
const PART_CAP_BYTES = 90 * 1024 * 1024;
const PREFIX = "engine/18/";

function splitWasm(srcPath, baseName) {
  if (!existsSync(srcPath)) { console.warn("missing", srcPath); return null; }
  const buf = readFileSync(srcPath);
  const partCount = Math.max(1, Math.ceil(buf.length / PART_CAP_BYTES));
  const partSize = Math.ceil(buf.length / partCount);
  const parts = [];
  for (let i = 0; i < partCount; i++) {
    parts.push({ name: baseName + "-part-" + i + ".wasm", buf: buf.subarray(i * partSize, Math.min(buf.length, (i + 1) * partSize)) });
  }
  console.log("split", baseName + ".wasm", "(" + buf.length + " bytes) into", partCount, "part(s)");
  return parts;
}

async function upload(pathname, body, contentType) {
  const r = await put(PREFIX + pathname, body, {
    access: "public",
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
    contentType,
    allowOverwrite: true,
  });
  console.log("uploaded", pathname, "->", r.url);
  return r.url;
}

// self.location을 전혀 쓰지 않는, 절대 URL만으로 동작하는 boot 스크립트.
function bootScript(partUrls, loaderUrl) {
  return "(function(){\n" +
    "var partUrls=" + JSON.stringify(partUrls) + ";\n" +
    "var partsPromise=Promise.all(partUrls.map(function(u){return fetch(u).then(function(r){if(!r.ok)throw new Error('part fetch failed: '+u+' '+r.status);return r.arrayBuffer();});}))\n" +
    "  .then(function(buffers){var total=buffers.reduce(function(n,b){return n+b.byteLength;},0);var merged=new Uint8Array(total);var offset=0;buffers.forEach(function(b){merged.set(new Uint8Array(b),offset);offset+=b.byteLength;});return merged;});\n" +
    "var realFetch=self.fetch.bind(self);\n" +
    "self.fetch=function(url,opts){if(typeof url===\"string\"&&url.indexOf(\".wasm\")!==-1){return partsPromise.then(function(merged){return new Response(merged,{headers:{\"Content-Type\":\"application/wasm\"}});});}return realFetch(url,opts);};\n" +
    "importScripts(" + JSON.stringify(loaderUrl) + ");\n" +
    "})();\n";
}

(async () => {
  const singleJs18 = "stockfish-18-single.js", mtJs18 = "stockfish-18.js";
  const loaderUrls = {};
  for (const f of [singleJs18, mtJs18]) {
    const src = join(full18Dir, f);
    if (!existsSync(src)) { console.warn("missing", src); continue; }
    loaderUrls[f] = await upload(f, readFileSync(src), "application/javascript");
  }

  const singleParts = splitWasm(join(full18Dir, "stockfish-18-single.wasm"), "stockfish-18-single");
  const mtParts = splitWasm(join(full18Dir, "stockfish-18.wasm"), "stockfish-18");

  const singlePartUrls = [];
  if (singleParts) for (const p of singleParts) singlePartUrls.push(await upload(p.name, p.buf, "application/wasm"));
  const mtPartUrls = [];
  if (mtParts) for (const p of mtParts) mtPartUrls.push(await upload(p.name, p.buf, "application/wasm"));

  let bootSingleUrl = null, bootMtUrl = null;
  if (singlePartUrls.length && loaderUrls[singleJs18]) {
    bootSingleUrl = await upload("boot-single.js", bootScript(singlePartUrls, loaderUrls[singleJs18]), "application/javascript");
  }
  if (mtPartUrls.length && loaderUrls[mtJs18]) {
    bootMtUrl = await upload("boot-mt.js", bootScript(mtPartUrls, loaderUrls[mtJs18]), "application/javascript");
  }

  console.log("\n=== ENGINE_PROFILES.full18에 넣을 URL ===");
  console.log("urls[0]  (boot-single.js):", bootSingleUrl);
  console.log("mtUrl    (boot-mt.js):    ", bootMtUrl);
})();
