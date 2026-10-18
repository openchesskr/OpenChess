// (v0.6.9) 스킨 도감 — 세트 장착 / 기물 도감 / 세트 도감 3탭. 세트의 여섯 기물(폰·나이트·비숍·룩·퀸·킹)이 한 칸씩 대응한다.
// 미보유 칸은 실루엣("?")으로 가려 두고, 뽑기로 얻으면 기물이 드러난다. 장착은 세트 단위(보드+기물).
import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { T, BOARD_SKINS, SKIN_SETS, boardSquareBg, BOARD_GLOSS } from "../lib/theme.js";
import { PieceGlyph } from "../components/pieces.jsx";
import { SkinSetCard } from "./common.jsx";
import { GACHA_POOL, GACHA_RARITY, ownsSet } from "../lib/gacha.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { t, tx } from "../lib/i18n.js";

export const BOOK_PIECES = [
  { type: "P", label: () => t("폰") }, { type: "N", label: () => t("나이트") }, { type: "B", label: () => t("비숍") },
  { type: "R", label: () => t("룩") }, { type: "Q", label: () => t("퀸") }, { type: "K", label: () => t("킹") },
];
// 기본 세트(항상 보유) + 뽑기 세트들 — 도감에 나오는 순서
export function bookSets() {
  return [
    { id: "classic", label: t("기본"), rarity: "common" },
    ...SKIN_SETS.map((s) => ({ ...s, rarity: (GACHA_POOL.find((p) => p.id === s.id) || {}).rarity || "common" })),
    // 그랜드마스터 티어에 도달하면 자동 해금되는 전용 세트(뽑기 풀 밖)
    { id: "grandmaster", label: t("그랜드마스터"), desc: t("오로라 크리스탈과 대리석, 그랜드마스터 전용 세트"), rarity: "legend", lockedLabel: t("그랜드마스터 달성 시 해금") },
  ];
}
const has = (owned, id) => id === "classic" || ownsSet(owned || new Set(), id) || (id === "grandmaster" && !!owned && owned.has("board:grandmaster") && owned.has("piece:grandmaster"));
export const ownedSetCount = (owned) => bookSets().filter((s) => has(owned, s.id)).length;

