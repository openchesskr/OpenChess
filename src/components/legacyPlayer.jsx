// (v0.7.4, 사용자 요청) 유산 재생기 — /about 페이지와 같은 HUD 시각 언어(AboutKit: 모서리를 자른 패널과 도는 테두리빛, 코너 브래킷, 스캔 라인,
// 텍스트 풀림·글리치, 상태 줄, 평행사변형 버튼, 떠오르는 글자 기둥·그레인·비네트)로 처음부터 다시 짠 재생기.
//  · 열리면 패널이 가운데에서 갈라지듯 열리고 금색 액자가 선으로 그려지며 상태 줄이 노이즈에서 풀려 나온다.
//  · 기물은 칸을 스프링으로 미끄러지고, 잡힌 기물은 작아지며 사라진다. 방금 둔 수의 출발·도착 칸은 은은한 금빛.
//  · 유산 수 직전 "주목": 나머지 기물이 어두워지고 그 기물에 코너 브래킷·십자선(표적 고정)이 잡히며 스캔 라인이 보드를 훑는다.
//  · 도착: 섬광 → 등급 색 파문 두 겹 + 8방향 광선 → 등급 배지가 튀어 오르고 반짝임, 수 이름에 글리치, 상태 줄이 IMPACT로 바뀐다.
//  · 아래: 한 수당 한 칸인 평행사변형 진행 막대(유산 수는 등급 색, 눌러서 이동), 이전·재생/일시정지·다음. 키보드 ←/→, 스페이스, Esc.
// 수순 → 기물 위치 계산은 lib/legacyFrames.js(순수 함수), 연출 기준은 scripts/check-legacy-player.mjs가 지킨다.
import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Play, Pause, SkipBack, SkipForward, RotateCcw } from "lucide-react";
import { t } from "../lib/i18n.js";
import { QCOLOR } from "../lib/moveKinds.js";
import { badgeIcon, QLABEL } from "./badges.jsx";
import { PieceGlyph } from "./pieces.jsx";
import { moveNumber } from "../lib/chessRules.js";
import { buildFrames } from "../lib/legacyFrames.js";
import { isLite } from "../lib/perfMode.js";
import { LegacyFrame, LEGACY_GOLD, LEGACY_GOLD_HI } from "./legacyFrame.jsx";
import { K, KIT_CSS, CutPanel, Sys, Tag, EqBars, AmbientLayer, Brackets, AsciiRule, para } from "./AboutKit.jsx";
import { useScramble, MONO } from "./OpenTextArt.jsx";

const SPRING = { type: "spring", stiffness: 240, damping: 27, mass: 0.8 };
const HERO_SPRING = { type: "spring", stiffness: 120, damping: 20, mass: 1 };   // 유산 수는 조금 느리게(슬로모션)
const LIGHT = "#C9A86E", DARK = "#6E4B2A";
const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

