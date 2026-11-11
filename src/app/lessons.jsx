// (v0.7.5, 사용자 요청) 새 레슨 화면 — 도감 탭에 들어가는 "레슨 경로"(LessonPath)와 전체 화면 학습 화면(LessonPlayer).
//  경로: 마름모 칸이 대각선으로 이어지는 길(아래에서 위로 올라간다). 단계(코스)마다 배경·칸 색·장식 기물 스킨이 다르다(curriculum.js STAGES의 theme).
//        위에는 코치 말풍선(다음 레슨), 아래에는 지금 보이는 단계 이름 + 단계 목록·다음 레슨 버튼. 처음 열면 지금 할 레슨으로 스크롤한다.
//  학습 화면: 보드 + 코치 + 스텝 진행 막대. 스텝 = 읽기 / 칸 누르기 / 수 두기(상대 응수 포함) / 객관식. 판정은 lib/lessons/engine.js(검사 스크립트와 같은 코드).
import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Check, List, X, ChevronDown, ChevronUp, Lightbulb, RotateCcw, Circle, Grid3x3, Zap, Crown, Scale, Castle, MoveDiagonal, Coins, HandCoins, GitFork, Pin, ArrowRightLeft, Eye, PanelBottom, Rows3, Shell, Target, Rocket, Shield, ShieldAlert, Square, ArrowUpDown, Flag } from "lucide-react";
// 레슨 아이콘(curriculum.js의 icon 이름) — 아이콘 전체를 번들에 싣지 않도록 쓰는 것만 가져온다(check-lessons가 빠진 이름을 막는다)
export const LESSON_ICONS = { Grid3x3, Zap, Crown, Scale, Castle, MoveDiagonal, Coins, HandCoins, GitFork, Pin, ArrowRightLeft, Eye, PanelBottom, Rows3, Shell, Target, Rocket, Shield, ShieldAlert, Square, ArrowUpDown, Flag };
import { T, PIECE_IMG_SETS } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { t } from "../lib/i18n.js";
import { playSfx } from "../lib/prefs.js";
import { Board, Mascot, useBoardSize, useNarrow } from "./common.jsx";
import { STAGES, allLessons, stageOf, lessonsOfStage, LESSON_REWARD } from "../lib/lessons/curriculum.js";
import { lessonStatus, nextLesson, isLessonDone } from "../lib/lessons/progress.js";
import { boardOf, turnOf, legalTargets, playMove, playUci, goalMet, tapAnswer, readMarks, sqToRc, rcToSq } from "../lib/lessons/engine.js";

const pieceImg = (set, p, color = "w") => { const s = (PIECE_IMG_SETS[set] || PIECE_IMG_SETS.classic).images[p]; return s && s[color] ? s[color].src : ""; };
function LessonIcon({ icon, size, color }) {
  if (String(icon).startsWith("piece:")) return <img src={pieceImg("classic", icon.slice(6), "w")} alt="" draggable={false} style={{ width: size * 1.25, height: size * 1.25, objectFit: "contain", filter: "drop-shadow(0 1px 1px rgba(0,0,0,.4))" }} />;
  const I = LESSON_ICONS[icon] || Circle;
  return <I size={size} strokeWidth={2.1} color={color} />;
}

/* ============================================================ 레슨 경로 ============================================================ */
// 스크롤 영역 안에서의 세로 위치(offsetTop은 가장 가까운 position 부모 기준이라 쓰지 않는다)
const topIn = (sc, el) => el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
const PATTERN = [2, 3, 2, 1];        // 레슨 칸의 가로 위치(반 칸 단위, 격자 가운데 기준 오프셋 전) — 이웃 칸끼리 대각선으로 맞닿는다
// 경로 한 줄(row)씩: 맨 아래가 첫 레슨. 단계가 바뀌는 곳에는 단계 이름 줄을 넣는다.
function buildRows(lessons, shift) {
  const rows = []; let prevStage = null;
  lessons.forEach((l, i) => {
    if (l.stage !== prevStage) { rows.push({ kind: "stage", stage: l.stage }); prevStage = l.stage; }
    rows.push({ kind: "lesson", lesson: l, xu: PATTERN[i % PATTERN.length] + shift, stage: l.stage, i });
  });
  return rows.reverse();   // 화면 위쪽 = 마지막 레슨
}

