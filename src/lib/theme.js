/* ============================================================ 디자인 토큰 ============================================================ */
export const T = {
  ebony: "#1B1009", ebony2: "#2E1B10", ebony3: "#3D2616",
  ivory: "#EBDDC4", ivoryHi: "#FAF2E2", paper: "#F1E6D0",
  ink: "#5A3A22", inkSoft: "#7A6650", cocoa: "#5A3A22",
  boardLight: "#E8D2A6", boardDark: "#7C4F2E",
  brass: "#C49A50", brassHi: "#ECCB86",
  brilliant: "#16B5A6", only: "#3E7CC4",
  best: "#3F7A3A", excellent: "#5C8A52", good: "#8FB55E",
  inaccuracy: "#E0B53A", mistake: "#D9822B", blunder: "#C8453B",
  book: "#8A5A2B", arrow: "#C49A50",
  // (v0.2.2 기능) 탁월한 수(브릴리언트)에서 "내 기물이 상대에게 공격받는다"를 보여주는 경고 화살표
  // 전용 붉은색 — 기존 blunder 색(C8453B, 벽돌빛 갈색 톤)과 달리 확실히 붉은색으로 구분되게 한다.
  danger: "#E5342A",
};
export const FILES = "abcdefgh";
// (v0.1.4 기능) "사이트 전체 카드·블록에 애니메이션을 적용해 더 부드러운 UX를 달라"는 요청 — 지금까지
// motion은 티어 여정 지도·승급 연출에만 쓰이고 있었고, 퍼즐 카드·퀘스트 카드·상점 카드·친구 목록 같은
// 나머지 화면은 전부 즉시 나타나는 정적 div였다. /about 페이지의 Reveal과 같은 easing으로, 카드
// 컴포넌트 자체는 건드리지 않고 리스트를 그리는 .map() 호출부에서만 감싸는 방식으로 적용한다 —
// 카드 내부 로직(좋아요·풀이 상태 등)을 그대로 둔 채 등장(살짝 뜨며 페이드 인, 인덱스만큼 스태거)·
// 퇴장(AnimatePresence로 부드럽게 축소되며 사라짐) 애니메이션만 얇게 씌운다.
export const MOTION_EASE = [0.22, 0.9, 0.32, 1];
// (디자인) 보드 테두리에 금색 광택(gloss) 효과 — 단색 브라스 테두리 대신 대각선 그러데이션
// borderImage + 안쪽 하이라이트/바깥 그림자 boxShadow로 금속 광택감을 낸다. 메인 보드와
// 사이트 전체의 모든 미니 체스보드(애니메이션·되돌리기·퍼즐 등)에서 공용으로 쓴다.
export const BOARD_GLOSS = {
  border: "2px solid transparent",
  borderImage: "linear-gradient(135deg, #F3DFAE, #C49A50 45%, #8A6C2F) 1",
  boxShadow: "0 0 0 1px rgba(196,154,80,.3), inset 0 1px 3px rgba(255,255,255,.4), inset 0 -2px 5px rgba(0,0,0,.3)",
};
// (v0.2.6 버그 수정) 도감 탭 오프닝 모식도·분석 탭 기보·엔진 라인의 포인터 드래그 스크롤이 손가락·
// 마우스가 움직인 만큼만(1:1) 옮겨져 너무 조금씩만 스크롤된다는 요청 — 드래그 델타에 이 배율을
// 곱해 같은 드래그 거리로 더 멀리 스크롤·팬되게 한다(세 곳 모두 공용으로 참조).
export const DRAG_SCROLL_MULT = 2.2;
/* (20\uCC28 \uAE30\uB2A53) \uAE30\uBB3C SVG \uC138\uD2B8 \u2014 \uC720\uB2C8\uCF54\uB4DC \uD14D\uC2A4\uD2B8 \uAE30\uBB3C(\u2654\u2655\u2656\u2657\u2658\u2659)\uC744 \uCCA8\uBD80 \uB808\uD37C\uB7F0\uC2A4(\uB85C\uC6B0\uD3F4\uB9AC\u00B7\uAE08\uC7A5 \uB300\uAC01\uC120
   \uD3F4\uB4DC \uB77C\uC778) \uC2A4\uD0C0\uC77C\uC758 \uBCA1\uD130 \uC544\uC774\uCF58\uC73C\uB85C \uAD50\uCCB4\uD55C\uB2E4. \uBAA8\uB4E0 \uAE30\uBB3C\uC774 \uACF5\uC720\uD558\uB294 \uBC11\uB2E8(base)\u00B7\uBAA9(neck) \uB2E4\uAC01\uD615\uC5D0
   \uAE30\uBB3C\uBCC4 \uBAB8\uD1B5(mid) \uC810 \uBAA9\uB85D\uC744 \uC774\uC5B4\uBD99\uC778 \uB2E8\uC77C \uC2E4\uB8E8\uC5E3 \uD558\uB098 + \uB300\uAC01\uC120 \uD3F4\uB4DC \uB77C\uC778 2\uAC1C + \uBC11\uB2E8 \uAE08\uC7A5 \uC0BC\uAC01 \uD3EC\uC778\uD2B8
   \uB85C \uAD6C\uC131\uD574, \uC720\uB2C8\uCF54\uB4DC \uAE00\uB9AC\uD504\uC640 \uBE44\uC2B7\uD55C \uC815\uC0AC\uAC01 \uBE44\uC728(viewBox 0 0 100 100)\uB85C \uC5B4\uB290 \uD06C\uAE30\uC5D0\uC11C\uB3C4 \uB610\uB837\uD558\uB2E4. */
