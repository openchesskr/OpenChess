// (v0.7.6, 사용자 요청) 학습 탭 "맞춤 학습" — 분석 탭으로 옮긴 성장 분석(최근 5판)의 약점 진단과 이어지는 두 가지 학습.
//  · 복습: 내가 실수·블런더를 둔 바로 그 포지션을 다시 풀기. 보드에 직접 두고, 엔진 최선수나 그에 버금가는 좋은 수면 정답(lib/practicePlan.js).
//    두 번 틀리면 정답 화살표 힌트. 맞힌 문제는 이 기기에 기억(oc_drill_done_v1)하고 뒤로 미룬다.
//  · 추가 학습: 반복 실수 원인·가장 약한 구간에 맞는 레슨 추천. 순서대로 열리는 레슨 경로와 달리 여기서는 잠긴 레슨도 바로 연다(완료 보상은 레슨과 같다).
// 엔진을 돌리지 않는다 — 성장 분석이 이미 리뷰해 둔(캐시) 판만 쓴다(growth.jsx useCachedGrowth). 리뷰된 판이 없으면 분석 탭으로 안내한다.
import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { Board, Mascot, useBoardSize } from "./common.jsx";
import { Target, BookOpen, Check, Eye, RotateCcw, ChevronRight, Lightbulb, GraduationCap } from "../components/ocIcons.jsx";
import { badgeIcon, QLABEL } from "../components/badges.jsx";
import { BestMoveJumpButton } from "../components/uiPrimitives.jsx";
import { useCachedGrowth, reviewGameOf } from "./growth.jsx";
import { phaseLabel, causeLabel, betterMoves } from "../lib/growthAnalysis.js";
import { drillQueue, isDrillAnswer, recommendLessons } from "../lib/practicePlan.js";
import { lessonById, stageOf } from "../lib/lessons/curriculum.js";
import { isLessonDone } from "../lib/lessons/progress.js";
import { LessonPlayer } from "./lessons.jsx";
import { boardOf, turnOf, legalTargets, playMove, sqToRc, rcToSq } from "../lib/lessons/engine.js";
import { sansToFen, moveNumber } from "../lib/chessRules.js";
import { playSfx } from "../lib/prefs.js";
import { t } from "../lib/i18n.js";

const DONE_KEY = "oc_drill_done_v1";
const loadDone = () => { try { const a = JSON.parse(window.localStorage.getItem(DONE_KEY) || "[]"); return new Set(Array.isArray(a) ? a.slice(-400) : []); } catch { return new Set(); } };
const saveDone = (set) => { try { window.localStorage.setItem(DONE_KEY, JSON.stringify([...set].slice(-400))); } catch { /* 저장 실패해도 문제 풀이는 계속 */ } };