function LessonTile({ lesson, status, theme, D, onOpen, flashLock }) {
  const side = D / Math.SQRT2 * 0.9;
  const cur = status === "current", done = status === "done", locked = status === "locked";
  const bg = locked ? "rgba(255,255,255,.07)" : cur ? theme.tileHi : theme.tile;
  return (
    <button type="button" onClick={() => onOpen(lesson)} title={lesson.title()} aria-label={lesson.title() + (locked ? ", " + t("잠김") : done ? ", " + t("완료") : "")} className="press lesson-tile"
      style={{ position: "absolute", left: "50%", top: "50%", width: side, height: side, marginLeft: -side / 2, marginTop: -side / 2, padding: 0, border: "none", cursor: "pointer", background: "transparent" }}>
      {cur && <span aria-hidden="true" className="lesson-pulse" style={{ position: "absolute", inset: -6, borderRadius: "22%", transform: "rotate(45deg)", border: "2px solid " + theme.tileHi }} />}
      <motion.span initial={false} animate={flashLock ? { x: [0, -5, 5, -3, 3, 0], rotate: 45 } : { x: 0, rotate: 45 }} transition={{ duration: 0.35 }}
        style={{ position: "absolute", inset: 0, borderRadius: "22%", background: bg,
          boxShadow: locked ? "inset 0 0 0 1px rgba(255,255,255,.08)" : "0 6px 0 " + (cur ? theme.tile : "rgba(0,0,0,.35)") + ", 0 10px 18px -6px rgba(0,0,0,.55)" + (cur ? ", 0 0 24px " + theme.tileHi + "88" : "") }} />
      <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", opacity: locked ? 0.45 : 1 }}>
        {locked ? <Lock size={D * 0.2} color="rgba(255,255,255,.6)" /> : <LessonIcon icon={lesson.icon} size={D * 0.24} color={theme.ink} />}
      </span>
      {done && <span aria-hidden="true" style={{ position: "absolute", right: -4, top: -4, width: 20, height: 20, borderRadius: "50%", background: "#3F7A3A", border: "2px solid " + theme.bg, display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={12} strokeWidth={3} color="#fff" /></span>}
      {cur && <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: -26, transform: "translateX(-50%)", padding: "3px 10px", borderRadius: 8, background: "#FFF6E2", color: theme.ink, fontFamily: SITE_FONT, fontSize: 12, fontWeight: 900, whiteSpace: "nowrap", boxShadow: "0 3px 8px rgba(0,0,0,.35)" }}>{t("시작")}</span>}
    </button>
  );
}

