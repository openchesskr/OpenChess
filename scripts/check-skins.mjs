#!/usr/bin/env node
/** (v0.6.9) 스킨 세트(보드 + 기물) 안전장치.
 *  ① 세트마다 보드 스킨·기물 스킨·SKIN_SETS 항목이 모두 있고, 세트 가격이 개별 합계보다 싸다.
 *  ② 세트 기물 이미지(public/pieces/<세트>/{white,black}-<기물>.webp) 12장이 모두 있고, 크기가 기본 기물 이미지의 정확히 3배(SKIN_PIECE_SCALE)다
 *     (theme.js가 기본 크기 표를 3배로 써서 칸 배치를 맞추기 때문 — 어긋나면 기물이 칸에서 틀어진다). 생성기(build-skin-pieces.py)의 세트 목록과도 같아야 한다.
 *  ③ 보드 질감(texture)을 boardSquareBg가 쓰고, 기물 이미지 세트 등록 목록(PIECE_IMG_SETS 파생 루프)이 세트와 같다.
 *  ④ 상점·App 연결: 스킨 세트 카드, 세트 구매(코인 한 번 차감)·장착. */
import { readFileSync, existsSync } from "node:fs";
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const theme = read("src/lib/theme.js"), dex = read("src/app/dex.jsx"), common = read("src/app/common.jsx"), app = read("src/App.jsx"), gen = read("scripts/build-skin-pieces.py");

const sets = [...theme.matchAll(/\{ id: "(\w+)", label: t\("[^"]+"\), desc: t\("[^"]+"\), price: (\d+) \}/g)].map((m) => ({ id: m[1], price: +m[2] }));
ok(sets.length >= 5, "스킨 세트가 5개 미만: " + sets.length);
const derived = (theme.match(/for \(const id of \[([^\]]*)\] of?/) || theme.match(/for \(const id of \[([^\]]*)\]\) \{/) || [])[1] || "";
const derivedIds = [...derived.matchAll(/"(\w+)"/g)].map((m) => m[1]);
const genIds = [...gen.matchAll(/^    "(\w+)": \{/gm)].map((m) => m[1]);
ok(JSON.stringify([...derivedIds].sort()) === JSON.stringify(sets.map((s) => s.id).sort()), "기물 이미지 세트 등록 목록(" + derivedIds + ")이 SKIN_SETS(" + sets.map((s) => s.id) + ")와 다름");
ok(JSON.stringify([...genIds].sort()) === JSON.stringify(sets.map((s) => s.id).sort()), "생성기 세트 목록(" + genIds + ")이 SKIN_SETS와 다름");

const NAMES = { Pawn: [80, 116, 80, 116], Knight: [90, 123, 85, 118], Bishop: [80, 116, 80, 116], Rook: [81, 117, 81, 117], Queen: [119, 116, 119, 116], King: [106, 116, 106, 116] };
function webpSize(buf) {   // VP8X(알파 있는 확장 WebP)의 캔버스 크기
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const kind = buf.toString("ascii", 12, 16);
  if (kind === "VP8X") return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (kind === "VP8L") { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  return null;
}
for (const s of sets) {
  const b = theme.match(new RegExp("^  " + s.id + ": \\{ label: t\\(\"[^\"]+\"\\), price: (\\d+), set: \"" + s.id + "\", light: \"#[0-9A-Fa-f]{6}\", dark: \"#[0-9A-Fa-f]{6}\"", "m"));
  const p = theme.match(new RegExp("^  " + s.id + ": \\{ label: t\\(\"[^\"]+\"\\), price: (\\d+), set: \"" + s.id + "\", image: true \\}", "m"));
  if (!b) fails.push("세트 " + s.id + ": 보드 스킨(BOARD_SKINS) 없음");
  if (!p) fails.push("세트 " + s.id + ": 기물 스킨(PIECE_SKINS) 없음");
  if (b && p && !(s.price < +b[1] + +p[1])) fails.push("세트 " + s.id + ": 세트 가격(" + s.price + ")이 개별 합계(" + (+b[1] + +p[1]) + ")보다 싸지 않음");
  for (const [nm, d] of Object.entries(NAMES)) for (const [ci, col] of ["white", "black"].entries()) {
    const f = "public/pieces/" + s.id + "/" + col + "-" + nm.toLowerCase() + ".webp";
    if (!existsSync(new URL("../" + f, import.meta.url))) { fails.push("기물 이미지 없음: " + f); continue; }
    const sz = webpSize(readFileSync(new URL("../" + f, import.meta.url)));
    const want = [d[ci * 2] * 3, d[ci * 2 + 1] * 3];
    if (!sz || sz[0] !== want[0] || sz[1] !== want[1]) fails.push(f + " 크기 " + sz + " ≠ 기본의 3배 " + want);
  }
}
ok(/export const SKIN_PIECE_SCALE = 3, SKIN_PIECE_FIT = 0\.94;/.test(theme) && /^S = 3 /m.test(gen) && /^K = 0\.94 /m.test(gen), "theme.js의 SKIN_PIECE_SCALE·FIT과 생성기의 S·K가 다름");
ok(/if \(sk\.texture\) return sk\.texture\(light, r, c\);/.test(theme), "boardSquareBg가 texture를 쓰지 않음");
ok(/<SkinSetCard /.test(dex) && /SKIN_SETS\.map/.test(dex), "상점 화면에 스킨 세트 카드가 없음");
ok(/const buySkinSet = useCallback/.test(app) && /skinSetPrice\(set, ownedSkins\)/.test(app) && /setOcCoins\(\(c\) => c - price\)/.test(app), "세트 구매가 코인을 한 번 차감하지 않음");
ok(/const equipSkinSet = useCallback\(\(setId\) => \{ setBoardSkin\(setId\); setPieceSkin\(setId\)/.test(app), "세트 장착이 보드·기물을 함께 바꾸지 않음");
ok(/export function SkinSetCard/.test(common), "SkinSetCard 없음");
if (fails.length) { console.error("✖ check-skins 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-skins: 세트 " + sets.length + "개 · 기물 이미지 " + sets.length * 12 + "장(기본의 3배 크기)·가격·보드 질감·상점 연결이 유지된다");
