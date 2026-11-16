// (v0.6.0, App.jsx 분할 · v0.7.3 quest.jsx → learn.jsx) 'learn'(학습 탭) 화면.
// (v0.7.6, 사용자 요청) 학습 탭 재구성 — 도감 첫 화면에 있던 레슨을 이 탭으로 옮기고, 이 탭을 차지하던 성장 분석·최근 대국은 분석 탭으로 옮겼다(growthHome.jsx).
//  대신 성장 분석의 약점 진단과 이어지는 "맞춤 학습"(실수 복습·추가 학습, practice.jsx)을 새로 둔다.
//  · 데스크톱: 왼쪽 레슨 경로 · 오른쪽 실수 복습·추가 학습(각각 안쪽 스크롤)
//  · 모바일: 옆으로 넘기는 2페이지 — 레슨 경로 / 실수 복습·추가 학습(SwipePager)
// (v0.7.8, 사용자 요청) 레슨 경로에 친구들의 진척도(프로필 사진) — 친구 공개 프로필의 lessonsDone(완료한 레슨 id 목록, App.jsx publishProfile)으로 각자 지금 할 레슨을 계산한다.
import { useEffect, useMemo, useState } from "react";
import { FadeIn, useNarrow } from "./common.jsx";
import { LessonPath } from "./lessons.jsx";
import { PracticePanel } from "./practice.jsx";
import { useRecentSources } from "./growthHome.jsx";
import { SwipePager } from "../components/swipePager.jsx";
import { SB_ON, sbSelect } from "../lib/supabaseClient.js";
import { allLessons } from "../lib/lessons/curriculum.js";

/** 친구들의 레슨 진척 — [{ id, username, photo, nextId }]. 공개 프로필에서 필요한 칸만 받는다(사진·완료 목록). */
export function friendNextLesson(doneIds) {
  const done = new Set(Array.isArray(doneIds) ? doneIds : []);
  const nx = allLessons().find((l) => !done.has(l.id));
  return nx ? nx.id : null;
}
function useFriendLessons(friendUids) {
  const ids = useMemo(() => [...new Set((friendUids || []).filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 60), [friendUids]);
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!SB_ON || !ids.length) { setRows([]); return undefined; }
    let off = false;
    sbSelect("profiles?select=id,username,photo:pub->>photo,lessonsDone:pub->lessonsDone&id=in.(" + ids.join(",") + ")")
      .then((r) => { if (off || !Array.isArray(r)) return; setRows(r.filter((x) => x && x.id && Array.isArray(x.lessonsDone) && x.lessonsDone.length).map((x) => ({ id: x.id, username: x.username || "", photo: typeof x.photo === "string" ? x.photo : "", nextId: friendNextLesson(x.lessonsDone) }))); })
      .catch(() => { if (!off) setRows([]); });
    return () => { off = true; };
  }, [ids.join(",")]);   // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}

export function LearnTab({ user, uid, friendUids, chesscom, ccName, lessonState, onLessonComplete, lessonCoins, onOpenReview, onGoAnalysis }) {
  const mobile = useNarrow(720);
  const src = useRecentSources({ user, uid, chesscom, ccName });
  const friends = useFriendLessons(friendUids);
  const lessonsNode = (h) => <LessonPath lessonState={lessonState} onComplete={onLessonComplete} coins={lessonCoins} height={h} friends={friends} />;
  const practiceNode = <PracticePanel recent={src.recent} onReview={onOpenReview} onGoAnalysis={onGoAnalysis} loggedIn={!!uid} uid={uid} />;
  if (mobile) {
    return <SwipePager pages={[{ key: "lessons", node: lessonsNode("calc(100dvh - 168px)") }, { key: "practice", node: practiceNode }]} />;
  }
  // (v0.7.8, 사용자 요청) 레슨 블록 영역을 세로로 더 길게 — 화면 아래 탭바 바로 위까지
  const H = "calc(100dvh - 176px)";
  return (
    <FadeIn index={0} layout={false}>
      <div className="learn-dash" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)", gap: 20, height: H, minHeight: 640 }}>
        <div style={{ minHeight: 0, minWidth: 0 }}>{lessonsNode("100%")}</div>
        <div className="learn-dash-scroll" style={{ minHeight: 0, minWidth: 0, overflowY: "auto", paddingRight: 4 }}>{practiceNode}</div>
      </div>
    </FadeIn>
  );
}
