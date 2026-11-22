// (v0.8.0, BUG-201) public/ 이미지 용량 검사 — prebuild.
// 디자이너가 만든 원본(2048px PNG·장당 수 MB)이 그대로 public/에 들어가 사용자에게 그 크기로 전송되던 문제를 막는다.
//  ① 이미지 한 장이 MAX_BYTES를 넘으면 실패: 표시 크기의 2배 정도로 줄인 webp로 바꾸고 원본은 git rm 할 것.
//  ② PNG가 가로·세로 중 하나라도 MAX_PNG_SIDE를 넘으면 실패: 큰 그림은 webp로(투명도도 유지된다).
// public/engine(엔진 파일)은 대상이 아니다. 꼭 큰 파일이 필요하면 ALLOW에 이유와 함께 적는다.
import { readdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PUB = path.join(ROOT, "public");
const MAX_BYTES = 300 * 1024;
const MAX_PNG_SIDE = 1024;
const ALLOW = new Map([
  // ["public/경로", "이유"],
]);
const IMG = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (path.relative(PUB, p) === "engine") continue; yield* walk(p); }
    else if (IMG.test(e.name)) yield p;
  }
}
function pngSize(file) {
  const fd = openSync(file, "r"); const b = Buffer.alloc(24);
  try { readSync(fd, b, 0, 24, 0); } finally { closeSync(fd); }
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

const fails = [];
let n = 0;
for (const f of walk(PUB)) {
  n++;
  const rel = path.relative(ROOT, f).split(path.sep).join("/");
  if (ALLOW.has(rel)) continue;
  const size = statSync(f).size;
  if (size > MAX_BYTES) fails.push(`${rel}: ${Math.round(size / 1024)}KB > ${MAX_BYTES / 1024}KB`);
  if (/\.png$/i.test(f)) {
    const wh = pngSize(f);
    if (wh && Math.max(...wh) > MAX_PNG_SIDE) fails.push(`${rel}: PNG ${wh[0]}×${wh[1]} — ${MAX_PNG_SIDE}px 넘는 그림은 webp로`);
  }
}
if (fails.length) {
  console.error("✘ check-public-image-size: 너무 큰 이미지 " + fails.length + "개 — 표시 크기의 2배 정도로 줄인 webp로 바꾸고 원본은 git rm 할 것(README public/ 규칙, BUG-201)\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log(`✔ check-public-image-size: public/ 이미지 ${n}개 모두 ${MAX_BYTES / 1024}KB 이하, PNG는 ${MAX_PNG_SIDE}px 이하`);
