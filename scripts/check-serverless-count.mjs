#!/usr/bin/env node
/** (v0.7.8 BUG-178 재발 방지) Vercel Hobby 요금제는 배포 하나에 서버리스 함수 12개까지만 허용한다 — 넘으면 빌드는 통과해도 배포가 실패해
 *  프리뷰·운영 배포가 모두 멈춘다. api/ 바로 아래의 .js(밑줄로 시작하는 폴더·파일 제외)가 곧 함수 하나다.
 *  새 서버 기능은 기존 함수 안의 경로(예: api/lichess.js?games=1, api/youtube.js?web=1)로 붙이고, 처리기는 api/_lib/에 둔다.
 *  실행: node scripts/check-serverless-count.mjs (prebuild) */
import { readdirSync, statSync } from "node:fs";
const MAX = 12;
const dir = new URL("../api/", import.meta.url).pathname;
const walk = (d, rel = "") => readdirSync(d).flatMap((f) => {
  if (f.startsWith("_") || f.startsWith(".")) return [];
  const p = d + f, r = rel + f;
  return statSync(p).isDirectory() ? walk(p + "/", r + "/") : /\.(js|mjs|cjs|ts)$/.test(f) ? [r] : [];
});
const fns = walk(dir);
if (fns.length > MAX) { console.error("✗ check-serverless-count: 서버리스 함수 " + fns.length + "개 — Vercel Hobby 한도 " + MAX + "개 초과(배포 실패). 기존 함수 안의 경로로 합칠 것:\n  " + fns.join("\n  ")); process.exit(1); }
console.log("✓ check-serverless-count: 서버리스 함수 " + fns.length + "/" + MAX + "개");
