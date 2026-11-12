// (v0.7.5, 사용자 요청) 새 레슨 화면 — 도감 탭에 들어가는 "레슨 경로"(LessonPath)와 전체 화면 학습 화면(LessonPlayer).
//  단계 색·상징 = 수 등급(좋음 → 우수 → 최선 → 유일 → 탁월)의 색과 아이콘(lib/moveKinds.js QCOLOR, /move-fx/*.png). 등급이 오를수록 단계도 오른다.
//  경로: 입체 마름모 타일이 점선 길로 이어지며 아래에서 위로 올라간다(끝낸 구간은 등급 색으로 채워진다). 단계가 바뀌는 곳에는 등급 배지가 있는 장 제목.
//        배경은 보이는 단계의 색으로 부드럽게 바뀌고, 은은한 체스판 결·기물 실루엣이 깔린다. 위는 코치 말풍선·진행 링, 아래는 단계 정보·다음 레슨(반투명 유리 막대).
//  학습 화면: 보드 + 코치 + 진행 막대 + 하단 피드백 시트(정답은 등급 배지, 오답은 붉은 시트). 판정은 lib/lessons/engine.js(검사 스크립트와 같은 코드).
import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Check, List, X, ChevronDown, ChevronUp, Lightbulb, RotateCcw, Circle, Play, Grid3x3, Zap, Crown, Scale, Castle, MoveDiagonal, Coins, HandCoins, GitFork, Pin, ArrowRightLeft, Eye, PanelBottom, Rows3, Shell, Target, Rocket, Shield, ShieldAlert, Square, ArrowUpDown, Flag, BookOpen } from "lucide-react";
// 레슨 아이콘(curriculum.js의 icon 이름) — 아이콘 전체를 번들에 싣지 않도록 쓰는 것만 가져온다(check-lessons가 빠진 이름을 막는다)
export const LESSON_ICONS = { Grid3x3, Zap, Crown, Scale, Castle, MoveDiagonal, Coins, HandCoins, GitFork, Pin, ArrowRightLeft, Eye, PanelBottom, Rows3, Shell, Target, Rocket, Shield, ShieldAlert, Square, ArrowUpDown, Flag, BookOpen };
import { PIECE_IMG_SETS } from "../lib/theme.js";
import { QCOLOR } from "../lib/moveKinds.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { t } from "../lib/i18n.js";
import { playSfx } from "../lib/prefs.js";
import { Board, CoinIcon, Mascot, useBoardSize, useNarrow } from "./common.jsx";
import { STAGES, allLessons, stageOf, lessonsOfStage, LESSON_REWARD } from "../lib/lessons/curriculum.js";
import { lessonStatus, nextLesson, isLessonDone } from "../lib/lessons/progress.js";
import { boardOf, turnOf, legalTargets, playMove, playUci, goalMet, tapAnswer, readMarks, sqToRc, rcToSq } from "../lib/lessons/engine.js";

/* ── 색: 등급 색 하나에서 단계 팔레트를 만든다(사이트 흑단 바탕 #0B0704 쪽으로 섞어 어둡게) ── */
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (a) => "#" + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, k) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * k)); };
const alpha = (h, a) => "rgba(" + rgb(h).join(",") + "," + a + ")";
const PAPER = "#F1E6D0", INK = "#2A1B0E";
const themeCache = {};
export function stageTheme(stage) {
  if (themeCache[stage.id]) return themeCache[stage.id];
  const c = QCOLOR[stage.grade] || "#8FB55E";
  return (themeCache[stage.id] = { c, hi: mix(c, "#FFFFFF", 0.42), lo: mix(c, "#000000", 0.32), edge: mix(c, "#000000", 0.58), bg: mix(c, "#0B0704", 0.88), bg2: mix(c, "#0B0704", 0.76), icon: "/move-fx/" + stage.grade + ".png" });
}
const stageNo = (id) => STAGES.findIndex((s) => s.id === id) + 1;
const CHECKER = { backgroundImage: "repeating-conic-gradient(rgba(255,255,255,.035) 0 25%, transparent 0 50%)", backgroundSize: "64px 64px",
  WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, #000 20%, transparent 80%)", maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, #000 20%, transparent 80%)" };

const pieceImg = (set, p, color = "w") => { const s = (PIECE_IMG_SETS[set] || PIECE_IMG_SETS.classic).images[p]; return s && s[color] ? s[color].src : ""; };
function LessonIcon({ icon, size, color }) {
  if (String(icon).startsWith("piece:")) return <img src={pieceImg("classic", icon.slice(6), "w")} alt="" draggable={false} style={{ width: size * 1.3, height: size * 1.3, objectFit: "contain", filter: "drop-shadow(0 2px 2px rgba(0,0,0,.35))" }} />;
  const I = LESSON_ICONS[icon] || Circle;
  return <I size={size} strokeWidth={2.2} color={color} style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,.3))" }} />;
}
/** 수 등급 배지(원 + 흰 글리프) — 단계의 상징. */
export function GradeBadge({ stage, size = 36, glow = false }) {
  const th = stageTheme(stage);
  return (
    <span aria-hidden="true" style={{ position: "relative", width: size, height: size, flexShrink: 0, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(circle at 35% 30%, " + th.hi + ", " + th.c + " 62%, " + th.lo + ")", boxShadow: "inset 0 1px 0 rgba(255,255,255,.35), 0 " + Math.max(2, size / 14) + "px 0 " + th.edge + (glow ? ", 0 0 " + size * 0.6 + "px " + alpha(th.c, 0.55) : "") }}>
      <img src={th.icon} alt="" draggable={false} style={{ width: size * 0.58, height: size * 0.58, objectFit: "contain" }} />
    </span>
  );
}
function ProgressRing({ done, total, color, size = 46 }) {
  const r = size / 2 - 4, C = 2 * Math.PI * r, f = total ? done / total : 0;
  return (
    <span style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }} aria-label={t("레슨 {0}/{1} 완료", done, total)}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - f)} style={{ transition: "stroke-dashoffset .6s, stroke .6s" }} />
      </svg>
      <span style={{ fontFamily: SITE_FONT, fontSize: 11.5, fontWeight: 900, color: "#FFF6E2", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{done}<span style={{ opacity: 0.55 }}>/{total}</span></span>
    </span>
  );
}

