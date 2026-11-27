// (v0.8.0, BUG-202) 아이콘만 있는 조작 버튼의 접근성 검사 — prebuild.
//  ① <NavBtn>(보드 이동·뒤집기 등 아이콘 버튼)은 label을 꼭 넘긴다: 화면 낭독기가 "버튼"으로만 읽지 않게(aria-label·title로 쓰인다).
//  ② 켜기/끄기 스위치는 components/uiPrimitives.jsx의 ToggleSwitch만 쓴다: 손으로 복사한 46×26 스위치는 role="switch"·aria-checked·이름이 빠지기 쉽다.
//  ③ ToggleSwitch에도 label을 꼭 넘긴다.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "src");
function* walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) yield* walk(p); else if (/\.jsx?$/.test(e.name)) yield p; } }

// 여는 태그 하나를 통째로 잘라 낸다(속성 안 중괄호·화살표 함수의 > 를 건너뛴다)
function openTags(src, name) {
  const out = []; const re = new RegExp("<" + name + "\\b", "g"); let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length, depth = 0, q = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (q) { if (c === q && src[i - 1] !== "\\") q = null; continue; }
      if (c === '"' || c === "'" || c === "`") { q = c; continue; }
      if (c === "{") depth++; else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push({ tag: src.slice(m.index, i + 1), line: src.slice(0, m.index).split("\n").length });
  }
  return out;
}

const fails = []; let nav = 0, sw = 0;
for (const f of walk(SRC)) {
  const rel = path.relative(ROOT, f).split(path.sep).join("/");
  const src = readFileSync(f, "utf8");
  for (const { tag, line } of openTags(src, "NavBtn")) { nav++; if (!/\blabel=\{/.test(tag)) fails.push(`${rel}:${line} <NavBtn>에 label 없음 — 화면 낭독기용 이름(t("이전 수") 등)을 넘길 것`); }
  for (const { tag, line } of openTags(src, "ToggleSwitch")) { sw++; if (!/\blabel=\{/.test(tag)) fails.push(`${rel}:${line} <ToggleSwitch>에 label 없음`); }
  if (rel !== "src/components/uiPrimitives.jsx") {
    src.split("\n").forEach((l, i) => { if (/<button\b[^\n]*width: 46, height: 26, borderRadius: 13/.test(l)) fails.push(`${rel}:${i + 1} 손으로 만든 켜기/끄기 스위치 — components/uiPrimitives.jsx ToggleSwitch를 쓸 것`); });
  }
}
if (fails.length) { console.error("✘ check-a11y-controls:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✔ check-a11y-controls: NavBtn ${nav}곳·ToggleSwitch ${sw}곳 모두 이름 있음, 손으로 복사한 스위치 없음`);
