import React, { useEffect, useRef, useState } from "react";
import { ScrambleText, MONO, useScramble } from "./OpenTextArt.jsx";
import { isLite } from "../lib/perfMode.js";
import { FacetDiamond, FacetPawn, FacetRook, FacetBishop, FacetCrown, FacetShield, facetRamp, GOLD } from "./facetIcons.jsx";

// /about 디자인 키트 — OPEN 텍스트 아트 섹션에서 정한 시각 언어를 페이지 전체에 쓰기 위한 부품.
//  · 모서리를 비스듬히 자른 패널(CutPanel) · 평행사변형 라벨/버튼 · 모노스페이스 라벨 · 블록 문자 구분선 · 호버 글리치
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
@keyframes ab-burst{0%,90%,100%{transform:none;text-shadow:none;filter:none}91%{transform:translate(-3px,0) skewX(-5deg);text-shadow:-3px 0 rgba(217,115,106,.75),3px 0 rgba(111,168,220,.65)}93%{transform:translate(4px,1px) skewX(4deg);text-shadow:3px 0 rgba(217,115,106,.7),-3px 0 rgba(111,168,220,.6)}95%{transform:translate(-2px,-1px);text-shadow:-2px 0 rgba(217,115,106,.6),2px 0 rgba(111,168,220,.5);filter:brightness(1.25)}97%{transform:translate(2px,0) skewX(-3deg);text-shadow:2px 0 rgba(217,115,106,.5),-2px 0 rgba(111,168,220,.4)}}
.ab-burst{animation:ab-burst 7s steps(1,end) infinite;display:inline-block}
.ab-burst-b{animation:ab-burst 8.5s steps(1,end) infinite}
@keyframes ab-flicker{0%,100%{opacity:1}6%{opacity:.35}8%{opacity:1}52%{opacity:.8}54%{opacity:.3}56%{opacity:1}}
.ab-flicker{animation:ab-flicker 5.5s steps(1,end) infinite}
@keyframes ab-sweep{from{transform:translateY(-120%)}to{transform:translateY(420%)}}
.ab-sweep{position:absolute;left:0;right:0;top:0;height:22%;pointer-events:none;background:linear-gradient(180deg,transparent,rgba(236,203,134,.16) 50%,transparent);animation:ab-sweep 5.2s linear infinite}
@keyframes ab-drift{from{transform:translateY(105vh)}to{transform:translateY(-12vh)}}
@keyframes ab-dglitch{0%,86%,100%{transform:none;opacity:1}87%{transform:translateX(-7px) skewX(-16deg);opacity:.35}89%{transform:translateX(6px) skewX(12deg) scaleY(.82);opacity:1}91%{transform:translateX(-2px) scaleX(1.3);opacity:.12}93%{transform:translateX(4px);opacity:.9}95%{transform:none;opacity:1}}
.ab-dglitch{animation:ab-dglitch 6s steps(1,end) infinite}
@keyframes ab-dglitch-t{0%,84%,100%{transform:none;opacity:1;text-shadow:none}85%{transform:translateX(-5px) skewX(-12deg);opacity:.5;text-shadow:-3px 0 rgba(217,115,106,.9),3px 0 rgba(111,168,220,.9)}88%{transform:translateX(4px);opacity:1;text-shadow:3px 0 rgba(217,115,106,.9),-3px 0 rgba(111,168,220,.9)}90%{transform:none;opacity:.15;text-shadow:none}92%{opacity:1}}
.ab-dglitch-t{animation:ab-dglitch-t 7s steps(1,end) infinite}
@keyframes ab-dspin{to{transform:rotate(360deg)}}
.ab-dspin{animation:ab-dspin 18s linear infinite}
@keyframes ab-tear{0%,90%,100%{opacity:0;transform:translateY(20vh) scaleX(.4)}91%{opacity:1;transform:translateY(20vh) scaleX(1)}92%{opacity:.6;transform:translateY(58vh) scaleX(.8)}93%{opacity:1;transform:translateY(36vh) scaleX(1.1)}94%{opacity:0;transform:translateY(80vh)}}
.ab-tear{position:fixed;left:0;right:0;top:0;height:3px;z-index:1;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(217,115,106,.35) 25%,rgba(236,203,134,.45) 55%,transparent);animation:ab-tear 9s steps(1,end) infinite}
.ab-drift{position:fixed;bottom:0;font-family:ui-monospace,monospace;font-weight:700;color:#C49A50;opacity:.07;pointer-events:none;white-space:pre;line-height:1.1;animation:ab-drift linear infinite}
.ab-sheen{position:relative;overflow:hidden}
.ab-sheen::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);transform:skewX(-18deg);pointer-events:none}
.ab-sheen:hover::after{left:130%;transition:left .55s ease}
.ab-grain{position:fixed;inset:0;pointer-events:none;z-index:3;opacity:.035}
.ab-vignette{position:fixed;inset:0;pointer-events:none;z-index:3;background:radial-gradient(120% 90% at 50% 40%,transparent 55%,rgba(0,0,0,.45))}
@keyframes ab-progress-head{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes ab-breathe{0%,100%{transform:scale(1);filter:brightness(1)}50%{transform:scale(1.035);filter:brightness(1.14)}}
.ab-breathe{animation:ab-breathe 3.6s ease-in-out infinite}
@keyframes ab-spin{to{transform:rotate(360deg)}}
@keyframes ab-spin-rev{to{transform:rotate(-360deg)}}
@keyframes ab-vscan{0%{top:-45%}100%{top:105%}}
.ab-vscan{position:absolute;right:-1px;top:-45%;width:2px;height:45%;background:linear-gradient(180deg,transparent,#ECCB86,transparent);animation:ab-vscan 3.6s ease-in-out infinite;pointer-events:none}
@keyframes ab-bracket{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:1;transform:scale(1.25)}}
.ab-bracket{animation:ab-bracket 2.8s ease-in-out infinite}
@keyframes ab-textglow{0%,100%{text-shadow:none}50%{text-shadow:0 0 14px rgba(236,203,134,.45)}}
.ab-textglow{text-shadow:0 0 12px rgba(236,203,134,.3)}
.ab-burst-glow{display:inline-block;animation:ab-burst 7s steps(1,end) infinite,ab-textglow 4s ease-in-out infinite}
@keyframes ab-float{0%{transform:translateY(0) rotate(-7deg)}100%{transform:translateY(-12px) rotate(7deg)}}
.ab-float{position:absolute;font-family:ui-monospace,monospace;font-weight:900;color:#C49A50;opacity:.22;pointer-events:none;animation:ab-float 5s ease-in-out infinite alternate}
@keyframes ab-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
.ab-bob{animation:ab-bob 3.4s ease-in-out infinite}
@keyframes ab-eq{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}
.ab-eq{display:inline-block;width:3px;height:12px;background:#C49A50;transform-origin:bottom;animation:ab-eq 1.1s ease-in-out infinite}
@keyframes ab-wave{0%,55%,100%{filter:drop-shadow(0 0 0 rgba(236,203,134,0)) brightness(1)}28%{filter:drop-shadow(0 0 11px rgba(236,203,134,.85)) brightness(1.22)}}
.ab-wave{animation:ab-wave 4.2s ease-in-out infinite}
@keyframes ab-diamond{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-16px) rotate(18deg)}}
.ab-diamond{animation:ab-diamond 9s ease-in-out infinite}
@keyframes ab-shimmer{from{background-position:0 0}to{background-position:-200% 0}}
.ab-shimmer{background-size:200% 100% !important;animation:ab-shimmer 2.8s linear infinite}
@keyframes ab-glint{0%,62%{left:-60%}100%{left:130%}}
.ab-glint{position:relative;overflow:hidden}
.ab-glint::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.5),transparent);transform:skewX(-18deg);pointer-events:none;animation:ab-glint 5.5s ease-in-out infinite}
.ab-spin{position:absolute;inset:-45%;animation:ab-spin 6s linear infinite}
.ab-lift{transition:transform .25s cubic-bezier(.22,.9,.32,1)}
.ab-lift:hover{transform:translateY(-4px) scale(1.015) !important}
.ab-input{transition:box-shadow .25s,border-color .25s}
.ab-input:focus{box-shadow:0 0 0 2px rgba(236,203,134,.35),0 0 18px rgba(236,203,134,.25) !important;border-color:#ECCB86 !important}
`;

// `// LABEL` 형태의 모노스페이스 라벨.
export function Sys({ children, color = K.brass, style }) {
  return <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: ".18em", color, ...style }}>{children}</span>;
}