function Board({ frame, move, flip, heroMove, heroKind, spotlight, landed, epoch, isHeroStep, step, introDone }) {
  const ref = useRef(null); const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); return () => ro.disconnect();
  }, []);
  const lite = isLite(), cell = w / 8;
  const sx = (c) => (flip ? 7 - c : c) * 12.5, sy = (r) => (flip ? 7 - r : r) * 12.5;
  const heroColor = QCOLOR[heroKind] || LEGACY_GOLD_HI;
  const lastSq = move ? [move.from, move.to] : [];
  const heroPiece = spotlight && heroMove ? frame.find((p) => p.r === heroMove.from[0] && p.c === heroMove.from[1]) : null;
  const corner = (pos) => ({ position: "absolute", width: "28%", height: "28%", borderColor: heroColor, borderStyle: "solid", borderWidth: 0, ...pos });
  return (
    <div ref={ref} style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: 3, overflow: "hidden", boxShadow: "0 0 0 1px rgba(0,0,0,.85), 0 0 0 2px rgba(212,175,95,.45), 0 16px 34px -14px rgba(0,0,0,.85)" }}>
      <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(8,1fr)", gridTemplateRows: "repeat(8,1fr)" }}>
        {Array.from({ length: 64 }, (_, k) => <div key={k} style={{ background: ((k >> 3) + (k & 7)) % 2 === 0 ? LIGHT : DARK }} />)}
      </div>
      {lastSq.map(([r, c], i) => (
        <motion.span key={"ls" + epoch + r + c} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: lite ? 0 : 0.35 }}
          style={{ position: "absolute", left: sx(c) + "%", top: sy(r) + "%", width: "12.5%", height: "12.5%", background: landed && i === 1 ? heroColor : LEGACY_GOLD_HI, mixBlendMode: "soft-light", opacity: landed && i === 1 ? 0.95 : 0.7 }} />
      ))}
      {/* 이동 궤적 — 방금 둔 수의 출발 칸에서 도착 칸까지 빛나는 선이 그려진 뒤 천천히 옅어진다(유산 수는 등급 색) */}
      {move && !lite && (
        <svg key={"tr" + epoch + "-" + (move.from[0] * 8 + move.from[1]) + "-" + (move.to[0] * 8 + move.to[1])} aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }}>
          <defs><linearGradient id={"trg" + epoch} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={landed ? heroColor : LEGACY_GOLD_HI} stopOpacity="0" /><stop offset="1" stopColor={landed ? heroColor : LEGACY_GOLD_HI} stopOpacity="1" /></linearGradient></defs>
          <motion.line x1={sx(move.from[1]) + 6.25} y1={sy(move.from[0]) + 6.25} x2={sx(move.to[1]) + 6.25} y2={sy(move.to[0]) + 6.25} stroke={landed ? heroColor : LEGACY_GOLD_HI} strokeWidth="1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke"
            style={{ filter: "drop-shadow(0 0 3px " + (landed ? heroColor : LEGACY_GOLD_HI) + ")" }} initial={{ pathLength: 0, opacity: 0.95 }} animate={{ pathLength: 1, opacity: [0.95, 0.95, 0.15] }} transition={{ pathLength: { duration: 0.5, ease: "easeOut" }, opacity: { duration: 1.6, times: [0, 0.4, 1] } }} />
        </svg>
      )}
      {/* 잡기 — 도착 칸에서 파편이 사방으로 */}
      {move && move.capture && !lite && Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2, d = cell * (0.9 + (i % 3) * 0.35); return (
        <motion.span key={"cap" + epoch + step + "-" + i} aria-hidden="true" initial={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }} animate={{ opacity: 0, x: Math.cos(a) * d, y: Math.sin(a) * d, scale: 0.3, rotate: 180 }} transition={{ duration: 0.7, ease: "easeOut" }}
          style={{ position: "absolute", left: sx(move.to[1]) + 6.25 + "%", top: sy(move.to[0]) + 6.25 + "%", width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5, background: i % 2 ? LEGACY_GOLD_HI : "#fff", zIndex: 6, pointerEvents: "none" }} />
      ); })}
      {/* 비네트 — 주목·도착 순간엔 표적 칸 주변만 밝고 가장자리가 어두워진다 */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none", opacity: spotlight || landed ? 1 : 0, transition: "opacity .7s", background: heroMove ? "radial-gradient(circle at " + (sx(heroMove.to[1]) + 6.25) + "% " + (sy(heroMove.to[0]) + 6.25) + "%, transparent 18%, rgba(0,0,0,.5) 80%)" : "none" }} />
      {/* 열릴 때 스캔인 — 어두운 덮개가 위로 걷히며 밝은 선이 훑고 지나간다 */}
      {!lite && !introDone && (
        <motion.div aria-hidden="true" initial={{ scaleY: 1 }} animate={{ scaleY: 0 }} transition={{ duration: 1, delay: 0.25, ease: [0.65, 0, 0.35, 1] }} style={{ position: "absolute", inset: 0, zIndex: 8, transformOrigin: "50% 100%", background: "#0A0603", borderTop: "2px solid " + LEGACY_GOLD_HI, boxShadow: "0 -6px 18px " + LEGACY_GOLD_HI + "99" }} />
      )}
      {/* 표적 고정: 십자선 + 코너 브래킷 + 스캔 라인 */}
      {heroPiece && !lite && (
        <>
          <motion.span aria-hidden="true" key={"rowl" + epoch} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: "absolute", left: 0, right: 0, top: sy(heroPiece.r) + 6.25 + "%", height: 1, background: "linear-gradient(90deg,transparent," + heroColor + "88,transparent)" }} />
          <motion.span aria-hidden="true" key={"coll" + epoch} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: "absolute", top: 0, bottom: 0, left: sx(heroPiece.c) + 6.25 + "%", width: 1, background: "linear-gradient(180deg,transparent," + heroColor + "88,transparent)" }} />
          <motion.span aria-hidden="true" key={"br" + epoch} initial={{ opacity: 0, scale: 1.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45, ease: [0.22, 0.9, 0.32, 1] }}
            style={{ position: "absolute", left: sx(heroPiece.c) + "%", top: sy(heroPiece.r) + "%", width: "12.5%", height: "12.5%" }}>
            <span className="ab-bracket" style={{ position: "absolute", inset: -2 }}>
              <span style={corner({ left: 0, top: 0, borderLeftWidth: 2, borderTopWidth: 2 })} /><span style={corner({ right: 0, top: 0, borderRightWidth: 2, borderTopWidth: 2 })} />
              <span style={corner({ left: 0, bottom: 0, borderLeftWidth: 2, borderBottomWidth: 2 })} /><span style={corner({ right: 0, bottom: 0, borderRightWidth: 2, borderBottomWidth: 2 })} />
            </span>
          </motion.span>
          <span aria-hidden="true" className="ab-sweep" style={{ background: "linear-gradient(180deg,transparent," + heroColor + "33 50%,transparent)", zIndex: 4 }} />
        </>
      )}
      <AnimatePresence>
        {cell > 0 && frame.map((p) => {
          const dim = spotlight && !(heroPiece && p.id === heroPiece.id);
          const isHeroMover = isHeroStep && move && p.r === move.to[0] && p.c === move.to[1];
          const sp = isHeroMover ? HERO_SPRING : SPRING;
          return (
            <motion.div key={p.id} initial={false} animate={{ left: sx(p.c) + "%", top: sy(p.r) + "%", opacity: dim ? 0.38 : 1, scale: 1 }} exit={{ opacity: 0, scale: 0.35 }}
              transition={lite ? { duration: 0 } : { left: sp, top: sp, opacity: { duration: 0.5 }, scale: { duration: 0.28 } }}
              style={{ position: "absolute", width: "12.5%", height: "12.5%", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: heroPiece && p.id === heroPiece.id ? 3 : 2 }}>
              <PieceGlyph type={p.t} color={p.col} size={cell * 0.9} pieceSkin="classic" />
            </motion.div>
          );
        })}
      </AnimatePresence>
      {/* 도착: 섬광 → 파문 두 겹 + 8방향 광선 → 등급 배지 */}
      {landed && move && !lite && (
        <>
          <motion.span key={"fl" + epoch} aria-hidden="true" initial={{ opacity: 0.7 }} animate={{ opacity: 0 }} transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ position: "absolute", inset: 0, zIndex: 6, pointerEvents: "none", background: "radial-gradient(circle at " + (sx(move.to[1]) + 6.25) + "% " + (sy(move.to[0]) + 6.25) + "%, rgba(255,240,200,.75), transparent 48%)" }} />
          {[0, 1].map((i) => (
            <motion.span key={"rp" + epoch + i} aria-hidden="true" initial={{ opacity: 0.85, scale: 0.3 }} animate={{ opacity: 0, scale: 3.4 }} transition={{ duration: 1.15, delay: i * 0.22, ease: "easeOut" }}
              style={{ position: "absolute", left: sx(move.to[1]) + "%", top: sy(move.to[0]) + "%", width: "12.5%", height: "12.5%", boxSizing: "border-box", borderRadius: "50%", border: "2px solid " + heroColor, zIndex: 1 }} />
          ))}
          {RAYS.map((deg) => (
            <motion.span key={"ray" + epoch + deg} aria-hidden="true" initial={{ opacity: 0.9, scaleX: 0 }} animate={{ opacity: 0, scaleX: 1 }} transition={{ duration: 0.75, ease: "easeOut", delay: 0.05 }}
              style={{ position: "absolute", left: sx(move.to[1]) + 6.25 + "%", top: sy(move.to[0]) + 6.25 + "%", width: cell * 1.7, height: 2, marginTop: -1, transformOrigin: "0 50%", rotate: deg + "deg", zIndex: 1, background: "linear-gradient(90deg," + heroColor + ",transparent)" }} />
          ))}
        </>
      )}
      {landed && move && (
        <motion.span key={"bd" + epoch} aria-hidden="true" className="ab-glint" initial={isLite() ? false : { opacity: 0, scale: 0.2, y: 6, rotate: -25 }} animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 16, delay: isLite() ? 0 : 0.3 }}
          style={{ position: "absolute", left: "calc(" + (sx(move.to[1]) + 12.5) + "% - " + cell * 0.62 + "px)", top: "calc(" + sy(move.to[0]) + "% - " + cell * 0.22 + "px)", zIndex: 7, borderRadius: "50%", filter: "drop-shadow(0 2px 4px rgba(0,0,0,.7))" }}>{badgeIcon(heroKind, Math.max(18, cell * 0.62))}</motion.span>
      )}
    </div>
  );
}

