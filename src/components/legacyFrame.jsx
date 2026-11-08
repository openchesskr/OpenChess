// (v0.7.4, 사용자 요청) 유산의 금색 기하학 외곽선 액자 — 모서리를 깎은 이중선, 모서리 마름모, 변 가운데 마름모.
// 칸 크기에 맞춰 늘어나도 선 굵기는 그대로(non-scaling-stroke). draw를 켜면 열릴 때 선이 그려지는 연출(framer-motion pathLength)을 한다.
import React from "react";
import { motion } from "framer-motion";
import { isLite } from "../lib/perfMode.js";

export const LEGACY_GOLD = "#D4AF5F", LEGACY_GOLD_HI = "#ECCB86";

export function LegacyFrame({ draw = false, delay = 0 }) {
  const c = 7, k = 4;
  const outer = `M${c} 1 H${100 - c} L99 ${c} V${100 - c} L${100 - c} 99 H${c} L1 ${100 - c} V${c} Z`;
  const inner = `M${c + k} ${k} H${100 - c - k} L${100 - k} ${c + k} V${100 - c - k} L${100 - c - k} ${100 - k} H${c + k} L${k} ${100 - c - k} V${c + k} Z`;
  const dia = (x, y, r) => `M${x} ${y - r} L${x + r} ${y} L${x} ${y + r} L${x - r} ${y} Z`;
  const animate = draw && !isLite();
  const line = (d, w, op, dl) => animate
    ? <motion.path d={d} fill="none" stroke={LEGACY_GOLD} strokeWidth={w} opacity={op} vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, delay: delay + dl, ease: [0.22, 0.9, 0.32, 1] }} />
    : <path d={d} fill="none" stroke={LEGACY_GOLD} strokeWidth={w} opacity={op} vectorEffect="non-scaling-stroke" />;
  const gem = (d, key, extra) => animate
    ? <motion.path key={key} d={d} fill={LEGACY_GOLD_HI} {...extra} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} style={{ transformBox: "fill-box", transformOrigin: "center" }} transition={{ duration: 0.4, delay: delay + 0.9 }} />
    : <path key={key} d={d} fill={LEGACY_GOLD_HI} {...extra} />;
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
      {line(outer, 1.6, 1, 0)}
      {line(inner, 0.8, 0.65, 0.18)}
      {[[c, 1], [100 - c, 1], [c, 99], [100 - c, 99], [1, c], [1, 100 - c], [99, c], [99, 100 - c]].map(([x, y], i) => gem(dia(x, y, 1.3), "g" + i))}
      {[[50, 1], [50, 99]].map(([x, y], i) => gem(dia(x, y, 2.2), "m" + i, { stroke: "#14213A", strokeWidth: 0.4, vectorEffect: "non-scaling-stroke" }))}
    </svg>
  );
}