const CREAM = "#F1E6D0", LINE = "#D6C29A", INK = "#2A1B0E", SOFT = "#7A6648", BRASS = "#A8842F", SAGE = "#3F7A3A";
const card = { borderRadius: 16, border: "1px solid " + LINE, background: CREAM, boxShadow: "0 3px 0 #B59A6E", overflow: "hidden" };
const headRow = { display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", background: "rgba(255,255,255,.35)", borderBottom: "1px solid " + LINE };
const iconBox = (c) => ({ width: 36, height: 36, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: c + "24", border: "1px solid " + c + "66", flexShrink: 0 });
const kicker = { fontSize: 9.5, fontWeight: 700, letterSpacing: ".24em", color: BRASS };
const title = { fontSize: 16, fontWeight: 800, color: INK, lineHeight: 1.15 };
const pill = (on) => ({ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 13px", borderRadius: 10, border: on ? "none" : "1px solid " + LINE, background: on ? T.ebony2 : "rgba(255,255,255,.55)", color: on ? T.brassHi : INK, fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: SITE_FONT });

/* ── 복습 문제 한 개 ── */
function DrillBoard({ item, onSolved, onReview }) {
  const m = item.m, g = m.game;
  const fen0 = useMemo(() => { try { return sansToFen(g.sans.slice(0, m.ply)); } catch { return null; } }, [g.sans, m.ply]);
  const [fen, setFen] = useState(fen0), [sel, setSel] = useState(null), [wrong, setWrong] = useState(0), [state, setState] = useState("idle"), [wrongAt, setWrongAt] = useState(null), [lastTo, setLastTo] = useState(null);
  useEffect(() => { setFen(fen0); setSel(null); setWrong(0); setState("idle"); setWrongAt(null); setLastTo(null); }, [item.key, fen0]);
  const [size, setRef] = useBoardSize(360, 0);
  const board = useMemo(() => (fen ? boardOf(fen) : null), [fen]);
  const best = useMemo(() => betterMoves(m), [m]);
  const bestSan = best[0] ? best[0].san : null;
  const showHint = !!bestSan && !!fen0 && state !== "ok" && (wrong >= 2 || state === "shown");
  const hintArrow = useMemo(() => {
    if (!showHint) return [];
    const want = bestSan.replace(/[+#]/g, "");
    for (const f of "abcdefgh") for (let r = 1; r <= 8; r++) {   // 정답 수의 출발·도착 칸: 합법 수를 두어 보고 SAN이 같은 것
      for (const to of legalTargets(fen0, f + r)) { const pm = playMove(fen0, f + r, to); if (pm && pm.san.replace(/[+#]/g, "") === want) return [{ from: sqToRc(f + r), to: sqToRc(to), kind: "tactic", color: state === "shown" ? "#6EBF4A" : T.brassHi, width: 0.13 }]; }
    }
    return [];
  }, [showHint, bestSan, fen0, state]);
  if (!fen0 || !board) return null;
  const me = turnOf(fen0), canMove = state !== "ok" && state !== "shown";
  const targets = canMove && sel ? legalTargets(fen, rcToSq(sel[0], sel[1])).map(sqToRc) : [];
  const attempt = (from, to) => {
    if (!canMove) return;
    const played = playMove(fen0, rcToSq(from[0], from[1]), rcToSq(to[0], to[1]));
    setSel(null);
    if (!played) return;
    if (isDrillAnswer(m, played.san)) {
      setFen(played.fen); setLastTo(to); setState("ok"); playSfx(played.mv.captured ? "capture" : "move"); onSolved(item.key);
    } else {
      setWrong((w) => w + 1); setState("bad"); setWrongAt(to); setTimeout(() => setWrongAt(null), 700);
    }
  };
  const onSquareClick = (rc) => {
    if (!canMove) return;
    const p = board[rc[0]][rc[1]];
    if (sel && targets.some(([r, c]) => r === rc[0] && c === rc[1])) { attempt(sel, rc); return; }
    setSel(p && p.c === me ? rc : null);
  };
  const reveal = () => setState("shown");
  const msg = state === "ok" ? t("정답. 실전보다 훨씬 좋은 수입니다.")
    : state === "shown" ? t("정답은 {0}입니다.", bestSan || "")
    : state === "bad" ? (wrong >= 2 ? t("화살표 힌트를 참고해 다시 두어 보세요.") : t("그 수도 아쉽습니다. 다시 찾아보세요."))
    : t("실전에서는 {0}{1:을/를} 두었습니다. 더 나은 수를 찾아보세요.", moveNumber(m.ply), m.san);
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div ref={setRef} style={{ flex: "1 1 260px", maxWidth: 380, minWidth: 0 }}>
        <Board board={board} flip={me === "b"} size={size} showEval={false} interactive={canMove}
          selected={sel} legalTargets={targets} onSquareClick={onSquareClick}
          onPieceDrag={(rc) => { if (canMove) { const p = board[rc[0]][rc[1]]; if (p && p.c === me) setSel(rc); } }}
          onDrop={(rc) => { if (sel) attempt(sel, rc); }} onMove={(from, to) => attempt(from, to)}
          haloSquares={lastTo ? [lastTo] : []} arrows={hintArrow} wrongAt={wrongAt} />
      </div>
      <div style={{ flex: "1 1 200px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {badgeIcon(m.kind, 16)}
          <span style={{ fontSize: 12, fontWeight: 800, color: SOFT }}>{QLABEL[m.kind] || m.kind}</span>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: BRASS, borderRadius: 999, padding: "1px 8px" }}>{phaseLabel(m.phase)}</span>
          {m.cause && <span style={{ fontSize: 10.5, fontWeight: 800, color: T.mistake, background: "rgba(217,130,43,.12)", border: "1px solid rgba(217,130,43,.35)", borderRadius: 999, padding: "1px 8px" }}>{causeLabel(m.cause)}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <Mascot name={me === "w" ? "milku" : "kokoa"} emotion={state === "ok" ? "great" : state === "bad" ? "surprise" : "think"} size={44} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={state + ":" + wrong} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} aria-live="polite"
              style={{ margin: 0, flex: 1, fontSize: 13.5, fontWeight: 700, lineHeight: 1.55, color: state === "ok" ? SAGE : state === "bad" ? T.blunder : INK }}>{msg}</motion.p>
          </AnimatePresence>
        </div>
        {(state === "ok" || state === "shown") && best.length > 1 && (
          <div style={{ fontSize: 11.5, color: SOFT, lineHeight: 1.5 }}>{t("다른 좋은 수")}: {best.slice(1, 4).map((b) => b.san).join(", ")}</div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
          {canMove && <button type="button" onClick={reveal} className="press" style={pill(false)}><Eye size={14} />{t("정답 보기")}</button>}
          {!canMove && <button type="button" onClick={() => { setFen(fen0); setState("idle"); setWrong(0); setLastTo(null); }} className="press" style={pill(false)}><RotateCcw size={14} />{t("다시 풀기")}</button>}
          {onReview && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><BestMoveJumpButton size={34} title={t("리뷰하기")} onClick={() => onReview(reviewGameOf(g))} /></span>}
        </div>
        <div style={{ fontSize: 11, color: SOFT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.opening || t("오프닝 정보 없음")}</div>
      </div>
    </div>
  );
}

export function DrillSection({ g, onReview }) {
  const [done, setDone] = useState(loadDone);
  const queue = useMemo(() => drillQueue(g, done), [g, done]);
  // 지금 푸는 문제는 키로 붙잡아 둔다 — 맞히면 목록 순서가 바뀌어도(맞힌 문제는 뒤로) 정답 화면이 그대로 남고, "다음 문제"로 넘어간다.
  const [curKey, setCurKey] = useState(null);
  const solvedN = queue.filter((x) => x.done).length;
  const item = queue.find((x) => x.key === curKey) || queue[0];
  const idx = item ? queue.indexOf(item) : 0;
  const goNext = () => {
    if (!item) return;
    const rest = queue.filter((x) => x.key !== item.key);
    const nx = rest.find((x) => !x.done) || rest[0];
    if (nx) setCurKey(nx.key);
  };
  const onSolved = (key) => { setCurKey(key); markDone(key); };
  const markDone = (key) => setDone((prev) => { if (prev.has(key)) return prev; const n = new Set(prev); n.add(key); saveDone(n); return n; });
  return (
    <div style={card}>
      <div style={headRow}>
        <span style={iconBox("#C8453B")}><Target size={19} color="#C8453B" /></span>
        <div style={{ minWidth: 0, flex: 1 }}><div style={kicker}>REVIEW</div><div style={title}>{t("실수 복습")}</div></div>
        {queue.length > 0 && <span style={{ fontSize: 12, fontWeight: 700, fontFamily: SITE_FONT, color: solvedN === queue.length ? SAGE : "#8A6C2F", background: "rgba(90,58,34,.10)", border: "1px solid " + LINE, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{solvedN}/{queue.length}</span>}
      </div>
      <div style={{ padding: 14 }}>
        {!item ? <p style={{ margin: 0, fontSize: 13, color: SOFT }}>{t("최근 대국에 복습할 실수 없음")}</p> : (
          <>
            <DrillBoard item={item} onSolved={onSolved} onReview={onReview} />
            {queue.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 12, borderTop: "1px solid " + LINE }}>
                <div style={{ display: "flex", gap: 5, flex: 1, flexWrap: "wrap" }}>
                  {queue.map((x, i) => <button key={x.key} type="button" aria-label={t("{0}번 문제", i + 1)} onClick={() => setCurKey(x.key)} className="press"
                    style={{ width: 20, height: 20, borderRadius: 6, border: i === idx ? "2px solid " + INK : "1px solid " + LINE, background: x.done ? "#A9C589" : "rgba(255,255,255,.6)", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{x.done && <Check size={11} color={SAGE} />}</button>)}
                </div>
                <button type="button" onClick={goNext} className="press" style={pill(true)}>{t("다음 문제")}<ChevronRight size={14} /></button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function LessonRecs({ g, lessonState, onOpenLesson }) {
  const recs = useMemo(() => recommendLessons(g, { isDone: (id) => isLessonDone(lessonState, id), has: (id) => !!lessonById(id) }), [g, lessonState]);
  const why = (r) => (r.why.kind === "cause" ? t("반복 실수: {0}", causeLabel(r.why.key)) : t("약한 구간: {0}", phaseLabel(r.why.key)));
  return (
    <div style={card}>
      <div style={headRow}>
        <span style={iconBox("#3E7CC4")}><BookOpen size={19} color="#3E7CC4" /></span>
        <div style={{ minWidth: 0, flex: 1 }}><div style={kicker}>NEXT STUDY</div><div style={title}>{t("추가 학습")}</div></div>
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {!recs.length ? <p style={{ margin: 0, fontSize: 13, color: SOFT }}>{t("반복되는 약점이 아직 없음. 대국이 쌓이면 맞춤 레슨 추천")}</p> : recs.map((r) => {
          const l = lessonById(r.id), st = stageOf(l.stage);
          return (
            <button key={r.id} type="button" onClick={() => onOpenLesson(l)} className="press"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderRadius: 12, textAlign: "left", cursor: "pointer", fontFamily: SITE_FONT, background: r.done ? "#E4EFD8" : "rgba(255,255,255,.55)", border: "1px solid " + (r.done ? "#A9C589" : LINE) }}>
              <span style={iconBox(r.done ? SAGE : BRASS)}>{r.done ? <Check size={18} color={SAGE} /> : <Lightbulb size={18} color={BRASS} />}</span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: INK }}>{l.title()}</span>
                <span style={{ display: "block", fontSize: 11, color: SOFT, marginTop: 2 }}>{st.title()} · {why(r)}</span>
              </span>
              <ChevronRight size={16} color={SOFT} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* recent: 성장 분석과 같은 최근 5판(growthHome.jsx useRecentSources). onGoAnalysis: 분석 탭으로(리뷰된 판이 없을 때). */
export function PracticePanel({ recent, lessonState, onLessonComplete, lessonCoins, onReview, onGoAnalysis, loggedIn }) {
  const { g, reviewed } = useCachedGrowth(recent);
  const [open, setOpen] = useState(null);
  const summary = g ? [g.weakPhase ? t("약한 구간: {0}", phaseLabel(g.weakPhase.key)) : null, g.focus ? t("반복 실수: {0}", causeLabel(g.focus.cause)) : null].filter(Boolean) : [];
  return (
    <section aria-label={t("맞춤 학습")} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={iconBox(T.brassHi)}><GraduationCap size={18} color={T.brassHi} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: "#F1E6D0" }}>{t("맞춤 학습")}</div>
          <div style={{ fontSize: 11.5, color: "#C9B58C", marginTop: 2 }}>{reviewed ? t("최근 {0}판 성장 분석 기준", reviewed) : t("성장 분석 결과로 복습 문제와 레슨 추천")}</div>
        </div>
      </div>
      {summary.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{summary.map((s) => <span key={s} style={{ fontSize: 11.5, fontWeight: 800, color: T.brassHi, background: "rgba(236,203,134,.1)", border: "1px solid rgba(236,203,134,.3)", borderRadius: 999, padding: "3px 10px" }}>{s}</span>)}</div>}
      {!g ? (
        <div style={{ ...card, padding: "20px 16px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}><Mascot name="milku" emotion="think" size={72} /></div>
          <p style={{ fontSize: 13, color: INK, fontWeight: 700, margin: "8px 0 12px", lineHeight: 1.55 }}>{loggedIn ? t("분석 탭의 성장 분석이 최근 대국을 리뷰하면 복습 문제와 추천 레슨이 생김") : t("로그인하면 내 대국으로 복습 문제와 추천 레슨이 생김")}</p>
          {onGoAnalysis && <button type="button" onClick={onGoAnalysis} className="press" style={{ ...pill(true), margin: "0 auto" }}>{t("성장 분석 보기")}<ChevronRight size={14} /></button>}
        </div>
      ) : (
        <>
          <DrillSection g={g} onReview={onReview} />
          <LessonRecs g={g} lessonState={lessonState} onOpenLesson={setOpen} />
        </>
      )}
      {open && <LessonPlayer lesson={open} lessonState={lessonState} coins={lessonCoins} onClose={() => setOpen(null)} onComplete={onLessonComplete} onNext={(l) => { setOpen(null); setTimeout(() => setOpen(l), 60); }} />}
    </section>
  );
}
