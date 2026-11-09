// (v0.7.4, 사용자 요청) 티어 여정 개편 — 지그재그 길 위에 사진 배경을 깐 예전 지도 대신, "티어 = 한 장(챕터)"인 세로 연대기로 다시 만들었다.
//  · 챕터마다 고유한 배경을 코드로 직접 그렸다(사진 아님): 아이언=리벳 박은 강판, 브론즈=두드린 구리, 실버=결 고운 금속, 골드=햇살·격자,
//    다이아몬드=깎인 결정면, 마스터=성운·궤도, 그랜드마스터=오로라 띠와 별. 색은 TIER_COLORS를 따른다.
//  · 한 챕터: 티어 기물 · 이름 · 필요 XP · 상태(달성/진행 중/잠김) + 구간 사다리(V→I, 구간별 필요 XP·진행 게이지). 지금 내 구간은 반짝이는 표지와 남은 XP.
//  · 위에 붙는 현황 막대(지금 티어·구간·다음 구간까지 게이지, "내 위치" 버튼, 닫기). 폭이 넓으면 챕터가 기물 | 사다리 두 칸, 좁으면 세로로 쌓인다.
//  · 달성한 챕터는 왼쪽 레일의 마디가 금빛으로 이어지고, 열리자마자 내 챕터로 스크롤한다.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Crosshair, X, Lock, Check } from "lucide-react";
import { T, tierPieceSrc } from "../lib/theme.js";
import { t, tx } from "../lib/i18n.js";
import { TIERS, TIER_COLORS, TIER_XP_REQ, GM_STAR_XP, DIVISIONS_PER_TIER, DIVISION_ROMAN, tierFromXp, tierGlowHex, tierGradientCss } from "../lib/tierSystem.js";
import { isLite } from "../lib/perfMode.js";
import { SITE_FONT } from "./engineLines.jsx";

const fmt = (n) => Math.round(n).toLocaleString();
const accentOf = (key) => (key === "grandmaster" ? TIER_COLORS.grandmaster.stops[0] : TIER_COLORS[key].hi);
const baseOf = (key) => (key === "grandmaster" ? "#0B0818" : TIER_COLORS[key].lo);

