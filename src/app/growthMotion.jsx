// (v0.7.5, 사용자 요청) 학습 탭 첫 페이지 — 자동 분석 진행 화면과 분석 통계의 등장·반복 연출.
//  · /about의 시각 언어(모서리를 자른 어두운 패널·모노스페이스 `// 라벨`·스캔 라인·노이즈에서 풀려 나오는 글자·이퀄라이저)를 그대로 쓴다(components/AboutKit.jsx).
//  · 분석 중에는 실제로 엔진이 채점하고 있는 판의 포지션을 수 단위로 보여 준다(autoReview.js의 진행 스트림). 아직 5판이 안 됐으면 데모 수순을 반복 재생한다.
//  · 기기의 "애니메이션 줄이기" 설정은 보지 않는다(check-reduced-motion). 가벼운 모드(isLite)면 무한 반복을 끄고 한 번만 재생한다(index.css가 CSS 무한 애니메이션을 끈다).
//  · 아이콘·장식은 파셋 부품(FacetDiamond)만 쓴다 — 선으로 그린 장식 없음(scripts/check-facet-icons.mjs ZONES 등록).
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { T } from "../lib/theme.js";
import { t } from "../lib/i18n.js";
import { isLite } from "../lib/perfMode.js";
import { K, KIT_CSS, CutPanel, Sys, EqBars, cut } from "../components/AboutKit.jsx";
import { ScrambleText, useScramble, MONO } from "../components/OpenTextArt.jsx";
import { FacetDiamond, GOLD, facetRamp } from "../components/facetIcons.jsx";
import { OC_EASE, CountUp } from "../components/motionKit.jsx";
import { badgeIcon, QLABEL } from "../components/badges.jsx";
import { boardFromSans } from "../lib/chessRules.js";
import { Board } from "./common.jsx";
import { reviewKeyOf, reviewProgressOf, subscribeReviewProgress } from "./autoReview.js";

/* ── 연출 전용 CSS(gx-) — KIT_CSS(/about)와 함께 한 번 넣는다 ── */
const GX_CSS = `
@keyframes gx-grid{from{background-position:0 0}to{background-position:28px 28px}}
.gx-grid{position:absolute;inset:0;pointer-events:none;opacity:.07;background-image:repeating-conic-gradient(#ECCB86 0 25%,transparent 0 50%);background-size:28px 28px;animation:gx-grid 9s linear infinite;-webkit-mask-image:radial-gradient(120% 90% at 30% 20%,#000 30%,transparent 80%);mask-image:radial-gradient(120% 90% at 30% 20%,#000 30%,transparent 80%)}
@keyframes gx-scan{0%{transform:translateY(-100%)}100%{transform:translateY(500%)}}
.gx-scan{position:absolute;left:0;right:0;top:0;height:20%;pointer-events:none;z-index:3;background:linear-gradient(180deg,transparent,rgba(236,203,134,.0) 20%,rgba(236,203,134,.35) 85%,rgba(255,247,220,.75) 100%);mix-blend-mode:screen;animation:gx-scan 2.6s cubic-bezier(.45,.05,.55,.95) infinite}
@keyframes gx-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.18);opacity:.75}}
.gx-pulse{transform-origin:center;transform-box:fill-box;animation:gx-pulse 1.4s ease-in-out infinite}
@keyframes gx-ring{0%{transform:scale(.6);opacity:.9}100%{transform:scale(2.1);opacity:0}}
.gx-ring{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(236,203,134,.55),transparent 65%);animation:gx-ring 1.8s ease-out infinite;pointer-events:none}
@keyframes gx-stripe{from{background-position:0 0}to{background-position:28px 0}}
.gx-stripe{background-image:repeating-linear-gradient(115deg,rgba(255,255,255,.22) 0 7px,transparent 7px 14px);background-size:28px 100%;animation:gx-stripe .9s linear infinite}
@keyframes gx-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
.gx-float{animation:gx-float 3.2s ease-in-out infinite}
@keyframes gx-glow{0%,100%{box-shadow:0 0 0 rgba(236,203,134,0)}50%{box-shadow:0 0 22px -4px rgba(236,203,134,.55)}}
.gx-glow{animation:gx-glow 3.8s ease-in-out infinite}
@keyframes gx-glint{0%,62%{transform:translateX(-120%) skewX(-18deg)}100%{transform:translateX(320%) skewX(-18deg)}}
.gx-glint{position:relative;overflow:hidden}
.gx-glint::after{content:"";position:absolute;top:-10%;bottom:-10%;left:0;width:45%;background:linear-gradient(100deg,transparent,rgba(255,247,220,.16),transparent);transform:translateX(-120%) skewX(-18deg);pointer-events:none;animation:gx-glint 6s ease-in-out infinite;animation-delay:inherit}
@keyframes gx-flow{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
.gx-flow{animation:gx-flow 3.4s cubic-bezier(.45,.05,.55,.95) infinite}
@keyframes gx-ping{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.8);opacity:0}}
.gx-ping{transform-box:fill-box;transform-origin:center;animation:gx-ping 1.6s ease-out infinite}
@keyframes gx-blinkdot{0%,100%{opacity:.25}50%{opacity:1}}
.gx-blinkdot{animation:gx-blinkdot 1.2s ease-in-out infinite}
`;
export function GrowthFxStyle() { return <style>{KIT_CSS + GX_CSS}</style>; }

