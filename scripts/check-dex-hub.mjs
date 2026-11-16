#!/usr/bin/env node
/** (v0.7.6, 사용자 요청) 도감 탭 레이아웃 — 첫 화면 "전시실": 같은 크기의 진열장 네 개(데스크톱 4열 · 모바일·태블릿 2×2),
 *  머리 요약 칩, 안쪽 화면 위 구획 전환 줄, 해금률을 모르면 0% 대신 "탐색 전"(BUG-168).  실행: node scripts/check-dex-hub.mjs (prebuild) */
import fs from "node:fs";
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const hub = rd("src/components/dexHub.jsx"), dex = rd("src/app/dex.jsx");
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
// (v0.7.7, 사용자 요청) 첫 화면(진열장 카드)을 없앴다 — 처음엔 오프닝 도감, 그 뒤로는 마지막에 보던 구역과 화면 상태로 돌아온다.
ok(!/export function DexHub\b/.test(hub) && !/<DexHub /.test(dex), "도감 첫 화면(DexHub)이 다시 생김(사용자 요청으로 없앰)");
ok(/export function DexSectionNav/.test(hub) && /^\s*<DexSectionNav items=\{hubItems\} current=\{dexView\}/m.test(dex), "도감 위쪽 구획 전환 줄(DexSectionNav)이 없음");
ok(/loadDexView\(\)/.test(dex) && /saveDexView\(k\)/.test(dex) && /pathOverride = dexEntryPath\(\)/.test(rd("src/App.jsx")), "도감 탭이 마지막에 보던 구역으로 열리지 않음");
ok(/useTabMemory\("dex\.openKey", null\)/.test(dex) && /readTabMemory\("dex\.openings\.view", null\)/.test(dex) && /writeTabMemory\("dex\.openings\.view", \{ pan, zoom \}\)/.test(dex), "도감 탭으로 돌아왔을 때 열린 블록·모식도 위치·배율이 복원되지 않음");
const routes = rd("src/lib/dexRoutes.js");
ok(/"\/book": "hub"/.test(routes) && /if \(k === "hub"\) k = "openings";/.test(dex) && /fromPath !== "hub"/.test(dex), "옛 첫 화면 주소(/book)가 마지막 구역으로 이어지지 않음");
ok(/percent: unlockStats && unlockStats\.total \? [^,]+ : null, detail: unlockStats && unlockStats\.total \? [^:]+ : t\("탐색 전"\)/.test(dex), "BUG-168: 해금률을 모르면 0% 대신 '탐색 전'");
// (v0.7.7 BUG-168 남은 점) 모식도를 열지 않아도 첫 화면에서 같은 배치·같은 해금 판정으로 해금률을 계산한다
ok(/const hubUnlockStats = useMemo\([\s\S]{0,400}computeDexLayout\(treeData, contentVer\)[\s\S]{0,300}dexIsUnlocked\(chesscom, ccReady, unlockAll, n\.path\)/.test(dex) && /const unlockStats = unlockStats0 \|\| hubUnlockStats;/.test(dex), "BUG-168: 첫 화면 해금률을 모식도 없이 계산하지 않음 — 모식도를 열기 전까지 '탐색 전'으로만 보인다");
ok(!/<LessonPath /.test(dex), "레슨은 학습 탭에 있음 — 도감 첫 화면에 다시 넣지 말 것");
// (v0.7.8, 사용자 요청) 도감 — 모든 구역 /book 한 주소, 검색 바 줄 전체, 도감 영역 아래 해금률 줄 없음·오프닝 칸은 해금 수/전체, 업적 목록 황동 스크롤바, 영역 높이
{ const R = await import("../src/lib/dexRoutes.js"), P = await import("../src/lib/dexPanel.js");
  ok(Object.values(R.DEX_VIEW_PATH).every((p) => p === "/book") && R.dexEntryPath() === "/book", "도감 구역 주소가 /book 하나가 아님");
  ok(R.dexViewFromPath("/opening") === "openings" && R.dexViewFromPath("/achievement") === "titles", "옛 하위 주소(/opening 등) 링크 호환이 사라짐");
  ok(!/history\.pushState\([^)]*DEX_VIEW_PATH/.test(dex) && /window\.history\.replaceState\(window\.history\.state, "", DEX_PATH\)/.test(dex), "구역을 바꿀 때 주소를 바꾸거나, 옛 주소를 /book으로 고치지 않음");
  ok(!/rightSlot=\{/.test(dex) && !/tx\("도감 해금률 \{0\}"/.test(dex), "도감 영역 아래 해금률 줄이 남아 있음");
  ok(/detail: unlockStats && unlockStats\.total \? fmtFull\(unlockStats\.unlocked\) \+ "\/" \+ fmtFull\(unlockStats\.total\)/.test(dex), "구획 전환 줄의 오프닝 칸이 해금 수/전체 수가 아님");
  ok((dex.match(/flex: "1 1 0", minWidth: 120 \}\}>   \{\/\* \(v0\.7\.8, 사용자 요청\) 검색 바는/g) || []).length === 1, "오프닝 도감 검색 바가 줄 전체가 아님");
  ok(/className="oc-brass-scroll" style=\{\{ width: asideW/.test(dex) && /\.\.\.BRASS_SCROLLBAR/.test(dex), "업적 목록이 사이트 황동 스크롤바를 쓰지 않음");
  ok(P.dexPanelHeight(1000, 200, false, 0) === 1000 - 200 - 66 && P.dexPanelHeight(800, 200, true, 0) === 800 - 200 - 66 - 8, "도감 영역 높이(하단 여백 축소)가 바뀜"); }
if (fails.length) { console.error("✗ check-dex-hub 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-dex-hub: 도감은 첫 화면 없이 오프닝(이후 마지막 구역)으로 열리고, 구획 전환 줄·열린 블록·모식도 위치가 유지된다");
