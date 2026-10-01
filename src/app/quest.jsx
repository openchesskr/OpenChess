// (v0.6.0, App.jsx 분할) 'quest' 화면과 그 화면만 쓰는 조각
// 동작 변경 없이 App.jsx에서 그대로 옮겼다(REFACTOR_NOTES.md Phase 3 참고).
import { useState, useEffect, useMemo, useRef } from "react";
import { T, FILES } from "../lib/theme.js";
import { Check, RotateCcw, Lock, Play, Settings, X, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Trash2 } from "lucide-react";
import { SITE_FONT } from "../components/engineLines.jsx";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { boardFromSans, liveLegalDests, buildSan, stripSuffix } from "../lib/chessRules.js";
import { playMoveSfx } from "../lib/prefs.js";
import { Board, CONTENT, CoinIcon, DEFAULT_QUEST_OPENINGS, FadeIn, Mascot, isLessonClaimed, lessonProgress, mainQuestOverallProgress, questLabelNode, questOpeningMovesText, useBoardSize, useNarrow } from "./common.jsx";

// 다음 KST 자정까지 남은 밀리초
function msUntilKstMidnight(now) {
  now = now || new Date();
  const kst = now.getTime() + 9 * 3600e3;
  const nextMid = (Math.floor(kst / 86400e3) + 1) * 86400e3;
  return nextMid - kst;
}
// (버그) 각 활동 퀘스트를 개별적으로 하루 1회씩 리롤 — 다른 오프닝 플레이 퀘스트로 교체.
// 이미 완료(claimed)한 퀘스트나 이미 리롤한 퀘스트는 교체할 수 없다. 바꿀 오프닝이 없으면 그대로 둔다.
function rerollQuestOpening(dq, idx, recentOpenings) {
  if (!dq || !dq.quests) return dq;
  const rerolled = dq.rerolled || {};
  if (rerolled[idx]) return dq;                        // 이 퀘스트는 이미 리롤함
  if (dq.claimed && dq.claimed["cc_" + idx]) return dq; // 이미 완료한 퀘스트는 리롤 불가
  const q = dq.quests[idx];
  if (!q) return dq;
  const usedOpenings = dq.quests.filter((x) => x.type === "opening").map((x) => x.opening);
  const exclude = new Set([...(dq.banned || []), ...usedOpenings]);
  const pool = [...new Set([...(recentOpenings || []), ...DEFAULT_QUEST_OPENINGS])].filter(Boolean).filter((n) => !exclude.has(n));
  if (!pool.length) return dq;
  const next = pool[Math.floor(Math.random() * pool.length)];
  const quests = dq.quests.map((x, i) => (i === idx ? { type: "opening", opening: next } : x));
  const banned = q.type === "opening" ? [...(dq.banned || []), q.opening] : (dq.banned || []);
  return { ...dq, quests, banned, rerolled: { ...rerolled, [idx]: true } };
}
// (17차→18차) 일일 퀘스트 카드 — 학습 탭으로 분리. KST 자정 갱신 카운트다운, 오프닝 퀘스트 1회 리셋,
// 완료 표기는 학습 탭에 최초 진입할 때 애니메이션으로 공개(seen 플래그).
function fmtRemainHMS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 3600)).padStart(2, "0") + ":" + String(Math.floor((s % 3600) / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
function DailyQuestCard({ dailyQuest, setDailyQuest, recentOpenings, onOpenOpening, hasChesscom, highlight }) {
  const dq = dailyQuest;
  const [remain, setRemain] = useState(msUntilKstMidnight());
  useEffect(() => { const iv = setInterval(() => setRemain(msUntilKstMidnight()), 1000); return () => clearInterval(iv); }, []);
  // (버그 수정) questOpeningMovesText는 표에 없는 이름이면 오프닝 트리를 처음부터 훑는(BFS) 탐색을
  // 한다 — 이 카드는 갱신 카운트다운 때문에 1초마다 리렌더되므로, 매 렌더마다 다시 돌리지 않도록
  // 퀘스트 목록이 실제로 바뀔 때만(리롤·자정 갱신) 계산해 둔다.
  const openingMovesTexts = useMemo(() => (dq && dq.quests ? dq.quests.map((q) => q.type === "opening" ? questOpeningMovesText(q.opening) : null) : []), [dq && dq.quests]);
  // (UX1) 완료됐지만 아직 확인(seen)하지 않은 퀘스트 — 진입 직후엔 미완료처럼 보여주다가 잠시 후
  // 클리어 애니메이션과 함께 완료 상태로 전환하고, 애니메이션이 끝나면 seen으로 기록한다.
  const [revealed, setRevealed] = useState({});
  useEffect(() => {
    if (!dq) return;
    const keys = ["puzzle", "dailypuzzle", "cc_0", "cc_1", "cc_2"].filter((k) => dq.claimed[k] && !(dq.seen || {})[k]);
    if (!keys.length) return;
    const t1 = setTimeout(() => setRevealed((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, true])) })), 400);
    const t2 = setTimeout(() => setDailyQuest((d) => d ? { ...d, seen: { ...(d.seen || {}), ...Object.fromEntries(keys.map((k) => [k, true])) } } : d), 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [dq && dq.date, dq && JSON.stringify(dq.claimed)]);
  if (!dq) return null;
  const seen = dq.seen || {};
  const shownDone = (k) => dq.claimed[k] && (seen[k] || revealed[k]);
  const clearing = (k) => revealed[k] && !seen[k];
  const allDone = dq.claimed.puzzle && dq.claimed.dailypuzzle && [0, 1, 2].every((i) => dq.claimed["cc_" + i]);
  // (사용자 요청) 분석 탭 퀘스트 배지를 눌러 들어왔을 때, 해당 오프닝 퀘스트 줄에 눈에 띄는 하이라이트
  // 애니메이션을 재생하고 화면에 보이도록 스크롤한다. ref 콜백에서 마운트 시점에 한 번만 처리한다.
  const row = (k, label, sub, extras, highlighted) => { const done = shownDone(k); return (
    <div ref={highlighted ? (el) => el && el.scrollIntoView({ behavior: "smooth", block: "center" }) : undefined}
      className="flex items-center gap-2" style={{ padding: "7px 10px", borderRadius: 9, background: done ? "rgba(63,122,58,.12)" : "rgba(0,0,0,.035)", border: "1px solid " + (highlighted ? T.brass : done ? "rgba(63,122,58,.35)" : "#DCCBA8"), transition: "background .5s ease, border-color .5s ease", animation: highlighted ? "questRowHighlight 1.7s ease-out 2" : clearing(k) ? "questclear 1.2s ease" : "none" }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: done ? T.best : "transparent", border: "1.5px solid " + (done ? T.best : T.inkSoft), transition: "background .4s ease" }}>{done && <Check size={12} color="#fff" />}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: done ? T.best : T.ink }}>{label}</div>
        {sub && <div style={{ fontSize: 10.5, color: T.inkSoft }}>{sub}</div>}
      </div>
      {extras}
      {/* (v0.1.2) 개별 퀘스트 클리어 보상을 XP에서 OC 나이트 코인으로 바꿈. */}
      <span className="flex items-center gap-1" style={{ fontSize: 10.5, fontWeight: 800, color: "#8A6A2F", flexShrink: 0 }}>+10 <CoinIcon size={16} /></span>
    </div>
  ); };
  return (
    <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: T.paper, border: "1px solid #DCCBA8" }}>
      <div className="flex items-center justify-between flex-wrap" style={{ marginBottom: 10, gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>일일 퀘스트</div>
        <div className="flex items-center gap-2">
          {allDone && <span style={{ fontSize: 10.5, fontWeight: 800, color: T.best }}>모두 완료</span>}
          {/* (UX2) 갱신은 한국 시간(KST) 자정 기준 */}
          <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: SITE_FONT, color: T.inkSoft, background: "rgba(0,0,0,.06)", borderRadius: 6, padding: "2px 8px" }}>갱신까지 {fmtRemainHMS(remain)}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {row("puzzle", "새 퍼즐 " + dq.puzzleTarget + "회 풀기", dq.puzzleCount + "/" + dq.puzzleTarget)}
        {/* (v0.2.2 UI#4) 두 번째 퀘스트는 항상 '오늘의 퍼즐 풀기'로 고정 — 퍼즐 탭 맨 위 오늘의 퍼즐을 풀면 완료된다. */}
        {row("dailypuzzle", "일일 퍼즐 풀기", "퍼즐 탭 맨 위 ‘일일 퍼즐’ 풀기")}
        {(dq.quests || []).map((q, i) => {
          const isOpening = q.type === "opening";
          // (버그) 각 퀘스트를 개별적으로 1회씩 리롤 — 이미 리롤했거나 이미 완료한 퀘스트는 불가.
          const canReroll = !((dq.rerolled || {})[i]) && !dq.claimed["cc_" + i];
          const highlighted = isOpening && !!highlight && highlight.opening === q.opening;
          return (
            // (사용자 요청) key에 highlight.nonce를 섞어, 같은 오프닝을 배지로 연달아 눌러도 매번
            // 새로 마운트되어 하이라이트 애니메이션이 다시 재생되게 한다.
            <div key={i + (highlighted ? "-" + highlight.nonce : "")} onClick={() => isOpening && onOpenOpening && onOpenOpening(q.opening)} className={isOpening ? "press" : undefined} style={{ cursor: isOpening ? "pointer" : "default" }}>
              {row("cc_" + i, questLabelNode(q), !hasChesscom ? "설정에서 chess.com 계정 연동 필요" : (isOpening ? openingMovesTexts[i] : null),
                /* 이 퀘스트만 다른 오프닝 플레이 퀘스트로 교체(퀘스트당 1회) — 교체된 오프닝은 그날 다시 안 나옴 */
                canReroll ? (
                  <button onClick={(e) => { e.stopPropagation(); setDailyQuest((d) => rerollQuestOpening(d, i, recentOpenings)); }} className="press" title="이 퀘스트만 교체 (퀘스트당 1회)"
                    style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 7, border: "1px solid #DCCBA8", background: "rgba(0,0,0,.04)", color: "#8A6A2F", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><RotateCcw size={12} /></button>
                ) : null, highlighted)}
            </div>
          );
        })}
      </div>
      {/* (버그) 모든 퀘스트 완료 보상 — 일일 퀘스트 목록 아래 별도 블록으로 시각화(OC 나이트 코인 50) */}
      {(() => {
        const doneCount = (dq.claimed.puzzle ? 1 : 0) + (dq.claimed.dailypuzzle ? 1 : 0) + [0, 1, 2].filter((i) => dq.claimed["cc_" + i]).length;
        return (
          <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, border: "1px solid " + (allDone ? "rgba(63,122,58,.5)" : T.brass), background: allDone ? "rgba(63,122,58,.1)" : "rgba(196,154,80,.1)", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ position: "relative", flexShrink: 0 }}><CoinIcon size={46} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: allDone ? T.best : "#8A6A2F" }}>모든 퀘스트 완료 보상</div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>OC 나이트 코인 <b style={{ color: "#8A6A2F" }}>50개</b> · {doneCount}/5 완료</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, flexShrink: 0, color: allDone ? T.best : T.inkSoft }}>{allDone ? (dq.bonusClaimed ? "획득 완료" : "획득") : "잠김"}</span>
          </div>
        );
      })()}
    </div>
  );
}
/* ============================================================ 레슨 (v0.4.0 메인 퀘스트 전면 개편) ============================================================ */
// (사용자 요청) 메인 퀘스트(사지선다 챕터 나열)를 체스 개념·오프닝 하나하나를 다루는 독립된 학습
// 콘텐츠 "레슨"으로 전면 개편 — 레슨은 CONTENT.lessons(seedLessons 참고)에 parent로 서로 연결되어
// 갈래를 갖는 나무를 이루고, 도감 오프닝 모식도와 같은 원리로 선행 레슨을 완료(보상 수령)해야 다음
// 레슨이 열린다. 화면은 LessonMap(나무 모양 로드맵)에서 노드를 눌러 LessonScreen(듀오링고 스타일
// 전체화면 학습 화면)을 열고, 개발자는 LessonEditor(CMS)로 레슨·단계를 직접 입력·수정·삭제한다.
// (v0.4.1 다중 선행 레슨) 레슨은 원래 parent(선행 레슨 key 하나)로만 이어져 엄격한 나무 구조였지만,
// 서로 다른 갈래(예: 두 개의 다른 오프닝 라인)가 하나의 레슨(예: "엔드게임 기초")으로 다시 합류할 수
// 있도록 parents(선행 레슨 key 배열)를 지원한다. 기존에 이미 시드되었거나 저장된 레슨은 여전히 단수
// parent 필드를 쓸 수 있으므로, 이 헬퍼로 정규화해서 어디서든 lesson.parent/lesson.parents를 직접
// 읽지 않고 항상 lessonParents(lesson)을 통해 배열로 다룬다. parents가 있으면 그것을 쓰고, 없으면
// parent(있다면)를 배열로 감싸고, 둘 다 없으면 빈 배열(최상위 레슨)을 반환한다.
function lessonParents(lesson) {
  if (!lesson) return [];
  if (Array.isArray(lesson.parents)) return lesson.parents;
  return lesson.parent ? [lesson.parent] : [];
}
// 레슨 key의 (간접 포함) 하위 레슨 집합 — LessonEditor에서 순환(사이클) 방지용으로 쓴다.
function lessonDescendants(key, lessons) {
  const seen = new Set();
  const stack = [key];
  while (stack.length) {
    const id = stack.pop();
    for (const cid of Object.keys(lessons)) {
      if (!seen.has(cid) && lessonParents(lessons[cid]).includes(id)) { seen.add(cid); stack.push(cid); }
    }
  }
  return seen;
}
// 선행 레슨(parents)이 없으면 처음부터 해금, 있으면 그 선행 레슨들을 "전부" 완료(보상 수령)해야
// 해금된다(AND 조건) — 서로 다른 갈래가 하나의 레슨으로 다시 합류하는 경우, 두 갈래를 모두 끝내야
// 그 다음 레슨이 열리는 게 자연스럽기 때문이다.
function isLessonUnlocked(mainQuest, key) {
  const l = CONTENT.lessons[key];
  if (!l) return false;
  const parents = lessonParents(l).filter((p) => CONTENT.lessons[p]);
  if (!parents.length) return true;
  return parents.every((p) => isLessonClaimed(mainQuest, p));
}
function lessonNodeState(mainQuest, key) {
  if (!isLessonUnlocked(mainQuest, key)) return "locked";
  if (isLessonClaimed(mainQuest, key)) return "done";
  return lessonProgress(mainQuest, key).done > 0 ? "progress" : "available";
}
// (기능, v0.4.1 다중 선행 레슨 대응) 갈래가 갈라졌다가 다시 합류할 수 있는 모식도(DAG) 레이아웃.
// 더 이상 parent 하나만 가정한 "타이디 트리"가 아니라, 레슨마다 parents(여러 선행 레슨)를 가질 수
// 있다는 전제로 다시 짰다:
//   1) row(세로 위치) = 그 레슨으로 이어지는 가장 긴 경로의 길이 — "부모의 row 중 최댓값 + 1"로
//      계산해서, 합류 지점이 항상 자신의 모든 부모보다 아래(row가 큰 쪽)에 그려지도록 보장한다.
//      최상위(parents 없음) 레슨은 row 0. 위상정렬(Kahn) 순서로 계산해서 순환이 있어도 멈추지 않는다.
//   2) col(가로 위치)는 층(row)별로 배치한다 — 0행은 왼쪽부터 순서대로, 그 다음 행부터는 각 레슨을
//      "자신의 부모들 col 평균"에 최대한 가깝게 놓되(합류/분기 선이 시각적으로 자연스럽도록), 같은
//      행 안에서 겹치면 원래 순서를 유지한 채 오른쪽으로 밀어 겹침을 해소한다.
function layoutLessonTree(lessons) {
  const ids = Object.keys(lessons);
  const parentsOf = {}, childrenOf = {};
  for (const id of ids) {
    const ps = lessonParents(lessons[id]).filter((p) => lessons[p] && p !== id);
    parentsOf[id] = ps;
    for (const p of ps) (childrenOf[p] = childrenOf[p] || []).push(id);
  }
  const roots = ids.filter((id) => parentsOf[id].length === 0);

  // --- row: longest-path-from-any-root, via Kahn topological order (also tolerates accidental cycles) ---
  const row = {};
  const indeg = {};
  for (const id of ids) indeg[id] = parentsOf[id].length;
  let frontier = ids.filter((id) => indeg[id] === 0);
  frontier.forEach((id) => (row[id] = 0));
  while (frontier.length) {
    const next = [];
    for (const id of frontier) {
      for (const c of childrenOf[id] || []) {
        row[c] = Math.max(row[c] || 0, row[id] + 1);
        if (--indeg[c] === 0) next.push(c);
      }
    }
    frontier = next;
  }
  // leftover ids only happen if there's an actual cycle (shouldn't occur — editor blocks it) — place
  // them one row below the deepest known row so they still render instead of silently vanishing.
  let maxKnownRow = 0;
  for (const id of ids) if (row[id] !== undefined) maxKnownRow = Math.max(maxKnownRow, row[id]);
  for (const id of ids) if (row[id] === undefined) row[id] = maxKnownRow + 1;

  // --- col: layer by layer, top-left root sprawling down-right — each node snaps to the RIGHTMOST of
  // its parents' cols (rather than the average) so a branch point never pulls its children back toward
  // the left, then any same-row collision is pushed further right. Combined with "row = depth" this
  // makes the whole map grow diagonally toward the bottom-right as it branches, instead of a centered
  // symmetric tree — the root stays pinned at (row 0, col 0).
  const byRow = {};
  for (const id of ids) (byRow[row[id]] = byRow[row[id]] || []).push(id);
  const maxRow = ids.length ? Math.max(...ids.map((id) => row[id])) : 0;
  const pos = {};
  (byRow[0] || []).forEach((id, i) => (pos[id] = { row: 0, col: i }));
  for (let r = 1; r <= maxRow; r++) {
    const nodes = byRow[r] || [];
    const desired = nodes.map((id) => {
      const ps = parentsOf[id];
      if (!ps.length) return 0;
      return Math.max(...ps.map((p) => (pos[p] ? pos[p].col : 0)));
    });
    // place in order of desired col (stable on ties) so converging/diverging edges stay visually sane,
    // then push anything that collides strictly to the right of the previous node in that order.
    const order = nodes.map((_, i) => i).sort((a, b) => desired[a] - desired[b] || a - b);
    const col = new Array(nodes.length);
    let lastCol = -Infinity;
    for (const i of order) {
      const c = Math.max(desired[i], lastCol + 1);
      col[i] = c;
      lastCol = c;
    }
    nodes.forEach((id, i) => (pos[id] = { row: r, col: col[i] }));
  }
  let maxCol = 0;
  for (const id of ids) if (pos[id]) maxCol = Math.max(maxCol, pos[id].col);
  return { pos, childrenOf, roots, maxRow, maxCol };
}
// (v0.4.2 UI) 노드를 "원형 아이콘 버튼 + 아래쪽 캡션" 대신 가로로 넓은 직사각형 카드로 바꿨다 —
// 왼쪽에 상태 아이콘(자물쇠/재생/체크) 배지, 오른쪽에 레슨 이름과 보상을 한 카드 안에 담는다.
const LESSON_CARD_W = 208, LESSON_CARD_H = 58, LESSON_BADGE_D = 38;
const LESSON_COL_W = 232, LESSON_ROW_H = 92;
const LESSON_NODE_STYLE = {
  locked: { bg: "linear-gradient(180deg,#E9DEC2,#D9C69C)", border: "#C2AD82", color: "#8A7A5E", badgeBg: "rgba(138,122,94,.16)", ring: null },
  available: { bg: "linear-gradient(180deg," + T.brass + ",#A8842F)", border: "#F0D89A", color: "#241509", badgeBg: "rgba(36,21,9,.14)", ring: "rgba(196,154,80,.4)" },
  progress: { bg: "linear-gradient(180deg," + T.brass + ",#A8842F)", border: "#F0D89A", color: "#241509", badgeBg: "rgba(36,21,9,.14)", ring: "rgba(196,154,80,.4)" },
  done: { bg: "linear-gradient(180deg,#59A455,#3F7A3A)", border: "#9BE39B", color: "#EAF7E6", badgeBg: "rgba(234,247,230,.2)", ring: "rgba(63,122,58,.35)" },
};
function LessonNode({ id, lesson, state, x, y, onOpen, canEdit, onEdit }) {
  const s = LESSON_NODE_STYLE[state];
  return (
    <div style={{ position: "absolute", left: x, top: y, width: LESSON_CARD_W, height: LESSON_CARD_H }}>
      <button onClick={() => state !== "locked" && onOpen(id)} disabled={state === "locked"} className={state === "locked" ? "" : "press"}
        title={lesson.title}
        style={{ width: "100%", height: "100%", borderRadius: 16, border: "3px solid " + s.border, background: s.bg, color: s.color,
          display: "flex", alignItems: "center", gap: 10, padding: "0 12px 0 0", cursor: state === "locked" ? "default" : "pointer", textAlign: "left",
          boxShadow: s.ring ? "0 0 0 5px " + s.ring + ", 0 3px 8px rgba(90,58,34,.25)" : "0 3px 8px rgba(90,58,34,.25)" }}>
        <span style={{ width: LESSON_BADGE_D, height: LESSON_BADGE_D, borderRadius: 12, background: s.badgeBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 10 }}>
          {state === "locked" ? <Lock size={19} /> : state === "done" ? <Check size={22} /> : <Play size={19} fill={s.color} />}
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: state === "locked" ? T.inkSoft : s.color, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "keep-all" }}>{lesson.title}</span>
          {state !== "locked" && (
            <span className="flex items-center gap-1" style={{ fontSize: 9.5, fontWeight: 800, color: state === "done" ? "rgba(234,247,230,.85)" : "rgba(36,21,9,.7)" }}><CoinIcon size={11} /> {lesson.reward || 60}</span>
          )}
        </span>
      </button>
      {canEdit && <button onClick={(e) => { e.stopPropagation(); onEdit(id); }} className="press" title="레슨 편집" style={{ width: 18, height: 18, borderRadius: 5, border: "1px solid #DCCBA8", background: "rgba(255,255,255,.85)", color: T.inkSoft, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", position: "absolute", top: -6, right: -6, zIndex: 1 }}><Settings size={10} /></button>}
    </div>
  );
}
// (v0.4.0 UI) 메인 퀘스트 전면 개편 — 챕터 아코디언 목록 대신, 갈래를 갖는 모식도(나무) 형태의
// 레슨 로드맵을 보여준다. 선행 레슨(parents)을 모두 완료해야 그 아래 레슨이 해금된다.
function LessonMap({ mainQuest, onAnswer, onClaim, canEdit, bumpContent, contentVer }) {
  const [openKey, setOpenKey] = useState(null);
  const [editKey, setEditKey] = useState(null);
  // (v0.4.0 기능) 사용자 요청 — 레슨 화면도 브라우저 뒤로가기로 닫히게 한다. App 최상위의 screens
  // 배열을 그대로 재사용하되(별도 이름 "lesson"), 이 컴포넌트는 App과 별개로 독립적으로 마운트되므로
  // App의 pushScreen/popScreen을 prop으로 받는 대신 여기서 자체 popstate 리스너를 둔다(프롬프트가
  // 언급한 "스코프가 좁은 리스너를 따로 두는" 방식).
  const prevOpenKeyRef = useRef(null);
  useEffect(() => {
    try {
      const was = prevOpenKeyRef.current;
      if (!was && openKey) {
        const cur = (window.history.state && window.history.state.screens) || [];
        if (!cur.includes("lesson")) window.history.pushState({ ...(window.history.state || {}), screens: [...cur, "lesson"] }, "", window.location.pathname);
      } else if (was && !openKey) {
        const cur = (window.history.state && window.history.state.screens) || [];
        if (cur.includes("lesson")) window.history.back();
      }
    } catch { }
    prevOpenKeyRef.current = openKey;
  }, [openKey]);
  useEffect(() => {
    const onPop = () => {
      const screens = (window.history.state && window.history.state.screens) || [];
      if (!screens.includes("lesson")) setOpenKey(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const layout = useMemo(() => layoutLessonTree(CONTENT.lessons), [contentVer]);
  const ids = useMemo(() => Object.keys(CONTENT.lessons).filter((id) => layout.pos[id]), [layout]);
  // (v0.4.2) 카드가 넓은 직사각형이 되면서, 루트가 좌상단에 고정되고 갈래가 늘어날수록 우하단으로
  // 뻗어나가는 대각선 형태가 됐다 — 컨테이너 크기도 그 최대 col/row + 카드 한 장 크기만큼 잡는다.
  const nodeX = (id) => layout.pos[id].col * LESSON_COL_W + 14;
  const nodeY = (id) => layout.pos[id].row * LESSON_ROW_H + 10;
  const width = (layout.maxCol) * LESSON_COL_W + LESSON_CARD_W + 28;
  const height = (layout.maxRow) * LESSON_ROW_H + LESSON_CARD_H + 20;
  const overall = useMemo(() => mainQuestOverallProgress(mainQuest), [mainQuest, contentVer]);
  // 루트는 항상 좌상단(col 0)에 고정되므로, 마운트 시 지금 도전할 만한(해금됐고 아직 다 못 깬)
  // 레슨—없으면 첫 최상위 레슨—이 뷰포트 안에 들어오도록만 가로로 스크롤해 준다.
  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !ids.length) return;
    const frontier = ids.find((id) => { const st = lessonNodeState(mainQuest, id); return st === "available" || st === "progress"; }) || layout.roots[0] || ids[0];
    if (!frontier || !layout.pos[frontier]) return;
    const targetX = nodeX(frontier) + LESSON_CARD_W / 2;
    el.scrollLeft = Math.max(0, targetX - el.clientWidth / 2);
  }, [layout, ids.length]);
  return (
    <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: T.paper, border: "1px solid #DCCBA8" }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>레슨</span>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: T.inkSoft, marginLeft: "auto" }}>{overall.claimed}/{overall.totalChapters} 완료</span>
      </div>
      <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 10 }}>체스 개념과 오프닝 학습 코스. 갈래를 따라 순서대로 해금</div>
      {ids.length === 0 ? (
        <div style={{ fontSize: 12, color: T.inkSoft, padding: "16px 0", textAlign: "center" }}>등록된 레슨 없음</div>
      ) : (
        <div ref={scrollRef} style={{ overflowX: "auto", overflowY: "hidden", WebkitOverflowScrolling: "touch" }}>
          <div style={{ position: "relative", width, height }}>
            <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {ids.flatMap((id) => {
                const lesson = CONTENT.lessons[id];
                const parents = lessonParents(lesson).filter((p) => layout.pos[p]);
                return parents.map((p) => {
                  const claimed = isLessonClaimed(mainQuest, p);
                  // 카드가 넓은 직사각형이라 부모 카드 아래쪽 중앙에서 자식 카드 위쪽 중앙으로 잇는다 —
                  // 열이 다르면 자연히 대각선으로 우하단을 향해 기울어져 보인다.
                  return <line key={p + "->" + id} x1={nodeX(p) + LESSON_CARD_W / 2} y1={nodeY(p) + LESSON_CARD_H} x2={nodeX(id) + LESSON_CARD_W / 2} y2={nodeY(id)}
                    stroke={claimed ? "rgba(63,122,58,.55)" : "rgba(196,154,80,.55)"} strokeWidth={4} strokeLinecap="round" />;
                });
              })}
            </svg>
            {ids.map((id) => (
              <LessonNode key={id} id={id} lesson={CONTENT.lessons[id]} state={lessonNodeState(mainQuest, id)}
                x={nodeX(id)} y={nodeY(id)} onOpen={setOpenKey} canEdit={canEdit} onEdit={setEditKey} />
            ))}
          </div>
        </div>
      )}
      {canEdit && <button onClick={() => setEditKey("__new__")} className="press" style={{ marginTop: 10, fontSize: 11, fontWeight: 800, padding: "6px 10px", borderRadius: 8, border: "1px dashed " + T.brass, background: "transparent", color: "#8A6A2F", cursor: "pointer" }}>+ 새 레슨 추가</button>}
      {openKey && CONTENT.lessons[openKey] && <LessonScreen lessonKey={openKey} lesson={CONTENT.lessons[openKey]} mainQuest={mainQuest} onAnswer={onAnswer} onClaim={onClaim} onClose={() => setOpenKey(null)} />}
      {editKey && <LessonEditor lessonKey={editKey} bumpContent={bumpContent} onClose={() => setEditKey(null)} />}
    </div>
  );
}
// (기능) 알파벳 좌표("e4") → 보드 배열 좌표([r,c]). 레슨 스텝의 arrows/highlight 저작에 쓴다.
function lessonSq(name) { return [8 - parseInt(name[1], 10), FILES.indexOf(name[0])]; }
function lessonWait(ms) { return new Promise((res) => setTimeout(res, ms)); }
// 원칙 목록이 한 줄씩 아래에서 떠오르며 밝아졌다가, 화면 중앙에서 잠깐 완전히 선명하게 멈춘 뒤
// 다시 위로 빠르게 올라가며 사라지는 연출 — 전부 재생되면 자동으로 다음 스크립트 단계로 넘어간다.
function PrinciplesReel({ lines, onDone }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (idx >= lines.length) { const t = setTimeout(onDone, 250); return () => clearTimeout(t); }
    const t = setTimeout(() => setIdx((i) => i + 1), 1350);
    return () => clearTimeout(t);
  }, [idx, lines.length]);
  return (
    <div style={{ position: "relative", flex: "1 1 auto", minHeight: 130, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <AnimatePresence>
        {idx < lines.length && (
          <motion.div key={idx}
            initial={{ opacity: 0, y: 46 }}
            animate={{ opacity: [0, 1, 1, 0], y: [46, 0, 0, -46] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.25, times: [0, 0.3, 0.72, 1], ease: "easeInOut" }}
            style={{ position: "absolute", fontSize: 13.5, fontWeight: 800, color: T.ink, textAlign: "center", padding: "0 14px", lineHeight: 1.45, maxWidth: 440 }}>
            {lines[idx]}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
// 보드 위 연출 오버레이 — dim(강조 칸만 남기고 나머지 음영), siren(칸이 붉게 사이렌처럼 깜빡임).
// 금색 강조(glow)는 Board 자체의 haloSquares를 그대로 재사용한다(아래 LessonScreen 참고).
// (버그 수정) 이전엔 이 오버레이를 Board 바깥 wrapper 기준 절대 좌표(size/8 등 직접 계산)로 그렸는데,
// Board 자체는 그 wrapper 안에 padding·테두리·(showEval일 때) 평가치 막대까지 더해서 그려지므로
// 실제 8x8 격자는 그만큼 안쪽으로 밀려 있다 — 그 여백을 빼먹어 강조 칸이 실제 기물 칸과 어긋났다.
// createPortal로 이 오버레이를 Board의 실제 격자 DOM(gridRef로 넘겨받음) "안"에 직접 그려 넣으면,
// 그 격자 자신이 이미 8x8 정사각형이므로 12.5% 단위 퍼센트 좌표만으로 항상 정확히 들어맞는다
// (Board가 보드 위 반짝임 효과(gm-board-shine)에 쓰는 것과 같은 방식 — 절대 위치 자식은 grid
// 레이아웃에서 빠지므로 실제 64칸 배치에 영향을 주지 않는다).
function LessonBoardFx({ gridEl, flip, dimKeep, siren }) {
  if (!gridEl || (!dimKeep && !siren)) return null;
  const cells = [];
  const view = (r, c) => (flip ? [7 - r, 7 - c] : [r, c]);
  if (dimKeep) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (dimKeep.has(r + "," + c)) continue;
      const [vr, vc] = view(r, c);
      cells.push(<div key={"d" + r + "_" + c} style={{ position: "absolute", left: (vc * 100) / 8 + "%", top: (vr * 100) / 8 + "%", width: 100 / 8 + "%", height: 100 / 8 + "%", background: "rgba(20,12,4,.5)" }} />);
    }
  }
  if (siren) {
    const [vr, vc] = view(siren[0], siren[1]);
    cells.push(<div key="siren" style={{ position: "absolute", left: (vc * 100) / 8 + "%", top: (vr * 100) / 8 + "%", width: 100 / 8 + "%", height: 100 / 8 + "%", background: "#E5342A", animation: "lessonSiren .7s ease-in-out infinite" }} />);
  }
  return createPortal(<div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{cells}</div>, gridEl);
}
/* ============================================================ 레슨 화면 (듀오링고 스타일 스크립트 플레이어) ============================================================ */
// (사용자 요청) 모든 레슨은 여러 개의 "페이지"를 순서대로 진행하며, 이미 지나온 페이지는 뒤로 가서
// 다시 볼 수 있다. 페이지 하나는 정해진 스크립트(beats)가 순서대로 진행되는 연출 — 코치의 대사(한
// 줄씩 타이핑되며 눌러서 다음으로), 객관식·주관식 퀴즈, 보드 위 수순 재생, 칸 하이라이트·음영·
// 사이렌 효과 등을 자유롭게 섞어 구성한다. beat 종류는 lesson.pages[].beats 정의부(seedLessons)의
// 주석을 참고.
function LessonScreen({ lessonKey, lesson, mainQuest, onAnswer, onClaim, onClose }) {
  const narrow = useNarrow(860);
  const claimedAlready = isLessonClaimed(mainQuest, lessonKey);
  const pages = lesson.pages;
  // (기능) 이미 완료(보상 수령)한 레슨은 처음부터 복습, 진행 중인 레슨은 아직 못 본 첫 페이지부터.
  const initialPage = useMemo(() => {
    if (claimedAlready) return 0;
    const answered = ((mainQuest && mainQuest.answered) || {})[lessonKey] || {};
    for (let i = 0; i < pages.length; i++) if (!answered[i]) return i;
    return pages.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonKey]);
  // (기능) 지금까지 실제로 열어 본 가장 뒤쪽 페이지 — 진행 중인 레슨은 여기까지만 "다음 페이지"로
  // 건너뛸 수 있다(뒤로 가서 이미 본 페이지를 다시 보는 건 언제든 가능).
  const [farthest, setFarthest] = useState(claimedAlready ? pages.length - 1 : initialPage);
  const [pageIdx, setPageIdx] = useState(initialPage);
  const [beatIdx, setBeatIdx] = useState(0);
  const [runningSans, setRunningSans] = useState(() => (pages[initialPage] && pages[initialPage].startSans) || []);
  const [fx, setFx] = useState({ dimKeep: null, siren: null, glow: null, arrows: null });
  const [typedLen, setTypedLen] = useState(0);
  const [lastSay, setLastSay] = useState(null);   // 마지막 코치 대사 — play/pause/board 연출 중에도 말풍선을 비우지 않기 위해 유지
  const [mcPicked, setMcPicked] = useState(null);
  const [mcFeedback, setMcFeedback] = useState(null);
  const [moveSel, setMoveSel] = useState(null);
  const [moveWrongSq, setMoveWrongSq] = useState(null);
  const [moveDone, setMoveDone] = useState(false);
  // (v0.5.5) 맞힌 수 — 보드에 그 수를 두어 보이고 "최선의 수" 이펙트를 띄운다(다음 대사·페이지로 넘어가면 지운다).
  const [doneMove, setDoneMove] = useState(null); // { san, to }
  const lessonDone = pageIdx >= pages.length;
  const page = !lessonDone ? pages[pageIdx] : null;
  const beats = page ? page.beats : [];
  const beat = page && beatIdx < beats.length ? beats[beatIdx] : null;
  const pageBeatsDone = !!page && beatIdx >= beats.length;
  const flip = !!(page && page.flip);
  const goToPage = (idx) => {
    if (idx < 0 || idx >= pages.length) return;
    setPageIdx(idx); setBeatIdx(0);
    setRunningSans((pages[idx] && pages[idx].startSans) || []);
    setFx({ dimKeep: null, siren: null, glow: null, arrows: null });
    setLastSay(null); setTypedLen(0); setMcPicked(null); setMcFeedback(null); setMoveSel(null); setMoveWrongSq(null); setMoveDone(false); setDoneMove(null);
  };
  const advanceBeat = () => {
    setBeatIdx((i) => i + 1);
    setTypedLen(0); setMcPicked(null); setMcFeedback(null); setMoveSel(null); setMoveWrongSq(null); setMoveDone(false); setDoneMove(null);
  };
  // 이 beat가 즉시 위치를 지정하면(sans) 재생 없이 그 자리로 바로 전환한다.
  useEffect(() => {
    if (beat && beat.sans) setRunningSans(beat.sans);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIdx, beatIdx]);
  // beat별 자동 진행 — 타이핑·선택을 기다리는 say/mc/move는 각자의 처리부(아래)에서 다룬다.
  useEffect(() => {
    if (!beat) return;
    if (beat.kind === "pause") { const t = setTimeout(advanceBeat, beat.ms || 800); return () => clearTimeout(t); }
    if (beat.kind === "board") {
      setFx({
        dimKeep: beat.dim ? new Set((beat.squares || []).map((s) => (Array.isArray(s) ? s.join(",") : lessonSq(s).join(",")))) : null,
        siren: beat.siren ? (Array.isArray(beat.squares[0]) ? beat.squares[0] : lessonSq(beat.squares[0])) : null,
        glow: beat.glow ? (beat.squares || []).map((s) => (Array.isArray(s) ? s : lessonSq(s))) : null,
        arrows: (beat.arrows && beat.arrows.length) ? beat.arrows.map((a) => ({
          from: Array.isArray(a.from) ? a.from : lessonSq(a.from),
          to: Array.isArray(a.to) ? a.to : lessonSq(a.to),
          kind: a.type === "defender" ? "threatDefender" : "threatAttacker",
        })) : null,
      });
      const t = setTimeout(advanceBeat, 150);
      return () => clearTimeout(t);
    }
    if (beat.kind === "clear") { setFx({ dimKeep: null, siren: null, glow: null, arrows: null }); const t = setTimeout(advanceBeat, 100); return () => clearTimeout(t); }
    if (beat.kind === "play") {
      let cancelled = false;
      (async () => {
        for (const mv of beat.moves) {
          await lessonWait(beat.stepMs || 420);
          if (cancelled) return;
          setRunningSans((s) => [...s, mv]);
        }
        await lessonWait(250);
        if (!cancelled) advanceBeat();
      })();
      return () => { cancelled = true; };
    }
    if (beat.kind === "say") setLastSay({ speaker: beat.speaker || "milku", text: beat.text || "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIdx, beatIdx]);
  // say 대사 타이핑 애니메이션(한 글자씩).
  useEffect(() => {
    if (!beat || beat.kind !== "say") return;
    const text = beat.text || "";
    setTypedLen(0);
    if (!text.length) return;
    let i = 0;
    const iv = setInterval(() => { i++; setTypedLen(i); if (i >= text.length) clearInterval(iv); }, 26);
    return () => clearInterval(iv);
  }, [pageIdx, beatIdx]);
  // 페이지의 모든 beat를 다 봤으면 그 페이지를 완료로 기록 — onAnswer는 이미 답한 인덱스를 스스로
  // 걸러내므로(App의 onAnswerChapter) 다시 봐서 여기로 또 도달해도 안전하다.
  useEffect(() => {
    if (pageBeatsDone) onAnswer(lessonKey, pageIdx);
  }, [pageBeatsDone, pageIdx, lessonKey, onAnswer]);
  useEffect(() => { setFarthest((f) => Math.max(f, pageIdx)); }, [pageIdx]);
  const board = useMemo(() => boardFromSans(runningSans), [runningSans.join(",")]);
  const color = runningSans.length % 2 === 0 ? "w" : "b";
  const [boardSize, setBoardRef] = useBoardSize(narrow ? 480 : 640);
  // (버그 수정) 보드 연출 오버레이(LessonBoardFx)를 Board의 실제 8x8 격자 DOM 안에 그려 넣기 위한
  // 참조 — Board가 gridRef 콜백으로 그 DOM 노드를 알려주면 상태로 저장해 리렌더를 트리거한다.
  const [gridEl, setGridEl] = useState(null);
  // say beat 탭 처리 — 아직 다 안 타이핑됐으면 즉시 완성, 다 됐으면 다음 beat로.
  const onSayTap = () => {
    if (!beat || beat.kind !== "say") return;
    const len = (beat.text || "").length;
    if (typedLen < len) setTypedLen(len); else advanceBeat();
  };
  const pick = (oi) => {
    if (!beat || beat.kind !== "mc" || mcFeedback === "correct") return;
    setMcPicked(oi);
    if (oi === beat.answer) setMcFeedback("correct"); else setMcFeedback("wrong");
  };
  const legalTargets = (moveSel && beat && beat.kind === "move" && !moveDone) ? liveLegalDests(runningSans, moveSel[0], moveSel[1], color, board, null) : [];
  const doneBoard = useMemo(() => { if (!doneMove) return null; try { return boardFromSans([...runningSans, doneMove.san]); } catch { return null; } }, [doneMove, runningSans]);
  const attemptMove = (from, to) => {
    if (!beat || beat.kind !== "move" || moveDone) return;
    if (from[0] === to[0] && from[1] === to[1]) { setMoveSel(null); return; }
    if (!liveLegalDests(runningSans, from[0], from[1], color, board, null).some(([r, c]) => r === to[0] && c === to[1])) return;
    const san = buildSan(board, from[0], from[1], to[0], to[1], color, null);
    setMoveSel(null);
    if (!san) return;
    const ok = (beat.answers || []).some((a) => stripSuffix(a) === stripSuffix(san));
    if (ok) { setMoveDone(true); setDoneMove({ san, to }); playMoveSfx(san); }
    else { setMoveWrongSq(to); setTimeout(() => setMoveWrongSq(null), 700); }
  };
  const onSquareClick = (sq) => {
    if (!beat || beat.kind !== "move" || moveDone) return;
    const p = board[sq[0]][sq[1]];
    if (moveSel) {
      if (liveLegalDests(runningSans, moveSel[0], moveSel[1], color, board, null).some(([r, c]) => r === sq[0] && c === sq[1])) { attemptMove(moveSel, sq); return; }
      if (p && p.c === color) { setMoveSel(sq); return; }
      setMoveSel(null);
    } else if (p && p.c === color) setMoveSel(sq);
  };
  const claimAndClose = () => { if (!claimedAlready) onClaim(lessonKey); onClose(); };
  const isLastPage = pageIdx === pages.length - 1;
  const canGoNext = pageIdx < farthest || pageBeatsDone;
  const onNext = () => {
    if (pageIdx < farthest) { goToPage(pageIdx + 1); return; }
    if (isLastPage) { setPageIdx(pages.length); return; }
    goToPage(pageIdx + 1);
  };
  const onPrev = () => { if (pageIdx > 0) goToPage(pageIdx - 1); };
  const progressPct = lessonDone ? 100 : Math.round((100 * pageIdx) / Math.max(1, pages.length));
  // (버그 수정) boardPanel이 가로 폭 지정 없이 flex row의 자식으로만 있으면(내부 측정용 div가
  // width:100%를 자기 자신 기준으로 순환 참조하게 되어) 브라우저가 이 칸을 거의 내용 없는 최소
  // 크기로 접어버려, 데스크톱에서 보드가 작은 썸네일 크기로만 보이고 상호작용 영역이 그 옆이 아니라
  // 사실상 전체 폭을 차지하는 것처럼 보이는 문제가 있었다. 데스크톱에서는 이 패널에 실제 가로 폭
  // 비율(flexBasis)을 명시해 측정 기준을 만들어 주고, 보드 한 변이 세로 공간을 넘지 않도록
  // 뷰포트 높이 기준 상한(min())도 함께 건다 — 두 환경 모두 전체 화면 비율을 그대로 활용한다.
  const boardPanel = (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: narrow ? "12px 10px 4px" : "20px", boxSizing: "border-box",
      ...(narrow ? { width: "100%", flexShrink: 0 } : { flexBasis: "50%", flexShrink: 0, flexGrow: 0, height: "100%" }) }}>
      <div ref={setBoardRef} style={{ width: "100%", maxWidth: narrow ? "480px" : "min(640px, 82vh)", position: "relative" }}>
        <Board board={doneBoard || board} flip={flip} size={boardSize} showEval={false} gridRef={setGridEl}
          lastQ={doneMove && doneBoard ? { to: doneMove.to, kind: "best" } : null}
          interactive={!!beat && beat.kind === "move" && !moveDone}
          haloSquares={fx.glow || []}
          arrows={fx.arrows || []}
          selected={moveSel} legalTargets={legalTargets} onSquareClick={onSquareClick}
          onPieceDrag={(sq) => { if (beat && beat.kind === "move" && !moveDone) { const p = board[sq[0]][sq[1]]; if (p && p.c === color) setMoveSel(sq); } }}
          onDrop={(sq) => { if (moveSel) attemptMove(moveSel, sq); }}
          onMove={(from, to) => attemptMove(from, to)}
          wrongAt={moveWrongSq} />
        <LessonBoardFx gridEl={gridEl} flip={flip} dimKeep={fx.dimKeep} siren={fx.siren} />
      </div>
    </div>
  );
  const sayActive = beat && beat.kind === "say";
  const bubble = sayActive ? { speaker: beat.speaker || "milku", text: (beat.text || "").slice(0, typedLen), typing: typedLen < (beat.text || "").length }
    : (beat && (beat.kind === "mc" || beat.kind === "move")) ? { speaker: "milku", text: beat.prompt || "", typing: false }
    : lastSay ? { ...lastSay, typing: false } : null;
  const interactionPanel = (
    <div style={{ flex: 1, minWidth: 0, overflowY: "auto", display: "flex", flexDirection: "column", background: T.paper }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: narrow ? "10px 14px" : "18px 24px 8px", flexShrink: 0 }}>
        <button onClick={onClose} aria-label="닫기" className="press" style={{ width: 32, height: 32, borderRadius: 9, background: "#fff", color: T.ink, border: "1px solid #DCCBA8", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 4, gap: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lesson.title}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.inkSoft, flexShrink: 0, fontFamily: SITE_FONT }}>{lessonDone ? pages.length : pageIdx + 1} / {pages.length}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "rgba(0,0,0,.08)", overflow: "hidden", border: "1px solid #DCCBA8" }}>
            <div style={{ width: progressPct + "%", height: "100%", background: "linear-gradient(90deg,#8A6A2F," + T.brass + ")", transition: "width .4s ease" }} />
          </div>
        </div>
      </div>
      <div onClick={sayActive ? onSayTap : undefined} style={{ flex: 1, padding: narrow ? "8px 16px 16px" : "8px 28px 20px", display: "flex", flexDirection: "column", justifyContent: lessonDone ? "center" : "flex-start", cursor: sayActive ? "pointer" : "default" }}>
        {lessonDone ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: T.best, marginBottom: 8 }}>{claimedAlready ? "레슨 복습 완료" : "레슨 완료"}</div>
            {!claimedAlready && <div className="flex items-center justify-center gap-1" style={{ fontSize: 13, fontWeight: 800, color: "#8A6A2F", marginBottom: 16 }}><CoinIcon size={18} /> +{lesson.reward || 60} OC 나이트 코인</div>}
            <button onClick={claimAndClose} className="press" style={{ padding: "11px 22px", borderRadius: 11, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, border: "none", cursor: "pointer", fontSize: 13.5 }}>{claimedAlready ? "닫기" : "보상 받기"}</button>
          </div>
        ) : (
          <>
            {beat && beat.kind === "principles" ? (
              <PrinciplesReel lines={beat.lines} onDone={advanceBeat} />
            ) : bubble ? (
              // (사용자 요청) 말풍선이 상호작용 영역의 남는 세로 공간을 그냥 비워두지 않고 그 비율에
              // 맞게 꽉 채우도록 — flex:1로 늘어나 아래 퀴즈·안내 영역과 항상 균형 있게 공간을
              // 나눠 갖고(설명만 있는 스텝은 이 말풍선이 사실상 전부를 차지), 내용은 가운데 정렬한다.
              <div className="flex flex-col items-center" style={{ flex: "1 1 auto", minHeight: narrow ? "26vh" : "32vh", justifyContent: "center", gap: 14, textAlign: "center", background: "#fff", borderRadius: 16, padding: narrow ? "22px 18px" : "32px 40px", border: "1px solid #DCCBA8", marginBottom: 14, position: "relative", boxSizing: "border-box" }}>
                <Mascot name={bubble.speaker} emotion={mcFeedback === "correct" || moveDone ? "celebrate" : mcFeedback === "wrong" ? "surprise" : "great"} size={narrow ? 84 : 108} />
                <div style={{ minWidth: 0, maxWidth: 520 }}>
                  <div style={{ color: "#8A6A2F", fontSize: 12, fontWeight: 800, marginBottom: 6 }}>{bubble.speaker === "kokoa" ? "KOKOA" : "MILKU"} 코치</div>
                  <p style={{ color: T.ink, fontSize: narrow ? 15.5 : 18, lineHeight: 1.6, minHeight: "1.6em" }}>{bubble.text}{bubble.typing && <span style={{ animation: "lessonCaretBlink 1s step-end infinite" }}>▌</span>}</p>
                </div>
                {sayActive && !bubble.typing && <ChevronDown size={16} color={T.inkSoft} style={{ position: "absolute", bottom: 10, right: 14, animation: "dotbounceSm 1.1s ease-in-out infinite" }} />}
              </div>
            ) : null}
            {beat && beat.kind === "mc" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {beat.opts.map((op, oi) => {
                  const isPicked = mcPicked === oi;
                  const showCorrect = mcFeedback && oi === beat.answer;
                  const showWrong = mcFeedback === "wrong" && isPicked;
                  return (
                    <button key={oi} onClick={() => pick(oi)} disabled={mcFeedback === "correct"} className={mcFeedback ? "" : "press"}
                      style={{ textAlign: "left", padding: "11px 13px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.4, cursor: mcFeedback === "correct" ? "default" : "pointer",
                        border: "1.5px solid " + (showCorrect ? T.best : showWrong ? T.blunder : "#DCCBA8"),
                        background: showCorrect ? "rgba(63,122,58,.12)" : showWrong ? "rgba(200,80,80,.12)" : "#fff", color: T.ink }}>{op}</button>
                  );
                })}
                {mcFeedback === "wrong" && <div style={{ fontSize: 11.5, color: T.blunder, fontWeight: 700, marginTop: 6 }}>✕ 다른 설명. 다시 선택</div>}
                {mcFeedback === "correct" && (
                  <div style={{ marginTop: 6 }}>
                    {beat.note && <div style={{ fontSize: 11.5, color: T.best, fontWeight: 700, marginBottom: 8 }}>✓ {beat.note}</div>}
                    <button onClick={advanceBeat} className="press" style={{ width: "100%", padding: "10px 18px", borderRadius: 10, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, border: "none", cursor: "pointer", fontSize: 12.5 }}>다음</button>
                  </div>
                )}
              </div>
            )}
            {beat && beat.kind === "move" && (
              <div>
                {moveWrongSq && <div style={{ fontSize: 11.5, color: T.blunder, fontWeight: 700, marginBottom: 6 }}>✕ 다른 수. 보드를 다시 확인</div>}
                {!moveDone && !moveWrongSq && <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 8 }}>보드에서 기물을 눌러(또는 끌어서) 두기</div>}
                {moveDone && (
                  <>
                    {beat.note && <div style={{ fontSize: 11.5, color: T.best, fontWeight: 700, marginBottom: 8 }}>✓ {beat.note}</div>}
                    <button onClick={advanceBeat} className="press" style={{ width: "100%", padding: "10px 18px", borderRadius: 10, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, border: "none", cursor: "pointer", fontSize: 12.5 }}>다음</button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {!lessonDone && (
        <div className="flex items-center justify-between" style={{ padding: narrow ? "10px 16px 16px" : "10px 28px 22px", flexShrink: 0, gap: 10 }}>
          <button onClick={onPrev} disabled={pageIdx === 0} className={pageIdx === 0 ? "" : "press"}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: 10, border: "1px solid #DCCBA8", background: "#fff", color: pageIdx === 0 ? "#C9BBA0" : T.ink, fontWeight: 800, fontSize: 12, cursor: pageIdx === 0 ? "default" : "pointer" }}><ChevronLeft size={14} /> 이전</button>
          <button onClick={onNext} disabled={!canGoNext} className={canGoNext ? "press" : ""}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: 10, border: "none", background: canGoNext ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "#E4D5B4", color: canGoNext ? "#241509" : "#B7A57C", fontWeight: 800, fontSize: 12, cursor: canGoNext ? "pointer" : "default" }}>
            {isLastPage && pageBeatsDone ? "레슨 마치기" : "다음 페이지"} <ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: T.ivory, display: "flex", flexDirection: narrow ? "column" : "row", overflow: "hidden" }}>
      {boardPanel}
      {interactionPanel}
    </div>
  );
}
/* (v0.4.0) 개발자 전용 — 레슨의 제목·설명·보상·선행 레슨(parents)과 스텝(설명/객관식/주관식)을
   직접 입력·수정·삭제하는 CMS. 각 스텝의 포지션은 시작 위치부터의 수순(sans, 공백으로 구분)으로 지정한다. */
