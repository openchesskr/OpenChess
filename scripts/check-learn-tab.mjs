#!/usr/bin/env node
/** (v0.7.3 재발 방지) 학습 탭 구성(src/app/learn.jsx)이 사용자 요청대로 유지되는지 소스에서 검사한다.
 *  ① 일일 퀘스트는 접히지 않고 박스로 최근 대국과 같은 열 맨 위(데스크톱) / 별도 페이지(모바일)에 나온다 — 접이식(LearnFold) 안에 넣지 않는다.
 *  ② 모바일은 프로필·일일 퀘스트·최근 대국 3페이지(LearnPager): 가로 스크롤 스냅 + 위에 붙는 탭 줄(role=tab) + 현재 위치 점/번호 + "옆으로 밀어서 이동" 안내 + 다음 페이지가 보이는 폭(calc(100% - …)).
 *  ③ (v0.7.3) 왼쪽(데스크톱)/첫 페이지(모바일)는 프로필이 아니라 성장 분석(GrowthPanel)이고, 최근 대국은 큰 박스(RecentGameBoxes)로 따로 보여 준다. 일일 퀘스트 카드(DailyQuestCard)에는 그라데이션을 쓰지 않는다.
 *  실행: node scripts/check-learn-tab.mjs (npm run build 전에 prebuild로 자동 실행)
 */
