// (v0.7.5, 사용자 요청) 티어 여정 재구성 — 도감의 레슨 경로(app/lessons.jsx LessonPath)와 같은 구조로 다시 짰다.
//  · 경로: 구간(V → I)마다 입체 마름모 타일 하나가 지그재그로 이어지며 아래(아이언 V)에서 위(그랜드마스터)로 올라간다. 지나온 구간은 티어 색 실선, 앞으로 갈 구간은 점선.
//    타일 안에는 그 구간의 티어 기물 그림, 지금 구간에는 맥동 후광과 말풍선(남은 XP). 티어가 바뀌는 곳에는 장 표지(기물 배지·이름·필요 XP·진행).
//  · 위: 코치 말풍선(타일을 누르면 그 구간 설명) + 진행 링 + 닫기. 아래: 보고 있는 티어 정보·진행 막대·티어 목록·"내 위치".
//  · 배경(재설계): 어두운 전시실 — 위에서 떨어지는 티어 색 조명, 윤곽광을 받은 큰 티어 기물, 대리석 체스판 바닥, 빛 먼지, 필름 질감.
//    티어마다 고유 요소 하나(강철 결·녹청 온기·금속 광택·빛줄기·굴절광·성운·오로라). 보이는 티어가 바뀌면 배경이 부드럽게 바뀐다.
//  · 티어 이름은 사이트 기본 글꼴로 쓴다(티어 여정 전용이던 Bagel Fat One 글꼴은 삭제).
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lock, Check, List, ChevronUp, ChevronDown, Crosshair } from "./ocIcons.jsx";
import { tierPieceSrc } from "../lib/theme.js";
import { t, tx } from "../lib/i18n.js";
import { TIERS, TIER_COLORS, TIER_XP_REQ, GM_STAR_XP, DIVISIONS_PER_TIER, DIVISION_ROMAN, tierFromXp, tierGradientCss, xpForTierDivision } from "../lib/tierSystem.js";
import { isLite } from "../lib/perfMode.js";
import { SITE_FONT } from "./engineLines.jsx";
import { Mascot, useNarrow } from "../app/common.jsx";

const PAPER = "#F1E6D0", INK = "#2A1B0E";
const fmt = (n) => Math.round(n).toLocaleString();
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (a) => "#" + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, k) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * k)); };
const alpha = (h, a) => "rgba(" + rgb(h).join(",") + "," + a + ")";

/* 티어 팔레트 — 레슨 단계 팔레트(stageTheme)와 같은 규칙으로 티어 색 하나에서 만든다 */
const themeCache = {};
function tierTheme(key) {
  if (themeCache[key]) return themeCache[key];
  const c0 = TIER_COLORS[key] || TIER_COLORS.iron;
  const c = c0.stops ? c0.stops[0] : mix(c0.hi, c0.lo, 0.45);
  const hi = c0.stops ? mix(c0.stops[1], "#FFFFFF", 0.25) : mix(c0.hi, "#FFFFFF", 0.15);
  const lo = c0.stops ? mix(c0.stops[0], "#000000", 0.35) : mix(c0.lo, "#000000", 0.2);
  return (themeCache[key] = { c, hi, lo, edge: mix(lo, "#000000", 0.45), bg: mix(c, "#0B0704", 0.86), bg2: mix(c, "#0B0704", 0.72), grad: tierGradientCss(key) });
}

/* ── 배경 (v0.7.5 재설계, 사용자 요청: "고급지게") — 어두운 전시실 ──
   거의 검은 바탕 위에 위에서 떨어지는 티어 색 조명 하나, 필름 질감, 천천히 떠오르는 빛 먼지, 윤곽에 빛이 맺힌 큰 티어 기물,
   광택이 비치는 대리석 체스판 바닥. 티어마다 고유 요소는 하나씩만(아이언 강철 결 · 브론즈 녹청 온기 · 실버 금속 광택 · 골드 빛줄기 ·
   다이아몬드 굴절광 · 마스터 성운 · 그랜드마스터 오로라) 낮은 대비로 둔다. 모두 채운 면·그러데이션(선 없음). */
