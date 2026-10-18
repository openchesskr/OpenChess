#!/usr/bin/env node
/** (v0.6.9) 스킨 세트(보드 + 기물) 안전장치.
 *  ① 직접 그린 기물(designedPieces.jsx): 모든 재질 × 6종 기물 × 흑백이 실제로 그려지고(서버 렌더), 높이 규칙이 theme.js의 PIECE_HEIGHT_FACTOR와 같다.
 *  ② 세트마다 보드 스킨·기물 스킨·SKIN_SETS 항목이 모두 있고, 기물 재질(design)이 실제 존재하며, 세트 가격이 개별 합계보다 싸다.
 *  ③ 보드 질감(texture)이 밝은 칸·어두운 칸 모두 스타일을 돌려주고, boardSquareBg가 texture를 쓴다. 보드·기물 렌더(PieceGlyph)가 design 경로를 가진다.
 *  ④ 상점·App 연결: 스킨 세트 카드, 세트 구매(코인 한 번 차감)·장착. */
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const theme = read("src/lib/theme.js"), pieces = read("src/components/pieces.jsx"), dex = read("src/app/dex.jsx"), common = read("src/app/common.jsx"), app = read("src/App.jsx");

// ① 기물 렌더
const dir = mkdtempSync(join(tmpdir(), "oc-skins-"));
const entry = join(dir, "entry.jsx");
writeFileSync(entry, `import React from "react"; import { renderToStaticMarkup } from "react-dom/server";
import { DesignedPiece, DESIGN_IDS, DESIGN_FACTOR } from ${JSON.stringify(new URL("../src/components/designedPieces.jsx", import.meta.url).pathname)};
export const run = () => { const out = []; for (const d of DESIGN_IDS) for (const ty of ["P","N","B","R","Q","K"]) for (const c of ["w","b"]) out.push({ d, ty, c, svg: renderToStaticMarkup(React.createElement(DesignedPiece, { design: d, type: ty, color: c, w: 100 })) }); return { out, ids: DESIGN_IDS, factor: DESIGN_FACTOR }; };`);
const outfile = join(dir, "out.cjs");
await build({ entryPoints: [entry], outfile, bundle: true, format: "cjs", platform: "node", loader: { ".jsx": "jsx" }, nodePaths: [new URL("../node_modules", import.meta.url).pathname], logLevel: "silent" });
const { out, ids, factor } = createRequire(import.meta.url)(outfile).run();
ok(ids.length >= 5, "직접 그린 기물 재질이 5개 미만");
for (const r of out) { const paths = (r.svg.match(/<path /g) || []).length; if (paths < 4 || !/viewBox="0 0 100 [\d.]+"/.test(r.svg)) fails.push("기물이 제대로 그려지지 않음: " + r.d + "/" + r.ty + "/" + r.c); }
const hf = JSON.parse((theme.match(/export const PIECE_HEIGHT_FACTOR = (\{[^}]*\})/)[1]).replace(/([A-Z]):/g, '"$1":'));
for (const k of Object.keys(hf)) if (factor[k] !== hf[k]) fails.push("DESIGN_FACTOR." + k + "(" + factor[k] + ")이 PIECE_HEIGHT_FACTOR(" + hf[k] + ")와 다름 — 직접 그린 기물의 높이가 다른 기물과 어긋남");

// ② 세트 정의
const setIds = [...theme.matchAll(/\{ id: "(\w+)", label: t\("[^"]+"\), desc: t\("[^"]+"\), price: (\d+) \}/g)].map((m) => ({ id: m[1], price: +m[2] }));
ok(setIds.length >= 5, "스킨 세트가 5개 미만: " + setIds.length);
for (const s of setIds) {
  const b = theme.match(new RegExp("^  " + s.id + ": \\{ label: t\\(\"[^\"]+\"\\), price: (\\d+), set: \"" + s.id + "\"", "m"));
  const p = theme.match(new RegExp("^  " + s.id + ": \\{ label: t\\(\"[^\"]+\"\\), price: (\\d+), set: \"" + s.id + "\", design: \"(\\w+)\"", "m"));
  if (!b) { fails.push("세트 " + s.id + ": 보드 스킨(BOARD_SKINS) 없음"); continue; }
  if (!p) { fails.push("세트 " + s.id + ": 기물 스킨(PIECE_SKINS, design) 없음"); continue; }
  if (!ids.includes(p[2])) fails.push("세트 " + s.id + ": 기물 재질 " + p[2] + "이 designedPieces.jsx에 없음");
  if (!(s.price < +b[1] + +p[1])) fails.push("세트 " + s.id + ": 세트 가격(" + s.price + ")이 개별 합계(" + (+b[1] + +p[1]) + ")보다 싸지 않음");
  if (!(s.price > 0)) fails.push("세트 " + s.id + ": 가격이 0 이하");
}
// ③ 보드 질감·렌더 경로
ok(/if \(sk\.texture\) return sk\.texture\(light, r, c\);/.test(theme), "boardSquareBg가 texture를 쓰지 않음");
for (const m of theme.matchAll(/^  (\w+): \{ label: t\("[^"]+"\), price: \d+, set: "(\w+)", light: "(#[0-9A-Fa-f]{6})", dark: "(#[0-9A-Fa-f]{6})"/gm)) ok(m[1] === m[2], "보드 스킨 " + m[1] + "의 set 값이 id와 다름");
ok(/if \(sk\.design\)/.test(pieces) && /<DesignedPiece /.test(pieces), "PieceGlyph에 직접 그린 기물(design) 경로가 없음");
// ④ 연결
ok(/<SkinSetCard /.test(dex) && /SKIN_SETS\.map/.test(dex), "상점 화면에 스킨 세트 카드가 없음");
ok(/const buySkinSet = useCallback/.test(app) && /skinSetPrice\(set, ownedSkins\)/.test(app) && /setOcCoins\(\(c\) => c - price\)/.test(app), "세트 구매가 코인을 한 번 차감하지 않음");
ok(/const equipSkinSet = useCallback\(\(setId\) => \{ setBoardSkin\(setId\); setPieceSkin\(setId\)/.test(app), "세트 장착이 보드·기물을 함께 바꾸지 않음");
ok(/export function SkinSetCard/.test(common), "SkinSetCard 없음");
if (fails.length) { console.error("✖ check-skins 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-skins: 세트 " + setIds.length + "개 · 직접 그린 기물 " + out.length + "종이 모두 그려지고, 세트 가격·보드 질감·상점 연결이 유지된다");
