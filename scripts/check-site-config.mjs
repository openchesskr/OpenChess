#!/usr/bin/env node
/** (v0.6.0, 앱 출시 준비) 앱(웹뷰) 안에서 깨지는 주소 사용과 상표 이미지 재도입을 막는다.
 *   · 서버 API(/api/…)는 siteConfig의 apiUrl()로만 호출 — 상대 경로를 그대로 쓰면 앱에서 localhost로 가 실패한다.
 *   · 사용자에게 내보내는 공유·초대 링크는 SITE_URL로 만든다 — window.location.origin은 앱에서 capacitor://localhost가 된다.
 *     (OAuth redirect_to는 현재 출처가 필요해 예외. 앱 로그인을 만들 때 별도로 바꾼다.)
 *   · public/의 chess.com 로고 이미지(남의 상표)를 다시 참조하지 않는다.
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-site-config.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const fails = [];
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    statSync(p).isDirectory() ? walk(p, out) : /\.(jsx?|mjs)$/.test(n) && out.push(p);
  }
  return out;
}
for (const f of walk("src")) {
  if (f.endsWith("siteConfig.js")) continue;
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    const at = f + ":" + (i + 1);
    if (/["'`]\/api\/[a-z-]+/.test(code) && !/apiUrl\(\s*["'`]\/api\//.test(code)) fails.push(at + " — /api/ 상대 경로 직접 사용. apiUrl()로 감쌀 것");
    if (/window\.location\.origin/.test(code) && !/redirect/i.test(code)) fails.push(at + " — 공유 링크에 window.location.origin 사용. SITE_URL 사용");
    if (/chess\.com_(Icon|Logo)/.test(line)) fails.push(at + " — chess.com 로고 이미지 참조(상표). 글자로 표기");
  });
}
if (fails.length) { console.error("check-site-config 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("check-site-config 통과");