/* ============================================================ 레슨 경로 ============================================================ */
const PAT = [0, 1, 0, -1];      // 레슨 칸의 가로 위치(가운데 기준, dx 배수) — 지그재그로 이어진다
const topIn = (sc, el) => el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;

// (v0.7.5, 사용자 요청) 오프닝 레슨 블록에는 아이콘 대신 오프닝 이름을 쓴다. 마름모는 가운데가 가장 넓고 위아래로 좁아지므로,
//  단어를 1~3줄로 나누는 모든 경우 중 각 줄이 그 높이의 마름모 폭 안에 들어가면서 글자가 가장 커지는 배치를 고른다(언어마다 이름 길이가 달라도 맞는다).
const emWidth = (str) => [...str].reduce((w, ch) => w + (/[\u1100-\u11FF\u3040-\u30FF\u3130-\u318F\u3400-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]/.test(ch) ? 1 : ch === " " ? 0.3 : /[\u0900-\u097F]/.test(ch) ? 0.62 : 0.56), 0);
function fitTileName(name, size) {
  const words = name.split(/\s+/).filter(Boolean), LH = 1.12, maxFs = size * 0.155;
  const splits = [];
  const rec = (i, cur) => { if (i === words.length) { splits.push(cur); return; } if (cur.length) rec(i + 1, [...cur.slice(0, -1), cur[cur.length - 1] + " " + words[i]]); if (cur.length < 3) rec(i + 1, [...cur, words[i]]); };
  rec(1, [words[0] || ""]);
  let best = { lines: [name], fs: 7 };
  for (const lines of splits) {
    let lo = 6, hi = maxFs;
    const fits = (fs) => lines.every((ln, k) => { const yc = (k - (lines.length - 1) / 2) * fs * LH, yEdge = Math.abs(yc) + fs * 0.55; return emWidth(ln) * fs <= (size - 2 * yEdge) * 0.88; });
    if (!fits(lo)) continue;
    for (let n = 0; n < 12; n++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
    if (lo > best.fs + 0.3 || (Math.abs(lo - best.fs) <= 0.3 && lines.length < best.lines.length)) best = { lines, fs: lo };
  }
  return best;
}
// (v0.7.5, 사용자 요청) 오프닝 레파토리 구간의 레슨 경로 배경 — 레슨 줄마다 체스판 칸 무늬 띠를 깔고,
//  블록 반대쪽에 그 오프닝의 실제 포지션(레슨에서 두는 주요 수순의 끝)을 작은 체스판 도표로 보여 준다. 마지막에 둔 수는 강조.
//  판은 학습자 진영 쪽에서 본다(흑으로 두는 오프닝은 뒤집힘). 포지션은 레슨 데이터에서 바로 만들므로 수순을 고치면 그림도 따라 바뀐다.
const BAND_FADE_X = "linear-gradient(90deg, transparent 0%, #000 10%, rgba(0,0,0,.35) 34%, rgba(0,0,0,.35) 66%, #000 90%, transparent 100%)";
const BAND_FADE_Y = "linear-gradient(180deg, transparent 0%, #000 26%, #000 74%, transparent 100%)";
const DIA_LIGHT = "#EAD8B6", DIA_DARK = "#A9774B", DIA_MOVE = "rgba(246,200,80,.62)";
function openingDiagram(lesson) {
  const st = lesson.steps(), mv = st.find((x) => x.kind === "move"), end = st.find((x) => x.kind === "choice") || st[st.length - 1];
  const fen = end.fen, last = mv && mv.line.length ? mv.line[mv.line.length - 1].hint : null;
  return { board: boardOf(fen), flip: turnOf(fen) === "w", last };   // 마지막 수를 둔 쪽(학습자) = 지금 차례가 아닌 쪽
}
function OpeningDiagram({ lesson, size }) {
  const { board, flip, last } = useMemo(() => openingDiagram(lesson), [lesson]);
  const q = size / 8, hl = last ? [last.slice(0, 2), last.slice(2, 4)] : [];
  const cells = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const vr = flip ? 7 - r : r, vc = flip ? 7 - c : c, sq = rcToSq(r, c), p = board[r][c];
    cells.push(<rect key={"s" + sq} x={vc * q} y={vr * q} width={q} height={q} fill={(r + c) % 2 ? DIA_DARK : DIA_LIGHT} />);
    if (hl.includes(sq)) cells.push(<rect key={"h" + sq} x={vc * q} y={vr * q} width={q} height={q} fill={DIA_MOVE} />);
    if (p) cells.push(<image key={"p" + sq} href={pieceImg("classic", p.t, p.c)} x={vc * q} y={vr * q} width={q} height={q} />);
  }
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>{cells}</svg>;
}
// 도표는 좌우를 번갈아(같은 쪽 도표는 두 줄 간격이라 줄 높이보다 크게 그려도 겹치지 않는다) 지그재그 경로 바로 바깥에 둔다.
function OpeningBand({ lesson, top, height, side, reach, narrow, dim }) {
  const dia = Math.round(height * (narrow ? 1.0 : 1.5));
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top, height, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, WebkitMaskImage: BAND_FADE_Y, maskImage: BAND_FADE_Y }}>
        <div style={{ position: "absolute", inset: 0, WebkitMaskImage: BAND_FADE_X, maskImage: BAND_FADE_X, opacity: dim ? 0.5 : 1,
          backgroundImage: "repeating-conic-gradient(rgba(234,216,182,.085) 0 25%, rgba(0,0,0,.12) 0 50%)", backgroundSize: (height / 2) + "px " + (height / 2) + "px", backgroundPosition: "center " + (height / 4) + "px" }} />
      </div>
      <div style={{ position: "absolute", top: "50%", left: "50%", marginLeft: side === "left" ? -(reach + dia + 6) : reach, transform: "translateY(-50%)", padding: 3, zIndex: 1, borderRadius: 5, background: "linear-gradient(160deg, #5A3A20, #2A1A0D)",
        boxShadow: "0 8px 18px -6px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.12)", opacity: dim ? 0.32 : 0.92, filter: dim ? "grayscale(.6)" : "none" }}>
        <div style={{ borderRadius: 2, overflow: "hidden" }}><OpeningDiagram lesson={lesson} size={dia} /></div>
      </div>
    </div>
  );
}