/* 티어별 고유 배경(코드로 그림). 챕터 박스를 가득 채우고 뒤에 깔린다. */
function ChapterArt({ tierKey }) {
  const lite = isLite(), acc = accentOf(tierKey), lo = baseOf(tierKey);
  const wrap = { position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" };
  const dark = <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(10,6,3,.55),rgba(10,6,3,.78))" }} />;
  if (tierKey === "iron") return (
    <div aria-hidden="true" style={wrap}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg," + lo + " 0%,#23272C 70%,#15181B 100%)" }} />
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.45 }}><defs><pattern id="ir-plates" width="120" height="90" patternUnits="userSpaceOnUse"><rect x="2" y="2" width="116" height="86" fill="none" stroke="#9AA1AA" strokeWidth="1.2" /><circle cx="12" cy="12" r="3" fill="#9AA1AA" /><circle cx="108" cy="12" r="3" fill="#9AA1AA" /><circle cx="12" cy="78" r="3" fill="#9AA1AA" /><circle cx="108" cy="78" r="3" fill="#9AA1AA" /><path d="M2 45 H118" stroke="#9AA1AA" strokeWidth=".6" opacity=".6" /></pattern></defs><rect width="100%" height="100%" fill="url(#ir-plates)" /></svg>
      {dark}
    </div>);
  if (tierKey === "bronze") return (
    <div aria-hidden="true" style={wrap}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 90% at 20% 0%, #8A4A24 0%, " + lo + " 45%, #2B1409 100%)" }} />
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.4 }}><defs><pattern id="br-hammer" width="46" height="46" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="9" fill="none" stroke={acc} strokeWidth="1" opacity=".7" /><circle cx="35" cy="30" r="12" fill="none" stroke={acc} strokeWidth="1" opacity=".5" /><circle cx="20" cy="38" r="5" fill={acc} opacity=".25" /></pattern></defs><rect width="100%" height="100%" fill="url(#br-hammer)" /></svg>
      {dark}
    </div>);
  if (tierKey === "silver") return (
    <div aria-hidden="true" style={wrap}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(100deg,#3A4046 0%,#6B737B 22%,#2D3237 40%,#7B848C 62%,#2B3035 82%,#555D65 100%)" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,.07) 0 1px, transparent 1px 4px)" }} />
      {!lite && <motion.div animate={{ x: ["-30%", "130%"] }} transition={{ duration: 9, repeat: Infinity, ease: "linear" }} style={{ position: "absolute", top: 0, bottom: 0, width: "30%", background: "linear-gradient(100deg,transparent,rgba(255,255,255,.18),transparent)", transform: "skewX(-18deg)" }} />}
      {dark}
    </div>);
  if (tierKey === "gold") return (
    <div aria-hidden="true" style={wrap}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(90% 80% at 50% 0%, #B8862F 0%, " + lo + " 50%, #2A1B07 100%)" }} />
      <motion.div animate={lite ? undefined : { rotate: 360 }} transition={{ duration: 120, repeat: Infinity, ease: "linear" }} style={{ position: "absolute", left: "50%", top: -240, width: 720, height: 720, marginLeft: -360, background: "repeating-conic-gradient(from 0deg, rgba(253,219,130,.16) 0deg 6deg, transparent 6deg 18deg)", WebkitMaskImage: "radial-gradient(circle, #000 20%, transparent 70%)", maskImage: "radial-gradient(circle, #000 20%, transparent 70%)" }} />
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.3 }}><defs><pattern id="gd-lat" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M20 0 L40 20 L20 40 L0 20 Z" fill="none" stroke={acc} strokeWidth="1" /></pattern></defs><rect width="100%" height="100%" fill="url(#gd-lat)" /></svg>
      {dark}
    </div>);
  if (tierKey === "diamond") return (
    <div aria-hidden="true" style={wrap}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#04364A 0%," + lo + "55 40%,#021A26 100%)" }} />
      <svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, opacity: 0.55 }}>
        {[[0, 300, 120, 80, 200, 300], [120, 80, 200, 300, 280, 60], [200, 300, 280, 60, 400, 260], [0, 0, 120, 80, 0, 300], [280, 60, 400, 0, 400, 260], [120, 80, 280, 60, 200, 0]].map((p, i) => <polygon key={i} points={p.join(" ")} fill={acc} opacity={0.05 + (i % 3) * 0.05} stroke={acc} strokeWidth=".8" strokeOpacity=".55" />)}
      </svg>
      {!lite && [0, 1, 2, 3, 4, 5].map((i) => <motion.span key={i} animate={{ opacity: [0, 1, 0], scale: [0.4, 1, 0.4] }} transition={{ duration: 3 + (i % 3), repeat: Infinity, delay: i * 0.6 }} style={{ position: "absolute", left: 8 + i * 15 + "%", top: 14 + ((i * 37) % 70) + "%", width: 6, height: 6, background: "#E9FDFF", transform: "rotate(45deg)", boxShadow: "0 0 10px " + acc }} />)}
      {dark}
    </div>);
  if (tierKey === "master") return (
    <div aria-hidden="true" style={wrap}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 60% at 25% 30%, #5A2A98 0%, transparent 60%), radial-gradient(60% 60% at 80% 70%, #2D1B6E 0%, transparent 62%), #12081F" }} />
      <svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, opacity: 0.5 }}>
        {[60, 100, 140].map((r) => <ellipse key={r} cx="200" cy="150" rx={r * 1.6} ry={r * 0.55} fill="none" stroke={acc} strokeWidth=".8" opacity=".5" transform="rotate(-18 200 150)" />)}
        {Array.from({ length: 36 }, (_, i) => <circle key={i} cx={(i * 97) % 400} cy={(i * 61) % 300} r={0.6 + (i % 3) * 0.5} fill="#E6D2FF" opacity={0.3 + (i % 4) * 0.15} />)}
      </svg>
      {dark}
    </div>);
  const st = TIER_COLORS.grandmaster.stops;   // 그랜드마스터: 오로라
  return (
    <div aria-hidden="true" style={wrap}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#05040D 0%,#0B0818 100%)" }} />
      {[0, 1, 2].map((i) => (
        <motion.div key={i} animate={lite ? undefined : { x: ["-8%", "8%", "-8%"], opacity: [0.55, 0.9, 0.55] }} transition={{ duration: 11 + i * 3, repeat: Infinity, ease: "easeInOut", delay: i * 1.4 }}
          style={{ position: "absolute", left: "-20%", right: "-20%", top: 6 + i * 22 + "%", height: "34%", background: "linear-gradient(90deg,transparent," + st[i % 3] + "66,transparent)", filter: "blur(26px)", transform: "skewY(" + (i % 2 ? 5 : -5) + "deg)" }} />
      ))}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.8 }}>{Array.from({ length: 40 }, (_, i) => <circle key={i} cx={((i * 53) % 100) + "%"} cy={((i * 29) % 100) + "%"} r={0.7 + (i % 3) * 0.5} fill="#fff" opacity={0.35 + (i % 4) * 0.15} />)}</svg>
      {dark}
    </div>);
}

