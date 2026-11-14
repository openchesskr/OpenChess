// 도감 첫 화면 — 오프닝·마스터·업적·스킨 네 구획으로 들어가는 같은 크기의 카드 네 장(2×2).
// (v0.7.6, 사용자 요청 — 여러 차례 다듬음) 5차: 게임풍(등급색 문장·빛살)을 걷어내고, 사이트 색(흑단·황동·상아)만 쓰는 "메종 진열장"으로.
//  · 카드: 흑단 그러데이션 + 황동 가는 테두리 + 안쪽 머리카락 굵기 액자, 네 모서리에 작은 금 보석(면 분할 마름모).
//  · 무대: 위에서 떨어지는 조명 원뿔 아래, 금 띠를 두른 흑단 받침대(면 분할, 왼쪽 위 빛) 위에 대표 기물이 선다.
//  · 명판: 일련번호(Bodoni) · 제목(Playfair, 금빛 글자) · 보석 박힌 금 구분선 · 설명(Cormorant 이탤릭) · 머리카락 굵기 진행선 · 입장 글자 링크.
//  · 데스크톱은 2×2 카드가 화면 높이를 채운다 — 아래 여백이 크게 남지 않게. 장면은 무대 크기(container size)에 맞춰 커진다.
//  items: [{ key, label, Icon, percent(0~100|null), detail }]
import React from "react";
import { FacetDiamond, facetRamp, GOLD } from "./facetIcons.jsx";
import { ChevronRight } from "./ocIcons.jsx";
import { motion } from "framer-motion";
import { T, MOTION_EASE, PIECE_IMG_SETS } from "../lib/theme.js";
import { SITE_FONT } from "./engineLines.jsx";
import { t } from "../lib/i18n.js";

const img = (set, piece, color) => ((PIECE_IMG_SETS[set] || PIECE_IMG_SETS.classic).images[piece][color] || {}).src;
const DESC = () => ({ openings: t("오프닝 수순 탐색과 해금"), masters: t("체스의 정점에 달한 선수들"), titles: t("모은 칭호와 다음 목표"), skins: t("기물·보드 세트 수집") });
const FONT_DISPLAY = "'Playfair Display','Noto Serif KR',serif", FONT_NUM = "'Bodoni Moda','Playfair Display',serif", FONT_SERIF = "'Cormorant Garamond','Noto Serif KR',serif";
// 받침대 위 기물: [세트, 기물, 색, 가로 위치(%), 높이(장면 높이 대비 %), 겹침 순서, 밝기]
const SHOWCASE = {
  openings: [["classic", "P", "b", 63, 36, 1, 0.85], ["classic", "P", "w", 42, 48, 2, 1]],
  masters: [["classic", "K", "b", 64, 46, 1, 0.85], ["classic", "K", "w", 40, 60, 2, 1]],
  titles: [["classic", "Q", "w", 50, 62, 2, 1]],
  skins: [["crystal", "N", "w", 27, 40, 1, 0.95], ["coral", "N", "w", 73, 40, 1, 0.95], ["classic", "N", "w", 50, 54, 2, 1]],
};
const D = facetRamp("#3D2616");

/* 받침대 — 흑단 윗면 · 금 띠 · 앞면, 각 면을 둘로 나눠 왼쪽이 밝다(왼쪽 위 빛). 금 띠 왼쪽에 짧은 반사면 하나. */
function Plinth() {
  return (
    <svg viewBox="0 0 100 30" aria-hidden="true" preserveAspectRatio="none" style={{ position: "absolute", left: "8%", bottom: "5%", width: "84%", aspectRatio: "100 / 30", display: "block" }}>
      <path d="M6 6 L50 6 L50 11 L0 11 Z" fill={D.l1} /><path d="M50 6 L94 6 L100 11 L50 11 Z" fill={D.l2} />
      <path d="M0 11 L50 11 L50 14.5 L0 14.5 Z" fill={GOLD.l2} /><path d="M50 11 L100 11 L100 14.5 L50 14.5 Z" fill={GOLD.l4} />
      <path d="M0 14.5 L50 14.5 L50 30 L4 30 Z" fill={D.l4} /><path d="M50 14.5 L100 14.5 L96 30 L50 30 Z" fill={D.base} />
      <path d="M5 11.6 L22 11.6 L21 13.4 L4 13.4 Z" fill={GOLD.hi} />
    </svg>
  );
}

