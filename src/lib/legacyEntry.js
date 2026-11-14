// (v0.7.1 보안, BUG-130) 유산 항목(LegacyEntry) 검증 — 남의 공개 프로필(pub.legacies·legacyHistory)·채팅 공유로 들어오는 유산은 누구나 임의 JSON을
// 써 넣을 수 있다. sans에 문자열이 아닌 값이 섞이면 sanSrc/replaySans가 렌더 중에 throw해 그 프로필을 보는 사람의 화면이 깨졌다. 화면에 넘기기 전에
// 반드시 이 함수를 거친다(scripts/check-legacy-entry.mjs가 검사). 모양이 틀리거나 수순이 불법이면 null.
import { startBoard, sanSrc, applySan, stripSuffix, parseFenFull, plyIsWhite } from "./chessRules.js";

export const LEGACY_MAX_PLIES = 600;
// (v0.7.7, 사용자 요청 "새 게시물") 게시물 종류 — 유산 3종(best·only·brilliant) + 대국(game). 대국 게시물은 같은 묶음(pub.legacies)에 담겨
// 좋아요·리포스트·피드·프로필 소셜 섹션을 그대로 함께 쓴다. 대국은 moveIndex = 마지막 수, meta = { white, black, result }.
export const POST_KINDS = ["best", "only", "brilliant", "game"];
export const GAME_RESULTS = ["1-0", "0-1", "1/2-1/2", "*"];
const META_NAME_MAX = 40;
// 남이 써 넣은 문자열 — 제어 문자·꺾쇠를 지우고 길이를 자른다(화면은 React 텍스트로만 그린다).
const cleanName = (v) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, META_NAME_MAX) : "");
// (v0.7.7) FEN에서 시작하는 게시물 — fen 필드가 있으면 그 포지션부터 수순을 다시 둔다(없으면 표준 시작 위치). 잘못된 FEN이면 항목 전체를 버린다.
export function entryRoot(e) { return e && typeof e.fen === "string" && e.fen ? parseFenFull(e.fen) : null; }
const KIND_RE = /^[a-z]{1,16}$/;
export const POST_ID_RE = /^[a-z][a-z0-9]{0,23}$/;
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export function normalizeLegacyEntry(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return null;
  const { sans, moveIndex } = e;
  if (!Array.isArray(sans) || sans.length < 1 || sans.length > LEGACY_MAX_PLIES) return null;
  if (!sans.every((s) => typeof s === "string" && s.length >= 2 && s.length <= 10)) return null;
  if (!intIn(moveIndex, 0, sans.length - 1)) return null;
  let root = null;
  if (e.fen != null) {
    if (typeof e.fen !== "string" || e.fen.length > 100) return null;
    try { root = parseFenFull(e.fen); } catch { root = null; }
    if (!root) return null;
  }
  // 수순 전체가 실제로 둘 수 있는 수인지 — 재생 화면이 모든 수를 다시 두므로 끝까지 확인한다.
  try {
    let board = root ? root.board : startBoard();
    for (let i = 0; i < sans.length; i++) {
      const color = plyIsWhite(i, root ? root.turn : "w") ? "w" : "b";
      if (!sanSrc(board, stripSuffix(sans[i]), color)) return null;
      board = applySan(board, sans[i], color);
    }
  } catch { return null; }
  const maxPlay = sans.length - moveIndex;
  const kinds = Array.isArray(e.kinds) && e.kinds.length === sans.length && e.kinds.every((k) => typeof k === "string" && KIND_RE.test(k)) ? e.kinds.slice() : null;
  const kind = POST_KINDS.includes(e.kind) ? e.kind : null;   // (v0.7.4) 게시물 종류 태그 — 옛 슬롯 유산엔 없어 키(best/only/brilliant)로 알아낸다
  if (kind === "game" && moveIndex !== sans.length - 1) return null;   // 대국 게시물은 마지막 수까지가 한 몸
  const out = {
    sans: sans.slice(),
    moveIndex,
    playCount: intIn(e.playCount, 1, maxPlay) ? e.playCount : Math.min(5, maxPlay),
    beforeCount: intIn(e.beforeCount, 0, moveIndex) ? e.beforeCount : 0,
    kinds,
    side: e.side === "b" ? "b" : "w",
    savedAt: Number.isFinite(e.savedAt) ? e.savedAt : 0,
    kind,
  };
  if (root) out.fen = root.raw;
  if (kind === "game") {
    const m = e.meta && typeof e.meta === "object" && !Array.isArray(e.meta) ? e.meta : {};
    out.meta = { white: cleanName(m.white), black: cleanName(m.black), result: GAME_RESULTS.includes(m.result) ? m.result : "*" };
  }
  return out;
}

// { slotKey: entry } 묶음 — 잘못된 칸은 빈 칸(null)으로.
export function normalizeLegacies(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return null;
  const out = {};
  // (v0.7.4) 키는 게시물 아이디 — 옛 슬롯 키(best, only2 …)도 그대로 유효한 아이디다(좋아요·채팅 공유가 키로 묶여 있어 바꾸지 않는다).
  for (const k of Object.keys(map).slice(0, 400)) { if (POST_ID_RE.test(k)) out[k] = normalizeLegacyEntry(map[k]); }
  return out;
}
export function normalizeLegacyHistory(list) {
  if (!Array.isArray(list)) return null;
  // 검사한 필드만 새로 담는다(펼치기 금지 — 검사 안 한 값이 화면까지 따라오지 않게).
  const out = [];
  for (const h of list.slice(-200)) {
    if (!h || typeof h !== "object" || typeof h.slotKey !== "string" || !POST_ID_RE.test(h.slotKey)) continue;
    const entry = normalizeLegacyEntry(h.entry);
    if (entry) out.push({ slotKey: h.slotKey, entry, replacedAt: Number.isFinite(h.replacedAt) ? h.replacedAt : null });
  }
  return out;
}
