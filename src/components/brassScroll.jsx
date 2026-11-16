// (v0.7.8, 사용자 요청) 분석 탭 다음 수 블록 창(analysis.jsx MoveTileWindow)의 스크롤바 디자인을 공용으로 — 가는 황동색 스크롤바 + 아래에 더 있을 때
//  창 밑 가운데에 뜨는 짧은 황동 막대(끝까지 내리면 사라짐). 사이트 전체는 기본 스크롤바를 숨기므로(index.css) 이 영역만 스타일로 다시 켠다.
//  성장 분석·최근 대국 열(growthHome.jsx)이 같은 디자인을 쓴다.
import { useEffect, useRef, useState } from "react";

export const BRASS_SCROLLBAR = { scrollbarWidth: "thin", scrollbarColor: "rgba(236,203,134,.45) transparent" };
const BRASS_SCROLL_CSS = ".oc-brass-scroll::-webkit-scrollbar{display:block;width:6px}.oc-brass-scroll::-webkit-scrollbar-thumb{background:rgba(236,203,134,.45);border-radius:3px}.oc-brass-scroll::-webkit-scrollbar-track{background:transparent}";
export function BrassScrollStyle() { return <style>{BRASS_SCROLL_CSS}</style>; }

/* 아래에 더 있음 표시 — 창 밑 가운데의 짧은 황동 막대 */
export function MoreBelowHint({ show, bottom = -11 }) {
  return show ? <div aria-hidden style={{ position: "absolute", left: "50%", bottom, transform: "translateX(-50%)", width: 44, height: 4, borderRadius: 2, pointerEvents: "none", background: "rgba(236,203,134,.45)" }} /> : null;
}

/* 세로 스크롤 영역 — style은 스크롤 칸(높이·여백), outerStyle은 바깥 틀. 내용이 넘칠 때 아래에 더 있으면 MoreBelowHint를 띄운다. */
export function BrassScrollArea({ children, style, outerStyle, className = "" }) {
  const ref = useRef(null);
  const [atEnd, setAtEnd] = useState(true);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const check = () => setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
    check();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    if (ro) { ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild); }
    return () => { if (ro) ro.disconnect(); };
  }, []);
  return (
    <div style={{ position: "relative", minHeight: 0, minWidth: 0, ...outerStyle }}>
      <BrassScrollStyle />
      <div ref={ref} className={("oc-brass-scroll " + className).trim()} onScroll={(e) => { const el = e.currentTarget; setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2); }}
        style={{ height: "100%", overflowY: "auto", overscrollBehavior: "contain", ...BRASS_SCROLLBAR, ...style }}>
        <div>{children}</div>
      </div>
      <MoreBelowHint show={!atEnd} bottom={-9} />
    </div>
  );
}