// (v0.4.0) beat 종류별 기본값 — kind를 바꿀 때 그 종류에 맞는 빈 틀로 갈아끼우는 용도.
// 필드 구성은 seedLessons 함수 위 주석(beat 스키마)을 그대로 따른다.
function defaultBeat(kind) {
  switch (kind) {
    case "say": return { kind, speaker: "milku", text: "" };
    case "principles": return { kind, lines: [] };
    case "mc": return { kind, prompt: "", opts: [], answer: 0, note: "" };
    case "move": return { kind, prompt: "", answers: [], note: "" };
    case "play": return { kind, moves: [], stepMs: 420 };
    case "pause": return { kind, ms: 800 };
    case "board": return { kind, squares: [], arrows: [] };
    case "clear": return { kind };
    default: return { kind: "say", speaker: "milku", text: "" };
  }
}
const LESSON_BEAT_KINDS = ["say", "principles", "mc", "move", "play", "pause", "board", "clear"];
const LESSON_BEAT_LABELS = { say: "대사 (say)", principles: "원칙 목록 (principles)", mc: "객관식 (mc)", move: "주관식 (move)", play: "자동 재생 (play)", pause: "대기 (pause)", board: "보드 연출 (board)", clear: "연출 초기화 (clear)" };
const lsField = { width: "100%", padding: "5px 7px", borderRadius: 6, border: "1px solid #C9B58C", fontSize: 11, marginBottom: 4, boxSizing: "border-box" };
const spaceToArr = (s) => s.trim() ? s.trim().split(/\s+/) : [];
const linesToArr = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
// (v0.4.0) 순서 조정용 위/아래 화살표 버튼 — 페이지 목록·beat 목록에서 공용으로 쓴다.
function LsReorderBtns({ onUp, onDown, disabledUp, disabledDown }) {
  return (
    <>
      <button type="button" onClick={onUp} disabled={disabledUp} className="press" title="위로" style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid #DCCBA8", background: "rgba(255,255,255,.7)", color: T.inkSoft, cursor: disabledUp ? "default" : "pointer", opacity: disabledUp ? 0.35 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ChevronUp size={12} /></button>
      <button type="button" onClick={onDown} disabled={disabledDown} className="press" title="아래로" style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid #DCCBA8", background: "rgba(255,255,255,.7)", color: T.inkSoft, cursor: disabledDown ? "default" : "pointer", opacity: disabledDown ? 0.35 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ChevronDown size={12} /></button>
    </>
  );
}
// (v0.4.0) beat 하나(say/principles/mc/move/play/pause/board/clear)를 폼으로 편집 — 필드는
// seedLessons 주석의 beat 스키마를 그대로 따른다. 텍스트류는 로컬 입력 상태 + onBlur 커밋 패턴으로,
// 체크박스·셀렉트·숫자는 즉시 커밋한다(레슨 편집기 상단 필드들과 같은 스타일).
function BeatEditor({ beat, index, total, onChange, onRemove, onMoveUp, onMoveDown }) {
  const kind = beat.kind || "say";
  const [text, setText] = useState(beat.text || "");
  const [linesText, setLinesText] = useState((beat.lines || []).join("\n"));
  const [prompt, setPrompt] = useState(beat.prompt || "");
  const [optsText, setOptsText] = useState((beat.opts || []).join("\n"));
  const [note, setNote] = useState(beat.note || "");
  const [answersText, setAnswersText] = useState((beat.answers || []).join("\n"));
  const [movesText, setMovesText] = useState((beat.moves || []).join(" "));
  const [stepMs, setStepMs] = useState(beat.stepMs ?? "");
  const [ms, setMs] = useState(beat.ms ?? 800);
  const [squaresText, setSquaresText] = useState((beat.squares || []).join(" "));
  const [sansText, setSansText] = useState((beat.sans || []).join(" "));
  useEffect(() => {
    setText(beat.text || ""); setLinesText((beat.lines || []).join("\n"));
    setPrompt(beat.prompt || ""); setOptsText((beat.opts || []).join("\n")); setNote(beat.note || "");
    setAnswersText((beat.answers || []).join("\n")); setMovesText((beat.moves || []).join(" "));
    setStepMs(beat.stepMs ?? ""); setMs(beat.ms ?? 800); setSquaresText((beat.squares || []).join(" "));
    setSansText((beat.sans || []).join(" "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(beat)]);
  const patch = (p) => onChange({ ...beat, ...p });
  const onKindChange = (nk) => { const nb = defaultBeat(nk); if (beat.sans && beat.sans.length) nb.sans = beat.sans; onChange(nb); };
  const commitSans = () => patch({ sans: spaceToArr(sansText).length ? spaceToArr(sansText) : undefined });
  return (
    <div style={{ padding: 8, borderRadius: 8, background: "rgba(255,255,255,.5)", border: "1px solid #E2D2AC", marginBottom: 6 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: T.inkSoft }}>#{index + 1}</span>
        <select value={kind} onChange={(e) => onKindChange(e.target.value)} style={{ fontSize: 10.5, padding: "3px 5px", borderRadius: 6, border: "1px solid #C9B58C", flex: 1 }}>
          {LESSON_BEAT_KINDS.map((k) => <option key={k} value={k}>{LESSON_BEAT_LABELS[k]}</option>)}
        </select>
        <LsReorderBtns onUp={onMoveUp} onDown={onMoveDown} disabledUp={index === 0} disabledDown={index === total - 1} />
        <button type="button" onClick={onRemove} className="press" title="beat 삭제" style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid " + T.blunder, background: "transparent", color: T.blunder, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={11} /></button>
      </div>
      {kind === "say" && (
        <>
          <select value={beat.speaker || "milku"} onChange={(e) => patch({ speaker: e.target.value })} style={{ ...lsField, width: "auto" }}>
            <option value="milku">milku</option>
            <option value="kokoa">kokoa</option>
          </select>
          <textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={() => patch({ text })} placeholder="대사 텍스트" rows={2} style={{ ...lsField, resize: "vertical" }} />
        </>
      )}
      {kind === "principles" && (
        <textarea value={linesText} onChange={(e) => setLinesText(e.target.value)} onBlur={() => patch({ lines: linesToArr(linesText) })} placeholder={"원칙 목록 (한 줄에 하나씩)"} rows={4} style={{ ...lsField, resize: "vertical" }} />
      )}
      {kind === "mc" && (
        <>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onBlur={() => patch({ prompt })} placeholder="질문(prompt)" rows={2} style={{ ...lsField, resize: "vertical" }} />
          <textarea value={optsText} onChange={(e) => setOptsText(e.target.value)} onBlur={() => patch({ opts: linesToArr(optsText) })} placeholder={"선택지 (한 줄에 하나씩)"} rows={3} style={{ ...lsField, resize: "vertical" }} />
          <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 10.5, color: T.inkSoft }}>정답 인덱스(0부터)</span>
            <input type="number" min={0} value={beat.answer ?? 0} onChange={(e) => patch({ answer: parseInt(e.target.value, 10) || 0 })} style={{ width: 60, padding: "4px 6px", borderRadius: 6, border: "1px solid #C9B58C", fontSize: 11 }} />
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => patch({ note })} placeholder="정답 해설(note)" rows={2} style={{ ...lsField, resize: "vertical" }} />
        </>
      )}
      {kind === "move" && (
        <>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onBlur={() => patch({ prompt })} placeholder="질문(prompt)" rows={2} style={{ ...lsField, resize: "vertical" }} />
          <textarea value={answersText} onChange={(e) => setAnswersText(e.target.value)} onBlur={() => patch({ answers: linesToArr(answersText) })} placeholder={"정답으로 인정할 수 (SAN, 한 줄에 하나씩, 예: e4)"} rows={2} style={{ ...lsField, resize: "vertical" }} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => patch({ note })} placeholder="정답 해설(note)" rows={2} style={{ ...lsField, resize: "vertical" }} />
        </>
      )}
      {kind === "play" && (
        <>
          <input value={movesText} onChange={(e) => setMovesText(e.target.value)} onBlur={() => patch({ moves: spaceToArr(movesText) })} placeholder={"이어서 재생할 수 (SAN, 띄어쓰기로 구분, 예: e4 e5 Nf3)"} style={lsField} />
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 10.5, color: T.inkSoft }}>한 수당 재생 간격(ms)</span>
            <input type="number" min={0} value={stepMs} onChange={(e) => setStepMs(e.target.value)} onBlur={() => patch({ stepMs: stepMs === "" ? undefined : parseInt(stepMs, 10) || 420 })} placeholder="420" style={{ width: 70, padding: "4px 6px", borderRadius: 6, border: "1px solid #C9B58C", fontSize: 11 }} />
          </div>
        </>
      )}
      {kind === "pause" && (
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 10.5, color: T.inkSoft }}>대기 시간(ms)</span>
          <input type="number" min={0} value={ms} onChange={(e) => setMs(e.target.value)} onBlur={() => patch({ ms: parseInt(ms, 10) || 800 })} style={{ width: 80, padding: "4px 6px", borderRadius: 6, border: "1px solid #C9B58C", fontSize: 11 }} />
        </div>
      )}
      {kind === "board" && (
        <>
          <input value={squaresText} onChange={(e) => setSquaresText(e.target.value)} onBlur={() => patch({ squares: spaceToArr(squaresText) })} placeholder={"강조할 칸 (띄어쓰기로 구분, 예: e4 e5 d4 d5)"} style={lsField} />
          <div className="flex items-center gap-3" style={{ marginBottom: 4 }}>
            <label className="flex items-center gap-1" style={{ fontSize: 10.5, color: T.inkSoft, cursor: "pointer" }}><input type="checkbox" checked={!!beat.dim} onChange={(e) => patch({ dim: e.target.checked })} /> dim(음영)</label>
            <label className="flex items-center gap-1" style={{ fontSize: 10.5, color: T.inkSoft, cursor: "pointer" }}><input type="checkbox" checked={!!beat.glow} onChange={(e) => patch({ glow: e.target.checked })} /> glow(발광)</label>
            <label className="flex items-center gap-1" style={{ fontSize: 10.5, color: T.inkSoft, cursor: "pointer" }}><input type="checkbox" checked={!!beat.siren} onChange={(e) => patch({ siren: e.target.checked })} /> siren(경고)</label>
          </div>
          {/* (기능) 공격/방어 화살표 — 행마다 from/to 칸과 공격(빨강)/방어(초록) 종류를 지정한다. */}
          <div style={{ marginBottom: 4 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 3 }}>
              <span style={{ fontSize: 10.5, color: T.inkSoft }}>화살표 (arrows)</span>
              <button type="button" onClick={() => patch({ arrows: [...(beat.arrows || []), { from: "", to: "", type: "attacker" }] })} className="press" title="화살표 추가" style={{ width: 20, height: 20, borderRadius: 6, border: "1px solid " + T.brass, background: "transparent", color: T.brass, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, lineHeight: 1, padding: 0 }}>+</button>
            </div>
            {(beat.arrows || []).map((a, ai) => (
              <div key={ai} className="flex items-center gap-2" style={{ marginBottom: 3 }}>
                <input value={a.from} onChange={(e) => patch({ arrows: beat.arrows.map((x, xi) => (xi === ai ? { ...x, from: e.target.value } : x)) })} placeholder="from (예: e4)" style={{ width: 70, padding: "4px 6px", borderRadius: 6, border: "1px solid #C9B58C", fontSize: 11 }} />
                <span style={{ fontSize: 11, color: T.inkSoft }}>→</span>
                <input value={a.to} onChange={(e) => patch({ arrows: beat.arrows.map((x, xi) => (xi === ai ? { ...x, to: e.target.value } : x)) })} placeholder="to (예: d5)" style={{ width: 70, padding: "4px 6px", borderRadius: 6, border: "1px solid #C9B58C", fontSize: 11 }} />
                <select value={a.type || "attacker"} onChange={(e) => patch({ arrows: beat.arrows.map((x, xi) => (xi === ai ? { ...x, type: e.target.value } : x)) })} style={{ fontSize: 10.5, padding: "3px 5px", borderRadius: 6, border: "1px solid #C9B58C" }}>
                  <option value="attacker">공격(빨강)</option>
                  <option value="defender">방어(초록)</option>
                </select>
                <button type="button" onClick={() => patch({ arrows: beat.arrows.filter((_, xi) => xi !== ai) })} className="press" title="화살표 삭제" style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid " + T.blunder, background: "transparent", color: T.blunder, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
        </>
      )}
      {kind === "clear" && <div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>이 beat는 보드 연출(dim/glow/siren)만 초기화</div>}
      <input value={sansText} onChange={(e) => setSansText(e.target.value)} onBlur={commitSans} placeholder={"(선택) 즉시 전환할 위치 (SAN 수순, 띄어쓰기로 구분, 예: e4 e5 Nf3)"} style={{ ...lsField, marginBottom: 0, fontSize: 10.5, color: T.inkSoft }} />
    </div>
  );
}
// (v0.4.0) 페이지 하나(startSans?/flip?/beats[])를 폼으로 편집 — beats는 BeatEditor 목록 + 추가용
// kind 셀렉트로 구성한다.
function PageEditor({ page, index, total, onChange, onRemove, onMoveUp, onMoveDown }) {
  const [startSansText, setStartSansText] = useState((page.startSans || []).join(" "));
  const [addKind, setAddKind] = useState("say");
  useEffect(() => { setStartSansText((page.startSans || []).join(" ")); }, [JSON.stringify(page.startSans)]);
  const beats = page.beats || [];
  const setBeats = (nb) => onChange({ ...page, beats: nb });
  const updateBeatAt = (bi, nb) => { const arr = [...beats]; arr[bi] = nb; setBeats(arr); };
  const removeBeatAt = (bi) => setBeats(beats.filter((_, j) => j !== bi));
  const moveBeatAt = (bi, dir) => { const j = bi + dir; if (j < 0 || j >= beats.length) return; const arr = [...beats]; [arr[bi], arr[j]] = [arr[j], arr[bi]]; setBeats(arr); };
  const addBeat = () => setBeats([...beats, defaultBeat(addKind)]);
  const commitStartSans = () => onChange({ ...page, startSans: spaceToArr(startSansText) });
  return (
    <div style={{ padding: 10, borderRadius: 10, background: T.ivoryHi, border: "1px solid #DCCBA8", marginBottom: 8 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: T.ink }}>페이지 {index + 1}</span>
        <span style={{ fontSize: 10, color: T.inkSoft }}>({beats.length} beats)</span>
        <div className="flex items-center gap-1" style={{ marginLeft: "auto" }}>
          <LsReorderBtns onUp={onMoveUp} onDown={onMoveDown} disabledUp={index === 0} disabledDown={index === total - 1} />
          <button type="button" onClick={onRemove} className="press" title="페이지 삭제" style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid " + T.blunder, background: "transparent", color: T.blunder, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={11} /></button>
        </div>
      </div>
      <input value={startSansText} onChange={(e) => setStartSansText(e.target.value)} onBlur={commitStartSans} placeholder={"(선택) 시작 위치 (SAN 수순, 띄어쓰기로 구분, 예: e4 e5 Nf3)"} style={lsField} />
      <label className="flex items-center gap-1" style={{ fontSize: 10.5, color: T.inkSoft, cursor: "pointer", marginBottom: 6 }}>
        <input type="checkbox" checked={!!page.flip} onChange={(e) => onChange({ ...page, flip: e.target.checked })} /> flip(보드 반전, 흑 시점으로 보기)
      </label>
      {beats.map((b, bi) => (
        <BeatEditor key={bi} beat={b} index={bi} total={beats.length} onChange={(nb) => updateBeatAt(bi, nb)} onRemove={() => removeBeatAt(bi)} onMoveUp={() => moveBeatAt(bi, -1)} onMoveDown={() => moveBeatAt(bi, 1)} />
      ))}
      <div className="flex items-center gap-2">
        <select value={addKind} onChange={(e) => setAddKind(e.target.value)} style={{ fontSize: 10.5, padding: "4px 6px", borderRadius: 6, border: "1px solid #C9B58C" }}>
          {LESSON_BEAT_KINDS.map((k) => <option key={k} value={k}>{LESSON_BEAT_LABELS[k]}</option>)}
        </select>
        <button type="button" onClick={addBeat} className="press" style={{ fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 7, border: "1px dashed " + T.brass, background: "transparent", color: "#8A6A2F", cursor: "pointer" }}>+ beat 추가</button>
      </div>
    </div>
  );
}
function LessonEditor({ lessonKey, bumpContent, onClose }) {
  const isNew = lessonKey === "__new__";
  const [key, setKey] = useState(isNew ? "" : lessonKey);
  const existing = !isNew ? CONTENT.lessons[lessonKey] : null;
  // (v0.4.1) 기존 레슨이 옛 단수 parent 필드를 쓰고 있어도, 여기서 바로 배열(parents)로 정규화해
  // 편집 폼은 항상 배열을 다루고, 저장하는 순간부터 parents 형태로 굳어지게 한다.
  const [draft, setDraft] = useState(() => {
    const base = existing || { title: "", desc: "", reward: 60, parents: [], pages: [] };
    return { ...base, parents: lessonParents(base) };
  });
  const [saving, setSaving] = useState(false);
  const save = async (next) => {
    setDraft(next); setSaving(true);
    const k = isNew ? key.trim() : lessonKey;
    if (k) { CONTENT.lessons[k] = next; await bumpContent(); }
    setSaving(false);
  };
  const delLesson = async () => { if (!isNew) { delete CONTENT.lessons[lessonKey]; await bumpContent(); } onClose(); };
  const otherLessonKeys = Object.keys(CONTENT.lessons).filter((k) => k !== lessonKey);
  const field = { width: "100%", padding: "7px 9px", borderRadius: 8, border: "1px solid #C9B58C", fontSize: 12, marginBottom: 6, boxSizing: "border-box" };
  // (v0.4.0) 페이지·스크립트(beats)는 종류가 다양하고(설명/객관식/주관식/원칙 목록/보드 연출 등)
  // 구조가 깊지만(레슨 > 페이지 > beat), PageEditor/BeatEditor 폼 컴포넌트로 각 필드를 직접
  // 입력·추가·삭제·순서 변경할 수 있다 — 필드 구성은 seedLessons 함수 위 주석(beat 스키마) 그대로.
  const pages = draft.pages || [];
  const setPages = (np) => save({ ...draft, pages: np });
  const updatePageAt = (i, np) => { const arr = [...pages]; arr[i] = np; setPages(arr); };
  const removePageAt = (i) => setPages(pages.filter((_, j) => j !== i));
  const movePageAt = (i, dir) => { const j = i + dir; if (j < 0 || j >= pages.length) return; const arr = [...pages]; [arr[i], arr[j]] = [arr[j], arr[i]]; setPages(arr); };
  const addPage = () => setPages([...pages, { startSans: [], flip: false, beats: [] }]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", background: T.paper, borderRadius: 16, padding: 18, border: "1px solid #DCCBA8", boxShadow: "0 24px 60px -12px rgba(0,0,0,.7)" }}>
        <button onClick={onClose} aria-label="닫기" className="press" style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer" }}>✕</button>
        <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 10, paddingRight: 30 }}>{isNew ? "새 레슨 추가" : "레슨 편집"} {saving && <span style={{ fontSize: 10, color: T.inkSoft, fontWeight: 600 }}>저장 중…</span>}</div>
        {isNew && <input value={key} onChange={(e) => setKey(e.target.value)} onBlur={() => key.trim() && save(draft)} placeholder="레슨 키 (예: l_e4_c4)" style={{ ...field, fontFamily: SITE_FONT }} />}
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onBlur={() => save(draft)} placeholder="레슨 제목" style={{ ...field, fontWeight: 700 }} />
        <textarea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} onBlur={() => save(draft)} placeholder="레슨 설명" rows={2} style={{ ...field, resize: "vertical" }} />
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>선행 레슨 (여러 개 선택 가능, 전부 완료해야 열림)</div>
          {otherLessonKeys.length === 0 ? (
            <div style={{ fontSize: 11, color: T.inkSoft }}>없음(최상위)</div>
          ) : (
            <div className="flex items-center gap-1" style={{ flexWrap: "wrap" }}>
              {otherLessonKeys.map((k) => {
                const checked = (draft.parents || []).includes(k);
                // (사이클 방지) k가 이미 이 레슨의 (간접) 하위 레슨이면 부모로 선택할 수 없다 —
                // 선택하면 k → ... → 이 레슨 → k처럼 순환이 생기기 때문.
                const blocked = !isNew && lessonDescendants(lessonKey, CONTENT.lessons).has(k);
                return (
                  <label key={k} title={blocked ? "순환이 생겨 선택 불가" : ""}
                    style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 7px", borderRadius: 7,
                      border: "1px solid #C9B58C", background: checked ? "rgba(196,154,80,.22)" : "transparent",
                      opacity: blocked ? 0.4 : 1, cursor: blocked ? "not-allowed" : "pointer" }}>
                    <input type="checkbox" checked={checked} disabled={blocked}
                      onChange={(e) => {
                        const cur = draft.parents || [];
                        const next = e.target.checked ? [...cur, k] : cur.filter((x) => x !== k);
                        const nd = { ...draft, parents: next };
                        delete nd.parent;
                        save(nd);
                      }} />
                    {k} · {CONTENT.lessons[k].title}
                  </label>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: T.inkSoft }}>완료 보상</span>
          <input type="number" value={draft.reward} onChange={(e) => setDraft({ ...draft, reward: parseInt(e.target.value, 10) || 0 })} onBlur={() => save(draft)} style={{ width: 70, padding: "5px 7px", borderRadius: 7, border: "1px solid #C9B58C", fontFamily: SITE_FONT, fontSize: 12 }} />
          <span className="flex items-center gap-1" style={{ fontSize: 11, color: T.inkSoft }}><CoinIcon size={17} /> OC 나이트 코인</span>
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: T.inkSoft, marginBottom: 6 }}>페이지·스크립트: {pages.length}페이지</div>
        {pages.map((p, i) => (
          <PageEditor key={i} page={p} index={i} total={pages.length} onChange={(np) => updatePageAt(i, np)} onRemove={() => removePageAt(i)} onMoveUp={() => movePageAt(i, -1)} onMoveDown={() => movePageAt(i, 1)} />
        ))}
        <button onClick={addPage} className="press" style={{ fontSize: 11.5, fontWeight: 800, padding: "6px 12px", borderRadius: 8, border: "1px dashed " + T.brass, background: "transparent", color: "#8A6A2F", cursor: "pointer", marginBottom: 10 }}>+ 페이지 추가</button>
        <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
          <span style={{ fontSize: 10, color: T.inkSoft }}>{saving ? "저장 중…" : "모든 필드는 변경 즉시(포커스 이동 시) 저장"}</span>
          {!isNew && <button onClick={delLesson} className="press" style={{ fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 8, border: "1px solid " + T.blunder, background: "transparent", color: T.blunder, cursor: "pointer" }}>레슨 삭제</button>}
        </div>
      </div>
    </div>
  );
}
// (18차 UI2) 학습 탭 — 일일 퀘스트를 퍼즐 탭에서 분리하고 메인 퀘스트와 함께 표시.
export function QuestTab({ dailyQuest, setDailyQuest, recentOpenings, onOpenOpening, hasChesscom, mainQuest, onAnswerChapter, onClaimChapter, canEdit, canEditLessons, bumpContent, contentVer, questHighlight }) {
  return (
    <div>
      {/* (버그 수정) 제목 옆 원형 아이콘이 하단 탭바의 퀘스트 아이콘과 중복돼 제거. */}
      {/* (v0.4.0 UI) 사용자 요청 — 이 탭의 하단 탭바 이름이 "퀘스트"에서 "학습"으로 바뀌어, 탭 안
          제목도 같은 이름으로 맞춘다(퀘스트 내용·기능 자체는 그대로). */}
      <div className="flex items-center gap-2" style={{ marginBottom: 10 }}><h2 style={{ fontSize: 18, fontWeight: 800, color: T.ivoryHi }}>학습</h2></div>
      {/* (버그 수정) FadeIn의 기본 layout(FLIP 애니메이션)을 켠 채로 두면, dailyQuest가 비동기로
          늦게 채워져 이 카드가 마운트 직후 거의 0높이에서 실제 높이로 커질 때 framer-motion이 그
          변화를 transform으로 보간해 화면 왼쪽 위(탭에서 가장 먼저 보이는 자리)가 순간적으로
          확대되는 것처럼 보였다 — 이 두 블록은 재정렬·리사이즈를 애니메이션으로 보여줄 필요가
          없는 단순 비동기 데이터 채움이므로 layout을 끈다. */}
      <FadeIn index={0} layout={false}><DailyQuestCard dailyQuest={dailyQuest} setDailyQuest={setDailyQuest} recentOpenings={recentOpenings} onOpenOpening={onOpenOpening} hasChesscom={hasChesscom} highlight={questHighlight} /></FadeIn>
      <FadeIn index={1} layout={false}><LessonMap mainQuest={mainQuest} onAnswer={onAnswerChapter} onClaim={onClaimChapter} canEdit={canEditLessons} bumpContent={bumpContent} contentVer={contentVer} /></FadeIn>
    </div>
  );
}