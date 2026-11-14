#!/usr/bin/env node
/** (v0.7.6, 사용자 요청) 도감 첫 화면 — 큰 체스판 하나를 네 사분면으로 나눠 오프닝·마스터·업적·스킨을 똑같이 배치(4차안), 안쪽 화면 위 구획 전환 줄,
 *  해금률을 모르면 0% 대신 "탐색 전"(BUG-168). 실행: node scripts/check-dex-hub.mjs (prebuild) */
import fs from "node:fs";
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const hub = rd("src/components/dexHub.jsx"), dex = rd("src/app/dex.jsx");
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
ok(/className="dexgrid" style=\{\{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr"/.test(hub) && /items\.map\(\(it, i\) => <Quadrant /.test(hub), "네 구획이 체스판의 같은 크기 사분면(2×2)이 아님");
ok(/const PIECE = \{ openings:[^}]*masters:[^}]*titles:[^}]*skins:/.test(hub), "사분면 대표 기물(PIECE)이 네 구획 모두에 있어야 함");
ok(!/GalleryLamp|Vitrine|grid-template-areas|summary/.test(hub), "걷어낸 이전 시안(진열장·조명·벤토·요약 알약)이 다시 생김");
ok(/export function DexSectionNav/.test(hub) && /\{dexView !== "hub" && <DexSectionNav items=\{hubItems\} current=\{dexView\}/.test(dex), "안쪽 화면 위 구획 전환 줄(DexSectionNav)이 없음");
ok(/percent: unlockStats && unlockStats\.total \? [^,]+ : null, detail: unlockStats && unlockStats\.total \? [^:]+ : t\("탐색 전"\)/.test(dex), "BUG-168: 해금률을 모르면 0% 대신 '탐색 전'");
ok(!/<LessonPath /.test(dex), "레슨은 학습 탭에 있음 — 도감 첫 화면에 다시 넣지 말 것");
if (fails.length) { console.error("✗ check-dex-hub 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-dex-hub: 도감 첫 화면 체스판 사분면 4개(동등 배치)·구획 전환 줄 유지");
