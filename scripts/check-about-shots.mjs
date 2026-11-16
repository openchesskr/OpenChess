/**
 * (v0.7.8) /about 스크린샷 검사 — 소개 페이지가 쓰는 스크린샷이 6개 언어 모두에 빠짐없이 있는지 확인한다.
 *  · src/AboutPage.jsx의 SHOT("이름")·SHOT(x.n)에 쓰인 이름이 about-shots.config.mjs 목록에 있어야 한다
 *  · public/about/v3/<언어>/<이름>.webp가 6개 언어 × 전체 목록만큼 있어야 한다(한 언어라도 빠지면 그 언어 화면에서 이미지가 깨진다)
 *  · 새 스크린샷은 npm run about:shots로 찍는다(README 버전 종료 프로토콜).
 * npm run build 전에 prebuild로 자동 실행된다.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { ABOUT_SHOT_NAMES, ABOUT_SHOT_LANGS, ABOUT_SHOT_DIR } from "./about-shots.config.mjs";

const root = new URL("../", import.meta.url);
const fails = [];
const src = readFileSync(new URL("src/AboutPage.jsx", root), "utf8");
const used = new Set();
for (const m of src.matchAll(/SHOT\("([\w-]+)"\)/g)) used.add(m[1]);
for (const m of src.matchAll(/\{\s*n:\s*"([\w-]+)"/g)) used.add(m[1]);
for (const m of src.matchAll(/const names = \[([^\]]+)\]/g)) for (const x of m[1].matchAll(/"([\w-]+)"/g)) used.add(x[1]);
for (const n of used) if (!ABOUT_SHOT_NAMES.includes(n)) fails.push("AboutPage가 쓰는 스크린샷 '" + n + "'이 about-shots.config.mjs 목록에 없음");
if (!/\/about\/v3\//.test(src) || !/\blang\b/.test(src.slice(src.indexOf("const SHOT"), src.indexOf("const SHOT") + 200))) fails.push("AboutPage의 SHOT()이 언어별 폴더(/about/v3/<언어>/)를 쓰지 않음");
let n = 0;
for (const lang of ABOUT_SHOT_LANGS) for (const name of ABOUT_SHOT_NAMES) {
  const p = new URL(ABOUT_SHOT_DIR + "/" + lang + "/" + name + ".webp", root);
  if (!existsSync(p)) fails.push("빠진 스크린샷: " + ABOUT_SHOT_DIR + "/" + lang + "/" + name + ".webp");
  else if (statSync(p).size < 2000) fails.push("비정상적으로 작은 스크린샷(빈 화면?): " + lang + "/" + name);
  else n++;
}
if (fails.length) { console.error("✖ check-about-shots\n  " + fails.join("\n  ") + "\n  → npm run about:shots 로 다시 찍을 것"); process.exit(1); }
console.log("✔ check-about-shots: 소개 페이지 스크린샷 " + n + "장(" + ABOUT_SHOT_LANGS.length + "개 언어 × " + ABOUT_SHOT_NAMES.length + "장)이 모두 있음");