export const PIECE_BASE_R = "22,100 78,100 78,94 70,88 62,78";
export const PIECE_BASE_L = "38,78 30,88 22,94";
export const PIECE_MID = {
  P: "58,66 60,54 50,44 40,54 42,66",
  R: "66,68 66,30 66,18 58,18 58,30 54,30 54,18 46,18 46,30 42,30 42,18 34,18 34,30 34,68",
  B: "58,66 62,54 54,40 50,26 46,40 38,54 42,66",
  N: "60,64 66,54 64,40 54,28 44,30 34,40 24,46 28,52 36,52 38,60 34,66",
  Q: "58,68 62,58 66,50 66,34 62,44 58,30 54,44 50,22 46,44 42,30 38,44 34,34 34,50 38,58 42,68",
  K: "58,68 64,56 66,48 34,48 36,56 42,68",
};
export const PIECE_LINES = {
  P: ["M42,66 L60,54", "M38,78 L58,66"],
  R: ["M34,68 L66,30", "M34,30 L66,68"],
  B: ["M38,78 L54,40", "M62,78 L46,40"],
  N: ["M38,78 L54,28", "M60,64 L38,60"],
  Q: ["M38,78 L58,30", "M62,78 L42,30"],
  K: ["M42,68 L64,56", "M58,68 L36,56"],
};
export const PIECE_ACCENT = "M30,88 L70,88 L50,100 Z";
export const PIECE_CROSS = "M47,48 L47,36 L40,36 L40,30 L47,30 L47,22 L53,22 L53,30 L60,30 L60,36 L53,36 L53,48 Z";
// (20차 개편) SVG 기반 기물 스킨(바다 등)의 기물별 세로 배율 — 사용자가 만든 실제 이미지 세트에서
// 측정한 "받침(base) 폭 대비 전체 높이" 비율을 그대로 반영해, 킹·퀸은 크고 폰·비숍은 아담한 실제
// 체스 세트 비율에 가깝게 만든다(받침 폭은 항상 1배로 고정, 세로만 이 배율만큼 늘어남).
export const PIECE_HEIGHT_FACTOR = { P: 1.15, N: 1.30, B: 1.32, R: 1.23, Q: 1.45, K: 1.49 };
// 위 배율을 g-transform에 그대로 곱하면 기물별 원본 실루엣이 이미 서로 다른 높이(예: 폰은 y=44부터,
// 룩은 y=18부터 시작)를 갖고 있어 배율이 중복 적용돼 지나치게 커진다(특히 킹 십자가가 보드 밖으로
// 잘림). 각 기물의 "늘이기 전 원래 높이"를 기준으로 역산한 배율을 써야 최종 높이가 정확히
// PIECE_HEIGHT_FACTOR × 받침 폭이 된다.
export const PIECE_NATURAL_TOP_Y = { P: 44, N: 28, B: 26, R: 18, Q: 22, K: 22 };
// (버그) 기물이 칸에 비해 작고, 받침 기준 정렬 때문에 칸 아래쪽에 치우쳐 보이던 문제 — 크기를
// 키우고(0.56→0.74) SVG 기물도 같은 비율을 쓰도록 통일했다. 정렬은 다시 칸 정중앙으로 되돌린다.
export const PIECE_BASE_RATIO = 0.74; // 칸 크기(size) 대비 기물 받침 폭의 비율 — 이미지·SVG 기물 공통 기준
// (2차 개편) 기물 스킨이 여러 개(기본·바다)로 늘어나 이미지 세트도 스킨별로 따로 관리한다.
// basePx: 그 스킨 이미지 세트가 공유하는 "받침" 폭(원본 픽셀) — 스킨마다 실제 이미지가 다르므로
// 값도 다르다(기본은 정확히 79px, 바다는 제작 특성상 187~195px 사이로 약간의 편차가 있어 평균값 사용).
export const PIECE_IMG_SETS = {
  // (21차) 사용자가 새로 제작한 기물 이미지 세트로 교체 — public 루트에 "White Pawn.png" 형식으로
  // 올라와 있다(옛 세트처럼 public/pieces 하위 소문자-하이픈 파일명이 아님). 새 세트는 폰·비숍·룩·
  // 퀸·킹의 캔버스 높이가 전부 116~117px로 거의 일치해(옛 세트는 91~118px로 들쭉날쭉했음), 기물마다
  // 다른 정렬을 줄 필요 없이 전부 동일하게 칸 정중앙에 두면 된다.
  classic: {
    basePx: 80,
    images: {
      P: { w: { src: "/White Pawn.png", w: 80, h: 116 }, b: { src: "/Black Pawn.png", w: 80, h: 116 } },
      N: { w: { src: "/White Knight.png", w: 90, h: 123 }, b: { src: "/Black Knight.png", w: 85, h: 118 } },
      B: { w: { src: "/White Bishop.png", w: 80, h: 116 }, b: { src: "/Black Bishop.png", w: 80, h: 116 } },
      R: { w: { src: "/White Rook.png", w: 81, h: 117 }, b: { src: "/Black Rook.png", w: 81, h: 117 } },
      Q: { w: { src: "/White Queen.png", w: 119, h: 116 }, b: { src: "/Black Queen.png", w: 119, h: 116 } },
      K: { w: { src: "/White King.png", w: 106, h: 116 }, b: { src: "/Black King.png", w: 106, h: 116 } },
    },
  },
  ocean: {
    basePx: 190,
    images: {
      P: { w: { src: "/pieces/ocean/white-pawn.png", w: 190, h: 219 }, b: { src: "/pieces/ocean/black-pawn.png", w: 192, h: 219 } },
      N: { w: { src: "/pieces/ocean/white-knight.png", w: 189, h: 255 }, b: { src: "/pieces/ocean/black-knight.png", w: 196, h: 242 } },
      B: { w: { src: "/pieces/ocean/white-bishop.png", w: 189, h: 251 }, b: { src: "/pieces/ocean/black-bishop.png", w: 193, h: 251 } },
      R: { w: { src: "/pieces/ocean/white-rook.png", w: 190, h: 234 }, b: { src: "/pieces/ocean/black-rook.png", w: 194, h: 233 } },
      Q: { w: { src: "/pieces/ocean/white-queen.png", w: 283, h: 272 }, b: { src: "/pieces/ocean/black-queen.png", w: 284, h: 277 } },
      K: { w: { src: "/pieces/ocean/white-king.png", w: 248, h: 281 }, b: { src: "/pieces/ocean/black-king.png", w: 254, h: 282 } },
    },
  },
  // (about 페이지 그랜드마스터 카드 연동) 그랜드마스터 전용 기물 — 오로라 크리스탈+대리석 세트.
  // 원본(1920px 정사각 캔버스, 여백 포함)을 알파 바운딩 박스로 잘라내고 WebP로 압축해 옮겨 적었다.
  // (참고) 킹·퀸 원본 이미지는 받침·몸통 없이 왕관만 있는 상태로 받았다 — 다른 기물과 스타일이
  // 다르지만 그대로 쓰기로 결정된 것이라 별도 보정 없이 그대로 옮겼다.
  grandmaster: {
    basePx: 280,
    images: {
      P: { w: { src: "/pieces/grandmaster/white-pawn.webp", w: 280, h: 420 }, b: { src: "/pieces/grandmaster/black-pawn.webp", w: 279, h: 420 } },
      N: { w: { src: "/pieces/grandmaster/white-knight.webp", w: 281, h: 420 }, b: { src: "/pieces/grandmaster/black-knight.webp", w: 284, h: 420 } },
      B: { w: { src: "/pieces/grandmaster/white-bishop.webp", w: 231, h: 420 }, b: { src: "/pieces/grandmaster/black-bishop.webp", w: 230, h: 420 } },
      R: { w: { src: "/pieces/grandmaster/white-rook.webp", w: 295, h: 420 }, b: { src: "/pieces/grandmaster/black-rook.webp", w: 296, h: 420 } },
      Q: { w: { src: "/pieces/grandmaster/white-queen.webp", w: 420, h: 375 }, b: { src: "/pieces/grandmaster/black-queen.webp", w: 420, h: 376 } },
      // (버그 수정) 킹 원본은 420×409(거의 정사각) 캔버스라 다른 기물과 같은 배율을 적용하면 유일하게
      // 가로·세로 둘 다 칸보다 커져(칸 폭의 약 1.1배) 옆 칸(퀸·비숍)까지 침범해 보였다 — 가로세로
      // 비율(약 1.027:1)은 그대로 두고 렌더 크기만 0.9배로 줄여 다른 기물들과 어울리는 크기로 맞춘다.
      K: { w: { src: "/pieces/grandmaster/white-king.webp", w: 378, h: 368 }, b: { src: "/pieces/grandmaster/black-king.webp", w: 378, h: 367 } },
    },
  },
};
/* (20\uCC28 \uAE30\uB2A54 \uB300\uBE44) \uBCF4\uB4DC/\uAE30\uBB3C \uC2A4\uD0A8 \uB808\uC9C0\uC2A4\uD2B8\uB9AC \u2014 \uAE30\uBCF8(classic) \uD558\uB098\uB9CC \uC6B0\uC120 \uB450\uACE0, \uC0C1\uC810\uC5D0\uC11C \uD30C\uB294
   \uBC14\uB2E4(ocean) \uC2A4\uD0A8 \uB4F1 \uCD94\uAC00 \uC2A4\uD0A8\uC740 \uC774 \uAC1D\uCCB4\uC5D0 \uD56D\uBAA9\uB9CC \uB298\uB9AC\uBA74 PieceGlyph\u00B7Board\uAC00 \uADF8\uB300\uB85C \uC9C0\uC6D0\uD55C\uB2E4. */
