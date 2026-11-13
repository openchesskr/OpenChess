#!/usr/bin/env node
/** (v0.7.3 재발 방지) 학습 탭 구성(src/app/learn.jsx)이 사용자 요청대로 유지되는지 소스에서 검사한다.
 *  ① (v0.7.4) 일일 퀘스트는 학습 탭이 아니라 플레이 탭에 있다(데스크톱 좌우 분할, 모바일 세로 스크롤). 학습 탭에는 퀘스트 카드·props가 없다.
 *  ② 모바일은 성장 분석·최근 대국 2페이지(LearnPager): 가로 스크롤 스냅 + (v0.7.4) 탭 줄 토글 없음 + 현재 위치 점/번호 + "옆으로 밀어서 이동" 안내 + 다음 페이지가 보이는 폭(calc(100% - …)).
 *  ③ (v0.7.3) 왼쪽(데스크톱)/첫 페이지(모바일)는 프로필이 아니라 성장 분석(GrowthPanel)이고, 최근 대국은 큰 박스(RecentGameBoxes)로 따로 보여 준다. 일일 퀘스트 카드(DailyQuestCard)에는 그라데이션을 쓰지 않는다.
 *  실행: node scripts/check-learn-tab.mjs (npm run build 전에 prebuild로 자동 실행)
 */