// 평행사변형 라벨 — 카테고리·상태 표시.
export function Tag({ children, color = K.brassHi, solid, style }) {
  return (
    <span className={solid ? "ab-glint" : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 5, clipPath: para(7), padding: "3px 14px", fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: ".1em", fontStyle: "italic",
      background: solid ? "linear-gradient(180deg," + K.brassHi + "," + K.brass + ")" : color + "22", color: solid ? "#241509" : color, ...style }}>{children}</span>
  );
}

// 모서리를 자른 패널. 바깥 레이어가 가는 테두리색, 안쪽이 본체. accent를 주면 테두리가 그 색으로 빛난다.
// bodyStyle에 값이 undefined인 키(예: background: open ? … : undefined)가 있으면 spread가 기본값을 지워 버려 테두리 그러데이션이 비쳐 보였다 — undefined 키는 버린다.
const definedOnly = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined));
export function CutPanel({ children, cutSize = 14, accent, style, bodyStyle, className, tilt = false, chase = false, chaseDelay = 0 }) {
  // 마우스 스포트라이트 — 이벤트마다 스타일을 쓰지 않고 프레임당 한 번만 갱신한다. 가벼운 모드에서는 쓰지 않는다.
  const onMove = (e) => {
    if (isLite()) return;
    const el = e.currentTarget, x = e.clientX, y = e.clientY;
    if (el.__raf) return;
    el.__raf = requestAnimationFrame(() => {
      el.__raf = 0; const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", (x - r.left) + "px"); el.style.setProperty("--my", (y - r.top) + "px"); el.style.setProperty("--spot", "1");
      if (tilt) { el.style.setProperty("--rx", ((0.5 - (y - r.top) / r.height) * 7).toFixed(2) + "deg"); el.style.setProperty("--ry", (((x - r.left) / r.width - 0.5) * 9).toFixed(2) + "deg"); }
    });
  };
  const onLeave = (e) => { e.currentTarget.style.setProperty("--spot", "0"); e.currentTarget.style.setProperty("--rx", "0deg"); e.currentTarget.style.setProperty("--ry", "0deg"); };
  const edge = accent ? "linear-gradient(135deg," + accent + "," + accent + "55 55%," + accent + "AA)" : "linear-gradient(135deg,rgba(236,203,134,.55),rgba(196,154,80,.18) 50%,rgba(196,154,80,.4))";
  return (
    <div className={className} onMouseMove={onMove} onMouseLeave={onLeave} style={{ position: "relative", clipPath: cut(cutSize), background: edge, minWidth: 0, ...(tilt ? { transform: "perspective(800px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))", transition: "transform .18s ease-out" } : null), ...style }}>
      {chase && <span aria-hidden="true" className="ab-spin" style={{ background: "conic-gradient(from 0deg, transparent 0 62%, " + (accent || K.brassHi) + " 82%, transparent 100%)", opacity: 0.95, animationDelay: chaseDelay + "s" }} />}
      <div style={{ margin: 1.5, clipPath: cut(cutSize), height: "calc(100% - 3px)", background: "linear-gradient(160deg,rgba(58,37,22,.96),rgba(27,16,9,.98))", position: "relative", ...definedOnly(bodyStyle) }}>
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, opacity: "var(--spot, 0)", transition: "opacity .25s", background: "radial-gradient(200px circle at var(--mx, 50%) var(--my, 50%), rgba(236,203,134,.2), transparent 70%)" }} />
        {children}
      </div>
    </div>
  );
}

