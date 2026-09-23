import React from "react";
import { BADGE_ICON_SRC } from "../lib/moveKinds.js";

// (v0.2.1 기능) 수 체계 아이콘을 누르면 그 등급의 조건·설명을 말풍선으로 보여준다(나무위키 "체스닷컴" 수 등급 참고).
// QLABEL은 App.jsx 안의 CircleBadge/ClickInfoBadge 등 다른 수 체계 UI에서도 함께 쓰여 여기서 export하고
// App.jsx가 다시 import해서 쓴다(SITE_FONT/SEQ_FONT와 같은 패턴).
export const QLABEL = { brilliant: "탁월한 수", best: "최선의 수", only: "유일한 수", excellent: "우수한 수", good: "좋은 수", inaccuracy: "부정확한 수", miss: "놓친 수", mistake: "실수", blunder: "블런더", book: "이론적인 수", pending: "분석 중" };
export function badgeIcon(kind, size = 14) {
  // (디자인) 수 체계 아이콘이 정해지기 전(엔진 계산 중)에는 정적인 "…" 대신, 평가 막대의 탐색
  // 인디케이터와 같은 3-dot bounce 애니메이션으로 "계산 중"임을 더 또렷하게 보여준다.
  if (kind === "pending") return <PendingDots size={size} />;
  const src = BADGE_ICON_SRC[kind];
  if (!src) return null;
  return <img src={src} alt={QLABEL[kind] || kind} width={size} height={size} style={{ display: "inline-block", objectFit: "contain", flexShrink: 0 }} />;
}
export function PendingDots({ size = 14 }) {
  const d = Math.max(2, size * 0.17);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: Math.max(1.5, size * 0.12) }}>
      {[0, 1, 2].map((i) => <span key={i} style={{ width: d, height: d, borderRadius: "50%", background: "currentColor", display: "inline-block", animation: "dotbounceSm 1.1s ease-in-out " + (i * 0.18) + "s infinite" }} />)}
    </span>
  );
}
