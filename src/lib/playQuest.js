// (v0.7.4, 사용자 요청) 플레이 퀘스트 — 일반 대국·미니게임에서 조건을 달성하면 클리어되는 퀘스트(일일 퀘스트 아래 블록). 순수 함수라 scripts/check-play-quest.mjs가 시험한다.
// (v0.7.6, 사용자 요청) 날마다 초기화하지 않는 한 번짜리 목표로 바꾸고, 클리어하면 퀘스트당 코인 보상(PLAY_QUEST_COINS)을 준다.
//  · 로그인: 진행 값은 서버가 직접 센다(supabase-setup.sql play_quest_status — 서버가 검증해 저장한 끝난 대국·미니게임 대전). 보상도 서버(economy_claim_play_quest)가
//    그 값을 다시 확인한 뒤에만 준다. 브라우저가 센 숫자로는 코인이 나오지 않는다(BUG-113 원칙).
//  · 로그인 전: 이 기기에서 대국·미니게임이 끝날 때마다 쌓는 값(applyPlayEvent)만 보여 준다(보상 없음).
import { t } from "./i18n.js";

export const GAME_MIN_PLIES = 20;     // 일반 대국은 20수(양쪽 합) 이상 두고 끝나야 인정 — 바로 기권해도 클리어되는 것을 막는다(서버 _play_quest_counts와 같은 값)
export const LONG_GAME_PLIES = 80;    // "40수 이상" = 양쪽 합 80수
export const PLAY_QUEST_COINS = 50;   // 퀘스트당 보상 코인 — 서버 economy_params().playQuests와 같아야 한다(check-economy-constants)

const kindsOf = (s) => (Array.isArray(s.kinds) ? s.kinds.length : Number.isInteger(s.kinds) ? s.kinds : 0);
// key: 진행 필드(서버 응답 키와 같음) · target: 클리어에 필요한 값 · count(state): 현재 값
export const PLAY_QUESTS = [
  { key: "game", target: 1, title: () => t("일반 대국 1판 끝까지 두기"), count: (s) => s.game },
  { key: "win", target: 1, title: () => t("일반 대국에서 승리하기"), count: (s) => s.win },
  { key: "long", target: 1, title: () => t("40수 이상 이어진 대국 마치기"), count: (s) => s.long },
  { key: "mg", target: 2, title: () => t("미니게임 2판 플레이하기"), count: (s) => s.mg },
  { key: "kinds", target: 2, title: () => t("서로 다른 미니게임 2종 플레이하기"), count: kindsOf },
];
export const emptyPlayQuest = () => ({ game: 0, win: 0, long: 0, mg: 0, kinds: [] });

const n = (v) => (Number.isInteger(v) && v >= 0 && v <= 999 ? v : 0);
// 이 기기의 진행값 검증 — 모양이 틀리면 0/빈 값(옛 버전의 date 필드는 무시하고 숫자는 그대로 이어 간다: 더는 날마다 초기화하지 않는다)
export function normalizePlayQuest(s) {
  if (!s || typeof s !== "object") return emptyPlayQuest();
  return { game: n(s.game), win: n(s.win), long: n(s.long), mg: n(s.mg), kinds: Array.isArray(s.kinds) ? [...new Set(s.kinds.filter((k) => typeof k === "string" && /^[a-z]{2,16}$/.test(k)))].slice(0, 12) : [] };
}
// 서버 play_quest_status 응답 검증 — { game, win, long, mg, kinds(숫자), claimed: [키] }. 모양이 틀리면 null(화면은 이 기기 값으로 대신한다).
export function normalizeServerPlayQuest(r) {
  if (!r || typeof r !== "object" || !Number.isInteger(r.game)) return null;
  const keys = new Set(PLAY_QUESTS.map((q) => q.key));
  return { game: n(r.game), win: n(r.win), long: n(r.long), mg: n(r.mg), kinds: n(r.kinds), claimed: Array.isArray(r.claimed) ? r.claimed.filter((k) => keys.has(k)) : [], server: true };
}
/* 이벤트: { type: "game", won: bool, plies: number } | { type: "minigame", game: "coord"|"knight"|"rush"|"attack" } */
export function applyPlayEvent(state, ev) {
  const s = normalizePlayQuest(state);
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
// 서버 값에서 클리어했지만 아직 보상을 받지 않은 퀘스트 키(App이 자동으로 수령을 요청한다)
export const unclaimedKeys = (s) => (s && s.server ? PLAY_QUESTS.filter((q) => questDone(q, s) && !s.claimed.includes(q.key)).map((q) => q.key) : []);

// 간단한 이벤트 통로 — play.jsx가 알리고 App이 구독한다(두 파일이 서로 import하지 않게).
const listeners = new Set();
export function emitPlayEvent(ev) { listeners.forEach((f) => { try { f(ev); } catch { /* 한 구독자의 오류가 다른 구독자를 막지 않게 */ } }); }
export function onPlayEvent(f) { listeners.add(f); return () => listeners.delete(f); }
