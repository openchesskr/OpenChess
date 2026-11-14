// (v0.7.7, 사용자 요청 "새 게시물 — 유산·대국도 퍼즐 마법사처럼 PGN·FEN 코드로") 게시물 작성기의 입력 해석 — 화면과 분리된 순수 함수(scripts/check-post-composer.mjs가 검사).
// 받아 주는 모양:
//  · PGN(헤더 있어도 없어도) — 표준 시작 위치부터의 수순. [FEN "…"] 헤더가 있으면 그 포지션부터.
//  · FEN 한 줄 — 수순 없이 포지션만(작성기가 보드에서 이어 둘 수를 받는다).
//  · FEN + 그 뒤의 수순(같은 줄이나 다음 줄) — 그 포지션부터 둔 수순.
// 반환: { ok: true, root: parseFenFull 결과 | null, sans: [...], meta: { white, black, result } } | { ok: false, reason: "empty" | "format" | "illegal", at? }
import { parseFenFull, looksLikeFen, startBoard, sanSrc, applySan, stripSuffix, plyIsWhite, decorateSan } from "./chessRules.js";
import { parsePgnSans, pgnHeaderTag } from "./pgn.js";
import { GAME_RESULTS, LEGACY_MAX_PLIES } from "./legacyEntry.js";

const FEN_RE = /^\s*([pnbrqkPNBRQK1-8]+(?:\/[pnbrqkPNBRQK1-8]+){7}(?:\s+[wb](?:\s+(?:-|[KQkq]{1,4})(?:\s+(?:-|[a-h][36])(?:\s+\d+(?:\s+\d+)?)?)?)?)?)/;

/** 체크(+)·메이트(#) 기호 보정 — 공용 decorateLine은 표준 시작 위치 전용이라(FEN에서는 엉뚱한 보드로 기호를 붙인다) 시작 포지션부터 직접 둔다. */
export function decorateFrom(root, sans) {
  let board = root ? root.board : startBoard();
  return sans.map((s, i) => {
    const color = plyIsWhite(i, root ? root.turn : "w") ? "w" : "b";
    const d = decorateSan(board, s, color);
    board = applySan(board, s, color);
    return d || s;
  });
}
/** 시작 포지션(root, null이면 표준)부터 sans를 한 수씩 둬 본다 — 처음으로 둘 수 없는 수의 번호, 모두 되면 -1. */
export function firstIllegalPly(root, sans) {
  let board = root ? root.board : startBoard();
  for (let i = 0; i < sans.length; i++) {
    const color = plyIsWhite(i, root ? root.turn : "w") ? "w" : "b";
    try {
      if (!sanSrc(board, stripSuffix(sans[i]), color)) return i;
      board = applySan(board, sans[i], color);
    } catch { return i; }
  }
  return -1;
}

export function parsePostInput(raw) {
  const text = String(raw || "").trim();
  if (!text) return { ok: false, reason: "empty" };
  let root = null, body = text;
  const tagFen = pgnHeaderTag(text, "FEN");
  if (tagFen) {
    root = parseFenFull(tagFen);
    if (!root) return { ok: false, reason: "format" };
  } else if (looksLikeFen(text)) {
    const m = text.match(FEN_RE);
    root = m ? parseFenFull(m[1]) : null;
    if (!root) return { ok: false, reason: "format" };
    body = text.slice(m[0].length);
  }
  const sans = body.trim() ? parsePgnSans(body) : [];
  if (!root && !sans.length) return { ok: false, reason: "format" };
  if (sans.length > LEGACY_MAX_PLIES) return { ok: false, reason: "format" };
  const bad = firstIllegalPly(root, sans);
  if (bad >= 0) return { ok: false, reason: "illegal", at: bad };
  const res = pgnHeaderTag(text, "Result");
  const tail = (body.match(/(1-0|0-1|1\/2-1\/2)\s*$/) || [])[1];
  const meta = {
    white: (pgnHeaderTag(text, "White") || "").slice(0, 40),
    black: (pgnHeaderTag(text, "Black") || "").slice(0, 40),
    result: GAME_RESULTS.includes(res) ? res : tail || "*",
  };
  return { ok: true, root, sans: decorateFrom(root, sans), meta };
}
