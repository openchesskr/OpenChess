#!/usr/bin/env node
/** (v0.5.7 성능) 번들에 이미지를 base64로 박아 넣지 않았는지 검사한다.
 *   · 예전엔 마스코트 12장·칭호 배지 35장을 data URI(약 70만 자)로 src/App.jsx에 넣어, 첫 화면에 안 쓰여도 모든 방문자가 메인
 *     번들과 함께 받았다(메인 번들 gzip 1.2MB 중 상당 부분). 이미지는 public/에 파일로 두고 경로로 가리킨다.
 *   · src 안의 data:(image|audio|font|video)…;base64 문자열이 INLINE_LIMIT자를 넘으면 실패한다(작은 아이콘 수준만 허용).
 *   · 코드가 가리키는 /titles/·/mascot/·/move-fx/ 이미지 경로가 public/에 실제로 있는지도 확인한다(파일로 뺀 뒤 경로 오타·누락 방지).
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-inline-assets.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const INLINE_LIMIT = 2000;
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(jsx?|mjs|css)$/.test(f)) files.push(p);
  }
})(join(ROOT, "src"));

const problems = [];
let refs = 0;
for (const p of files) {
  const src = readFileSync(p, "utf8");
  for (const m of src.matchAll(/data:(?:image|audio|font|video)\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/g)) {
    if (m[0].length > INLINE_LIMIT) problems.push(relative(ROOT, p) + ": base64 " + m[0].slice(0, 30) + "… (" + m[0].length + "자) — public/에 파일로 두고 경로로 가리킬 것");
  }
  for (const m of src.matchAll(/["'](\/(?:titles|mascot|move-fx)\/[\w.-]+\.(?:webp|png|jpg|svg))["']/g)) {
    refs++;
    if (!existsSync(join(ROOT, "public", m[1]))) problems.push(relative(ROOT, p) + ": " + m[1] + " 파일이 public/에 없음");
  }
}
if (problems.length) {
  console.error("✗ inline assets check 실패:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("✓ inline assets check: " + files.length + "개 파일에 " + INLINE_LIMIT + "자 넘는 base64 없음, 이미지 경로 " + refs + "개 모두 존재");
