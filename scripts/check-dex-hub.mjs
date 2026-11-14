#!/usr/bin/env node
/** (v0.7.6, 사용자 요청) 도감 탭 레이아웃 — 첫 화면 벤토 격자(데스크톱: 왼쪽 큰 오프닝 · 오른쪽 위 마스터 · 아래 업적·스킨 / 모바일·태블릿: 오프닝 → 마스터 → 업적·스킨 두 칸),
 *  머리 요약 칩, 안쪽 화면 위 구획 전환 줄, 해금률을 모르면 0% 대신 "탐색 전"(BUG-168).  실행: node scripts/check-dex-hub.mjs (prebuild) */
import fs from "node:fs";
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const hub = rd("src/components/dexHub.jsx"), dex = rd("src/app/dex.jsx");
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
ok(/grid-template-areas: "openings masters masters" "openings titles skins"/.test(hub), "데스크톱 벤토 격자(오프닝 두 줄·마스터 넓게·업적·스킨)가 아님");
ok(/grid-template-areas: "openings openings" "masters masters" "titles skins"/.test(hub), "모바일·태블릿 배치(오프닝 → 마스터 → 업적·스킨 두 칸)가 아님");
ok(/const VARIANT = \{ openings: "feature", masters: "wide", titles: "tile", skins: "tile" \}/.test(hub), "카드 모양(feature·wide·tile) 배정이 바뀜");
ok(/export function DexSectionNav/.test(hub) && /\{dexView !== "hub" && <DexSectionNav items=\{hubItems\} current=\{dexView\}/.test(dex), "안쪽 화면 위 구획 전환 줄(DexSectionNav)이 없음");
ok(/summary=\{\[/.test(dex), "도감 첫 화면 머리 요약 칩이 없음");
ok(/percent: unlockStats && unlockStats\.total \? [^,]+ : null, detail: unlockStats && unlockStats\.total \? [^:]+ : t\("탐색 전"\)/.test(dex), "BUG-168: 해금률을 모르면 0% 대신 '탐색 전'");
ok(!/<LessonPath /.test(dex), "레슨은 학습 탭에 있음 — 도감 첫 화면에 다시 넣지 말 것");
if (fails.length) { console.error("✗ check-dex-hub 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-dex-hub: 도감 첫 화면 벤토 격자·요약 칩·구획 전환 줄 유지");