/* (20\uCC28 \uAE30\uB2A54) \uCCB4\uC2A4\uBCF4\uB4DC \uC2A4\uD0A8\u00B7\uAE30\uBB3C \uC2A4\uD0A8\uC740 \uAC01\uAC01 \uB3C5\uB9BD\uC801\uC73C\uB85C \uC0AC\uACE0\uD314\uACE0 \uC7A5\uCC29\uD55C\uB2E4(\uC11E\uC5B4\uC11C \uCC29\uC6A9 \uAC00\uB2A5).
   ocean\uC740 \uCCA8\uBD80 \uB808\uC9C4 \uCCB4\uC2A4\uBCF4\uB4DC \uB808\uD37C\uB7F0\uC2A4\uCC98\uB7FC \uBC18\uD22C\uBA85\u00B7\uAD11\uD0DD \uC788\uB294 \uD30C\uB780 \uC720\uB9AC \uB290\uB08C \u2014 \uBCF4\uB4DC\uB294 \uC0AC\uAC01\uD615 \uBC30\uACBD\uC5D0
   \uB300\uAC01\uC120 \uD558\uC774\uB77C\uC774\uD2B8\uB97C \uACB9\uCE5C \uADF8\uB77C\uB514\uC5B8\uD2B8, \uAE30\uBB3C\uC740 \uBC18\uD22C\uBA85 rgba \uCC44\uC6C0 \uC704\uC5D0 \uD074\uB9BD\uB41C \uC720\uB9AC \uD558\uC774\uB77C\uC774\uD2B8\uB97C \uC5B9\uB294\uB2E4. */
