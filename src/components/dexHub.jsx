// (v0.6.8) 도감 첫 화면 — 테마(오프닝·마스터·업적·스킨)를 고르는 카드 목록. 설정 탭 카드와 같은 양피지색 카드 + 어두운 아이콘 칩 + 황동 포인트로 사이트 전체와 같은 결로 맞췄다.
//  카드: 왼쪽 아이콘 칩, 가운데 이름과 수치(해금률·획득 수), 오른쪽 ›, 아래 달성률 게이지. 모바일은 한 줄에 하나, 넓은 화면은 두 줄 격자.
import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "./engineLines.jsx";
import { t, tx } from "../lib/i18n.js";

function HubCard({ item, onOpen }) {
  const [hot, setHot] = useState(false);
  const { Icon, label, percent, detail } = item;
  return (
    <button onClick={() => onOpen(item.key)} onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)} onFocus={() => setHot(true)} onBlur={() => setHot(false)} className="press" aria-label={label}
      style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", textAlign: "left", padding: "14px 14px 13px", borderRadius: 14, cursor: "pointer", background: T.paper, border: "1px solid " + (hot ? T.brass : "#DCCBA8"), boxShadow: hot ? "0 1px 0 rgba(255,255,255,.5) inset, 0 8px 20px rgba(20,10,4,.3)" : "0 1px 0 rgba(255,255,255,.5) inset, 0 4px 14px rgba(20,10,4,.12)", transition: "border-color .15s ease, box-shadow .15s ease, transform .15s ease", transform: hot ? "translateY(-2px)" : "none" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span aria-hidden="true" style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg,#3A2516,#241509)", border: "1px solid #5A4630", boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)", color: T.brassHi }}>
          <Icon size={22} strokeWidth={1.9} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: SITE_FONT, fontSize: 16, fontWeight: 800, color: T.ink, lineHeight: 1.25 }}>{label}</span>
          <span style={{ display: "block", minHeight: 16, marginTop: 2, fontFamily: SITE_FONT, fontSize: 12, fontWeight: 700, color: T.inkSoft, fontVariantNumeric: "tabular-nums" }}>{detail || ""}</span>
        </span>
        <ChevronRight size={18} style={{ color: hot ? T.brass : "#B8A98A", flexShrink: 0, transition: "color .15s ease" }} />
      </span>
      {/* 달성률 게이지(수치가 없는 테마는 자리만 유지) */}
      <span aria-hidden="true" style={{ display: "block", height: 6, borderRadius: 3, background: "rgba(0,0,0,.1)", border: "1px solid #DCCBA8", overflow: "hidden", opacity: percent == null ? 0 : 1 }}>
        <span style={{ display: "block", width: Math.max(0, Math.min(100, percent || 0)) + "%", height: "100%", borderRadius: 3, background: "linear-gradient(90deg,#A87715,#F3D57A 55%," + T.brass + ")", transition: "width .5s ease" }} />
      </span>
    </button>
  );
}

/** items: [{ key, label, Icon, percent(0~100|null), detail }] */
export function DexHub({ items, achievedCount, onOpen }) {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, margin: "4px 2px 14px" }}>
        <span style={{ fontFamily: SITE_FONT, fontSize: 20, fontWeight: 900, color: T.ivoryHi }}>{t("컬렉션")}</span>
        <span style={{ fontFamily: SITE_FONT, fontSize: 12.5, fontWeight: 800, color: T.brassHi }}>{tx("업적 {0}개 달성", achievedCount)}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12 }}>
        {items.map((it) => <HubCard key={it.key} item={it} onOpen={onOpen} />)}
      </div>
    </div>
  );
}