function TileName({ name, size, locked, edge }) {
  const { lines, fs } = useMemo(() => fitTileName(name, size), [name, size]);
  return (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: SITE_FONT, fontWeight: 900, fontSize: fs, lineHeight: 1.12, letterSpacing: "-.03em", textAlign: "center", whiteSpace: "nowrap",
      color: locked ? "rgba(255,255,255,.4)" : "#FFFFFF", textShadow: locked ? "none" : "0 1px 0 " + edge + ", 0 2px 5px rgba(0,0,0,.35)" }}>
      {locked && <Lock size={Math.max(9, fs * 0.9)} color="rgba(255,255,255,.38)" style={{ marginBottom: 2 }} />}
      {lines.map((ln, i) => <span key={i}>{ln}</span>)}
    </span>
  );
}

function LessonTile({ lesson, status, stage, size, onOpen, flashLock }) {
  const th = stageTheme(stage);
  const cur = status === "current", done = status === "done", locked = status === "locked";
  const side = size / Math.SQRT2;
  const face = locked ? "rgba(255,255,255,.05)" : "linear-gradient(155deg, " + th.hi + " 0%, " + th.c + " 48%, " + th.lo + " 100%)";
  return (
    <motion.button type="button" onClick={() => onOpen(lesson)} title={lesson.title()} aria-label={lesson.title() + (locked ? ", " + t("잠김") : done ? ", " + t("완료") : "")} className={"lesson-tile" + (locked ? " is-locked" : "")}
      animate={flashLock ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }} transition={{ duration: 0.36 }}
      style={{ position: "relative", width: size, height: size, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}>
      {cur && <>
        <span aria-hidden="true" className="lesson-halo" style={{ "--c": alpha(th.hi, 0.55), position: "absolute", left: "50%", top: "50%", width: side, height: side, marginLeft: -side / 2, marginTop: -side / 2, borderRadius: "24%", transform: "rotate(45deg)" }} />
        <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: side * 1.9, height: side * 1.9, marginLeft: -side * 0.95, marginTop: -side * 0.95, borderRadius: "50%", background: "radial-gradient(circle, " + alpha(th.c, 0.45) + ", transparent 65%)", pointerEvents: "none" }} />
      </>}
      {/* 두께(아래 모서리) */}
      {!locked && <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: side, height: side, marginLeft: -side / 2, marginTop: -side / 2 + 7, borderRadius: "24%", transform: "rotate(45deg)", background: th.edge, boxShadow: "0 10px 18px -6px rgba(0,0,0,.6)" }} />}
      {/* 윗면 */}
      <span className="lesson-face" aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: side, height: side, marginLeft: -side / 2, marginTop: -side / 2, borderRadius: "24%", transform: "rotate(45deg)", background: face,
        boxShadow: locked ? "inset 0 0 0 1.5px rgba(255,255,255,.12)" : "inset 0 2px 0 rgba(255,255,255,.45), inset 0 -2px 0 rgba(0,0,0,.18)" }} />
      <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
        {lesson.motif ? <TileName name={lesson.title()} size={size} locked={locked} edge={th.edge} />
          : locked ? <Lock size={size * 0.2} color="rgba(255,255,255,.42)" /> : <LessonIcon icon={lesson.icon} size={size * 0.27} color="#FFFFFF" />}
      </span>
      {done && <span aria-hidden="true" style={{ position: "absolute", zIndex: 2, right: size * 0.06, top: size * 0.06, width: 20, height: 20, borderRadius: "50%", background: PAPER, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 4px rgba(0,0,0,.4)" }}><Check size={12} strokeWidth={3.4} color={th.lo} /></span>}
      {cur && (
        <span aria-hidden="true" style={{ position: "absolute", zIndex: 3, left: "50%", bottom: "100%", transform: "translate(-50%, 2px)", display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px 6px 9px", borderRadius: 10, background: PAPER, color: INK, fontFamily: SITE_FONT, whiteSpace: "nowrap", boxShadow: "0 6px 14px rgba(0,0,0,.45)" }}>
            <Play size={11} fill={th.lo} color={th.lo} />
            <span style={{ fontSize: 12.5, fontWeight: 900 }}>{lesson.title()}</span>
          </span>
          <span style={{ width: 10, height: 10, marginTop: -5, background: PAPER, transform: "rotate(45deg)" }} />
        </span>
      )}
    </motion.button>
  );
}

function ChapterMark({ stage, done, total }) {
  const th = stageTheme(stage);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "0 18px", boxSizing: "border-box" }}>
      <span aria-hidden="true" style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, " + alpha(th.hi, 0.5) + ")" }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }}>
        <GradeBadge stage={stage} size={44} glow />
        <span style={{ fontFamily: SITE_FONT, fontSize: 11, fontWeight: 800, color: alpha(th.hi, 0.85), letterSpacing: ".04em" }}>{t("{0}단계", stageNo(stage.id))}</span>
        <span style={{ fontFamily: SITE_FONT, fontSize: 18, fontWeight: 900, letterSpacing: "-.02em", color: "#FFF6E2", lineHeight: 1.1, textAlign: "center" }}>{stage.title()}</span>
        <span style={{ fontFamily: SITE_FONT, fontSize: 11.5, fontWeight: 600, color: "rgba(255,246,226,.6)", textAlign: "center" }}>{stage.desc()} <b style={{ color: th.hi, fontVariantNumeric: "tabular-nums" }}>{done}/{total}</b></span>
      </div>
      <span aria-hidden="true" style={{ flex: 1, height: 1, background: "linear-gradient(90deg, " + alpha(th.hi, 0.5) + ", transparent)" }} />
    </div>
  );
}

