// (v0.6.9) 직접 그린 기물 세트 — 이미지 파일 없이 SVG만으로 그리는 스톤턴풍 실루엣 6종(P·N·B·R·Q·K)에 세트별 재질(그라디언트·결·균열·네온)을 입힌다.
//  · 좌표계: viewBox 0 0 100 H(기물별 높이). 받침 폭은 x 22~78(56)로 모든 기물이 같고, 아래쪽(y=H)이 칸 바닥에 놓인다 — 기존 SVG·이미지 기물과 같은 규칙(PIECE_BASE_RATIO·PIECE_HEIGHT_FACTOR).
//  · 새 세트를 더하려면 DESIGN_STYLES에 재질 하나를 추가하고 theme.js의 PIECE_SKINS에 design 키로 연결한다(check-skins가 확인).
import React, { useId } from "react";

// 기물별 그림 높이(받침 폭 56 기준 × PIECE_HEIGHT_FACTOR) — theme.js의 PIECE_HEIGHT_FACTOR와 같아야 한다.
export const DESIGN_FACTOR = { P: 1.15, N: 1.30, B: 1.32, R: 1.23, Q: 1.45, K: 1.49 };
const hOf = (type) => DESIGN_FACTOR[type] * 56;

// 실루엣(채워지는 면)과 결선(분할선)을 따로 둔다. 모두 viewBox 0 0 100 H, H = hOf(type).
function shapes(type) {
  const H = hOf(type);
  const foot = (y0, w = 56) => `M${50 - w / 2} ${H} v-6 q0 -2 2 -2 h${w - 4} q2 0 2 2 v6 z`;
  const collar = (y, w) => `M${50 - w / 2} ${y} h${w} v4.5 h-${w} z`;
  switch (type) {
    case "P": return {
      body: [
        `M43 25 C43 38 33 44 30 ${H - 11} L70 ${H - 11} C67 44 57 38 57 25 Z`,
        collar(23, 22), `M26 ${H - 11} h48 v5.5 h-48 z`, foot(),
      ],
      round: [[50, 12.5, 10.5]],
      lines: [`M40 ${H - 17} Q50 ${H - 20} 60 ${H - 17}`],
    };
    case "R": return {
      body: [
        `M30 6 h9 v8 h6 v-8 h10 v8 h6 v-8 h9 v18 h-40 z`,
        `M33 24 h34 l-1 6 h-32 z`,
        `M37 30 L34.5 ${H - 14} h31 L63 30 z`,
        `M27 ${H - 14} h46 v6 h-46 z`, foot(),
      ],
      round: [],
      lines: [`M33 24 h34`, `M36 ${H - 24} h28`],
    };
    case "B": return {
      body: [
        `M50 6 C61 15 66 26 62 36 C60 40 56 42 56 42 L44 42 C44 42 40 40 38 36 C34 26 39 15 50 6 Z`,
        collar(41, 26), `M41 46 C41 56 35 60 32.5 ${H - 11} L67.5 ${H - 11} C65 60 59 56 59 46 Z`,
        `M26 ${H - 11} h48 v5.5 h-48 z`, foot(),
      ],
      round: [[50, 4.5, 4.3]],
      lines: [`M47 20 L55 29`, `M40 ${H - 17} Q50 ${H - 20} 60 ${H - 17}`],
    };
    case "N": return {
      body: [
        `M27 ${H - 11} C26 56 33 49 38 41 C40 37 36 36 31 39 C28 34 34 27 40 21 L40 10 L47 15 L52 8 L56 16 C69 21 76 36 74 48 C73 56 70 63 73 ${H - 11} Z`,
        `M24 ${H - 11} h52 v5.5 h-52 z`, foot(),
      ],
      round: [],
      lines: [`M55 24 C60 30 61 38 58 46`, `M44 16 L50 24`],
      eye: [54, 22.5],
    };
    case "Q": return {
      body: [
        `M27 20 L35 12 L38 30 L43 10 L50 28 L57 10 L62 30 L65 12 L73 20 L66 46 H34 Z`,
        collar(46, 36), `M39 50.5 C39 62 33 66 30.5 ${H - 11} L69.5 ${H - 11} C67 66 61 62 61 50.5 Z`,
        `M25 ${H - 11} h50 v5.5 h-50 z`, foot(),
      ],
      round: [[27, 17, 3.3], [38, 8.5, 3.3], [50, 5.5, 3.6], [62, 8.5, 3.3], [73, 17, 3.3]],
      lines: [`M34 46 h32`, `M41 ${H - 18} Q50 ${H - 21} 59 ${H - 18}`],
    };
    default: return {   // K
      body: [
        `M47 2 h6 v7 h7 v6 h-7 v6 h-6 v-6 h-7 v-6 h7 z`,
        `M36 46 C33 33 40 24 50 24 C60 24 67 33 64 46 Z`,
        collar(45.5, 34), `M39 50 C39 62 33 66 30.5 ${H - 11} L69.5 ${H - 11} C67 66 61 62 61 50 Z`,
        `M25 ${H - 11} h50 v5.5 h-50 z`, foot(),
      ],
      round: [],
      lines: [`M34 45.5 h32`, `M41 ${H - 18} Q50 ${H - 21} 59 ${H - 18}`],
    };
  }
}

