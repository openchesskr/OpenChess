// (v0.7.9, 사용자 요청) 도감 "마스터" 상세 카드(챔피언·도전자·FIDE 랭커·DB 마스터·대회)를 한 체계로 그리는 부품.
//  예전 카드는 "작은 갈색 제목 + 문장 한 줄"이 끝없이 이어져 무엇이 핵심인지 한눈에 보이지 않았다. 지금은 모든 카드가 같은 뼈대를 쓴다.
//   ① CardHero  — 어두운 머리띠: 왼쪽 엠블럼(종류별 파셋 그림) · 이름 · 요약 칩 · 국기 · 닫기. 스크롤해도 위에 붙어 있다.
//   ② StatGrid  — 핵심 수치를 2열 타일로(재위·기간·개최지·레이팅 등). 긴 값은 두 칸을 차지한다(span: 2).
//   ③ Section   — 왼쪽 위 파셋 마름모 표식 + 제목 + 가는 구분선. 모든 목록·그래프는 섹션 안에 들어간다.
//   ④ TimeRow   — 연도(기간) 알약 + 내용. 타이틀전·우승 기록·출전 기록처럼 시간 순서 목록에 쓴다.
//  아이콘 규칙(CLAUDE.md): 엠블럼은 파셋 기물(pieceIcons)·OpenChess 아이콘(ocIcons)·파셋 부품(facetIcons)만 쓴다.
import React from "react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "./engineLines.jsx";
import { t } from "../lib/i18n.js";
import { X, Trophy, Swords, Medal } from "./ocIcons.jsx";
import { FacetPieceShape } from "./pieceIcons.jsx";
import { FacetDiamond, GOLD, facetRamp } from "./facetIcons.jsx";

const TILE = facetRamp("#4A2E18");
/** 종류별 엠블럼 — 어두운 파셋 마름모 타일 위에 금빛 그림. kind: champ·sat·fide·dbm·tour */
export function CardEmblem({ kind, size = 42, rank }) {
  const s = size;
  const facet = (
    <svg viewBox="0 0 40 40" width={s} height={s} aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
      <path d="M20 1 L39 20 L20 20Z" fill={TILE.l3} /><path d="M20 1 L1 20 L20 20Z" fill={TILE.l1} />
      <path d="M1 20 L20 39 L20 20Z" fill={TILE.l2} /><path d="M39 20 L20 39 L20 20Z" fill={TILE.base} />
      <path d="M20 4 L5 19 L7 19 L20 6Z" fill={GOLD.l2} opacity=".55" />
    </svg>
  );
  const piece = (type) => (
    <svg viewBox="0 0 24 24" width={s * 0.58} height={s * 0.58} aria-hidden="true" style={{ position: "relative" }}><FacetPieceShape type={type} R={GOLD} /></svg>
  );
  const inner = kind === "champ" ? piece("K") : kind === "dbm" ? piece("N") : kind === "sat" ? <Swords size={s * 0.46} color={GOLD.l1} style={{ position: "relative" }} />
    : kind === "tour" ? <Trophy size={s * 0.46} color={GOLD.l1} style={{ position: "relative" }} />
      : rank ? <span style={{ position: "relative", fontFamily: "Georgia,serif", fontWeight: 900, fontSize: s * (String(rank).length > 2 ? 0.3 : 0.38), color: GOLD.l1, fontVariantNumeric: "lining-nums" }}>{rank}</span>
        : <Medal size={s * 0.46} color={GOLD.l1} style={{ position: "relative" }} />;
  return <span style={{ position: "relative", width: s, height: s, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{facet}{inner}</span>;
}

/** 카드 머리띠. title은 글자나 노드(MasterNameLink), chips는 요약 문구 배열, right는 국기 칩 등. */
export function CardHero({ kind, rank, title, eyebrow, chips = [], right, onClose }) {
  return (
    <div style={{ position: "sticky", top: -14, zIndex: 2, margin: "-14px -14px 12px", padding: "12px 12px 11px 12px", background: "linear-gradient(160deg," + T.ebony3 + "," + T.ebony + ")", borderRadius: "14px 14px 0 0", borderBottom: "2px solid " + T.brass }}>
      <div className="flex items-center gap-2">
        <CardEmblem kind={kind} rank={rank} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: T.brassHi, textTransform: "uppercase", fontFamily: SITE_FONT }}>{eyebrow}</div>}
          <div className="dex-card-title" style={{ fontSize: 16.5, fontWeight: 800, color: T.ivoryHi, lineHeight: 1.2, overflowWrap: "anywhere" }}>{title}</div>
        </div>
        <div className="flex items-center gap-1" style={{ flexShrink: 0, alignSelf: "flex-start" }}>
          {right}
          <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,.08)", color: T.ivory, border: "1px solid rgba(236,203,134,.35)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={13} /></button>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1" style={{ marginTop: 8 }}>
          {chips.map((c, i) => <span key={i} style={{ fontSize: 10.5, fontWeight: 700, color: i ? T.ivory : T.ebony, background: i ? "rgba(236,203,134,.14)" : "linear-gradient(180deg," + T.brassHi + "," + T.brass + ")", border: "1px solid rgba(236,203,134,.4)", borderRadius: 999, padding: "2px 8px", fontFamily: SITE_FONT, whiteSpace: "nowrap" }}>{c}</span>)}
        </div>
      )}
    </div>
  );
}

