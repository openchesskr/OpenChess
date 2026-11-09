// (v0.7.4, 사용자 요청) 도감 첫 화면 개편 — 네 개의 테마 카드(오프닝·마스터·업적·스킨)를 테마마다 고유한 색과 기하학 무늬를 가진 "포스터" 카드로 다시 디자인했다.
//  · 카드 하나 = 테마 색 어두운 바탕 + 큰 반투명 무늬(그 테마의 상징) + 큰 아이콘 메달 + 이름·수치 + 평행사변형 칸으로 나뉜 달성 게이지 + "열기" 단서.
//  · 데스크톱은 2×2 격자(카드가 위아래로 충분히 큼), 모바일은 한 줄에 하나(가로 배치로 작게). 눌렀을 때·올렸을 때 빛이 쓸고 지나가고 살짝 떠오른다.
//  · items: [{ key, label, Icon, accent, percent(0~100|null), detail }] — 색·무늬는 key로 정한다(아는 key가 아니면 황동 기본).
import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "./engineLines.jsx";
import { t } from "../lib/i18n.js";

const THEMES = {
  openings: { a: "#E3B365", b: "#2E1D0C", c: "#4A3018", pat: "board" },
  masters: { a: "#8FB4F0", b: "#0F1B34", c: "#1E3566", pat: "crown" },
  titles: { a: "#D9A6F0", b: "#241030", c: "#43205A", pat: "laurel" },
  skins: { a: "#7FD9C0", b: "#0B2822", c: "#12493E", pat: "facets" },
};
const FALLBACK = { a: T.brassHi, b: "#241509", c: "#3A2516", pat: "board" };
const parPath = (n) => "polygon(" + n + "px 0, 100% 0, calc(100% - " + n + "px) 100%, 0 100%)";

/* 테마 무늬 — 카드 오른쪽 아래에 크게 깔리는 반투명 기하학 */
function Pattern({ kind, color }) {
  const common = { fill: "none", stroke: color, strokeWidth: 1.4, vectorEffect: "non-scaling-stroke" };
  if (kind === "board") {
    return (<g>{Array.from({ length: 36 }, (_, i) => { const r = Math.floor(i / 6), c = i % 6; return (r + c) % 2 === 0 ? <rect key={i} x={c * 20} y={r * 20} width="20" height="20" fill={color} opacity=".35" /> : null; })}<rect x="0" y="0" width="120" height="120" {...common} /></g>);
  }
  if (kind === "crown") {
    return (<g {...common}><path d="M10 92 L18 38 L42 66 L60 22 L78 66 L102 38 L110 92 Z" /><path d="M10 104 H110" /><path d="M30 92 L60 52 L90 92" opacity=".6" /><circle cx="60" cy="22" r="5" fill={color} /></g>);
  }
  if (kind === "laurel") {
    return (<g {...common}><path d="M60 110 C30 96 18 66 24 24" /><path d="M60 110 C90 96 102 66 96 24" />{[[26, 36], [30, 54], [38, 72], [50, 90], [94, 36], [90, 54], [82, 72], [70, 90]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="9" ry="4.2" fill={color} opacity=".55" stroke="none" transform={"rotate(" + (i < 4 ? -50 + i * 8 : 50 - (i - 4) * 8) + " " + x + " " + y + ")"} />)}<path d="M60 14 L68 30 L52 30 Z" fill={color} opacity=".7" stroke="none" /></g>);
  }
  return (<g {...common}><path d="M60 8 L108 40 L108 80 L60 112 L12 80 L12 40 Z" /><path d="M60 8 L60 112 M12 40 L108 80 M108 40 L12 80" opacity=".55" /><path d="M60 36 L84 52 L84 68 L60 84 L36 68 L36 52 Z" fill={color} opacity=".25" /></g>);
}

