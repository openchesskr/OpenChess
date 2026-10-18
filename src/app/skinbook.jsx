// (v0.6.9) 스킨 도감 — 세트 장착 / 기물 도감 / 세트 도감 3탭. 세트의 여섯 기물(폰·나이트·비숍·룩·퀸·킹)이 한 칸씩 대응하고, 여섯 개를 모두 모으면 보드가 해금된다.
// 디자인: 어두운 유리 패널 + 등급색 포인트(왼쪽 띠·테두리·은은한 조명). 등급 이름은 언어와 상관없이 영어(Common·Rare·Epic·Legendary)로 쓴다.
import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Lock } from "lucide-react";
import { T, BOARD_SKINS, SKIN_SETS, boardSquareBg, BOARD_GLOSS } from "../lib/theme.js";
import { PieceGlyph } from "../components/pieces.jsx";
import { GACHA_POOL, GACHA_RARITY, ownsPiece, ownsBoard, ownedPieceTypes } from "../lib/gacha.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { t, tx } from "../lib/i18n.js";

export const BOOK_PIECES = [
  { type: "P", label: () => t("폰") }, { type: "N", label: () => t("나이트") }, { type: "B", label: () => t("비숍") },
  { type: "R", label: () => t("룩") }, { type: "Q", label: () => t("퀸") }, { type: "K", label: () => t("킹") },
];
// 기본 세트(항상 보유) + 뽑기 세트들 + 그랜드마스터(티어 해금) — 도감에 나오는 순서의 원본(화면은 희귀한 것부터 보여 준다)
export function bookSets() {
  return [
    { id: "classic", label: t("기본"), rarity: "common" },
    ...SKIN_SETS.map((s) => ({ ...s, rarity: (GACHA_POOL.find((p) => p.id === s.id) || {}).rarity || "common" })),
    { id: "grandmaster", label: t("그랜드마스터"), rarity: "legend", lockedLabel: t("그랜드마스터 달성 시 해금") },
  ];
}
const none = new Set();
export const ownedSetCount = (owned) => bookSets().filter((s) => ownedPieceTypes(owned || none, s.id).length > 0).length;

const PANEL = { background: "linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.018))", border: "1px solid rgba(236,203,134,.16)", borderRadius: 16 };
const rarOf = (rarity) => GACHA_RARITY[rarity] || GACHA_RARITY.common;

/** 등급 표시 — 항상 영어. */
export function RarityTag({ rarity, size = 10 }) {
  const rar = rarOf(rarity);
  return <span style={{ fontSize: size, fontWeight: 800, letterSpacing: 0.9, textTransform: "uppercase", color: rar.color, border: "1px solid " + rar.color + "88", background: rar.color + "1F", borderRadius: 6, padding: "1px 7px", lineHeight: 1.5, flexShrink: 0 }}>{rar.label}</span>;
}

// 정사각 타일 — 보유하면 기물, 미보유면 흐린 실루엣 + 자물쇠
function Tile({ set, type, owned, equipped, onClick, label, big = false }) {
  const rar = rarOf(set.rarity);
  return (
    <button onClick={onClick} disabled={!onClick} aria-label={label} title={label} className={onClick ? "press" : undefined}
      style={{ position: "relative", width: "100%", aspectRatio: "1", padding: 0, borderRadius: big ? 16 : 11, cursor: onClick ? "pointer" : "default", overflow: "hidden", display: "flex", alignItems: "flex-end", justifyContent: "center",
        border: "1px solid " + (equipped ? T.brassHi : owned ? rar.color + "99" : "rgba(255,255,255,.08)"),
        background: owned ? "radial-gradient(90% 80% at 50% 25%, " + rar.color + "40, rgba(10,6,3,.85) 78%)" : "rgba(0,0,0,.35)",
        boxShadow: equipped ? "0 0 0 1px " + T.brassHi + ", 0 0 16px " + rar.color + "88" : "none" }}>
      <span style={{ width: "88%", display: "flex", justifyContent: "center", paddingBottom: "6%", filter: owned ? "none" : "brightness(0) opacity(.28)" }}><PieceGlyph type={type} color="w" size={big ? 80 : 40} pieceSkin={set.id} /></span>
      {!owned && <Lock size={big ? 18 : 13} color="#8B7550" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />}
    </button>
  );
}
function BoardTile({ set, owned }) {
  const rar = rarOf(set.rarity), bsk = BOARD_SKINS[set.id];
  return (
    <span aria-hidden style={{ position: "relative", width: "100%", aspectRatio: "1", borderRadius: 11, overflow: "hidden", border: "1px solid " + (owned ? rar.color + "99" : "rgba(255,255,255,.08)"), display: "grid", gridTemplateColumns: "repeat(4,1fr)", gridTemplateRows: "repeat(4,1fr)", filter: owned ? "none" : "brightness(.28) saturate(.4)", ...BOARD_GLOSS }}>
      {Array.from({ length: 16 }).map((_, i) => { const r = Math.floor(i / 4), c = i % 4; return <span key={i} style={boardSquareBg(bsk, (r + c) % 2 === 0, r, c)} />; })}
      {!owned && <Lock size={13} color="#B9A27C" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />}
    </span>
  );
}
function Count({ n, total = 6 }) {
  return <span style={{ fontSize: 12, fontWeight: 800, color: n === total ? T.brassHi : "#A8946F", fontVariantNumeric: "tabular-nums" }}>{n}<span style={{ opacity: 0.6 }}>/{total}</span></span>;
}