/* 분석 중인 판의 수 단위 진행 */
function useLiveProgress(key) {
  return useSyncExternalStore((fn) => subscribeReviewProgress(fn), () => (key ? reviewProgressOf(key) : null), () => null);
}
/* 요소 너비(반응형 보드 크기) */
function useWidth() {
  const ref = useRef(null), [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width))); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// 아직 분석할 대국이 없을 때 보드가 반복 재생하는 데모 수순(1858 파리 오페라 대국 — 짧고 전술이 풍부하다)
const DEMO = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#".split(" ");
const KIND_TINT = { brilliant: T.brilliant, only: T.only, best: T.best, excellent: T.excellent, good: T.good, book: T.book, inaccuracy: T.inaccuracy, miss: T.mistake, mistake: T.mistake, blunder: T.blunder };
const oppOf = (g) => { const w = g.white && g.white.username, b = g.black && g.black.username; return (g.color === "w" ? b : w) || "?"; };

/* 상태 노드 — 완료(금빛)·분석 중(맥동)·대기(어두운 면) 마름모 */
function StateNode({ state, size = 22 }) {
  const R = state === "done" ? GOLD : state === "active" ? facetRamp("#16B5A6") : state === "fail" ? facetRamp("#C8453B") : facetRamp("#6B5A45");
  return (
    <span style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "inline-flex" }}>
      {state === "active" && <span aria-hidden className="gx-ring" />}
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ position: "relative" }}>
        <g className={state === "active" ? "gx-pulse" : undefined}><FacetDiamond cx={12} cy={12} r={state === "wait" ? 7.5 : 10} R={R} gem={state !== "wait"} /></g>
      </svg>
    </span>
  );
}

/* 승률 흐름 파형 — 채점이 끝난 수까지 그린다(차트 선이라 파셋 규칙 대상 아님) */
function EvalWave({ evalWin, total, h = 44 }) {
  const W = 300, n = Math.max(2, total + 1);
  const pts = (evalWin || []).map((v, i) => (v == null ? null : [i / (n - 1) * W, h - 3 - (Math.max(0, Math.min(100, v)) / 100) * (h - 6)])).filter(Boolean);
  const d = pts.length > 1 ? "M" + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L") : "";
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={"0 0 " + W + " " + h} preserveAspectRatio="none" width="100%" height={h} aria-hidden style={{ display: "block" }}>
      <rect x="0" y={h / 2 - 0.5} width={W} height="1" fill="rgba(236,203,134,.18)" />
      {d && <path d={d + " L" + last[0].toFixed(1) + " " + h + " L0 " + h + " Z"} fill="rgba(236,203,134,.12)" />}
      {d && <path d={d} fill="none" stroke={K.brassHi} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />}
      {last && <circle cx={last[0]} cy={last[1]} r="3" fill={GOLD.hi} className="gx-blinkdot" />}
    </svg>
  );
}