const GRAIN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";
const DUST = Array.from({ length: 16 }, (_, i) => ({ x: (i * 37 + 11) % 100, s: 1.5 + ((i * 7) % 5) * 0.7, d: 16 + ((i * 13) % 14), delay: -((i * 29) % 30), o: 0.25 + ((i * 3) % 5) * 0.12 }));
function TierSignature({ tierKey, th, lite }) {
  const L = { position: "absolute", pointerEvents: "none" };
  const st = TIER_COLORS.grandmaster.stops;
  switch (tierKey) {
    case "iron": return <div style={{ ...L, inset: 0, opacity: 0.5, backgroundImage: "repeating-linear-gradient(180deg, rgba(255,255,255,.035) 0 1px, transparent 1px 3px), linear-gradient(100deg, transparent 20%, rgba(190,200,212,.08) 45%, transparent 70%)" }} />;
    case "bronze": return <div style={{ ...L, inset: 0, background: "radial-gradient(40% 30% at 18% 70%, rgba(80,160,140,.10), transparent 70%), radial-gradient(50% 40% at 85% 35%, rgba(241,169,121,.12), transparent 70%)" }} />;
    case "silver": return !lite ? <div className="tj-sheen" style={{ ...L, top: 0, bottom: 0, width: "40%", background: "linear-gradient(100deg, transparent, rgba(255,255,255,.07) 45%, rgba(255,255,255,.12) 50%, rgba(255,255,255,.07) 55%, transparent)" }} /> : null;
    case "gold": return <div className={lite ? undefined : "tj-rays"} style={{ ...L, left: "50%", top: "-30%", width: "140%", height: "110%", marginLeft: "-70%", transformOrigin: "50% 0%",
      background: "repeating-conic-gradient(from 180deg at 50% 0%, rgba(253,219,130,.07) 0deg 3deg, transparent 3deg 11deg)", WebkitMaskImage: "radial-gradient(70% 80% at 50% 0%, #000 10%, transparent 75%)", maskImage: "radial-gradient(70% 80% at 50% 0%, #000 10%, transparent 75%)" }} />;
    case "diamond": return <>
      <div style={{ ...L, inset: 0, background: "conic-gradient(from 210deg at 70% 30%, transparent 0deg, rgba(79,232,255,.10) 30deg, transparent 60deg, rgba(185,140,255,.07) 110deg, transparent 150deg, rgba(110,231,200,.08) 220deg, transparent 260deg)", filter: "blur(30px)" }} />
      {!lite && [0, 1, 2, 3].map((i) => <span key={i} className="tj-glint" style={{ ...L, left: 14 + i * 22 + "%", top: 16 + ((i * 41) % 50) + "%", width: 10, height: 10, animationDelay: i * 1.3 + "s", background: "radial-gradient(circle, #FFFFFF 0 18%, rgba(233,253,255,.6) 30%, transparent 70%)", clipPath: "polygon(50% 0,60% 40%,100% 50%,60% 60%,50% 100%,40% 60%,0 50%,40% 40%)" }} />)}
    </>;
    case "master": return <>
      <div style={{ ...L, inset: 0, background: "radial-gradient(45% 35% at 25% 35%, rgba(120,60,200,.22), transparent 70%), radial-gradient(40% 35% at 78% 62%, rgba(60,40,150,.20), transparent 70%)", filter: "blur(10px)" }} />
      <svg width="100%" height="100%" style={{ ...L, inset: 0 }} aria-hidden="true">{Array.from({ length: 46 }, (_, i) => <circle key={i} cx={((i * 53) % 100) + "%"} cy={((i * 31) % 70) + "%"} r={0.5 + (i % 3) * 0.35} fill="#EDE2FF" opacity={0.18 + (i % 4) * 0.1} />)}</svg>
    </>;
    default: return <>
      {st.map((c, i) => <div key={i} className={lite ? undefined : "tj-aurora"} style={{ ...L, left: "-25%", right: "-25%", top: 6 + i * 14 + "%", height: "26%", animationDelay: -i * 4 + "s", animationDuration: 16 + i * 4 + "s", background: "linear-gradient(90deg, transparent, " + alpha(c, 0.22) + " 40%, " + alpha(c, 0.12) + " 60%, transparent)", filter: "blur(34px)", transform: "skewY(" + (i % 2 ? 6 : -6) + "deg)" }} />)}
      <svg width="100%" height="100%" style={{ ...L, inset: 0 }} aria-hidden="true">{Array.from({ length: 40 }, (_, i) => <circle key={i} cx={((i * 47) % 100) + "%"} cy={((i * 23) % 60) + "%"} r={0.5 + (i % 3) * 0.35} fill="#FFFFFF" opacity={0.2 + (i % 4) * 0.1} />)}</svg>
    </>;
  }
}
function TierBackdrop({ tierKey, on, narrow }) {
  const th = tierTheme(tierKey), lite = isLite();
  const c0 = TIER_COLORS[tierKey] || {};
  const light = c0.stops ? c0.stops[0] : c0.hi;      // 조명 색
  const L = { position: "absolute", pointerEvents: "none" };
  return (
    <div aria-hidden="true" style={{ ...L, inset: 0, overflow: "hidden", opacity: on ? 1 : 0, transition: "opacity .9s ease" }}>
      {/* 바탕: 티어 색이 아주 조금 섞인 흑단 */}
      <div style={{ ...L, inset: 0, background: "linear-gradient(180deg, " + mix(th.c, "#050302", 0.9) + " 0%, " + mix(th.c, "#050302", 0.94) + " 55%, #040302 100%)" }} />
      {/* 위에서 떨어지는 조명(원뿔) */}
      <div style={{ ...L, left: "50%", top: "-20%", width: "130%", height: "95%", marginLeft: "-65%", background: "radial-gradient(50% 60% at 50% 0%, " + alpha(light, 0.26) + " 0%, " + alpha(light, 0.08) + " 45%, transparent 75%)" }} />
      {on && <TierSignature tierKey={tierKey} th={th} lite={lite} />}
      {/* 큰 티어 기물 — 어둠 속 조각상처럼 검은 실루엣에 티어 색 윤곽광 */}
      <img src={tierPieceSrc(tierKey, null)} alt="" draggable={false} style={{ ...L, right: narrow ? "-24%" : "-9%", bottom: narrow ? "16%" : "13%", height: narrow ? "46%" : "58%", maxHeight: 560, objectFit: "contain",
        filter: "brightness(0) drop-shadow(0 0 1.5px " + alpha(light, 0.9) + ") drop-shadow(0 0 18px " + alpha(light, 0.35) + ")", opacity: narrow ? 0.4 : 0.55,
        WebkitMaskImage: "linear-gradient(180deg, #000 30%, transparent 92%)", maskImage: "linear-gradient(180deg, #000 30%, transparent 92%)" }} />
      {/* 대리석 체스판 바닥 — 낮은 대비의 칸 + 위쪽 조명이 비친 광택, 멀어질수록 사라진다 */}
      <div style={{ ...L, left: "-50%", right: "-50%", bottom: 0, height: "46%", transform: "perspective(600px) rotateX(64deg)", transformOrigin: "50% 100%",
        backgroundImage: "radial-gradient(40% 60% at 50% 0%, " + alpha(light, 0.16) + ", transparent 70%), repeating-conic-gradient(rgba(255,255,255,.045) 0 25%, rgba(0,0,0,.25) 0 50%)", backgroundSize: "100% 100%, 110px 110px", backgroundPosition: "center, center bottom",
        WebkitMaskImage: "linear-gradient(0deg, rgba(0,0,0,.9) 0%, rgba(0,0,0,.35) 50%, transparent 100%)", maskImage: "linear-gradient(0deg, rgba(0,0,0,.9) 0%, rgba(0,0,0,.35) 50%, transparent 100%)" }} />
      {/* 지평선의 은은한 빛 띠 */}
      <div style={{ ...L, left: 0, right: 0, bottom: "44%", height: 60, marginBottom: -30, background: "radial-gradient(50% 50% at 50% 50%, " + alpha(light, 0.05) + ", transparent 70%)" }} />
      {/* 빛 먼지 */}
      {on && !lite && DUST.map((p, i) => <span key={i} className="tj-dust" style={{ ...L, left: p.x + "%", bottom: -10, width: p.s, height: p.s, borderRadius: "50%", background: light, boxShadow: "0 0 " + p.s * 3 + "px " + alpha(light, 0.8), "--o": p.o, animationDuration: p.d + "s", animationDelay: p.delay + "s" }} />)}
      {/* 필름 질감 + 비네트 */}
      <div style={{ ...L, inset: 0, backgroundImage: GRAIN, opacity: 0.05, mixBlendMode: "overlay" }} />
      <div style={{ ...L, inset: 0, background: "radial-gradient(120% 85% at 50% 38%, transparent 45%, rgba(0,0,0,.55) 100%)" }} />
    </div>
  );
}

