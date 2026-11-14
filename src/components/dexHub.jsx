// (v0.7.5, 사용자 요청) 도감 첫 화면 네 카드(오프닝·마스터·업적·스킨) — 사이트 공통 재료(흑단 바탕 위 아이보리 종이 패널, 갈색 잉크, 황동 칩·게이지, 나무 체스판).
//  테마 구분은 색이 아니라 카드 속 나무 체스판 조각 위의 장면으로 한다(오프닝: 방금 둔 첫 수 · 마스터: 마주 선 두 킹 · 업적: 월계관을 쓴 퀸 · 스킨: 스킨이 다른 나이트들).
// (v0.7.6, 사용자 요청 2차) 네 구획을 동등하게 — 같은 크기의 "진열장" 네 개(아래 Vitrine 설명). 1차안(크기가 다른 벤토 격자)은 되돌렸다.
// (v0.7.6, 사용자 요청 3차) 머리의 글자·요약 알약은 없앴다. 진열장에 게임 느낌(깎은 모서리 프레임·STAGE 꼬리표·둥실 기물·빛 알갱이·10칸 경험치 막대·입장 버튼)을 더했다.
//  items: [{ key, label, Icon, percent(0~100|null), detail }]
import { FacetLeaf, taperedStem, facetRamp } from "./facetIcons.jsx";
import React from "react";
import { ChevronRight } from "./ocIcons.jsx";   // (v0.7.5) OpenChess 파셋 아이콘(예전 lucide 대체)
import { motion } from "framer-motion";
import { T, MOTION_EASE, PIECE_IMG_SETS } from "../lib/theme.js";
import { SITE_FONT } from "./engineLines.jsx";
import { t } from "../lib/i18n.js";

const BRASS = "#A8842F";
const img = (set, piece, color) => ((PIECE_IMG_SETS[set] || PIECE_IMG_SETS.classic).images[piece][color] || {}).src;

const DESC = () => ({ openings: t("오프닝 수순 탐색과 해금"), masters: t("체스의 정점에 달한 선수들"), titles: t("모은 칭호와 다음 목표"), skins: t("기물·보드 세트 수집") });

const LAUREL = facetRamp(T.brassHi);
/* ── (v0.7.6, 사용자 요청 2차) "전시실" — 네 구획을 똑같은 크기의 진열장 네 개로 나란히 세운다(데스크톱 4열 · 태블릿/모바일 2×2).
   진열장 하나 = 위에서 내려오는 조명 · 원근 체스판 바닥 · 면 분할 받침대(왼쪽 위 빛: 윗면 밝음 · 앞면 중간 · 옆면 어두움) 위의 대표 기물 · 받침대 앞면의 로마 숫자 · 아래 황동 명판(제목·설명·진행).
   구획마다 다른 것은 받침대 위 장면뿐이다: 오프닝 = 한 칸 나아간 백 폰과 마주 선 흑 폰 · 마스터 = 백 킹과 뒤에 선 흑 킹 · 업적 = 월계관 안의 퀸 · 스킨 = 재질이 다른 나이트 셋.
   올리면 기물이 떠오르고 조명이 밝아지며 빛이 한 번 지나간다(기기의 움직임 줄이기 설정 대신 사이트 시각 효과 설정을 따른다 — BUG-010). 크기는 진열장 폭 기준(container query)이라 어떤 폭에서도 같은 비율. */
