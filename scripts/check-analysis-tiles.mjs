#!/usr/bin/env node
/** (v0.7.6, 사용자 요청) 분석 탭 다음 수 블록 — 데스크톱(두 칼럼)에서는 위에서 6개만 보이는 높이로 자르고 나머지는 그 영역 안의 세로 스크롤로 본다.
 *  MoveTileWindow가 블록 목록을 감싸는지, 6개 기준·데스크톱 한정·안쪽 스크롤(overscroll contain)·포지션이 바뀌면 맨 위로가 유지되는지 소스로 확인한다.
 *  실행: node scripts/check-analysis-tiles.mjs (prebuild로 자동 실행) */
import fs from "node:fs";
const src = fs.readFileSync(new URL("../src/app/analysis.jsx", import.meta.url), "utf8");
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
ok(/export const MOVE_TILE_WINDOW = 6;/.test(src), "MOVE_TILE_WINDOW(보이는 블록 수)가 6이 아님");
ok(/<MoveTileWindow enabled=\{tileWindowOn\}[^>]*>\s*\{shown\.map\(\(m\) => <FadeIn key=\{m\.san\} layout><MoveTile /.test(src), "다음 수 블록 목록(shown.map → MoveTile)을 MoveTileWindow가 감싸지 않음");
ok(/const tileWindowOn = !useNarrow\(1023\);/.test(src), "6개 창은 데스크톱(1024px 이상, lg 두 칼럼)에서만 켜야 함");
const comp = /function MoveTileWindow[\s\S]*?\n\}\n/.exec(src);
ok(comp && /kids\[MOVE_TILE_WINDOW\]\.offsetTop - kids\[0\]\.offsetTop/.test(comp[0]), "창 높이를 7번째 블록 위치(블록 6개 + 간격)로 재지 않음");
ok(comp && /overflowY: maxH != null \? "auto"/.test(comp[0]) && /overscrollBehavior: "contain"/.test(comp[0]), "창 안쪽만 스크롤(overscroll contain)되지 않음");
ok(comp && /\[resetKey\]/.test(comp[0]) && /scrollTop = 0/.test(comp[0]), "포지션이 바뀌어도 창 스크롤이 맨 위로 돌아가지 않음");
if (fails.length) { console.error("✗ check-analysis-tiles 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-analysis-tiles: 데스크톱 다음 수 블록 6개 창 + 안쪽 스크롤 유지");