/* ── 구간 타일(입체 마름모) — 윗면은 티어 색에 체스판 결(2×2 칸)을 얹고, 안에 그 구간의 티어 기물 ── */
function DivisionTile({ node, status, size, onOpen, flash, info }) {
  const th = tierTheme(node.tier.key);
  const cur = status === "current", done = status === "done", locked = status === "locked";
  const side = size / Math.SQRT2;
  const face = locked ? "rgba(255,255,255,.05)" : "linear-gradient(155deg, " + th.hi + " 0%, " + th.c + " 50%, " + th.lo + " 100%)";
  const label = node.gm ? node.tier.label : node.tier.label + " " + DIVISION_ROMAN[node.d];
  const pct = cur ? Math.max(0, Math.min(100, (info.xpInDivision / info.xpForNextDivision) * 100)) : 0;
  return (
    <motion.button type="button" onClick={() => onOpen(node)} title={label} aria-label={label + (locked ? ", " + t("잠김") : done ? ", " + t("달성") : cur ? ", " + t("진행 중") : "")} className={"tier-tile" + (locked ? " is-locked" : "")}
      animate={flash ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }} transition={{ duration: 0.36 }}
      style={{ position: "relative", width: size, height: size, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}>
      {cur && <>
        <span aria-hidden="true" className="tier-halo" style={{ "--c": alpha(th.hi, 0.6), position: "absolute", left: "50%", top: "50%", width: side, height: side, marginLeft: -side / 2, marginTop: -side / 2, borderRadius: "24%", transform: "rotate(45deg)" }} />
        <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: side * 2, height: side * 2, marginLeft: -side, marginTop: -side, borderRadius: "50%", background: "radial-gradient(circle, " + alpha(th.c, 0.5) + ", transparent 65%)", pointerEvents: "none" }} />
      </>}
      {!locked && <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: side, height: side, marginLeft: -side / 2, marginTop: -side / 2 + 7, borderRadius: "24%", transform: "rotate(45deg)", background: th.edge, boxShadow: "0 10px 18px -6px rgba(0,0,0,.6)" }} />}
      <span className="tier-face" aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: side, height: side, marginLeft: -side / 2, marginTop: -side / 2, borderRadius: "24%", transform: "rotate(45deg)", overflow: "hidden", background: face,
        boxShadow: locked ? "inset 0 0 0 1.5px rgba(255,255,255,.12)" : "inset 0 2px 0 rgba(255,255,255,.45), inset 0 -2px 0 rgba(0,0,0,.18)" }}>
        {!locked && <span style={{ position: "absolute", inset: 0, backgroundImage: "repeating-conic-gradient(rgba(255,255,255,.14) 0 25%, rgba(0,0,0,.06) 0 50%)", backgroundSize: (side / 2) + "px " + (side / 2) + "px" }} />}
      </span>
      <span style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
        <img src={tierPieceSrc(node.tier.key, node.gm ? null : node.d)} alt="" draggable={false} style={{ width: size * 0.66, height: size * 0.66, objectFit: "contain", filter: locked ? "grayscale(1) brightness(.55) opacity(.55)" : "drop-shadow(0 3px 3px rgba(0,0,0,.45))" }} />
        {locked && <span style={{ position: "absolute", right: size * 0.2, bottom: size * 0.2 }}><Lock size={13} color="rgba(255,255,255,.55)" /></span>}
      </span>
      {done && <span aria-hidden="true" style={{ position: "absolute", zIndex: 2, right: size * 0.06, top: size * 0.06, width: 20, height: 20, borderRadius: "50%", background: PAPER, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 4px rgba(0,0,0,.4)" }}><Check size={12} color={th.lo} /></span>}
      {cur && (
        <span aria-hidden="true" style={{ position: "absolute", zIndex: 3, left: "50%", bottom: "100%", transform: "translate(-50%, 2px)", display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 11px", borderRadius: 10, background: PAPER, color: INK, fontFamily: SITE_FONT, whiteSpace: "nowrap", boxShadow: "0 6px 14px rgba(0,0,0,.45)", minWidth: 116 }}>
            <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 900 }}>{node.gm ? label + (info.gmStars ? " ★" + info.gmStars : "") : label}</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: th.lo, fontVariantNumeric: "tabular-nums" }}>{Math.round(pct)}%</span>
            </span>
            <span style={{ height: 4, borderRadius: 2, background: "rgba(0,0,0,.12)", overflow: "hidden" }}><span style={{ display: "block", width: pct + "%", height: "100%", background: th.lo }} /></span>
          </span>
          <span style={{ width: 10, height: 10, marginTop: -5, background: PAPER, transform: "rotate(45deg)" }} />
        </span>
      )}
    </motion.button>
  );
}

