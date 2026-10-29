// (v0.7.1 보안, BUG-130) 유산 항목(LegacyEntry) 검증 — 남의 공개 프로필(pub.legacies·legacyHistory)·채팅 공유로 들어오는 유산은 누구나 임의 JSON을
// 써 넣을 수 있다. sans에 문자열이 아닌 값이 섞이면 sanSrc/replaySans가 렌더 중에 throw해 그 프로필을 보는 사람의 화면이 깨졌다. 화면에 넘기기 전에
// 반드시 이 함수를 거친다(scripts/check-legacy-entry.mjs가 검사). 모양이 틀리거나 수순이 불법이면 null.
import { startBoard, sanSrc, applySan, stripSuffix } from "./chessRules.js";

export const LEGACY_MAX_PLIES = 600;
const KIND_RE = /^[a-z]{1,16}$/;
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export function normalizeLegacyEntry(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return null;
  const { sans, moveIndex } = e;
  if (!Array.isArray(sans) || sans.length < 1 || sans.length > LEGACY_MAX_PLIES) return null;
  if (!sans.every((s) => typeof s === "string" && s.length >= 2 && s.length <= 10)) return null;
  if (!intIn(moveIndex, 0, sans.length - 1)) return null;
  // 수순 전체가 실제로 둘 수 있는 수인지 — 재생 화면이 모든 수를 다시 두므로 끝까지 확인한다.
  try {
    let board = startBoard();
    for (let i = 0; i < sans.length; i++) {
      const color = i % 2 === 0 ? "w" : "b";
      if (!sanSrc(board, stripSuffix(sans[i]), color)) return null;
      board = applySan(board, sans[i], color);
    }
  } catch { return null; }
  const maxPlay = sans.length - moveIndex;
  const kinds = Array.isArray(e.kinds) && e.kinds.length === sans.length && e.kinds.every((k) => typeof k === "string" && KIND_RE.test(k)) ? e.kinds.slice() : null;
  return {
    sans: sans.slice(),
    moveIndex,
    playCount: intIn(e.playCount, 1, maxPlay) ? e.playCount : Math.min(5, maxPlay),
    beforeCount: intIn(e.beforeCount, 0, moveIndex) ? e.beforeCount : 0,
    kinds,
    side: e.side === "b" ? "b" : "w",
    savedAt: Number.isFinite(e.savedAt) ? e.savedAt : 0,
  };
}

// { slotKey: entry } 묶음 — 잘못된 칸은 빈 칸(null)으로.
export function normalizeLegacies(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return null;
  const out = {};
  for (const k of Object.keys(map)) { if (/^[a-z]{1,16}2?$/.test(k)) out[k] = normalizeLegacyEntry(map[k]); }
  return out;
}
export function normalizeLegacyHistory(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(-200).map((h) => (h && typeof h === "object" ? { ...h, entry: normalizeLegacyEntry(h.entry) } : null)).filter((h) => h && h.entry && typeof h.slotKey === "string");
}
