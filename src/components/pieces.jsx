import React, { useContext, useId, createContext } from "react";
import {
  PIECE_BASE_R, PIECE_BASE_L, PIECE_MID, PIECE_LINES, PIECE_ACCENT, PIECE_CROSS,
  PIECE_HEIGHT_FACTOR, PIECE_NATURAL_TOP_Y, PIECE_BASE_RATIO, PIECE_IMG_SETS,
  PIECE_SKINS, pieceShadow,
  tierPieceSrc, TIER_IMG_NATIVE_H, TIER_DECAGON_PTS,
} from "../lib/theme.js";
import { TIER_COLORS } from "../lib/tierSystem.js";

/* 장착된 스킨을 Context로 흘려보내 Board·PieceGlyph 어디서든(프롭 안 넘겨도) 자동 적용되게 한다 —
   보드가 학습 탭·퍼즐 풀이·미니 프리뷰 등 수십 곳에서 쓰이므로 매 호출부마다 prop을 꽂는 대신
   최상위 App에서 한 번만 Provider로 감싼다. */
export const SkinContext = createContext({ boardSkin: "classic", pieceSkin: "classic" });

export function PieceGlyph({ type, color, size, style, draggable = false, onDragStart, pieceSkin }) {
  // (버그 수정) 진짜 인터랙티브 보드가 아닌 곳(애니메이션 시연, 캡처 기물 목록, 프로모션 후보,
  // 티어 배지 등)에서 draggable을 아예 안 넘기면 undefined가 되어 <img>·<a>처럼 브라우저가
  // 기본적으로 드래그 가능하게 두는 요소는 여전히 네이티브 드래그가 걸려 있었다 — 실제 보드에서
  // 기물 하나를 드래그할 때 그 제스처가 마우스 아래를 지나가는 다른(엉뚱한) draggable 이미지까지
  // 함께 선택·드래그해 여러 기물·이미지가 한꺼번에 끌려오는 것처럼 보이는 원인이었다. draggable을
  // 명시적으로 넘긴 진짜 보드 기물만 드래그를 허용하고, 나머지는 항상 false로 고정한다.
  const dragStyle = draggable
    ? { userSelect: "none", WebkitUserSelect: "none" }
    : { WebkitUserDrag: "none", userSelect: "none", WebkitUserSelect: "none" };
  const ctx = useContext(SkinContext);
  const skinId = pieceSkin || ctx.pieceSkin;
  const sk = PIECE_SKINS[skinId] || PIECE_SKINS.classic;
  const light = color === "w";
  // (버그) useId는 스킨(이미지/SVG)에 따라 조건부로 호출하면 안 된다 — 기물 스킨을 갈아 끼우면
  // 같은 컴포넌트 인스턴스가 두 분기 사이를 오가며 훅 호출 개수가 달라져 React 규칙을 어기게 된다.
  const rawId = useId();
  if (sk.image) {
    // (2차 개편) 이미지 세트를 스킨별로 분리 — 기본(classic)과 바다(ocean)가 서로 다른 이미지·받침 폭을 쓴다.
    const imgSet = PIECE_IMG_SETS[skinId] || PIECE_IMG_SETS.classic;
    const meta = imgSet.images[type] && imgSet.images[type][color];
    if (!meta) return null;
    // size는 다른 스킨과 동일하게 "칸에 맞춘 정사각형 박스" 한 변 길이로 전달된다. 그 안에서 받침이
    // BASE_RATIO만큼을 차지하도록 스케일을 정하면, 모든 기물의 받침이 항상 같은 화면 폭이 된다.
    const scale = (size * PIECE_BASE_RATIO) / imgSet.basePx;
    return (
      <img src={meta.src} alt={type} draggable={draggable} onDragStart={onDragStart}
        style={{ width: meta.w * scale, height: meta.h * scale, display: "block", flexShrink: 0, filter: pieceShadow(light), ...dragStyle, ...style }} />
    );
  }
  const mid = PIECE_MID[type];
  const clipId = "pg" + rawId.replace(/[^a-zA-Z0-9]/g, "");
  if (!mid) return null;
  const fill = light ? sk.light : sk.dark;
  const bodyPoints = PIECE_BASE_R + " " + mid + " " + PIECE_BASE_L;
  // (20차 개편) 바다 스킨 등 SVG 기반 기물은 그동안 전부 100x100 정사각 박스에 눌려 담겨 있어, 실제
  // 사용자가 만든 이미지(킹·퀸은 크고 폰은 작은)와 비율이 달랐다. 기존 실루엣(폴리곤 좌표)은 그대로
  // 두고, 받침(y=100)을 고정한 채 세로로만 기물별 배율(PIECE_HEIGHT_FACTOR)만큼 늘여, 이미지 세트와
  // 비슷한 비율이 되도록 한다 — matrix(1,0,0,F,0,100(1-F))는 y=100을 그대로 두고 그 위쪽만 F배 늘인다.
  const hf = PIECE_HEIGHT_FACTOR[type] || 1;
  // 원본 실루엣의 "늘이기 전 높이"(받침 y=100 기준, 기물별 꼭대기 y좌표까지) 대비 목표 높이(hf×56)에
  // 맞도록 실제 stretch 배율(m)을 역산 — 그래야 기물마다 원본 높이가 달라도 최종 렌더링 높이는
  // 항상 정확히 hf × 받침 폭이 된다(받침은 항상 1배 고정, matrix는 y=100을 고정점으로 늘인다).
  const naturalH = 100 - (PIECE_NATURAL_TOP_Y[type] ?? 0);
  const m = (hf * 56) / naturalH;
  const vbY = 100 - hf * 56;
  // 받침(폴리곤 x=22~78, 100단위 중 56)이 이미지 기물과 동일하게 size*PIECE_BASE_RATIO 폭으로
  // 보이도록 역산 — 100단위 viewBox 전체가 svgW 픽셀에 대응하므로 56단위(받침)는 svgW*0.56이 된다.
  const svgW = size * PIECE_BASE_RATIO * (100 / 56);
  const svgH = size * PIECE_BASE_RATIO * hf;
  // (버그) 네이티브 HTML5 드래그는 <svg> 루트 요소를 드래그 시작점으로 안정적으로 인식하지 못하는
  // 브라우저(크로미움 포함)가 있어, 바다 스킨처럼 SVG로 그리는 기물은 실제 마우스 드래그로 옮겨지지
  // 않는 문제가 있었다(클릭으로는 정상 작동해 눈에 덜 띔). img 기물처럼 항상 드래그를 인식하는
  // <div>로 감싸고, 애니메이션에 쓰이는 opacity·transform 등 style도 이 바깥 div로 옮긴다.
  return (
    <div draggable={draggable} onDragStart={onDragStart}
      style={{ display: "block", flexShrink: 0, width: svgW, height: svgH, filter: pieceShadow(light), ...dragStyle, ...style }}>
      <svg viewBox={"0 " + vbY + " 100 " + (hf * 56)} width={svgW} height={svgH} style={{ display: "block", pointerEvents: "none" }}>
        <g transform={"matrix(1,0,0," + m + ",0," + (100 * (1 - m)) + ")"}>
          {sk.glossy && <defs><clipPath id={clipId}><polygon points={bodyPoints} />{type === "K" && <path d={PIECE_CROSS} />}</clipPath></defs>}
          <polygon points={bodyPoints} fill={fill} stroke={sk.stroke} strokeWidth={2.6} strokeLinejoin="round" />
          {type === "K" && <path d={PIECE_CROSS} fill={fill} stroke={sk.stroke} strokeWidth={2.2} strokeLinejoin="round" />}
          <path d={PIECE_ACCENT} fill={sk.accent} opacity={sk.accentOpacity} />
          <line x1={30} y1={88} x2={70} y2={88} stroke={sk.accent} strokeWidth={1.4} opacity={0.85} />
          {PIECE_LINES[type].map((d, i) => <path key={i} d={d} fill="none" stroke={sk.accent} strokeWidth={1.5} opacity={0.8} strokeLinecap="round" />)}
          {sk.glossy && (
            <g clipPath={"url(#" + clipId + ")"}>
              <ellipse cx={40} cy={40} rx={26} ry={40} fill="rgba(255,255,255,.4)" />
              <ellipse cx={64} cy={72} rx={12} ry={20} fill="rgba(255,255,255,.18)" />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
export function TierPieceGlyph({ size = 100, tierKey, division = null, muted = false }) {
  const src = tierPieceSrc(tierKey, division);
  // size는 "가장 큰 티어(master) 기준 세로 길이"로 받고, 다른 모든 티어는 같은 배율로 축소해
  // 자연스럽게 그보다 작게 나온다 — 각자 다른 박스에 맞춰 늘리지 않으므로 로마 숫자 정렬이 깨지지 않는다.
  const scale = size / TIER_IMG_NATIVE_H.master;
  const h = Math.round((TIER_IMG_NATIVE_H[tierKey] || TIER_IMG_NATIVE_H.iron) * scale);
  // (디자인 개선) 잠긴(muted) 티어를 흰색 반투명 실루엣으로 뭉개던 예전 방식 대신, 실제 이미지를
  // 그대로 두고 채도·밝기만 낮춘다 — 아직 안 온 등급들의 색 차이(브론즈 구릿빛, 골드 금빛,
  // 다이아몬드 청록…)가 옅게나마 남아, 위로 스크롤할수록 앞으로 만날 색이 은은하게 미리 보인다.
  return <img src={src} alt="" style={{ height: h, width: "auto", display: "block", flexShrink: 0, filter: muted ? "grayscale(.5) brightness(.72) saturate(.85)" : "none", opacity: muted ? 0.85 : 1 }} />;
}
export function TierLogoDisc({ tierKey, division, size, discSize, muted = false }) {
  // (사용자 요청) 그랜드마스터는 로고를 감싸는 흰 십각형 테두리도 무지개 그라데이션으로 — 서로 다른
  // <svg>끼리 id가 겹치지 않도록 useId로 인스턴스별 고유 id를 만든다(조건부 호출 금지, 항상 호출).
  const gradId = "gmDecagon-" + useId().replace(/:/g, "");
  const isGM = tierKey === "grandmaster";
  const gmStops = TIER_COLORS.grandmaster.stops;
  return (
    <div style={{ position: "relative", width: discSize, height: discSize, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: muted ? 0.62 : 1, filter: "drop-shadow(0 2px 5px rgba(0,0,0,.35))" }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        {isGM && (
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gmStops[0]} />
              <stop offset="50%" stopColor={gmStops[1]} />
              <stop offset="100%" stopColor={gmStops[2]} />
            </linearGradient>
          </defs>
        )}
        <polygon points={TIER_DECAGON_PTS} fill="#FFFFFF" stroke={isGM ? "url(#" + gradId + ")" : "#D8CFB8"} strokeWidth={isGM ? 3 : 2} />
      </svg>
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <TierPieceGlyph tierKey={tierKey} division={division} size={size} />
      </div>
    </div>
  );
}
