// 도감 첫 화면 — 오프닝·마스터·업적·스킨 네 구획으로 들어가는 입구.
// (v0.7.6, 사용자 요청 4차) "한 판의 체스판" — 화면 가운데 큰 체스판 하나를 네 사분면(각 4×4칸)으로 나눠 구획 하나씩을 맡긴다. 네 구획은 크기·모양이 똑같다.
//  · 사분면마다 대표 기물 하나가 크게 선다: 오프닝 = 폰 · 마스터 = 킹 · 업적 = 퀸 · 스킨 = 크리스털 나이트(스킨 세트). 백·흑을 번갈아 체크무늬처럼 배치.
//  · 사분면 아래쪽에 반투명 이름표(제목·설명·진행)가 붙는다. 판 둘레에는 a–h / 1–8 좌표(실제 체스판처럼).
//  · 사분면 위에 올리면 그 사분면만 살짝 솟고 황동 테두리가 켜지며 기물이 커진다. 나머지 셋은 조금 어두워진다(판 전체 :hover + 해당 사분면 :hover).
//  · 크기: 데스크톱은 화면 높이에 맞춘 정사각(최대 720px), 모바일은 화면 폭. 글자 크기는 사분면 폭 기준(container query).
//  이전 시안(크기가 다른 카드 격자 · 진열장 · 전시실 천장 조명)은 사용자 요청으로 모두 걷어냈다.
//  items: [{ key, label, Icon, percent(0~100|null), detail }]
import React from "react";
import { ChevronRight } from "./ocIcons.jsx";
import { motion } from "framer-motion";
import { T, MOTION_EASE, PIECE_IMG_SETS } from "../lib/theme.js";
import { SITE_FONT } from "./engineLines.jsx";
import { t } from "../lib/i18n.js";

const BRASS = "#A8842F";
const img = (set, piece, color) => ((PIECE_IMG_SETS[set] || PIECE_IMG_SETS.classic).images[piece][color] || {}).src;
const DESC = () => ({ openings: t("오프닝 수순 탐색과 해금"), masters: t("체스의 정점에 달한 선수들"), titles: t("모은 칭호와 다음 목표"), skins: t("기물·보드 세트 수집") });
// 사분면 순서(왼쪽 위 → 오른쪽 위 → 왼쪽 아래 → 오른쪽 아래)와 대표 기물 — 백·흑이 대각선으로 번갈아 체크무늬처럼
const PIECE = { openings: ["classic", "P", "w"], masters: ["classic", "K", "b"], titles: ["classic", "Q", "b"], skins: ["crystal", "N", "w"] };
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