/* 구간 사다리 한 칸 */
function DivisionStep({ d, state, accent, info, perDiv }) {
  const done = state === "done", cur = state === "cur";
  const pct = cur ? Math.max(0, Math.min(100, (info.xpInDivision / info.xpForNextDivision) * 100)) : done ? 100 : 0;
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 12, background: cur ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.28)", border: "1px solid " + (cur ? accent : "rgba(255,255,255,.1)"), boxShadow: cur ? "0 0 18px " + accent + "55" : "none", opacity: state === "lock" ? 0.6 : 1 }}>
      <span style={{ width: 34, height: 34, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", clipPath: "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)", background: done ? "linear-gradient(160deg,#F5C542,#B88F40)" : cur ? accent : "rgba(255,255,255,.14)", color: done || cur ? "#1A1006" : "#BBA98A", fontFamily: "Georgia,serif", fontWeight: 900, fontSize: 13 }}>
        {done ? <Check size={16} strokeWidth={3} /> : state === "lock" ? <Lock size={13} /> : DIVISION_ROMAN[d]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#F6ECD6" }}>{t("구간")} {DIVISION_ROMAN[d]}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: cur ? accent : "#B9AC8C", fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums" }}>{cur ? fmt(info.xpInDivision) + " / " + fmt(info.xpForNextDivision) + " XP" : fmt(perDiv) + " XP"}</span>
        </div>
        {(cur || done) && <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,.14)", marginTop: 6, overflow: "hidden" }}><motion.div initial={{ width: 0 }} animate={{ width: pct + "%" }} transition={{ duration: 0.8, ease: [0.22, 0.9, 0.32, 1] }} style={{ height: "100%", background: done ? "#F5C542" : accent, borderRadius: 3 }} /></div>}
      </div>
      {cur && <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 900, letterSpacing: ".1em", color: "#1A1006", background: accent, borderRadius: 999, padding: "2px 8px" }}>{t("지금")}</span>}
    </div>
  );
}

