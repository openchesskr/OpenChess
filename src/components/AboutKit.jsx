import React from "react";
import { ScrambleText, MONO } from "./OpenTextArt.jsx";

// /about 디자인 키트 — OPEN 텍스트 아트 섹션에서 정한 시각 언어를 페이지 전체에 쓰기 위한 부품.
//  · 모서리를 비스듬히 자른 패널(CutPanel) · 평행사변형 라벨/버튼 · 모노스페이스 `// 라벨` · 블록 문자 구분선 · 호버 글리치
// 색은 AboutPage의 T와 같은 값이다(이 페이지는 App.jsx의 모듈을 가져오지 않는 독립된 정적 페이지라 옮겨 적는다).
export const K = { ebony: "#1B1009", ebony2: "#2E1B10", panel: "#3A2516", deep: "#20140B", ivory: "#EBDDC4", ivoryHi: "#FAF2E2", soft: "#B8A78C", brass: "#C49A50", brassHi: "#ECCB86", line: "rgba(196,154,80,.28)" };

export const cut = (n = 14) => "polygon(0 0, calc(100% - " + n + "px) 0, 100% " + n + "px, 100% 100%, " + n + "px 100%, 0 calc(100% - " + n + "px))";
export const para = (n = 10) => "polygon(" + n + "px 0, 100% 0, calc(100% - " + n + "px) 100%, 0 100%)";
export const octagon = (n = 10) => "polygon(" + n + "px 0, calc(100% - " + n + "px) 0, 100% " + n + "px, 100% calc(100% - " + n + "px), calc(100% - " + n + "px) 100%, " + n + "px 100%, 0 calc(100% - " + n + "px), 0 " + n + "px)";

// 호버하면 한 번 떨리는 글리치, 스캔라인 등 공용 CSS. AboutPage의 <style>에 한 번 넣는다.
export const KIT_CSS = `
@keyframes ab-jit{0%{transform:translate(0,0)}15%{transform:translate(-3px,1px) skewX(-5deg)}30%{transform:translate(3px,-1px) skewX(4deg)}45%{transform:translate(-2px,0)}60%{transform:translate(2px,1px) skewX(-3deg)}100%{transform:translate(0,0)}}
@keyframes ab-blink{50%{opacity:0}}
@keyframes ab-rail{from{background-position:0 0}to{background-position:0 12px}}
.ab-glitch{transition:filter .2s}
.ab-glitch:hover{animation:ab-jit .34s steps(2) 1;filter:drop-shadow(-2px 0 rgba(217,115,106,.55)) drop-shadow(2px 0 rgba(111,168,220,.5))}
.ab-caret{animation:ab-blink 1s steps(1) infinite}
`;

// `// LABEL` 형태의 모노스페이스 라벨.
export function Sys({ children, color = K.brass, style }) {
  return <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: ".18em", color, ...style }}>{children}</span>;
}

// 평행사변형 라벨 — 카테고리·상태 표시.
export function Tag({ children, color = K.brassHi, solid, style }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, clipPath: para(7), padding: "3px 14px", fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: ".1em", fontStyle: "italic",
      background: solid ? "linear-gradient(180deg," + K.brassHi + "," + K.brass + ")" : color + "22", color: solid ? "#241509" : color, ...style }}>{children}</span>
  );
}

// 모서리를 자른 패널. 바깥 레이어가 가는 테두리색, 안쪽이 본체. accent를 주면 테두리가 그 색으로 빛난다.
export function CutPanel({ children, cutSize = 14, accent, style, bodyStyle, className }) {
  const edge = accent ? "linear-gradient(135deg," + accent + "," + accent + "55 55%," + accent + "AA)" : "linear-gradient(135deg,rgba(236,203,134,.55),rgba(196,154,80,.18) 50%,rgba(196,154,80,.4))";
  return (
    <div className={className} style={{ position: "relative", clipPath: cut(cutSize), background: edge, minWidth: 0, ...style }}>
      <div style={{ margin: 1.5, clipPath: cut(cutSize), height: "calc(100% - 3px)", background: "linear-gradient(160deg,rgba(58,37,22,.96),rgba(27,16,9,.98))", ...bodyStyle }}>{children}</div>
    </div>
  );
}

// 코너 브래킷(┌ ┐ └ ┘) 장식 — 패널 위에 absolute로 얹는다.
export function Brackets({ color = K.brass, size = 9, inset = 6 }) {
  const b = "1.5px solid " + color;
  const base = { position: "absolute", width: size, height: size, opacity: 0.7, pointerEvents: "none" };
  return (
    <>
      <span aria-hidden="true" style={{ ...base, left: inset, top: inset, borderLeft: b, borderTop: b }} />
      <span aria-hidden="true" style={{ ...base, right: inset + 12, top: inset, borderRight: b, borderTop: b }} />
      <span aria-hidden="true" style={{ ...base, left: inset + 12, bottom: inset, borderLeft: b, borderBottom: b }} />
      <span aria-hidden="true" style={{ ...base, right: inset, bottom: inset, borderRight: b, borderBottom: b }} />
    </>
  );
}

// 블록 문자 구분선: ░▒▓█ LABEL █▓▒░ — 화면에 들어올 때마다 라벨이 풀려 나온다.
export function AsciiRule({ label = "OPENCHESS", style }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 12, margin: "60px 0", fontFamily: MONO, color: K.brass, opacity: 0.85, overflow: "hidden", ...style }}>
      <span style={{ flex: 1, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", fontSize: 11, letterSpacing: ".05em", opacity: 0.55 }}>{"─".repeat(60)}░▒▓█</span>
      <span style={{ fontSize: 11, fontWeight: 800, fontStyle: "italic", letterSpacing: ".3em", whiteSpace: "nowrap" }}>◆ <ScrambleText text={label} /> ◆</span>
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", fontSize: 11, letterSpacing: ".05em", opacity: 0.55 }}>{"█▓▒░"}{"─".repeat(60)}</span>
    </div>
  );
}
