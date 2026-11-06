import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { isLite } from "../lib/perfMode.js";

// (v0.7.3) 사이트 전체에 쓰는 공용 모션 묶음. 원칙은 /about과 같다:
//  · 기기의 "애니메이션 줄이기" 설정은 보지 않는다(check-reduced-motion) — 성능 모드(isLite)만 본다.
//  · 한 번 재생되는 짧은 연출은 가벼운 모드에서도 유지하고, 끝없이 도는 효과·큰 이동은 줄인다.
//  · transform·filter를 일부러 쓰지 않는다 — 조상에 걸리면 position:fixed 자손의 기준이 바뀐다(opacity만 사용).

export const OC_EASE = [0.22, 0.9, 0.32, 1];

/** 탭이 바뀔 때 본문(<main>)을 부드럽게 나타낸다. opacity만 써서 안쪽 fixed 요소 위치를 건드리지 않는다. */
export function useTabFade(ref, tabKey) {
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    const a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: isLite() ? 140 : 280, easing: "cubic-bezier(.22,.9,.32,1)" });
    return () => { try { a.cancel(); } catch { } };
  }, [tabKey, ref]);
}

/** 숫자가 바뀌면 이전 값에서 새 값으로 세어 올라간다. 가벼운 모드·첫 렌더는 즉시 표시. */
export function CountUp({ value, duration = 700, format }) {
  const target = Number.isFinite(value) ? value : 0;
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (isLite() || fromRef.current === target) { fromRef.current = target; setShown(target); return; }
    const from = fromRef.current, t0 = performance.now();
    let raf = 0;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * e;
      fromRef.current = v;
      setShown(p >= 1 ? target : v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  const n = Math.round(shown);
  return <>{format ? format(n) : n.toLocaleString()}</>;
}

/** 불러오는 중 자리표시자 — 빛이 한 번 훑고 지나가는 블록(index.css .oc-skel). */
export function Skeleton({ width = "100%", height = 14, radius = 8, style, className = "" }) {
  return <div aria-hidden="true" className={"oc-skel " + className} style={{ width, height, borderRadius: radius, ...style }} />;
}

/** 스크롤을 내리면 오른쪽 아래(하단 탭 위)에 나타나는 맨 위로 버튼. */
export function ScrollTopButton({ label = "Top", threshold = 720 }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setShow(window.scrollY > threshold)); };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => { window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, [threshold]);
  return (
    <AnimatePresence>
      {show && (
        <motion.button key="oc-top" type="button" aria-label={label}
          initial={{ opacity: 0, y: 14, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14, scale: 0.8 }}
          transition={{ duration: 0.22, ease: OC_EASE }}
          onClick={() => window.scrollTo({ top: 0, behavior: isLite() ? "auto" : "smooth" })}
          className="press oc-top-btn"
          style={{ position: "fixed", right: 14, bottom: "calc(80px + env(safe-area-inset-bottom, 0px))", zIndex: 39, width: 40, height: 40, borderRadius: 12, border: "1px solid #C49A50", background: "linear-gradient(180deg,#3A2516,#241509)", color: "#ECCB86", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 6px 18px -4px rgba(0,0,0,.6)" }}>
          <ChevronUp size={20} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/** 공개 정적 페이지(/privacy·/terms 등)용 스크롤 진입 연출 — /about의 Reveal과 같은 곡선. */
export function RevealOnce({ children, delay = 0, y = 14, style }) {
  return (
    <motion.div initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, delay, ease: OC_EASE }} style={style}>
      {children}
    </motion.div>
  );
}

/** "불러오는 중…" 글자 대신 쓰는 자리표시자 — 줄 모양 스켈레톤 여러 줄. 스크린리더에는 label을 읽어 준다. */
export function LoadingRows({ lines = 3, label, gap = 8, height = 14, style }) {
  const widths = ["100%", "82%", "64%", "90%", "72%"];
  return (
    <div role="status" aria-busy="true" aria-label={label} style={{ display: "flex", flexDirection: "column", gap, padding: "6px 2px", ...style }}>
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} width={widths[i % widths.length]} height={height} />)}
    </div>
  );
}