const para5 = para(7);
const hudBtn = (primary, disabled) => ({ clipPath: para5, height: primary ? 42 : 34, minWidth: primary ? 74 : 54, padding: "0 16px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, border: "none", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1, fontFamily: MONO, fontWeight: 900, fontSize: 11, letterSpacing: ".1em",
  background: primary ? "linear-gradient(180deg," + K.brassHi + "," + K.brass + ")" : "rgba(236,203,134,.12)", color: primary ? "#241509" : K.brassHi });

/* kind: 등급(best|only|brilliant), entry: 검증된 유산 항목. 모달·페이지 어디서든 같은 재생기. */
export function LegacyPlayer({ kind, entry, autoPlay = true, onKey }) {
  const { sans, moveIndex, playCount } = entry;
  const lite = isLite();
  const startCount = Math.max(0, moveIndex - (entry.beforeCount || 0));
  const endCount = Math.min(sans.length, moveIndex + Math.max(1, playCount || 1));
  const { frames, moves } = useMemo(() => buildFrames(sans.slice(0, endCount)), [sans, endCount]);
  const [step, setStep] = useState(startCount), [playing, setPlaying] = useState(false), [introDone, setIntroDone] = useState(false), [epoch, setEpoch] = useState(0);
  const flip = entry.side === "b", color = QCOLOR[kind] || LEGACY_GOLD_HI;
  const total = endCount - startCount;
  useEffect(() => { const id = setTimeout(() => { setIntroDone(true); if (autoPlay) setPlaying(true); }, lite ? 0 : 1300); return () => clearTimeout(id); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing || !introDone) return undefined;
    if (step >= endCount) { setPlaying(false); return undefined; }
    const delay = lite ? 250 : step === moveIndex ? 1700 : step === moveIndex + 1 ? 2100 : 950;
    const id = setTimeout(() => setStep((s) => Math.min(endCount, s + 1)), delay);
    return () => clearTimeout(id);
  }, [playing, introDone, step, endCount, moveIndex, lite]);
  const go = useCallback((n) => { setPlaying(false); setStep(Math.max(startCount, Math.min(endCount, n))); setEpoch((e) => e + 1); }, [startCount, endCount]);
  const replay = () => { setStep(startCount); setEpoch((e) => e + 1); setPlaying(true); };
  const toggle = () => { if (step >= endCount) replay(); else setPlaying((p) => !p); };
  const hm = moves[moveIndex];
  const heroOrigin = hm ? (((flip ? 7 - hm.to[1] : hm.to[1]) + 0.5) * 12.5) + "% " + (((flip ? 7 - hm.to[0] : hm.to[0]) + 0.5) * 12.5) + "%" : "50% 50%";
  const frame = frames[Math.min(step, frames.length - 1)];
  const move = step > startCount ? moves[step - 1] : null;
  const spotlight = step === moveIndex && introDone, landed = step === moveIndex + 1, finished = step >= endCount;
  const label = step > startCount ? moveNumber(step - 1) + sans[step - 1] : "START";
  // 상태 줄 — /about의 StatusTicker처럼 문구가 노이즈에서 풀려 나온다.
  const kindName = (QLABEL[kind] || kind).toUpperCase();
  const statusText = !introDone ? "BOOTING PLAYBACK ▸ LOADING" : spotlight ? "SPOTLIGHT ▸ TARGET LOCKED" : landed ? "IMPACT ▸ " + (kind === "brilliant" ? "BRILLIANT MOVE" : kind === "only" ? "ONLY MOVE" : "BEST MOVE") : finished ? "SEQUENCE COMPLETE ▸ REPLAY READY" : "SEQUENCE ▸ " + String(step - startCount).padStart(2, "0") + " / " + String(total).padStart(2, "0");
  const status = useScramble(statusText, true, 22, spotlight ? 1 : landed ? 2 : finished ? 3 : introDone ? 0 : 4);
  useEffect(() => {
    if (!onKey) return undefined;
    const h = (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); go(step + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(step - 1); }
      else if (e.key === " ") { e.preventDefault(); toggle(); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });
  const segs = []; for (let s = startCount + 1; s <= endCount; s++) segs.push(s);
  const heroSeg = moveIndex + 1;
  return (
    <div style={{ width: "100%" }}>
      <style>{KIT_CSS}</style>
      {/* HUD 머리줄 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, minHeight: 16 }}>
        <span className="ab-caret" aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: finished ? K.brass : "#8FB55E", boxShadow: "0 0 8px " + (finished ? K.brass : "#8FB55E") }} />
        <Sys color={K.brass} style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{status}</Sys>
        {playing && <EqBars n={4} />}
      </div>
      {/* 데이터 칩 — 이 유산이 어떤 수인지(등급·수·진영·재생 길이) */}
      <motion.div initial={lite ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: lite ? 0 : 0.5, duration: 0.5 }} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <Tag solid color={color} style={{ background: "linear-gradient(180deg," + color + "," + color + "CC)", color: "#10161F" }}>{kindName}</Tag>
        <Tag color={K.brassHi}>{"KEY ▸ " + moveNumber(moveIndex) + sans[moveIndex]}</Tag>
        <Tag color={K.soft}>{"SIDE ▸ " + (flip ? "BLACK" : "WHITE")}</Tag>
      </motion.div>
      <div style={{ position: "relative" }}>
        <motion.div initial={lite ? false : { opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: lite ? 1 : spotlight ? 1.1 : landed ? 1.05 : 1 }}
          transition={{ opacity: { duration: 0.7, delay: lite || introDone ? 0 : 0.15 }, y: { duration: 0.7, delay: lite || introDone ? 0 : 0.15, ease: [0.22, 0.9, 0.32, 1] }, scale: { type: "spring", stiffness: spotlight ? 55 : 90, damping: 18 } }}
          style={{ position: "relative", padding: "clamp(12px, 4vw, 20px)", transformOrigin: heroOrigin, filter: (spotlight || landed) && !lite ? "drop-shadow(0 0 24px " + color + "66)" : "none", transition: "filter .6s" }}>
          <LegacyFrame draw />
          <Board frame={frame} move={move} flip={flip} heroMove={moves[moveIndex]} heroKind={kind} spotlight={spotlight} landed={landed} epoch={epoch} isHeroStep={landed} step={step} introDone={introDone} />
        </motion.div>
        {!lite && <Brackets color={color} size={14} inset={2} pulse />}
        {/* 키 무브 배너 — 도착하면 대각선 띠가 보드를 가로질러 지나간다 */}
        <AnimatePresence>
          {landed && !lite && (
            <motion.div key={"bn" + epoch} aria-hidden="true" initial={{ x: "-110%", opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: "110%", opacity: 0 }} transition={{ duration: 0.55, ease: [0.22, 0.9, 0.32, 1] }}
              style={{ position: "absolute", left: 0, right: 0, top: "42%", height: 56, zIndex: 12, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(90deg,transparent,rgba(8,5,3,.82) 12%,rgba(8,5,3,.82) 88%,transparent)", borderTop: "1px solid " + color, borderBottom: "1px solid " + color, boxShadow: "0 0 24px " + color + "55" }}>
              <span className="ab-burst-glow" style={{ fontFamily: MONO, fontStyle: "italic", fontWeight: 900, fontSize: 24, letterSpacing: ".18em", color, textShadow: "0 2px 0 rgba(0,0,0,.8), 0 0 18px " + color + "88" }}>{kindName}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* 지금 수 */}
      <div style={{ minHeight: 46, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 8 }} aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step + ":" + epoch} initial={lite ? false : { opacity: 0, y: 8, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {landed && badgeIcon(kind, 24)}
            <span className={landed && !lite ? "ab-burst-glow" : undefined} style={{ fontFamily: MONO, fontStyle: "italic", fontWeight: 900, fontSize: 22, letterSpacing: ".02em", color: landed ? color : K.ivoryHi, textShadow: "0 1px 0 rgba(0,0,0,.8)" }}>{label}</span>
            {landed && <Tag solid color={color} style={{ background: "linear-gradient(180deg," + color + "," + color + "CC)", color: "#10161F" }}>{kindName}</Tag>}
            {spotlight && <Tag color={K.brassHi}>{t("이 수에 주목")}</Tag>}
          </motion.div>
        </AnimatePresence>
      </div>
      {/* 진행 막대 — 한 수에 한 칸, 유산 수는 등급 색 */}
      <div role="group" style={{ margin: "6px 4px 14px" }}>
        <div style={{ display: "flex", gap: 3 }}>
          {segs.map((s) => {
            const hero = s === heroSeg, on = s <= step, cur = s === step;
            return (
              <button key={s} type="button" onClick={() => go(s)} aria-label={moveNumber(s - 1) + sans[s - 1]} aria-current={cur ? "step" : undefined} style={{ flex: 1, minWidth: 0, height: 22, padding: 0, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center" }}>
                <span style={{ display: "block", width: "100%", height: hero ? 12 : 8, clipPath: para(5), transition: "all .3s", background: on ? (hero ? color : "linear-gradient(180deg," + K.brassHi + "," + K.brass + ")") : hero ? color + "40" : "rgba(236,203,134,.16)", boxShadow: cur ? "0 0 12px " + (hero ? color : K.brassHi) : "none", transform: cur ? "scaleY(1.25)" : "none" }} />
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}><Sys color={K.soft} style={{ fontSize: 9 }}>START</Sys><Sys color={color} style={{ fontSize: 9 }}>◆ KEY MOVE</Sys></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <button type="button" onClick={() => go(step - 1)} disabled={step <= startCount} aria-label={t("이전 수")} className="press" style={hudBtn(false, step <= startCount)}><SkipBack size={14} /></button>
        <button type="button" onClick={toggle} aria-label={playing ? t("일시정지") : finished ? t("다시 재생") : t("재생")} className="press ab-glint" style={hudBtn(true, false)}>
          {playing ? <Pause size={17} fill="#241509" /> : finished ? <RotateCcw size={16} /> : <Play size={17} fill="#241509" />}
        </button>
        <button type="button" onClick={() => go(step + 1)} disabled={step >= endCount} aria-label={t("다음 수")} className="press" style={hudBtn(false, step >= endCount)}><SkipForward size={14} /></button>
      </div>
    </div>
  );
}

/* 전체 화면 재생 — 기존 호출부(프로필·채팅·피드)가 그대로 쓰는 이름. */
export function LegacyRevealScreen({ typeInfo, entry, onClose }) {
  const kind = (typeInfo && typeInfo.kind) || entry.kind || "best";
  const color = QCOLOR[kind] || LEGACY_GOLD_HI, lite = isLite();
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const node = (
    <motion.div className="oc-modal-bg" role="dialog" aria-modal="true" aria-label={typeInfo ? typeInfo.label : ""} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 12px", overflowY: "auto", background: "radial-gradient(120% 90% at 50% 20%, rgba(52,35,15,.97) 0%, rgba(8,5,3,.99) 70%)" }}>
      <style>{KIT_CSS}</style>
      {!lite && <AmbientLayer />}
      <motion.div onClick={(e) => e.stopPropagation()} initial={lite ? false : { opacity: 0, scale: 0.94, clipPath: "inset(48% 0 48% 0)" }} animate={{ opacity: 1, scale: 1, clipPath: "inset(0% 0% 0% 0%)" }} transition={{ duration: 0.65, ease: [0.22, 0.9, 0.32, 1] }}
        style={{ width: "100%", maxWidth: 520, margin: "auto", position: "relative", zIndex: 5 }}>
        <CutPanel cutSize={18} accent={color} chase={!lite} bodyStyle={{ padding: "14px 14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 2px 10px" }}>
            <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)", border: "1px solid " + LEGACY_GOLD }}>{badgeIcon(kind, 22)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Sys color={K.soft} style={{ fontSize: 9.5 }}>// LEGACY ARCHIVE</Sys>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: K.ivoryHi, marginTop: 1 }}>{typeInfo ? typeInfo.label : ""}</div>
            </div>
            <button type="button" onClick={onClose} aria-label={t("닫기")} className="press" style={{ ...hudBtn(false, false), minWidth: 40, padding: "0 12px", height: 32 }}><X size={15} /></button>
          </div>
          <LegacyPlayer kind={kind} entry={entry} onKey />
        </CutPanel>
      </motion.div>
    </motion.div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : null;
}
