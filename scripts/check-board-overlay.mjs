#!/usr/bin/env node
/** (v0.6.1, BUG-051 재발 방지) 보드 틀(BOARD_GLOSS)은 2px 테두리라 칸 한 개의 실제 크기는 (size-4)/8이다. 보드 위에 칸 위치로 직접 얹는
 *  연출(나이트 레이스의 거리 판정 물들임·왕관·시간 알약, 나이트를 잡으러 날아오는 기물)이 size/8로 계산하면 오른쪽·아래 칸일수록 최대 4px 어긋난다.
 *  검사: ① theme.js BOARD_GLOSS의 border 두께 = play.jsx의 KNIGHT_GRID_BORDER ② KnightDistFx와 잡는 기물 연출이 그 상수로 칸 크기를 계산.
 *  실행: node scripts/check-board-overlay.mjs (prebuild)
 */
import { readFileSync } from "node:fs";
const theme = readFileSync(new URL("../src/lib/theme.js", import.meta.url), "utf8");
const play = readFileSync(new URL("../src/app/play.jsx", import.meta.url), "utf8");
const fails = [];
const glossBorder = (/export const BOARD_GLOSS = \{[\s\S]*?border: "(\d+)px solid/.exec(theme) || [])[1];
const constBorder = (/const KNIGHT_GRID_BORDER = (\d+);/.exec(play) || [])[1];
if (!glossBorder) fails.push("theme.js에서 BOARD_GLOSS의 border 두께를 못 찾음");
if (!constBorder) fails.push("play.jsx에 KNIGHT_GRID_BORDER 상수가 없음");
if (glossBorder && constBorder && glossBorder !== constBorder) fails.push("BOARD_GLOSS border(" + glossBorder + "px)와 KNIGHT_GRID_BORDER(" + constBorder + ")가 다름 — 보드 틀을 바꿨으면 상수도 같이");
const a = play.indexOf("function KnightDistFx("), b = play.indexOf("// distFx — 거리 판정 라운드의 연출 정보");
const dist = play.slice(a, b);
if (a < 0 || b < 0) fails.push("KnightDistFx 범위를 못 찾음");
else {
  if (!/const cell = \(size - KNIGHT_GRID_BORDER \* 2\) \/ 8;/.test(dist)) fails.push("KnightDistFx가 칸 크기를 (size - KNIGHT_GRID_BORDER*2)/8로 계산하지 않음");
  if (/const cell = size \/ 8;/.test(dist)) fails.push("KnightDistFx에 size/8로 계산한 칸 크기가 남아 있음");
}
if (!/viewRC\(h\.to\), cell = \(size - KNIGHT_GRID_BORDER \* 2\) \/ 8;/.test(play)) fails.push("나이트를 잡는 기물 연출의 칸 크기가 테두리를 빼지 않음");
if (fails.length) { console.error("✖ check-board-overlay 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-board-overlay: 보드 위 연출의 칸 크기가 보드 테두리(" + glossBorder + "px)를 뺀 값으로 계산된다");
