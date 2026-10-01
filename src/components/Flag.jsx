// (v0.6.0, 다국어) 언어 선택에 쓰는 국기. 이미지 파일 없이 SVG로 그려(윈도우는 국기 이모지가 글자로 보임) 어느 기기에서나 같게 보인다.
import React from "react";

const star = (cx, cy, r, rot = -90) => Array.from({ length: 10 }, (_, i) => {
  const a = ((rot + i * 36) * Math.PI) / 180, rr = i % 2 ? r * 0.382 : r;
  return (cx + rr * Math.cos(a)).toFixed(2) + "," + (cy + rr * Math.sin(a)).toFixed(2);
}).join(" ");

// 괘(건·곤·감·리): 깃발 대각선 방향으로 놓는다. 가운데 기준 거리 d, 막대 길이 4, 두께 .67, 간격 .67 (3:2 깃발 비율).
const trigram = (phi, broken) => (
  <g transform={`translate(12 8) rotate(${phi}) translate(0 -6.9)`} fill="#111">
    {[0, 1, 2].map((i) => broken.includes(i)
      ? <g key={i}><rect x="-2" y={i * 1.34 - 1.67} width="1.7" height=".67" /><rect x=".3" y={i * 1.34 - 1.67} width="1.7" height=".67" /></g>
      : <rect key={i} x="-2" y={i * 1.34 - 1.67} width="4" height=".67" />)}
  </g>
);

const FLAGS = {
  ko: (<>
    <rect width="24" height="16" fill="#fff" />
    <g transform="translate(12 8) rotate(-56.31)">
      <circle r="4" fill="#0047A0" />
      <path d="M-4 0a4 4 0 0 1 8 0a2 2 0 0 1 -4 0a2 2 0 0 0 -4 0z" fill="#CD2E3A" />
    </g>
    {trigram(-56.31, [])}{trigram(56.31, [0, 2])}{trigram(-123.69, [1])}{trigram(123.69, [0, 1, 2])}
  </>),
  en: (<>
    <rect width="24" height="16" fill="#fff" />
    {[0, 2, 4, 6, 8, 10, 12].map((i) => <rect key={i} y={(i * 16) / 13} width="24" height={16 / 13} fill="#B22234" />)}
    <rect width="9.6" height="8.6" fill="#3C3B6E" />
    {[0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3, 4].map((c) => <circle key={r + "" + c} cx={1.3 + c * 2 + (r % 2) * 1} cy={1.2 + r * 2} r=".38" fill="#fff" />))}
  </>),
  hi: (<>
    <rect width="24" height="5.34" fill="#FF9933" /><rect y="5.33" width="24" height="5.34" fill="#fff" /><rect y="10.66" width="24" height="5.34" fill="#138808" />
    <circle cx="12" cy="8" r="2.1" fill="none" stroke="#000080" strokeWidth=".45" /><circle cx="12" cy="8" r=".4" fill="#000080" />
    {Array.from({ length: 12 }, (_, i) => <line key={i} x1="12" y1="8" x2={12 + 2.1 * Math.cos((i * Math.PI) / 6)} y2={8 + 2.1 * Math.sin((i * Math.PI) / 6)} stroke="#000080" strokeWidth=".25" />)}
  </>),
  ja: (<><rect width="24" height="16" fill="#fff" /><circle cx="12" cy="8" r="4.8" fill="#BC002D" /></>),
  zh: (<>
    <rect width="24" height="16" fill="#DE2910" />
    <polygon points={star(4.2, 4.2, 2.6)} fill="#FFDE00" />
    {[[8.4, 1.8], [10, 3.8], [10, 6.4], [8.4, 8.2]].map(([x, y], i) => <polygon key={i} points={star(x, y, .85, -90 + i * 20)} fill="#FFDE00" />)}
  </>),
  es: (<><rect width="24" height="16" fill="#AA151B" /><rect y="4" width="24" height="8" fill="#F1BF00" /></>),
};

export default function Flag({ code, width = 24, style }) {
  const body = FLAGS[code];
  if (!body) return null;
  return (
    <svg viewBox="0 0 24 16" width={width} height={(width * 2) / 3} aria-hidden="true" focusable="false"
      style={{ display: "block", flexShrink: 0, borderRadius: 3, boxShadow: "0 0 0 1px rgba(0,0,0,.18)", ...style }}>
      {body}
    </svg>
  );
}
