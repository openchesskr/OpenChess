#!/usr/bin/env node
/** npm 'stockfish' 빌드를 public/engine 으로 복사 (Web Worker 동일 출처 로딩용).
 *  (20차 기능2, v0.2.0 기능 추가 → v0.3.5 정리 → 8z5dbt 세션 기능 추가) 세 엔진을 함께 제공한다 —
 *  가볍고 빠른 Stockfish 18 Lite, Stockfish 17.1(정식 대형 신경망), 그리고 셋 중 가장 강력한
 *  Stockfish 18 정식(비-Lite) 대형 신경망. 게임 리뷰 전용으로 고정해 쓰던 네 번째 엔진 Stockfish
 *  16(NNUE)은 v0.3.5에서 폐기했다 — 게임 리뷰도 이제 이 아래 엔진 중 사용자가 설정 탭에서 고른 것을
 *  그대로 쓴다(App.jsx ENGINE_PROFILES 참고). 같은 npm 패키지 이름을 여러 버전으로 동시에 설치할 수
 *  없어 package.json에서 "stockfish171"/"stockfish18" 별칭(npm:stockfish@<버전>)으로 나눠 받는다. */
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
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

// (8z5dbt 세션 기능 → v0.4.9 변경) Stockfish 18 정식(비-Lite) 대형 신경망 — npm 패키지가 이 빌드는
// 조각내지 않고 wasm 파일 하나(~113MB, Vercel의 배포 파일당 100MB 제한을 넘음)로만 배포해서,
// 예전엔 여기서 빌드 시점마다 100MB 미만 조각(-part-N.wasm)으로 직접 쪼개 public/engine/18에
// 두었다(약 216MB) — 그런데 이러면 매 배포마다 이 216MB가 통째로 다시 패키징돼 Vercel Deployment
// Storage(무료 한도 10GB) 초과의 주범이 됐다.
// (v0.4.9 기능, 사용자 요청) 이 wasm은 스톡피시18 npm 버전을 올릴 때만 바뀌는 정적 자산이라, 매
// 빌드마다 다시 만들 필요가 없다 — scripts/upload-engine18-blob.mjs로 딱 한 번 Vercel Blob에
// 업로드해 두고, App.jsx의 ENGINE_PROFILES.full18이 그 고정된 절대 URL을 직접 참조한다. 그래서
// 이 스크립트(copy-engine.mjs)는 더 이상 engine/18을 건드리지 않는다 — stockfish18 npm 패키지
// 버전을 올렸다면, 아래 명령으로 새 조각을 다시 올리고 App.jsx의 두 URL만 갱신하면 된다:
//   BLOB_READ_WRITE_TOKEN=... node scripts/upload-engine18-blob.mjs
