#!/usr/bin/env node
/** (v0.7.3 재발 방지) 학습 탭 구성(src/app/learn.jsx)이 사용자 요청대로 유지되는지 소스에서 검사한다.
 *  ① 일일 퀘스트는 접히지 않고 박스로 최근 대국과 같은 열 맨 위(데스크톱) / 별도 페이지(모바일)에 나온다 — 접이식(LearnFold) 안에 넣지 않는다.
 *  ② 모바일은 프로필·일일 퀘스트·최근 대국 3페이지(LearnPager): 가로 스크롤 스냅 + 위에 붙는 탭 줄(role=tab) + 현재 위치 점/번호 + "옆으로 밀어서 이동" 안내 + 다음 페이지가 보이는 폭(calc(100% - …)).
 *  ③ 프로필은 /user 페이지를 대국 목록 없이(embedded compact hideRecentGames) 쓰고, 최근 대국은 큰 박스(RecentGameBoxes)로 따로 보여 준다.
 *  실행: node scripts/check-learn-tab.mjs (npm run build 전에 prebuild로 자동 실행)
 */
import fs from "node:fs";
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const learn = rd("src/app/learn.jsx"), app = rd("src/App.jsx");
const fails = [];
const tab = (learn.match(/export function LearnTab[\s\S]*$/) || [""])[0];
if (/<LearnFold[^>]*id="quest"/.test(tab)) fails.push("LearnTab: 일일 퀘스트가 접이식(LearnFold) 안에 들어 있음 — 박스로 위에 보여야 함");
if (!/questNode=\{questNode\}/.test(tab)) fails.push("LearnTab: 일일 퀘스트(questNode)를 LearnProfileHome에 넘기지 않음");
if (!/<LearnFold[^>]*id="growth"/.test(tab) || !/<LearnFold[^>]*id="lessons"/.test(tab)) fails.push("LearnTab: 성장 분석·레슨은 접어서 유지해야 함");
const pager = (learn.match(/function LearnPager[\s\S]*?\n}\n/) || [""])[0];
if (!pager) fails.push("LearnPager 없음");
else {
  if (!/scrollSnapType: "x mandatory"/.test(pager)) fails.push("LearnPager: 가로 스크롤 스냅(scrollSnapType x mandatory)이 없음");
  if (!/position: "sticky"/.test(pager) || !/role="tab"/.test(pager)) fails.push("LearnPager: 위에 붙는 탭 줄(sticky, role=tab)이 없음");
  if (!/calc\(100% - \d+px\)/.test(pager)) fails.push("LearnPager: 다음 페이지가 보이는 폭(calc(100% - Npx))이 아님 — 넘길 수 있다는 단서가 사라짐");
  if (!/옆으로 밀어서 이동/.test(pager)) fails.push("LearnPager: '옆으로 밀어서 이동' 안내가 없음");
  if (!/idx \+ 1\}\/\{pages\.length\}/.test(pager)) fails.push("LearnPager: 현재 페이지 n/N 표시가 없음");
}
const home = (learn.match(/function LearnProfileHome[\s\S]*?\n}\n/) || [""])[0];
for (const k of ["profile", "quest", "games"]) if (!new RegExp('key: "' + k + '"').test(home)) fails.push("LearnProfileHome: 모바일 페이지 '" + k + "'가 없음");
if (!/useNarrow\(720\)/.test(home)) fails.push("LearnProfileHome: 모바일 기준(720px)이 바뀜");
if (!/<UserProfilePage embedded compact hideRecentGames/.test(app)) fails.push("App: 학습 탭 프로필이 /user 페이지(embedded compact hideRecentGames)가 아님");
if (!/RecentGameBoxes/.test(learn)) fails.push("learn.jsx: 최근 대국 큰 박스(RecentGameBoxes)를 쓰지 않음");
if (fails.length) { console.error("✗ learn-tab check 실패:\n" + fails.map((x) => "  " + x).join("\n")); process.exit(1); }
console.log("✓ learn-tab check: 일일 퀘스트 박스·모바일 3페이지 페이저·/user 프로필 + 대국 박스 구성 유지");