// ① 세트 장착 — 세트마다 카드 한 장: 등급·이름·수집 수 + 기물 6칸과 보드 칸 + 장착 버튼
function SetEquipView({ owned, boardSkin, pieceSkin, onEquipSet }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {bookSets().slice().reverse().map((set) => {
        const rar = rarOf(set.rarity), types = ownedPieceTypes(owned, set.id), any = types.length > 0, eq = pieceSkin === set.id && (any || set.id === "classic");
        return (
          <div key={set.id} style={{ ...PANEL, position: "relative", overflow: "hidden", padding: "12px 12px 12px 16px", borderColor: eq ? T.brassHi + "AA" : "rgba(236,203,134,.16)" }}>
            <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: rar.color }} />
            <span aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 90% at 0% 0%, " + rar.color + "26, transparent 70%)", pointerEvents: "none" }} />
            <div className="flex items-center" style={{ gap: 8, marginBottom: 10, position: "relative" }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: T.ivoryHi, fontFamily: SITE_FONT, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{set.label}</span>
              <RarityTag rarity={set.rarity} />
              <Count n={types.length} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, position: "relative" }}>
              {BOOK_PIECES.map((p) => <Tile key={p.type} set={set} type={p.type} owned={types.includes(p.type)} label={p.label()} />)}
              <BoardTile set={set} owned={ownsBoard(owned, set.id)} />
            </div>
            <div style={{ marginTop: 10, position: "relative" }}>
              {eq ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 10, border: "1px solid " + T.brassHi + "88", color: T.brassHi, fontSize: 12.5, fontWeight: 800 }}><Check size={14} />{t("장착중")}</div>
                : any ? <button onClick={() => onEquipSet(set.id)} className="press" style={{ width: "100%", padding: "9px 0", borderRadius: 10, border: "none", background: "linear-gradient(180deg,#F3D58B,#D9A93F)", color: "#241509", fontSize: 12.5, fontWeight: 900, cursor: "pointer", fontFamily: SITE_FONT }}>{t("세트 장착하기")}</button>
                : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 10, border: "1px dashed rgba(255,255,255,.14)", color: "#8B7550", fontSize: 12, fontWeight: 700 }}><Lock size={12} />{set.lockedLabel || t("뽑기로 획득")}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ② 기물 도감 — 기물 종류를 고르면 세트별 그 기물이 칸으로 놓인다
