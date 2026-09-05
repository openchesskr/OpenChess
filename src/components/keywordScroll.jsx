import React, { useRef, useState, useLayoutEffect, useEffect } from "react";
import { createPortal } from "react-dom";

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
// (사용자 요청) 수 키워드 칩(NORMAL/TOP LEVEL 등)을 누르면 그 뜻(KW[k].desc)을 보여주는 말풍선 —
// 예전엔 브라우저 기본 title 호버 툴팁뿐이라 모바일에서는 사실상 볼 방법이 없었다.
// (버그 수정, 사용자 재제보) 한때 앵커 위치와 무관하게 항상 뷰포트 정중앙에 띄웠는데, 그러면 지금
// 어느 키워드를 눌러 연 말풍선인지 시각적으로 알기 어려웠다 — 수 체계 설명 말풍선(App.jsx의
// CircleBadge)과 같은 방식으로, 클릭한 칩 바로 위/아래에 그 칩을 향한 꼬리와 함께 뜨도록 바꾼다.
// position:fixed로 앵커의 실제 화면 좌표를 계산해 어떤 조상의 overflow와도 무관하게 항상 온전히
// 그려지고, 화면 가장자리에서는 안쪽으로 당겨지되 꼬리(tailX)는 그 보정과 무관하게 항상 실제 칩
// 중심을 가리킨다.
const KEYWORD_DESC_W = 220;
export function KeywordChip({ k, style }) {
  const info = KW[k];
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // { left, top, bottom, tailX, openDown }
  const anchorRef = useRef(null);
  const toggle = (e) => {
    e.stopPropagation();
    setOpen((v) => {
      const next = !v;
      if (next && anchorRef.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        const margin = 10;
        const cx = rect.left + rect.width / 2;
        const left = Math.max(margin, Math.min(cx - KEYWORD_DESC_W / 2, window.innerWidth - KEYWORD_DESC_W - margin));
        // 화면 위쪽 절반의 칩이면 말풍선을 아래로, 아래쪽 절반이면 위로 열어 항상 화면 중앙 쪽을
        // 향하게 한다(세로로 잘리지 않도록).
        const openDown = rect.top < window.innerHeight / 2;
        setPos({
          left,
          top: openDown ? rect.bottom + 9 : undefined,
          bottom: openDown ? undefined : window.innerHeight - rect.top + 9,
          tailX: cx - left,
          openDown,
        });
      }
      return next;
    });
  };
  useEffect(() => {
    if (!open) return;
    const onScroll = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);
  if (!info) return null;
  return (
    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <span ref={anchorRef} onClick={toggle} style={{ cursor: "pointer", fontSize: 9, fontWeight: 800, letterSpacing: ".04em", padding: "2px 6px", borderRadius: 4, background: info.bg, color: info.fg, whiteSpace: "nowrap", ...style }}>{k}</span>
      {open && pos && typeof document !== "undefined" && createPortal(
        <>
          <span onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
          <span style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: KEYWORD_DESC_W, maxWidth: "calc(100vw - 20px)", padding: "10px 13px", borderRadius: 10, background: "#F7F0DE", border: "1px solid " + info.fg, boxShadow: "0 12px 28px -6px rgba(0,0,0,.6)", zIndex: 9999, fontSize: 12, fontWeight: 700, color: "#2B2013", textAlign: "left" }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".04em", color: info.fg, marginBottom: 4 }}>{k}</div>
            {info.desc}
            {/* 말풍선 꼬리 — tailX(뷰포트 기준 팝업 left로부터 기준 칩 중심까지 거리)를 그대로 써서,
                팝업이 화면 가장자리에서 얼마나 밀렸든 항상 기준 칩을 가리킨다. */}
            <span style={{ position: "absolute", ...(pos.openDown ? { top: -7 } : { bottom: -7 }), left: pos.tailX, transform: "translateX(-50%) rotate(45deg)", width: 12, height: 12, background: "#F7F0DE", ...(pos.openDown ? { borderLeft: "1px solid " + info.fg, borderTop: "1px solid " + info.fg } : { borderRight: "1px solid " + info.fg, borderBottom: "1px solid " + info.fg }) }} />
          </span>
        </>,
        document.body
      )}
    </span>
  );
}
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
      {kws.map((k) => <KeywordChip key={k} k={k} style={chipStyle} />)}
    </div>
  );
}
