#!/usr/bin/env node
/** (v0.7.3 재발 방지) 학습 탭 구성(src/app/learn.jsx)이 사용자 요청대로 유지되는지 소스에서 검사한다.
 *  ① (v0.7.4) 일일 퀘스트는 학습 탭이 아니라 플레이 탭에 있다(데스크톱 좌우 분할, 모바일 세로 스크롤). 학습 탭에는 퀘스트 카드·props가 없다.
 *  ② 모바일은 성장 분석·최근 대국 2페이지(LearnPager): 가로 스크롤 스냅 + 위에 붙는 탭 줄(role=tab) + 현재 위치 점/번호 + "옆으로 밀어서 이동" 안내 + 다음 페이지가 보이는 폭(calc(100% - …)).
 *  ③ (v0.7.3) 왼쪽(데스크톱)/첫 페이지(모바일)는 프로필이 아니라 성장 분석(GrowthPanel)이고, 최근 대국은 큰 박스(RecentGameBoxes)로 따로 보여 준다. 일일 퀘스트 카드(DailyQuestCard)에는 그라데이션을 쓰지 않는다.
 *  실행: node scripts/check-learn-tab.mjs (npm run build 전에 prebuild로 자동 실행)
 */
import fs from "node:fs";
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const learn = rd("src/app/learn.jsx"), app = rd("src/App.jsx");
const fails = [];
const tab = (learn.match(/export function LearnTab[\s\S]*$/) || [""])[0];
if (/DailyQuestCard|questNode|dailyQuest/.test(learn)) fails.push("learn.jsx: 일일 퀘스트는 플레이 탭으로 옮겼으므로 학습 탭에 남기지 않음");
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
for (const k of ["growth", "games"]) if (!new RegExp('key: "' + k + '"').test(home)) fails.push("LearnProfileHome: 모바일 페이지 '" + k + "'가 없음");
if (/key: "quest"/.test(home)) fails.push("LearnProfileHome: 모바일 일일 퀘스트 페이지가 다시 생김");
if (!/useNarrow\(720\)/.test(home)) fails.push("LearnProfileHome: 모바일 기준(720px)이 바뀜");
if (/<UserProfilePage embedded/.test(app)) fails.push("App: 학습 탭에 /user 프로필 페이지가 다시 들어옴(프로필 정보는 성장 분석으로 대체됨)");
{ const dqs = rd("src/app/dailyQuest.jsx"), dq = (dqs.match(/export function DailyQuestCard[\s\S]*?\n}\n/) || [""])[0]; if (!dq) fails.push("DailyQuestCard(dailyQuest.jsx)를 찾지 못함"); else if (/gradient\(/.test(dq)) fails.push("DailyQuestCard: 그라데이션(linear/radial-gradient)을 쓰면 안 됨(단색 면 + 얇은 테두리)"); }
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
{ // (v0.7.4) 성장 분석: 맨 위 /user 프로필 상단 정보(칭호·사진·이름·소개·MID·티어/퍼즐 레이팅) → 리뷰 5판 게이트(게이지 바) 또는 마스터 스타일. 나머지 분석 요소는 삭제했다.
  const gr = rd("src/app/growth.jsx");
  const gp = (gr.match(/export function GrowthPanel[\s\S]*$/) || [""])[0];
  if (!gp) fails.push("GrowthPanel을 찾지 못함");
  else {
    if (!/<ProfileBlock /.test(gp)) fails.push("GrowthPanel: 프로필 크림 블록(ProfileBlock) 안에 모든 구획이 들어가야 함");
    if (!/<AutoReviewGate /.test(gp) || !/<MasterStyle /.test(gp)) fails.push("GrowthPanel: 자동 분석 게이지(AutoReviewGate)와 마스터 스타일(MasterStyle)이 필요함");
    if (!/<ProfileBlock[\s\S]*<AutoReviewGate[\s\S]*<\/ProfileBlock>/.test(gp)) fails.push("GrowthPanel: 분석 구획이 ProfileBlock 안에 있어야 함");
  }
  const gh = (gr.match(/function ProfileBlock[\s\S]*?\n}\n/) || [""])[0];
  for (const [re, what] of [[/EquippedTitleFit/, "장착 칭호"], [/me\.photo/, "프로필 사진"], [/me\.nickname/, "이름"], [/me\.bio/, "소개"], [/#\{mid\}/, "MID"]]) if (!re.test(gh)) fails.push("ProfileBlock: " + what + " 표시가 없음(/user 상단 정보)");
  if (/TierRatingRow|puzzleRating|TierStatPill/.test(gr)) fails.push("growth.jsx: 성장 분석에는 퍼즐 티어·레이팅을 표시하지 않음");
  if (!/me=\{me\}/.test(tab)) fails.push("LearnTab: GrowthPanel에 내 프로필(me)을 넘기지 않음");
  if (!/recent=\{src\.recent\}/.test(tab) || !/engine=\{engine\}/.test(tab)) fails.push("LearnTab: GrowthPanel에 최근 대국(recent)과 엔진(engine)을 넘기지 않음 — 자동 리뷰를 못 함");
  for (const dead of ["WeaknessMap", "ReviewCards", "OpeningMistakes", "GrowthSummary", "GROWTH_SECTIONS"]) if (new RegExp("function " + dead + "\\b").test(gr)) fails.push("growth.jsx: 삭제한 성장 분석 요소(" + dead + ")가 다시 들어옴");
}
{ // (v0.7.4) 데스크톱 /learn: 화면 높이 2열 대시보드(왼쪽 프로필·일일 퀘스트 정확히 반반, 오른쪽은 최근 대국만), 일일 퀘스트 compact, 최근 대국 박스 확장, 알림 → 학습 탭.
  const home = (learn.match(/function LearnProfileHome[\s\S]*?\n}\n/) || [""])[0];
  if (!/className="learn-dash"/.test(home) || !/gridTemplateColumns: "minmax\(0, 1fr\) minmax\(0, 1fr\)"/.test(home)) fails.push("LearnProfileHome: 데스크톱은 화면 높이 기준 2열 대시보드(learn-dash: 왼쪽 성장 분석·오른쪽 최근 대국)여야 함");
  const wide = (home.match(/className="learn-dash"[\s\S]*$/) || [""])[0];
  if (!/\{growthNode\}/.test(wide) || !/\{gamesNode\}/.test(wide)) fails.push("LearnProfileHome: 데스크톱 2열은 왼쪽 growthNode·오른쪽 gamesNode");
  // 플레이 탭: 일일 퀘스트(데스크톱 좌우 분할 · 모바일 세로 스크롤), 대국 중에는 숨김, 학습 탭 아이콘/알림 연결
  const play = rd("src/app/play.jsx");
  if (!/<DailyQuestCard /.test(play) || !/showQuest/.test(play)) fails.push("PlayPage: 일일 퀘스트 카드(DailyQuestCard)가 없음");
  if (!/step === "setup"/.test((play.match(/const showQuest[^\n]*/) || [""])[0])) fails.push("PlayPage: 대국 중(step=playing)에는 퀘스트를 숨겨야 함");
  if (!/gridTemplateColumns: "minmax\(0, " \+ hubMaxW \+ "px\) minmax\(0, 1fr\)"/.test(play)) fails.push("PlayPage: 데스크톱은 왼쪽 플레이 허브·오른쪽 일일 퀘스트 좌우 분할이어야 함");
  if (!/onQuestBadgeClick = useCallback\(\(openingName\) => \{\s*setTab\("store"\)/.test(app)) fails.push("App: 분석 탭 퀘스트 배지는 플레이 탭(store)으로 이동해야 함");
  if (!/questActive=\{tab === "store"\}/.test(app)) fails.push("App: 퀘스트는 플레이 탭이 보일 때만 마운트(questActive)해야 함 — 숨겨진 탭에서 완료 공개 연출이 먼저 끝나면 안 됨");
  const gh = rd("src/app/gameHistory.jsx"), box = (gh.match(/function GameBox[\s\S]*?\nexport function RecentGameBoxes/) || [""])[0];
  if (!box) fails.push("GameBox를 찾지 못함");
  else {
    if (!/CC_TOAST_LABEL_FONT/.test(box) || !/recordAround\(/.test(box) || !/ccWrColor/.test(box)) fails.push("GameBox: 오프닝 줄이 chess.com 알림과 같은 디자인(CC_TOAST_LABEL_FONT·전적 칩)이 아님");
    if (!/badgeIcon\("brilliant"/.test(box) || !/badgeIcon\("only"/.test(box)) fails.push("GameBox: 좌하단 탁월한 수·유일한 수 개수가 없음");
    if (!/<Search size=/.test(box) || !/<BestMoveJumpButton/.test(box)) fails.push("GameBox: 대국 보기·리뷰하기는 검색 아이콘 버튼 + 연두색 리뷰 아이콘 버튼이어야 함");
    if (/>\{t\("대국 보기"\)\}<\/button>|>\{summary \? t\("리뷰 보기"\) : t\("리뷰하기"\)\}<\/button>/.test(box)) fails.push("GameBox: 글자 버튼으로 되돌아감");
  }
  const shell = rd("src/app/shell.jsx");
  if (!/export function ChesscomGameToast\(\{[^)]*onOpen/.test(shell)) fails.push("ChesscomGameToast: 알림을 누르면 학습 탭으로 가는 onOpen이 없음");
  if (!/onOpen=\{\(\) => \{ dismissCcToast\(\); switchTab\("learn"\); \}\}/.test(app)) fails.push("App: chess.com 알림 onOpen이 학습 탭(switchTab(\"learn\"))으로 연결되지 않음");
}
if (fails.length) { console.error("✗ learn-tab check 실패:\n" + fails.map((x) => "  " + x).join("\n")); process.exit(1); }
console.log("✓ learn-tab check: 학습 탭(성장 분석·최근 대국 2열/2페이지)·플레이 탭 일일 퀘스트 좌우 분할 구성 유지");
