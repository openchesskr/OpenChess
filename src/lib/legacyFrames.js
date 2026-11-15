// (v0.7.4) 유산 재생기용 수순 → 기물 위치 계산 — 화면과 분리된 순수 함수(scripts/check-legacy-player.mjs가 검사).
import { startBoard, applySan, sanSrc, plyIsWhite } from "./chessRules.js";

/* frames[i] = i수를 둔 직후의 기물 목록 [{ id, t, col, r, c }](기물마다 고유 id라 화면이 같은 기물을 이어서 움직인다), moves[i] = i번째 수 { from, to, piece, capture, castle, promo } | null. */
// root: (v0.7.7) FEN에서 시작한 게시물이면 parseFenFull 결과 — 그 배치·차례부터 둔다.
export function buildFrames(sans, root = null) {
  const b0 = root ? root.board : startBoard(), first = []; let n = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (b0[r][c]) first.push({ id: "p" + n++, t: b0[r][c].t, col: b0[r][c].c, r, c });
  const frames = [first], moves = []; let board = b0;
  for (let i = 0; i < sans.length; i++) {
    const color = plyIsWhite(i, root ? root.turn : "w") ? "w" : "b", cur = frames[i].map((p) => ({ ...p })); let mv = null;
    try {
      const info = sanSrc(board, sans[i], color);
      if (info) {
        const at = (r, c) => cur.find((p) => p.r === r && p.c === c);
        if (info.castle) {
          const rank = info.from[0], k = at(rank, 4), rk = at(rank, info.castle === "k" ? 7 : 0);
          if (k) k.c = info.to[1]; if (rk) rk.c = info.castle === "k" ? 5 : 3;
          mv = { from: info.from, to: info.to, piece: "K", capture: false, castle: info.castle, promo: null };
        } else {
          const mover = at(info.from[0], info.from[1]);
          let cap = at(info.to[0], info.to[1]);
          if (!cap && info.piece === "P" && info.isCap) cap = at(color === "w" ? info.to[0] + 1 : info.to[0] - 1, info.to[1]);   // 앙파상
          if (mover) { if (cap) cur.splice(cur.indexOf(cap), 1); mover.r = info.to[0]; mover.c = info.to[1]; if (info.promo) mover.t = info.promo; }
          mv = { from: info.from, to: info.to, piece: info.piece, capture: !!cap, castle: null, promo: info.promo || null };
        }
      }
      board = applySan(board, sans[i], color);
    } catch { /* 불법 수는 위치를 그대로 둔다 */ }
    frames.push(cur); moves.push(mv);
  }
  return { frames, moves };
}