function HubCard({ item, onOpen, index }) {
  const [hot, setHot] = useState(false);
  const { Icon, label, percent, detail } = item;
  const th = THEMES[item.key] || FALLBACK;
  const pct = percent == null ? null : Math.max(0, Math.min(100, percent));
  const SEG = 10;
  return (
    <motion.button initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 * index, ease: [0.22, 0.9, 0.32, 1] }}
      onClick={() => onOpen(item.key)} onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)} onFocus={() => setHot(true)} onBlur={() => setHot(false)} className="press dexhub-card" aria-label={label}
      style={{ position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14, width: "100%", minHeight: 158, textAlign: "left", padding: "16px 16px 14px", borderRadius: 18, cursor: "pointer", color: "#F6ECD6",
        background: "linear-gradient(150deg," + th.c + " 0%," + th.b + " 70%)", border: "1px solid " + (hot ? th.a : th.a + "55"), boxShadow: hot ? "0 14px 30px -12px " + th.a + "66, 0 0 0 1px " + th.a + "33 inset" : "0 8px 20px -12px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.04) inset", transform: hot ? "translateY(-3px)" : "none", transition: "transform .2s ease, box-shadow .25s ease, border-color .2s ease" }}>
      <svg aria-hidden="true" viewBox="0 0 120 120" style={{ position: "absolute", right: -14, bottom: -18, width: 168, height: 168, opacity: hot ? 0.34 : 0.2, transition: "opacity .25s, transform .4s", transform: hot ? "rotate(-4deg) scale(1.05)" : "none", pointerEvents: "none" }}><Pattern kind={th.pat} color={th.a} /></svg>
      <span aria-hidden="true" style={{ position: "absolute", top: 0, left: "-40%", width: "40%", height: "100%", background: "linear-gradient(100deg,transparent,rgba(255,255,255,.16),transparent)", transform: "skewX(-18deg)", transition: "left .6s ease", ...(hot ? { left: "130%" } : null), pointerEvents: "none" }} />
      <span style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span aria-hidden="true" style={{ width: 52, height: 52, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", clipPath: "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)", background: "linear-gradient(160deg," + th.a + "," + th.a + "99)", color: th.b }}>
          <Icon size={24} strokeWidth={2} />
        </span>
        <span style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <span style={{ display: "block", fontFamily: SITE_FONT, fontSize: 19, fontWeight: 900, letterSpacing: "-.01em", lineHeight: 1.2, color: "#FFF6E0", textShadow: "0 1px 0 rgba(0,0,0,.5)" }}>{label}</span>
          <span style={{ display: "block", minHeight: 18, marginTop: 4, fontFamily: SITE_FONT, fontSize: 12.5, fontWeight: 800, color: th.a, fontVariantNumeric: "tabular-nums" }}>{detail || ""}</span>
        </span>
      </span>
      <span style={{ position: "relative", display: "block" }}>
        {/* 달성 게이지 — 10칸, 채워진 칸은 테마 색(수치가 없는 테마는 자리만 유지) */}
        <span aria-hidden="true" style={{ display: "flex", gap: 3, opacity: pct == null ? 0 : 1 }}>
          {Array.from({ length: SEG }, (_, i) => { const f = Math.max(0, Math.min(1, ((pct || 0) / 100) * SEG - i)); return (
            <span key={i} style={{ flex: 1, height: 7, clipPath: parPath(3), background: "rgba(255,255,255,.12)", overflow: "hidden" }}><span style={{ display: "block", width: f * 100 + "%", height: "100%", background: "linear-gradient(90deg," + th.a + "," + th.a + "CC)", transition: "width .6s ease" }} /></span>
          ); })}
        </span>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, fontFamily: SITE_FONT, fontSize: 11.5, fontWeight: 800, color: "#D9CBA8" }}>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{pct == null ? "" : Math.round(pct) + "%"}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: hot ? th.a : "#D9CBA8", transition: "color .2s" }}>{t("열기")}<ChevronRight size={15} style={{ transform: hot ? "translateX(3px)" : "none", transition: "transform .2s" }} /></span>
        </span>
      </span>
    </motion.button>
  );
}

/** items: [{ key, label, Icon, percent(0~100|null), detail }] */
export function DexHub({ items, onOpen }) {
  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 14 }}>
        {items.map((it, i) => <HubCard key={it.key} item={it} onOpen={onOpen} index={i} />)}
      </div>
    </div>
  );
}