/** 도감 탭의 레슨 경로. height: 이 판의 높이(CSS 값). coins: 로그인해 코인을 받을 수 있는지. */
export function LessonPath({ lessonState, onComplete, height, coins }) {
  const lessons = allLessons();
  const narrow = useNarrow(640);
  const D = narrow ? 84 : 96;                    // 타일 크기
  const DX = D * 0.62, ROW = D * 0.78, CH = 170;  // 지그재그 가로 폭 · 레슨 줄 높이 · 장 제목 높이
  const TOP = narrow ? 128 : 132, BOTTOM = narrow ? 168 : 120;
  // 위에서 아래로의 배치(맨 아래가 첫 레슨): 단계마다 [그 단계의 레슨(마지막→처음)], 그 아래 장 제목
  const layout = useMemo(() => {
    const items = []; let y = TOP;
    for (const st of [...STAGES].reverse()) {
      const ls = lessons.filter((l) => l.stage === st.id).reverse();
      for (const l of ls) { items.push({ kind: "lesson", lesson: l, stage: st, x: PAT[l.index % PAT.length] * DX, y: y + ROW / 2 }); y += ROW; }
      items.push({ kind: "stage", stage: st, y: y + 14 }); y += CH;
    }
    return { items, height: y + BOTTOM };
  }, [lessons, DX, ROW, TOP, BOTTOM]);
  const scRef = useRef(null), tileRefs = useRef({});
  const nxt = nextLesson(lessonState);
  const [open, setOpen] = useState(null);
  const [lockFlash, setLockFlash] = useState(null);
  const [viewStage, setViewStage] = useState(nxt ? nxt.stage : STAGES[STAGES.length - 1].id);
  const [listOpen, setListOpen] = useState(false);
  const [curDir, setCurDir] = useState(0);
  const [coachMsg, setCoachMsg] = useState(null);
  const vStage = stageOf(viewStage), vth = stageTheme(vStage);

  const scrollToLesson = useCallback((id, smooth = true) => {
    const sc = scRef.current, el = tileRefs.current[id]; if (!sc || !el) return;
    sc.scrollTo({ top: topIn(sc, el) - sc.clientHeight / 2 + D / 2 + 10, behavior: smooth ? "smooth" : "auto" });
  }, [D]);
  // 지금 할 레슨이 바뀌면(처음 열 때 · 진행 기록을 늦게 불러왔을 때 · 레슨을 끝냈을 때) 그 칸으로 스크롤한다
  const nxtId = nxt ? nxt.id : null;
  useLayoutEffect(() => { if (nxtId) scrollToLesson(nxtId, false); }, [nxtId, scrollToLesson]);
  const onScroll = () => {
    const sc = scRef.current; if (!sc) return;
    const mid = sc.scrollTop + sc.clientHeight * 0.55;
    let best = null, bd = Infinity;
    for (const it of layout.items) if (it.kind === "lesson") { const d = Math.abs(it.y - mid); if (d < bd) { bd = d; best = it.stage.id; } }
    if (best && best !== viewStage) setViewStage(best);
    if (nxt) { const it = layout.items.find((x) => x.lesson && x.lesson.id === nxt.id); if (it) { const y = it.y - sc.scrollTop; setCurDir(y < TOP - 20 ? -1 : y > sc.clientHeight - BOTTOM + 10 ? 1 : 0); } }
  };
  useEffect(() => { onScroll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [layout]);

  const openLesson = (l) => {
    if (lessonStatus(lessonState, l.id) === "locked") { setLockFlash(l.id); setCoachMsg(t("앞 레슨을 먼저 끝내면 열립니다.")); setTimeout(() => setLockFlash(null), 420); return; }
    setCoachMsg(null); setOpen(l);
  };
  const doneN = lessons.filter((l) => isLessonDone(lessonState, l.id)).length;
  const coach = coachMsg || (nxt ? t("다음 레슨은 {0}입니다. {1}.", nxt.title(), nxt.sub()) : t("모든 레슨을 끝냈습니다. 원하는 레슨을 다시 복습해 보세요."));
  const vLs = lessonsOfStage(viewStage), vDone = vLs.filter((l) => isLessonDone(lessonState, l.id)).length;
  // 경로 선: 레슨 순서대로 이웃한 두 칸을 잇는다(끝낸 레슨까지는 등급 색 실선, 그 뒤는 옅은 점선)
  const pts = layout.items.filter((x) => x.kind === "lesson").sort((a, b) => a.lesson.index - b.lesson.index);
  const SW = DX * 2 + D * 2;
  // 단계가 바뀌는 구간은 잇지 않는다 — 그 사이의 장 제목(배지·이름·설명)을 선이 가로질러 글자를 가리기 때문(BUG-155). 장 배지가 두 단계를 잇는 역할을 한다.
  const segs = pts.slice(1).map((p, i) => { const a = pts[i]; return { a, b: p, lit: isLessonDone(lessonState, a.lesson.id) }; }).filter((s) => s.a.stage.id === s.b.stage.id);
  // 기물 실루엣: 단계마다 두 개, 그 단계 구간 양옆에
  const ghosts = [];
  for (const st of STAGES) {
    const ys = layout.items.filter((x) => x.kind === "lesson" && x.stage.id === st.id).map((x) => x.y);
    if (!ys.length || lessonsOfStage(st.id).some((l) => l.motif)) continue;   // 오프닝 문양 띠가 있는 단계는 기물 실루엣을 두지 않는다(이름표·문양과 겹침)
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    ghosts.push({ key: st.id + "a", src: pieceImg("classic", st.deco[0]), y: y0 + (y1 - y0) * 0.25, side: -1 }, { key: st.id + "b", src: pieceImg("classic", st.deco[1]), y: y0 + (y1 - y0) * 0.78, side: 1 });
  }

  return (
    <div className="lesson-path" style={{ position: "relative", height, minHeight: 360, borderRadius: 18, overflow: "hidden", isolation: "isolate", fontFamily: SITE_FONT, border: "1px solid " + alpha(vth.hi, 0.18), transition: "border-color .6s", background: "#0B0704" }}>
      <style>{`
        @keyframes lessonHalo{0%{opacity:.85;transform:rotate(45deg) scale(1)}100%{opacity:0;transform:rotate(45deg) scale(1.55)}}
        .lesson-halo{border:2px solid var(--c);animation:lessonHalo 1.8s ease-out infinite}
        .lesson-tile .lesson-face{transition:transform .18s, filter .18s}
        .lesson-tile:not(.is-locked):hover .lesson-face{filter:brightness(1.08)}
        .lesson-tile:focus-visible{outline:2px solid #FFF6E2;outline-offset:4px;border-radius:14px}
        .lesson-scroll{scrollbar-width:none}.lesson-scroll::-webkit-scrollbar{display:none}
        .lesson-glass{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
      `}</style>
      {/* 배경: 단계마다 한 장씩 겹쳐 두고 보이는 단계만 드러낸다(부드럽게 바뀜) */}
      {STAGES.map((s) => { const th = stageTheme(s); return <div key={s.id} aria-hidden="true" style={{ position: "absolute", inset: 0, opacity: s.id === viewStage ? 1 : 0, transition: "opacity .7s", background: "radial-gradient(120% 70% at 50% 40%, " + th.bg2 + " 0%, " + th.bg + " 62%, #0B0704 100%)" }} />; })}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, ...CHECKER }} />
      {/* 경로 */}
      <div ref={scRef} onScroll={onScroll} className="lesson-scroll" style={{ position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ position: "relative", height: layout.height }}>
          {/* (v0.7.5, 사용자 요청) 오프닝 레파토리 구간 배경: 레슨 줄마다 그 오프닝을 상징하는 문양 띠와 이름 */}
          {layout.items.filter((it) => it.kind === "lesson" && it.lesson.motif).map((it) => (
            <OpeningBand key={"band" + it.lesson.id} lesson={it.lesson} top={it.y - ROW / 2} height={ROW} side={it.lesson.index % 2 ? "right" : "left"} reach={DX + D * 0.5 + (narrow ? 10 : 22)} narrow={narrow}
              dim={lessonStatus(lessonState, it.lesson.id) === "locked"} />
          ))}
          {ghosts.map((g) => <img key={g.key} src={g.src} alt="" aria-hidden="true" draggable={false} loading="lazy" style={{ position: "absolute", left: "50%", top: g.y - D * 0.9, marginLeft: g.side * (DX + D * (narrow ? 0.95 : 1.6)) - D * 0.6, width: D * 1.2, height: D * 1.8, objectFit: "contain", filter: "brightness(0) invert(1)", opacity: 0.06, pointerEvents: "none" }} />)}
          <svg aria-hidden="true" width={SW} height={layout.height} style={{ position: "absolute", left: "50%", top: 0, marginLeft: -SW / 2, pointerEvents: "none" }}>
            {segs.map((s, i) => {
              const th = stageTheme(s.b.stage);
              return <line key={i} x1={SW / 2 + s.a.x} y1={s.a.y} x2={SW / 2 + s.b.x} y2={s.b.y} stroke={s.lit ? th.hi : "rgba(255,255,255,.16)"} strokeWidth={s.lit ? 5 : 3} strokeLinecap="round" strokeDasharray={s.lit ? undefined : "1 10"} opacity={s.lit ? 0.8 : 1} />;
            })}
          </svg>
          {layout.items.map((it) => {
            if (it.kind === "stage") {
              const sl = lessonsOfStage(it.stage.id);
              return <div key={"st" + it.stage.id} style={{ position: "absolute", left: 0, right: 0, top: it.y }}><ChapterMark stage={it.stage} done={sl.filter((l) => isLessonDone(lessonState, l.id)).length} total={sl.length} /></div>;
            }
            return (
              <div key={it.lesson.id} ref={(el) => { tileRefs.current[it.lesson.id] = el; }} style={{ position: "absolute", left: "50%", top: it.y - D / 2, marginLeft: it.x - D / 2, width: D, height: D, zIndex: lessonStatus(lessonState, it.lesson.id) === "current" ? 2 : 1 }}>
                <LessonTile lesson={it.lesson} status={lessonStatus(lessonState, it.lesson.id)} stage={it.stage} size={D} onOpen={openLesson} flashLock={lockFlash === it.lesson.id} />
              </div>
            );
          })}
        </div>
      </div>
      {/* 위: 코치 */}
      <div className="lesson-glass" style={{ position: "absolute", left: 10, right: 10, top: 10, zIndex: 3, display: "flex", alignItems: "center", gap: 10, padding: "8px 10px 8px 8px", borderRadius: 14,
        background: alpha(vth.bg, 0.62), border: "1px solid rgba(255,255,255,.08)", boxShadow: "0 10px 24px -12px rgba(0,0,0,.7)" }}>
        <Mascot name="milku" emotion={coachMsg ? "think" : "great"} size={narrow ? 42 : 48} />
        <div aria-live="polite" style={{ position: "relative", flex: "0 1 auto", maxWidth: 560, minWidth: 0, padding: "9px 12px", borderRadius: 11, background: PAPER, color: INK, fontSize: narrow ? 13 : 13.5, fontWeight: 700, lineHeight: 1.4 }}>
          <span aria-hidden="true" style={{ position: "absolute", left: -5, top: "50%", marginTop: -5, width: 10, height: 10, background: PAPER, transform: "rotate(45deg)" }} />
          <span style={{ position: "relative" }}>{coach}</span>
        </div>
        <span style={{ flex: 1 }} />
        <ProgressRing done={doneN} total={lessons.length} color={vth.hi} size={narrow ? 42 : 48} />
      </div>
      {/* 아래: 단계 정보 + 다음 레슨 */}
      <div className="lesson-glass" style={{ position: "absolute", left: 10, right: 10, bottom: 10, zIndex: 3, padding: 10, borderRadius: 16, background: alpha(vth.bg, 0.7), border: "1px solid rgba(255,255,255,.08)", boxShadow: "0 -6px 24px -12px rgba(0,0,0,.7)",
        display: "flex", flexDirection: narrow ? "column" : "row", alignItems: narrow ? "stretch" : "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <button type="button" onClick={() => setListOpen(true)} aria-label={t("단계 목록")} className="press"
            style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", color: "#FFF6E2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><List size={19} /></button>
          <GradeBadge stage={vStage} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={viewStage} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: vth.hi }}>{t("{0}단계", stageNo(viewStage))}</div>
                <div style={{ fontSize: narrow ? 16 : 17, fontWeight: 900, color: "#FFF6E2", letterSpacing: "-.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{vStage.title()}</div>
              </motion.div>
            </AnimatePresence>
            <div aria-hidden="true" style={{ marginTop: 5, height: 4, borderRadius: 2, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
              <div style={{ width: (100 * vDone) / Math.max(1, vLs.length) + "%", height: "100%", background: vth.hi, transition: "width .5s, background .6s" }} />
            </div>
          </div>
          {nxt && curDir !== 0 && (
            <button type="button" onClick={() => scrollToLesson(nxt.id)} aria-label={t("지금 할 레슨으로 이동")} className="press"
              style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", color: "#FFF6E2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              {curDir < 0 ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
            </button>
          )}
        </div>
        <CtaButton theme={nxt ? stageTheme(stageOf(nxt.stage)) : vth} onClick={() => openLesson(nxt || lessons[0])} wide={narrow}>{nxt ? t("다음 레슨") : t("처음부터 복습")}</CtaButton>
      </div>
      {/* 단계 목록 */}
      <AnimatePresence>
        {listOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setListOpen(false)}
            style={{ position: "absolute", inset: 0, zIndex: 5, background: "rgba(8,5,3,.6)", display: "flex", alignItems: "flex-end", padding: 10 }}>
            <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ duration: 0.22 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("단계 목록")} className="lesson-glass"
              style={{ width: "100%", maxHeight: "86%", overflowY: "auto", padding: 8, borderRadius: 18, background: "rgba(22,15,10,.88)", border: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column", gap: 6 }}>
              {STAGES.map((s) => {
                const th = stageTheme(s), sl = lessonsOfStage(s.id), sd = sl.filter((l) => isLessonDone(lessonState, l.id)).length;
                return (
                  <button key={s.id} type="button" className="press" onClick={() => { setListOpen(false); scrollToLesson((sl.find((l) => !isLessonDone(lessonState, l.id)) || sl[0]).id); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14, border: "1px solid " + alpha(th.hi, 0.18), cursor: "pointer", textAlign: "left", background: "linear-gradient(100deg, " + th.bg2 + ", " + th.bg + ")" }}>
                    <GradeBadge stage={s} size={36} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontFamily: SITE_FONT, fontSize: 11, fontWeight: 800, color: th.hi }}>{t("{0}단계", stageNo(s.id))}</span>
                      <span style={{ display: "block", fontFamily: SITE_FONT, fontSize: 15, fontWeight: 900, color: "#FFF6E2" }}>{s.title()}</span>
                      <span style={{ display: "block", fontFamily: SITE_FONT, fontSize: 11.5, fontWeight: 600, color: "rgba(255,246,226,.6)" }}>{s.desc()}</span>
                    </span>
                    <ProgressRing done={sd} total={sl.length} color={th.hi} size={40} />
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

/** 등급 색 입체 버튼(아래 모서리 두께). */
function CtaButton({ theme, onClick, disabled, children, wide, minWidth = 168 }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="press"
      style={{ flexShrink: 0, width: wide ? "100%" : undefined, minWidth: wide ? undefined : minWidth, height: 46, padding: "0 22px", borderRadius: 13, border: "none", cursor: disabled ? "default" : "pointer",
        fontFamily: SITE_FONT, fontSize: 15, fontWeight: 900, letterSpacing: "-.01em", transition: "background .25s, box-shadow .25s, color .25s",
        color: disabled ? "rgba(255,246,226,.38)" : "#FFFFFF", textShadow: disabled ? "none" : "0 1px 1px rgba(0,0,0,.35)",
        background: disabled ? "rgba(255,255,255,.08)" : "linear-gradient(180deg, " + theme.hi + " -40%, " + theme.c + " 70%)",
        boxShadow: disabled ? "none" : "inset 0 1px 0 rgba(255,255,255,.35), 0 4px 0 " + theme.edge + ", 0 10px 18px -8px " + alpha(theme.c, 0.7) }}>{children}</button>
  );
}

/* ============================================================ 학습 화면 ============================================================ */
const sqList = (arr) => (arr || []).map(sqToRc);
export function LessonPlayer({ lesson, lessonState, onClose, onComplete, onNext, coins }) {
  const stage = stageOf(lesson.stage), th = stageTheme(stage);
  const steps = useMemo(() => lesson.steps(), [lesson]);
  // 열었을 때 이미 끝낸 레슨이었는지 — 완료 순간 진행 기록이 바뀌어도 "복습"으로 잘못 바뀌지 않게 처음 값을 고정한다(BUG-154)
  const [wasDone] = useState(() => isLessonDone(lessonState, lesson.id));
  const narrow = useNarrow(860);
  const [si, setSi] = useState(0);
  const step = steps[si] || null;
  const finished = si >= steps.length;
  const [fen, setFen] = useState(null);
  const [goalIdx, setGoalIdx] = useState(0);
  const [solved, setSolved] = useState(false);
  const [wrong, setWrong] = useState(0);
  const [wrongAt, setWrongAt] = useState(null);
  const [badFlash, setBadFlash] = useState(false);   // 오답 시트(잠깐)
  const [sel, setSel] = useState(null);
  const [tapped, setTapped] = useState([]);
  const [picked, setPicked] = useState(null);
  const [lastTo, setLastTo] = useState(null);
  const [say, setSay] = useState("");
  const busy = useRef(false), badTimer = useRef(0);
  useEffect(() => {
    if (!step) return;
    setFen(step.fen || null); setGoalIdx(0); setSolved(step.kind === "read"); setWrong(0); setWrongAt(null); setBadFlash(false); setSel(null); setTapped([]); setPicked(null); setLastTo(null); setSay(step.say); busy.current = false;
  }, [si, step]);
  useEffect(() => { if (finished && onComplete) onComplete(lesson.id); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [finished]);
  useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  useEffect(() => () => clearTimeout(badTimer.current), []);
  const markWrong = (rc) => {
    if (rc) { setWrongAt(rc); setTimeout(() => setWrongAt(null), 650); }
    setWrong((w) => w + 1); setBadFlash(true); clearTimeout(badTimer.current); badTimer.current = setTimeout(() => setBadFlash(false), 1400);
  };
  const markRight = () => { setSolved(true); setBadFlash(false); playSfx("click"); };

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
    if (!goalMet(g.goal, played)) { markWrong(to); return; }
    playSfx(played.mv.captured ? "capture" : "move");
    setFen(played.fen); setLastTo(to);
    if (goalIdx >= step.line.length - 1) { markRight(); return; }
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
      if (!ans.has(sq)) { markWrong(rc); return; }
      const nt = [...tapped, sq]; setTapped(nt); playSfx("move");
      if (nt.length >= ans.size) markRight();
      else setSay(step.say + " " + t("{0}칸 남았습니다.", ans.size - nt.length));
      return;
    }
    if (!canMove) return;
    const p = board[rc[0]][rc[1]];
    if (sel && targets.some(([r, c]) => r === rc[0] && c === rc[1])) { attempt(sel, rc); return; }
    if (p && p.c === myColor) setSel(rc); else setSel(null);
  };
  const choose = (i) => { if (solved) return; setPicked(i); if (i === step.answer) markRight(); else markWrong(null); };
  // 힌트 화살표: 목표마다 hint가 있으면 그것을, 없으면 첫 목표에 한해 스텝의 hint를 쓴다(오프닝 레슨은 수마다 힌트가 있다)
  const hintUci = step && step.kind === "move" ? ((step.line[goalIdx] || {}).hint || (goalIdx === 0 ? step.hint : null)) : null;
  const hintArrow = hintUci && !solved && wrong >= 2 ? [{ from: sqToRc(hintUci.slice(0, 2)), to: sqToRc(hintUci.slice(2, 4)), kind: "tactic", color: th.hi, width: 0.13 }] : [];
  const marks = step && step.kind === "read" ? sqList(readMarks(step)) : step && step.kind === "tap" ? sqList(tapped) : [];
  const readArrows = step && step.kind === "read" && step.arrows ? step.arrows.map(([a, b]) => ({ from: sqToRc(a), to: sqToRc(b), kind: "tactic", color: th.hi })) : [];
  const resetStep = () => { setFen(step.fen || null); setGoalIdx(0); setSel(null); setLastTo(null); setSay(step.say); busy.current = false; };

  const [boardSize, setBoardRef] = useBoardSize(narrow ? 460 : 600, 24);
  const emotion = finished || (solved && step && step.kind !== "read") ? "great" : badFlash ? "surprise" : "think";
  const nextL = useMemo(() => { const all = allLessons(); const i = all.findIndex((l) => l.id === lesson.id); return all[i + 1] || null; }, [lesson]);
  const progress = finished ? 1 : (si + (solved && step && step.kind !== "read" ? 1 : 0)) / steps.length;
  const sheet = finished ? null : solved && step && step.kind !== "read" ? "ok" : badFlash ? "bad" : "idle";

  const coachPanel = (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <Mascot name="milku" emotion={emotion} size={narrow ? 50 : 68} />
      <div aria-live="polite" style={{ position: "relative", flex: 1, minWidth: 0, padding: narrow ? "12px 14px" : "16px 18px", borderRadius: 16, background: PAPER, color: INK, fontSize: narrow ? 14.5 : 16, fontWeight: 700, lineHeight: 1.55, boxShadow: "0 12px 28px -14px rgba(0,0,0,.8)" }}>
        <span aria-hidden="true" style={{ position: "absolute", left: -6, top: narrow ? 18 : 24, width: 12, height: 12, background: PAPER, transform: "rotate(45deg)" }} />
        <span style={{ position: "relative" }}>{say}</span>
      </div>
    </div>
  );
  const choicePanel = step && step.kind === "choice" && !finished ? (
    <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
      {step.options.map((o, i) => {
        const right = solved && i === step.answer, bad = picked === i && !solved;
        const bc = right ? th.hi : bad ? "#E0675C" : "rgba(255,255,255,.14)";
        return (
          <button key={i} type="button" role="radio" aria-checked={picked === i} onClick={() => choose(i)} className="press" disabled={solved}
            style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", padding: "13px 14px", borderRadius: 14, cursor: solved ? "default" : "pointer", fontFamily: SITE_FONT, fontSize: 14.5, fontWeight: 800,
              border: "1.5px solid " + bc, background: right ? alpha(th.c, 0.28) : bad ? "rgba(224,103,92,.16)" : "rgba(255,255,255,.05)", color: "#FFF6E2", boxShadow: right ? "0 0 0 3px " + alpha(th.c, 0.25) : "none", transition: "background .2s, border-color .2s" }}>
            <span aria-hidden="true" style={{ width: 22, height: 22, flexShrink: 0, borderRadius: "50%", border: "2px solid " + (right ? th.hi : bad ? "#E0675C" : "rgba(255,255,255,.35)"), display: "flex", alignItems: "center", justifyContent: "center", background: right ? th.hi : "transparent" }}>
              {right && <Check size={13} strokeWidth={3.4} color={th.edge} />}{bad && <X size={13} strokeWidth={3.4} color="#E0675C" />}
            </span>
            <span style={{ flex: 1 }}>{o}</span>
          </button>
        );
      })}
    </div>
  ) : null;
  const doneView = (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 14px" }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 240, damping: 16 }} style={{ position: "relative", display: "inline-block", marginBottom: 22 }}>
          <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: 260, height: 260, marginLeft: -130, marginTop: -130, borderRadius: "50%", background: "radial-gradient(circle, " + alpha(th.c, 0.45) + ", transparent 62%)" }} />
          <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: 200, height: 200, marginLeft: -100, marginTop: -100, borderRadius: "50%", background: "repeating-conic-gradient(" + alpha(th.hi, 0.22) + " 0 6deg, transparent 6deg 30deg)", WebkitMaskImage: "radial-gradient(circle, transparent 36%, #000 37%, transparent 70%)", maskImage: "radial-gradient(circle, transparent 36%, #000 37%, transparent 70%)" }} />
          <GradeBadge stage={stage} size={112} glow />
        </motion.div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: th.hi }}>{t("{0}단계", stageNo(stage.id))} · {stage.title()}</div>
        <div style={{ marginTop: 4, fontSize: 28, fontWeight: 900, letterSpacing: "-.03em", color: "#FFF6E2" }}>{lesson.title()}</div>
        <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 14px", borderRadius: 999, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)", fontSize: 14, fontWeight: 800, color: "#FFF6E2" }}>
          {wasDone ? t("복습 완료") : coins ? <><CoinIcon size={17} />{t("레슨 완료, 코인 {0}개", LESSON_REWARD)}</> : t("레슨 완료")}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 26, flexWrap: "wrap" }}>
          <button type="button" onClick={onClose} className="press" style={{ height: 46, padding: "0 20px", borderRadius: 13, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.06)", color: "#FFF6E2", fontFamily: SITE_FONT, fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>{t("레슨 목록")}</button>
          {nextL && <CtaButton theme={stageTheme(stageOf(nextL.stage))} onClick={() => onNext(nextL)}>{t("다음 레슨: {0}", nextL.title())}</CtaButton>}
        </div>
      </div>
    </div>
  );
  const boardBox = board ? (
    <div ref={setBoardRef} style={{ width: "100%", maxWidth: narrow ? 460 : "min(600px, calc(100dvh - 210px))", margin: "0 auto", filter: "drop-shadow(0 24px 40px rgba(0,0,0,.55))" }}>
      <Board board={board} flip={flip} size={boardSize} showEval={false} interactive={!!(canMove || (step && step.kind === "tap" && !solved))}
        selected={sel} legalTargets={targets} onSquareClick={onSquareClick}
        onPieceDrag={(rc) => { if (canMove) { const p = board[rc[0]][rc[1]]; if (p && p.c === myColor) setSel(rc); } }}
        onDrop={(rc) => { if (sel) attempt(sel, rc); }} onMove={(from, to) => attempt(from, to)}
        haloSquares={lastTo && step && step.kind === "move" ? [...marks, lastTo] : marks} arrows={[...readArrows, ...hintArrow]} wrongAt={wrongAt} />
    </div>
  ) : null;
  // 하단 피드백 시트: 대기(유리) / 정답(등급 배지 + 등급 색) / 오답(붉은색, 잠깐)
  const sheetBg = sheet === "ok" ? "linear-gradient(180deg, " + alpha(th.c, 0.32) + ", " + alpha(th.c, 0.18) + ")" : sheet === "bad" ? "linear-gradient(180deg, rgba(200,69,59,.3), rgba(200,69,59,.16))" : "rgba(255,255,255,.035)";
  const sheetBar = !finished && (
    <div className="lesson-glass" style={{ flexShrink: 0, borderTop: "1px solid " + (sheet === "ok" ? alpha(th.hi, 0.35) : sheet === "bad" ? "rgba(224,103,92,.4)" : "rgba(255,255,255,.07)"), background: sheetBg, transition: "background .25s, border-color .25s",
      padding: "12px max(16px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, flexWrap: narrow ? "wrap" : "nowrap" }}>
        <div aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, minHeight: 46 }}>
          <AnimatePresence mode="wait" initial={false}>
            {sheet === "ok" ? (
              <motion.div key="ok" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <GradeBadge stage={stage} size={38} glow />
                <span style={{ fontSize: 17, fontWeight: 900, color: th.hi }}>{t("정답입니다.")}</span>
              </motion.div>
            ) : sheet === "bad" ? (
              <motion.div key="bad" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: [0, -5, 5, 0] }} exit={{ opacity: 0 }} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: "50%", background: "#C8453B", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 0 #7E2A23" }}><X size={20} strokeWidth={3} color="#fff" /></span>
                <span style={{ fontSize: 16, fontWeight: 900, color: "#F2A39B" }}>{step && step.kind === "choice" ? t("다시 생각해 보세요.") : t("다시 해 보세요.")}</span>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {step && step.kind === "move" && goalIdx === 0 && (
                  <button type="button" onClick={resetStep} aria-label={t("처음 포지션으로")} title={t("처음 포지션으로")} className="press" style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", color: "#FFF6E2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><RotateCcw size={18} /></button>
                )}
                {hintArrow.length > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 800, color: th.hi }}><Lightbulb size={16} />{t("화살표를 참고하세요")}</span>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <CtaButton theme={th} disabled={!solved} onClick={() => setSi((i) => i + 1)} wide={narrow}>{step && step.kind === "read" ? t("다음") : t("계속")}</CtaButton>
      </div>
    </div>
  );

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={lesson.title()} style={{ position: "fixed", inset: 0, zIndex: 9000, display: "flex", flexDirection: "column", fontFamily: SITE_FONT, color: "#FFF6E2", isolation: "isolate",
      background: "radial-gradient(110% 80% at 50% 0%, " + th.bg2 + " 0%, " + th.bg + " 55%, #0B0704 100%)" }}>
      <style>{".lesson-glass{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}"}</style>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: -1, ...CHECKER }} />
      {/* 머리: 닫기 · 단계 배지·이름 · 레슨 이름 · 진행 막대 */}
      <div style={{ flexShrink: 0, padding: "max(12px, env(safe-area-inset-top)) 16px 10px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", color: "#FFF6E2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={20} /></button>
          <GradeBadge stage={stage} size={32} />
          <div style={{ minWidth: 0, flexShrink: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: th.hi, whiteSpace: "nowrap" }}>{t("{0}단계", stageNo(stage.id))} · {stage.title()}</div>
            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lesson.title()}</div>
          </div>
          <div aria-hidden="true" style={{ flex: 1, minWidth: 60, height: 10, marginLeft: 8, borderRadius: 6, background: "rgba(255,255,255,.1)", overflow: "hidden", boxShadow: "inset 0 1px 2px rgba(0,0,0,.4)" }}>
            <motion.div initial={false} animate={{ width: progress * 100 + "%" }} transition={{ duration: 0.45, ease: [0.22, 0.9, 0.32, 1] }}
              style={{ height: "100%", borderRadius: 6, background: "linear-gradient(90deg, " + th.c + ", " + th.hi + ")", boxShadow: "0 0 12px " + alpha(th.c, 0.6) }} />
          </div>
        </div>
      </div>
      {finished ? doneView : (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ maxWidth: 1080, margin: "0 auto", minHeight: "100%", boxSizing: "border-box", display: "flex", flexDirection: narrow ? "column" : "row", gap: narrow ? 14 : 36, padding: narrow ? "4px 16px 16px" : "16px 24px 24px", alignItems: narrow ? "stretch" : "center" }}>
            {narrow ? <>{coachPanel}{boardBox}{choicePanel}</> : <>
              {boardBox && <div style={{ flex: "0 1 600px", minWidth: 0 }}>{boardBox}</div>}
              <div style={{ flex: "1 1 360px", maxWidth: boardBox ? 420 : 600, minWidth: 0, margin: boardBox ? 0 : "0 auto" }}>{coachPanel}{choicePanel}</div>
            </>}
          </div>
        </div>
      )}
      {sheetBar}
    </div>,
    document.body
  );
}