/* 작은 금 보석(모서리·구분선) — FacetDiamond 한 개. */
function CornerGem({ size = 9, style }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true" style={{ display: "block", flexShrink: 0, ...style }}>
      <FacetDiamond cx={10} cy={10} r={9.5} R={GOLD} />
    </svg>
  );
}

function VitrineCard({ item, onOpen, index, desc }) {
  const { label, percent, detail } = item;
  const pct = percent == null ? null : Math.max(0, Math.min(100, percent));
  const pieces = SHOWCASE[item.key] || SHOWCASE.openings;
  const corner = { position: "absolute", width: 9, height: 9 };
  return (
    <motion.button initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.08 * index, ease: MOTION_EASE }}
      onClick={() => onOpen(item.key)} className="press dexv" aria-label={label + ", " + desc + (detail ? ", " + detail : "")}
      style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", minWidth: 0, padding: 0, cursor: "pointer", textAlign: "center", fontFamily: SITE_FONT, containerType: "inline-size", overflow: "hidden", borderRadius: 16 }}>
      {/* 안쪽 액자 + 네 모서리 보석 */}
      <span aria-hidden="true" className="dexv-frame" style={{ position: "absolute", inset: 7, borderRadius: 11, pointerEvents: "none", zIndex: 3 }}>
        <CornerGem style={{ ...corner, left: -4.5, top: -4.5 }} /><CornerGem style={{ ...corner, right: -4.5, top: -4.5 }} />
        <CornerGem style={{ ...corner, left: -4.5, bottom: -4.5 }} /><CornerGem style={{ ...corner, right: -4.5, bottom: -4.5 }} />
      </span>
      {/* 무대 — 모바일은 높이를 cqw로 못박는다(size 컨테이너가 min-height만 가지면 cqh가 0이 되는 문제, BUG-169) */}
      <span aria-hidden="true" className="dexv-stage" style={{ position: "relative", display: "block", flex: "0 0 auto", height: "84cqw", overflow: "hidden", containerType: "size" }}>
        <span className="dexv-cone" style={{ position: "absolute", left: "50%", top: 0, width: "78%", height: "100%", transform: "translateX(-50%)", clipPath: "polygon(38% 0, 62% 0, 100% 100%, 0 100%)", background: "linear-gradient(180deg, rgba(255,236,190,.20), rgba(255,236,190,.05) 70%, rgba(255,236,190,0))" }} />
        <span style={{ position: "absolute", left: "50%", top: "48%", width: "min(100cqw, 125cqh)", aspectRatio: "1 / 0.8", transform: "translate(-50%,-50%)" }}>
          <span style={{ position: "absolute", left: "50%", bottom: "20%", width: "70%", height: "16%", transform: "translateX(-50%)", borderRadius: "50%", background: "radial-gradient(closest-side, rgba(236,203,134,.32), transparent)" }} />
          <Plinth />
          <span className="dexv-pieces" style={{ position: "absolute", inset: 0 }}>
            {pieces.map(([set, pc, color, x, h, z, b], k) => (
              <img key={k} src={img(set, pc, color)} alt="" draggable={false} loading="lazy"
                style={{ position: "absolute", left: x + "%", bottom: "26%", height: h + "%", transform: "translateX(-50%)", zIndex: z, filter: "brightness(" + b + ") drop-shadow(0 5px 6px rgba(0,0,0,.55))", objectFit: "contain" }} />
            ))}
          </span>
        </span>
        <span style={{ position: "absolute", left: "clamp(14px, 6cqw, 24px)", top: "clamp(12px, 5cqw, 20px)", fontFamily: FONT_NUM, fontSize: "clamp(11px, 4.6cqw, 15px)", fontWeight: 700, color: T.brass, letterSpacing: ".08em", fontVariantNumeric: "lining-nums" }}>{String(index + 1).padStart(2, "0")}</span>
        <span className="dexv-sheen" />
      </span>
      {/* 명판 */}
      <span className="dexv-plate" style={{ display: "block", flex: "0 0 auto", padding: "0 clamp(14px, 7cqw, 30px) clamp(16px, 6cqw, 26px)" }}>
        <span style={{ display: "block", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: "clamp(18px, 9.5cqw, 32px)", lineHeight: 1.1, letterSpacing: ".01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          background: "linear-gradient(180deg, #FFF4D6 0%, " + T.brassHi + " 55%, " + T.brass + " 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", paddingBottom: 2 }}>{label}</span>
        <span aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 6, margin: "clamp(6px, 2.4cqw, 10px) auto", width: "62%" }}>
          <span style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, " + T.brass + ")" }} /><CornerGem size={8} /><span style={{ flex: 1, height: 1, background: "linear-gradient(90deg, " + T.brass + ", transparent)" }} />
        </span>
        <span className="dexv-desc" style={{ display: "block", fontFamily: FONT_SERIF, fontStyle: "italic", fontWeight: 600, fontSize: "clamp(13px, 5.4cqw, 18px)", color: "#CDBA98", lineHeight: 1.25, minHeight: "2.5em" }}>{desc}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "clamp(8px, 3cqw, 14px)" }}>
          <span aria-hidden="true" style={{ position: "relative", flex: 1, height: 2, background: "rgba(236,203,134,.16)" }}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: (pct || 0) + "%", background: "linear-gradient(90deg, " + T.brass + ", " + T.brassHi + ")", boxShadow: pct ? "0 0 6px rgba(236,203,134,.5)" : "none" }} />
          </span>
          <span style={{ fontFamily: FONT_NUM, fontSize: "clamp(11px, 4.4cqw, 14px)", fontWeight: 700, color: T.brassHi, fontVariantNumeric: "lining-nums tabular-nums", whiteSpace: "nowrap" }}>{detail || ""}</span>
        </span>
        <span className="dexv-cta" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: "clamp(10px, 3.6cqw, 16px)", fontSize: "clamp(11px, 4.4cqw, 13px)", fontWeight: 800, letterSpacing: ".3em", color: T.brassHi, paddingBottom: 3 }}>
          {t("입장")}<ChevronRight className="dexv-chev" size={13} color={T.brassHi} aria-hidden="true" />
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
        .dexv { border: 1px solid rgba(196,154,80,.55); background: radial-gradient(120% 60% at 50% 0%, #3A2516 0%, rgba(58,37,22,0) 60%), linear-gradient(180deg, #24160C 0%, #1B1009 55%, #120A05 100%);
          box-shadow: inset 0 1px 0 rgba(255,236,190,.10), 0 22px 34px -22px #000; transition: transform .35s cubic-bezier(.2,.8,.2,1), border-color .35s, box-shadow .35s; }
        .dexv .dexv-frame { border: 1px solid rgba(236,203,134,.20); transition: border-color .35s; }
        .dexv:hover { transform: translateY(-4px); border-color: rgba(236,203,134,.85); box-shadow: inset 0 1px 0 rgba(255,236,190,.14), 0 28px 40px -22px #000, 0 0 22px -6px rgba(236,203,134,.35); }
        .dexv:hover .dexv-frame { border-color: rgba(236,203,134,.40); }
        .dexv:focus-visible { outline: 2px solid ${T.brassHi}; outline-offset: 3px; }
        .dexv .dexv-cone { opacity: .75; transition: opacity .4s; }
        .dexv:hover .dexv-cone { opacity: 1; }
        .dexv .dexv-pieces { transition: transform .45s cubic-bezier(.2,.8,.2,1); }
        .dexv:hover .dexv-pieces { transform: translateY(-2.5%); }
        .dexv .dexv-cta { background: linear-gradient(${T.brassHi}, ${T.brassHi}) left bottom / 0 1px no-repeat; transition: background-size .35s; }
        .dexv:hover .dexv-cta { background-size: 100% 1px; }
        .dexv .dexv-chev { transition: transform .25s; }
        .dexv:hover .dexv-chev { transform: translateX(3px); }
        .dexv .dexv-sheen { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(105deg, transparent 42%, rgba(255,240,200,.10) 50%, transparent 58%); transform: translateX(-120%); }
        .dexv:hover .dexv-sheen { animation: dexvSheen 1.2s ease-out 1; }
        @keyframes dexvSheen { to { transform: translateX(120%); } }
        .dexhub-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        @media (min-width: 900px) {
          .dexhub-grid { grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 18px; height: clamp(560px, calc(100dvh - 205px), 980px); }
          .dexhub-grid .dexv-stage { flex: 1 1 auto !important; height: auto !important; min-height: 0; }
          .dexhub-grid .dexv-desc { min-height: 0 !important; }
          .dexhub-grid .dexv { height: 100%; }
        }
      `}</style>
      <div className="dexhub-grid">
        {items.map((it, i) => <VitrineCard key={it.key} item={it} onOpen={onOpen} index={i} desc={desc[it.key] || ""} />)}
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