import fs from "node:fs";
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const learn = rd("src/app/learn.jsx"), app = rd("src/App.jsx");
const fails = [];
const tab = (learn.match(/export function LearnTab[\s\S]*$/) || [""])[0];
if (/<LearnFold[^>]*id="quest"/.test(tab)) fails.push("LearnTab: 일일 퀘스트가 접이식(LearnFold) 안에 들어 있음 — 박스로 위에 보여야 함");
if (!/questNode=\{questNode\}/.test(tab)) fails.push("LearnTab: 일일 퀘스트(questNode)를 LearnProfileHome에 넘기지 않음");
if (!/<LearnFold[^>]*id="lessons"/.test(tab)) fails.push("LearnTab: 레슨은 접어서 유지해야 함");
if (/<LearnFold[^>]*id="growth"/.test(tab) || !/growthNode=\{growthNode\}/.test(tab) || !/<GrowthPanel /.test(tab)) fails.push("LearnTab: 성장 분석(GrowthPanel)은 접지 않고 프로필 자리(growthNode)에 펼쳐 보여야 함");
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
for (const k of ["growth", "quest", "games"]) if (!new RegExp('key: "' + k + '"').test(home)) fails.push("LearnProfileHome: 모바일 페이지 '" + k + "'가 없음");
if (!/useNarrow\(720\)/.test(home)) fails.push("LearnProfileHome: 모바일 기준(720px)이 바뀜");
if (/<UserProfilePage embedded/.test(app)) fails.push("App: 학습 탭에 /user 프로필 페이지가 다시 들어옴(프로필 정보는 성장 분석으로 대체됨)");
{ const dq = (learn.match(/function DailyQuestCard[\s\S]*?\n}\n/) || [""])[0]; if (!dq) fails.push("DailyQuestCard를 찾지 못함"); else if (/gradient\(/.test(dq)) fails.push("DailyQuestCard: 그라데이션(linear/radial-gradient)을 쓰면 안 됨(단색 면 + 얇은 테두리)"); }
if (!/RecentGameBoxes/.test(learn)) fails.push("learn.jsx: 최근 대국 큰 박스(RecentGameBoxes)를 쓰지 않음");
{ // (v0.7.3) 레슨은 듀오링고식 세로 경로(원형 노드 + 굽이치는 길 + "시작" 말풍선) — 가로 카드 지도·그라데이션으로 되돌리지 않는다.
  const ln = (learn.match(/const LESSON_NODE_D[\s\S]*?\nfunction LessonMap[\s\S]*?\n}\n/) || [""])[0];
  if (!ln) fails.push("레슨 경로(LESSON_NODE_D ~ LessonMap)를 찾지 못함");
  else {
    if (!/borderRadius: "50%"/.test(ln)) fails.push("LessonNode: 원형 노드가 아님");
    if (!/lessonPathPositions/.test(ln) || !/LESSON_WAVE/.test(ln)) fails.push("LessonMap: 굽이치는 세로 경로 배치(lessonPathPositions/LESSON_WAVE)가 없음");
    if (!/t\("시작"\)/.test(ln)) fails.push("LessonNode: 지금 할 레슨 '시작' 말풍선이 없음");
    if (/gradient\(/.test(ln.replace(/\/\/.*$/gm, ""))) fails.push("레슨 경로: 그라데이션을 쓰면 안 됨");
    if (/overflowX: "auto"/.test(ln)) fails.push("LessonMap: 가로 스크롤 지도로 되돌아감");
  }
}
{ // (v0.7.4) 성장 분석은 맨 위에 /user 프로필 상단 정보(칭호·사진·이름·소개·MID·티어/퍼즐 레이팅) → 요약 띠 → 구획 탭 순서. 기존 네 영역(약점 지도·복습 카드·오프닝 실수·마스터 스타일)과 세 지표는 유지한다.
  const gr = rd("src/app/growth.jsx");
  const gp = (gr.match(/export function GrowthPanel[\s\S]*$/) || [""])[0];
  if (!gp) fails.push("GrowthPanel을 찾지 못함");
  else {
    if (!/<GrowthHeader /.test(gp) || !/<GrowthSummary /.test(gp)) fails.push("GrowthPanel: 프로필 헤더(GrowthHeader)·요약 띠(GrowthSummary)가 없음");
    if (gp.indexOf("<GrowthHeader") > gp.indexOf("<GrowthSummary")) fails.push("GrowthPanel: 프로필 헤더가 요약 띠보다 위에 있어야 함");
    for (const c of ["WeaknessMap", "ReviewCards", "OpeningMistakes", "MasterStyle"]) if (!new RegExp("<" + c + " ").test(gp)) fails.push("GrowthPanel: " + c + " 구획이 빠짐(기존 정보 유지)");
  }
  const gh = (gr.match(/function GrowthHeader[\s\S]*?\n}\n/) || [""])[0];
  for (const [re, what] of [[/EquippedTitleFit/, "장착 칭호"], [/me\.photo/, "프로필 사진"], [/me\.nickname/, "이름"], [/me\.bio/, "소개"], [/#\{mid\}/, "MID"], [/TierRatingRow/, "티어·퍼즐 레이팅"]]) if (!re.test(gh)) fails.push("GrowthHeader: " + what + " 표시가 없음(/user 상단 정보)");
  for (const k of ["분석한 실수", "오늘 복습", "익힌 카드"]) if (!gr.includes('t("' + k + '")')) fails.push("성장 분석: '" + k + "' 지표가 없음");
  if (!/me=\{me\}/.test(tab)) fails.push("LearnTab: GrowthPanel에 내 프로필(me)을 넘기지 않음");
}
{ // (v0.7.4) 네 구획의 새 레이아웃 유지: 약점 지도(구간 색 누적 막대, 예전 구간×유형 표 폐지)·복습 카드(복습 간격 단계 막대)·오프닝 실수(백/흑 전환)·마스터 스타일(지문 띠 + 묶음별 접이식).
  const gr = rd("src/app/growth.jsx");
  const part = (a, b) => (gr.match(new RegExp("function " + a + "[\\s\\S]*?\\nfunction " + b)) || [""])[0];
  if (!/PHASE_COLOR/.test(gr) || /<table/.test(gr)) fails.push("약점 지도: 구간 색 누적 막대(PHASE_COLOR)를 쓰고 예전 구간×유형 <table>은 쓰지 않아야 함");
  if (!/const stages = useMemo/.test(gr)) fails.push("복습 카드: 복습 간격 단계(stages) 분포 막대가 없음");
  if (!/const \[side, setSide\]/.test(gr) || !/role="tablist"/.test((gr.match(/function OpeningMistakes[\s\S]*?\n}\n/) || [""])[0])) fails.push("오프닝 실수: 백/흑 전환 탭(side)이 없음 — 두 색을 위아래로 쌓지 않는다");
  const ms = (gr.match(/function MasterStyle[\s\S]*?\n}\n/) || [""])[0];
  if (!/allKeys\.map/.test(ms) || !/openG/.test(ms) || !/className="growth-crit-table"/.test(ms)) fails.push("마스터 스타일: 기준 지문 띠(allKeys)·묶음별 접이식(openG)·비교 표(growth-crit-table)가 필요함");
}
if (fails.length) { console.error("✗ learn-tab check 실패:\n" + fails.map((x) => "  " + x).join("\n")); process.exit(1); }
console.log("✓ learn-tab check: 일일 퀘스트 박스·모바일 3페이지 페이저·/user 프로필 + 대국 박스 구성 유지");