// 코너 브래킷(┌ ┐ └ ┘) 장식 — 패널 위에 absolute로 얹는다.
export function Brackets({ color = K.brass, size = 9, inset = 6, pulse = false, delay = 0 }) {
  const b = "1.5px solid " + color;
  const base = { position: "absolute", width: size, height: size, opacity: 0.7, pointerEvents: "none" };
  const cls = pulse ? "ab-bracket" : undefined;
  return (
    <>
      <span aria-hidden="true" className={cls} style={{ ...base, animationDelay: delay + "s", left: inset, top: inset, borderLeft: b, borderTop: b }} />
      <span aria-hidden="true" className={cls} style={{ ...base, animationDelay: delay + "s", right: inset + 12, top: inset, borderRight: b, borderTop: b }} />
      <span aria-hidden="true" className={cls} style={{ ...base, animationDelay: delay + "s", left: inset + 12, bottom: inset, borderLeft: b, borderBottom: b }} />
      <span aria-hidden="true" className={cls} style={{ ...base, animationDelay: delay + "s", right: inset, bottom: inset, borderRight: b, borderBottom: b }} />
    </>
  );
}

// 블록 문자 구분선: ░▒▓█ LABEL █▓▒░ — 화면에 들어올 때마다 라벨이 풀려 나온다.
export function AsciiRule({ label = "OPENCHESS", style }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 12, margin: "60px 0", fontFamily: MONO, color: K.brass, opacity: 0.85, overflow: "hidden", ...style }}>
      <span style={{ flex: 1, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", fontSize: 11, letterSpacing: ".05em", opacity: 0.55 }}>{"─".repeat(60)}░▒▓█</span>
      <span style={{ fontSize: 11, fontWeight: 800, fontStyle: "italic", letterSpacing: ".3em", whiteSpace: "nowrap" }}>◆ <ScrambleText text={label} loopMs={8000} /> ◆</span>
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", fontSize: 11, letterSpacing: ".05em", opacity: 0.55 }}>{"█▓▒░"}{"─".repeat(60)}</span>
    </div>
  );
}

