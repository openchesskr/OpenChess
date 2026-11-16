#!/usr/bin/env node
/** (v0.7.6, 사용자 요청) 분석 탭 다음 수 블록 — 데스크톱(두 칼럼)에서는 위에서 6개만 보이는 높이로 자르고 나머지는 그 영역 안의 세로 스크롤로 본다.
 *  MoveTileWindow가 블록 목록을 감싸는지, 6개 기준·데스크톱 한정·안쪽 스크롤(overscroll contain)·포지션이 바뀌면 맨 위로가 유지되는지 소스로 확인한다.
 *  실행: node scripts/check-analysis-tiles.mjs (prebuild로 자동 실행) */
import fs from "node:fs";
const src = fs.readFileSync(new URL("../src/app/analysis.jsx", import.meta.url), "utf8");
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
ok(/export const MOVE_TILE_WINDOW = 6;/.test(src), "MOVE_TILE_WINDOW(보이는 블록 수)가 6이 아님");
ok(/<MoveTileWindow enabled=\{tileWindowOn\}[^>]*>\s*\{shown\.map\(\(m, i\) => <FadeIn key=\{m\.san\} layout layoutDependency=\{i\}><MoveTile /.test(src), "다음 수 블록 목록(shown.map → MoveTile)을 MoveTileWindow가 감싸지 않음");
ok(/const tileWindowOn = !useNarrow\(1023\);/.test(src), "6개 창은 데스크톱(1024px 이상, lg 두 칼럼)에서만 켜야 함");
const comp = /function MoveTileWindow[\s\S]*?\n\}\n/.exec(src);
ok(comp && /kids\[MOVE_TILE_WINDOW\]\.offsetTop - kids\[0\]\.offsetTop/.test(comp[0]), "창 높이를 7번째 블록 위치(블록 6개 + 간격)로 재지 않음");
ok(comp && /overflowY: maxH != null \? "auto"/.test(comp[0]) && /overscrollBehavior: "contain"/.test(comp[0]), "창 안쪽만 스크롤(overscroll contain)되지 않음");
ok(comp && /\[resetKey\]/.test(comp[0]) && /scrollTop = 0/.test(comp[0]), "포지션이 바뀌어도 창 스크롤이 맨 위로 돌아가지 않음");
// (v0.7.8, 사용자 요청) 모든 수 블록 같은 높이 — 키워드·이름·승률 바 줄은 내용이 없어도 자리를 둔다
const tile = /function MoveTile\([\s\S]*?\n\}\n/.exec(src);
ok(tile && /<div style=\{\{ marginBottom: 6, height: 19 \}\}>\{kws\.length > 0 && <KeywordScroll/.test(tile[0]), "키워드가 없는 수 블록이 키워드 줄 높이를 비워 두지 않음");
ok(tile && /<MarqueeText height=\{19\}[^>]*>\{m\.name \|\| \(m\.isMain \? "Main Line" : "\\u00A0"\)\}/.test(tile[0]), "오프닝 이름이 없는 수 블록이 이름 줄 높이를 비워 두지 않음");
ok(tile && /visibility: "hidden" \}\}><WinBar wdl=\{WDL_PLACEHOLDER\}/.test(tile[0]), "승률 통계가 없는 수 블록이 승률 바 높이를 비워 두지 않음");
ok(tile && !/\{m\.wdl && <div/.test(tile[0]) && !/\{\(m\.name \|\| m\.isMain\) && </.test(tile[0]), "수 블록에 조건부로 줄을 빼는 코드가 남아 있음(블록 높이가 달라짐)");
// (v0.7.8, 사용자 요청) 성장 분석·최근 대국 열도 다음 수 블록 창과 같은 황동 스크롤바(공용 components/brassScroll.jsx)
{ const gh = fs.readFileSync(new URL("../src/app/growthHome.jsx", import.meta.url), "utf8");
  ok(comp && /className="oc-tile-window oc-brass-scroll"/.test(comp[0]) && /\.\.\.BRASS_SCROLLBAR/.test(comp[0]) && /<MoreBelowHint /.test(comp[0]), "다음 수 블록 창이 공용 황동 스크롤바(BRASS_SCROLLBAR·MoreBelowHint)를 쓰지 않음");
  ok((gh.match(/<BrassScrollArea /g) || []).length >= 2 && !/overflowY: "auto", paddingRight: 4 \}\}>\{(growth|games)Node\}/.test(gh), "성장 분석·최근 대국 열이 다음 수 블록과 같은 스크롤바(BrassScrollArea)를 쓰지 않음"); }
if (fails.length) { console.error("✗ check-analysis-tiles 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-analysis-tiles: 데스크톱 다음 수 블록 6개 창 + 안쪽 스크롤 유지 · 모든 수 블록 같은 높이");
