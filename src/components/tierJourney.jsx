// (v0.7.5, 사용자 요청) 티어 여정 재구성 — 도감의 레슨 경로(app/lessons.jsx LessonPath)와 같은 구조로 다시 짰다.
//  · 경로: 구간(V → I)마다 입체 마름모 타일 하나가 지그재그로 이어지며 아래(아이언 V)에서 위(그랜드마스터)로 올라간다. 지나온 구간은 티어 색 실선, 앞으로 갈 구간은 점선.
//    타일 안에는 그 구간의 티어 기물 그림, 지금 구간에는 맥동 후광과 말풍선(남은 XP). 티어가 바뀌는 곳에는 장 표지(기물 배지·이름·필요 XP·진행).
//  · 위: 코치 말풍선(타일을 누르면 그 구간 설명) + 진행 링 + 닫기. 아래: 보고 있는 티어 정보·진행 막대·티어 목록·"내 위치".
//  · 배경: 예전 티어 챕터의 재질(아이언 강판·브론즈 두드린 구리·실버 금속결·골드 햇살·다이아몬드 결정면·마스터 성운·그랜드마스터 오로라)을
//    선 없이 채운 면으로 다시 그리고, 그 위에 원근 체스판 바닥과 그 티어 기물의 실루엣을 깔았다. 보이는 티어가 바뀌면 배경이 부드럽게 바뀐다.
//  · 티어 이름은 사이트 기본 글꼴로 쓴다(티어 여정 전용이던 Bagel Fat One 글꼴은 삭제).
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lock, Check, List, ChevronUp, ChevronDown, Crosshair } from "./ocIcons.jsx";
import { PIECE_IMG_SETS, tierPieceSrc } from "../lib/theme.js";
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
const pieceImg = (p) => { const s = PIECE_IMG_SETS.classic.images[p]; return s && s.w ? s.w.src : ""; };
const TIER_PIECE = { iron: "P", bronze: "N", silver: "B", gold: "R", diamond: "Q", master: "K", grandmaster: "K" };

