import React from "react";
import { Star, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "./engineLines.jsx";

export function BestMoveJumpButton({ onClick, disabled, title = "이 대국 분석 모드로 바로 보기", size = 30 }) {
  const dotSize = Math.round(size * 0.6), starSize = Math.round(size * 0.367);
  return (
    <button onClick={onClick} disabled={disabled} title={title} className="press"
      style={{ flexShrink: 0, width: size, height: size, borderRadius: 8, background: disabled ? "#9CC98A" : "#6EBF4A", border: "none", cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: disabled ? 0.6 : 1 }}>
      <span style={{ width: dotSize, height: dotSize, borderRadius: "50%", background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Star size={starSize} fill="#6EBF4A" color="#6EBF4A" />
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
      {showJump && <button onClick={() => setPage((p) => Math.max(0, p - jump))} disabled={page === 0} aria-label={jump + "페이지 이전"} title={jump + "페이지 이전"} className="press" style={pbtn(page === 0)}><ChevronsLeft size={13} /></button>}
      <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="이전 페이지" className="press" style={pbtn(page === 0)}><ChevronLeft size={13} /></button>
      <span style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, fontFamily: SITE_FONT }}>{page + 1} / {pageCount}</span>
      <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} aria-label="다음 페이지" className="press" style={pbtn(page >= pageCount - 1)}><ChevronRight size={13} /></button>
      {showJump && <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + jump))} disabled={page >= pageCount - 1} aria-label={jump + "페이지 다음"} title={jump + "페이지 다음"} className="press" style={pbtn(page >= pageCount - 1)}><ChevronsRight size={13} /></button>}
    </div>
  );
}
export function NavBtn({ children, onClick, disabled, active }) {
  return <button onClick={onClick} disabled={disabled} className="press" style={{ width: 40, height: 40, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: active ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "linear-gradient(180deg,#3A2516,#241509)", color: disabled ? "#6A5A45" : T.ivoryHi, border: "1px solid #000", boxShadow: disabled ? "none" : "0 3px 0 #000", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1 }}>{children}</button>;
}
