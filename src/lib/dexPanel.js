// (v0.6.3) 도감 모식도(오프닝·마스터) 뷰포트 높이 — 박스 위쪽 요소를 뺀 남은 화면 높이에 맞춘다(하단 고정 내비게이션 66px + 여백).
// 박스 자신의 top은 자기 높이와 무관(그 위 형제 요소 높이로만 결정)하므로 되먹임 없이 한 번에 계산된다.
// 데스크톱은 마우스 조작이라 하단 여백을 모바일(16px)보다 좁게(4px) 둔다.
import { useLayoutEffect, useState } from "react";
export const DEX_NAV_H = 66;
export function dexPanelHeight(innerHeight, boxTop, vertical) {
  return Math.max(360, Math.round(innerHeight - boxTop - (DEX_NAV_H + (vertical ? 16 : 4))));
}
export function useFitPanelHeight(boxRef, vertical, initial = 640) {
  const [panelH, setPanelH] = useState(initial);
  useLayoutEffect(() => {
    const compute = () => { const el = boxRef.current; if (!el) return; setPanelH(dexPanelHeight(window.innerHeight, el.getBoundingClientRect().top, vertical)); };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [vertical]); // eslint-disable-line react-hooks/exhaustive-deps
  return panelH;
}
