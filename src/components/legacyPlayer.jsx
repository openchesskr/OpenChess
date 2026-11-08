// (v0.7.4, 사용자 요청) 유산 재생기 — 예전 "빛의 보드·영사기·기물별 잡기 연출"을 모두 걷어내고 처음부터 다시 짠 절제된 연출.
//  · 열리면 금색 액자가 선으로 그려지고, 보드가 부드럽게 떠오른다.
//  · 기물은 칸을 미끄러지듯 움직이고(스프링), 잡힌 기물은 작아지며 사라진다. 방금 둔 수의 출발·도착 칸은 은은한 금빛.
//  · 유산이 되는 수 직전에는 나머지 기물이 살짝 어두워지며 그 기물만 빛난다(주목) → 도착하면 등급 색 파문과 등급 배지가 튀어 오른다.
//  · 아래에 진행 막대(수마다 눈금, 유산 수는 등급 색 마름모)와 이전·재생/일시정지·다음·다시 재생. 키보드: ←/→, 스페이스, Esc.
// 수순 → 기물 위치 계산(buildFrames)은 lib/legacyFrames.js(순수 함수)에 있고 scripts/check-legacy-player.mjs가 검사한다.
import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Play, Pause, SkipBack, SkipForward, RotateCcw } from "lucide-react";
import { T } from "../lib/theme.js";
import { t } from "../lib/i18n.js";
import { QCOLOR } from "../lib/moveKinds.js";
import { badgeIcon, QLABEL } from "./badges.jsx";
import { PieceGlyph } from "./pieces.jsx";
import { moveNumber } from "../lib/chessRules.js";
import { buildFrames } from "../lib/legacyFrames.js";
import { isLite } from "../lib/perfMode.js";
import { LegacyFrame, LEGACY_GOLD, LEGACY_GOLD_HI } from "./legacyFrame.jsx";

const SPRING = { type: "spring", stiffness: 240, damping: 27, mass: 0.8 };
const LIGHT = "#C9A86E", DARK = "#6E4B2A";

function Board({ frame, move, flip, heroMove, heroKind, spotlight, landed, epoch }) {
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
  const heroFrom = heroMove ? heroMove.from : null;
  const heroPiece = spotlight && heroFrom ? frame.find((p) => p.r === heroFrom[0] && p.c === heroFrom[1]) : null;
  return (
    <div ref={ref} style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: 3, overflow: "hidden", boxShadow: "0 0 0 1px rgba(0,0,0,.85), 0 0 0 2px rgba(212,175,95,.45), 0 16px 34px -14px rgba(0,0,0,.85)" }}>
      <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(8,1fr)", gridTemplateRows: "repeat(8,1fr)" }}>
        {Array.from({ length: 64 }, (_, k) => <div key={k} style={{ background: ((k >> 3) + (k & 7)) % 2 === 0 ? LIGHT : DARK }} />)}
      </div>
      {/* 방금 둔 수의 출발·도착 칸 — 은은한 금빛, 유산 수의 도착 칸은 등급 색 */}
      {lastSq.map(([r, c], i) => (
        <motion.span key={"ls" + epoch + r + c} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: lite ? 0 : 0.35 }}
          style={{ position: "absolute", left: sx(c) + "%", top: sy(r) + "%", width: "12.5%", height: "12.5%", background: landed && i === 1 ? heroColor : LEGACY_GOLD_HI, mixBlendMode: "soft-light", opacity: landed && i === 1 ? 0.95 : 0.7 }} />
      ))}
      {/* 주목: 유산 수를 두기 직전, 그 기물이 서 있는 칸에 숨 쉬는 링 */}
      {heroPiece && !lite && (
        <motion.span aria-hidden="true" key={"sp" + epoch} animate={{ opacity: [0.35, 1, 0.35], scale: [0.92, 1.04, 0.92] }} transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
          style={{ position: "absolute", left: sx(heroPiece.c) + "%", top: sy(heroPiece.r) + "%", width: "12.5%", height: "12.5%", boxSizing: "border-box", border: "2px solid " + heroColor, borderRadius: 6, boxShadow: "0 0 14px " + heroColor }} />
      )}
      <AnimatePresence>
        {cell > 0 && frame.map((p) => {
          const dim = spotlight && !(heroPiece && p.id === heroPiece.id);
          return (
            <motion.div key={p.id} initial={false} animate={{ left: sx(p.c) + "%", top: sy(p.r) + "%", opacity: dim ? 0.42 : 1, scale: 1 }} exit={{ opacity: 0, scale: 0.35 }}
              transition={lite ? { duration: 0 } : { left: SPRING, top: SPRING, opacity: { duration: 0.5 }, scale: { duration: 0.28 } }}
              style={{ position: "absolute", width: "12.5%", height: "12.5%", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: heroPiece && p.id === heroPiece.id ? 3 : 2 }}>
              <PieceGlyph type={p.t} color={p.col} size={cell * 0.9} pieceSkin="classic" />
            </motion.div>
          );
        })}
      </AnimatePresence>
      {/* 도착: 등급 색 파문 + 등급 배지가 도착 칸 모서리에 튀어 오른다 */}
      {landed && move && !lite && [0, 1].map((i) => (
        <motion.span key={"rp" + epoch + i} aria-hidden="true" initial={{ opacity: 0.85, scale: 0.3 }} animate={{ opacity: 0, scale: 3.2 }} transition={{ duration: 1.1, delay: i * 0.22, ease: "easeOut" }}
          style={{ position: "absolute", left: sx(move.to[1]) + "%", top: sy(move.to[0]) + "%", width: "12.5%", height: "12.5%", boxSizing: "border-box", borderRadius: "50%", border: "2px solid " + heroColor, zIndex: 1 }} />
      ))}
      {landed && move && (
        <motion.span key={"bd" + epoch} aria-hidden="true" initial={lite ? false : { opacity: 0, scale: 0.2, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 420, damping: 18, delay: lite ? 0 : 0.28 }}
          style={{ position: "absolute", left: "calc(" + (sx(move.to[1]) + 12.5) + "% - " + cell * 0.62 + "px)", top: "calc(" + sy(move.to[0]) + "% - " + cell * 0.22 + "px)", zIndex: 5, filter: "drop-shadow(0 2px 4px rgba(0,0,0,.7))" }}>{badgeIcon(heroKind, Math.max(18, cell * 0.62))}</motion.span>
      )}
    </div>
  );
}