const FONT_DISPLAY = "'Playfair Display','Noto Serif KR',serif";
const NUMERAL = { openings: "I", masters: "II", titles: "III", skins: "IV" };
// 기물: [세트, 기물, 색, 가로 위치(%), 높이(진열장 폭 대비 %), 겹침 순서, 밝기]
const EXHIBIT = {
  openings: [["classic", "P", "b", 66, 30, 1, 0.82], ["classic", "P", "w", 42, 44, 2, 1]],
  masters: [["classic", "K", "b", 67, 36, 1, 0.82], ["classic", "K", "w", 41, 44, 2, 1]],
  titles: [["classic", "Q", "w", 50, 40, 2, 1]],
  skins: [["crystal", "N", "w", 28, 34, 1, 0.9], ["coral", "N", "w", 72, 34, 1, 0.9], ["classic", "N", "w", 50, 44, 2, 1]],
};
const PLINTH = facetRamp("#8A6A3E");
// (v0.7.6, 사용자 요청 3차) 게임 느낌 — 모서리를 비스듬히 깎은 프레임(게임 스테이지 선택 카드), 스테이지 번호 꼬리표, 기물이 둥실 떠 있고 빛 알갱이가 올라가며, 10칸 경험치 막대와 입장 버튼
// 깎은 모서리 크기는 px로 — clip-path의 cqw는 자기 자신이 아니라 바깥 컨테이너를 기준으로 잡혀 데스크톱에서 모서리가 지나치게 커졌다
const chamfer = (c) => "polygon(" + c + "px 0, calc(100% - " + c + "px) 0, 100% " + c + "px, 100% calc(100% - " + c + "px), calc(100% - " + c + "px) 100%, " + c + "px 100%, 0 calc(100% - " + c + "px), 0 " + c + "px)";
const CHAMFER = chamfer(16), CHAMFER_IN = chamfer(15);
const STAGE_NO = { openings: "01", masters: "02", titles: "03", skins: "04" };
function Laurel() {
  return (
    <svg viewBox="0 0 60 80" aria-hidden="true" style={{ position: "absolute", left: "50%", bottom: "27cqw", width: "66cqw", transform: "translateX(-50%)", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.45))" }}>
      {[-1, 1].map((sd) => (
        <g key={sd} transform={sd < 0 ? "translate(60 0) scale(-1 1)" : undefined}>
          <path d={taperedStem(30, 76, 3, 52, 9, 20, 2.4, 0.8)} fill={LAUREL.l4} />
          {[[9, 24], [7.5, 35], [8.5, 46], [12, 57], [18, 66]].map(([x, y], k) => {
            const d = -120 + k * 14, r = (d * Math.PI) / 180, L = 9.6;
            return <FacetLeaf key={k} x={x - Math.cos(r) * L / 2} y={y - Math.sin(r) * L / 2} rot={d} sz={L / 1.35} R={LAUREL} mirror={sd < 0} />;
          })}
        </g>
      ))}
    </svg>
  );
}
function Vitrine({ item, onOpen, index, desc }) {
  const { label, percent, detail } = item;
  const pct = percent == null ? null : Math.max(0, Math.min(100, percent));
  const pieces = EXHIBIT[item.key] || EXHIBIT.openings;
  return (
    <motion.button initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 * index, ease: MOTION_EASE }}
      onClick={() => onOpen(item.key)} className="press dexv" aria-label={label + ", " + desc + (detail ? ", " + detail : "")}
      style={{ position: "relative", display: "block", width: "100%", minWidth: 0, padding: 2, border: "none", cursor: "pointer", textAlign: "left", fontFamily: SITE_FONT, containerType: "inline-size", clipPath: CHAMFER, background: "linear-gradient(160deg," + T.brassHi + " 0%, #7A5A20 38%, #3A2516 62%, " + T.brass + " 100%)" }}>
      <span className="dexv-inner" style={{ position: "relative", display: "block", clipPath: CHAMFER_IN, overflow: "hidden" }}>
      {/* 무대: 조명·바닥·받침대·기물 */}
      <span aria-hidden="true" className="dexv-stage" style={{ position: "relative", display: "block", width: "100%", aspectRatio: "1 / 1.08", overflow: "hidden" }}>
        <span className="dexv-light" style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 55% at 50% 22%, rgba(255,226,160,.30), rgba(255,226,160,.06) 55%, transparent 75%)" }} />
        <span style={{ position: "absolute", left: "18%", right: "18%", top: 0, height: "62%", background: "linear-gradient(180deg, rgba(255,230,170,.16), rgba(255,230,170,0))", clipPath: "polygon(30% 0, 70% 0, 100% 100%, 0 100%)" }} />
        {/* 원근 체스판 바닥 */}
        <span style={{ position: "absolute", left: "-40%", right: "-40%", bottom: "-6%", height: "52%", perspective: "60cqw", overflow: "hidden" }}>
          <span className="dexv-floor" style={{ position: "absolute", inset: 0, transformOrigin: "50% 100%", transform: "rotateX(62deg)", backgroundImage: "repeating-conic-gradient(" + T.boardDark + " 0 25%, " + T.boardLight + " 0 50%)", backgroundSize: "18cqw 18cqw", backgroundPosition: "center bottom", opacity: 0.9,
            maskImage: "linear-gradient(180deg, transparent, #000 45%)", WebkitMaskImage: "linear-gradient(180deg, transparent, #000 45%)" }} />
        </span>
        {/* 받침대(면 분할: 윗면 밝음 · 앞면 · 오른쪽 옆면 어두움 · 밑단 가장 어두움) */}
        <span style={{ position: "absolute", left: "50%", bottom: "9cqw", width: "58cqw", height: "22cqw", transform: "translateX(-50%)" }}>
          <span style={{ position: "absolute", left: 0, right: 0, top: 0, height: "26%", background: PLINTH.l1, clipPath: "polygon(6% 0, 94% 0, 100% 100%, 0 100%)" }} />
          <span style={{ position: "absolute", left: 0, right: "10%", top: "26%", bottom: "14%", background: "linear-gradient(180deg," + PLINTH.l2 + "," + PLINTH.l3 + ")" }} />
          <span style={{ position: "absolute", right: 0, width: "10%", top: "26%", bottom: "14%", background: PLINTH.l4 }} />
          <span style={{ position: "absolute", left: "-3%", right: "-3%", bottom: 0, height: "14%", background: PLINTH.base }} />
          <span style={{ position: "absolute", left: 0, right: "10%", top: "26%", bottom: "14%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: "8cqw", letterSpacing: ".08em", color: "rgba(255,236,190,.82)", textShadow: "0 1px 0 rgba(0,0,0,.45)" }}>{NUMERAL[item.key]}</span>
        </span>
        {item.key === "titles" && <Laurel />}
        <span className="dexv-pieces" style={{ position: "absolute", inset: 0, animationDelay: (index * 0.35) + "s" }}>
          {pieces.map(([set, pc, color, x, h, z, b], k) => (
            <img key={k} src={img(set, pc, color)} alt="" draggable={false} loading="lazy"
              style={{ position: "absolute", left: x + "%", bottom: "29cqw", height: h + "cqw", transform: "translateX(-50%)", zIndex: z, filter: "brightness(" + b + ") drop-shadow(0 6px 6px rgba(0,0,0,.55))", objectFit: "contain" }} />
          ))}
        </span>
        {/* 게임 스테이지 표지 — 평행사변형 황동 꼬리표 "STAGE 0N" */}
        <span style={{ position: "absolute", left: "4cqw", top: "4.4cqw", padding: "1cqw 3.4cqw 1cqw 2.6cqw", clipPath: "polygon(0 0, 100% 0, 88% 100%, 0 100%)", background: "linear-gradient(180deg," + T.brassHi + "," + T.brass + ")", color: "#241509", fontSize: "max(9px, 3.4cqw)", fontWeight: 900, letterSpacing: ".14em" }}>STAGE {STAGE_NO[item.key]}</span>
        {/* 떠오르는 빛 알갱이(마름모) */}
        {[18, 46, 74, 62, 30].map((x, k) => <span key={k} className="dexv-spark" style={{ position: "absolute", left: x + "%", bottom: "30%", width: "1.8cqw", height: "1.8cqw", background: k % 2 ? T.brassHi : "#FFF1C4", clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)", animationDelay: (k * 0.7 + index * 0.3) + "s" }} />)}
        <span className="dexv-glint" />
      </span>
      {/* 황동 명판 */}
      <span className="dexv-plate" style={{ display: "block", padding: "3.6cqw 5cqw 4.4cqw", borderTop: "1px solid rgba(236,203,134,.35)" }}>
        <span style={{ display: "block", fontWeight: 900, fontSize: "max(17px, 9cqw)", lineHeight: 1.05, color: "#FFF4D6", letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 0 2.4cqw rgba(236,203,134,.45), 0 2px 0 rgba(0,0,0,.6)" }}>{label}</span>
        <span style={{ display: "block", marginTop: "1.2cqw", fontSize: "max(11px, 4.6cqw)", fontWeight: 600, color: "#CDBA98", lineHeight: 1.35, minHeight: "2.7em" }}>{desc}</span>
        {/* 진행: 게임 경험치 막대처럼 10칸으로 나눈 막대 + 수치 */}
        <span style={{ display: "flex", alignItems: "center", gap: "2cqw", marginTop: "2.4cqw" }}>
          <span aria-hidden="true" style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: "0.8cqw", height: "2.4cqw", minHeight: 6 }}>
            {Array.from({ length: 10 }, (_, k) => { const on = pct != null && pct >= (k + 1) * 10 - 5; return <span key={k} style={{ clipPath: "polygon(18% 0, 100% 0, 82% 100%, 0 100%)", background: on ? "linear-gradient(180deg,#FFE7A6," + T.brass + ")" : "rgba(236,203,134,.14)", boxShadow: on ? "0 0 6px rgba(236,203,134,.6)" : "none" }} />; })}
          </span>
          <span style={{ fontSize: "max(11px, 4.4cqw)", fontWeight: 900, color: T.brassHi, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{detail || ""}</span>
        </span>
        {/* 입장 버튼 */}
        <span className="dexv-cta" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1.6cqw", marginTop: "3.2cqw", height: "max(32px, 11cqw)", clipPath: "polygon(4% 0, 96% 0, 100% 50%, 96% 100%, 4% 100%, 0 50%)", background: "linear-gradient(180deg,#F6D98A 0%," + T.brass + " 55%,#7A5A20 100%)", color: "#241509", fontSize: "max(12px, 4.8cqw)", fontWeight: 900, letterSpacing: ".12em" }}>
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
        .dexv .dexv-inner { background: radial-gradient(120% 70% at 50% 0%, #3A2414 0%, #1A0F08 60%, #120A05 100%); }
        .dexv:hover { transform: translateY(-6px) scale(1.025); filter: drop-shadow(0 18px 22px rgba(0,0,0,.8)) drop-shadow(0 0 14px rgba(236,203,134,.45)); }
        .dexv .dexv-pieces { animation: dexvBob 3.4s ease-in-out infinite alternate; }
        @keyframes dexvBob { from { transform: translateY(0); } to { transform: translateY(-1.8cqw); } }
        .dexv .dexv-spark { opacity: 0; animation: dexvSpark 3.6s ease-out infinite; }
        @keyframes dexvSpark { 0% { opacity: 0; transform: translateY(0) scale(.6); } 25% { opacity: .9; } 100% { opacity: 0; transform: translateY(-34cqw) scale(1); } }
        .dexv .dexv-cta { transition: filter .25s; }
        .dexv:hover .dexv-cta { filter: brightness(1.12); }
        .dexv:focus-visible { outline: 2px solid ${T.brassHi}; outline-offset: 3px; }
        .dexv .dexv-light { transition: opacity .35s; opacity: .75; }
        .dexv:hover .dexv-light { opacity: 1; }
        .dexv .dexv-plate { background: linear-gradient(180deg, rgba(58,36,20,.95), rgba(26,15,8,.98)); }
        .dexv .dexv-chev { transition: transform .25s; }
        .dexv:hover .dexv-chev { transform: translateX(3px); }
        .dexv .dexv-glint { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(105deg, transparent 40%, rgba(255,240,200,.16) 50%, transparent 60%); transform: translateX(-120%); }
        .dexv:hover .dexv-glint { animation: dexvGlint 1.1s ease-out 1; }
        @keyframes dexvGlint { to { transform: translateX(120%); } }
        .dexhub-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        @media (min-width: 900px) { .dexhub-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; } }
      `}</style>
      <div className="dexhub-grid">
        {items.map((it, i) => <Vitrine key={it.key} item={it} onOpen={onOpen} index={i} desc={desc[it.key] || ""} />)}
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
