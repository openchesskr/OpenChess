// 도감 첫 화면 — 오프닝·마스터·업적·스킨 네 구획으로 들어가는 같은 크기의 카드 네 장(2×2).
// (v0.7.6, 사용자 요청 — 여러 차례 다듬음) 게임 느낌:
//  · 프레임: 모서리를 비스듬히 깎은 황동 테두리(게임 선택 카드). 머리 글자·요약 알약·스테이지 꼬리표·월계관은 사용자 요청으로 뺐다.
//  · 카드 안 "문장(紋章) 무대": 구획마다 등급색(오프닝 초록 · 마스터 파랑 · 업적 보라 · 스킨 주황)의 면 분할 마름모 문장이 뒤에 서고,
//    천천히 도는 빛살과 아래 바닥 빛 위에 대표 기물이 둥실 떠 있다. 빛 알갱이(작은 마름모)가 올라간다. 문장 마름모는 facetIcons의 FacetDiamond(왼쪽 위 빛).
//  · 아래 명판: 제목(등급색 밑줄 빛) · 설명 · 10칸 경험치 막대 · 입장 버튼.
//  · 데스크톱은 2×2 카드가 화면 높이를 채운다(4열 세로 카드는 너무 길쭉해져 바꿈) — 아래 여백이 크게 남지 않게. 문장 장면은 무대 크기(container size)에 맞춰 커진다.
//  items: [{ key, label, Icon, percent(0~100|null), detail }]
import { FacetDiamond, facetRamp } from "./facetIcons.jsx";
import React from "react";
import { ChevronRight } from "./ocIcons.jsx";   // (v0.7.5) OpenChess 파셋 아이콘(예전 lucide 대체)
import { motion } from "framer-motion";
import { T, MOTION_EASE, PIECE_IMG_SETS } from "../lib/theme.js";
import { SITE_FONT } from "./engineLines.jsx";
import { t } from "../lib/i18n.js";

const img = (set, piece, color) => ((PIECE_IMG_SETS[set] || PIECE_IMG_SETS.classic).images[piece][color] || {}).src;
const DESC = () => ({ openings: t("오프닝 수순 탐색과 해금"), masters: t("체스의 정점에 달한 선수들"), titles: t("모은 칭호와 다음 목표"), skins: t("기물·보드 세트 수집") });
// 구획별 등급색과 무대 위 기물: [세트, 기물, 색, 가로 위치(%), 높이(무대 높이 대비 %), 겹침 순서, 밝기]
const THEME = {
  openings: { color: "#3FA35F", pieces: [["classic", "P", "b", 64, 34, 1, 0.8], ["classic", "P", "w", 42, 48, 2, 1]] },
  masters: { color: "#3E78D6", pieces: [["classic", "K", "b", 66, 40, 1, 0.8], ["classic", "K", "w", 41, 52, 2, 1]] },
  titles: { color: "#A35AD6", pieces: [["classic", "Q", "w", 50, 54, 2, 1]] },
  skins: { color: "#E08A2E", pieces: [["crystal", "N", "w", 27, 36, 1, 0.92], ["coral", "N", "w", 73, 36, 1, 0.92], ["classic", "N", "w", 50, 48, 2, 1]] },
};
// 깎은 모서리 크기는 px로 — clip-path의 cqw는 자기 자신이 아니라 바깥 컨테이너를 기준으로 잡혀 데스크톱에서 모서리가 지나치게 커졌다
const chamfer = (c) => "polygon(" + c + "px 0, calc(100% - " + c + "px) 0, 100% " + c + "px, 100% calc(100% - " + c + "px), calc(100% - " + c + "px) 100%, " + c + "px 100%, 0 calc(100% - " + c + "px), 0 " + c + "px)";
const CHAMFER = chamfer(16), CHAMFER_IN = chamfer(15);
const alpha = (hex, a) => { const n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; };

/* 문장 — 등급색 면 분할 마름모 두 겹(바깥 테두리 + 안쪽 어두운 창) + 위아래 작은 보석. 왼쪽 위에서 빛(FacetDiamond 규칙). */
function Crest({ color }) {
  const R = facetRamp(color), D = facetRamp("#2A1A0F");
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="dexv-crest" style={{ position: "absolute", left: "50%", top: "46%", width: "78%", height: "78%", transform: "translate(-50%,-50%)", overflow: "visible" }}>
      <FacetDiamond cx={50} cy={50} r={46} R={R} gem={false} />
      <FacetDiamond cx={50} cy={50} r={37} R={D} gem={false} />
      <FacetDiamond cx={50} cy={4} r={5} R={R} />
      <FacetDiamond cx={50} cy={96} r={5} R={R} />
    </svg>
  );
}

