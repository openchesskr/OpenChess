#!/usr/bin/env node
/** (v0.7.9 성능, 번들 분할) 빌드 결과에서 첫 화면이 받는 스크립트(dist/index.html의 진입 스크립트 + modulepreload) 크기를 예산과 비교한다.
 *  v0.7.8까지는 모든 탭이 한 파일이라 첫 화면 스크립트가 약 3.5MB(gzip 약 1.1MB)였다. check-bundle-split(prebuild)이 구조를,
 *  이 검사(postbuild, npm run build 뒤 자동 실행)는 실제 결과 크기를 지킨다. 예산을 넘으면 새 코드를 탭 파일·지연 import로 옮기거나,
 *  꼭 첫 화면에 필요하면 이유를 남기고 BUDGET을 올린다. 실행: node scripts/check-bundle-size.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = new URL("../dist/", import.meta.url).pathname;
// 첫 화면 스크립트 합계 예산(gzip 기준 — 실제 전송 크기). v0.7.9 측정값: 613KB(SNAP 별도 청크·React·framer-motion 포함).
const BUDGET_GZIP = 700 * 1024;
// 앱 코드 진입 파일(index) 하나의 예산(압축 전) — 배포마다 바뀌어 재방문자도 다시 받는 부분. v0.7.9 측정값: 1,277KB.
const BUDGET_INDEX_RAW = 1500 * 1024;

if (!existsSync(join(DIST, "index.html"))) { console.error("✗ check-bundle-size: dist/index.html 없음 — 빌드 후 실행할 것"); process.exit(1); }
const html = readFileSync(join(DIST, "index.html"), "utf8");
const files = [...new Set([...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]))];
const fails = [];
let raw = 0, gz = 0, indexRaw = 0;
const rows = [];
for (const f of files) {
  const buf = readFileSync(join(DIST, f));
  const g = gzipSync(buf, { level: 9 }).length;
  raw += buf.length; gz += g;
  if (/^assets\/index-[^/]+\.js$/.test(f)) indexRaw = buf.length;
  rows.push(f.replace("assets/", "") + " " + Math.round(buf.length / 1024) + "KB(gzip " + Math.round(g / 1024) + "KB)");
}
if (!indexRaw) fails.push("진입 파일(assets/index-*.js)을 찾지 못함");
if (!files.some((f) => /data-snap-/.test(f))) fails.push("data-snap 청크가 첫 화면 목록에 없음 — SNAP이 index에 다시 합쳐졌는지 확인(check-bundle-split)");
if (gz > BUDGET_GZIP) fails.push("첫 화면 스크립트 gzip " + Math.round(gz / 1024) + "KB > 예산 " + Math.round(BUDGET_GZIP / 1024) + "KB");
if (indexRaw > BUDGET_INDEX_RAW) fails.push("index 파일 " + Math.round(indexRaw / 1024) + "KB > 예산 " + Math.round(BUDGET_INDEX_RAW / 1024) + "KB");
if (fails.length) { console.error("✗ check-bundle-size 실패:\n  " + fails.join("\n  ") + "\n  첫 화면 파일: " + rows.join(", ")); process.exit(1); }
console.log("✔ check-bundle-size: 첫 화면 스크립트 " + files.length + "개 " + Math.round(raw / 1024) + "KB(gzip " + Math.round(gz / 1024) + "KB / 예산 " + Math.round(BUDGET_GZIP / 1024) + "KB), index " + Math.round(indexRaw / 1024) + "KB / " + Math.round(BUDGET_INDEX_RAW / 1024) + "KB");
