#!/usr/bin/env node
/** (v0.7.5, 사용자 요청 · BUG-158·159 재발 방지) 탭 이동·새로고침 때 화면 상태와 경로가 유지되는지 코드 규칙으로 지킨다.
 *  ① 새로고침: 첫 렌더부터 맞는 탭(initialTabForPath — 탭 주소·퍼즐 딥링크·마지막 탭), 늦게 오는 저장 상태(d.tab)가 탭을 다시 바꾸지 않음, 딥링크 동안 덮개
 *  ② 탭 이동: 떠나는 탭의 주소·스크롤을 기억하고(rememberTabPlace) 돌아올 때 그 주소로(tabLastPath), 재마운트(navNonce)는 같은 탭을 다시 누를 때만
 *  ③ 분석 탭: FEN 시작 포지션(fenRoot)은 App이 수순과 함께 들고 저장·복원(BUG-158), 분석 탭 밖에서 수순을 올릴 때는 FEN을 비움(setAnalysisSansStd)
 *  ④ 화면 상태: 분석(보드 방향·보기·정렬)·퍼즐(필터·정렬·모드)·학습(보기·필터)이 useTabMemory로 유지
 *  실행: node scripts/check-tab-memory.mjs (prebuild) */
import { readFileSync } from "node:fs";
const rd = (p) => readFileSync(new URL("../src/" + p, import.meta.url), "utf8");
const app = rd("App.jsx"), shell = rd("app/shell.jsx"), an = rd("app/analysis.jsx"), pz = rd("app/puzzle.jsx"), lr = rd("app/learn.jsx");
const fails = [];
const need = (cond, msg) => { if (!cond) fails.push(msg); };
// ①
need(/export function initialTabForPath\(/.test(shell) && /lastTabStored\(\) \|\| "analysis"/.test(shell), "shell.jsx: initialTabForPath(마지막 탭 기억)가 없음");
need(/useState\(\(\) => \(typeof window !== "undefined" \? initialTabForPath\(window\.location\.pathname\)/.test(app), "App.jsx: 첫 탭을 initialTabForPath로 정하지 않음 — 새로고침 때 다른 탭이 잠깐 보인다");
need(/useEffect\(\(\) => \{ rememberLastTab\(tab\); \}, \[tab\]\)/.test(app), "App.jsx: 탭이 바뀔 때 마지막 탭을 저장하지 않음");
need(/if \(d\.tab && !urlTabRef\.current && !lastTabKnownRef\.current\) setTab\(d\.tab\)/.test(app), "App.jsx: 늦게 오는 저장 상태(d.tab)가 이미 정한 탭을 다시 바꿀 수 있음");
need(/\{deepLinkPending && /.test(app) && /finally \{ setDeepLinkPending\(false\); \}/.test(app), "App.jsx: 딥링크를 푸는 동안 덮개가 없거나 꺼지지 않음");
// ②
const sw = app.slice(app.indexOf("const switchTab = (k, pathOverride) => {"), app.indexOf("const switchTab = (k, pathOverride) => {") + 1500);
need(/rememberTabPlace\(tab, window\.location\.pathname, window\.scrollY\)/.test(sw), "switchTab: 떠나는 탭의 주소·스크롤을 기억하지 않음");
need(/tabLastPath\(k\)/.test(sw) && /tabLastScroll\(k\)/.test(sw), "switchTab: 돌아온 탭의 마지막 주소·스크롤로 복귀하지 않음");
need(/if \(same\) setNavNonce/.test(sw) && !/^\s*setNavNonce\(\(n\) => n \+ 1\);\s*$/m.test(sw), "switchTab: 다른 탭으로 옮길 때도 재마운트(navNonce)해 상태가 사라짐");
// ③
need(!/const \[fenRoot, setFenRoot\] = useState/.test(an) && /export function AnalysisTab\(\{ fenRoot = null, setFenRoot,/.test(an), "analysis.jsx: fenRoot를 분석 탭 안 useState로 들고 있음 — 탭을 오가면 사라진다(BUG-158)");
need(/fenRoot=\{analysisFenRoot\} setFenRoot=\{setAnalysisFenRoot\}/.test(app), "App.jsx: AnalysisTab에 fenRoot를 넘기지 않음");
need(/analysisSans, analysisFenRoot, analysisExtra, tab, analysisFuture/.test(app) && /setAnalysisFenRoot\(d\.analysisFenRoot\)/.test(app), "App.jsx: FEN 시작 포지션을 저장·복원하지 않음");
const bad = app.split("\n").filter((l) => /\bsetAnalysisSans\(/.test(l) && !/useState|d\.analysisSans|setAnalysisSansStd = /.test(l));
need(bad.length === 0, "App.jsx: 분석 탭 밖에서 setAnalysisSans를 직접 부름(FEN 시작 포지션이 남아 보드가 어긋남) — setAnalysisSansStd를 쓸 것: " + bad.map((l) => l.trim().slice(0, 60)).join(" | "));
// ④
for (const [src, keys, name] of [[an, ["analysis.flip", "analysis.mode", "analysis.sortBy"], "분석"], [pz, ["puzzle.quickFilter", "puzzle.mode", "puzzle.openings", "puzzle.creators", "puzzle.sortBy"], "퍼즐"], [lr, ["learn.view", "learn.timeFilter", "learn.colorFilter"], "학습"]])
  for (const k of keys) need(src.includes('useTabMemory("' + k + '"'), name + " 탭: " + k + " 상태가 탭 이동 때 유지되지 않음(useTabMemory)");
if (fails.length) { console.error("✗ check-tab-memory 실패 (" + fails.length + "건)\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-tab-memory: 새로고침 첫 탭·딥링크 덮개, 탭별 주소·스크롤 기억, FEN 시작 포지션 저장, 분석·퍼즐·학습 화면 상태 유지 규칙이 지켜진다");
