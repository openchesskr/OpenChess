#!/usr/bin/env node
/** (v0.7.9 성능, 번들 분할) 첫 화면 번들(index)에 탭·창 화면과 큰 데이터가 다시 딸려 들어오지 않게 지킨다.
 *  v0.7.8까지는 App이 모든 탭을 정적으로 import하고, shell·social·profile이 미니게임 이름표 하나 때문에 play.jsx 전체를 끌고 와
 *  어느 주소로 들어와도 약 3.2MB(SNAP 포함)를 한 번에 받았다. 지금은 분석 탭(기본 첫 화면)·공용 코드만 index에 두고 나머지는 처음 열 때 받는다.
 *   1. 정적 import 그래프(src/main.jsx에서 시작, import()는 제외)에 LAZY_ONLY 파일이 없어야 한다 — 있으면 들어오는 경로를 출력한다.
 *   2. lazyScreens.jsx의 lazyScreen(key, "이름")이 가리키는 파일이 그 이름을 실제로 export한다.
 *   3. 미니게임 이름표(playSpecialGames.jsx)와 게임 화면 연결(play.jsx SPECIAL_GAME_COMPONENTS)의 gameType이 같다.
 *   4. 레슨 id 목록(lessonIds.js)이 커리큘럼(allLessons) 순서와 같다.
 *   5. 오프닝 스냅샷(SNAP)이 src/data/snapTree.js 한 곳에, refresh-data가 고쳐 쓰는 한 줄 형식으로 있고 별도 청크(data-snap)로 나간다(BUG-191).
 *  빌드 결과 크기 예산은 check-bundle-size(postbuild)가 본다. 실행: node scripts/check-bundle-split.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const rd = (p) => readFileSync(join(ROOT, p), "utf8");
const fails = [];

// 1. 첫 화면 정적 import 그래프
const LAZY_ONLY = [
  "src/app/play.jsx", "src/app/puzzle.jsx", "src/app/learn.jsx", "src/app/dex.jsx", "src/app/settings.jsx", "src/app/review.jsx",
  "src/app/masterPage.jsx", "src/app/social.jsx", "src/app/profileEdit.jsx", "src/app/legacyFeed.jsx", "src/app/lessons.jsx",
  "src/lib/lessons/curriculum.js", "src/lib/recentPerformance.js", "src/AboutPage.jsx", "src/FaqPage.jsx",
];
const IMPORT_RE = /^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*["'](\.{1,2}\/[^"']+)["']|^[ \t]*import\s*["'](\.{1,2}\/[^"']+)["']/gm;
function resolve(from, spec) {
  const base = join(dirname(from), spec);
  for (const c of [base, base + ".js", base + ".jsx", join(base, "index.js")]) if (existsSync(join(ROOT, c)) && /\.(jsx?|json|css)$/.test(c)) return c;
  return null;
}
const parent = new Map([["src/main.jsx", null]]);
const queue = ["src/main.jsx"];
while (queue.length) {
  const f = queue.shift();
  if (!/\.jsx?$/.test(f)) continue;
  const src = readFileSync(join(ROOT, f), "utf8");
  for (const m of src.matchAll(IMPORT_RE)) {
    const to = resolve(f, m[1] || m[2]);
    if (!to) { fails.push(f + ": import 경로를 찾지 못함 " + (m[1] || m[2])); continue; }
    const key = relative(ROOT, join(ROOT, to));
    if (!parent.has(key)) { parent.set(key, f); queue.push(key); }
  }
}
for (const f of LAZY_ONLY) {
  if (!parent.has(f)) continue;
  const chain = [];
  for (let n = f; n; n = parent.get(n)) chain.unshift(n);
  fails.push(f + "가 첫 화면 번들에 정적으로 들어옴: " + chain.join(" → ") + " — 화면은 src/app/lazyScreens.jsx로, 상수·Context는 가벼운 파일로 옮길 것");
}

// 2. lazyScreens의 export 이름 확인
const lazySrc = rd("src/app/lazyScreens.jsx");
const loaders = Object.fromEntries([...lazySrc.matchAll(/^\s*(\w+): (?:afterFullCatalog\()?\(\) => import\("\.\/([\w.]+)"\)/gm)].map((m) => [m[1], "src/app/" + m[2]]));
const screens = [...lazySrc.matchAll(/lazyScreen\("(\w+)", "(\w+)"/g)];
if (screens.length < 10) fails.push("lazyScreens.jsx: lazyScreen 정의를 읽지 못함(" + screens.length + "개)");
for (const [, key, name] of screens) {
  const file = loaders[key];
  if (!file) { fails.push("lazyScreens.jsx: 알 수 없는 key " + key); continue; }
  const src = rd(file);
  if (!new RegExp("export (?:function|const|class) " + name + "\\b|export \\{[^}]*\\b" + name + "\\b").test(src)) fails.push(file + "가 " + name + "을 export하지 않음(lazyScreen \"" + key + "\")");
}
const app = rd("src/App.jsx");
for (const m of app.matchAll(/^import[^;]*?from\s+"\.\/app\/(\w+)\.jsx"/gm)) if (LAZY_ONLY.includes("src/app/" + m[1] + ".jsx")) fails.push("App.jsx가 app/" + m[1] + ".jsx를 정적으로 import함 — lazyScreens.jsx를 거칠 것");
if (!/prefetchScreens\(/.test(app)) fails.push("App.jsx: prefetchScreens 호출이 없음(탭을 처음 누를 때 기다림이 생긴다)");

// 3. 미니게임 이름표 ↔ 게임 화면
const info = rd("src/app/playSpecialGames.jsx"), play = rd("src/app/play.jsx");
const infoTypes = [...info.matchAll(/gameType: "(\w+)"/g)].map((m) => m[1]).sort();
const compBlock = /const SPECIAL_GAME_COMPONENTS = \{([^}]*)\}/.exec(play);
const compTypes = compBlock ? [...compBlock[1].matchAll(/(\w+):/g)].map((m) => m[1]).sort() : [];
if (!infoTypes.length || infoTypes.join() !== compTypes.join()) fails.push("미니게임 gameType 불일치: 이름표 [" + infoTypes + "] / play.jsx SPECIAL_GAME_COMPONENTS [" + compTypes + "]");
if (/Component:/.test(info)) fails.push("playSpecialGames.jsx에 게임 컴포넌트를 넣지 말 것(플레이 탭 전체가 첫 화면 번들로 딸려 옴)");

// 4. 레슨 id 목록
const { allLessons } = await import("../src/lib/lessons/curriculum.js");
const { LESSON_IDS } = await import("../src/lib/lessons/lessonIds.js");
const ids = allLessons().map((l) => l.id);
if (ids.join() !== LESSON_IDS.join()) fails.push("src/lib/lessons/lessonIds.js가 커리큘럼 순서와 다름 — 다음으로 바꿀 것:\n    export const LESSON_IDS = " + JSON.stringify(ids) + ";");

// 5. SNAP 스냅샷 위치·형식
const snapLines = rd("src/data/snapTree.js").split(/\r?\n/).filter((l) => /^(export )?const SNAP = /.test(l));
if (snapLines.length !== 1 || !snapLines[0].startsWith("export const SNAP = /*__DATA__*/ ")) fails.push("src/data/snapTree.js: `export const SNAP = /*__DATA__*/ {...};` 한 줄이 정확히 하나 있어야 함(refresh-data가 이 줄을 고쳐 씀)");
else {
  try { const d = JSON.parse(snapLines[0].slice(snapLines[0].indexOf("/*__DATA__*/ ") + 13).trimEnd().replace(/;$/, "")); if (!d.tree || !d.tree[""] || Object.keys(d.tree).length < 1000) fails.push("SNAP 트리가 비었거나 너무 작음"); }
  catch (e) { fails.push("SNAP JSON 파싱 실패: " + e.message); }
}
if (/__DATA__/.test(rd("src/app/common.jsx"))) fails.push("common.jsx에 SNAP 데이터가 다시 들어옴 — src/data/snapTree.js에만 둘 것");
if (!/const SNAP_FILE = "src\/data\/snapTree\.js"/.test(rd("scripts/refresh-data.mjs"))) fails.push("scripts/refresh-data.mjs가 src/data/snapTree.js를 고쳐 쓰지 않음(BUG-191)");
if (!/snapTree[\s\S]{0,40}"data-snap"/.test(rd("vite.config.js"))) fails.push("vite.config.js: snapTree.js를 data-snap 청크로 나누는 규칙이 없음");

if (fails.length) { console.error("✗ check-bundle-split 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-bundle-split: 첫 화면 정적 import " + parent.size + "개 파일에 지연 전용 " + LAZY_ONLY.length + "개 없음, 지연 화면 " + screens.length + "개 export 확인, 미니게임 " + infoTypes.length + "종·레슨 " + ids.length + "개 목록 일치, SNAP 별도 청크");
