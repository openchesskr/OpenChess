#!/usr/bin/env node
/** (v0.6.4) 모식도 전체 화면 보기 — 모식도를 쓰는 트리(도감 오프닝 트리·마스터 트리·퍼즐 모식도)가 모두 전체 화면 버튼과 닫기 버튼을 갖는지 검사한다.
 *  새 모식도를 만들면 같은 훅(useSchematicFullscreen)·토글·닫기 버튼·박스 클래스를 붙여야 한다(안 붙이면 이 검사가 실패). */
import { readFileSync } from "node:fs";
const rd = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const fails = [];
const SITES = [["src/app/dex.jsx", "OpeningSchematic", /className=\{fsv\.boxClass\}/], ["src/app/dexMasters.jsx", "MastersSchematic", /className=\{fsv\.boxClass\}/], ["src/app/puzzle.jsx", "PuzzleSchematic", /fsv\.fs \? " schematic-fs"/]];
for (const [file, name, boxRe] of SITES) {
  const s = rd(file);
  if (!/useSchematicFullscreen\(\)/.test(s)) fails.push(name + ": useSchematicFullscreen 훅이 없음");
  if (!/<SchematicFsToggle fs=\{fsv\.fs\} onToggle=\{fsv\.toggle\} \/>/.test(s)) fails.push(name + ": 전체 화면 토글 버튼이 없음");
  if (!/<SchematicFsClose fs=\{fsv\.fs\} onClose=\{fsv\.close\} \/>/.test(s)) fails.push(name + ": 전체 화면 닫기 버튼이 없음");
  if (!boxRe.test(s)) fails.push(name + ": 모식도 박스에 전체 화면 클래스가 붙지 않음");
}
// 모식도(팬·확대 컨트롤이 있는 트리)가 새로 생기면 알린다 — 확대 버튼 호출 수와 전체 화면 토글 수가 같아야 한다.
let zoomSites = 0, toggles = 0;
for (const [file] of SITES) { const s = rd(file); zoomSites += (s.match(/title=\{t\("확대"\)\}/g) || []).length; toggles += (s.match(/<SchematicFsToggle /g) || []).length; }
if (zoomSites !== toggles) fails.push("확대 컨트롤이 있는 모식도 " + zoomSites + "곳 중 전체 화면 토글이 있는 곳은 " + toggles + "곳 — 새 모식도에는 SchematicFsToggle을 붙일 것");
const css = rd("src/index.css");
if (!/\.schematic-fs\s*\{[^}]*position:\s*fixed !important[^}]*inset:\s*0 !important[^}]*z-index:\s*960/.test(css)) fails.push("index.css의 .schematic-fs 규칙이 없거나 전체 화면(fixed·inset 0·z-index 960)이 아님");
const lib = rd("src/components/schematicFullscreen.jsx");
for (const [re, m] of [[/Escape/, "Esc로 닫기"], [/popstate/, "뒤로가기로 닫기"], [/document\.body\.style\.overflow/, "배경 스크롤 잠금"]]) if (!re.test(lib)) fails.push("schematicFullscreen: " + m + " 없음");
if (fails.length) { console.error("✖ check-schematic-fs 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-schematic-fs: 오프닝 트리·마스터 트리·퍼즐 모식도 모두 전체 화면 버튼과 닫기(✕·Esc·뒤로가기)가 있다");