/* ── 장 표지: 티어 기물 배지 · n번째 티어 · 이름(티어 그러데이션) · 필요 XP · 진행 ── */
function TierBadge({ tierKey, size = 44, glow = false }) {
  const th = tierTheme(tierKey);
  return (
    <span aria-hidden="true" style={{ position: "relative", width: size, height: size, flexShrink: 0, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(circle at 35% 30%, " + th.hi + ", " + th.c + " 62%, " + th.lo + ")", boxShadow: "inset 0 1px 0 rgba(255,255,255,.35), 0 " + Math.max(2, size / 14) + "px 0 " + th.edge + (glow ? ", 0 0 " + size * 0.6 + "px " + alpha(th.c, 0.55) : "") }}>
      <img src={tierPieceSrc(tierKey, null)} alt="" draggable={false} style={{ width: size * 0.72, height: size * 0.72, objectFit: "contain" }} />
    </span>
  );
}
function TierMark({ tier, idx, done, total, status }) {
  const th = tierTheme(tier.key), isGM = tier.key === "grandmaster";
  const req = isGM ? null : TIER_XP_REQ[idx];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "0 18px", boxSizing: "border-box" }}>
      <span aria-hidden="true" style={{ flex: 1, height: 2, background: "linear-gradient(90deg, transparent, " + alpha(th.hi, 0.5) + ")" }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 0 }}>
        <TierBadge tierKey={tier.key} size={48} glow={status !== "locked"} />
        <span style={{ fontFamily: SITE_FONT, fontSize: 11, fontWeight: 800, color: alpha(th.hi, 0.9), letterSpacing: ".04em" }}>{t("{0}번째 티어", idx + 1)}</span>
        <span style={{ fontFamily: SITE_FONT, fontSize: 21, fontWeight: 900, letterSpacing: "-.02em", lineHeight: 1.1, textAlign: "center", background: th.grad, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", filter: "drop-shadow(0 2px 0 rgba(0,0,0,.55))" }}>{tier.label}</span>
        <span style={{ fontFamily: SITE_FONT, fontSize: 11.5, fontWeight: 600, color: "rgba(255,246,226,.62)", textAlign: "center" }}>
          {isGM ? tx("{0} XP마다 ★", fmt(GM_STAR_XP)) : tx("총 {0} XP", fmt(req))}{!isGM && <> · <b style={{ color: th.hi, fontVariantNumeric: "tabular-nums" }}>{done}/{total}</b></>}
        </span>
      </div>
      <span aria-hidden="true" style={{ flex: 1, height: 2, background: "linear-gradient(90deg, " + alpha(th.hi, 0.5) + ", transparent)" }} />
    </div>
  );
}
function ProgressRing({ done, total, color, size = 46, children }) {
  const r = size / 2 - 4, C = 2 * Math.PI * r, f = total ? done / total : 0;
  return (
    <span style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - f)} style={{ transition: "stroke-dashoffset .6s, stroke .6s" }} />
      </svg>
      <span style={{ fontFamily: SITE_FONT, fontSize: 11, fontWeight: 900, color: "#FFF6E2", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{children}</span>
    </span>
  );
}

