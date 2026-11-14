// 도감 탭 위쪽의 구획 전환 줄(오프닝·마스터·업적·스킨).
// (v0.7.7, 사용자 요청) 도감 첫 화면(같은 크기의 진열장 카드 네 장)을 없앴다 — 도감 탭은 처음부터 오프닝 도감을 열고, 이후에는 마지막에 보던 구역으로 연다(src/lib/dexRoutes.js).
//  items: [{ key, label, Icon, percent(0~100|null), detail }]
import React from "react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "./engineLines.jsx";
import { t } from "../lib/i18n.js";

/* (v0.7.6, 사용자 요청) 도감 안쪽 화면(오프닝·마스터·업적·스킨) 위의 구획 전환 줄 — 다른 구획으로 바로 간다.
   지금 구획은 황동으로 채우고, 각 칸에 아이콘·이름·진행(카드의 detail)을 작게 보여 준다. 좁은 화면에서는 가로로 밀어 본다. */
export function DexSectionNav({ items, current, onOpen }) {
  return (
    <nav aria-label={t("도감 구획")} className="dexnav" ref={(el) => { if (el) { const a = el.querySelector("[aria-current=page]"); if (a && a.scrollIntoView) try { a.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch { } } }} style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", margin: "0 0 12px", padding: 3, borderRadius: 13, background: "rgba(0,0,0,.25)", border: "1px solid #3E2F21" }}>
      <style>{`@media (max-width: 640px) { .dexnav .dexnav-detail { display: none; } .dexnav button { padding: 0 8px !important; gap: 5px !important; } }`}</style>
      {items.map((it) => {
        const on = it.key === current, Icon = it.Icon;
        return (
          <button key={it.key} type="button" onClick={() => !on && onOpen(it.key)} aria-current={on ? "page" : undefined} className="press"
            style={{ flex: "1 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: 38, padding: "0 13px", borderRadius: 10, border: "none", cursor: on ? "default" : "pointer", fontFamily: SITE_FONT, whiteSpace: "nowrap",
              background: on ? "linear-gradient(180deg," + T.brassHi + "," + T.brass + ")" : "transparent", color: on ? "#241509" : T.ivory, boxShadow: on ? "0 2px 0 #7A5A20" : "none" }}>
            <Icon size={17} />
            <span style={{ fontSize: 13, fontWeight: 900 }}>{it.label}</span>
            {it.detail && <span className="dexnav-detail" style={{ fontSize: 11, fontWeight: 800, opacity: on ? 0.75 : 0.6, fontVariantNumeric: "tabular-nums" }}>{it.detail}</span>}
          </button>
        );
      })}
    </nav>
  );
}