function GameCard({ item, onOpen, index, desc }) {
  const { label, percent, detail } = item;
  const pct = percent == null ? null : Math.max(0, Math.min(100, percent));
  const th = THEME[item.key] || THEME.openings;
  return (
    <motion.button initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 * index, ease: MOTION_EASE }}
      onClick={() => onOpen(item.key)} className="press dexv" aria-label={label + ", " + desc + (detail ? ", " + detail : "")}
      style={{ position: "relative", display: "flex", width: "100%", minWidth: 0, padding: 2, border: "none", cursor: "pointer", textAlign: "left", fontFamily: SITE_FONT, containerType: "inline-size", clipPath: CHAMFER, background: "linear-gradient(160deg," + T.brassHi + " 0%, #7A5A20 38%, #3A2516 62%, " + T.brass + " 100%)" }}>
      <span className="dexv-inner" style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", clipPath: CHAMFER_IN, overflow: "hidden" }}>
        {/* 문장 무대 */}
        <span aria-hidden="true" className="dexv-stage" style={{ position: "relative", display: "block", flex: "0 0 auto", height: "92cqw", overflow: "hidden", containerType: "size",
          background: "radial-gradient(85% 70% at 50% 40%, " + alpha(th.color, 0.32) + " 0%, " + alpha(th.color, 0.08) + " 45%, rgba(0,0,0,0) 72%), linear-gradient(180deg, #24160C, #120A05)" }}>
          <span className="dexv-rays" style={{ position: "absolute", left: "50%", top: "48%", width: "max(170cqw, 170cqh)", height: "max(170cqw, 170cqh)", transform: "translate(-50%,-50%)",
            background: "repeating-conic-gradient(from 0deg, " + alpha(th.color, 0.16) + " 0 8deg, transparent 8deg 22deg)", maskImage: "radial-gradient(circle, #000 18%, transparent 62%)", WebkitMaskImage: "radial-gradient(circle, #000 18%, transparent 62%)" }} />
          {/* 장면 상자 — 모바일은 무대 높이를 92cqw로 못박는다(size 컨테이너가 min-height만 가지면 cqh가 0으로 잡혀 장면이 사라졌다). 장면은 무대 세로 가운데에 둔다. 데스크톱처럼 무대가 길어져도 문장·기물 크기와 위치가 그대로이고, 남는 높이는 빛살·빛으로 채워진다 */}
          <span style={{ position: "absolute", left: "50%", top: "50%", width: "min(100cqw, 108cqh)", aspectRatio: "1 / 0.92", transform: "translate(-50%,-50%)" }}>
            <Crest color={th.color} />
            {/* 바닥 빛 */}
            <span style={{ position: "absolute", left: "50%", bottom: "11%", width: "76%", height: "13%", transform: "translateX(-50%)", borderRadius: "50%", background: "radial-gradient(closest-side, " + alpha(th.color, 0.55) + ", transparent)" }} />
            <span className="dexv-pieces" style={{ position: "absolute", inset: 0, animationDelay: (index * 0.35) + "s" }}>
              {th.pieces.map(([set, pc, color, x, h, z, b], k) => (
                <img key={k} src={img(set, pc, color)} alt="" draggable={false} loading="lazy"
                  style={{ position: "absolute", left: x + "%", bottom: "15%", height: h + "%", transform: "translateX(-50%)", zIndex: z, filter: "brightness(" + b + ") drop-shadow(0 6px 8px rgba(0,0,0,.6))", objectFit: "contain" }} />
              ))}
            </span>
            {[18, 46, 74, 62, 30].map((x, k) => <span key={k} className="dexv-spark" style={{ position: "absolute", left: x + "%", bottom: "20%", width: "2%", aspectRatio: "1", background: k % 2 ? th.color : "#FFF1C4", clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)", animationDelay: (k * 0.7 + index * 0.3) + "s" }} />)}
          </span>
          <span className="dexv-glint" />
        </span>
        {/* 명판 */}
        <span className="dexv-plate" style={{ display: "block", flex: "0 0 auto", padding: "clamp(10px, 3.6cqw, 16px) clamp(12px, 5cqw, 22px) clamp(12px, 4.6cqw, 18px)", borderTop: "1px solid " + alpha(th.color, 0.55), boxShadow: "inset 0 1px 0 " + alpha(th.color, 0.25) }}>
          <span style={{ display: "block", fontWeight: 900, fontSize: "clamp(17px, 9cqw, 30px)", lineHeight: 1.05, color: "#FFF4D6", letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 0 12px " + alpha(th.color, 0.65) + ", 0 2px 0 rgba(0,0,0,.6)" }}>{label}</span>
          <span className="dexv-desc" style={{ display: "block", marginTop: 4, fontSize: "clamp(11px, 4.6cqw, 14px)", fontWeight: 600, color: "#CDBA98", lineHeight: 1.35, minHeight: "2.7em" }}>{desc}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <span aria-hidden="true" style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 3, height: 7 }}>
              {Array.from({ length: 10 }, (_, k) => { const on = pct != null && pct >= (k + 1) * 10 - 5; return <span key={k} style={{ clipPath: "polygon(18% 0, 100% 0, 82% 100%, 0 100%)", background: on ? "linear-gradient(180deg,#FFE7A6," + T.brass + ")" : "rgba(236,203,134,.14)", boxShadow: on ? "0 0 6px rgba(236,203,134,.6)" : "none" }} />; })}
            </span>
            <span style={{ fontSize: "clamp(11px, 4.4cqw, 14px)", fontWeight: 900, color: T.brassHi, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{detail || ""}</span>
          </span>
          <span className="dexv-cta" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, height: "clamp(32px, 11cqw, 42px)", clipPath: "polygon(4% 0, 96% 0, 100% 50%, 96% 100%, 4% 100%, 0 50%)", background: "linear-gradient(180deg,#F6D98A 0%," + T.brass + " 55%,#7A5A20 100%)", color: "#241509", fontSize: "clamp(12px, 4.8cqw, 15px)", fontWeight: 900, letterSpacing: ".12em" }}>
            {t("입장")}<ChevronRight className="dexv-chev" size={15} color="#241509" aria-hidden="true" />
          </span>
        </span>
      </span>
    </motion.button>
  );
}

/** items: [{ key, label, Icon, percent(0~100|null), detail }] */
export function DexHub({ items, onOpen }) {
  const desc = DESC();
  return (
    <div className="dexhub" style={{ maxWidth: 1180, margin: "0 auto", paddingTop: 8 }}>
      <style>{`
        .dexv { filter: drop-shadow(0 14px 18px rgba(0,0,0,.7)); transition: transform .3s cubic-bezier(.2,.8,.2,1), filter .3s; }
        .dexv .dexv-inner { background: #120A05; }
        .dexv:hover { transform: translateY(-6px) scale(1.02); filter: drop-shadow(0 18px 22px rgba(0,0,0,.8)) drop-shadow(0 0 14px rgba(236,203,134,.45)); }
        .dexv:focus-visible { outline: 2px solid ${T.brassHi}; outline-offset: 3px; }
        .dexv .dexv-pieces { animation: dexvBob 3.4s ease-in-out infinite alternate; }
        @keyframes dexvBob { from { transform: translateY(0); } to { transform: translateY(-2.2%); } }
        .dexv .dexv-rays { animation: dexvSpin 40s linear infinite; }
        @keyframes dexvSpin { from { transform: translate(-50%,-50%) rotate(0deg); } to { transform: translate(-50%,-50%) rotate(360deg); } }
        .dexv .dexv-crest { transition: transform .45s cubic-bezier(.2,.8,.2,1); }
        .dexv:hover .dexv-crest { transform: translate(-50%,-50%) scale(1.06) rotate(4deg); }
        .dexv .dexv-spark { opacity: 0; animation: dexvSpark 3.6s ease-out infinite; }
        @keyframes dexvSpark { 0% { opacity: 0; transform: translateY(0) scale(.6); } 25% { opacity: .9; } 100% { opacity: 0; transform: translateY(-34cqh) scale(1); } }
        .dexv .dexv-plate { background: linear-gradient(180deg, rgba(58,36,20,.96), rgba(26,15,8,.98)); }
        .dexv .dexv-cta { transition: filter .25s; }
        .dexv:hover .dexv-cta { filter: brightness(1.12); }
        .dexv .dexv-chev { transition: transform .25s; }
        .dexv:hover .dexv-chev { transform: translateX(3px); }
        .dexv .dexv-glint { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(105deg, transparent 40%, rgba(255,240,200,.16) 50%, transparent 60%); transform: translateX(-120%); }
        .dexv:hover .dexv-glint { animation: dexvGlint 1.1s ease-out 1; }
        @keyframes dexvGlint { to { transform: translateX(120%); } }
        .dexhub-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        @media (min-width: 900px) {
          .dexhub-grid { grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 18px; height: clamp(560px, calc(100dvh - 205px), 980px); }
          .dexhub-grid .dexv-stage { flex: 1 1 auto !important; height: auto !important; min-height: 0; }
          .dexhub-grid .dexv-desc { min-height: 0 !important; }
          .dexhub-grid .dexv { height: 100%; }
        }
      `}</style>
      <div className="dexhub-grid">
        {items.map((it, i) => <GameCard key={it.key} item={it} onOpen={onOpen} index={i} desc={desc[it.key] || ""} />)}
      </div>
    </div>
  );
}

/* (v0.7.6, 사용자 요청) 도감 안쪽 화면(오프닝·마스터·업적·스킨) 위의 구획 전환 줄 — 첫 화면으로 돌아가지 않고 바로 다른 구획으로 간다.
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
