import React from "react";
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "./ocIcons.jsx";   // (v0.7.5) OpenChess 파셋 아이콘(예전 lucide 대체)
import { T } from "../lib/theme.js";
import { SITE_FONT } from "./engineLines.jsx";

import { t } from "../lib/i18n.js";
// (v0.6.5) 금색 검색 버튼 — "대국 보기"(보드로 열기). 학습 탭 내 대국 목록에서 쓰던 버튼과 같은 모양을 공용으로 뽑았다. 옆에 BestMoveJumpButton(연두색 별 = 리뷰)을 나란히 둔다.
export function GameViewButton({ onClick, disabled, title = t("대국 보기"), size = 30 }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title} className="press"
      style={{ flexShrink: 0, width: size, height: size, borderRadius: 8, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", border: "none", cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: disabled ? 0.5 : 1 }}>
      <Search size={Math.round(size * 0.43)} />
    </button>
  );
}
// (v0.7.6, 사용자 요청) 연두색 리뷰 버튼의 별은 파셋 아이콘 규칙의 예외 — chess.com 리뷰 버튼을 벤치마킹한 예전(v0.6.5) 모양 그대로,
// 모서리가 둥근 단색 별(채움 + 같은 색 둥근 이음 테두리)로 그린다. CLAUDE.md 아이콘 규칙 9번 예외, scripts/check-facet-icons.mjs가 이 모양을 지킨다.
const REVIEW_STAR_PATH = "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";
function ReviewStar({ size, color }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}><path d={REVIEW_STAR_PATH} fill={color} stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}
export function BestMoveJumpButton({ onClick, disabled, title = t("이 대국 분석 모드로 바로 보기"), size = 30 }) {
  const dotSize = Math.round(size * 0.6), starSize = Math.round(size * 0.367);
  return (
    <button onClick={onClick} disabled={disabled} title={title} className="press"
      style={{ flexShrink: 0, width: size, height: size, borderRadius: 8, background: disabled ? "#9CC98A" : "#6EBF4A", border: "none", cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: disabled ? 0.6 : 1 }}>
      <span style={{ width: dotSize, height: dotSize, borderRadius: "50%", background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <ReviewStar size={starSize} color="#6EBF4A" />
      </span>
    </button>
  );
}
// (버그 보충) 마스터 대국·내 대국 목록에 공용으로 쓰는 작은 페이지 넘김 버튼 — 이모티콘 피커의
// 좌우 화살표 버튼과 같은 크기감으로 통일.
// (v0.2.2 UI#6#9) jump 페이지(기본 5페이지=최근 대국 25판)씩 건너뛰는 «/» 버튼을 </>(한 칸 이동)
// 양옆에 더한다 — 페이지 수가 jump보다 많을 때만 노출한다.
export function ListPager({ page, setPage, pageCount, jump = 5 }) {
  if (pageCount <= 1) return null;
  const showJump = pageCount > jump;
  const pbtn = (dis) => ({ width: 24, height: 24, borderRadius: 7, border: "1px solid #C9B58C", background: "#fff", color: dis ? "#D8C9A8" : T.inkSoft, cursor: dis ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" });
  return (
    <div className="flex items-center justify-center gap-2" style={{ marginTop: 8 }}>
      {showJump && <button onClick={() => setPage((p) => Math.max(0, p - jump))} disabled={page === 0} aria-label={t("{0}페이지 이전", (jump))} title={t("{0}페이지 이전", (jump))} className="press" style={pbtn(page === 0)}><ChevronsLeft size={13} /></button>}
      <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label={t("이전 페이지")} className="press" style={pbtn(page === 0)}><ChevronLeft size={13} /></button>
      <span style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, fontFamily: SITE_FONT }}>{page + 1} / {pageCount}</span>
      <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} aria-label={t("다음 페이지")} className="press" style={pbtn(page >= pageCount - 1)}><ChevronRight size={13} /></button>
      {showJump && <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + jump))} disabled={page >= pageCount - 1} aria-label={t("{0}페이지 다음", (jump))} title={t("{0}페이지 다음", (jump))} className="press" style={pbtn(page >= pageCount - 1)}><ChevronsRight size={13} /></button>}
    </div>
  );
}
export function NavBtn({ children, onClick, disabled, active, size = 40, label }) {
  return <button onClick={onClick} disabled={disabled} aria-label={label} title={label} aria-pressed={active == null ? undefined : !!active} className="press" style={{ width: size, height: size, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: active ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "linear-gradient(180deg,#3A2516,#241509)", color: disabled ? "#6A5A45" : T.ivoryHi, border: "1px solid #000", boxShadow: disabled ? "none" : "0 3px 0 #000", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1 }}>{children}</button>;
}