// 상단 상태 줄 — 엔진·오프닝·퍼즐·코치가 "준비됨"을 알리듯 문구가 노이즈에서 풀려 나오며 순환한다.
// (v0.7.8, 사용자 요청) OpenChess의 네 글자 O·P·E·N — 히어로의 O·P·E·N 카드와 같은 순서
const STATUS = ["OBSERVE YOUR MOVES", "PRACTICE YOUR SKILLS", "EVALUATE YOUR GAMES", "NEXT LEVEL IN YOUR DREAMS"];
export function StatusTicker({ style }) {
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(() => setI((v) => (v + 1) % STATUS.length), 2800); return () => clearInterval(id); }, []);
  const txt = useScramble(STATUS[i], true, 22);
  return (
    <div aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: ".16em", color: K.brass, marginBottom: 12, ...style }}>
      <span className="ab-caret" style={{ width: 7, height: 7, borderRadius: "50%", background: "#8FB55E", boxShadow: "0 0 8px #8FB55E" }} />
      <span style={{ minWidth: 250, whiteSpace: "nowrap" }}>{txt}</span>
      <EqBars />
    </div>
  );
}
// 배경에 천천히 떠오르는 텍스트 아트 기둥(체스 기물·0/1·블록 문자)과 필름 그레인·비네트.
const DRIFT = [["♜\n0\n1\n▒\n♞\n░\n1\n♝", 6, 14, 70, -10], ["░\n♛\n1\n0\n▓\n♚\n0", 17, 11, 95, -40], ["1\n♟\n▒\n0\n♝\n░\n1\n♜\n0", 31, 13, 80, -25], ["0\n♞\n░\n1\n♛\n▓", 48, 12, 110, -60], ["♚\n1\n▒\n♟\n0\n░\n♜", 63, 15, 75, -5], ["▓\n0\n♝\n1\n░\n♞\n0\n1", 78, 11, 100, -50], ["1\n♜\n░\n0\n♛\n▒\n♟", 91, 13, 85, -30]];
const GRAIN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";
export function AmbientLayer({ rich = false }) {
  const more = rich && !isLite();
  return (
    <>
      {DRIFT.map(([txt, left, size, dur, delay], i) => <span key={i} aria-hidden="true" className="ab-drift" style={{ left: left + "%", fontSize: size, animationDuration: dur + "s", animationDelay: delay + "s" }}><span className={more ? "ab-dglitch-t" : undefined} style={more ? { display: "block", animationDuration: (5 + (i % 4) * 1.7) + "s", animationDelay: -(i * 1.3) + "s" } : undefined}>{txt}</span></span>)}
      {more && <RichDrift />}
      <div aria-hidden="true" className="ab-grain" style={{ backgroundImage: GRAIN }} />
      <div aria-hidden="true" className="ab-vignette" />
    </>
  );
}
// (v0.7.8, 사용자 요청) /about 배경 — 떠오르는 요소를 늘리고 모양을 다양하게(텍스트 기둥 + 파셋 기물·보석·방패), 가끔 글리치(어긋남·깜빡임)와 화면을 가로지르는 찢김 띠.
//  움직임은 transform·opacity만 쓴다(컴포지터 처리). 가벼운 모드에서는 그리지 않는다.
const DRIFT2 = [["♞\n▓\n0\n1\n░\n♟", 3, 12, 88, -15], ["0\n1\n1\n0\n▒\n♛\n░", 12, 10, 104, -70], ["♝\n░\n1\n♜\n0", 24, 12, 92, -45], ["▒\n0\n♚\n1\n▓\n0\n♞", 39, 11, 118, -85], ["1\n0\n♟\n░\n♝", 55, 13, 96, -20], ["♛\n▓\n1\n0\n░\n♜\n1", 71, 10, 112, -95], ["░\n♟\n0\n▒\n1", 85, 12, 90, -55], ["0\n♜\n1\n▓\n♞\n0", 97, 11, 108, -35]];
// [모양, 왼쪽 %, 크기 px, 떠오르는 시간 s, 시작 지연 s, 투명도]
const PARTICLES = [
  ["diamond", 5, 26, 70, -5, 0.16], ["pawn", 15, 34, 95, -40, 0.12], ["hex", 22, 30, 82, -62, 0.13], ["rook", 33, 38, 110, -20, 0.1], ["shard", 44, 22, 66, -33, 0.16],
  ["crown", 52, 36, 100, -75, 0.11], ["diamond", 60, 18, 58, -12, 0.18], ["bishop", 67, 36, 104, -50, 0.11], ["shield", 76, 30, 90, -8, 0.12], ["hex", 83, 24, 76, -44, 0.14],
  ["pawn", 92, 28, 86, -66, 0.12], ["shard", 9, 18, 62, -28, 0.15], ["diamond", 28, 32, 92, -88, 0.12], ["crown", 47, 24, 72, -3, 0.13], ["rook", 88, 26, 80, -36, 0.12],
  ["bishop", 18, 24, 74, -58, 0.13], ["diamond", 72, 40, 120, -100, 0.1], ["shield", 37, 22, 68, -47, 0.14], ["hex", 57, 20, 64, -25, 0.15], ["shard", 95, 28, 84, -70, 0.13],
];
const BRASS_R = facetRamp("#C49A50");
function DriftShape({ kind, size }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} style={{ display: "block", overflow: "visible" }}>
      {kind === "diamond" && <FacetDiamond cx={20} cy={20} r={16} R={GOLD} />}
      {kind === "pawn" && <FacetPawn x={20} y={20} s={30} R={BRASS_R} />}
      {kind === "rook" && <FacetRook x={20} y={20} s={30} R={BRASS_R} />}
      {kind === "bishop" && <FacetBishop x={20} y={20} s={30} R={GOLD} />}
      {kind === "crown" && <FacetCrown x={20} y={18} s={30} R={GOLD} />}
      {kind === "shield" && <FacetShield cx={20} cy={20} w={26} h={30} R={BRASS_R} />}
      {kind === "shard" && <g><path d="M20 3 L31 21 L20 37Z" fill={GOLD.l3} /><path d="M20 3 L9 19 L20 37Z" fill={GOLD.l1} /><path d="M20 3 L13 13 L17 15Z" fill={GOLD.hi} /></g>}
      {kind === "hex" && <g><path d="M20 3 L35 11.5 L20 20Z" fill={BRASS_R.l2} /><path d="M35 11.5 L35 28.5 L20 20Z" fill={BRASS_R.l3} /><path d="M35 28.5 L20 37 L20 20Z" fill={BRASS_R.base} /><path d="M20 37 L5 28.5 L20 20Z" fill={BRASS_R.l4} /><path d="M5 28.5 L5 11.5 L20 20Z" fill={BRASS_R.l1} /><path d="M5 11.5 L20 3 L20 20Z" fill={BRASS_R.l1} /><path d="M9 12 L16 8 L13 14Z" fill={BRASS_R.hi} /></g>}
    </svg>
  );
}
function RichDrift() {
  return (
    <>
      {DRIFT2.map(([txt, left, size, dur, delay], i) => <span key={"t" + i} aria-hidden="true" className="ab-drift" style={{ left: left + "%", fontSize: size, animationDuration: dur + "s", animationDelay: delay + "s" }}><span className="ab-dglitch-t" style={{ display: "block", animationDuration: (6.5 + (i % 3) * 2.1) + "s", animationDelay: -(i * 1.9) + "s" }}>{txt}</span></span>)}
      {PARTICLES.map(([kind, left, size, dur, delay, op], i) => (
        <span key={"p" + i} aria-hidden="true" className="ab-drift" style={{ left: left + "%", opacity: op, animationDuration: dur + "s", animationDelay: delay + "s" }}>
          <span className="ab-dglitch" style={{ display: "block", animationDuration: (4.5 + (i % 5) * 1.6) + "s", animationDelay: -(i * 2.3) + "s" }}>
            <span className="ab-dspin" style={{ display: "block", animationDuration: (14 + (i % 4) * 6) + "s", animationDirection: i % 2 ? "reverse" : "normal" }}><DriftShape kind={kind} size={size} /></span>
          </span>
        </span>
      ))}
      <div aria-hidden="true" className="ab-tear" style={{ animationDuration: "9s" }} />
      <div aria-hidden="true" className="ab-tear" style={{ animationDuration: "13s", animationDelay: "-5s", height: 2, background: "linear-gradient(90deg,transparent,rgba(111,168,220,.35) 30%,rgba(236,203,134,.4) 60%,transparent)" }} />
    </>
  );
}