import fs from "node:fs";
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const learn = rd("src/app/learn.jsx"), app = rd("src/App.jsx"), gh0 = rd("src/app/growthHome.jsx");
const fails = [];
const tab = (learn.match(/export function LearnTab[\s\S]*$/) || [""])[0];
if (/DailyQuestCard|questNode|dailyQuest/.test(learn)) fails.push("learn.jsx: 일일 퀘스트는 플레이 탭으로 옮겼으므로 학습 탭에 남기지 않음");
// (v0.7.5) 예전 레슨(LessonMap·LearnFold·mainQuest)이 남으면 안 된다.
if (/LessonMap|LessonScreen|LessonEditor|LearnFold|mainQuest/.test(learn)) fails.push("learn.jsx: 예전 레슨 코드가 남으면 안 됨");
// (v0.7.6, 사용자 요청) 학습 탭 = 레슨 경로(LessonPath) + 맞춤 학습(PracticePanel: 실수 복습·추가 학습). 성장 분석·최근 대국은 분석 탭(growthHome.jsx)으로 옮겼다.
if (!/<LessonPath /.test(tab) || !/<PracticePanel /.test(tab)) fails.push("LearnTab: 레슨 경로(LessonPath)와 맞춤 학습(PracticePanel)이 함께 있어야 함");
if (/<GrowthPanel /.test(learn)) fails.push("learn.jsx: 성장 분석은 분석 탭으로 옮겼음 — 학습 탭에 다시 넣지 말 것");
if (/<LessonPath /.test(rd("src/app/dex.jsx"))) fails.push("dex.jsx: 레슨은 학습 탭으로 옮겼음 — 도감 첫 화면에 다시 넣지 말 것");
if (!/key: "lessons"/.test(tab) || !/key: "practice"/.test(tab) || !/useNarrow\(720\)/.test(tab)) fails.push("LearnTab: 모바일(720px 이하)은 레슨·맞춤 학습 2페이지(SwipePager)여야 함");
if (!/<PracticePanel recent=\{src\.recent\}/.test(tab)) fails.push("LearnTab: 맞춤 학습이 성장 분석과 같은 최근 5판(src.recent)을 쓰지 않음");
{ // (v0.7.4) 모바일 가로 스와이프 2페이지는 공용 SwipePager 하나(학습 탭 · 플레이 탭이 같은 디자인). 탭 줄·점·n/N 표시는 없다.
  const pager = rd("src/components/swipePager.jsx"), play = rd("src/app/play.jsx");
  if (!/export function SwipePager/.test(pager)) fails.push("SwipePager 없음");
  if (!/scrollSnapType: "x mandatory"/.test(pager)) fails.push("SwipePager: 가로 스크롤 스냅(scrollSnapType x mandatory)이 없음");
  if (/role="tab"\b/.test(pager) || /idx \+ 1\}\/\{pages\.length\}/.test(pager)) fails.push("SwipePager: 탭 줄/점/n·N 표시가 다시 생김 — 사용자 요청으로 뺐음");
  if (!/calc\(100% - \d+px\)/.test(pager)) fails.push("SwipePager: 다음 페이지가 보이는 폭(calc(100% - Npx))이 아님 — 넘길 수 있다는 단서가 사라짐");
  if (!/옆으로 밀어서 이동/.test(pager)) fails.push("SwipePager: '옆으로 밀어서 이동' 안내가 없음");
  if (/function LearnPager/.test(learn) || !/<SwipePager /.test(learn)) fails.push("learn.jsx: 학습 탭이 공용 SwipePager를 쓰지 않음");
  if (!/<SwipePager /.test(play) || !/key: "play"/.test(play) || !/key: "quest"/.test(play)) fails.push("play.jsx: 모바일 플레이 탭이 게임·퀘스트 2페이지(SwipePager)가 아님");
}
// (v0.7.6) 분석 탭 성장 분석 영역(AnalysisWithGrowth): 모바일은 분석·성장 분석·최근 대국 3페이지, 집중 분석 중에는 1페이지만.
const home = (gh0.match(/export function AnalysisWithGrowth[\s\S]*?\n}\n/) || [""])[0];
for (const k of ["analysis", "growth", "games"]) if (!new RegExp('key: "' + k + '"').test(home)) fails.push("AnalysisWithGrowth: 모바일 페이지 '" + k + "'가 없음");
if (!/useNarrow\(720\)/.test(home)) fails.push("AnalysisWithGrowth: 모바일 기준(720px)이 바뀜");
if (!/if \(!focusActive\) pages\.push/.test(home)) fails.push("AnalysisWithGrowth: 집중 분석 중에는 성장 분석 페이지를 숨겨야 함");
if (!/active=\{active\}/.test(home) || !/onIndexChange=\{setPageIdx\}/.test(home) || !/useSeenOnce\(deskRef\)/.test(home)) fails.push("AnalysisWithGrowth: 성장 분석이 화면에 보일 때만 자동 리뷰(active)해야 함 — 분석 탭 실시간 평가와 엔진 대기열을 다툼");
if (!/<AnalysisWithGrowth focusActive=\{focusActive\} analysisNode=\{<AnalysisTab /.test(app)) fails.push("App: 분석 탭이 성장 분석 영역(AnalysisWithGrowth)으로 감싸져 있지 않음");
if (/<UserProfilePage embedded/.test(app)) fails.push("App: 학습 탭에 /user 프로필 페이지가 다시 들어옴(프로필 정보는 성장 분석으로 대체됨)");
{ const dqs = rd("src/app/dailyQuest.jsx"), dq = (dqs.match(/export function DailyQuestCard[\s\S]*?\n}\n/) || [""])[0]; if (!dq) fails.push("DailyQuestCard(dailyQuest.jsx)를 찾지 못함"); else if (/gradient\(/.test(dq)) fails.push("DailyQuestCard: 그라데이션(linear/radial-gradient)을 쓰면 안 됨(단색 면 + 얇은 테두리)"); }
if (!/RecentGameBoxes/.test(gh0)) fails.push("growthHome.jsx: 최근 대국 큰 박스(RecentGameBoxes)를 쓰지 않음");
{ // (v0.7.4) 성장 분석: 맨 위 /user 프로필 상단 정보(칭호·사진·이름·소개·MID·티어/퍼즐 레이팅) → 리뷰 5판 게이트(게이지 바) 또는 마스터 스타일. 나머지 분석 요소는 삭제했다.
  const gr = rd("src/app/growth.jsx");
  const gp = (gr.match(/export function GrowthPanel[\s\S]*$/) || [""])[0];
  if (!gp) fails.push("GrowthPanel을 찾지 못함");
  else {
    if (!/<ProfileBlock /.test(gp)) fails.push("GrowthPanel: 프로필 크림 블록(ProfileBlock) 안에 모든 구획이 들어가야 함");
    // (v0.7.5, 사용자 요청) 자동 분석 게이지는 /about 수준의 진행 애니메이션(app/growthMotion.jsx AnalysisScanner)으로 바뀌었다
    if (!/<AnalysisScanner /.test(gp) || !/<MasterStyle /.test(gp)) fails.push("GrowthPanel: 자동 분석 진행 화면(AnalysisScanner)과 마스터 스타일(MasterStyle)이 필요함");
    if (!/<ProfileBlock[\s\S]*<AnalysisScanner[\s\S]*<\/ProfileBlock>/.test(gp)) fails.push("GrowthPanel: 분석 구획이 ProfileBlock 안에 있어야 함");
    if (/function AutoReviewGate|<AutoReviewGate /.test(gr)) fails.push("growth.jsx: 예전 게이지(AutoReviewGate)는 삭제됨(v0.7.5 사용자 요청) — AnalysisScanner를 쓸 것");
  }
  const gh = (gr.match(/function ProfileBlock[\s\S]*?\n}\n/) || [""])[0];
  if (/EquippedTitleFit/.test(gh)) fails.push("ProfileBlock: 학습 탭에는 칭호를 표시하지 않음(v0.7.4 사용자 요청)");
  for (const [re, what] of [[/me\.photo/, "프로필 사진"], [/me\.nickname/, "이름"], [/me\.bio/, "소개"], [/#\{mid\}/, "MID"]]) if (!re.test(gh)) fails.push("ProfileBlock: " + what + " 표시가 없음(/user 상단 정보)");
  if (/TierRatingRow|puzzleRating|TierStatPill/.test(gr)) fails.push("growth.jsx: 성장 분석에는 퍼즐 티어·레이팅을 표시하지 않음");
  if (!/me=\{p\.me\}/.test(home)) fails.push("AnalysisWithGrowth: GrowthPanel에 내 프로필(me)을 넘기지 않음");
  if (!/recent=\{src\.recent\}/.test(home) || !/engine=\{p\.engine\}/.test(home)) fails.push("AnalysisWithGrowth: GrowthPanel에 최근 대국(recent)과 엔진(engine)을 넘기지 않음 — 자동 리뷰를 못 함");
  for (const dead of ["WeaknessMap", "ReviewCards", "OpeningMistakes", "GrowthSummary", "GROWTH_SECTIONS"]) if (new RegExp("function " + dead + "\\b").test(gr)) fails.push("growth.jsx: 삭제한 성장 분석 요소(" + dead + ")가 다시 들어옴");
}
{ // (v0.7.4) 데스크톱 /learn: 화면 높이 2열 대시보드(왼쪽 프로필·일일 퀘스트 정확히 반반, 오른쪽은 최근 대국만), 일일 퀘스트 compact, 최근 대국 박스 확장, 알림 → 학습 탭.
  const wide = (home.match(/className="analysis-growth"[\s\S]*$/) || [""])[0];
  if (!wide || !/gridTemplateColumns: "minmax\(0, 1fr\) minmax\(0, 1fr\)"/.test(wide) || !/\{growthNode\}[\s\S]*\{gamesNode\}/.test(wide)) fails.push("AnalysisWithGrowth: 데스크톱은 분석 아래 2열(왼쪽 성장 분석·오른쪽 최근 대국)이어야 함");
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
  if (!/onOpen=\{\(\) => \{ dismissCcToast\(\); switchTab\("analysis"\); \}\}/.test(app)) fails.push("App: chess.com 알림 onOpen이 최근 대국이 있는 분석 탭(switchTab(\"analysis\"))으로 연결되지 않음(v0.7.6)");
}
if (fails.length) { console.error("✗ learn-tab check 실패:\n" + fails.map((x) => "  " + x).join("\n")); process.exit(1); }
console.log("✓ learn-tab check: 학습 탭(레슨·맞춤 학습)·분석 탭 성장 분석(아래 2열/옆 페이지)·플레이 탭 일일 퀘스트 구성 유지");