/* ── 배경: 티어 재질(선 없이 채운 면) + 원근 체스판 바닥 + 기물 실루엣 ── */
function TierBackdrop({ tierKey, on }) {
  const th = tierTheme(tierKey), lite = isLite();
  const c0 = TIER_COLORS[tierKey] || {};
  const acc = c0.hi || (c0.stops && c0.stops[1]) || th.hi;
  const layer = { position: "absolute", inset: 0, pointerEvents: "none" };
  let mat = null;
  if (tierKey === "iron") mat = <>
    <div style={{ ...layer, background: "linear-gradient(160deg,#4A5058 0%,#23272C 60%,#121417 100%)" }} />
    {/* 강판 이음매(채운 띠)와 리벳(채운 점) */}
    <div style={{ ...layer, opacity: 0.5, backgroundImage: "linear-gradient(90deg, rgba(0,0,0,.45) 0 2px, transparent 2px), linear-gradient(180deg, rgba(0,0,0,.45) 0 2px, transparent 2px), radial-gradient(circle at 12px 12px, #A9B0B8 0 2.6px, transparent 3px), radial-gradient(circle at 108px 12px, #A9B0B8 0 2.6px, transparent 3px), radial-gradient(circle at 12px 78px, #A9B0B8 0 2.6px, transparent 3px), radial-gradient(circle at 108px 78px, #A9B0B8 0 2.6px, transparent 3px)", backgroundSize: "120px 90px" }} />
  </>;
  else if (tierKey === "bronze") mat = <>
    <div style={{ ...layer, background: "radial-gradient(120% 90% at 20% 0%, #8A4A24 0%, #4A2412 45%, #1E0E06 100%)" }} />
    {/* 두드린 자국: 밝은 쪽(왼쪽 위)과 그림자(오른쪽 아래)가 있는 둥근 면 */}
    <div style={{ ...layer, opacity: 0.45, backgroundImage: "radial-gradient(circle at 10px 10px, rgba(241,169,121,.55) 0 3px, rgba(241,169,121,.12) 6px, rgba(0,0,0,.25) 9px, transparent 11px), radial-gradient(circle at 33px 29px, rgba(241,169,121,.4) 0 4px, rgba(241,169,121,.1) 8px, rgba(0,0,0,.25) 12px, transparent 14px)", backgroundSize: "46px 46px" }} />
  </>;
  else if (tierKey === "silver") mat = <>
    <div style={{ ...layer, background: "linear-gradient(100deg,#3A4046 0%,#6B737B 22%,#2D3237 40%,#7B848C 62%,#2B3035 82%,#555D65 100%)" }} />
    <div style={{ ...layer, backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,.07) 0 1px, transparent 1px 4px)" }} />
    {!lite && on && <motion.div animate={{ x: ["-30%", "130%"] }} transition={{ duration: 9, repeat: Infinity, ease: "linear" }} style={{ position: "absolute", top: 0, bottom: 0, width: "30%", background: "linear-gradient(100deg,transparent,rgba(255,255,255,.16),transparent)", transform: "skewX(-18deg)" }} />}
  </>;
  else if (tierKey === "gold") mat = <>
    <div style={{ ...layer, background: "radial-gradient(90% 70% at 50% 0%, #B8862F 0%, #5A3D12 50%, #1E1405 100%)" }} />
    <motion.div animate={lite || !on ? undefined : { rotate: 360 }} transition={{ duration: 120, repeat: Infinity, ease: "linear" }} style={{ position: "absolute", left: "50%", top: -260, width: 760, height: 760, marginLeft: -380, background: "repeating-conic-gradient(from 0deg, rgba(253,219,130,.14) 0deg 6deg, transparent 6deg 18deg)", WebkitMaskImage: "radial-gradient(circle, #000 20%, transparent 70%)", maskImage: "radial-gradient(circle, #000 20%, transparent 70%)" }} />
    {/* 마름모 격자 — 채운 작은 마름모 */}
    <div style={{ ...layer, opacity: 0.22, backgroundImage: "linear-gradient(45deg, transparent 46%, " + acc + " 46% 54%, transparent 54%), linear-gradient(-45deg, transparent 46%, " + acc + " 46% 54%, transparent 54%)", backgroundSize: "40px 40px" }} />
  </>;
  else if (tierKey === "diamond") mat = <>
    <div style={{ ...layer, background: "linear-gradient(160deg,#04364A 0%,#02506E 40%,#021A26 100%)" }} />
    <svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style={{ ...layer, opacity: 0.6 }}>
      {[[0, 300, 120, 80, 200, 300, 0.1], [120, 80, 200, 300, 280, 60, 0.05], [200, 300, 280, 60, 400, 260, 0.13], [0, 0, 120, 80, 0, 300, 0.07], [280, 60, 400, 0, 400, 260, 0.04], [120, 80, 280, 60, 200, 0, 0.16]].map((p, i) => <polygon key={i} points={p.slice(0, 6).join(" ")} fill={acc} opacity={p[6]} />)}
    </svg>
    {!lite && on && [0, 1, 2, 3, 4, 5].map((i) => <motion.span key={i} animate={{ opacity: [0, 1, 0], scale: [0.4, 1, 0.4] }} transition={{ duration: 3 + (i % 3), repeat: Infinity, delay: i * 0.6 }} style={{ position: "absolute", left: 8 + i * 15 + "%", top: 10 + ((i * 37) % 60) + "%", width: 6, height: 6, background: "#E9FDFF", transform: "rotate(45deg)", boxShadow: "0 0 10px " + acc }} />)}
  </>;
  else if (tierKey === "master") mat = <>
    <div style={{ ...layer, background: "radial-gradient(70% 60% at 25% 30%, #5A2A98 0%, transparent 60%), radial-gradient(60% 60% at 80% 70%, #2D1B6E 0%, transparent 62%), #12081F" }} />
    <svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style={{ ...layer, opacity: 0.6 }}>
      {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={(i * 97) % 400} cy={(i * 61) % 300} r={0.6 + (i % 3) * 0.5} fill="#E6D2FF" opacity={0.3 + (i % 4) * 0.15} />)}
    </svg>
  </>;
  else mat = <>
    <div style={{ ...layer, background: "linear-gradient(180deg,#05040D 0%,#0B0818 100%)" }} />
    {(TIER_COLORS.grandmaster.stops).map((s, i) => (
      <motion.div key={i} animate={lite || !on ? undefined : { x: ["-8%", "8%", "-8%"], opacity: [0.5, 0.85, 0.5] }} transition={{ duration: 11 + i * 3, repeat: Infinity, ease: "easeInOut", delay: i * 1.4 }}
        style={{ position: "absolute", left: "-20%", right: "-20%", top: 4 + i * 20 + "%", height: "30%", background: "linear-gradient(90deg,transparent," + s + "55,transparent)", filter: "blur(26px)", transform: "skewY(" + (i % 2 ? 5 : -5) + "deg)" }} />
    ))}
    <svg width="100%" height="100%" style={layer}>{Array.from({ length: 40 }, (_, i) => <circle key={i} cx={((i * 53) % 100) + "%"} cy={((i * 29) % 100) + "%"} r={0.7 + (i % 3) * 0.5} fill="#fff" opacity={0.35 + (i % 4) * 0.15} />)}</svg>
  </>;
  return (
    <div aria-hidden="true" style={{ ...layer, overflow: "hidden", opacity: on ? 1 : 0, transition: "opacity .7s" }}>
      {mat}
      <div style={{ ...layer, background: "radial-gradient(120% 70% at 50% 40%, transparent 0%, rgba(8,5,3,.45) 60%, rgba(8,5,3,.82) 100%)" }} />
      {/* 원근 체스판 바닥 — 화면 아래쪽에서 멀어지며 사라진다 */}
      <div style={{ position: "absolute", left: "-40%", right: "-40%", bottom: "-6%", height: "62%", transform: "perspective(520px) rotateX(62deg)", transformOrigin: "50% 100%",
        backgroundImage: "repeating-conic-gradient(" + alpha(th.hi, 0.16) + " 0 25%, rgba(0,0,0,.18) 0 50%)", backgroundSize: "86px 86px", backgroundPosition: "center bottom",
        WebkitMaskImage: "linear-gradient(0deg, #000 0%, rgba(0,0,0,.6) 45%, transparent 100%)", maskImage: "linear-gradient(0deg, #000 0%, rgba(0,0,0,.6) 45%, transparent 100%)" }} />
      {/* 그 티어 기물의 큰 실루엣 */}
      <img src={pieceImg(TIER_PIECE[tierKey])} alt="" draggable={false} style={{ position: "absolute", right: "-6%", bottom: "8%", height: "56%", maxHeight: 520, objectFit: "contain", filter: "brightness(0) invert(1)", opacity: 0.05 }} />
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
      `}</style>
      {TIERS.map((tier) => <TierBackdrop key={tier.key} tierKey={tier.key} on={tier.key === viewTier} />)}
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