const ctlBtn = (primary) => ({ width: primary ? 46 : 38, height: primary ? 46 : 38, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
  border: "1px solid " + (primary ? LEGACY_GOLD_HI : "rgba(212,175,95,.4)"), background: primary ? "linear-gradient(180deg,#ECCB86,#C49A50)" : "rgba(255,255,255,.05)", color: primary ? "#2A1B08" : LEGACY_GOLD_HI });

/* kind: 등급(best|only|brilliant), entry: 검증된 유산 항목. 모달·페이지 어디서든 같은 재생기. */
export function LegacyPlayer({ kind, entry, autoPlay = true, onKey }) {
  const { sans, moveIndex, playCount } = entry;
  const lite = isLite();
  const startCount = Math.max(0, moveIndex - (entry.beforeCount || 0));
  const endCount = Math.min(sans.length, moveIndex + Math.max(1, playCount || 1));
  const { frames, moves } = useMemo(() => buildFrames(sans.slice(0, endCount)), [sans, endCount]);
  const [step, setStep] = useState(startCount), [playing, setPlaying] = useState(false), [introDone, setIntroDone] = useState(false), [epoch, setEpoch] = useState(0);
  const flip = entry.side === "b", color = QCOLOR[kind] || LEGACY_GOLD_HI;
  // 열린 뒤 액자가 그려지는 동안(약 1.2초) 기다렸다가 자동 재생.
  useEffect(() => { const id = setTimeout(() => { setIntroDone(true); if (autoPlay) setPlaying(true); }, lite ? 0 : 1200); return () => clearTimeout(id); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  // 수 사이 간격: 유산 수 직전(주목)과 도착 직후(여운)는 길게.
  useEffect(() => {
    if (!playing || !introDone) return undefined;
    if (step >= endCount) { setPlaying(false); return undefined; }
    const delay = lite ? 250 : step === moveIndex ? 1500 : step === moveIndex + 1 ? 1900 : 950;
    const id = setTimeout(() => setStep((s) => Math.min(endCount, s + 1)), delay);
    return () => clearTimeout(id);
  }, [playing, introDone, step, endCount, moveIndex, lite]);
  const go = useCallback((n) => { setPlaying(false); setStep(Math.max(startCount, Math.min(endCount, n))); setEpoch((e) => e + 1); }, [startCount, endCount]);
  const replay = () => { setStep(startCount); setEpoch((e) => e + 1); setPlaying(true); };
  const toggle = () => { if (step >= endCount) replay(); else setPlaying((p) => !p); };
  const frame = frames[Math.min(step, frames.length - 1)];
  const move = step > startCount ? moves[step - 1] : null;
  const spotlight = step === moveIndex && introDone;          // 유산 수 직전
  const landed = step === moveIndex + 1;                      // 유산 수를 둔 직후
  const label = step > startCount ? moveNumber(step - 1) + sans[step - 1] : t("시작 위치");
  useEffect(() => {
    if (!onKey) return undefined;
    const h = (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); go(step + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(step - 1); }
      else if (e.key === " ") { e.preventDefault(); toggle(); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });   // 매 렌더 갱신(상태가 바뀔 때마다 최신 step을 본다)
  const ticks = []; for (let s = startCount; s <= endCount; s++) ticks.push(s);
  const heroTick = moveIndex + 1;
  return (
    <div style={{ width: "100%" }}>
      <motion.div initial={lite ? false : { opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, ease: [0.22, 0.9, 0.32, 1], delay: lite ? 0 : 0.15 }}
        style={{ position: "relative", padding: "clamp(12px, 4vw, 20px)" }}>
        <LegacyFrame draw />
        <Board frame={frame} move={move} flip={flip} heroMove={moves[moveIndex]} heroKind={kind} spotlight={spotlight} landed={landed} epoch={epoch} />
      </motion.div>
      {/* 지금 수 + 주목 안내 */}
      <div style={{ minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6, textAlign: "center" }} aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step + ":" + epoch} initial={lite ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {landed && badgeIcon(kind, 22)}
            <span style={{ fontFamily: "'Merriweather','Noto Sans KR',serif", fontWeight: 900, fontSize: 17, color: landed ? color : "#F3E7C9", textShadow: "0 1px 0 rgba(0,0,0,.8)" }}>{label}</span>
            {landed && <span style={{ fontSize: 12, fontWeight: 800, color }}>{QLABEL[kind]}</span>}
            {spotlight && <span style={{ fontSize: 12, fontWeight: 700, color: "#B9AC8C" }}>{t("이 수에 주목")}</span>}
          </motion.div>
        </AnimatePresence>
      </div>
      {/* 진행 막대 — 눈금마다 한 수, 유산 수는 등급 색 마름모 */}
      <div role="group" style={{ display: "flex", alignItems: "center", gap: 0, margin: "8px 6px 12px", position: "relative", height: 22 }}>
        <span aria-hidden="true" style={{ position: "absolute", left: 7, right: 7, top: "50%", height: 2, marginTop: -1, background: "rgba(212,175,95,.22)", borderRadius: 1 }} />
        <motion.span aria-hidden="true" animate={{ width: ((step - startCount) / Math.max(1, endCount - startCount)) * 100 + "%" }} transition={{ duration: lite ? 0 : 0.5 }}
          style={{ position: "absolute", left: 7, top: "50%", height: 2, marginTop: -1, background: "linear-gradient(90deg,#C49A50,#ECCB86)", borderRadius: 1, maxWidth: "calc(100% - 14px)" }} />
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", width: "100%" }}>
          {ticks.map((s) => {
            const hero = s === heroTick, on = s <= step, cur = s === step;
            return (
              <button key={s} type="button" onClick={() => go(s)} aria-label={s === startCount ? t("시작 위치") : moveNumber(s - 1) + sans[s - 1]} aria-current={cur ? "step" : undefined}
                style={{ width: 14, height: 22, padding: 0, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ display: "block", width: hero ? 13 : cur ? 11 : 8, height: hero ? 13 : cur ? 11 : 8, transform: hero ? "rotate(45deg)" : "none", borderRadius: hero ? 2 : "50%", transition: "all .25s",
                  background: hero ? (on ? color : "transparent") : on ? LEGACY_GOLD_HI : "#2A3550", border: "1.5px solid " + (hero ? color : on ? LEGACY_GOLD_HI : "rgba(212,175,95,.45)"), boxShadow: cur ? "0 0 0 3px rgba(236,203,134,.28)" : "none" }} />
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <button type="button" onClick={() => go(step - 1)} disabled={step <= startCount} aria-label={t("이전 수")} className="press" style={{ ...ctlBtn(false), opacity: step <= startCount ? 0.4 : 1 }}><SkipBack size={16} /></button>
        <button type="button" onClick={toggle} aria-label={playing ? t("일시정지") : step >= endCount ? t("다시 재생") : t("재생")} className="press" style={ctlBtn(true)}>
          {playing ? <Pause size={20} fill="#2A1B08" /> : step >= endCount ? <RotateCcw size={19} /> : <Play size={20} fill="#2A1B08" />}
        </button>
        <button type="button" onClick={() => go(step + 1)} disabled={step >= endCount} aria-label={t("다음 수")} className="press" style={{ ...ctlBtn(false), opacity: step >= endCount ? 0.4 : 1 }}><SkipForward size={16} /></button>
      </div>
    </div>
  );
}

/* 전체 화면 재생 — 기존 호출부(프로필·채팅·피드)가 그대로 쓰는 이름. */
export function LegacyRevealScreen({ typeInfo, entry, onClose }) {
  const kind = (typeInfo && typeInfo.kind) || entry.kind || "best";
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const node = (
    <motion.div className="oc-modal-bg" role="dialog" aria-modal="true" aria-label={typeInfo ? typeInfo.label : ""} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 12px", overflowY: "auto", background: "radial-gradient(120% 90% at 50% 20%, rgba(52,35,15,.96) 0%, rgba(8,5,3,.98) 70%)" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, margin: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px 6px" }}>
          <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)", border: "1px solid " + LEGACY_GOLD }}>{badgeIcon(kind, 22)}</span>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, color: "#F3E7C9" }}>{typeInfo ? typeInfo.label : ""}</div>
          <button type="button" onClick={onClose} aria-label={t("닫기")} className="press" style={{ ...ctlBtn(false), width: 34, height: 34 }}><X size={16} /></button>
        </div>
        <LegacyPlayer kind={kind} entry={entry} onKey />
      </div>
    </motion.div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : null;
}