// 둥근 도감 칸 — 보유하면 기물, 미보유면 실루엣. 테두리 색은 세트 등급.
function Slot({ set, type, color = "w", size = 46, owned, equipped, onClick, label }) {
  const rar = GACHA_RARITY[set.rarity] || GACHA_RARITY.common;
  const inner = size - 8;
  return (
    <button onClick={onClick} disabled={!onClick} className="press" aria-label={label} title={label}
      style={{ width: size, height: size, borderRadius: "50%", padding: 0, flexShrink: 0, cursor: onClick ? "pointer" : "default", position: "relative", border: "3px solid " + rar.color, background: owned ? "radial-gradient(circle at 50% 35%, #5A4630, #2A1B10)" : "radial-gradient(circle at 50% 35%, #3A2A1C, #1A100A)", boxShadow: equipped ? "0 0 0 2px #fff6d0, 0 0 10px " + rar.color : "inset 0 0 6px rgba(0,0,0,.6)", display: "inline-flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden" }}>
      <span style={{ width: inner, display: "flex", justifyContent: "center", filter: owned ? "none" : "brightness(0) opacity(.55)" }}><PieceGlyph type={type} color={color} size={inner * 0.98} pieceSkin={set.id} /></span>
      {!owned && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#B9A27C", fontWeight: 900, fontSize: size * 0.4, fontFamily: SITE_FONT, textShadow: "0 1px 2px #000" }}>?</span>}
    </button>
  );
}
function BoardSlot({ set, size = 46, owned }) {
  const rar = GACHA_RARITY[set.rarity] || GACHA_RARITY.common;
  const bsk = BOARD_SKINS[set.id];
  return (
    <span aria-hidden style={{ width: size, height: size, borderRadius: 10, flexShrink: 0, border: "3px solid " + rar.color, overflow: "hidden", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gridTemplateRows: "repeat(4,1fr)", position: "relative", filter: owned ? "none" : "brightness(0) opacity(.55)", ...BOARD_GLOSS }}>
      {Array.from({ length: 16 }).map((_, i) => { const r = Math.floor(i / 4), c = i % 4; return <span key={i} style={boardSquareBg(bsk, (r + c) % 2 === 0, r, c)} />; })}
    </span>
  );
}
function RarityChip({ rarity }) {
  const rar = GACHA_RARITY[rarity] || GACHA_RARITY.common;
  return <span style={{ fontSize: 10, fontWeight: 900, color: "#fff", background: rar.color, borderRadius: 999, padding: "1px 9px", letterSpacing: .3 }}>{t(rar.label)}</span>;
}
function EquipBtn({ owned, equipped, onClick, lockedLabel }) {
  const base = { fontSize: 12, fontWeight: 900, padding: "9px 12px", borderRadius: 10, minWidth: 96, fontFamily: SITE_FONT };
  if (equipped) return <button disabled className="press" style={{ ...base, border: "1px solid #3a2a12", background: "#2A1B10", color: "#F2D58A", cursor: "default", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}><Check size={14} />{t("장착중")}</button>;
  if (!owned) return <button disabled className="press" style={{ ...base, border: "none", background: "#8A7458", color: "#241509", cursor: "not-allowed" }}>{lockedLabel || t("뽑기로 획득")}</button>;
  return <button onClick={onClick} className="press" style={{ ...base, border: "1px solid #B8860B", background: "linear-gradient(180deg,#FFE27A,#E8A91C)", color: "#241509", cursor: "pointer", boxShadow: "0 2px 0 #9A6A0A" }}>{t("세트 장착하기")}</button>;
}

// ① 세트 장착 — 세트마다 한 줄: 등급·이름 + 여섯 기물 + 보드 + 장착 버튼
function SetEquipView({ owned, boardSkin, pieceSkin, onEquipSet }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {bookSets().slice().reverse().map((set) => {
        const o = has(owned, set.id), eq = boardSkin === set.id && pieceSkin === set.id;
        return (
          <div key={set.id} style={{ padding: "10px 10px 12px", borderRadius: 12, background: "linear-gradient(180deg,#E9D3A2,#D9BE86)", border: "2px solid " + (eq ? "#B8860B" : "#B79A62"), boxShadow: "inset 0 1px 0 rgba(255,255,255,.4)" }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
              <RarityChip rarity={set.rarity} />
              <span style={{ fontSize: 13, fontWeight: 900, color: "#3A2412", fontFamily: SITE_FONT }}>{set.label}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", rowGap: 10 }}>
              <div style={{ display: "flex", gap: 5, flex: "1 1 auto", flexWrap: "wrap" }}>
                {BOOK_PIECES.map((p) => <Slot key={p.type} set={set} type={p.type} size={42} owned={o} label={p.label()} />)}
                <BoardSlot set={set} size={42} owned={o} />
              </div>
              <EquipBtn owned={o} equipped={eq} lockedLabel={set.lockedLabel} onClick={() => onEquipSet(set.id)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ② 기물 도감 — 펼친 책 한 쪽 = 기물 한 종류. 세트별 그 기물이 칸으로 놓인다.
function PieceBookView({ owned, boardSkin, pieceSkin, onEquipSet }) {
  const [pi, setPi] = useState(0);
  const sets = bookSets(), p = BOOK_PIECES[pi];
  const got = sets.filter((s) => has(owned, s.id)).length;
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto" }}>
        {BOOK_PIECES.map((b, i) => (
          <button key={b.type} onClick={() => setPi(i)} className="press" style={{ flex: "1 0 auto", fontSize: 12, fontWeight: 900, padding: "7px 10px", borderRadius: 8, border: "1px solid " + (i === pi ? "#B8860B" : "#5A4630"), background: i === pi ? "linear-gradient(180deg,#FFE27A,#E8A91C)" : "rgba(0,0,0,.28)", color: i === pi ? "#241509" : T.ivory, cursor: "pointer" }}>{b.label()}</button>
        ))}
      </div>
      <motion.div key={p.type} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}
        style={{ padding: "14px 12px 12px", borderRadius: 14, background: "linear-gradient(180deg,#EBD6A6,#D8BC82)", border: "3px solid #6B4A26", boxShadow: "inset 0 0 0 2px #C9A867, 0 3px 10px rgba(0,0,0,.4)" }}>
        <div style={{ margin: "0 auto 14px", maxWidth: 240, textAlign: "center", fontSize: 14, fontWeight: 900, color: "#3A2412", background: "linear-gradient(180deg,#F2C25A,#D9962A)", border: "2px solid #8A5A12", borderRadius: 6, padding: "5px 10px", fontFamily: SITE_FONT }}>{tx("{0} 스킨", p.label())}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, justifyItems: "center" }}>
          {sets.map((set) => {
            const o = has(owned, set.id), eq = pieceSkin === set.id;
            return (
              <div key={set.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: "100%" }}>
                <Slot set={set} type={p.type} size={64} owned={o} equipped={eq} label={set.label} onClick={o ? () => onEquipSet(set.id) : undefined} />
                <span style={{ fontSize: 10.5, fontWeight: 800, color: o ? "#3A2412" : "#7A6444", textAlign: "center", lineHeight: 1.25 }}>{o ? set.label : "???"}</span>
                {eq && <span style={{ fontSize: 9.5, fontWeight: 900, color: "#fff", background: "#3F7A3A", borderRadius: 999, padding: "0 7px" }}>{t("장착중")}</span>}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 800, color: "#5A3E22" }}>
          <span>{pi + 1}/{BOOK_PIECES.length}</span><span>{tx("수집 {0}/{1}", got, sets.length)}</span>
        </div>
      </motion.div>
    </div>
  );
}

// ③ 세트 도감 — 전체 수집 현황 + 등급별 진행 + 세트 상세 카드
function SetDexView({ owned, boardSkin, pieceSkin, onEquipSet }) {
  const sets = bookSets();
  const got = sets.filter((s) => has(owned, s.id)).length;
  const rows = Object.entries(GACHA_RARITY).map(([key, rar]) => {
    const all = sets.filter((s) => s.rarity === key);
    return { key, rar, all: all.length, got: all.filter((s) => has(owned, s.id)).length };
  }).filter((r) => r.all > 0);
  return (
    <div>
      <div style={{ padding: 12, borderRadius: 12, background: "rgba(0,0,0,.28)", border: "1px solid #5A4630", marginBottom: 10 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: T.brassHi }}>{t("세트 수집 현황")}</span>
          <span style={{ fontSize: 13, fontWeight: 900, color: T.ivoryHi }}>{got}/{sets.length}</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "rgba(0,0,0,.4)", overflow: "hidden", marginBottom: 10 }}><div style={{ width: (100 * got / sets.length) + "%", height: "100%", background: "linear-gradient(90deg,#E8A91C,#FFE27A)" }} /></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {rows.map((r) => <span key={r.key} style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: r.rar.color, borderRadius: 999, padding: "2px 10px" }}>{t(r.rar.label)} {r.got}/{r.all}</span>)}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sets.slice(1).map((set) => <SkinSetCard key={set.id} set={set} ownedSkins={owned} boardSkin={boardSkin} pieceSkin={pieceSkin} onEquipSet={onEquipSet} />)}
      </div>
    </div>
  );
}

export function SkinBook({ ownedSkins, boardSkin, pieceSkin, onEquipSet }) {
  const [tab, setTab] = useState("equip");
  const tabs = [["equip", t("세트 장착")], ["pieces", t("기물 도감")], ["sets", t("세트 도감")]];
  const props = { owned: ownedSkins, boardSkin, pieceSkin, onEquipSet };
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", marginBottom: 10, borderRadius: 10, overflow: "hidden", border: "1px solid #5A4630", background: "rgba(0,0,0,.3)" }}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="press" style={{ flex: 1, padding: "9px 4px", fontSize: 12.5, fontWeight: 900, border: "none", borderRight: "1px solid #5A4630", background: tab === k ? "rgba(232,169,28,.22)" : "transparent", color: tab === k ? "#FFE27A" : "#9C8666", cursor: "pointer", fontFamily: SITE_FONT }}>{label}</button>
        ))}
      </div>
      {tab === "equip" ? <SetEquipView {...props} /> : tab === "pieces" ? <PieceBookView {...props} /> : <SetDexView {...props} />}
    </div>
  );
}