function Quadrant({ item, onOpen, index, desc }) {
  const { label, percent, detail } = item;
  const pct = percent == null ? null : Math.max(0, Math.min(100, percent));
  const [set, pc, color] = PIECE[item.key] || PIECE.openings;
  // 사분면의 첫 칸 색: 실제 판(a8이 밝은 칸)에서 왼쪽 위 사분면은 밝은 칸부터, 오른쪽 위 사분면(e8)도 밝은 칸부터 — 4×4라 모든 사분면이 밝은 칸에서 시작한다
  return (
    <motion.button initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45, delay: 0.07 * index, ease: MOTION_EASE }}
      onClick={() => onOpen(item.key)} className="press dexq" aria-label={label + ", " + desc + (detail ? ", " + detail : "")}
      style={{ position: "relative", display: "block", width: "100%", height: "100%", minWidth: 0, padding: 0, border: "none", cursor: "pointer", textAlign: "left", fontFamily: SITE_FONT, containerType: "inline-size", overflow: "hidden",
        backgroundImage: "repeating-conic-gradient(" + T.boardDark + " 0 25%, " + T.boardLight + " 0 50%)", backgroundSize: "50% 50%", backgroundPosition: "0 0" }}>
      <span aria-hidden="true" className="dexq-shade" style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 60% at 50% 42%, rgba(255,240,200,.18), rgba(30,16,6,.28) 75%)" }} />
      <img src={img(set, pc, color)} alt="" aria-hidden="true" draggable={false} className="dexq-piece"
        style={{ position: "absolute", left: "50%", top: "8cqw", height: "58cqw", transform: "translateX(-50%)", objectFit: "contain", filter: "drop-shadow(0 2.4cqw 2.2cqw rgba(0,0,0,.5))" }} />
      <span className="dexq-tag" style={{ position: "absolute", left: "4.5cqw", right: "4.5cqw", bottom: "4.5cqw", display: "block", borderRadius: "3.4cqw", padding: "3.4cqw 4.4cqw 3.6cqw", background: "rgba(28,16,8,.86)", boxShadow: "0 1.6cqw 4cqw -1.4cqw rgba(0,0,0,.7), inset 0 0 0 1px rgba(236,203,134,.28)", backdropFilter: "blur(2px)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "2cqw" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: "max(15px, 8.4cqw)", fontWeight: 900, color: T.ivoryHi, letterSpacing: "-.02em", lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
          <ChevronRight className="dexq-chev" size={16} color={T.brassHi} aria-hidden="true" />
        </span>
        <span className="dexq-desc" style={{ display: "block", marginTop: "1cqw", fontSize: "max(10.5px, 4.3cqw)", fontWeight: 600, color: "#CDBA98", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{desc}</span>
        <span style={{ display: "flex", alignItems: "center", gap: "2.4cqw", marginTop: "2.2cqw" }}>
          <span aria-hidden="true" style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(236,203,134,.16)", overflow: "hidden" }}>
            {pct != null && <span style={{ display: "block", width: pct + "%", height: "100%", borderRadius: 2, background: "linear-gradient(90deg," + BRASS + "," + T.brassHi + ")" }} />}
          </span>
          <span style={{ fontSize: "max(10.5px, 4.2cqw)", fontWeight: 800, color: T.brassHi, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{detail || ""}</span>
        </span>
      </span>
    </motion.button>
  );
}

/** items: [{ key, label, Icon, percent(0~100|null), detail }] */
export function DexHub({ items, onOpen }) {
  const desc = DESC();
  const coord = { fontSize: 11, fontWeight: 800, color: "rgba(236,203,134,.55)", fontFamily: SITE_FONT, display: "flex", alignItems: "center", justifyContent: "center" };
  return (
    <div className="dexhub" style={{ display: "flex", justifyContent: "center", padding: "4px 0 8px" }}>
      <style>{`
        .dexboard { --side: min(720px, calc(100dvh - 230px), calc(100vw - 72px)); }
        @media (max-width: 640px) { .dexboard { --side: calc(100vw - 52px); } }
        .dexq { transition: transform .35s cubic-bezier(.2,.8,.2,1), box-shadow .35s, filter .35s; z-index: 1; }
        .dexq .dexq-piece { transition: transform .45s cubic-bezier(.2,.8,.2,1); }
        .dexq .dexq-chev { transition: transform .25s; flex-shrink: 0; }
        .dexgrid:hover .dexq { filter: brightness(.8) saturate(.9); }
        .dexgrid .dexq:hover { filter: none; transform: scale(1.025); z-index: 2; box-shadow: 0 18px 40px -12px rgba(0,0,0,.85), 0 0 0 3px ${T.brassHi}; }
        .dexq:hover .dexq-piece { transform: translateX(-50%) translateY(-2cqw) scale(1.06); }
        .dexq:hover .dexq-chev { transform: translateX(3px); }
        .dexq:focus-visible { outline: 3px solid ${T.brassHi}; outline-offset: -3px; z-index: 3; }
      `}</style>
      <div className="dexboard" style={{ display: "grid", gridTemplateColumns: "18px var(--side) 18px", gridTemplateRows: "18px var(--side) 18px" }}>
        <span />
        <span aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)" }}>{FILES.map((f) => <span key={f} style={coord}>{f}</span>)}</span>
        <span />
        <span aria-hidden="true" style={{ display: "grid", gridTemplateRows: "repeat(8, 1fr)" }}>{FILES.map((_, i) => <span key={i} style={coord}>{8 - i}</span>)}</span>
        <div className="dexgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", borderRadius: 10, padding: 6, background: "linear-gradient(145deg,#4A3220,#2A1A0F)", boxShadow: "0 24px 50px -18px rgba(0,0,0,.9), inset 0 0 0 1px rgba(236,203,134,.3)" }}>
          {items.map((it, i) => <Quadrant key={it.key} item={it} onOpen={onOpen} index={i} desc={desc[it.key] || ""} />)}
        </div>
        <span aria-hidden="true" style={{ display: "grid", gridTemplateRows: "repeat(8, 1fr)" }}>{FILES.map((_, i) => <span key={i} style={coord}>{8 - i}</span>)}</span>
        <span />
        <span aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)" }}>{FILES.map((f) => <span key={f} style={coord}>{f}</span>)}</span>
        <span />
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