export const BOARD_SKINS = {
  classic: { label: "\uAE30\uBCF8", price: 0, light: T.boardLight, dark: T.boardDark },
  // (2\uCC28 \uAC1C\uD3B8) \uC0AC\uC6A9\uC790\uAC00 \uC9C1\uC811 \uB9CC\uB4E0 \uBC14\uB2E4 \uD14C\uB9C8 \uCE74\uD3B8(\uBAA8\uB798\uBE5B/\uBB3C\uACB0\u00B7\uBAA8\uB798) \uC774\uBBF8\uC9C0\uB85C \uAD50\uCCB4 \u2014
  // \uCE78\uB9C8\uB2E4 \uC804\uCCB4 8x8 \uC774\uBBF8\uC9C0\uC5D0\uC11C \uC790\uAE30 \uC704\uCE58\uC758 \uC870\uAC01\uB9CC background-position\uC73C\uB85C \uC798\uB77C \uBCF4\uC5EC\uC900\uB2E4(boardSquareBg).
  ocean: { label: "\uD478\uB978 \uBC14\uB2E4", price: 500, image: "/boards/ocean-board.jpg" },
  // (about \uD398\uC774\uC9C0 \uADF8\uB79C\uB4DC\uB9C8\uC2A4\uD130 \uCE74\uB4DC \uC5F0\uB3D9) \uCF54\uC778\uC73C\uB85C \uC0B4 \uC218 \uC5C6\uACE0 tierLocked \uD2F0\uC5B4\uC5D0 \uB3C4\uB2EC\uD574\uC57C\uB9CC
  // \uC790\uB3D9 \uD574\uAE08\uB418\uB294 \uC804\uC6A9 \uC2A4\uD0A8 \u2014 App\uC758 useEffect(totalXp \uAE30\uC900)\uAC00 ownedSkins\uC5D0 \uC9C1\uC811 \uCD94\uAC00\uD558\uBBC0\uB85C price\uB294 \uC4F0\uC774\uC9C0 \uC54A\uB294\uB2E4.
  grandmaster: { label: "그랜드마스터", tierLocked: "grandmaster", image: "/boards/grandmaster-board.jpg" },
};
// (2\uCC28 \uAC1C\uD3B8) \uC774\uBBF8\uC9C0 \uAE30\uBC18 \uBCF4\uB4DC \uC2A4\uD0A8\uC740 8x8 \uD1B5\uC9F8 \uC774\uBBF8\uC9C0\uB97C \uCE78 \uD06C\uAE30\uC758 8\uBC30\uB85C \uAE54\uACE0(background-size),
// \uD589/\uC5F4\uC5D0 \uB9DE\uCDB0 \uC74C\uC218\uB85C \uBC00\uC5B4(background-position) \uAC01 \uCE78\uC774 \uC804\uCCB4 \uC774\uBBF8\uC9C0\uC758 \uC790\uAE30 \uC870\uAC01\uB9CC \uBCF4\uC774\uAC8C \uD55C\uB2E4.
// (bugfix) px(cell) based slicing drifted out of sync whenever the actual rendered cell size
// differed even slightly from the JS-estimated `cell` (e.g. a squeezed layout) — the texture's
// seams no longer lined up. Percent-based background-size/position always matches the real
// rendered box exactly, no matter what size it actually ends up being.
export function boardSquareBg(sk, light, r, c) {
  if (sk.image) {
    const cc = ((c % 8) + 8) % 8, rr = ((r % 8) + 8) % 8;
    return { backgroundImage: "url(" + sk.image + ")", backgroundSize: "800% 800%", backgroundPosition: (cc / 7 * 100) + "% " + (rr / 7 * 100) + "%" };
  }
  return { background: light ? sk.light : sk.dark };
}
export const PIECE_SKINS = {
  classic: { label: "\uAE30\uBCF8", price: 0, image: true, light: T.ivoryHi, dark: "#0E0907", stroke: "#6B4F22", accent: T.brass, accentOpacity: 0.92, glossy: false },
  // (2\uCC28 \uAC1C\uD3B8) \uBC14\uB2E4 \uAE30\uBB3C\uB3C4 \uC0AC\uC6A9\uC790\uAC00 \uB9CC\uB4E0 \uC774\uBBF8\uC9C0 \uC138\uD2B8(public/pieces/ocean)\uB85C \uAD50\uCCB4 \u2014 classic\uACFC \uB3D9\uC77C\uD558\uAC8C
  // image:true\uB85C PieceGlyph\uC758 \uC774\uBBF8\uC9C0 \uB80C\uB354\uB9C1 \uACBD\uB85C\uB97C \uD0C0\uB418, PIECE_IMG_SETS.ocean\uC758 \uC790\uAE30 \uC774\uBBF8\uC9C0\uB97C \uC4F4\uB2E4.
  ocean: { label: "\uD478\uB978 \uBC14\uB2E4", price: 500, image: true },
  // (about 페이지 그랜드마스터 카드 연동) 코인으로 살 수 없고 그랜드마스터 티어에 도달해야만
  // 자동 해금되는 전용 기물 — 위 BOARD_SKINS.grandmaster와 같은 원리(tierLocked)로 동작한다.
  grandmaster: { label: "그랜드마스터", tierLocked: "grandmaster", image: true },
};
export function pieceShadow(light) { return light ? "drop-shadow(0 1px 1px rgba(0,0,0,.55))" : "drop-shadow(0 2px 2px rgba(0,0,0,.5))"; }
// (기능) 티어별로 디자이너가 직접 제작한 로우폴리 기물 이미지(public에 업로드된 실제 아트) —
// 아이언 폰부터 그랜드마스터(왕관에 "GM"이 새겨진 홀로그램 킹)까지, 기물 종류와 등급 색이 이미
// 하나의 이미지 안에 함께 표현되어 있다. 그랜드마스터는 구간이 없어 대표 이미지 하나만 쓴다.
export const TIER_IMAGE = {
  iron: "/iron-pawn.png",
  bronze: "/bronze-knight.png",
  silver: "/silver-bishop.png",
  gold: "/gold-rook.png",
  diamond: "/diamond-queen.png",
  master: "/master-king.png",
  grandmaster: "/gm.png",
};
// (v0.1.3 기능) 여정 지도를 스크롤하며 지나는 티어(아이언·브론즈…)마다 그 느낌에 맞는 세로로 긴
// 배경 이미지를 깔아 준다 — 원본 색감 그대로(보정 없이) 사용한다.
export const TIER_BG_IMAGE = {
  iron: "/tier-bg-iron.png",
  bronze: "/tier-bg-bronze.png",
  silver: "/tier-bg-silver.png",
  gold: "/tier-bg-gold.png",
  diamond: "/tier-bg-diamond.png",
  master: "/tier-bg-master.png",
  grandmaster: "/tier-bg-grandmaster.png",
};
// (v0.1.1) 디자이너가 구간(1~5)마다 로마 숫자가 함께 그려진 별도 이미지를 새로 올려줬다
// (iron-1.png ~ iron-5.png 등, 파일명이 티어 key와 그대로 맞아떨어짐) — 이제 "티어명 텍스트 + 로마
// 숫자"를 따로 적지 않고, 이 정확한 구간 이미지 한 장으로 티어와 구간을 동시에 나타낸다. 그랜드
// 마스터(구간 없음)나 division이 안 넘어온 경우는 기존 대표 이미지(TIER_IMAGE)로 대체한다.
export function tierPieceSrc(tierKey, division) {
  if (!tierKey || tierKey === "grandmaster" || division == null) return TIER_IMAGE[tierKey] || TIER_IMAGE.iron;
  return "/" + tierKey + "-" + division + ".png";
}
// (v0.1.1) 구간 이미지들은 실제 캔버스 크기가 티어마다 다르다(폰이 가장 작고 킹·퀸으로 갈수록
// 커짐) — 그런데 하단의 로마 숫자는 모든 이미지에서 정확히 같은 픽셀 높이(원본 기준 48px)로
// 캔버스 맨 아래에 박혀 있다. 예전처럼 이미지마다 "박스 높이에 꽉 차게" 각자 다른 배율로
// 늘려버리면(objectFit:contain), 이미지마다 실제로 적용되는 배율이 달라져 로마 숫자 크기·위치가
// 배지끼리 서로 안 맞았다 — 모든 티어에 정확히 같은 배율(원본 세로 길이 비례)을 적용해야 로마
// 숫자가 항상 같은 크기로, 같은 상대 위치(캔버스 맨 아래)에 온다. 여기 적어둔 높이는 각 티어
// 이미지 파일의 실제 픽셀 높이(1~5구간 공통, 그랜드마스터만 별도)다.
export const TIER_IMG_NATIVE_H = { iron: 251, bronze: 301, silver: 313, gold: 312, diamond: 346, master: 346, grandmaster: 360 };
// (v0.1.1) 로고 뒤 배경 — 특히 아이언처럼 어두운 톤의 기물이 어두운(브라운) UI 배경 위에서 잘 안
// 보이던 문제를 밝은 배경으로 감싸 해결한다.
// (v0.1.2) 앤틱 아이보리(순백에 가까운 톤)를 사이트 전역 브라스 골드 그러데이션으로 바꿨었는데,
// (v0.1.3) 다시 흰색으로 되돌리고, 원 대신 참고 도안(크레스트 문장)과 같은 비율의 십각형으로 바꾼다.
// 정십각형(가로세로 반지름이 같음)이 아니라 세로로 살짝 긴 비율 — 참고 이미지의 세로:가로 비를
// 근사해 rx(46)를 ry(50)보다 살짝 작게 잡는다(10각형은 위/아래 꼭짓점만 정확히 반지름 끝에 닿고
// 좌우는 cos18°≈0.951배만큼만 벌어지므로, rx=46 기준 실제 가로 폭은 세로의 약 0.87배가 된다).
export const TIER_DECAGON_PTS = (() => {
  const rx = 46, ry = 50;
  return Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + i * (Math.PI / 5);
    return (50 + rx * Math.cos(a)).toFixed(2) + "," + (50 + ry * Math.sin(a)).toFixed(2);
  }).join(" ");
})();
