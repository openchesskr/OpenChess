// (v0.6.0, App.jsx 분할 · v0.7.3 quest.jsx → learn.jsx) 'learn'(학습 탭) 화면.
// (v0.7.6, 사용자 요청) 학습 탭 재구성 — 도감 첫 화면에 있던 레슨을 이 탭으로 옮기고, 이 탭을 차지하던 성장 분석·최근 대국은 분석 탭으로 옮겼다(growthHome.jsx).
//  대신 성장 분석의 약점 진단과 이어지는 "맞춤 학습"(실수 복습·추가 학습 레슨 추천, practice.jsx)을 새로 둔다.
//  · 데스크톱: 왼쪽 레슨 경로 · 오른쪽 맞춤 학습(각각 안쪽 스크롤)
//  · 모바일: 옆으로 넘기는 2페이지 — 레슨 경로 / 맞춤 학습(SwipePager)
import { FadeIn, useNarrow } from "./common.jsx";
import { LessonPath } from "./lessons.jsx";
import { PracticePanel } from "./practice.jsx";
import { useRecentSources } from "./growthHome.jsx";
import { SwipePager } from "../components/swipePager.jsx";

export function LearnTab({ user, uid, chesscom, ccName, lessonState, onLessonComplete, lessonCoins, onOpenReview, onGoAnalysis }) {
  const mobile = useNarrow(720);
  const src = useRecentSources({ user, uid, chesscom, ccName });
  const lessonsNode = (h) => <LessonPath lessonState={lessonState} onComplete={onLessonComplete} coins={lessonCoins} height={h} />;
  const practiceNode = <PracticePanel recent={src.recent} lessonState={lessonState} onLessonComplete={onLessonComplete} lessonCoins={lessonCoins} onReview={onOpenReview} onGoAnalysis={onGoAnalysis} loggedIn={!!uid} />;
  if (mobile) {
    return <SwipePager pages={[{ key: "lessons", node: lessonsNode("calc(100dvh - 196px)") }, { key: "practice", node: practiceNode }]} />;
  }
  const H = "calc(100dvh - 236px)";
  return (
    <FadeIn index={0} layout={false}>
      <div className="learn-dash" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)", gap: 20, height: H, minHeight: 520 }}>
        <div style={{ minHeight: 0, minWidth: 0 }}>{lessonsNode(H)}</div>
        <div className="learn-dash-scroll" style={{ minHeight: 0, minWidth: 0, overflowY: "auto", paddingRight: 4 }}>{practiceNode}</div>
      </div>
    </FadeIn>
  );
}
