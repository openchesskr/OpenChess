#!/usr/bin/env node
/** (v0.7.6, 사용자 요청) 도감 탭 레이아웃 — 첫 화면 "전시실": 같은 크기의 진열장 네 개(데스크톱 4열 · 모바일·태블릿 2×2),
 *  머리 요약 칩, 안쪽 화면 위 구획 전환 줄, 해금률을 모르면 0% 대신 "탐색 전"(BUG-168).  실행: node scripts/check-dex-hub.mjs (prebuild) */
import fs from "node:fs";
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const hub = rd("src/components/dexHub.jsx"), dex = rd("src/app/dex.jsx");
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
// (v0.7.6, 사용자 요청 2차) 네 구획은 동등하게 — 같은 크기의 진열장(Vitrine) 네 개, 데스크톱 4열 · 그보다 좁으면 2×2.
ok(/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(hub) && /grid-template-rows: repeat\(2, minmax\(0, 1fr\)\)/.test(hub), "네 구획이 같은 크기 2×2 격자가 아님");
ok(/items\.map\(\(it, i\) => <VitrineCard /.test(hub) && !/VARIANT|grid-template-areas/.test(hub), "구획마다 크기·모양이 다른 카드가 다시 생김(동등 배치 요청)");
ok(/const SHOWCASE = \{[\s\S]*openings:[\s\S]*masters:[\s\S]*titles:[\s\S]*skins:/.test(hub), "카드 무대(SHOWCASE)가 네 구획 모두에 있어야 함");
ok(/export function DexSectionNav/.test(hub) && /\{dexView !== "hub" && <DexSectionNav items=\{hubItems\} current=\{dexView\}/.test(dex), "안쪽 화면 위 구획 전환 줄(DexSectionNav)이 없음");
// (3차) 머리의 글자·요약 알약은 없앴고, 진열장에 게임 느낌(깎은 모서리 프레임·10칸 막대·입장 버튼)을 더했다.
ok(!/summary=\{\[/.test(dex) && !/<header/.test(hub), "머리 글자·요약 알약이 다시 생김(사용자 요청으로 지움)");
// (5차) 게임풍을 걷어내고 사이트 색만 쓰는 고급 진열장 — 등급색 문장·빛살·깎은 모서리로 되돌아가지 않게.
ok(/<Plinth \/>/.test(hub) && /t\("입장"\)/.test(hub) && !/<Crest|CHAMFER|dexv-rays|THEME\b/.test(hub), "고급 진열장 카드(받침대·입장 링크)가 아니거나 게임풍(문장·빛살·깎은 모서리)이 다시 생김");
ok(!/STAGE|Laurel|FacetLeaf/.test(hub), "STAGE 표기·월계관 장식은 사용자 요청으로 뺐음");
ok(/height: "84cqw"/.test(hub) && /\.dexv-stage \{ flex: 1 1 auto !important; height: auto !important/.test(hub), "BUG-169: 무대(size 컨테이너)는 모바일에서 높이를 cqw로 못박고(min-height만 주면 cqh가 0) 데스크톱에서만 늘어나야 함");
ok(/height: clamp\(560px, calc\(100dvh - 205px\), 980px\)/.test(hub), "데스크톱 카드(2×2)가 화면 높이를 채우지 않음(아래 여백)");
ok(/percent: unlockStats && unlockStats\.total \? [^,]+ : null, detail: unlockStats && unlockStats\.total \? [^:]+ : t\("탐색 전"\)/.test(dex), "BUG-168: 해금률을 모르면 0% 대신 '탐색 전'");
ok(!/<LessonPath /.test(dex), "레슨은 학습 탭에 있음 — 도감 첫 화면에 다시 넣지 말 것");
if (fails.length) { console.error("✗ check-dex-hub 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-dex-hub: 도감 첫 화면 고급 진열장 카드 4개(동등 배치·화면 높이 채움)·구획 전환 줄 유지");
