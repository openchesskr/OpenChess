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
if (fails.length) { console.error("✗ check-dex-hub 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-dex-hub: 도감은 첫 화면 없이 오프닝(이후 마지막 구역)으로 열리고, 구획 전환 줄·열린 블록·모식도 위치가 유지된다");
