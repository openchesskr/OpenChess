// (v0.8.0) 체스판이 "한 칸씩 깔리고 기물이 차례로 놓이는" 연출의 공용 부품.
//  리뷰 진입 연출(review.jsx ReviewBoardIntroAnim)에서 떼어 냈고, 데크메이트 블록 애니메이션(deckmateAnim.jsx)도 같은 것을 쓴다.
//   · shuffledSquareOrder() — 64칸이 나타나는 무작위 순서(order[r*8+c] = 몇 번째로 나타나는지)
//   · IntroSquare           — 한 칸(작게 시작해 살짝 튀어 오르며 나타남)
//   · introPieceOrder(board) — 기물이 놓이는 순서: 폰 줄 먼저, 그다음 기물. 백은 a→h, 흑은 h→a(서로 반대쪽에서)
import { motion } from "framer-motion";
import { boardSquareBg } from "../lib/theme.js";

export const BOARD_INTRO_SQUARE_STAGGER_MS = 4;
export const BOARD_INTRO_SQUARE_POP_MS = 150;
export const BOARD_INTRO_PIECE_STAGGER_MS = 42;
export const BOARD_INTRO_ROW_GAP_MS = 160;

export function shuffledSquareOrder() {
  const idx = Array.from({ length: 64 }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const rank = new Array(64);
  idx.forEach((sq, order) => { rank[sq] = order; });
  return rank;
}

/** 칸 하나 — 바깥 칸에는 배경을 깔지 않고 이 motion.div 하나만 보이게(처음부터 다 보이면 "하나씩 나타나는" 연출이 무력화된다). */
export function IntroSquare({ shown, sk, light, r, c, popMs = BOARD_INTRO_SQUARE_POP_MS }) {
  return <motion.div initial={false} animate={{ opacity: shown ? 1 : 0, scale: shown ? 1 : 0.4 }}
    transition={{ duration: popMs / 1000, ease: [0.34, 1.4, 0.64, 1] }}
    style={{ position: "absolute", inset: 0, ...boardSquareBg(sk, light, r, c) }} />;
}

/** board[r][c] = {t, c} | null → 칸 번호(r*8+c)마다 놓이는 순서. 백·흑은 같은 박자에 반대쪽에서 채워진다. */
export function introPieceOrder(board) {
  const order = new Map();
  for (const col of ["w", "b"]) {
    const list = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = board[r][c]; if (p && p.c === col) list.push([r, c, p.t === "P" ? 0 : 1]); }
    list.sort((a, b) => a[2] - b[2] || (col === "w" ? a[1] - b[1] || b[0] - a[0] : b[1] - a[1] || a[0] - b[0]));
    list.forEach(([r, c], i) => order.set(r * 8 + c, i));
  }
  return order;
}