/** 핵심 수치 타일 — items: [{ label, value, span?, sub? }] */
export function StatGrid({ items }) {
  const list = items.filter((x) => x && x.value != null && x.value !== "");
  if (!list.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
      {list.map((x, i) => (
        <div key={i} style={{ gridColumn: x.span === 2 ? "span 2" : undefined, background: "#FFFBF2", border: "1px solid #E4D5B6", borderRadius: 10, padding: "7px 9px", minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, color: T.inkSoft, fontFamily: SITE_FONT, letterSpacing: 0.2 }}>{x.label}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, fontFamily: SITE_FONT, lineHeight: 1.3, marginTop: 1, overflowWrap: "anywhere", fontVariantNumeric: "lining-nums tabular-nums" }}>{x.value}</div>
          {x.sub && <div style={{ fontSize: 10, color: T.inkSoft, fontFamily: SITE_FONT, marginTop: 1 }}>{x.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/** 섹션 — 파셋 마름모 표식 + 제목 + 구분선. aside는 제목 오른쪽 작은 글자(개수 등). */
export function Section({ title, aside, children, first }) {
  return (
    <section style={{ marginTop: first ? 0 : 14 }}>
      <div className="flex items-center gap-1" style={{ marginBottom: 6 }}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ flexShrink: 0 }}><FacetDiamond cx={5} cy={5} r={4.6} R={GOLD} gem={false} /></svg>
        <span style={{ fontSize: 11.5, fontWeight: 900, color: T.ink, fontFamily: SITE_FONT, whiteSpace: "nowrap" }}>{title}</span>
        <span style={{ flex: 1, height: 1, background: "linear-gradient(90deg,#D9C59C,transparent)", marginLeft: 4 }} />
        {aside != null && <span style={{ fontSize: 10, fontWeight: 700, color: T.inkSoft, fontFamily: SITE_FONT, whiteSpace: "nowrap" }}>{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** 연도 알약 + 내용 한 줄. tone: "win"(초록)·"lose"(빨강)·"draw"(회갈색)·없음 */
const TONE = { win: T.best, lose: "#B5483E", draw: "#8A7A66" };
export function TimeRow({ when, children, tone, badge }) {
  return (
    <div className="flex items-start gap-2" style={{ padding: "4px 0", borderBottom: "1px dashed #E6D8BC" }}>
      <span style={{ flexShrink: 0, minWidth: 44, textAlign: "center", fontSize: 10.5, fontWeight: 800, color: "#fff", background: tone ? TONE[tone] : T.ink, borderRadius: 6, padding: "2px 6px", fontFamily: SITE_FONT, fontVariantNumeric: "lining-nums tabular-nums", whiteSpace: "nowrap" }}>{when}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: T.ink, lineHeight: 1.45, fontFamily: SITE_FONT }}>{children}</span>
      {badge}
    </div>
  );
}
/** "2024, 7.5–6.5, Ding Liren" → ["2024", "7.5–6.5, Ding Liren"]. 연도로 시작하지 않으면 [null, 원문]. */
export const splitWhen = (line) => { const m = /^(\d{4}(?:[.\d]*(?:[–-]\d{0,4}[.\d]*)?)?),\s*(.*)$/.exec(String(line)); return m ? [m[1], m[2]] : [null, String(line)]; };

/** 칩 목록(첫 수·응수·출전 선수처럼 짧은 항목 여러 개) — items: [{ main, sub }] */
export function ChipList({ items }) {
  return (
    <div className="flex flex-wrap" style={{ gap: 5 }}>
      {items.map((x, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "baseline", gap: 4, background: "#FFFBF2", border: "1px solid #E4D5B6", borderRadius: 8, padding: "3px 7px", fontFamily: SITE_FONT, whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
          <b style={{ fontSize: 12, color: T.ink }}>{x.main}</b>{x.sub && <span style={{ fontSize: 10.5, color: T.inkSoft, fontWeight: 600 }}>{x.sub}</span>}
        </span>
      ))}
    </div>
  );
}