function Chapter({ tier, idx, info, chapterRef, wide }) {
  const accent = accentOf(tier.key), isGM = tier.key === "grandmaster";
  const cleared = info.tierIndex > idx, current = info.tierIndex === idx, locked = info.tierIndex < idx;
  const req = isGM ? null : TIER_XP_REQ[idx], perDiv = req ? req / DIVISIONS_PER_TIER : 0;
  const status = cleared ? t("달성") : current ? t("진행 중") : t("잠김");
  return (
    <section ref={chapterRef} aria-label={tier.label} style={{ position: "relative", overflow: "hidden", borderRadius: 20, border: "1px solid " + (current ? accent : "rgba(255,255,255,.12)"), boxShadow: current ? "0 0 0 1px " + accent + "55, 0 16px 40px -14px " + accent + "88" : "0 10px 26px -14px rgba(0,0,0,.7)", marginBottom: 16, filter: locked ? "saturate(.55) brightness(.8)" : "none" }}>
      <ChapterArt tierKey={tier.key} />
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: wide ? "minmax(0,220px) minmax(0,1fr)" : "minmax(0,1fr)", gap: wide ? 20 : 12, padding: wide ? "22px 24px" : "16px 14px", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: wide ? "column" : "row", alignItems: "center", gap: wide ? 8 : 14, textAlign: wide ? "center" : "left" }}>
          <div style={{ position: "relative", width: wide ? 150 : 88, height: wide ? 150 : 88, flexShrink: 0 }}>
            <span aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle," + accent + "55 0%,transparent 68%)" }} />
            <img src={tierPieceSrc(tier.key, isGM ? null : current ? info.division : 1)} alt="" style={{ position: "relative", width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 6px 10px rgba(0,0,0,.6))" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Bagel Fat One','Noto Sans KR',cursive", fontSize: wide ? 28 : 22, lineHeight: 1.1, background: tierGradientCss(tier.key), WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", filter: "drop-shadow(0 2px 0 rgba(0,0,0,.6))" }}>{tier.label}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: wide ? "center" : "flex-start", marginTop: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: ".1em", color: cleared || current ? "#1A1006" : "#D9CBA8", background: cleared ? "#F5C542" : current ? accent : "rgba(255,255,255,.14)", borderRadius: 999, padding: "2px 9px" }}>{status}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#D9CBA8", fontFamily: SITE_FONT }}>{isGM ? tx("{0} XP마다 ★", fmt(GM_STAR_XP)) : tx("총 {0} XP", fmt(req))}</span>
            </div>
          </div>
        </div>
        <div>
          {isGM ? (
            <div style={{ padding: "14px 14px", borderRadius: 14, background: "rgba(0,0,0,.35)", border: "1px solid " + (current ? accent : "rgba(255,255,255,.12)"), textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#F6ECD6", letterSpacing: ".05em" }}>{"★".repeat(Math.min(5, info.gmStars)) || "☆"}{info.gmStars > 5 ? " +" + (info.gmStars - 5) : ""}</div>
              <div style={{ fontSize: 12, color: "#D9CBA8", marginTop: 6, lineHeight: 1.5 }}>{current ? tx("지금 ★{0}, 다음 별까지 {1} XP", info.gmStars, fmt(info.xpForNextDivision - info.xpInDivision)) : t("마지막 티어. 도달하면 XP가 쌓일 때마다 별이 하나씩 늘어남")}</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {Array.from({ length: DIVISIONS_PER_TIER }, (_, k) => DIVISIONS_PER_TIER - k).reverse().map((d) => {
                // d: 1(최상위)~5(진입). 위에서부터 I → V가 아니라, 오르는 순서(V → I)를 아래에서 위로 읽히게 위가 I.
                const state = cleared ? "done" : locked ? "lock" : d > info.division ? "done" : d === info.division ? "cur" : "lock";
                return <DivisionStep key={d} d={d} state={state} accent={accent} info={info} perDiv={perDiv} />;
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function TierJourney({ totalXp, onClose, scrollRef }) {
  const info = useMemo(() => tierFromXp(totalXp), [totalXp]);
  const [wide, setWide] = useState(typeof window !== "undefined" && window.innerWidth >= 720);
  useEffect(() => { const on = () => setWide(window.innerWidth >= 720); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  const curRef = useRef(null);
  useEffect(() => { const id = setTimeout(() => { if (curRef.current) curRef.current.scrollIntoView({ block: "center", behavior: "auto" }); }, 50); return () => clearTimeout(id); }, []);
  const order = useMemo(() => TIERS.map((tier, idx) => ({ tier, idx })).reverse(), []);   // 높은 티어가 위
  const nextLabel = info.maxed ? null : (info.division > 1 ? t("구간") + " " + DIVISION_ROMAN[info.division - 1] : (TIERS[info.tierIndex + 1] || {}).label);
  const pct = Math.max(0, Math.min(100, (info.xpInDivision / info.xpForNextDivision) * 100));
  const acc = accentOf(info.tier.key);
  return (
    <div style={{ minHeight: "100%" }}>
      {/* 현황 막대 */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, padding: "10px 12px", background: "linear-gradient(180deg,rgba(10,6,3,.96),rgba(10,6,3,.82))", borderBottom: "1px solid rgba(196,154,80,.3)", backdropFilter: "blur(6px)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <img src={tierPieceSrc(info.tier.key, info.division)} alt="" style={{ width: 42, height: 42, objectFit: "contain", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, justifyContent: "space-between" }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: "#FFF6E0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{info.tier.label}{info.division ? " " + DIVISION_ROMAN[info.division] : info.gmStars ? " ★" + info.gmStars : ""}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#D9CBA8", fontFamily: SITE_FONT, whiteSpace: "nowrap" }}>{fmt(totalXp)} XP</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.16)", marginTop: 5, overflow: "hidden" }}><div style={{ width: pct + "%", height: "100%", background: "linear-gradient(90deg," + acc + ",#F5C542)", transition: "width .6s" }} /></div>
            <div style={{ fontSize: 10.5, color: "#B9AC8C", marginTop: 3 }}>{info.maxed ? tx("다음 별까지 {0} XP", fmt(info.xpForNextDivision - info.xpInDivision)) : tx("{0}까지 {1} XP", nextLabel, fmt(info.xpForNextDivision - info.xpInDivision))}</div>
          </div>
          <button onClick={() => curRef.current && curRef.current.scrollIntoView({ block: "center", behavior: "smooth" })} aria-label={t("내 위치")} title={t("내 위치")} className="press" style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(196,154,80,.45)", background: "rgba(255,255,255,.06)", color: "#ECCB86", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Crosshair size={17} /></button>
          <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid " + acc, background: "rgba(255,255,255,.08)", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={18} /></button>
        </div>
      </div>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "18px 12px 60px" }}>
        {order.map(({ tier, idx }) => <Chapter key={tier.key} tier={tier} idx={idx} info={info} wide={wide} chapterRef={info.tierIndex === idx ? curRef : undefined} />)}
      </div>
    </div>
  );
}
