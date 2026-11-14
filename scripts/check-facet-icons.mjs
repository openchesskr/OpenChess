#!/usr/bin/env node
/** (v0.7.5, 사용자 요청) 파셋 아이콘 규칙 검사 — 직접 그리는 아이콘·장식은 마스터 대국 승자 왕관(app/analysis.jsx CrownIcon) 수준의 면 분할 명암으로 그린다.
 *  규칙 전문: CLAUDE.md "아이콘·디자인 요소 규칙", 부품: src/components/facetIcons.jsx
 *  · 등록된 아이콘 구역(아래 ZONES)에는 윤곽선(stroke) 그리기가 없어야 한다 — 모양은 채운 면으로만
 *  · 각 구역은 면 분할 부품(facetIcons.jsx)을 쓰거나, 스스로 3톤 이상의 면을 가진다
 *  · CLAUDE.md에 규칙이 남아 있다
 *  새로 그리는 아이콘은 facetIcons.jsx에 부품으로 넣거나, 그린 함수를 ZONES에 등록할 것.
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-facet-icons.mjs
 */
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const fails = [];
// [파일, 구역 시작 표지, 구역 끝 표지(없으면 파일 끝)]
const ZONES = [
  ["src/components/facetIcons.jsx", null, null],
  ["src/components/ocIcons.jsx", null, null],   // (v0.7.5) 사이트 전체 UI 아이콘 세트(예전 lucide 대체)
  ["src/components/titleEmblems.jsx", "const FacetSquare", "// 그림자(검정 단색"],
  ["src/app/analysis.jsx", "function CrownIcon(", "\n}\n"],
  ["src/app/play.jsx", "function MgCrosshair(", "\n}\n"],
  ["src/app/dexMasters.jsx", "function Laurel(", "\n}\n"],
  ["src/app/common.jsx", "export function LaurelBranch(", "\n}\n"],
  ["src/app/common.jsx", "export function SeriesGlyph(", "</svg>"],   // 뒤따르는 lucide 아이콘은 예외
  ["src/app/common.jsx", "{/* 양옆 끝 마름모", "</div>\n      )}"],
  ["src/components/dexHub.jsx", "function Plinth(", "</svg>"],   // (v0.7.6) 도감 카드 받침대(면 분할)
  ["src/components/dexHub.jsx", "function CornerGem(", "</svg>"],   // (v0.7.6) 도감 카드 모서리·구분선 금 보석
  ["src/app/lessons.jsx", "{/* 노리는 칸:", "</svg>"],
  ["src/app/growthMotion.jsx", "function StateNode(", "\n}\n"],   // (v0.7.5) 학습 탭 자동 분석 진행 화면의 상태 마름모
];
let n = 0;
for (const [file, from, to] of ZONES) {
  const src = read(file);
  let body = src;
  if (from) { const i = src.indexOf(from); if (i < 0) { fails.push(file + ": 아이콘 구역 '" + from + "'을 찾지 못함(이름을 바꿨다면 이 스크립트도 고칠 것)"); continue; } const j = to ? src.indexOf(to, i + from.length) : -1; body = src.slice(i, j < 0 ? undefined : j + to.length); }
  n++;
  // 이음매 메움(맞닿은 면 사이 실틈을 바탕색으로 덮는 것)은 윤곽선이 아니므로 뺀다: stroke={base} strokeWidth={SEAM}
  const code = body.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "").replace(/stroke=\{base\} strokeWidth=\{SEAM\}/g, "");
  if (/\bstroke(Width)?=|\bstroke:/.test(code)) fails.push(file + " (" + (from || "전체") + "): 윤곽선(stroke)으로 그린 부분이 있음 — 채운 면(fill)으로 바꿀 것");
  const usesKit = /Facet[A-Z]\w*|facetRamp|leafHalves|taperedStem|FACET_GOLD|GOLD\.\w+|\bgem\(|\bplate\(/.test(code);
  const tones = new Set((code.match(/fill=\{?"(#[0-9A-Fa-f]{6})"/g) || []).map((x) => x.slice(-8, -1)));
  if (!usesKit && tones.size < 3 && file !== "src/components/facetIcons.jsx") fails.push(file + " (" + from + "): 면 분할 부품도, 3톤 이상의 면도 없음");
}
// UI 아이콘은 OpenChess 세트(components/ocIcons.jsx)만 쓴다 — lucide 같은 범용 선 아이콘은 브랜드 로고(YouTube·Instagram) 말고는 들이지 않는다
{
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = d + "/" + f; return statSync(p).isDirectory() ? walk(p) : /\.(jsx?|tsx?)$/.test(f) ? [p] : []; });
  const root = new URL("../src", import.meta.url).pathname;
  for (const f of walk(root)) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g)) {
      const bad = m[1].split(",").map((x) => x.trim().split(/\s+as\s+/)[0]).filter((x) => x && !["Youtube", "Instagram"].includes(x));
      if (bad.length) fails.push(f.slice(root.length - 3) + ": lucide 아이콘 " + bad.join(", ") + " — components/ocIcons.jsx에 파셋 아이콘으로 그려 넣고 거기서 가져올 것");
    }
    if (/from\s*"lucide-react\/|import\s*\*\s*as\s*\w+\s*from\s*"lucide-react"/.test(src)) fails.push(f.slice(root.length - 3) + ": lucide 아이콘을 통째로/경로로 가져옴");
  }
}
// (v0.7.6, 사용자 요청) 연두색 리뷰 버튼은 예외 — chess.com 리뷰 버튼을 벤치마킹한 예전 모양(둥근 단색 별)을 유지한다. 파셋 Star로 다시 바꾸지 말 것.
{ const ui = read("src/components/uiPrimitives.jsx"), bj = (ui.match(/export function BestMoveJumpButton[\s\S]*?\n\}\n/) || [""])[0];
  if (!/<ReviewStar /.test(bj) || /<Star /.test(bj) || !/strokeLinejoin="round"/.test(ui)) fails.push("BestMoveJumpButton: 연두색 리뷰 버튼은 예전 모양(ReviewStar: 둥근 단색 별)이어야 함 — 아이콘 규칙 예외(사용자 요청)"); }
if (!/## 아이콘·디자인 요소 규칙/.test(read("CLAUDE.md"))) fails.push("CLAUDE.md에 '아이콘·디자인 요소 규칙' 절이 없음");
if (fails.length) { console.error("✗ check-facet-icons 실패 (" + fails.length + "건)\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-facet-icons: 아이콘 구역 " + n + "곳이 윤곽선 없이 면 분할 명암으로 그려져 있고, UI 아이콘은 모두 OpenChess 세트(lucide는 브랜드 로고만)");
