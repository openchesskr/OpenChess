// (v0.8.0, 사용자 요청) 데크메이트 블록 애니메이션 — 계속 반복된다.
//  ① 덱 카드(B·x·f·7·+)가 한 장씩 등장 → 부채꼴로 펼쳐짐
//  ② 카드가 한 줄로 모여 기보 "Bxf7+"처럼 읽힘
//  ③ 카드는 사라지고 Bxf7+ 글자만 금색으로 빛나며 남은 채 화면이 어두워짐
//  ④ 체스판이 한 칸씩 깔림(리뷰 진입 연출과 같은 부품 — components/boardIntro.jsx) → 기물이 차례로 놓여 포지션 완성
//  ⑤ Bxf7+ 희생: c4 비숍이 f7 폰을 잡고 g8 킹에 체크 → 잠깐 머문 뒤 처음부터
//  화면 밖이면(OffscreenPause) 멈췄다가 다시 보이면 처음부터, 가벼운 모드면 한 번만 재생하고 마지막 장면에서 멈춘다.
//  카드는 아이콘 규칙대로 윤곽선 없이 면으로만(두께 면 위에 왼쪽 위 밝은 면 / 오른쪽 아래 어두운 면, 맨 앞 카드에만 금빛 보석) — check-facet-icons ZONES에 등록.
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { facetRamp, FacetDiamond, GOLD } from "./facetIcons.jsx";
import { PieceGlyph, SkinContext } from "./pieces.jsx";
import { BOARD_SKINS } from "../lib/theme.js";
import { fenToBoard } from "../lib/chessRules.js";
import { useOnScreen } from "./offscreenPause.jsx";
import { isLite } from "../lib/perfMode.js";
import { SITE_FONT } from "./engineLines.jsx";
import { shuffledSquareOrder, IntroSquare, introPieceOrder } from "./boardIntro.jsx";

export const DECKMATE_FEN = "r1b2rk1/pp1p1ppp/1qn2b2/8/2B1RB2/5N2/PP3PPP/R2Q2K1 w - - 0 1";
const FROM = [4, 2], TO = [1, 5], KING = [0, 6];   // c4 → f7, 흑 킹 g8
const LABELS = ["B", "x", "f", "7", "+"];
const FAN = [-30, -15, 0, 15, 30];

// 타임라인(ms) — 한 바퀴 약 10.4초
const DEAL_STEP = 190, FAN_AT = 1150, LINE_AT = 2350, GLOW_AT = 3450, BOARD_AT = 4750;
const SQ_STEP = 13, PIECE_STEP = 55;
const OUT_AFTER_MOVE = 2100, OUT_MS = 650;

const DECK_IVORY = facetRamp("#E9D8B4");
const pts = (x, y, w, h, c) => [[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c], [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c]];
const pathOf = (p) => "M" + p.map((q) => q[0].toFixed(2) + " " + q[1].toFixed(2)).join("L") + "Z";
function DeckCardFace({ label, front }) {
  const w = 22, h = 31, c = 2.6, R = DECK_IVORY, x = 0, y = 0;
  const face = pts(x, y, w, h, c);
  const upper = [face[7], face[0], face[1], face[2], [x + w, y + h * 0.42], [x, y + h * 0.78], face[6]];
  const lower = [[x, y + h * 0.78], [x + w, y + h * 0.42], face[3], face[4], face[5], face[6]];
  return (
    <svg viewBox="-1 -0.5 25 33" width="100%" height="100%" aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
      <path d={pathOf(pts(x + 1.1, y + 1.3, w, h, c))} fill={R.base} />
      <path d={pathOf(upper)} fill={R.hi} />
      <path d={pathOf(lower)} fill={R.l1} />
      <text x={3.4} y={10.5} fontSize="9.5" fontWeight="900" fontFamily={SITE_FONT} fill="#3A2516">{label}</text>
      <text x={w / 2} y={h * 0.72} textAnchor="middle" fontSize="15" fontWeight="900" fontFamily={SITE_FONT} fill="#8A6322">{label}</text>
      {front && <FacetDiamond cx={w - 4} cy={4.5} r={2.6} />}
    </svg>
  );
}