/** 도감 탭의 레슨 경로. height: 이 판의 높이(CSS 값). */
export function LessonPath({ lessonState, onComplete, height, coins }) {
  const lessons = allLessons();
  const narrow = useNarrow(640);
  // 격자 폭(반 칸 단위): 모바일 0~4, 데스크톱 0~8(가운데 경로 양옆에 장식·빈 칸이 더 보인다)
  const COLS_HALF = narrow ? 4 : 8, SHIFT = narrow ? 0 : 2;
  const rows = useMemo(() => buildRows(lessons, SHIFT), [lessons, SHIFT]);
  const D = narrow ? 92 : 104;           // 마름모 대각선 길이(px)
  const ROW = D / 2;                      // 대각선으로 맞닿게 반 칸씩 내려간다
  const W = COLS_HALF * (D / 2) + D;      // 마름모 격자 폭
  const scRef = useRef(null), tileRefs = useRef({}), stageRefs = useRef({});
  const nxt = nextLesson(lessonState);
  const [open, setOpen] = useState(null);           // 열린 레슨
  const [lockFlash, setLockFlash] = useState(null);
  const [viewStage, setViewStage] = useState(nxt ? nxt.stage : STAGES[STAGES.length - 1].id);
  const [listOpen, setListOpen] = useState(false);
  const [curDir, setCurDir] = useState(0);            // 지금 할 레슨이 화면 위(-1)/아래(1)/안(0)
  const [coachMsg, setCoachMsg] = useState(null);
  const theme = stageOf(viewStage).theme;

  const scrollToLesson = useCallback((id, smooth = true) => {
    const sc = scRef.current, el = tileRefs.current[id]; if (!sc || !el) return;
    sc.scrollTo({ top: topIn(sc, el) - sc.clientHeight / 2 + D / 2, behavior: smooth ? "smooth" : "auto" });
  }, [D]);
  useLayoutEffect(() => { if (nxt) scrollToLesson(nxt.id, false); else if (scRef.current) scRef.current.scrollTop = 0; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const onScroll = () => {
    const sc = scRef.current; if (!sc) return;
    const mid = sc.scrollTop + sc.clientHeight * 0.6;
    // 화면 가운데 아래쪽에 걸친 레슨 줄의 단계
    let best = null, bd = Infinity;
    for (const l of lessons) { const el = tileRefs.current[l.id]; if (!el) continue; const d = Math.abs(topIn(sc, el) - mid); if (d < bd) { bd = d; best = l.stage; } }
    if (best && best !== viewStage) setViewStage(best);
    if (nxt) { const el = tileRefs.current[nxt.id]; if (el) { const y = topIn(sc, el) - sc.scrollTop; setCurDir(y < 40 ? -1 : y > sc.clientHeight - 150 ? 1 : 0); } }
  };
  useEffect(() => { onScroll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const openLesson = (l) => {
    const st = lessonStatus(lessonState, l.id);
    if (st === "locked") { setLockFlash(l.id); setCoachMsg(t("앞 레슨을 먼저 끝내면 열립니다.")); setTimeout(() => setLockFlash(null), 400); return; }
    setCoachMsg(null); setOpen(l);
  };
  // 장식 기물: 단계마다 비어 있는 격자 칸 몇 곳에 그 단계 스킨의 큰 기물을 세운다(레슨 칸과 겹치지 않는 가장자리 칸)
  const decoFor = (row, idx) => {
    if (row.kind !== "lesson" || idx % 3 !== 1) return null;
    const st = stageOf(row.stage).theme; const side = row.xu >= COLS_HALF / 2 ? (narrow ? 0 : 1) : (narrow ? COLS_HALF : COLS_HALF - 1);
    return { xu: side, src: pieceImg(st.skin, st.deco[(row.i) % st.deco.length], "w") };
  };
  const doneN = lessons.filter((l) => isLessonDone(lessonState, l.id)).length;
  const coach = coachMsg || (nxt ? t("다음 레슨은 {0}입니다. {1}.", nxt.title(), nxt.sub()) : t("모든 레슨을 끝냈습니다. 원하는 레슨을 다시 복습해 보세요."));

  return (
    <div className="lesson-path" style={{ position: "relative", height, minHeight: 380, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,.08)",
      background: "linear-gradient(180deg," + theme.bg2 + "," + theme.bg + ")", transition: "background .6s", fontFamily: SITE_FONT }}>
      <style>{`
        @keyframes lessonPulse{0%{opacity:.9;transform:rotate(45deg) scale(1)}100%{opacity:0;transform:rotate(45deg) scale(1.35)}}
        .lesson-pulse{animation:lessonPulse 1.6s ease-out infinite}
        .lesson-tile:focus-visible{outline:2px solid #FFF6E2;outline-offset:6px;border-radius:12px}
        .lesson-scroll{scrollbar-width:none}.lesson-scroll::-webkit-scrollbar{display:none}
      `}</style>
      {/* 코치 말풍선 */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 3, display: "flex", alignItems: "flex-start", gap: 8, padding: "12px 12px 18px",
        background: "linear-gradient(180deg," + theme.bg2 + " 60%,transparent)" }}>
        <Mascot name="milku" emotion={coachMsg ? "think" : "great"} size={narrow ? 46 : 52} />
        <div aria-live="polite" style={{ position: "relative", flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 12, background: "#FFF8EA", color: "#2A1B0E", fontSize: 13.5, fontWeight: 700, lineHeight: 1.4, boxShadow: "0 4px 12px rgba(0,0,0,.3)" }}>
          <span aria-hidden="true" style={{ position: "absolute", left: -6, top: 16, width: 12, height: 12, background: "#FFF8EA", transform: "rotate(45deg)" }} />
          <span style={{ position: "relative" }}>{coach}</span>
          <span style={{ display: "block", marginTop: 4, fontSize: 11, fontWeight: 800, color: "#8A6C2F", fontVariantNumeric: "tabular-nums" }}>{t("레슨 {0}/{1} 완료", doneN, lessons.length)}</span>
        </div>
      </div>
      {/* 경로 */}
      <div ref={scRef} onScroll={onScroll} className="lesson-scroll" style={{ position: "absolute", inset: 0, overflowY: "auto", padding: (narrow ? 120 : 128) + "px 0 " + (narrow ? 96 : 104) + "px" }}>
        {rows.map((row, idx) => {
          const th = stageOf(row.stage).theme;
          if (row.kind === "stage") {
            const sd = STAGES.find((s) => s.id === row.stage); const sl = lessonsOfStage(row.stage); const sdone = sl.filter((l) => isLessonDone(lessonState, l.id)).length;
            return (
              <div key={"st" + row.stage} ref={(el) => { stageRefs.current[row.stage] = el; }} style={{ position: "relative", margin: "18px auto 14px", maxWidth: W + 40, padding: "10px 14px", borderRadius: 12,
                background: th.bg, border: "1px solid " + th.tile + "55", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 8, transform: "rotate(45deg) scale(.78)", background: th.tile }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 900, color: th.tileHi }}>{sd.title()}</span>
                  <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,.62)" }}>{sd.desc()}</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: th.tileHi, fontVariantNumeric: "tabular-nums" }}>{sdone}/{sl.length}</span>
              </div>
            );
          }
          const deco = decoFor(row, idx);
          const status = lessonStatus(lessonState, row.lesson.id);
          // 이 줄의 빈 격자 칸(옅은 마름모) — 레슨 칸의 홀짝에 맞춘다
          const empties = []; for (let xu = 0; xu <= COLS_HALF; xu++) if ((xu + row.xu) % 2 === 0 && xu !== row.xu && (!deco || xu !== deco.xu)) empties.push(xu);
          const xOf = (xu) => xu * (D / 2) + D / 2 - W / 2;
          return (
            <div key={row.lesson.id} style={{ position: "relative", height: ROW, margin: "0 auto", width: W }}>
              {empties.map((xu) => <span key={xu} aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: D / Math.SQRT2 * 0.86, height: D / Math.SQRT2 * 0.86, marginLeft: xOf(xu) - D / Math.SQRT2 * 0.43, marginTop: -D / Math.SQRT2 * 0.43, borderRadius: "22%", transform: "rotate(45deg)", background: th.tile, opacity: 0.09 }} />)}
              {deco && <img src={deco.src} alt="" aria-hidden="true" draggable={false} loading="lazy" style={{ position: "absolute", left: "50%", bottom: ROW * 0.1, width: D * 0.62, height: D * 0.9, marginLeft: xOf(deco.xu) - D * 0.31, objectFit: "contain", objectPosition: "bottom", opacity: 0.92, filter: "drop-shadow(0 8px 10px rgba(0,0,0,.45))", pointerEvents: "none" }} />}
              <div ref={(el) => { tileRefs.current[row.lesson.id] = el; }} style={{ position: "absolute", left: "50%", top: "50%", width: D, height: D, marginLeft: xOf(row.xu) - D / 2, marginTop: -D / 2, zIndex: 1 }}>
                <LessonTile lesson={row.lesson} status={status} theme={th} D={D} onOpen={openLesson} flashLock={lockFlash === row.lesson.id} />
              </div>
            </div>
          );
        })}
      </div>
      {/* 아래 막대: 보이는 단계 이름 + 단계 목록·다음 레슨 */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 3, padding: "22px 12px 12px", background: "linear-gradient(0deg," + theme.bg + " 62%,transparent)" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <AnimatePresence mode="wait">
            <motion.span key={viewStage} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
              style={{ fontSize: narrow ? 19 : 22, fontWeight: 900, letterSpacing: "-.02em", color: "#FFF6E2" }}>{stageOf(viewStage).title()}</motion.span>
          </AnimatePresence>
          {nxt && curDir !== 0 && (
            <button type="button" onClick={() => scrollToLesson(nxt.id)} aria-label={t("지금 할 레슨으로 이동")} className="press"
              style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "rgba(255,255,255,.14)", color: "#FFF6E2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              {curDir < 0 ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setListOpen(true)} aria-label={t("단계 목록")} className="press"
            style={{ width: 46, height: 44, flexShrink: 0, borderRadius: 12, border: "none", background: "rgba(255,255,255,.12)", color: "#FFF6E2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><List size={20} /></button>
          <button type="button" onClick={() => (nxt ? openLesson(nxt) : openLesson(lessons[0]))} className="press"
            style={{ flex: 1, height: 44, borderRadius: 12, border: "none", cursor: "pointer", fontFamily: SITE_FONT, fontSize: 15, fontWeight: 900, color: theme.ink,
              background: theme.tileHi, boxShadow: "0 4px 0 " + theme.tile }}>{nxt ? t("다음 레슨") : t("처음부터 복습")}</button>
        </div>
      </div>
      {/* 단계 목록 */}
      <AnimatePresence>
        {listOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setListOpen(false)}
            style={{ position: "absolute", inset: 0, zIndex: 5, background: "rgba(10,6,3,.62)", display: "flex", alignItems: "flex-end" }}>
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("단계 목록")}
              style={{ width: "100%", maxHeight: "80%", overflowY: "auto", padding: 12, borderRadius: "16px 16px 0 0", background: "#1E140C", display: "flex", flexDirection: "column", gap: 8 }}>
              {STAGES.map((s) => {
                const sl = lessonsOfStage(s.id), sd = sl.filter((l) => isLessonDone(lessonState, l.id)).length;
                return (
                  <button key={s.id} type="button" className="press" onClick={() => { setListOpen(false); scrollToLesson((sl.find((l) => !isLessonDone(lessonState, l.id)) || sl[0]).id); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left", background: "linear-gradient(90deg," + s.theme.bg2 + "," + s.theme.bg + ")" }}>
                    <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, transform: "rotate(45deg) scale(.8)", background: s.theme.tile }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontFamily: SITE_FONT, fontSize: 14.5, fontWeight: 900, color: s.theme.tileHi }}>{s.title()}</span>
                      <span style={{ display: "block", fontFamily: SITE_FONT, fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,.62)" }}>{s.desc()}</span>
                    </span>
                    <span style={{ fontFamily: SITE_FONT, fontSize: 12, fontWeight: 800, color: s.theme.tileHi }}>{sd}/{sl.length}</span>
                  </button>
                );
              })}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {open && <LessonPlayer lesson={open} lessonState={lessonState} coins={coins} onClose={() => setOpen(null)} onComplete={onComplete}
        onNext={(l) => { setOpen(null); setTimeout(() => { setOpen(l); scrollToLesson(l.id, false); }, 60); }} />}
    </div>
  );
}

/* ============================================================ 학습 화면 ============================================================ */
const sqList = (arr) => (arr || []).map(sqToRc);
export function LessonPlayer({ lesson, lessonState, onClose, onComplete, onNext, coins }) {
  const stage = stageOf(lesson.stage), th = stage.theme;
  const steps = useMemo(() => lesson.steps(), [lesson]);
  // 열었을 때 이미 끝낸 레슨이었는지 — 완료 순간 진행 기록이 바뀌어도 "복습"으로 잘못 바뀌지 않게 처음 값을 고정한다(BUG-154)
  const [wasDone] = useState(() => isLessonDone(lessonState, lesson.id));
  const narrow = useNarrow(860);
  const [si, setSi] = useState(0);
  const step = steps[si] || null;
  const finished = si >= steps.length;
  // 스텝 진행 상태
  const [fen, setFen] = useState(null);
  const [goalIdx, setGoalIdx] = useState(0);
  const [solved, setSolved] = useState(false);
  const [wrong, setWrong] = useState(0);
  const [wrongAt, setWrongAt] = useState(null);
  const [sel, setSel] = useState(null);
  const [tapped, setTapped] = useState([]);
  const [picked, setPicked] = useState(null);
  const [lastTo, setLastTo] = useState(null);
  const [say, setSay] = useState("");
  const busy = useRef(false);
  useEffect(() => {
    if (!step) return;
    setFen(step.fen || null); setGoalIdx(0); setSolved(step.kind === "read"); setWrong(0); setWrongAt(null); setSel(null); setTapped([]); setPicked(null); setLastTo(null); setSay(step.say); busy.current = false;
  }, [si, step]);
  useEffect(() => { if (finished && onComplete) onComplete(lesson.id); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [finished]);
  useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const flashWrong = (rc) => { setWrongAt(rc); setTimeout(() => setWrongAt(null), 650); setWrong((w) => w + 1); };

  const board = useMemo(() => (fen ? boardOf(fen) : null), [fen]);
  const flip = fen ? (step && step.kind === "move" ? turnOf(step.fen) === "b" : turnOf(fen) === "b" && step && step.kind !== "tap") : false;
  const myColor = step && step.fen ? turnOf(step.fen) : "w";
  const canMove = step && step.kind === "move" && !solved && fen && turnOf(fen) === myColor;
  const targets = canMove && sel ? legalTargets(fen, rcToSq(sel[0], sel[1])).map(sqToRc) : [];

  const attempt = (from, to) => {
    if (!canMove || busy.current) return;
    const g = step.line[goalIdx];
    const played = playMove(fen, rcToSq(from[0], from[1]), rcToSq(to[0], to[1]));
    setSel(null);
    if (!played) return;
    if (!goalMet(g.goal, played)) { flashWrong(to); setSay(t("다시 해 보세요.") + " " + (step.line[goalIdx].say || step.say)); return; }
    playSfx(played.mv.captured ? "capture" : "move");
    setFen(played.fen); setLastTo(to);
    const last = goalIdx >= step.line.length - 1;
    if (last) { setSolved(true); setSay(t("정답입니다.")); playSfx("click"); return; }
    busy.current = true;
    setTimeout(() => {
      const r = playUci(played.fen, g.reply);
      if (r) { setFen(r.fen); setLastTo(sqToRc(g.reply.slice(2, 4))); playSfx(r.mv.captured ? "capture" : "move"); }
      setGoalIdx((i) => i + 1); setSay(step.line[goalIdx + 1].say || step.say); setWrong(0); busy.current = false;
    }, 550);
  };
  const onSquareClick = (rc) => {
    if (!step || solved) return;
    if (step.kind === "tap") {
      const sq = rcToSq(rc[0], rc[1]), ans = tapAnswer(step);
      if (tapped.includes(sq)) return;
      if (!ans.has(sq)) { flashWrong(rc); return; }
      const nt = [...tapped, sq]; setTapped(nt); playSfx("move");
      if (nt.length >= ans.size) { setSolved(true); setSay(t("정답입니다.")); playSfx("click"); }
      else if (ans.size > 1) setSay(step.say + " " + t("{0}칸 남았습니다.", ans.size - nt.length));
      return;
    }
    if (!canMove) return;
    const p = board[rc[0]][rc[1]];
    if (sel && targets.some(([r, c]) => r === rc[0] && c === rc[1])) { attempt(sel, rc); return; }
    if (p && p.c === myColor) setSel(rc); else setSel(null);
  };
  const choose = (i) => {
    if (solved) return;
    setPicked(i);
    if (i === step.answer) { setSolved(true); setSay(t("정답입니다.")); playSfx("click"); }
    else { setWrong((w) => w + 1); setSay(t("다시 생각해 보세요.")); }
  };
  const hintArrow = step && step.kind === "move" && !solved && goalIdx === 0 && wrong >= 2 && step.hint ? [{ from: sqToRc(step.hint.slice(0, 2)), to: sqToRc(step.hint.slice(2, 4)), kind: "tactic", color: th.tileHi, width: 0.12 }] : [];
  const marks = step && step.kind === "read" ? sqList(readMarks(step)) : step && step.kind === "tap" ? sqList(tapped) : [];
  const readArrows = step && step.kind === "read" && step.arrows ? step.arrows.map(([a, b]) => ({ from: sqToRc(a), to: sqToRc(b), kind: "tactic", color: th.tileHi })) : [];
  const resetStep = () => { setFen(step.fen || null); setGoalIdx(0); setSel(null); setLastTo(null); setSay(step.say); busy.current = false; };

  const [boardSize, setBoardRef] = useBoardSize(narrow ? 460 : 600, 24);
  const emotion = finished ? "great" : solved ? "great" : wrongAt || (picked != null && picked !== (step && step.answer)) ? "surprise" : "think";
  const nextL = useMemo(() => { const all = allLessons(); const i = all.findIndex((l) => l.id === lesson.id); return all[i + 1] || null; }, [lesson]);

  const coachPanel = (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <Mascot name="milku" emotion={emotion} size={narrow ? 48 : 64} />
      <div aria-live="polite" style={{ flex: 1, minWidth: 0, padding: "12px 14px", borderRadius: 14, background: "#FFF8EA", color: "#2A1B0E", fontSize: narrow ? 14 : 15.5, fontWeight: 700, lineHeight: 1.5, boxShadow: "0 4px 14px rgba(0,0,0,.3)" }}>
        {finished ? t("레슨을 끝냈습니다.") : say}
      </div>
    </div>
  );
  const choicePanel = step && step.kind === "choice" && !finished ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
      {step.options.map((o, i) => {
        const right = solved && i === step.answer, bad = picked === i && i !== step.answer;
        return <button key={i} type="button" onClick={() => choose(i)} className="press" disabled={solved}
          style={{ textAlign: "left", padding: "12px 14px", borderRadius: 12, cursor: solved ? "default" : "pointer", fontFamily: SITE_FONT, fontSize: 14, fontWeight: 800,
            border: "2px solid " + (right ? "#5E9E6E" : bad ? "#C8453B" : "rgba(255,255,255,.14)"), background: right ? "rgba(94,158,110,.25)" : bad ? "rgba(200,69,59,.2)" : "rgba(255,255,255,.06)", color: "#FFF6E2" }}>{o}</button>;
      })}
    </div>
  ) : null;
  const actionBar = (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {step && step.kind === "move" && !solved && goalIdx === 0 && (
        <button type="button" onClick={resetStep} aria-label={t("처음 포지션으로")} className="press" style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 12, border: "none", background: "rgba(255,255,255,.12)", color: "#FFF6E2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><RotateCcw size={18} /></button>
      )}
      {step && step.kind === "move" && !solved && wrong >= 2 && step.hint && goalIdx === 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 800, color: th.tileHi }}><Lightbulb size={15} />{t("화살표를 참고하세요")}</span>
      )}
      <button type="button" disabled={!solved && !finished} onClick={() => { if (finished) onClose(); else setSi((i) => i + 1); }} className="press"
        style={{ marginLeft: "auto", minWidth: 150, height: 46, padding: "0 20px", borderRadius: 12, border: "none", cursor: solved || finished ? "pointer" : "default", fontFamily: SITE_FONT, fontSize: 15, fontWeight: 900,
          background: solved || finished ? th.tileHi : "rgba(255,255,255,.1)", color: solved || finished ? th.ink : "rgba(255,255,255,.4)", boxShadow: solved || finished ? "0 4px 0 " + th.tile : "none", transition: "background .2s" }}>
        {finished ? t("닫기") : step && step.kind === "read" ? t("다음") : t("계속")}
      </button>
    </div>
  );
  const doneView = (
    <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: "center", padding: "24px 12px" }}>
      <div style={{ width: 96, height: 96, margin: "0 auto 18px", borderRadius: "22%", transform: "rotate(45deg)", background: th.tileHi, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 0 " + th.tile }}>
        <span style={{ transform: "rotate(-45deg)" }}><Check size={44} strokeWidth={3} color={th.ink} /></span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color: "#FFF6E2" }}>{lesson.title()}</div>
      <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: th.tileHi }}>{wasDone ? t("복습 완료") : coins ? t("레슨 완료, 코인 {0}개", LESSON_REWARD) : t("레슨 완료")}   {/* 코인은 로그인했을 때만 서버가 준다 */}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 22, flexWrap: "wrap" }}>
        <button type="button" onClick={onClose} className="press" style={{ height: 44, padding: "0 18px", borderRadius: 12, border: "none", background: "rgba(255,255,255,.12)", color: "#FFF6E2", fontFamily: SITE_FONT, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{t("레슨 목록")}</button>
        {nextL && <button type="button" onClick={() => onNext(nextL)} className="press" style={{ height: 44, padding: "0 22px", borderRadius: 12, border: "none", background: stageOf(nextL.stage).theme.tileHi, color: stageOf(nextL.stage).theme.ink, fontFamily: SITE_FONT, fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 0 " + stageOf(nextL.stage).theme.tile }}>{t("다음 레슨: {0}", nextL.title())}</button>}
      </div>
    </motion.div>
  );
  const boardBox = board ? (
    <div ref={setBoardRef} style={{ width: "100%", maxWidth: narrow ? 460 : "min(600px, calc(100dvh - 190px))", margin: "0 auto" }}>
      <Board board={board} flip={flip} size={boardSize} showEval={false} interactive={!!(canMove || (step && step.kind === "tap" && !solved))}
        selected={sel} legalTargets={targets} onSquareClick={onSquareClick}
        onPieceDrag={(rc) => { if (canMove) { const p = board[rc[0]][rc[1]]; if (p && p.c === myColor) setSel(rc); } }}
        onDrop={(rc) => { if (sel) attempt(sel, rc); }} onMove={(from, to) => attempt(from, to)}
        haloSquares={marks} arrows={[...readArrows, ...hintArrow]} wrongAt={wrongAt} lastQ={lastTo && step && step.kind === "move" ? { to: lastTo, kind: solved ? "best" : "good" } : null} />
    </div>
  ) : null;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={lesson.title()} style={{ position: "fixed", inset: 0, zIndex: 9000, display: "flex", flexDirection: "column", fontFamily: SITE_FONT, color: "#FFF6E2",
      background: "radial-gradient(120% 80% at 50% 0%," + th.bg2 + "," + th.bg + " 70%)" }}>
      {/* 머리: 닫기 · 단계/레슨 이름 · 스텝 진행 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "max(12px, env(safe-area-inset-top)) 14px 10px" }}>
        <button type="button" onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, border: "none", background: "rgba(255,255,255,.1)", color: "#FFF6E2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={20} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: th.tileHi }}>{stage.title()}</div>
          <div style={{ fontSize: 16, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lesson.title()}</div>
        </div>
        <div aria-hidden="true" style={{ display: "flex", gap: 4, width: narrow ? 110 : 220 }}>
          {steps.map((_, i) => <span key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < si || finished ? th.tileHi : i === si ? th.tile : "rgba(255,255,255,.14)", transition: "background .3s" }} />)}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: narrow ? "column" : "row", gap: narrow ? 12 : 28, padding: narrow ? "4px 14px 14px" : "10px 28px 24px", alignItems: narrow ? "stretch" : "center", justifyContent: narrow ? "flex-start" : "center", maxWidth: 1180, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {finished ? <div style={{ flex: 1 }}>{doneView}</div> : narrow ? (
          <>{coachPanel}{boardBox}{choicePanel}</>
        ) : (
          <>
            {boardBox && <div style={{ flex: "0 1 600px", minWidth: 0 }}>{boardBox}</div>}
            <div style={{ flex: "1 1 340px", maxWidth: boardBox ? 420 : 560, minWidth: 0 }}>{coachPanel}{choicePanel}<div style={{ marginTop: 18 }}>{actionBar}</div></div>
          </>
        )}
      </div>
      {(narrow || finished) && !finished && <div style={{ padding: "10px 14px max(14px, env(safe-area-inset-bottom))", borderTop: "1px solid rgba(255,255,255,.08)" }}>{actionBar}</div>}
    </div>,
    document.body
  );
}
