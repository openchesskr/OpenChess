import React, { useRef, useState, useLayoutEffect, useEffect } from "react";

// KW는 이 컴포넌트뿐 아니라 App.jsx의 학습 콘텐츠 편집기(키워드 칩 선택 UI)에서도 함께 쓰여 여기서
// export하고 App.jsx가 다시 import해서 쓴다(SITE_FONT/QLABEL과 같은 패턴).
export const KW = {
  "NORMAL": { bg: "#E3EDD9", fg: "#3F5B33", desc: "가장 일반적으로 두어지는 수" },
  "TOP LEVEL": { bg: "#F3E6C2", fg: "#7A5A14", desc: "마스터가 압도적으로 선택" },
  "LOW-LEVEL": { bg: "#E6E0D6", fg: "#6B6052", desc: "낮은 레벨에서 주로 보이는 수" },
  "TRICKY": { bg: "#E8D8C4", fg: "#7A4E22", desc: "함정을 노리는 까다로운 수" },
  "INTUITIVE": { bg: "#DCE8EC", fg: "#3C5A63", desc: "의도가 직관적으로 보이는 수" },
  "DRAWING-WEAPON": { bg: "#E2E2E2", fg: "#555", desc: "무승부를 노리는 수단" },
  "ANTI-": { bg: "#EAD7D7", fg: "#8A3A3A", desc: "특정 시스템에 대한 대응(안티) 수" },
  "SWITCH": { bg: "#DCE0EA", fg: "#43507A", desc: "다른 구조·플랜으로 전환하는 수" },
  // 상보쌍 (대비색, 상호 배타)
  "MAIN-LINE": { bg: "#CDE8C9", fg: "#1E6B2C", desc: "정석 메인 라인" },
  "SIDESTEPPING": { bg: "#E0DAEC", fg: "#574A78", desc: "잘 알려지지 않은 사이드라인" },
  "BALANCE": { bg: "#D3E4F2", fg: "#235C86", desc: "균형 잡힌 포지션" },
  "IMBALANCE": { bg: "#F5DEC9", fg: "#9A5418", desc: "불균형(비대칭) 포지션" },
  "SHARP": { bg: "#F4D2D2", fg: "#A8322F", desc: "날카롭고 전술적인 수" },
  "QUIET": { bg: "#D2ECE6", fg: "#1F6E63", desc: "조용하고 포지셔널한 수" },
  "STRAIGHT-LINE": { bg: "#E6E2D8", fg: "#5C564A", desc: "이후가 단순·강제적인 수" },
  "FLEXIBLE": { bg: "#F3E8C6", fg: "#8A6A18", desc: "여러 플랜을 남겨두는 유연한 수" },
  "OPEN": { bg: "#FBE3CE", fg: "#A85A1E", desc: "개방적인 포지션을 지향" },
  "CLOSED": { bg: "#D7DEE8", fg: "#3E4C66", desc: "폐쇄적인 포지션을 지향" },
};
// (사용자 요청) 수 블록의 키워드 칩들을 두 줄 이상으로 줄바꿈하는 대신 한 줄에 담고, 다 안 들어가면
// 가로 스크롤이 되도록 하되(줄바꿈 없음) 잘려 있다는 걸 알 수 있게 자동으로 천천히 오른쪽으로
// 스크롤됐다가 끝에 닿으면 처음으로 돌아가길 반복한다 — 학습 탭 전체(집중 분석 모드 포함)에서
// 키워드가 표시되는 자리에 공용으로 쓴다.
export function KeywordScroll({ kws, chipStyle }) {
  const ref = useRef(null);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    check();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [kws.join(",")]);
  useEffect(() => {
    const el = ref.current;
    if (!el || !overflow) return;
    let stopped = false, resumeTimer = null;
    const id = setInterval(() => {
      if (stopped) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      if (el.scrollLeft >= max - 0.5) {
        stopped = true;
        resumeTimer = setTimeout(() => { el.scrollLeft = 0; stopped = false; }, 1400);
        return;
      }
      el.scrollLeft += 0.6;
    }, 30);
    return () => { clearInterval(id); if (resumeTimer) clearTimeout(resumeTimer); };
  }, [overflow, kws.join(",")]);
  if (!kws.length) return null;
  return (
    <div ref={ref} className="hide-scrollbar" style={{ display: "flex", flexWrap: "nowrap", gap: 4, overflowX: "hidden" }}>
      {kws.map((k) => KW[k] && <span key={k} title={KW[k].desc} style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, letterSpacing: ".04em", padding: "2px 6px", borderRadius: 4, background: KW[k].bg, color: KW[k].fg, whiteSpace: "nowrap", ...chipStyle }}>{k}</span>)}
    </div>
  );
}