// 세트별 재질. light=백 기물, dark=흑 기물. grad는 [위색, 아래색], stroke는 윤곽선, detail은 분할선·눈 색.
// extra(props) → 재질을 더하는 SVG 조각(결·균열·광택·네온 글로우 등). clipId 안에서 그려진다.
const DESIGN_STYLES = {
  wood: {   // 월넛 & 메이플
    light: { grad: ["#F6E2B5", "#CC9D5E"], stroke: "#7A5226", detail: "#8F6130" },
    dark: { grad: ["#7A5030", "#2E1A0D"], stroke: "#1B0E05", detail: "#B58A5A" },
    sw: 1.6,
    extra: (H, c) => (
      <g opacity={c === "w" ? 0.28 : 0.35} stroke={c === "w" ? "#7A4B1D" : "#F0C48A"} strokeWidth="0.6" fill="none">
        {[34, 40, 46, 50, 54, 60, 66].map((x, i) => <path key={i} d={`M${x} 0 C${x + (i % 2 ? 3 : -3)} ${H * 0.35} ${x + (i % 3 ? -4 : 4)} ${H * 0.7} ${x + (i % 2 ? 2 : -2)} ${H}`} />)}
      </g>
    ),
  },
  marble: {   // 대리석
    light: { grad: ["#FBFCFD", "#CBD2DB"], stroke: "#7C8794", detail: "#8B96A3" },
    dark: { grad: ["#4A4F58", "#14161B"], stroke: "#05060A", detail: "#9AA3B2" },
    sw: 1.5,
    extra: (H, c) => (
      <g fill="none" strokeLinecap="round" opacity={c === "w" ? 0.5 : 0.55} stroke={c === "w" ? "#6E7B8C" : "#E8ECF4"}>
        <path d={`M30 ${H * 0.2} C44 ${H * 0.3} 40 ${H * 0.45} 58 ${H * 0.52} S70 ${H * 0.75} 76 ${H * 0.8}`} strokeWidth="0.9" />
        <path d={`M62 ${H * 0.05} C54 ${H * 0.22} 60 ${H * 0.34} 46 ${H * 0.5}`} strokeWidth="0.6" />
        <path d={`M26 ${H * 0.62} C36 ${H * 0.66} 40 ${H * 0.58} 52 ${H * 0.7}`} strokeWidth="0.55" />
      </g>
    ),
  },
  neon: {   // 네온 사이버
    light: { grad: ["#0F2A3C", "#071521"], stroke: "#35F2FF", detail: "#8DF8FF", glow: "#18D8E8" },
    dark: { grad: ["#2B0F36", "#12061A"], stroke: "#FF4FD8", detail: "#FF9BEA", glow: "#E02BB8" },
    sw: 1.9,
    glow: true,
    extra: (H, c, st) => (
      <g fill="none" stroke={st.detail} strokeWidth="0.7" opacity="0.55">
        <path d={`M30 ${H - 6} H70`} /><path d={`M36 ${H * 0.45} H64`} />
      </g>
    ),
  },
  aurum: {   // 황금과 흑요석
    light: { grad: ["#FFF0B8", "#B98A2E"], stroke: "#6B4A10", detail: "#8A6218" },
    dark: { grad: ["#34303C", "#08070B"], stroke: "#D9B24E", detail: "#E8C766" },
    sw: 1.7,
    extra: (H, c) => (
      <g>
        <path d={`M50 0 L${c === "w" ? 36 : 38} ${H} H${c === "w" ? 44 : 46} Z`} fill={c === "w" ? "rgba(255,255,255,.45)" : "rgba(217,178,78,.18)"} />
        <path d={`M62 ${H * 0.2} L72 ${H} H64 Z`} fill={c === "w" ? "rgba(107,74,16,.22)" : "rgba(0,0,0,.35)"} />
      </g>
    ),
  },
  frost: {   // 프로스트(얼음 크리스탈)
    light: { grad: ["#F4FBFF", "#9FD0EE"], stroke: "#4C86B0", detail: "#5A94BC" },
    dark: { grad: ["#4D7FAE", "#12304F"], stroke: "#0A1D33", detail: "#9CCBEE" },
    sw: 1.5,
    extra: (H, c) => (
      <g fill="none" stroke={c === "w" ? "rgba(255,255,255,.9)" : "rgba(190,230,255,.55)"} strokeWidth="0.8" strokeLinejoin="round">
        <path d={`M50 0 L50 ${H}`} /><path d={`M36 0 L${c === "w" ? 30 : 28} ${H}`} /><path d={`M64 0 L${c === "w" ? 70 : 72} ${H}`} />
        <path d={`M28 ${H * 0.35} L72 ${H * 0.62}`} /><path d={`M72 ${H * 0.2} L34 ${H * 0.5}`} />
      </g>
    ),
  },
};
export const DESIGN_IDS = Object.keys(DESIGN_STYLES);

