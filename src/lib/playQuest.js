// (v0.7.4, 사용자 요청) 플레이 퀘스트 — 일반 대국·미니게임에서 조건을 달성하면 클리어되는 하루 단위 퀘스트(일일 퀘스트 아래 블록). 순수 함수라 scripts/check-play-quest.mjs가 시험한다.
// 보상은 없다(클리어 표시만) — 코인·XP는 서버 원장이 주인이라(BUG-113) 서버 변경 없이 클라이언트가 지급할 수 없다.
// 진행은 play.jsx가 대국·미니게임이 끝날 때 emitPlayEvent로 알리고, App이 받아 applyPlayEvent로 쌓는다. 날짜(KST)가 바뀌면 처음부터.
import { t } from "./i18n.js";

export const GAME_MIN_PLIES = 20;     // 일반 대국은 20수(양쪽 합) 이상 두고 끝나야 인정 — 바로 기권해도 클리어되는 것을 막는다
export const LONG_GAME_PLIES = 80;    // "40수 이상" = 양쪽 합 80수
export const kstDay = (now = Date.now()) => new Date(now + 9 * 3600e3).toISOString().slice(0, 10);

// key: 진행 필드 · target: 클리어에 필요한 값 · count(state): 현재 값
export const PLAY_QUESTS = [
  { key: "game", target: 1, title: () => t("일반 대국 1판 끝까지 두기"), count: (s) => s.game },
  { key: "win", target: 1, title: () => t("일반 대국에서 승리하기"), count: (s) => s.win },
  { key: "long", target: 1, title: () => t("40수 이상 이어진 대국 마치기"), count: (s) => s.long },
  { key: "mg", target: 2, title: () => t("미니게임 2판 플레이하기"), count: (s) => s.mg },
  { key: "kinds", target: 2, title: () => t("서로 다른 미니게임 2종 플레이하기"), count: (s) => s.kinds.length },
];
export const emptyPlayQuest = (now) => ({ date: kstDay(now), game: 0, win: 0, long: 0, mg: 0, kinds: [] });

// 저장값 검증 — 모양이 틀리면 빈 상태(남이 쓸 수 없는 내 진행 정보지만 옛 버전·손상 대비)
export function normalizePlayQuest(s, now) {
  const e = emptyPlayQuest(now);
  if (!s || typeof s !== "object" || s.date !== e.date) return e;
  const n = (v) => (Number.isInteger(v) && v >= 0 && v <= 999 ? v : 0);
  return { date: e.date, game: n(s.game), win: n(s.win), long: n(s.long), mg: n(s.mg), kinds: Array.isArray(s.kinds) ? [...new Set(s.kinds.filter((k) => typeof k === "string" && /^[a-z]{2,16}$/.test(k)))].slice(0, 12) : [] };
}
/* 이벤트: { type: "game", won: bool, plies: number } | { type: "minigame", game: "coord"|"knight"|"rush"|"attack" } */
export function applyPlayEvent(state, ev, now) {
  const s = normalizePlayQuest(state, now);
  if (!ev || typeof ev !== "object") return s;
  if (ev.type === "game") {
    if (!Number.isFinite(ev.plies) || ev.plies < GAME_MIN_PLIES) return s;
    return { ...s, game: s.game + 1, win: s.win + (ev.won ? 1 : 0), long: s.long + (ev.plies >= LONG_GAME_PLIES ? 1 : 0) };
  }
  if (ev.type === "minigame") {
    const kinds = typeof ev.game === "string" && /^[a-z]{2,16}$/.test(ev.game) && !s.kinds.includes(ev.game) ? [...s.kinds, ev.game] : s.kinds;
    return { ...s, mg: s.mg + 1, kinds };
  }
  return s;
}
export const questDone = (q, s) => q.count(s) >= q.target;
export const clearedCount = (s) => PLAY_QUESTS.filter((q) => questDone(q, s)).length;

// 간단한 이벤트 통로 — play.jsx가 알리고 App이 구독한다(두 파일이 서로 import하지 않게).
const listeners = new Set();
export function emitPlayEvent(ev) { listeners.forEach((f) => { try { f(ev); } catch { /* 한 구독자의 오류가 다른 구독자를 막지 않게 */ } }); }
export function onPlayEvent(f) { listeners.add(f); return () => listeners.delete(f); }