function PieceBookView({ owned, pieceSkin, onEquipSet }) {
  const [pi, setPi] = useState(0);
  const sets = bookSets().slice().reverse(), p = BOOK_PIECES[pi];
  const got = sets.filter((s) => ownsPiece(owned, s.id, p.type)).length;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 10 }}>
        {BOOK_PIECES.map((b, i) => (
          <button key={b.type} onClick={() => setPi(i)} aria-label={b.label()} title={b.label()} className="press"
            style={{ padding: "6px 0 5px", borderRadius: 11, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, border: "1px solid " + (i === pi ? T.brassHi : "rgba(255,255,255,.08)"), background: i === pi ? "rgba(236,203,134,.14)" : "rgba(0,0,0,.28)" }}>
            <span style={{ height: 32, display: "flex", alignItems: "flex-end", opacity: i === pi ? 1 : 0.6 }}><PieceGlyph type={b.type} color="w" size={30} pieceSkin="classic" /></span>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: i === pi ? T.brassHi : "#8B7550" }}>{b.label()}</span>
          </button>
        ))}
      </div>
      <motion.div key={p.type} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} style={{ ...PANEL, padding: 14 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: T.ivoryHi, fontFamily: SITE_FONT }}>{tx("{0} 스킨", p.label())}</span>
          <Count n={got} total={sets.length} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {sets.map((set) => {
            const o = ownsPiece(owned, set.id, p.type), eq = pieceSkin === set.id && o;
            return (
              <div key={set.id} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <Tile set={set} type={p.type} owned={o} equipped={eq} big label={set.label} onClick={o ? () => onEquipSet(set.id) : undefined} />
                <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: o ? T.ivory : "#6E5C40", lineHeight: 1.25, minHeight: 14 }}>{o ? set.label : "???"}</div>
                <div style={{ display: "flex", justifyContent: "center" }}><RarityTag rarity={set.rarity} size={8.5} /></div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

// ③ 세트 도감 — 세트별 기물 수집 수와 보드 해금 현황
function SetDexView({ owned }) {
  const sets = bookSets().slice().reverse();
  const full = sets.filter((s) => ownsBoard(owned, s.id)).length;
  return (
    <div>
      <div style={{ ...PANEL, padding: 14, marginBottom: 10 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: T.brassHi, fontFamily: SITE_FONT }}>{t("세트 수집 현황")}</span>
          <Count n={full} total={sets.length} />
        </div>
        <div style={{ height: 6, borderRadius: 999, background: "rgba(0,0,0,.45)", overflow: "hidden" }}><div style={{ width: (100 * full / sets.length) + "%", height: "100%", background: "linear-gradient(90deg,#D9A93F,#F3D58B)" }} /></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sets.filter((s) => s.id !== "classic").map((set) => {
          const rar = rarOf(set.rarity), n = ownedPieceTypes(owned, set.id).length, board = ownsBoard(owned, set.id);
          return (
            <div key={set.id} style={{ ...PANEL, padding: 10, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 54, flexShrink: 0 }}><BoardTile set={set} owned={board} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center" style={{ gap: 8, marginBottom: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: T.ivoryHi, fontFamily: SITE_FONT, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{set.label}</span>
                  <RarityTag rarity={set.rarity} size={9} />
                </div>
                <div style={{ display: "flex", gap: 3 }}>
                  {BOOK_PIECES.map((b, i) => <span key={b.type} style={{ flex: 1, height: 6, borderRadius: 3, background: i < n ? rar.color : "rgba(255,255,255,.1)" }} />)}
                </div>
              </div>
              <Count n={n} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SkinBook({ ownedSkins, boardSkin, pieceSkin, onEquipSet }) {
  const [tab, setTab] = useState("equip");
  const tabs = [["equip", t("세트 장착")], ["pieces", t("기물 도감")], ["sets", t("세트 도감")]];
  const props = { owned: ownedSkins || none, boardSkin, pieceSkin, onEquipSet };
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ position: "relative", display: "flex", padding: 3, marginBottom: 12, borderRadius: 12, background: "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,.08)" }}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="press" style={{ position: "relative", flex: 1, padding: "8px 4px", fontSize: 12.5, fontWeight: 800, border: "none", background: "transparent", color: tab === k ? "#241509" : "#9C8666", cursor: "pointer", fontFamily: SITE_FONT, zIndex: 1 }}>
            {tab === k && <motion.span layoutId="skinbook-tab" transition={{ type: "spring", stiffness: 420, damping: 34 }} style={{ position: "absolute", inset: 0, borderRadius: 9, background: "linear-gradient(180deg,#F3D58B,#D9A93F)", zIndex: -1 }} />}
            {label}
          </button>
        ))}
      </div>
      {tab === "equip" ? <SetEquipView {...props} /> : tab === "pieces" ? <PieceBookView {...props} /> : <SetDexView {...props} />}
    </div>
  );
}
