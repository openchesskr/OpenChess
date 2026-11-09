// (v0.7.4, 사용자 요청) 집중 분석 모드 전용 스크롤바 — 브라우저 기본 스크롤바(사이트 전체에서 숨겨 둠) 대신 이 사이트의 황동 톤으로 직접 디자인한 스크롤바.
//  · 오른쪽 가장자리에 가는 홈(track)과 황동 손잡이(thumb, 가운데 마름모 무늬). 넘치는 내용이 있을 때만 나타나고, 쉬는 동안은 옅어졌다가 스크롤·올림·끄는 동안 또렷해진다.
//  · 손잡이를 끌거나 홈을 눌러 이동, 키보드·휠·터치는 안쪽 스크롤 칸이 그대로 처리한다. style은 바깥 틀(위치·크기), contentStyle은 안쪽 스크롤 칸에 준다.
import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";

export default function CustomScroll({ children, style, contentStyle, className, enabled = true, scrollRef }) {
  const wrapRef = useRef(null), inRef = useRef(null), drag = useRef(null);
  const [m, setM] = useState({ show: false, top: 0, h: 0 });
  const [awake, setAwake] = useState(false), [hot, setHot] = useState(false);
  const wakeTimer = useRef(0);
  const measure = useCallback(() => {
    const el = inRef.current; if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) { setM((p) => (p.show ? { show: false, top: 0, h: 0 } : p)); return; }
    const track = clientHeight - 12, h = Math.max(40, Math.round(track * clientHeight / scrollHeight));
    const top = Math.round((track - h) * (scrollTop / (scrollHeight - clientHeight))) + 6;
    setM((p) => (p.show && p.top === top && p.h === h ? p : { show: true, top, h }));
  }, []);
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    measure();
    const el = inRef.current; if (!el) return undefined;
    let ro = null;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(measure); ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild); }
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(measure) : null;
    if (mo) mo.observe(el, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    return () => { if (ro) ro.disconnect(); if (mo) mo.disconnect(); window.removeEventListener("resize", measure); };
  }, [enabled, measure]);
  useEffect(() => () => clearTimeout(wakeTimer.current), []);
  if (!enabled) return <div style={style} className={className}><div ref={scrollRef} style={contentStyle}>{children}</div></div>;
  const wake = () => { setAwake(true); clearTimeout(wakeTimer.current); wakeTimer.current = setTimeout(() => setAwake(false), 1100); };
  const onScroll = () => { measure(); wake(); };
  const setRefs = (el) => { inRef.current = el; if (scrollRef) { if (typeof scrollRef === "function") scrollRef(el); else scrollRef.current = el; } };
  const onThumbDown = (e) => {
    e.preventDefault(); e.stopPropagation();
    const el = inRef.current; if (!el) return;
    drag.current = { y: e.clientY, st: el.scrollTop };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 지원 안 하는 환경 */ }
    setHot(true);
  };
  const onThumbMove = (e) => {
    const d = drag.current, el = inRef.current; if (!d || !el) return;
    const track = el.clientHeight - 12, range = el.scrollHeight - el.clientHeight, h = m.h;
    el.scrollTop = d.st + ((e.clientY - d.y) / Math.max(1, track - h)) * range;
  };
  const onThumbUp = () => { drag.current = null; setHot(false); };
  const onTrackDown = (e) => {
    const el = inRef.current, w = wrapRef.current; if (!el || !w) return;
    const r = w.getBoundingClientRect(), frac = (e.clientY - r.top - 6) / Math.max(1, r.height - 12);
    el.scrollTo({ top: frac * (el.scrollHeight - el.clientHeight) - el.clientHeight / 2 + (el.clientHeight * el.clientHeight) / el.scrollHeight / 2, behavior: "smooth" });
  };
  const on = awake || hot;
  return (
    <div ref={wrapRef} style={{ position: "relative", ...style }} className={className} onPointerEnter={() => setHot(true)} onPointerLeave={() => { if (!drag.current) setHot(false); }}>
      <div ref={setRefs} onScroll={onScroll} style={{ height: "100%", overflowY: "auto", overscrollBehavior: "contain", ...contentStyle }}>{children}</div>
      {m.show && (
        <div aria-hidden="true" onPointerDown={onTrackDown} style={{ position: "absolute", top: 0, right: 3, bottom: 0, width: 14, zIndex: 20, cursor: "pointer", touchAction: "none" }}>
          <span style={{ position: "absolute", top: 6, bottom: 6, right: 4, width: on ? 8 : 4, borderRadius: 6, background: "rgba(10,6,3,.55)", border: "1px solid rgba(196,154,80," + (on ? ".45" : ".18") + ")", transition: "width .18s ease, border-color .2s", boxShadow: "inset 0 0 6px rgba(0,0,0,.6)" }} />
          <span onPointerDown={onThumbDown} onPointerMove={onThumbMove} onPointerUp={onThumbUp} onPointerCancel={onThumbUp}
            style={{ position: "absolute", right: on ? 3 : 4, top: m.top, width: on ? 10 : 6, height: m.h, borderRadius: 6, cursor: "grab", touchAction: "none", opacity: on ? 1 : 0.55, transition: "width .18s ease, right .18s ease, opacity .25s",
              background: "linear-gradient(90deg,#8A6C2F,#ECCB86 45%,#B88F40)", boxShadow: on ? "0 0 10px rgba(236,203,134,.45), inset 0 0 0 1px rgba(255,255,255,.25)" : "inset 0 0 0 1px rgba(255,255,255,.18)" }}>
            <span style={{ position: "absolute", left: "50%", top: "50%", width: 4, height: 4, marginLeft: -2, marginTop: -2, transform: "rotate(45deg)", background: "#3A2510", opacity: on ? 0.85 : 0, transition: "opacity .2s" }} />
          </span>
        </div>
      )}
    </div>
  );
}
