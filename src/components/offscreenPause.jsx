// (v0.7.7 렉 수정) 화면 밖에 있는 영역의 애니메이션·타이머를 멈춘다.
//  · 감싼 영역이 뷰포트 밖이거나(IntersectionObserver), 브라우저 탭이 숨겨졌거나, 부모가 visible={false}로 알려 주면(모바일 옆 페이지) "꺼짐".
//  · 꺼지면 CSS 클래스 oc-paused(src/index.css)가 안쪽의 모든 CSS 애니메이션을 멈추고, useOnScreen()을 읽는 컴포넌트는 setInterval 같은 JS 반복을 멈춘다.
//  · 엔진 분석 같은 실제 작업은 멈추지 않는다 — 장식(반복 재생 데모 보드·글자 순환·빛 효과)만 멈춘다.
import { createContext, useContext, useEffect, useRef, useState } from "react";

const OnScreenContext = createContext(true);
/** 지금 이 영역이 사용자 눈에 보이는지(감싼 OffscreenPause 기준, 없으면 늘 true). */
export function useOnScreen() { return useContext(OnScreenContext); }

function useDocVisible() {
  const [v, setV] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const on = () => setV(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return v;
}

export function OffscreenPause({ children, visible = true, className, style, as: Tag = "div", ...rest }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(true);
  const docVisible = useDocVisible();
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver((es) => { const e = es[es.length - 1]; if (e) setInView(e.isIntersecting); }, { rootMargin: "0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const on = visible && inView && docVisible;
  return (
    <OnScreenContext.Provider value={on}>
      <Tag ref={ref} className={((className || "") + (on ? "" : " oc-paused")).trim() || undefined} style={style} {...rest}>{children}</Tag>
    </OnScreenContext.Provider>
  );
}
