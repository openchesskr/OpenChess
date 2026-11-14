#!/usr/bin/env node
/** (v0.7.6, 사용자 요청) 도감 탭 레이아웃 — 첫 화면 "전시실": 같은 크기의 진열장 네 개(데스크톱 4열 · 모바일·태블릿 2×2),
 *  머리 요약 칩, 안쪽 화면 위 구획 전환 줄, 해금률을 모르면 0% 대신 "탐색 전"(BUG-168).  실행: node scripts/check-dex-hub.mjs (prebuild) */
import fs from "node:fs";
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const hub = rd("src/components/dexHub.jsx"), dex = rd("src/app/dex.jsx");
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
// (v0.7.6, 사용자 요청 2차) 네 구획은 동등하게 — 같은 크기의 진열장(Vitrine) 네 개, 데스크톱 4열 · 그보다 좁으면 2×2.
ok(/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(hub) && /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/.test(hub), "네 구획이 같은 크기 격자(4열 · 2×2)가 아님");
ok(/items\.map\(\(it, i\) => <Vitrine /.test(hub) && !/VARIANT|grid-template-areas/.test(hub), "구획마다 크기·모양이 다른 카드가 다시 생김(동등 배치 요청)");
ok(/const EXHIBIT = \{[\s\S]*openings:[\s\S]*masters:[\s\S]*titles:[\s\S]*skins:/.test(hub), "진열장 받침대 위 장면(EXHIBIT)이 네 구획 모두에 있어야 함");
ok(/export function DexSectionNav/.test(hub) && /\{dexView !== "hub" && <DexSectionNav items=\{hubItems\} current=\{dexView\}/.test(dex), "안쪽 화면 위 구획 전환 줄(DexSectionNav)이 없음");
ok(/summary=\{\[/.test(dex), "도감 첫 화면 머리 요약 칩이 없음");
ok(/percent: unlockStats && unlockStats\.total \? [^,]+ : null, detail: unlockStats && unlockStats\.total \? [^:]+ : t\("탐색 전"\)/.test(dex), "BUG-168: 해금률을 모르면 0% 대신 '탐색 전'");
ok(!/<LessonPath /.test(dex), "레슨은 학습 탭에 있음 — 도감 첫 화면에 다시 넣지 말 것");
if (fails.length) { console.error("✗ check-dex-hub 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-dex-hub: 도감 첫 화면 진열장 4개(동등 배치)·요약 칩·구획 전환 줄 유지");
