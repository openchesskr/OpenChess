// (v0.6.6, 사용자 요청) 마스터·대회 검색 결과 한 줄 — 도감 마스터 트리의 검색 드롭다운 디자인(종류 칩 + 국기·이름 + 아래 한 줄 정보).
//  마스터 트리·집중 분석 마스터 통계·마스터 스타일 검색이 같이 쓴다.
import { T } from "../lib/theme.js";
import { SITE_FONT } from "./engineLines.jsx";

/** 드롭다운 상자(양피지색). 결과가 많으면 안에서 스크롤. */
export const searchDropStyle = { position: "absolute", left: 0, right: 0, top: "100%", marginTop: 4, background: T.paper, border: "1px solid #DCCBA8", borderRadius: 9, overflow: "hidden", zIndex: 40, boxShadow: "0 8px 20px -6px rgba(0,0,0,.4)", maxHeight: 280, overflowY: "auto" };

/** 마스터·대회 결과의 안쪽 요소(종류 칩 + 국기·이름 + 아래 한 줄) — 드롭다운 줄과 통합 검색 블록이 같이 쓴다. */
export function MasterResultInner({ tag, tagLabel, flag, title, sub }) {
  const tour = tag === "tour";
  return (
    <>
      <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 999, color: tour ? "#1F6B1F" : "#8A6A2F", background: tour ? "rgba(60,138,60,.18)" : "rgba(196,154,80,.22)" }}>{tagLabel}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>{flag ? <span aria-hidden="true" style={{ fontSize: 13, lineHeight: 1 }}>{flag}</span> : null}<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span></span>
        {sub ? <span style={{ display: "block", fontSize: 10, color: T.inkSoft, fontFamily: SITE_FONT, fontWeight: 500, marginTop: 1, lineHeight: 1.35, wordBreak: "keep-all" }}>{sub}</span> : null}
      </span>
    </>
  );
}
export function SearchResultRow({ tag, tagLabel, flag, title, sub, active, onClick }) {
  return (
    <button onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="press"
      style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", padding: "7px 10px", background: active ? "rgba(196,154,80,.16)" : "transparent", border: "none", borderBottom: "1px solid rgba(196,154,80,.25)", cursor: "pointer", fontSize: 12, color: T.ink, fontWeight: 600 }}>
      <MasterResultInner tag={tag} tagLabel={tagLabel} flag={flag} title={title} sub={sub} />
    </button>
  );
}
// (v0.7.5, 사용자 요청) 통합 검색(app/social.jsx SearchModal)의 결과 블록 — 유저·오프닝·마스터·퍼즐·업적 모두 같은 바깥 블록(테두리·배경·모서리·여백)을 쓰고
//  안쪽 요소만 종류마다 원래 검색 화면의 모양을 그대로 쓴다. 유저 행(userSearchRow)의 바깥 모양이 기준이다.
export const SEARCH_BLOCK = { width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 10, padding: 9, borderRadius: 10, border: "1px solid #E4D5B6", background: "#FBF5E8", cursor: "pointer", textAlign: "left", fontSize: 12, color: T.ink, fontWeight: 600, fontFamily: "inherit" };
export function SearchBlock({ onClick, children, style, label }) {
  return <button onClick={onClick} aria-label={label} className="press" style={{ ...SEARCH_BLOCK, ...style }}>{children}</button>;
}