/* 보드 무대 — 분석 중인 판의 채점된 마지막 포지션(없으면 데모 반복 재생) + 스캔 라인 + 수 판정 배지 */
function BoardStage({ game, live }) {
  const [ref, w] = useWidth();
  const size = Math.max(150, Math.min(300, w));
  const [demoPly, setDemoPly] = useState(0);
  const demo = !live || !game;
  const sans = demo ? DEMO : game.sans;
  useEffect(() => {
    if (!demo) return undefined;
    const id = setInterval(() => setDemoPly((p) => (p >= DEMO.length ? 0 : p + 1)), isLite() ? 1600 : 650);
    return () => clearInterval(id);
  }, [demo]);
  const ply = demo ? demoPly : Math.min(sans.length, live.done);
  const board = useMemo(() => { try { return boardFromSans(sans.slice(0, ply)); } catch { return null; } }, [sans, ply]);
  const mv = !demo && live.moves && live.moves[ply - 1];
  const kind = mv ? mv.kind : null;
  const win = !demo && live.evalWin ? live.evalWin[ply] : null;
  const whiteWin = win == null ? 50 : Math.max(3, Math.min(97, win));
  return (
    <div ref={ref} style={{ position: "relative", width: "100%", maxWidth: 300, margin: "0 auto" }}>
      {w > 0 && (
        <div style={{ position: "relative", display: "flex", gap: 6 }}>
          {/* 승률 막대(백 기준) */}
          <div aria-hidden style={{ width: 8, height: size - 14, borderRadius: 4, overflow: "hidden", background: "#0E0907", alignSelf: "center", flexShrink: 0, display: "flex", flexDirection: "column-reverse" }}>
            <motion.div animate={{ height: whiteWin + "%" }} transition={{ duration: 0.5, ease: OC_EASE }} style={{ background: "linear-gradient(180deg,#FFF7DC,#EBDDC4)" }} />
          </div>
          <div style={{ position: "relative", width: size - 14, height: size - 14, borderRadius: 6, overflow: "hidden", boxShadow: "0 0 0 1px rgba(236,203,134,.35), 0 10px 30px -10px rgba(0,0,0,.8)" }}>
            {board && <Board board={board} flip={!demo && game.color === "b"} size={size - 14} interactive={false} showCoords={false} showEval={false} />}
            <span aria-hidden className="gx-scan" />
            <AnimatePresence>
              {kind && badgeIcon(kind, 22) && (
                <motion.div key={ply} initial={{ opacity: 0, scale: 0.4, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.28, ease: OC_EASE }}
                  style={{ position: "absolute", right: 6, top: 6, zIndex: 4, display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px 3px 4px", borderRadius: 999, background: "rgba(14,9,7,.82)", border: "1px solid " + (KIND_TINT[kind] || K.brass), color: K.ivoryHi, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
                  {badgeIcon(kind, 18)}{QLABEL[kind] || kind}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
      {!w && <div style={{ width: "100%", aspectRatio: "1 / 1" }} />}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 7, fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", color: K.soft }}>
        <span>{demo ? "DEMO" : "PLY"} {String(ply).padStart(2, "0")}/{String(sans.length).padStart(2, "0")}</span>
        <span style={{ color: K.brassHi }}>{ply > 0 ? sans[ply - 1] : "—"}</span>
      </div>
    </div>
  );
}

/* 상태 줄 — 노이즈에서 풀려 나오며 순환하는 시스템 문구(장식, 고정 영문 표기) */
function Ticker({ lines }) {
  const [i, setI] = useState(0);
  useEffect(() => { if (isLite()) return undefined; const id = setInterval(() => setI((v) => (v + 1) % lines.length), 2600); return () => clearInterval(id); }, [lines.length]);
  const txt = useScramble(lines[i % lines.length], true, 22);
  return <span aria-hidden style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: ".14em", color: K.brass, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{txt}</span>;
}

/**
 * 자동 분석 진행 화면.
 * phase: "loading"(대국 불러오는 중) | "need"(최근 대국 부족) | "analyze"(분석 중) | "off"(엔진 없음)
 * games: 최근 대국(최대 need개), states: 키 → "done" | "fail", activeKey: 지금 분석 중인 판
 */
export function AnalysisScanner({ phase, games = [], states = {}, activeKey = null, need = 5, engineStatus }) {
  const live = useLiveProgress(phase === "analyze" ? activeKey : null);
  const doneN = phase === "analyze" ? games.filter((g) => states[reviewKeyOf(g)] === "done").length : Math.min(games.length, need);
  const activeGame = activeKey ? games.find((g) => reviewKeyOf(g) === activeKey) : null;
  const activePct = live && live.total ? live.done / live.total : 0;
  const totalPct = phase === "analyze" ? Math.min(1, (doneN + activePct) / need) : Math.min(1, doneN / need);
  const msg = phase === "loading" ? t("불러오는 중…")
    : phase === "need" ? t("최근 대국이 {0}판 이상 쌓이면 성장 분석이 자동으로 시작됨", need)
    : phase === "off" || engineStatus === "off" ? t("분석 엔진을 쓸 수 없어 자동 분석을 할 수 없음")
    : engineStatus !== "ready" && !live ? t("분석 엔진 준비 중…") : t("리뷰하지 않아도 최근 {0}판을 자동으로 분석하는 중", need);
  const lines = phase === "analyze"
    ? ["AUTO REVIEW ▸ " + doneN + "/" + need + " GAMES", "ENGINE ▸ " + (engineStatus === "ready" ? "ONLINE" : "BOOTING"), live ? "GRADING ▸ MOVE " + live.done + "/" + live.total : "QUEUE ▸ STANDBY", "GROWTH MAP ▸ BUILDING"]
    : ["COLLECTING ▸ " + doneN + "/" + need + " GAMES", "ENGINE ▸ STANDBY", "NEXT ▸ PLAY A GAME", "GROWTH MAP ▸ LOCKED"];
  const slots = Array.from({ length: need }, (_, i) => games[i] || null);
  const running = phase === "analyze" && (engineStatus === "ready" || !!live);
  return (
    <div style={{ padding: "4px 12px 14px" }}>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: OC_EASE }}>
        <CutPanel cutSize={16} chase={running} accent={running ? K.brassHi : undefined} bodyStyle={{ overflow: "hidden" }}>
          <div aria-hidden className="gx-grid" />
          <div aria-hidden className="ab-sweep" />
          <div style={{ position: "relative", zIndex: 1, padding: "14px 14px 14px" }}>
            {/* 머리 줄 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span aria-hidden className="ab-caret" style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: running ? "#8FB55E" : K.brass, boxShadow: "0 0 8px " + (running ? "#8FB55E" : K.brass) }} />
              <Sys style={{ whiteSpace: "nowrap" }}>// <ScrambleText text="AUTO REVIEW" loopMs={9000} /></Sys>
              <span style={{ flex: 1 }} />
              <EqBars n={5} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="ab-textglow" style={{ fontSize: 17, fontWeight: 900, color: K.ivoryHi, lineHeight: 1.35, letterSpacing: "-.01em", wordBreak: "keep-all" }}>{msg}</div>
                <div style={{ marginTop: 4, display: "flex", minWidth: 0 }}><Ticker lines={lines} /></div>
              </div>
              <div aria-hidden style={{ fontFamily: MONO, fontWeight: 900, fontStyle: "italic", color: K.brassHi, lineHeight: 1, whiteSpace: "nowrap", flexShrink: 0 }}>
                <span style={{ fontSize: 38 }}><CountUp value={doneN} /></span><span style={{ fontSize: 16, color: K.soft }}>/{need}</span>
              </div>
            </div>

            {/* 본문: 보드 무대 + 대국 대기열(넓으면 나란히, 좁으면 위아래) */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 14 }}>
              <div style={{ flex: "1 1 200px", minWidth: 0, maxWidth: 320, margin: "0 auto" }}>
                <BoardStage game={activeGame} live={phase === "analyze" ? live : null} />
              </div>
              <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {slots.map((g, i) => {
                  const key = g ? reviewKeyOf(g) : null;
                  const st = !g ? "wait" : phase !== "analyze" ? "done" : states[key] === "done" ? "done" : states[key] === "fail" ? "fail" : key === activeKey ? "active" : "wait";
                  const pctRow = st === "done" ? 1 : st === "active" ? activePct : 0;
                  const label = !g ? t("대기") : phase !== "analyze" ? t("수집됨") : st === "done" ? t("완료") : st === "fail" ? t("실패") : st === "active" ? t("분석 중") : t("대기");
                  return (
                    <motion.div key={i} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.15 + i * 0.08, ease: OC_EASE }}
                      className={st === "active" ? "gx-glow" : undefined}
                      style={{ position: "relative", overflow: "hidden", clipPath: cut(8), background: st === "active" ? "rgba(22,181,166,.10)" : "rgba(255,255,255,.04)", padding: "8px 10px", display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                      {/* 진행 채움 */}
                      <motion.span aria-hidden initial={{ width: 0 }} animate={{ width: (pctRow * 100).toFixed(1) + "%" }} transition={{ duration: 0.5, ease: OC_EASE }}
                        className={st === "active" ? "gx-stripe" : undefined}
                        style={{ position: "absolute", left: 0, top: 0, bottom: 0, background: st === "done" ? "linear-gradient(90deg,rgba(236,203,134,.20),rgba(236,203,134,.06))" : "linear-gradient(90deg,rgba(22,181,166,.35),rgba(22,181,166,.12))", pointerEvents: "none" }} />
                      <StateNode state={st} />
                      <div style={{ position: "relative", minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: g ? K.ivoryHi : K.soft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g ? "vs " + oppOf(g) : t("다음 대국을 기다리는 중")}</div>
                        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: K.soft, letterSpacing: ".06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g ? "#" + String(i + 1).padStart(2, "0") + " · " + t("{0}수", Math.ceil(g.sans.length / 2)) + (g.opening ? " · " + g.opening : "") : "#" + String(i + 1).padStart(2, "0") + " · ---"}</div>
                      </div>
                      <span style={{ position: "relative", fontFamily: MONO, fontSize: 10.5, fontWeight: 900, letterSpacing: ".06em", color: st === "active" ? "#5FE0D2" : st === "done" ? K.brassHi : st === "fail" ? "#FF8A7A" : K.soft, whiteSpace: "nowrap" }}>{st === "active" ? Math.round(activePct * 100) + "%" : label}</span>
                    </motion.div>
                  );
                })}
                {phase === "analyze" && (
                  <div style={{ marginTop: 2, borderRadius: 6, background: "rgba(0,0,0,.25)", padding: "4px 6px 2px" }}>
                    <EvalWave evalWin={live ? live.evalWin : []} total={live ? live.total : 40} />
                  </div>
                )}
              </div>
            </div>

            {/* 전체 진행 막대 */}
            <div role="progressbar" aria-label={t("성장 분석")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(totalPct * 100)} style={{ marginTop: 14, height: 8, borderRadius: 4, background: "rgba(0,0,0,.35)", overflow: "hidden", position: "relative" }}>
              <motion.div initial={{ width: 0 }} animate={{ width: (totalPct * 100).toFixed(1) + "%" }} transition={{ duration: 0.6, ease: OC_EASE }}
                className={running ? "gx-stripe" : undefined} style={{ height: "100%", background: "linear-gradient(90deg,#8A6C2F,#ECCB86)", borderRadius: 4 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: ".14em", color: K.soft }}>
              <span>{phase === "analyze" ? t("분석이 끝나면 여기에 결과가 나타남") : " "}</span>
              <span style={{ color: K.brassHi }}>{Math.round(totalPct * 100)}%</span>
            </div>
          </div>
        </CutPanel>
      </motion.div>
    </div>
  );
}

/* ── 분석 통계의 등장 연출 ──
   Reveal: 화면에 들어올 때 한 번 아래에서 떠오른다(opacity·y). 반복 연출은 각 통계 부품의 CSS 클래스(gx-/ab-)가 맡는다.
   transform을 남기지 않도록 끝나면 y=0(framer가 transform을 none으로 둔다). */
export function Reveal({ children, delay = 0, y = 18, style, as = "div" }) {
  const M = as === "section" ? motion.section : motion.div;
  return (
    <M initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: 0.55, delay, ease: OC_EASE }} style={style}>
      {children}
    </M>
  );
}
/* 숫자 타일 하나 — 차례로 튀어나오고(scale), 숫자가 세어 올라가며, 빛이 주기적으로 훑고 지나간다 */
export function StatPop({ children, i = 0, style }) {
  return (
    <motion.div className="gx-glint gx-glow" initial={{ opacity: 0, scale: 0.86, y: 14 }} whileInView={{ opacity: 1, scale: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, delay: 0.1 + i * 0.12, ease: OC_EASE }} style={{ ...style, animationDelay: (i * 1.1) + "s" }}>
      {children}
    </motion.div>
  );
}
/* 소수 한 자리 숫자 세기 */
export function CountDec({ value, digits = 1 }) {
  const k = Math.pow(10, digits);
  if (value == null || !Number.isFinite(value)) return <>–</>;
  return <CountUpFrom0 value={Math.round(value * k)} format={(n) => (n / k).toFixed(digits)} />;
}
/* 처음 보일 때 0부터 세어 올라간다(CountUp은 첫 렌더를 즉시 보여 주므로, 0으로 시작해 다음 프레임에 목표값을 준다) */
export function CountUpFrom0({ value, format, duration = 900 }) {
  const [v, setV] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => setV(value)); return () => cancelAnimationFrame(id); }, [value]);
  return <CountUp value={v} duration={duration} format={format} />;
}
/* 결과 머리 띠 — "// GROWTH REPORT" 라벨과 분석한 판 수, 이퀄라이저(반복) */
export function ReportStrip({ n }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} style={{ margin: "2px 12px 12px", position: "relative", clipPath: cut(10), background: "linear-gradient(90deg,#2E1B10,#3A2516 60%,#2E1B10)", padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
      <div aria-hidden className="gx-grid" style={{ opacity: 0.06 }} />
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0, position: "relative" }}><g className="gx-pulse"><FacetDiamond cx={12} cy={12} r={10} R={GOLD} /></g></svg>
      <Sys style={{ position: "relative", whiteSpace: "nowrap" }}>// <ScrambleText text="GROWTH REPORT" loopMs={10000} /></Sys>
      <span style={{ flex: 1 }} />
      <span style={{ position: "relative", fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: ".12em", color: K.soft, whiteSpace: "nowrap" }}>{n} GAMES</span>
      <EqBars n={4} style={{ position: "relative" }} />
    </motion.div>
  );
}