// 페이지 맨 아래 — (v0.7.8, 사용자 요청) 외곽선 글자 "OPENCHESS" 대신 같은 크기의 OpenChess 로고, 그 아래는 "OpenChess"만.
export function FooterMark({ note = "OpenChess" }) {
  return (
    <div style={{ textAlign: "center", padding: "44px 0 8px", userSelect: "none" }}>
      <img className="ab-flicker" src="/OpenChessLogo.png" alt="OpenChess" draggable={false} style={{ display: "block", margin: "0 auto", height: "clamp(40px, 11vw, 104px)", width: "auto", maxWidth: "100%", filter: "drop-shadow(0 6px 14px rgba(0,0,0,.5))" }} />
      <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: ".2em", color: K.soft, opacity: 0.8 }}>{note}</div>
    </div>
  );
}

// 보이는 동안만 n개 중 하나씩 자동으로 넘어가는 인덱스(데모 자동 재생용). 가벼운 모드에서는 멈춘다. ref를 데모 바깥 요소에 달아 쓴다.
export function useAutoCycle(n, ms) {
  const ref = useRef(null); const [i, setI] = useState(0); const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || typeof IntersectionObserver === "undefined") { setOn(true); return undefined; }
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { threshold: 0.25 }); io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => { if (!on || isLite()) return undefined; const id = setInterval(() => setI((v) => (v + 1) % n), ms); return () => clearInterval(id); }, [on, n, ms]);
  return [i, ref];
}
// 둥둥 떠다니는 체스 기물 글자(챕터 머리말 모서리 장식).
export function FloatGlyph({ ch, style, delay = 0 }) {
  return <span aria-hidden="true" className="ab-float" style={{ fontSize: 34, animationDelay: delay + "s", ...style }}>{ch}</span>;
}
// 이퀄라이저 막대 — "작동 중" 느낌의 상태 장식.
export function EqBars({ n = 4, style }) {
  return <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 12, ...style }}>{Array.from({ length: n }, (_, i) => <span key={i} className="ab-eq" style={{ animationDelay: (i * 0.17) + "s", animationDuration: (0.9 + (i % 3) * 0.25) + "s" }} />)}</span>;
}