/* 구간 상태 */
function nodeStatus(node, info) {
  if (info.tierIndex > node.idx) return "done";
  if (info.tierIndex < node.idx) return "locked";
  if (node.gm) return "current";
  return node.d > info.division ? "done" : node.d === info.division ? "current" : "locked";
}
const PAT = [0, 1, 0, -1];
const topIn = (sc, el) => el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;

export default function TierJourney({ totalXp, onClose }) {
  const info = useMemo(() => tierFromXp(totalXp), [totalXp]);
  const narrow = useNarrow(640);
  const D = narrow ? 86 : 98;
  const DX = D * 0.62, ROW = D * 0.8, CH = 190;
  const TOP = narrow ? 132 : 136, BOTTOM = narrow ? 176 : 128;
  // 위에서 아래로: 그랜드마스터 → … → 아이언. 티어마다 [구간 I … V], 그 아래 장 표지. 맨 아래가 아이언 V(출발).
  const layout = useMemo(() => {
    const items = []; let y = TOP, seq = 0;
    const nodes = [];
    TIERS.forEach((tier, idx) => {
      if (tier.key === "grandmaster") nodes.push({ id: tier.key, tier, idx, gm: true, d: null });
      else for (let d = DIVISIONS_PER_TIER; d >= 1; d--) nodes.push({ id: tier.key + d, tier, idx, gm: false, d });
    });
    nodes.forEach((n) => { n.seq = seq++; });
    for (const tier of [...TIERS].reverse()) {
      const ns = nodes.filter((n) => n.tier.key === tier.key).reverse();
      for (const n of ns) { items.push({ kind: "node", node: n, x: PAT[n.seq % PAT.length] * DX, y: y + ROW / 2 }); y += ROW; }
      items.push({ kind: "tier", tier, idx: TIERS.indexOf(tier), y: y + 16 }); y += CH;
    }
    return { items, nodes, height: y + BOTTOM };
  }, [DX, ROW, TOP, BOTTOM]);
  const curNode = layout.nodes.find((n) => nodeStatus(n, info) === "current") || layout.nodes[0];
  const scRef = useRef(null), tileRefs = useRef({});
  const [viewTier, setViewTier] = useState(info.tier.key);
  const [listOpen, setListOpen] = useState(false);
  const [curDir, setCurDir] = useState(0);
  const [coachMsg, setCoachMsg] = useState(null);
  const [flash, setFlash] = useState(null);
  const vIdx = TIERS.findIndex((x) => x.key === viewTier), vTier = TIERS[vIdx], vth = tierTheme(viewTier);

  const scrollToNode = useCallback((id, smooth = true) => {
    const sc = scRef.current, el = tileRefs.current[id]; if (!sc || !el) return;
    sc.scrollTo({ top: topIn(sc, el) - sc.clientHeight / 2 + D / 2 + 10, behavior: smooth && !isLite() ? "smooth" : "auto" });
  }, [D]);
  useLayoutEffect(() => { scrollToNode(curNode.id, false); }, [curNode.id, scrollToNode]);
  const onScroll = () => {
    const sc = scRef.current; if (!sc) return;
    const mid = sc.scrollTop + sc.clientHeight * 0.55;
    let best = null, bd = Infinity;
    for (const it of layout.items) if (it.kind === "node") { const d = Math.abs(it.y - mid); if (d < bd) { bd = d; best = it.node.tier.key; } }
    if (best && best !== viewTier) setViewTier(best);
    const it = layout.items.find((x) => x.node && x.node.id === curNode.id);
    if (it) { const y = it.y - sc.scrollTop; setCurDir(y < TOP - 20 ? -1 : y > sc.clientHeight - BOTTOM + 10 ? 1 : 0); }
  };
  useEffect(() => { onScroll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [layout]);
  useEffect(() => { const h = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const left = Math.max(0, info.xpForNextDivision - info.xpInDivision);
  const nextLabel = info.maxed ? null : (info.division > 1 ? info.tier.label + " " + DIVISION_ROMAN[info.division - 1] : (TIERS[info.tierIndex + 1] || {}).label);
  const defaultCoach = info.maxed ? tx("다음 별까지 {0} XP 남았습니다.", fmt(left)) : tx("{0}까지 {1} XP 남았습니다.", nextLabel, fmt(left));
  const openNode = (n) => {
    const st = nodeStatus(n, info), name = n.gm ? n.tier.label : n.tier.label + " " + DIVISION_ROMAN[n.d];
    if (st === "locked") { setFlash(n.id); setTimeout(() => setFlash(null), 420); setCoachMsg(tx("{0}: 누적 {1} XP에 도달하면 열립니다.", name, fmt(xpForTierDivision(n.tier.key, n.d, 0)))); }
    else if (st === "done") setCoachMsg(tx("{0}: 이미 지나온 구간입니다.", name));
    else setCoachMsg(tx("{0}: 지금 있는 구간입니다. {1}", name, defaultCoach));
  };
  const coach = coachMsg || defaultCoach;
  const tierDone = (idx) => layout.nodes.filter((n) => n.idx === idx && nodeStatus(n, info) === "done").length;
  const tierTotal = (idx) => layout.nodes.filter((n) => n.idx === idx).length;
  const tierStatus = (idx) => (info.tierIndex > idx ? "done" : info.tierIndex === idx ? "current" : "locked");
  // 경로 선 — 같은 티어 안에서 이웃한 구간을 잇는다(티어가 바뀌는 곳은 장 표지가 잇는다)
  const pts = layout.items.filter((x) => x.kind === "node").sort((a, b) => a.node.seq - b.node.seq);
  const SW = DX * 2 + D * 2;
  const segs = pts.slice(1).map((p, i) => ({ a: pts[i], b: p, lit: nodeStatus(pts[i].node, info) === "done" && nodeStatus(p.node, info) !== "locked" })).filter((s) => s.a.node.idx === s.b.node.idx);
  const curPct = Math.max(0, Math.min(100, (info.xpInDivision / info.xpForNextDivision) * 100));

  return (
    <div className="tier-path" style={{ position: "relative", height: "100%", overflow: "hidden", isolation: "isolate", fontFamily: SITE_FONT, background: "#0B0704" }}>
      <style>{`
        @keyframes tierHalo{0%{opacity:.85;transform:rotate(45deg) scale(1)}100%{opacity:0;transform:rotate(45deg) scale(1.6)}}
        .tier-halo{box-shadow:0 0 0 2px var(--c);animation:tierHalo 1.8s ease-out infinite}
        .tier-tile .tier-face{transition:filter .18s}
        .tier-tile:not(.is-locked):hover .tier-face{filter:brightness(1.1)}
        .tier-tile:focus-visible{outline:2px solid #FFF6E2;outline-offset:4px;border-radius:14px}
        .tier-scroll{scrollbar-width:none}.tier-scroll::-webkit-scrollbar{display:none}
        .tier-glass{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
        @keyframes tjDust{0%{transform:translate(0,0);opacity:0}10%{opacity:var(--o,.5)}85%{opacity:var(--o,.5)}100%{transform:translate(24px,-105vh);opacity:0}}
        .tj-dust{animation:tjDust linear infinite}
        @keyframes tjSheen{from{left:-45%}to{left:110%}}
        .tj-sheen{animation:tjSheen 14s ease-in-out infinite}
        @keyframes tjRays{0%,100%{transform:rotate(-4deg);opacity:.8}50%{transform:rotate(4deg);opacity:1}}
        .tj-rays{animation:tjRays 18s ease-in-out infinite}
        @keyframes tjGlint{0%,70%,100%{transform:scale(0) rotate(0);opacity:0}80%{transform:scale(1.4) rotate(45deg);opacity:1}90%{transform:scale(.6) rotate(90deg);opacity:.6}}
        .tj-glint{animation:tjGlint 5.2s ease-in-out infinite}
        @keyframes tjAurora{0%,100%{translate:-6% 0;opacity:.75}50%{translate:6% 0;opacity:1}}
        .tj-aurora{animation:tjAurora 18s ease-in-out infinite}
      `}</style>
      {TIERS.map((tier) => <TierBackdrop key={tier.key} tierKey={tier.key} on={tier.key === viewTier} narrow={narrow} />)}
      {/* 경로 */}
      <div ref={scRef} onScroll={onScroll} className="tier-scroll" style={{ position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ position: "relative", height: layout.height, maxWidth: 900, margin: "0 auto" }}>
          <svg aria-hidden="true" width={SW} height={layout.height} style={{ position: "absolute", left: "50%", top: 0, marginLeft: -SW / 2, pointerEvents: "none" }}>
            {segs.map((s, i) => {
              const th = tierTheme(s.b.node.tier.key);
              return <line key={i} x1={SW / 2 + s.a.x} y1={s.a.y} x2={SW / 2 + s.b.x} y2={s.b.y} stroke={s.lit ? th.hi : "rgba(255,255,255,.18)"} strokeWidth={s.lit ? 5 : 3} strokeLinecap="round" strokeDasharray={s.lit ? undefined : "1 10"} opacity={s.lit ? 0.85 : 1} />;
            })}
          </svg>
          {layout.items.map((it) => {
            if (it.kind === "tier") return <div key={"t" + it.tier.key} style={{ position: "absolute", left: 0, right: 0, top: it.y }}><TierMark tier={it.tier} idx={it.idx} done={tierDone(it.idx)} total={tierTotal(it.idx)} status={tierStatus(it.idx)} /></div>;
            const st = nodeStatus(it.node, info);
            return (
              <div key={it.node.id} ref={(el) => { tileRefs.current[it.node.id] = el; }} style={{ position: "absolute", left: "50%", top: it.y - D / 2, marginLeft: it.x - D / 2, width: D, height: D, zIndex: st === "current" ? 2 : 1 }}>
                <DivisionTile node={it.node} status={st} size={D} onOpen={openNode} flash={flash === it.node.id} info={info} />
              </div>
            );
          })}
        </div>
      </div>
      {/* 위: 코치 + 진행 링 + 닫기 */}
      <div className="tier-glass" style={{ position: "absolute", left: 10, right: 10, top: "calc(10px + env(safe-area-inset-top, 0px))", zIndex: 3, display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 8px 8px", borderRadius: 14,
        background: alpha(vth.bg, 0.62), border: "1px solid rgba(255,255,255,.08)", boxShadow: "0 10px 24px -12px rgba(0,0,0,.7)" }}>
        <Mascot name="milku" emotion={coachMsg ? "think" : "great"} size={narrow ? 42 : 48} />
        <div aria-live="polite" style={{ position: "relative", flex: "0 1 auto", maxWidth: 560, minWidth: 0, padding: "9px 12px", borderRadius: 11, background: PAPER, color: INK, fontSize: narrow ? 12.5 : 13.5, fontWeight: 700, lineHeight: 1.4 }}>
          <span aria-hidden="true" style={{ position: "absolute", left: -5, top: "50%", marginTop: -5, width: 10, height: 10, background: PAPER, transform: "rotate(45deg)" }} />
          <span style={{ position: "relative" }}>{coach}</span>
        </div>
        <span style={{ flex: 1 }} />
        <ProgressRing done={curPct} total={100} color={tierTheme(info.tier.key).hi} size={narrow ? 42 : 48}>{Math.round(curPct)}<span style={{ opacity: 0.55, fontSize: 9 }}>%</span></ProgressRing>
        <button type="button" onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 12, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.07)", color: "#FFF6E2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={18} /></button>
      </div>
      {/* 아래: 보고 있는 티어 + 내 위치 */}
      <div className="tier-glass" style={{ position: "absolute", left: 10, right: 10, bottom: "calc(10px + env(safe-area-inset-bottom, 0px))", zIndex: 3, padding: 10, borderRadius: 16, background: alpha(vth.bg, 0.72), border: "1px solid rgba(255,255,255,.08)", boxShadow: "0 -6px 24px -12px rgba(0,0,0,.7)",
        display: "flex", flexDirection: narrow ? "column" : "row", alignItems: narrow ? "stretch" : "center", gap: 10, maxWidth: 880, marginLeft: "auto", marginRight: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <button type="button" onClick={() => setListOpen(true)} aria-label={t("티어 목록")} className="press"
            style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", color: "#FFF6E2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><List size={19} /></button>
          <TierBadge tierKey={viewTier} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={viewTier} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: vth.hi }}>{t("{0}번째 티어", vIdx + 1)} · {vTier.key === "grandmaster" ? tx("{0} XP마다 ★", fmt(GM_STAR_XP)) : tx("총 {0} XP", fmt(TIER_XP_REQ[vIdx]))}</div>
                <div style={{ fontSize: narrow ? 16 : 17, fontWeight: 900, color: "#FFF6E2", letterSpacing: "-.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{vTier.label}</div>
              </motion.div>
            </AnimatePresence>
            <div aria-hidden="true" style={{ marginTop: 5, height: 4, borderRadius: 2, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
              <div style={{ width: (vTier.key === "grandmaster" ? (info.tierIndex >= vIdx ? 100 : 0) : (100 * tierDone(vIdx)) / Math.max(1, tierTotal(vIdx))) + "%", height: "100%", background: vth.hi, transition: "width .5s, background .6s" }} />
            </div>
          </div>
          {curDir !== 0 && (
            <button type="button" onClick={() => scrollToNode(curNode.id)} aria-label={t("내 위치")} className="press"
              style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 12, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", color: "#FFF6E2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              {curDir < 0 ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
            </button>
          )}
        </div>
        {(() => { const ct = tierTheme(info.tier.key); return (
          <button type="button" onClick={() => { setCoachMsg(null); scrollToNode(curNode.id); }} className="press"
            style={{ position: "relative", minWidth: narrow ? 0 : 168, width: narrow ? "100%" : "auto", padding: "12px 18px", borderRadius: 14, border: "none", cursor: "pointer", fontFamily: SITE_FONT, fontSize: 15, fontWeight: 900, color: "#1A1006",
              background: "linear-gradient(180deg, " + ct.hi + ", " + ct.c + ")", boxShadow: "0 4px 0 " + ct.edge + ", 0 10px 20px -8px rgba(0,0,0,.6)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Crosshair size={16} />{t("내 위치")}
          </button>); })()}
      </div>
      {/* 티어 목록 */}
      <AnimatePresence>
        {listOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setListOpen(false)}
            style={{ position: "absolute", inset: 0, zIndex: 5, background: "rgba(8,5,3,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 10 }}>
            <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ duration: 0.22 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("티어 목록")} className="tier-glass"
              style={{ width: "100%", maxWidth: 880, maxHeight: "86%", overflowY: "auto", padding: 8, borderRadius: 18, background: "rgba(22,15,10,.9)", border: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column", gap: 6 }}>
              {[...TIERS].reverse().map((tier) => {
                const idx = TIERS.indexOf(tier), th = tierTheme(tier.key), dn = tierDone(idx), tt = tierTotal(idx), st = tierStatus(idx);
                return (
                  <button key={tier.key} type="button" className="press" onClick={() => { setListOpen(false); const ns = layout.nodes.filter((n) => n.idx === idx); scrollToNode((ns.find((n) => nodeStatus(n, info) !== "done") || ns[ns.length - 1]).id); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14, border: "1px solid " + alpha(th.hi, st === "current" ? 0.55 : 0.18), cursor: "pointer", textAlign: "left", background: "linear-gradient(100deg, " + th.bg2 + ", " + th.bg + ")", opacity: st === "locked" ? 0.7 : 1 }}>
                    <TierBadge tierKey={tier.key} size={38} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontFamily: SITE_FONT, fontSize: 11, fontWeight: 800, color: th.hi }}>{t("{0}번째 티어", idx + 1)} · {st === "done" ? t("달성") : st === "current" ? t("진행 중") : t("잠김")}</span>
                      <span style={{ display: "block", fontFamily: SITE_FONT, fontSize: 15, fontWeight: 900, color: "#FFF6E2" }}>{tier.label}</span>
                      <span style={{ display: "block", fontFamily: SITE_FONT, fontSize: 11.5, fontWeight: 600, color: "rgba(255,246,226,.6)" }}>{tier.key === "grandmaster" ? tx("{0} XP마다 ★", fmt(GM_STAR_XP)) : tx("총 {0} XP", fmt(TIER_XP_REQ[idx]))}</span>
                    </span>
                    {tier.key === "grandmaster"
                      ? <ProgressRing done={st === "locked" ? 0 : 1} total={1} color={th.hi} size={40}>{st === "locked" ? "–" : "★" + info.gmStars}</ProgressRing>
                      : <ProgressRing done={dn} total={tt} color={th.hi} size={40}>{dn}<span style={{ opacity: 0.55 }}>/{tt}</span></ProgressRing>}
                  </button>
                );
              })}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
