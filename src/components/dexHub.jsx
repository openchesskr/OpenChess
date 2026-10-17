// (v0.6.8) 도감 첫 화면 — 테마(오프닝·마스터·업적·스킨)를 방패 모양 카드로 나열하고, 카드를 누르면 그 테마로 들어간다.
//  원신 "업적" 메뉴처럼: 위에 제목·달성 수, 아래에 테마 카드 격자(엠블럼 + 이름 + 달성률 게이지). 들어간 뒤에는 상단 알약 버튼으로 테마를 바꾸고 ‹ 버튼으로 이 화면에 돌아온다.
import React, { useState } from "react";
import { Trophy } from "lucide-react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "./engineLines.jsx";
import { t, tx } from "../lib/i18n.js";

const CUT = 14;
const shield = `polygon(0 ${CUT}px, ${CUT}px 0, calc(100% - ${CUT}px) 0, 100% ${CUT}px, 100% calc(100% - ${CUT}px), calc(100% - ${CUT}px) 100%, ${CUT}px 100%, 0 calc(100% - ${CUT}px))`;
const shieldIn = `polygon(0 ${CUT - 1}px, ${CUT - 1}px 0, calc(100% - ${CUT - 1}px) 0, 100% ${CUT - 1}px, 100% calc(100% - ${CUT - 1}px), calc(100% - ${CUT - 1}px) 100%, ${CUT - 1}px 100%, 0 calc(100% - ${CUT - 1}px))`;

function HubCard({ item, onOpen }) {
  const [hot, setHot] = useState(false);
  const { Icon, accent, label, percent, detail } = item;
  const go = () => { setHot(true); setTimeout(() => { setHot(false); onOpen(item.key); }, 180); };
  return (
    <button onClick={go} onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)} onFocus={() => setHot(true)} onBlur={() => setHot(false)} className="press" aria-label={label}
      style={{ position: "relative", display: "block", width: "100%", aspectRatio: "3 / 4", padding: 0, border: "none", cursor: "pointer", clipPath: shield, background: hot ? "linear-gradient(160deg,#FFF3C9,#E8BE55 50%,#C49A50)" : "linear-gradient(160deg,#C49A50,#6E5424 60%,#A8842F)", transition: "background .2s ease, transform .15s ease", transform: hot ? "translateY(-3px)" : "none" }}>
      <span style={{ position: "absolute", inset: hot ? 3 : 2, clipPath: shieldIn, display: "flex", flexDirection: "column", alignItems: "center", background: `radial-gradient(90% 60% at 50% 34%, ${accent}, #1B0F08 78%)`, transition: "inset .15s ease" }}>
        {/* 위쪽 장식 마름모 */}
        <span aria-hidden="true" style={{ position: "absolute", top: 7, left: "50%", marginLeft: -4, width: 8, height: 8, transform: "rotate(45deg)", background: "linear-gradient(135deg,#F3DFAE,#C49A50)" }} />
        {/* 엠블럼: 금테 마름모 안에 큰 아이콘 */}
        <span style={{ position: "relative", marginTop: "17%", width: "58%", aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span aria-hidden="true" style={{ position: "absolute", inset: "6%", transform: "rotate(45deg)", border: "2.5px solid #E3C477", borderRadius: 8, background: "rgba(0,0,0,.28)", boxShadow: hot ? "0 0 22px 2px rgba(255,225,140,.55)" : "0 0 10px rgba(255,225,140,.18)", transition: "box-shadow .2s ease" }} />
          <span aria-hidden="true" style={{ position: "absolute", inset: "22%", transform: "rotate(45deg)", border: "1px solid rgba(243,223,174,.45)" }} />
          <Icon size="46%" strokeWidth={1.8} style={{ position: "relative", color: "#F6E3A6", width: "46%", height: "46%", filter: "drop-shadow(0 2px 4px rgba(0,0,0,.6))" }} />
        </span>
        <span style={{ marginTop: "auto", width: "100%", boxSizing: "border-box", padding: "0 10px 14px", textAlign: "center" }}>
          <span style={{ display: "block", fontFamily: SITE_FONT, fontSize: 15, fontWeight: 800, color: "#FAF2E2", letterSpacing: ".01em", textShadow: "0 1px 3px rgba(0,0,0,.7)" }}>{label}</span>
          <span style={{ display: "block", minHeight: 14, marginTop: 3, fontFamily: SITE_FONT, fontSize: 11, fontWeight: 700, color: "#E3CFA0", fontVariantNumeric: "tabular-nums" }}>{detail || ""}</span>
          {/* 달성률 게이지(없는 테마는 자리만 유지) */}
          <span aria-hidden="true" style={{ display: "block", margin: "6px auto 0", width: "70%", height: 5, borderRadius: 3, background: "rgba(255,255,255,.12)", boxShadow: "inset 0 0 0 1px rgba(196,154,80,.45)", overflow: "hidden", opacity: percent == null ? 0 : 1 }}>
            <span style={{ display: "block", width: Math.max(0, Math.min(100, percent || 0)) + "%", height: "100%", borderRadius: 3, background: "linear-gradient(90deg,#A8842F,#F3DFAE)", transition: "width .5s ease" }} />
          </span>
        </span>
      </span>
    </button>
  );
}

/** items: [{ key, label, Icon, accent, percent(0~100|null), detail }] */
export function DexHub({ items, achievedCount, onOpen }) {
  return (
    <div style={{ maxWidth: 940, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "4px 2px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden="true" style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(45deg)", border: "2px solid #E3C477", borderRadius: 7, background: "rgba(0,0,0,.3)" }}><Trophy size={16} style={{ transform: "rotate(-45deg)", color: "#F6E3A6" }} /></span>
          <span style={{ fontFamily: SITE_FONT, fontSize: 20, fontWeight: 900, color: T.ivoryHi, marginLeft: 4 }}>{t("컬렉션")}</span>
        </div>
        <span style={{ fontFamily: SITE_FONT, fontSize: 12.5, fontWeight: 800, color: T.brassHi }}>{tx("업적 {0}개 달성", achievedCount)}</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 14 }}>
        {items.map((it) => <HubCard key={it.key} item={it} onOpen={onOpen} />)}
      </div>
    </div>
  );
}
