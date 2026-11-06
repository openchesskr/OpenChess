#!/usr/bin/env node
/** (v0.7.3 재발 방지) 전체 효과·반응형 다듬기에서 지킬 규칙 검사.
 *  ① 공용 모션 키트(src/components/motionKit.jsx)는 기기의 "애니메이션 줄이기"를 보지 않고(check-reduced-motion 원칙) 성능 모드(isLite)만 본다.
 *  ② 모달 열림 연출 클래스(.oc-modal-bg)는 CSS가 안쪽 카드의 transform을 덮으므로, 이미 framer-motion으로 연출하는 카드(첫 자식이 motion.div)에는 붙이지 않는다 — 어긋나 보인다.
 *  ③ 탭 전환 페이드(useTabFade)·스크롤 맨 위 버튼은 transform/filter를 쓰지 않는다 — 조상에 걸리면 position:fixed 자손의 기준이 바뀌어 오버레이 위치가 틀어진다.
 *  ④ index.css의 새 무한 반복 애니메이션(.oc-skel)은 가벼운 모드(data-perf="lite")에서 꺼진다.
 *  실행: node scripts/check-motion-kit.mjs (npm run build 전에 prebuild로 자동 실행)
 */
import fs from "node:fs";
import path from "node:path";
const root = new URL("..", import.meta.url).pathname;
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const fails = [];

const kit = read("src/components/motionKit.jsx");
if (!/from "\.\.\/lib\/perfMode\.js"/.test(kit)) fails.push("motionKit.jsx: perfMode(isLite)를 쓰지 않음 — 가벼운 모드에서 연출을 줄여야 함");
const tabFade = (kit.match(/export function useTabFade[\s\S]*?\n}\n/) || [""])[0];
if (!tabFade) fails.push("motionKit.jsx: useTabFade 없음");
if (/transform|translate|scale|filter|blur/.test(tabFade.replace(/\/\/.*$/gm, "").replace(/"cubic-bezier[^"]*"/g, ""))) fails.push("useTabFade: opacity 외 속성(transform/filter 등)을 쓰면 안쪽 fixed 요소 위치가 틀어짐");

const css = read("src/index.css");
if (!/html\[data-perf="lite"\] \.oc-skel \{ animation: none/.test(css)) fails.push("index.css: .oc-skel이 가벼운 모드에서 꺼지지 않음");
if (/\.oc-app-in\s*\{[^}]*\bboth\b|\.oc-app-in\s*\{[^}]*forwards/.test(css)) fails.push("index.css: .oc-app-in은 backwards여야 함(끝난 뒤 opacity 스타일이 남아 쌓임 맥락이 생김)");

// ② .oc-modal-bg 바로 안쪽 첫 자식이 motion.div면 실패
const dir = path.join(root, "src");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.jsx$/.test(e.name) ? [path.join(d, e.name)] : []);
for (const f of walk(dir)) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  lines.forEach((l, i) => {
    if (!l.includes("oc-modal-bg")) return;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const t = lines[j].trim();
      if (!t || t.startsWith("{/*") || t.startsWith("//") || t.startsWith("*")) continue;
      if (/^<motion\./.test(t)) fails.push(path.relative(root, f) + ":" + (i + 1) + " — .oc-modal-bg 안쪽 첫 자식이 motion 요소(CSS와 framer-motion transform 충돌)");
      break;
    }
  });
}

if (fails.length) { console.error("✗ motion-kit check 실패:\n" + fails.map((x) => "  " + x).join("\n")); process.exit(1); }
console.log("✓ motion-kit check: 키트 규칙(isLite·opacity 전용 탭 페이드·모달 연출 충돌 없음) 통과");