function useBoxPx(ref) {
  const [px, setPx] = useState(120);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => { const w = el.clientWidth; if (w) setPx((p) => (Math.abs(p - w) > 1 ? w : p)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return px;
}

export function DeckmateAnim() {
  const onScreen = useOnScreen();
  const skCtx = useContext(SkinContext);
  const sk = BOARD_SKINS[skCtx.boardSkin] || BOARD_SKINS.classic;
  const board = useMemo(() => fenToBoard(DECKMATE_FEN), []);
  const pieceOrder = useMemo(() => introPieceOrder(board), [board]);
  const maxPieceOrder = useMemo(() => Math.max(0, ...pieceOrder.values()), [pieceOrder]);
  const [cycle, setCycle] = useState(0);
  const squareOrder = useMemo(() => shuffledSquareOrder(), [cycle]);
  const [phase, setPhase] = useState("deal");   // deal → fan → line → glow → board → move → moved → out
  const [dealt, setDealt] = useState(0);
  const [squares, setSquares] = useState(0);
  const [pieces, setPieces] = useState(0);
  const boardRef = useRef(null);
  const boardPx = useBoxPx(boardRef);
  const cell = boardPx / 8;

  useEffect(() => {
    if (!onScreen) return undefined;
    const ids = [], at = (ms, fn) => ids.push(setTimeout(fn, ms));
    setPhase("deal"); setDealt(0); setSquares(0); setPieces(0);
    for (let i = 1; i <= 5; i++) at(250 + i * DEAL_STEP, () => setDealt(i));
    at(FAN_AT, () => setPhase("fan"));
    at(LINE_AT, () => setPhase("line"));
    at(GLOW_AT, () => setPhase("glow"));
    at(BOARD_AT, () => setPhase("board"));
    for (let i = 1; i <= 64; i++) at(BOARD_AT + 250 + i * SQ_STEP, () => setSquares(i));
    const piecesAt = BOARD_AT + 250 + 64 * SQ_STEP + 180;
    for (let i = 0; i <= maxPieceOrder; i++) at(piecesAt + i * PIECE_STEP, () => setPieces(i + 1));
    const moveAt = piecesAt + (maxPieceOrder + 1) * PIECE_STEP + 550;
    at(moveAt, () => setPhase("move"));
    at(moveAt + 620, () => setPhase("moved"));
    if (!isLite()) {
      at(moveAt + OUT_AFTER_MOVE, () => setPhase("out"));
      at(moveAt + OUT_AFTER_MOVE + OUT_MS, () => setCycle((c) => c + 1));
    }
    return () => ids.forEach(clearTimeout);
  }, [onScreen, cycle, maxPieceOrder]);

  const cardsOn = phase === "deal" || phase === "fan" || phase === "line";
  const dark = phase === "glow" || phase === "board" || phase === "move" || phase === "moved" || phase === "out";
  const boardOn = phase === "board" || phase === "move" || phase === "moved";
  const glowText = phase === "line" || phase === "glow" || phase === "board";
  const moving = phase === "move" || phase === "moved";
  const moved = phase === "moved" || phase === "out";

  return (
    <span style={{ position: "absolute", inset: 0, overflow: "hidden" }} aria-hidden="true">
      {/* 암전 막 */}
      <motion.span initial={false} animate={{ opacity: dark ? 1 : 0 }} transition={{ duration: dark ? 0.9 : 0.5 }}
        style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 120% at 50% 45%, #2A190B 0%, #150C06 72%)" }} />
      {/* ①② 덱 카드 */}
      {LABELS.map((label, i) => {
        const shown = cardsOn && dealt > i;
        const target = phase === "deal" ? { rotate: (i - 2) * 1.6, x: (i - 2) * 3 + "%", y: "0%", scale: 1 }
          : phase === "fan" ? { rotate: FAN[i], x: "0%", y: "0%", scale: 1 }
          : { rotate: 0, x: (i - 2) * 104 + "%", y: "78%", scale: 0.84 };
        return (
          <motion.span key={label}
            initial={{ opacity: 0, rotate: 0, x: "0%", y: "60%", scale: 0.7 }}
            animate={shown ? { opacity: 1, ...target } : { opacity: 0, y: phase === "deal" ? "60%" : target.y, x: target.x, rotate: target.rotate, scale: phase === "deal" ? 0.7 : target.scale }}
            transition={{ duration: phase === "line" ? 0.7 : 0.45, ease: [0.22, 1, 0.36, 1], opacity: { duration: shown ? 0.25 : 0.4, delay: !shown && phase === "glow" ? i * 0.04 : 0 } }}
            style={{ position: "absolute", left: "41%", top: "22%", width: "18%", aspectRatio: "22 / 31", transformOrigin: "50% 190%", zIndex: 2 + i, filter: "drop-shadow(0 3px 4px rgba(36,21,9,.35))" }}>
            <DeckCardFace label={label} front={i === LABELS.length - 1} />
          </motion.span>
        );
      })}
      {/* ③ 금빛 Bxf7+ */}
      <motion.span initial={false}
        animate={glowText ? { opacity: phase === "line" ? 0 : phase === "board" ? 0 : 1, scale: phase === "board" ? 0.6 : 1, y: phase === "board" ? "-30%" : "0%" } : { opacity: 0, scale: 0.9, y: "0%" }}
        transition={{ duration: phase === "board" ? 0.55 : 0.7, ease: [0.22, 1, 0.36, 1], delay: phase === "glow" ? 0.25 : 0 }}
        style={{ position: "absolute", inset: 0, zIndex: 8, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SITE_FONT, fontWeight: 900, fontSize: "clamp(22px, 9cqw, 64px)", letterSpacing: ".02em", color: GOLD.l1, textShadow: "0 0 14px rgba(232,196,106,.85), 0 0 34px rgba(232,196,106,.45)", pointerEvents: "none" }}>
        Bxf7+
      </motion.span>
      {/* ④⑤ 체스판 */}
      <motion.span initial={false} animate={{ opacity: boardOn ? 1 : 0, scale: boardOn ? 1 : 0.94 }} transition={{ duration: boardOn ? 0.25 : 0.5 }}
        style={{ position: "absolute", inset: 0, zIndex: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span ref={boardRef} style={{ position: "relative", height: "86%", aspectRatio: "1 / 1", maxWidth: "92%", borderRadius: 4, overflow: "hidden", boxShadow: boardOn ? "0 8px 22px -8px rgba(0,0,0,.8), 0 0 0 1px #000" : "none" }}>
          <span style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(8,1fr)", gridTemplateRows: "repeat(8,1fr)" }}>
            {Array.from({ length: 64 }, (_, sq) => {
              const r = sq >> 3, c = sq & 7, p = board[r][c];
              const shown = boardOn && squareOrder[sq] < squares;
              const isFrom = r === FROM[0] && c === FROM[1], isTo = r === TO[0] && c === TO[1], isKing = r === KING[0] && c === KING[1];
              const hidePiece = (isFrom && moving) || (isTo && moved);
              const showPiece = shown && p && !hidePiece && pieceOrder.get(sq) < pieces;
              return (
                <span key={sq} style={{ position: "relative", minWidth: 0, minHeight: 0 }}>
                  <IntroSquare shown={shown} sk={sk} light={(r + c) % 2 === 0} r={r} c={c} />
                  {moving && (isFrom || isTo) && <span style={{ position: "absolute", inset: 0, background: isTo ? "rgba(196,154,80,.5)" : "rgba(196,154,80,.3)" }} />}
                  {moved && isKing && <motion.span initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.75] }} transition={{ duration: 0.6 }}
                    style={{ position: "absolute", inset: 0, background: "radial-gradient(circle, rgba(220,60,40,.85) 0%, rgba(220,60,40,.35) 55%, rgba(220,60,40,0) 80%)" }} />}
                  {showPiece && (
                    <motion.span key={"p" + sq + cycle} initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.16, ease: [0.34, 1.56, 0.64, 1] }}
                      style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <PieceGlyph type={p.t} color={p.c} size={cell * 0.78} pieceSkin={skCtx.pieceSkin} />
                    </motion.span>
                  )}
                </span>
              );
            })}
          </span>
          {/* 움직이는 비숍 — c4에서 f7로 미끄러진 뒤 그 칸에 남는다 */}
          {moving && (
            <motion.span initial={{ left: FROM[1] * 12.5 + "%", top: FROM[0] * 12.5 + "%" }} animate={{ left: TO[1] * 12.5 + "%", top: TO[0] * 12.5 + "%" }}
              transition={{ duration: 0.55, ease: [0.45, 0, 0.2, 1] }}
              style={{ position: "absolute", width: "12.5%", height: "12.5%", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3 }}>
              <PieceGlyph type="B" color="w" size={cell * 0.78} pieceSkin={skCtx.pieceSkin} />
            </motion.span>
          )}
        </span>
      </motion.span>
      {/* ⑤ 수 표기 — 희생이 끝나면 판 위쪽에 작게 */}
      <motion.span initial={false} animate={{ opacity: moved && phase !== "out" ? 1 : 0, y: moved ? 0 : 6 }} transition={{ duration: 0.4 }}
        style={{ position: "absolute", right: "5%", bottom: "6%", zIndex: 9, padding: "2px 7px", borderRadius: 6, background: "rgba(20,12,6,.82)", border: "1px solid rgba(232,196,106,.5)", color: GOLD.l1, fontFamily: SITE_FONT, fontWeight: 900, fontSize: "clamp(10px, 2.6cqw, 16px)" }}>
        Bxf7+!
      </motion.span>
    </span>
  );
}
