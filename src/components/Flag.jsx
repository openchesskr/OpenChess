// (v0.7.0, 다국어) 언어 선택에 쓰는 국기. 이미지 파일 없이 SVG로 그려(윈도우는 국기 이모지가 글자로 보임) 어느 기기에서나 같게 보인다.
import React from "react";

const star = (cx, cy, r, rot = -90) => Array.from({ length: 10 }, (_, i) => {
  const a = ((rot + i * 36) * Math.PI) / 180, rr = i % 2 ? r * 0.382 : r;
  return (cx + rr * Math.cos(a)).toFixed(2) + "," + (cy + rr * Math.sin(a)).toFixed(2);
}).join(" ");

const trigram = (rotate, broken) => (
  <g transform={`rotate(${rotate} 12 9)`} fill="#111">
    {[0, 1, 2].map((i) => broken.includes(i)
      ? <g key={i}><rect x="9.6" y={1.2 + i * 1.1} width="2" height=".7" /><rect x="12.4" y={1.2 + i * 1.1} width="2" height=".7" /></g>
      : <rect key={i} x="9.6" y={1.2 + i * 1.1} width="4.8" height=".7" />)}
  </g>
);

const FLAGS = {
  ko: (<>
    <rect width="24" height="18" fill="#fff" />
    <path d="M8 9a4 4 0 0 1 8 0z" fill="#CD2E3A" /><path d="M8 9a4 4 0 0 0 8 0z" fill="#0047A0" />
    <circle cx="10" cy="9" r="2" fill="#CD2E3A" /><circle cx="14" cy="9" r="2" fill="#0047A0" />
    {trigram(-35, [])}{trigram(35, [1])}{trigram(145, [0, 1, 2])}{trigram(215, [0, 2])}
  </>),
  en: (<>
    <rect width="24" height="18" fill="#fff" />
    {[0, 2, 4, 6, 8, 10, 12].map((i) => <rect key={i} y={(i * 18) / 13} width="24" height={18 / 13} fill="#B22234" />)}
    <rect width="10.5" height="9.7" fill="#3C3B6E" />
    {[0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3, 4].map((c) => <circle key={r + "" + c} cx={1.3 + c * 2 + (r % 2) * 1} cy={1.3 + r * 2.2} r=".38" fill="#fff" />))}
  </>),
  hi: (<>
    <rect width="24" height="6" fill="#FF9933" /><rect y="6" width="24" height="6" fill="#fff" /><rect y="12" width="24" height="6" fill="#138808" />
    <circle cx="12" cy="9" r="2.2" fill="none" stroke="#000080" strokeWidth=".45" /><circle cx="12" cy="9" r=".4" fill="#000080" />
    {Array.from({ length: 12 }, (_, i) => <line key={i} x1="12" y1="9" x2={12 + 2.2 * Math.cos((i * Math.PI) / 6)} y2={9 + 2.2 * Math.sin((i * Math.PI) / 6)} stroke="#000080" strokeWidth=".25" />)}
  </>),
  ja: (<><rect width="24" height="18" fill="#fff" /><circle cx="12" cy="9" r="5" fill="#BC002D" /></>),
  zh: (<>
    <rect width="24" height="18" fill="#DE2910" />
    <polygon points={star(4.2, 4.2, 2.6)} fill="#FFDE00" />
    {[[8.4, 1.8], [10, 3.8], [10, 6.4], [8.4, 8.2]].map(([x, y], i) => <polygon key={i} points={star(x, y, .85, -90 + i * 20)} fill="#FFDE00" />)}
  </>),
  es: (<><rect width="24" height="18" fill="#AA151B" /><rect y="4.5" width="24" height="9" fill="#F1BF00" /></>),
};

export default function Flag({ code, width = 24, style }) {
  const body = FLAGS[code];
  if (!body) return null;
  return (
    <svg viewBox="0 0 24 18" width={width} height={(width * 3) / 4} aria-hidden="true" focusable="false"
      style={{ display: "block", flexShrink: 0, borderRadius: 3, boxShadow: "0 0 0 1px rgba(0,0,0,.18)", ...style }}>
      {body}
    </svg>
  );
}
