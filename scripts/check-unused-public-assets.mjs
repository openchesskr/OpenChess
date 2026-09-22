#!/usr/bin/env node
/** (v0.5.2 기능, Vercel Deployment Storage 초과 대응) public/ 아래 파일 중 src/ 어디서도 파일명이
 *  문자열로 등장하지 않는 것을 찾아 보고한다. Vercel의 "Deployment Storage"는 배포 하나의 용량이
 *  아니라 지금까지 보관된 모든 배포(프리뷰 포함)의 빌드 결과물 총합이라, public/에 안 쓰는 파일이
 *  하나 쌓일 때마다 그 무게가 배포 횟수만큼 곱해져 누적된다 — 실제로 이 문제 때문에 한 번 10GB
 *  무료 한도를 크게 초과한 적이 있어(README v0.5.2 참고), 이 스크립트를 추가해 둔다.
 *
 *  판정 방식은 "파일명 문자열이 src/ 안 어디에도 안 보이면 미사용"으로 단순하게 잡는다 — 동적으로
 *  조합되는 경로(예: `${tier}-${n}.png`)는 놓칠 수 있으므로, 결과는 참고용 경고일 뿐 자동으로
 *  지우지 않는다. 삭제하기 전에는 항상 grep으로 한 번 더 직접 확인할 것.
 *
 *  실행: node scripts/check-unused-public-assets.mjs (또는 npm run check:assets)
 *  제외 대상: public/engine(빌드 때마다 재생성되는 엔진 파일, 별도 관리), public/about(about 페이지
 *  스크린샷 폴더 — 파일명이 아니라 폴더 스캔으로 로드될 가능성이 있어 오탐이 잦음). */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, "public");
const SRC_DIR = join(ROOT, "src");
const SKIP_DIRS = new Set(["engine", "about"]);
const ASSET_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".mp3", ".wav", ".ico"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (dir === PUBLIC_DIR && SKIP_DIRS.has(name)) continue;
      walk(p, out);
    } else if (ASSET_EXTS.has(extname(name).toLowerCase())) {
      out.push({ path: p, size: st.size });
    }
  }
  return out;
}

function walkSrcText(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkSrcText(p, out);
    else if (/\.(jsx?|tsx?|css|html|json)$/i.test(name)) out.push(readFileSync(p, "utf8"));
  }
  return out;
}

const assets = walk(PUBLIC_DIR);
const srcTexts = walkSrcText(SRC_DIR);
srcTexts.push(readFileSync(join(ROOT, "index.html"), "utf8"));

const haystack = srcTexts.join("\n");
const unused = assets.filter((a) => {
  const base = a.path.slice(PUBLIC_DIR.length + 1);
  const name = base.split("/").pop();
  return !haystack.includes(base) && !haystack.includes(name) && !haystack.includes(name.replace(/\.[^.]+$/, ""));
});

unused.sort((a, b) => b.size - a.size);
const totalMB = (unused.reduce((s, a) => s + a.size, 0) / 1024 / 1024).toFixed(1);

if (!unused.length) {
  console.log("public/ 안에 미사용으로 의심되는 파일이 없습니다.");
} else {
  console.log(`미사용으로 의심되는 파일 ${unused.length}개 (총 ${totalMB}MB) — 삭제 전 직접 grep으로 한 번 더 확인하세요:\n`);
  for (const a of unused) console.log(`  ${(a.size / 1024).toFixed(0).padStart(7)} KB  ${relative(ROOT, a.path)}`);
  console.log("\n(동적으로 조합되는 파일 경로는 이 스캔에 잡히지 않을 수 있습니다 — 참고용 경고입니다.)");
}