/** 한 칸에 놓는 기물 하나. size·색(w/b)·종류(type)는 PieceGlyph와 같은 규칙. */
export function DesignedPiece({ design, type, color, w, style }) {
  const st = DESIGN_STYLES[design] || DESIGN_STYLES.wood;
  const c = color === "w" ? "w" : "b";
  const sk = c === "w" ? st.light : st.dark;
  const H = hOf(type);
  const gid = "dp" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const sh = shapes(type);
  const strokeProps = { stroke: sk.stroke, strokeWidth: st.sw, strokeLinejoin: "round" };
  return (
    <svg viewBox={`0 0 100 ${H}`} width={w} height={(w * H) / 100} style={{ display: "block", pointerEvents: "none", overflow: "visible", ...style }} aria-hidden="true">
      <defs>
        <linearGradient id={gid + "g"} x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stopColor={sk.grad[0]} /><stop offset="1" stopColor={sk.grad[1]} /></linearGradient>
        <clipPath id={gid + "c"}>{sh.body.map((d, i) => <path key={i} d={d} />)}{sh.round.map(([x, y, r], i) => <circle key={"r" + i} cx={x} cy={y} r={r} />)}</clipPath>
        {st.glow && <filter id={gid + "f"} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>}
      </defs>
      <g filter={st.glow ? `url(#${gid}f)` : undefined}>
        {sh.body.map((d, i) => <path key={i} d={d} fill={`url(#${gid}g)`} {...strokeProps} />)}
        {sh.round.map(([x, y, r], i) => <circle key={"r" + i} cx={x} cy={y} r={r} fill={`url(#${gid}g)`} {...strokeProps} />)}
      </g>
      <g clipPath={`url(#${gid}c)`}>{st.extra(H, c, sk)}</g>
      <g fill="none" stroke={sk.detail} strokeWidth="1" strokeLinecap="round" opacity="0.8">{sh.lines.map((d, i) => <path key={i} d={d} />)}</g>
      {sh.eye && <circle cx={sh.eye[0]} cy={sh.eye[1]} r="2" fill={sk.detail} />}
    </svg>
  );
}
