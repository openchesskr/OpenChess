// (v0.7.4, 사용자 요청) 집중 분석 모드 전용 스크롤 영역.
// (v0.8.1, 사용자 요청) 스크롤바 디자인을 분석 탭 다음 수 블록 창(analysis.jsx MoveTileWindow)과 통일 — 예전의 직접 그린 홈·황동 손잡이(가운데 마름모) 대신
//  같은 가는 황동색 스크롤바(oc-brass-scroll) + 아래에 더 있을 때 창 밑 가운데에 뜨는 짧은 황동 막대(MoreBelowHint)를 쓴다(components/brassScroll.jsx).
//  style은 바깥 틀(위치·크기), contentStyle은 안쪽 스크롤 칸에 준다. hintBottom: 더 있음 막대의 위치(화면 전체를 덮는 창은 안쪽으로).
import React, { useRef, useState, useLayoutEffect, useCallback } from "react";
import { BRASS_SCROLLBAR, BrassScrollStyle, MoreBelowHint } from "./brassScroll.jsx";

export default function CustomScroll({ children, style, contentStyle, className, enabled = true, scrollRef, hintBottom = -9 }) {
  const inRef = useRef(null);
  const [atEnd, setAtEnd] = useState(true);
  const check = useCallback(() => {
    const el = inRef.current; if (!el) return;
    const end = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    setAtEnd((p) => (p === end ? p : end));
  }, []);
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    check();
    const el = inRef.current; if (!el) return undefined;
    let ro = null;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(check); ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild); }
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(check) : null;
    if (mo) mo.observe(el, { childList: true, subtree: true });
    return () => { if (ro) ro.disconnect(); if (mo) mo.disconnect(); };
  }, [enabled, check]);
  if (!enabled) return <div style={style} className={className}><div ref={scrollRef} style={contentStyle}>{children}</div></div>;
  const setRefs = (el) => { inRef.current = el; if (scrollRef) { if (typeof scrollRef === "function") scrollRef(el); else scrollRef.current = el; } };
  return (
    <div style={{ position: "relative", ...style }} className={className}>
      <BrassScrollStyle />
      <div ref={setRefs} onScroll={check} className="oc-brass-scroll" style={{ height: "100%", overflowY: "auto", overscrollBehavior: "contain", ...BRASS_SCROLLBAR, ...contentStyle }}>{children}</div>
      <MoreBelowHint show={!atEnd} bottom={hintBottom} />
    </div>
  );
}
